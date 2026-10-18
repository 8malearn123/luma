import { z } from 'zod';
import { sql, type Db } from '../db';
import { env } from '../env';
import { AppError, invalid } from '../errors';
import { hashPassword, hmac, maskDestination, numericCode, randomToken, safeEqual, sha256, verifyPassword } from '../crypto';
import { deliver, type Channel } from '../messaging';
import { rateLimit } from '../rate-limit';
import { audit } from '../audit';

export const SESSION_COOKIE = 'luma_session';
const SESSION_ABSOLUTE_DAYS = 30;
const SESSION_IDLE_DAYS = 7;
const STEP_UP_MINUTES = 15;
const CODE_TTL_MIN = 10;
const MAX_FAILED_LOGINS = 5;
const LOCK_MINUTES = 15;

export type Contact = { kind: 'email'; email: string } | { kind: 'phone'; phone: string };

/** Accepts an email or a phone (Saudi local 05xxxxxxxx or E.164). */
export function parseContact(raw: string): Contact {
  const v = raw.trim();
  if (v.includes('@')) {
    const e = z.string().email().max(254).safeParse(v.toLowerCase());
    if (!e.success) throw invalid({ identifier: 'errors.email_invalid' });
    return { kind: 'email', email: e.data };
  }
  let digits = v.replace(/[\s-]/g, '');
  if (/^05\d{8}$/.test(digits)) digits = `+966${digits.slice(1)}`;
  else if (/^9665\d{8}$/.test(digits)) digits = `+${digits}`;
  if (!/^\+[1-9]\d{7,14}$/.test(digits)) throw invalid({ identifier: 'errors.phone_invalid' });
  return { kind: 'phone', phone: digits };
}

const contactDest = (c: Contact) => (c.kind === 'email' ? c.email : c.phone);
const contactChannel = (c: Contact): Channel => (c.kind === 'email' ? 'email' : 'sms');

const COMMON = new Set(['password123', '1234567890', 'qwertyuiop', '12345678910', 'luma123456', 'password1234']);
export const passwordSchema = z
  .string()
  .min(10, 'errors.password_short')
  .max(200)
  .refine((p) => !COMMON.has(p.toLowerCase()) && !/^(.)\1+$/.test(p), 'errors.password_weak');

interface UserRow {
  id: string;
  email: string | null;
  phone: string | null;
  emailVerifiedAt: Date | null;
  phoneVerifiedAt: Date | null;
  passwordHash: string | null;
  displayName: string;
  locale: 'ar' | 'en';
  status: string;
  failedLoginCount: number;
  lockedUntil: Date | null;
}

async function findUser(db: Db, c: Contact): Promise<UserRow | undefined> {
  const rows =
    c.kind === 'email'
      ? await db<UserRow[]>`select * from users where email = ${c.email}`
      : await db<UserRow[]>`select * from users where phone = ${c.phone}`;
  return rows[0];
}

const isVerified = (u: UserRow, c: Contact) => (c.kind === 'email' ? !!u.emailVerifiedAt : !!u.phoneVerifiedAt);

const codeHash = (dest: string, purpose: string, code: string) => hmac(`${dest}|${purpose}|${code}`);

// ─────────────────────────────────────────────────────────────
// One-time codes
// ─────────────────────────────────────────────────────────────
export type CodePurpose = 'verify_contact' | 'login' | 'recovery' | 'step_up';

