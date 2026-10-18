import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { env } from './env';

const scryptAsync = promisify(scrypt) as (pw: string, salt: Buffer, len: number, opts: object) => Promise<Buffer>;

export const randomToken = (bytes = 32) => randomBytes(bytes).toString('base64url');
export const sha256 = (s: string | Buffer) => createHash('sha256').update(s).digest();
export const sha256hex = (s: string | Buffer) => createHash('sha256').update(s).digest('hex');
export const hmac = (s: string) => createHmac('sha256', env().SESSION_SECRET).update(s).digest();
export const hmacHex = (s: string) => createHmac('sha256', env().SESSION_SECRET).update(s).digest('hex');

export function safeEqual(a: Buffer, b: Buffer): boolean {
  return a.length === b.length && timingSafeEqual(a, b);
}

// scrypt parameters: N=2^15, r=8, p=1 (≈32 MiB) — OWASP-acceptable
const SCRYPT = { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scryptAsync(password, salt, 32, SCRYPT);
  return `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${salt.toString('base64')}$${key.toString('base64')}`;
}

export async function verifyPassword(password: string, stored: string | null): Promise<boolean> {
  if (!stored) {
    // constant-ish time even when the user has no password
    await scryptAsync(password, randomBytes(16), 32, SCRYPT);
    return false;
  }
  const [alg, n, r, p, saltB64, keyB64] = stored.split('$');
  if (alg !== 'scrypt') return false;
  const key = await scryptAsync(password, Buffer.from(saltB64, 'base64'), 32, {
    N: Number(n),
    r: Number(r),
    p: Number(p),
    maxmem: SCRYPT.maxmem,
  });
  return safeEqual(key, Buffer.from(keyB64, 'base64'));
}

/** AES-256-GCM for provider secrets at rest. Output: v1.<iv>.<tag>.<ciphertext> */
export function encryptSecret(plain: string): string {
  const key = Buffer.from(env().LUMA_ENCRYPTION_KEY, 'base64');
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', key, iv);
  const ct = Buffer.concat([c.update(plain, 'utf8'), c.final()]);
  return ['v1', iv.toString('base64url'), c.getAuthTag().toString('base64url'), ct.toString('base64url')].join('.');
}

export function decryptSecret(blob: string): string {
  const [v, iv, tag, ct] = blob.split('.');
  if (v !== 'v1') throw new Error('unknown secret format');
  const key = Buffer.from(env().LUMA_ENCRYPTION_KEY, 'base64');
  const d = createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64url'));
  d.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([d.update(Buffer.from(ct, 'base64url')), d.final()]).toString('utf8');
}

/** Numeric one-time code, uniform (rejection sampling). */
export function numericCode(digits = 6): string {
  const max = 10 ** digits;
  const limit = Math.floor(0xffffffff / max) * max;
  for (;;) {
    const n = randomBytes(4).readUInt32BE(0);
    if (n < limit) return String(n % max).padStart(digits, '0');
  }
}

/** High-entropy human-typable code (gift cards): groups of base32 Crockford. */
export function humanCode(groups = 4, size = 4): string {
  const alphabet = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  const out: string[] = [];
  for (let g = 0; g < groups; g++) {
    let s = '';
    const bytes = randomBytes(size);
    for (let i = 0; i < size; i++) s += alphabet[bytes[i] & 31];
    out.push(s);
  }
  return out.join('-');
}

export function maskDestination(d: string): string {
  if (d.includes('@')) {
    const [u, dom] = d.split('@');
    return `${u.slice(0, 2)}***@${dom}`;
  }
  return `${d.slice(0, 4)}****${d.slice(-2)}`;
}
