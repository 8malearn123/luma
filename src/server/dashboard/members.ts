import { z } from 'zod';
import { withSystem, withTenant, type Tx } from '../db';
import { AppError, forbidden, notFound } from '../errors';
import { audit } from '../audit';
import { randomToken, sha256 } from '../crypto';
import { canDelegate, isCapability, type TenantRole } from '../tenancy/capabilities';
import type { TenantContext } from '../tenancy/context';
import type { SessionUser } from '../auth/service';
import { deliver } from '../messaging';

/**
 * Team membership administration.
 * - Only team.manage may invite / change roles; NOBODY can grant 'owner' here
 *   (ownership transfer is a separate owner-only flow, not implemented in this build).
 * - Delegated capabilities are limited to those delegable to the target role
 *   (canDelegate); a manager can never grant what she could not hold herself.
 * - Invitations: high-entropy token, only its hash stored, expiring, single use.
 */
const INVITE_DAYS = 7;
const assignable = z.enum(['manager', 'receptionist', 'specialist', 'finance']);

export const inviteInput = z.object({
  email: z.string().email().max(254).optional(),
  phone: z.string().regex(/^\+?[0-9]{8,15}$/).optional(),
  role: assignable,
  staffProfileId: z.string().uuid().nullable().optional(),
});

export const memberPatch = z.object({
  role: assignable.optional(),
  grantedCaps: z.array(z.string()).max(40).optional(),
  revokedCaps: z.array(z.string()).max(40).optional(),
  status: z.enum(['active', 'suspended', 'removed']).optional(),
  staffProfileId: z.string().uuid().nullable().optional(),
  branchIds: z.array(z.string().uuid()).max(20).nullable().optional(),
});

export async function listMembers(tx: Tx) {
  const members = await tx`select m.id, m.role, m.status, m.granted_caps, m.revoked_caps, m.staff_profile_id, m.branch_ids, m.created_at,
                             u.display_name, u.email, u.phone, sp.display_name as staff_name
                           from tenant_memberships m join users u on u.id = m.user_id left join staff_profiles sp on sp.id = m.staff_profile_id
                           where m.status <> 'removed' order by m.created_at`;
  const invitations = await tx`select id, email, phone, role, expires_at, accepted_at, revoked_at, created_at from invitations
                               where accepted_at is null and revoked_at is null and expires_at > now() order by created_at desc`;
  return { members, invitations };
}

function assertCaps(ctx: TenantContext, role: TenantRole, caps: string[]) {
  for (const c of caps) {
    if (!isCapability(c) || !canDelegate(c, role)) throw new AppError('validation', 'errors.cap_not_delegable', { cap: c });
    // a non-owner cannot hand out capabilities she does not hold herself
    if (ctx.role !== 'owner' && !ctx.caps.has(c)) throw forbidden();
  }
}

export async function invite(tx: Tx, ctx: TenantContext, input: z.infer<typeof inviteInput>) {
  if (!ctx.caps.has('team.manage')) throw forbidden();
  if (!input.email && !input.phone) throw new AppError('validation', 'errors.contact_required');
  if (ctx.role !== 'owner' && input.role === 'manager') throw forbidden(); // managers can't create peers
  const token = randomToken(32);
  const [inv] = await tx<{ id: string; expiresAt: Date }[]>`
    insert into invitations (tenant_id, email, phone, role, staff_profile_id, token_hash, expires_at, invited_by)
    values (${ctx.tenant.id}, ${input.email ?? null}, ${input.phone ?? null}, ${input.role}, ${input.staffProfileId ?? null}, ${sha256(token)},
            now() + make_interval(days => ${INVITE_DAYS}), ${ctx.user.userId}) returning id, expires_at`;
  await audit(tx, { actorUserId: ctx.user.userId, actorKind: ctx.actorKind, tenantId: ctx.tenant.id, action: 'member.invited', targetType: 'invitation', targetId: inv.id, requestId: ctx.requestId, metadata: { role: input.role } });
  const link = `/invite/${token}`;
  let delivery: string = 'not_sent';
  try {
    const r = await deliver({ channel: input.email ? 'email' : 'sms', destination: (input.email ?? input.phone)!, subject: 'LUMA', body: `دعوة للانضمام إلى ${ctx.tenant.name} على لوما: ${link}` });
    delivery = r.mode;
  } catch {
    delivery = 'provider_unavailable';
  }
  // the link is returned once so the inviter can share it manually when no provider is connected
  return { id: inv.id, expiresAt: inv.expiresAt, link, delivery };
}

export async function revokeInvitation(tx: Tx, ctx: TenantContext, id: string) {
  if (!ctx.caps.has('team.manage')) throw forbidden();
  const r = await tx`update invitations set revoked_at = now() where id = ${id} and accepted_at is null and revoked_at is null returning id`;
  if (!r.length) throw notFound('invitation');
  await audit(tx, { actorUserId: ctx.user.userId, actorKind: ctx.actorKind, tenantId: ctx.tenant.id, action: 'member.invitation_revoked', targetType: 'invitation', targetId: id, requestId: ctx.requestId });
}

