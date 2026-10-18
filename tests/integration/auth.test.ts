import { afterAll, describe, expect, it } from 'vitest';
import { sql, closeDb } from '@/server/db';
import { login, register, resolveSession, verifyContact, requestRecovery, resetPassword, parseContact, revokeAllSessions } from '@/server/auth/service';
import { AppError } from '@/server/errors';
import { uniq } from '../fixtures';

afterAll(closeDb);

async function lastCode(dest: string): Promise<string> {
  const [m] = await sql()<{ body: string }[]>`select body from dev_outbox_messages where destination = ${dest} order by created_at desc limit 1`;
  return /(\d{6})/.exec(m.body)![1];
}

describe('auth', () => {
  it('registers, verifies by code (dev outbox, labeled), then logs in', async () => {
    const email = `reg-${uniq()}@test.luma`;
    const r = await register({ identifier: email, password: 'correct-horse-battery', displayName: 'Reem', locale: 'ar' }, '10.0.0.1');
    expect(r.deliveryMode).toBe('dev_outbox');
    // unverified login does not create a session
    const pre = await login(email, 'correct-horse-battery', '10.0.0.1', null);
    expect(pre.status).toBe('verification_required');
    const code = await lastCode(email);
    const s = await verifyContact(email, code, null, null);
    expect(await resolveSession(s.token)).toMatchObject({ email });
    const l = await login(email, 'correct-horse-battery', '10.0.0.1', null);
    expect(l.status).toBe('ok');
  });

  it('rejects wrong codes and burns the code after max attempts', async () => {
    const email = `burn-${uniq()}@test.luma`;
    await register({ identifier: email, password: 'correct-horse-battery', displayName: 'X', locale: 'en' }, '10.0.0.2');
    const code = await lastCode(email);
    for (let i = 0; i < 5; i++) await expect(verifyContact(email, '000000', null, null)).rejects.toThrow(AppError);
    await expect(verifyContact(email, code, null, null)).rejects.toThrow(AppError);
  });

  it('does not reveal whether an account exists on registration', async () => {
    const email = `dup-${uniq()}@test.luma`;
    await register({ identifier: email, password: 'correct-horse-battery', displayName: 'A', locale: 'ar' }, '10.0.0.3');
    await verifyContact(email, await lastCode(email), null, null);
    const again = await register({ identifier: email, password: 'another-password-x', displayName: 'B', locale: 'ar' }, '10.0.0.3');
    expect(again.destination).toBeTruthy();
    // the verified account's password is unchanged
    expect((await login(email, 'correct-horse-battery', '10.0.0.3', null)).status).toBe('ok');
  });

  it('locks the account after repeated failures', async () => {
    const email = `lock-${uniq()}@test.luma`;
    await register({ identifier: email, password: 'correct-horse-battery', displayName: 'L', locale: 'ar' }, '10.0.0.4');
    await verifyContact(email, await lastCode(email), null, null);
    for (let i = 0; i < 5; i++) await expect(login(email, 'wrong-password!', '10.0.0.4', null)).rejects.toMatchObject({ code: 'unauthenticated' });
    await expect(login(email, 'correct-horse-battery', '10.0.0.4', null)).rejects.toMatchObject({ code: 'rate_limited' });
  });

  it('recovery resets password and revokes all sessions', async () => {
    const email = `rec-${uniq()}@test.luma`;
    await register({ identifier: email, password: 'correct-horse-battery', displayName: 'R', locale: 'ar' }, '10.0.0.5');
    const s = await verifyContact(email, await lastCode(email), null, null);
    await requestRecovery(email, '10.0.0.5');
    await resetPassword(email, await lastCode(email), 'brand-new-password-1', '10.0.0.5');
    expect(await resolveSession(s.token)).toBeNull();
    expect((await login(email, 'brand-new-password-1', '10.0.0.5', null)).status).toBe('ok');
  });

  it('normalizes Saudi phone numbers', () => {
    expect(parseContact('0551234567')).toEqual({ kind: 'phone', phone: '+966551234567' });
    expect(() => parseContact('12')).toThrow();
  });

  it('revoked sessions stop resolving', async () => {
    const email = `rv-${uniq()}@test.luma`;
    await register({ identifier: email, password: 'correct-horse-battery', displayName: 'V', locale: 'ar' }, '10.0.0.6');
    const s = await verifyContact(email, await lastCode(email), null, null);
    const u = (await resolveSession(s.token))!;
    await revokeAllSessions(u.userId, 'test');
    expect(await resolveSession(s.token)).toBeNull();
  });
});