export async function sendCode(c: Contact, purpose: CodePurpose, userId: string | null, locale: 'ar' | 'en' = 'ar') {
  const dest = contactDest(c);
  await rateLimit(`code:${dest}`, 5, 15 * 60);
  const code = numericCode(6);
  const body =
    locale === 'ar'
      ? `رمز التحقق في لوما: ${code} — صالح لمدة ${CODE_TTL_MIN} دقائق. لا تشاركيه مع أحد.`
      : `Your LUMA verification code is ${code}. It expires in ${CODE_TTL_MIN} minutes. Do not share it.`;
  const result = await deliver({ channel: contactChannel(c), destination: dest, subject: 'LUMA', body });
  await sql().begin(async (tx) => {
    // only the newest code for a destination/purpose stays valid
    await tx`update verification_codes set consumed_at = now()
             where destination = ${dest} and purpose = ${purpose} and consumed_at is null`;
    await tx`insert into verification_codes (user_id, channel, destination, purpose, code_hash, expires_at, delivery_mode)
             values (${userId}, ${contactChannel(c)}, ${dest}, ${purpose}, ${codeHash(dest, purpose, code)},
                     now() + make_interval(mins => ${CODE_TTL_MIN}), ${result.mode})`;
  });
  return { destination: maskDestination(dest), deliveryMode: result.mode };
}

/** Validates and consumes a code. Wrong codes count toward max_attempts. */
export async function consumeCode(c: Contact, purpose: CodePurpose, code: string): Promise<string | null> {
  const dest = contactDest(c);
  await rateLimit(`verify:${dest}`, 10, 15 * 60);
  return sql().begin(async (tx) => {
    const [row] = await tx<{ id: string; userId: string | null; codeHash: Buffer; attempts: number; maxAttempts: number }[]>`
      select id, user_id, code_hash, attempts, max_attempts from verification_codes
      where destination = ${dest} and purpose = ${purpose} and consumed_at is null and expires_at > now()
      order by created_at desc limit 1 for update`;
    if (!row || row.attempts >= row.maxAttempts) return null;
    if (!/^\d{6}$/.test(code) || !safeEqual(Buffer.from(row.codeHash), codeHash(dest, purpose, code))) {
      await tx`update verification_codes set attempts = attempts + 1 where id = ${row.id}`;
      return null;
    }
    await tx`update verification_codes set consumed_at = now() where id = ${row.id}`;
    return row.userId ?? '';
  }) as Promise<string | null>;
}

// ─────────────────────────────────────────────────────────────
// Registration / verification
// ─────────────────────────────────────────────────────────────
export const registerSchema = z.object({
  identifier: z.string().min(5).max(254),
  password: passwordSchema,
  displayName: z.string().trim().min(2).max(120),
  locale: z.enum(['ar', 'en']).default('ar'),
});

/**
 * Creates an unverified account and sends a verification code. Responds the
 * same way whether or not the contact is already registered (no enumeration).
 */
export async function register(input: z.infer<typeof registerSchema>, ip: string | null) {
  await rateLimit(`register:${ip ?? 'unknown'}`, 10, 60 * 60);
  const c = parseContact(input.identifier);
  const existing = await findUser(sql(), c);
  if (existing && isVerified(existing, c)) {
    // tell the real owner instead of the requester
    const r = await deliver({
      channel: contactChannel(c),
      destination: contactDest(c),
      subject: 'LUMA',
      body:
        input.locale === 'ar'
          ? 'حاول أحدهم إنشاء حساب بهذا العنوان في لوما. إن كنتِ أنتِ، سجّلي الدخول أو استعيدي كلمة المرور.'
          : 'Someone tried to register this contact on LUMA. If it was you, sign in or recover your password.',
    });
    return { destination: maskDestination(contactDest(c)), deliveryMode: r.mode };
  }
  const hash = await hashPassword(input.password);
  let userId: string;
  if (existing) {
    // unverified leftover: the newest registration attempt owns it
    await sql()`update users set password_hash = ${hash}, display_name = ${input.displayName}, locale = ${input.locale}
                where id = ${existing.id}`;
    userId = existing.id;
  } else {
    const [u] = await sql()<{ id: string }[]>`
      insert into users (email, phone, password_hash, display_name, locale)
      values (${c.kind === 'email' ? c.email : null}, ${c.kind === 'phone' ? c.phone : null}, ${hash},
              ${input.displayName}, ${input.locale})
      returning id`;
    userId = u.id;
  }
  return sendCode(c, 'verify_contact', userId, input.locale);
}