export async function updateMember(tx: Tx, ctx: TenantContext, membershipId: string, p: z.infer<typeof memberPatch>) {
  if (!ctx.caps.has('team.manage')) throw forbidden();
  const [m] = await tx<{ id: string; userId: string; role: TenantRole; grantedCaps: string[] }[]>`select id, user_id, role, granted_caps from tenant_memberships where id = ${membershipId} for update`;
  if (!m) throw notFound('member');
  if (m.role === 'owner') throw forbidden(); // the owner membership is not editable here
  if (m.userId === ctx.user.userId) throw forbidden(); // no self-escalation
  if (ctx.role !== 'owner' && (m.role === 'manager' || p.role === 'manager')) throw forbidden();
  const role = (p.role ?? m.role) as TenantRole;
  const granted = p.grantedCaps ?? (p.role ? m.grantedCaps.filter((c) => canDelegate(c, role)) : m.grantedCaps);
  assertCaps(ctx, role, p.grantedCaps ?? []);
  const revoked = (p.revokedCaps ?? []).filter(isCapability);
  await tx`update tenant_memberships set role = ${role}, granted_caps = ${granted}, revoked_caps = coalesce(${p.revokedCaps ? revoked : null}::text[], revoked_caps),
           status = coalesce(${p.status ?? null}, status),
           staff_profile_id = case when ${p.staffProfileId !== undefined} then ${p.staffProfileId ?? null}::uuid else staff_profile_id end,
           branch_ids = case when ${p.branchIds !== undefined} then ${p.branchIds ?? null}::uuid[] else branch_ids end
           where id = ${membershipId}`;
  if (p.status === 'removed' || p.status === 'suspended') {
    // their active sessions keep working for other businesses; access here is re-checked per request
  }
  await audit(tx, { actorUserId: ctx.user.userId, actorKind: ctx.actorKind, tenantId: ctx.tenant.id, action: 'member.updated', targetType: 'membership', targetId: membershipId, requestId: ctx.requestId, metadata: { role, granted, status: p.status } });
}

/** Accept an invitation as the signed-in user. Trusted transaction; role comes from the invitation, not the browser. */
export async function acceptInvitation(user: SessionUser, token: string) {
  if (!/^[A-Za-z0-9_-]{30,80}$/.test(token)) throw notFound('invitation');
  // the invitation token is the credential; the lookup by its hash precedes any tenant scope
  const [inv] = await withSystem('invitation lookup by token hash', (s) => s<{ id: string; tenantId: string; role: TenantRole; staffProfileId: string | null; email: string | null; phone: string | null; expiresAt: Date; acceptedAt: Date | null; revokedAt: Date | null }[]>`
    select id, tenant_id, role, staff_profile_id, email, phone, expires_at, accepted_at, revoked_at from invitations where token_hash = ${sha256(token)}`);
  if (!inv || inv.revokedAt || inv.acceptedAt) throw notFound('invitation');
  if (inv.expiresAt <= new Date()) throw new AppError('invalid_transition', 'errors.invitation_expired');
  const matches = (inv.email && user.email && inv.email.toLowerCase() === user.email.toLowerCase()) || (inv.phone && user.phone && inv.phone.replace(/^0/, '+966') === user.phone);
  if (!matches) throw new AppError('forbidden', 'errors.invitation_other_account');
  return withTenant({ tenantId: inv.tenantId, userId: user.userId }, async (tx) => {
    const [locked] = await tx<{ acceptedAt: Date | null }[]>`select accepted_at from invitations where id = ${inv.id} for update`;
    if (locked.acceptedAt) throw notFound('invitation');
    await tx`insert into tenant_memberships (tenant_id, user_id, role, staff_profile_id, invited_by)
             values (${inv.tenantId}, ${user.userId}, ${inv.role}, ${inv.staffProfileId}, (select invited_by from invitations where id = ${inv.id}))
             on conflict (tenant_id, user_id) do update set role = case when tenant_memberships.role = 'owner' then 'owner' else excluded.role end,
               status = 'active', staff_profile_id = coalesce(excluded.staff_profile_id, tenant_memberships.staff_profile_id)`;
    if (inv.staffProfileId) await tx`update staff_profiles set user_id = ${user.userId} where id = ${inv.staffProfileId} and user_id is null`;
    await tx`update invitations set accepted_at = now(), accepted_by = ${user.userId} where id = ${inv.id}`;
    await audit(tx, { actorUserId: user.userId, actorKind: 'user', tenantId: inv.tenantId, action: 'member.invitation_accepted', targetType: 'invitation', targetId: inv.id, metadata: { role: inv.role } });
    const [t] = await tx<{ slug: string }[]>`select slug from tenants where id = ${inv.tenantId}`;
    return { slug: t.slug, role: inv.role };
  });
}

export async function invitationPreview(token: string) {
  if (!/^[A-Za-z0-9_-]{30,80}$/.test(token)) return null;
  const [r] = await withSystem('invitation preview by token hash', (s) => s<{ tenantName: string; role: string; expiresAt: Date; valid: boolean }[]>`
    select t.name as tenant_name, i.role, i.expires_at, (i.accepted_at is null and i.revoked_at is null and i.expires_at > now()) as valid
    from invitations i join tenants t on t.id = i.tenant_id where i.token_hash = ${sha256(token)}`);
  return r ?? null;
}
