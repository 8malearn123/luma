import { lookup as dnsLookup, type LookupAddress } from 'node:dns';
import https from 'node:https';
import net from 'node:net';
import { AppError } from '../errors';

/**
 * SSRF-protected fetch for user-provided links and feeds:
 *  - https only, default port only, no credentials in the URL
 *  - the resolved IP is validated INSIDE the socket lookup (prevents DNS
 *    rebinding between check and connect); private, loopback, link-local,
 *    CGNAT, multicast, reserved, unique-local IPv6, IPv4-mapped IPv6 and cloud
 *    metadata addresses are blocked
 *  - redirects followed manually (max 3), each hop re-validated
 *  - response size ≤ 1 MB, total timeout 10 s, content-type allowlist
 */
export const MAX_BYTES = 1024 * 1024;
export const TIMEOUT_MS = 10_000;
const ALLOWED_TYPES = /^(text\/html|application\/xhtml\+xml|application\/(rss|atom)\+xml|application\/xml|text\/xml)/i;

function ipv4Blocked(ip: string): boolean {
  const p = ip.split('.').map(Number);
  if (p.length !== 4 || p.some((x) => !Number.isInteger(x) || x < 0 || x > 255)) return true;
  const [a, b] = p;
  return (
    a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) || (a === 192 && b === 0) || (a === 198 && (b === 18 || b === 19)) || a >= 224
  );
}

export function isBlockedIp(ip: string): boolean {
  const fam = net.isIP(ip);
  if (fam === 4) return ipv4Blocked(ip);
  if (fam === 6) {
    const x = ip.toLowerCase();
    if (x === '::' || x === '::1') return true;
    const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(x) ?? /^::(\d+\.\d+\.\d+\.\d+)$/.exec(x);
    if (mapped) return ipv4Blocked(mapped[1]);
    if (/^::ffff:[0-9a-f]{1,4}:[0-9a-f]{1,4}$/.test(x)) return true; // hex-form mapped v4
    if (/^f[cd]/.test(x)) return true; // unique local fc00::/7
    if (/^fe[89ab]/.test(x)) return true; // link-local fe80::/10
    if (/^ff/.test(x)) return true; // multicast
    if (x.startsWith('2001:db8') || x.startsWith('64:ff9b') || x.startsWith('100::')) return true;
    if (x === 'fd00:ec2::254') return true; // AWS IMDS v6
    return false;
  }
  return true;
}

export function validateUrl(raw: string): URL {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    throw new AppError('validation', 'errors.url_unsafe');
  }
  if (u.protocol !== 'https:' || u.username || u.password || (u.port && u.port !== '443')) throw new AppError('validation', 'errors.url_unsafe');
  const host = u.hostname.replace(/^\[|\]$/g, '');
  if (!host || host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.internal') || host === 'metadata.google.internal') throw new AppError('validation', 'errors.url_unsafe');
  if (net.isIP(host) && isBlockedIp(host)) throw new AppError('validation', 'errors.url_unsafe');
  return u;
}

type Lookup = typeof dnsLookup;

export interface SafeResponse {
  url: string;
  status: number;
  contentType: string;
  body: string;
}

/** `lookupImpl` exists for tests (simulate DNS answers); production uses system DNS. */
export async function safeFetch(raw: string, opts: { lookupImpl?: Lookup; maxRedirects?: number; requestImpl?: typeof https.request } = {}): Promise<SafeResponse> {
  const deadline = Date.now() + TIMEOUT_MS;
  let current = validateUrl(raw);
  const baseLookup = opts.lookupImpl ?? dnsLookup;
  const guardedLookup = ((hostname: string, options: object, cb: (err: NodeJS.ErrnoException | null, address: string | LookupAddress[], family?: number) => void) => {
    baseLookup(hostname, { ...(options as object), all: true }, (err, addrs) => {
      if (err) return cb(err, '', 4);
      const list = (Array.isArray(addrs) ? addrs : [{ address: addrs as unknown as string, family: 4 }]) as LookupAddress[];
      if (!list.length || list.some((a) => isBlockedIp(a.address))) {
        const e = new Error('blocked address') as NodeJS.ErrnoException;
        e.code = 'EBLOCKED';
        return cb(e, '', 4);
      }
      const wantsAll = (options as { all?: boolean }).all;
      if (wantsAll) cb(null, list);
      else cb(null, list[0].address, list[0].family);
    });
  }) as unknown as Lookup;
  const doRequest = opts.requestImpl ?? https.request;
  for (let hop = 0; hop <= (opts.maxRedirects ?? 3); hop++) {
    const res = await new Promise<{ status: number; headers: Record<string, string | string[] | undefined>; body: string }>((resolve, reject) => {
      const remaining = deadline - Date.now();
      if (remaining <= 0) return reject(new AppError('unavailable', 'errors.fetch_timeout'));
      const req = doRequest(current, { method: 'GET', lookup: guardedLookup, timeout: remaining, headers: { 'user-agent': 'LUMA-TrendRadar/1.0', accept: 'text/html,application/rss+xml,application/atom+xml,application/xml;q=0.9' } }, (r) => {
        const chunks: Buffer[] = [];
        let size = 0;
        r.on('data', (c: Buffer) => {
          size += c.length;
          if (size > MAX_BYTES) {
            req.destroy();
            reject(new AppError('validation', 'errors.fetch_too_large'));
          } else chunks.push(c);
        });
        r.on('end', () => resolve({ status: r.statusCode ?? 0, headers: r.headers, body: Buffer.concat(chunks).toString('utf8') }));
        r.on('error', reject);
      });
      req.on('timeout', () => {
        req.destroy();
        reject(new AppError('unavailable', 'errors.fetch_timeout'));
      });
      req.on('error', (e: NodeJS.ErrnoException) => reject(e.code === 'EBLOCKED' ? new AppError('validation', 'errors.url_unsafe') : e instanceof AppError ? e : new AppError('unavailable', 'errors.fetch_failed')));
      req.end();
    });
    if (res.status >= 300 && res.status < 400 && res.headers.location) {
      current = validateUrl(new URL(String(res.headers.location), current).toString());
      continue;
    }
    const ct = String(res.headers['content-type'] ?? '');
    if (res.status !== 200) throw new AppError('unavailable', 'errors.fetch_failed', { status: res.status });
    if (!ALLOWED_TYPES.test(ct)) throw new AppError('validation', 'errors.fetch_bad_type');
    return { url: current.toString(), status: res.status, contentType: ct, body: res.body };
  }
  throw new AppError('validation', 'errors.fetch_too_many_redirects');
}