export async function verifyContact(identifier: string, code: string, ip: string | null, ua: string | null) {
  const c = parseContact(identifier);
  const uid = await consumeCode(c, 'verify_contact', code);
  if (uid === null) throw new AppError('validation', 'errors.code_invalid');
  const user = await findUser(sql(), c);
  if (!user) throw new AppError('validation', 'errors.code_invalid');
  if (c.kind === 'email') await sql()`update users set email_verified_at = coalesce(email_verified_at, now()) where id = ${user.id}`;
  else await sql()`update users set phone_verified_at = coalesce(phone_verified_at, now()) where id = ${user.id}`;
  await sql()`insert into customer_profiles (user_id, full_name, preferred_locale)
              values (${user.id}, ${user.displayName}, ${user.locale}) on conflict do nothing`;
  await audit(sql(), { actorUserId: user.id, actorKind: 'user', action: 'auth.contact_verified', ip });
  return createSession(user.id, ip, ua);
}

// ─────────────────────────────────────────────────────────────
// Login / sessions
// ─────────────────────────────────────────────────────────────
export type LoginResult =
  | { status: 'ok'; token: string; expiresAt: Date }
  | { status: 'verification_required'; destination: string; deliveryMode: string };

export async function login(identifier: string, password: string, ip: string | null, ua: string | null): Promise<LoginResult> {
  await rateLimit(`login-ip:${ip ?? 'unknown'}`, 30, 15 * 60);
  const c = parseContact(identifier);
  await rateLimit(`login-id:${contactDest(c)}`, 10, 15 * 60);
  const user = await findUser(sql(), c);
  const ok = await verifyPassword(password, user?.passwordHash ?? null);
  if (!user) throw new AppError('unauthenticated', 'errors.bad_credentials');
  if (user.status === 'disabled') throw new AppError('unauthenticated', 'errors.bad_credentials');
  if (user.lockedUntil && user.lockedUntil > new Date()) {
    throw new AppError('rate_limited', 'errors.account_locked', undefined, Math.ceil((+user.lockedUntil - Date.now()) / 1000));
  }
  if (!ok) {
    await sql()`update users set failed_login_count = failed_login_count + 1,
      locked_until = case when failed_login_count + 1 >= ${MAX_FAILED_LOGINS} then now() + make_interval(mins => ${LOCK_MINUTES}) else locked_until end
      where id = ${user.id}`;
    await audit(sql(), { actorUserId: user.id, actorKind: 'user', action: 'auth.login_failed', ip });
    throw new AppError('unauthenticated', 'errors.bad_credentials');
  }
  await sql()`update users set failed_login_count = 0, locked_until = null where id = ${user.id}`;
  if (!isVerified(user, c)) {
    const sent = await sendCode(c, 'verify_contact', user.id, user.locale);
    return { status: 'verification_required', ...sent };
  }
  const s = await createSession(user.id, ip, ua);
  await audit(sql(), { actorUserId: user.id, actorKind: 'user', action: 'auth.login', ip });
  const { token, expiresAt } = s;
  return { status: 'ok', token, expiresAt };
}

export async function createSession(userId: string, ip: string | null, ua: string | null) {
  const token = randomToken(32);
  const [s] = await sql()<{ expiresAt: Date }[]>`
    insert into sessions (user_id, token_hash, expires_at, idle_expires_at, ip, user_agent, step_up_at)
    values (${userId}, ${sha256(token)}, now() + make_interval(days => ${SESSION_ABSOLUTE_DAYS}),
            now() + make_interval(days => ${SESSION_IDLE_DAYS}), ${ip}, ${ua?.slice(0, 300) ?? null}, now())
    returning expires_at`;
  return { status: 'ok' as const, token, expiresAt: s.expiresAt };
}

export interface SessionUser {
  sessionId: string;
  userId: string;
  displayName: string;
  email: string | null;
  phone: string | null;
  locale: 'ar' | 'en';
  stepUpAt: Date | null;
  isDemo: boolean;
}

export async function resolveSession(token: string | undefined | null): Promise<SessionUser | null> {
  if (!token || token.length < 20 || token.length > 100) return null;
  const [row] = await sql()<(SessionUser & { lastSeenAt: Date })[]>`
    select s.id as session_id, s.user_id, s.step_up_at, s.last_seen_at,
           u.display_name, u.email, u.phone, u.locale, u.is_demo
    from sessions s join users u on u.id = s.user_id
    where s.token_hash = ${sha256(token)} and s.revoked_at is null
      and s.expires_at > now() and s.idle_expires_at > now() and u.status = 'active'`;
  if (!row) return null;
  if (Date.now() - +row.lastSeenAt > 5 * 60 * 1000) {
    await sql()`update sessions set last_seen_at = now(),
                idle_expires_at = least(expires_at, now() + make_interval(days => ${SESSION_IDLE_DAYS}))
                where id = ${row.sessionId}`;
  }
  return row;
}

export async function revokeSession(sessionId: string, reason = 'logout') {
  await sql()`update sessions set revoked_at = now(), revoked_reason = ${reason} where id = ${sessionId} and revoked_at is null`;
}

export async function revokeAllSessions(userId: string, reason: string, exceptSessionId?: string) {
  await sql()`update sessions set revoked_at = now(), revoked_reason = ${reason}
              where user_id = ${userId} and revoked_at is null
                and (${exceptSessionId ?? null}::uuid is null or id <> ${exceptSessionId ?? null}::uuid)`;
}

export async function listSessions(userId: string) {
  return sql()`select id, created_at, last_seen_at, expires_at, user_agent, host(ip) as ip
               from sessions where user_id = ${userId} and revoked_at is null and expires_at > now()
               order by last_seen_at desc`;
}

/** Re-authentication for sensitive operations (policy decisions, refunds, exports…). */
export async function stepUp(session: SessionUser, password: string) {
  await rateLimit(`stepup:${session.userId}`, 5, 15 * 60);
  const [u] = await sql()<{ passwordHash: string | null }[]>`select password_hash from users where id = ${session.userId}`;
  if (!(await verifyPassword(password, u?.passwordHash ?? null))) throw new AppError('unauthenticated', 'errors.bad_credentials');
  await sql()`update sessions set step_up_at = now() where id = ${session.sessionId}`;
}

export function requireRecentStepUp(session: SessionUser) {
  if (!session.stepUpAt || Date.now() - +session.stepUpAt > STEP_UP_MINUTES * 60 * 1000) {
    throw new AppError('forbidden', 'errors.step_up_required', { stepUp: true });
  }
}

// ─────────────────────────────────────────────────────────────
// Recovery
// ─────────────────────────────────────────────────────────────
export async function requestRecovery(identifier: string, ip: string | null) {
  await rateLimit(`recover-ip:${ip ?? 'unknown'}`, 10, 60 * 60);
  const c = parseContact(identifier);
  const user = await findUser(sql(), c);
  if (user && isVerified(user, c)) await sendCode(c, 'recovery', user.id, user.locale);
  // identical response either way
  return { destination: maskDestination(contactDest(c)) };
}

export async function resetPassword(identifier: string, code: string, newPassword: string, ip: string | null) {
  const pw = passwordSchema.safeParse(newPassword);
  if (!pw.success) throw invalid({ password: pw.error.issues[0]?.message });
  const c = parseContact(identifier);
  const uid = await consumeCode(c, 'recovery', code);
  if (!uid) throw new AppError('validation', 'errors.code_invalid');
  await sql()`update users set password_hash = ${await hashPassword(newPassword)}, password_changed_at = now(),
              failed_login_count = 0, locked_until = null where id = ${uid}`;
  await revokeAllSessions(uid, 'password_reset');
  await audit(sql(), { actorUserId: uid, actorKind: 'user', action: 'auth.password_reset', ip });
}

export const devOtpEnabled = () => env().NODE_ENV !== 'production' && env().LUMA_DEV_OTP;
