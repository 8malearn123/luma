import { z } from 'zod';
import type { Tx } from '../db';
import { AppError, forbidden } from '../errors';
import { audit } from '../audit';
import { deliver, messagingStatus } from '../messaging';
import { isProduction } from '../env';
import type { TenantContext } from '../tenancy/context';

/**
 * Business messaging: channel preferences, message templates and the delivery log.
 *
 * No email/SMS/WhatsApp provider is connected. Everything here works against
 * that honest state:
 *  - templates are stored and validated now (only whitelisted {placeholders});
 *  - deliveries are recorded in notification_deliveries as `simulated`;
 *  - a test send renders the template with sample data, records a simulated
 *    delivery and, in development with LUMA_DEV_OTP=1, drops email/SMS into the
 *    dev outbox (/dev/outbox). Nothing leaves the server.
 * When a provider is approved, its adapter plugs into messaging.ts `deliver()`
 * and these pages keep working unchanged.
 * Verification-code templates are platform-owned (DB CHECK).
 */
export const TEMPLATE_KEYS = [
  'booking_confirmed', 'booking_reminder', 'booking_cancelled', 'booking_rescheduled',
  'order_confirmed', 'order_ready', 'order_out_for_delivery', 'order_delivered',
  'return_update', 'waitlist_offer', 'verification_code',
] as const;
export type TemplateKey = (typeof TEMPLATE_KEYS)[number];
export const CHANNELS = ['whatsapp', 'sms', 'email'] as const;

const COMMON = ['customer_name', 'business_name'];
export const TEMPLATE_VARS: Record<TemplateKey, string[]> = {
  booking_confirmed: [...COMMON, 'booking_number', 'date', 'time', 'services'],
  booking_reminder: [...COMMON, 'booking_number', 'date', 'time', 'services'],
  booking_cancelled: [...COMMON, 'booking_number', 'date', 'time'],
  booking_rescheduled: [...COMMON, 'booking_number', 'date', 'time'],
  order_confirmed: [...COMMON, 'order_number', 'total'],
  order_ready: [...COMMON, 'order_number'],
  order_out_for_delivery: [...COMMON, 'order_number', 'tracking'],
  order_delivered: [...COMMON, 'order_number'],
  return_update: [...COMMON, 'return_number', 'status'],
  waitlist_offer: [...COMMON, 'date', 'time'],
  verification_code: ['code'],
};

export const SAMPLE: Record<string, [string, string]> = {
  customer_name: ['سارة', 'Sara'],
  business_name: ['صالون نورة', 'Noura Salon'],
  booking_number: ['BKG-000123', 'BKG-000123'],
  date: ['2026-11-02', '2026-11-02'],
  time: ['16:30', '16:30'],
  services: ['قص وتصفيف', 'Cut & style'],
  order_number: ['ORD-000045', 'ORD-000045'],
  total: ['120.00 ر.س', 'SAR 120.00'],
  tracking: ['https://example.com/track/ABC123', 'https://example.com/track/ABC123'],
  return_number: ['RET-000007', 'RET-000007'],
  status: ['تمت الموافقة', 'approved'],
  code: ['123456', '123456'],
};

const PLACEHOLDER = /\{([a-z_]+)\}/g;

export function templateProblems(key: TemplateKey, text: string): string[] {
  const allowed = new Set(TEMPLATE_VARS[key]);
  const bad = new Set<string>();
  for (const m of text.matchAll(PLACEHOLDER)) if (!allowed.has(m[1])) bad.add(m[1]);
  return [...bad];
}

export function renderTemplate(text: string, vars: Record<string, string>): string {
  return text.replace(PLACEHOLDER, (all, k: string) => (k in vars ? vars[k] : all));
}

export interface TemplateRow {
  key: TemplateKey;
  channel: (typeof CHANNELS)[number];
  locale: 'ar' | 'en';
  subject: string | null;
  body: string;
  isActive: boolean;
  custom: boolean;
  version: number;
  updatedAt: Date | null;
}

/** Effective templates for a business: its own override, else the LUMA default. */
export async function listTemplates(tx: Tx, tenantId: string): Promise<TemplateRow[]> {
  const rows = await tx<(Omit<TemplateRow, 'custom'> & { tenantId: string | null })[]>`
    select tenant_id, key, channel, locale, subject, body, is_active, version, updated_at from message_templates
    where tenant_id = ${tenantId} or tenant_id is null`;
  const byKey = new Map<string, TemplateRow>();
  for (const r of rows.sort((a, b) => (a.tenantId ? 1 : 0) - (b.tenantId ? 1 : 0))) {
    byKey.set(`${r.key}|${r.channel}|${r.locale}`, { key: r.key, channel: r.channel, locale: r.locale, subject: r.subject, body: r.body, isActive: r.isActive, custom: !!r.tenantId, version: r.version, updatedAt: r.updatedAt });
  }
  return [...byKey.values()].sort((a, b) => TEMPLATE_KEYS.indexOf(a.key) - TEMPLATE_KEYS.indexOf(b.key) || a.channel.localeCompare(b.channel) || a.locale.localeCompare(b.locale));
}

export const templateInput = z.object({
  key: z.enum(TEMPLATE_KEYS),
  channel: z.enum(CHANNELS),
  locale: z.enum(['ar', 'en']),
  subject: z.string().trim().max(150).nullable().optional(),
  body: z.string().trim().min(1).max(2000),
  isActive: z.boolean().default(true),
});

export async function saveTemplate(tx: Tx, ctx: TenantContext, p: z.infer<typeof templateInput>) {
  if (!ctx.caps.has('tenant.settings.manage')) throw forbidden();
  if (p.key === 'verification_code') throw new AppError('forbidden', 'errors.template_platform_owned');
  const bad = [...templateProblems(p.key, p.body), ...templateProblems(p.key, p.subject ?? '')];
  if (bad.length) throw new AppError('validation', 'errors.template_unknown_vars', { field: 'body', vars: bad.join(', ') });
  if (p.channel === 'email' && !p.subject?.trim()) throw new AppError('validation', 'errors.subject_required', { field: 'subject' });
  if (p.channel === 'sms' && p.body.length > 480) throw new AppError('validation', 'errors.sms_too_long', { field: 'body' });
  await tx`insert into message_templates (tenant_id, key, channel, locale, subject, body, is_active, updated_by)
           values (${ctx.tenant.id}, ${p.key}, ${p.channel}, ${p.locale}, ${p.channel === 'email' ? p.subject ?? null : null}, ${p.body}, ${p.isActive}, ${ctx.user.userId})
           on conflict (coalesce(tenant_id, '00000000-0000-0000-0000-000000000000'::uuid), key, channel, locale)
           do update set subject = excluded.subject, body = excluded.body, is_active = excluded.is_active, version = message_templates.version + 1,
                         updated_by = excluded.updated_by, updated_at = now()`;
  await audit(tx, { actorUserId: ctx.user.userId, actorKind: ctx.actorKind, tenantId: ctx.tenant.id, action: 'message_template.saved', requestId: ctx.requestId, metadata: { key: p.key, channel: p.channel, locale: p.locale } });
}

export async function resetTemplate(tx: Tx, ctx: TenantContext, k: { key: TemplateKey; channel: string; locale: string }) {
  if (!ctx.caps.has('tenant.settings.manage')) throw forbidden();
  await tx`delete from message_templates where tenant_id = ${ctx.tenant.id} and key = ${k.key} and channel = ${k.channel} and locale = ${k.locale}`;
  await audit(tx, { actorUserId: ctx.user.userId, actorKind: ctx.actorKind, tenantId: ctx.tenant.id, action: 'message_template.reset', requestId: ctx.requestId, metadata: k });
}

// ── channel preferences ──
export interface MessagingSettings {
  senderName: string | null;
  replyToEmail: string | null;
  emailEnabled: boolean;
  smsEnabled: boolean;
  whatsappEnabled: boolean;
  reminderHours: number[];
  quietStart: string | null;
  quietEnd: string | null;
}
const DEFAULT_SETTINGS: MessagingSettings = { senderName: null, replyToEmail: null, emailEnabled: false, smsEnabled: false, whatsappEnabled: false, reminderHours: [24], quietStart: null, quietEnd: null };

export async function messagingSettings(tx: Tx): Promise<MessagingSettings> {
  const [s] = await tx<MessagingSettings[]>`select sender_name, reply_to_email, email_enabled, sms_enabled, whatsapp_enabled, reminder_hours,
                                                 to_char(quiet_start, 'HH24:MI') as quiet_start, to_char(quiet_end, 'HH24:MI') as quiet_end from messaging_settings`;
  return s ?? DEFAULT_SETTINGS;
}

const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'errors.time_invalid').nullable();
export const messagingSettingsInput = z.object({
  senderName: z.string().trim().max(40).nullable(),
  replyToEmail: z.union([z.literal('').transform(() => null), z.string().trim().email('errors.email_invalid')]).nullable(),
  emailEnabled: z.boolean(),
  smsEnabled: z.boolean(),
  whatsappEnabled: z.boolean(),
  reminderHours: z.array(z.number().int().min(1).max(168)).max(3),
  quietStart: hhmm,
  quietEnd: hhmm,
});

export async function updateMessagingSettings(tx: Tx, ctx: TenantContext, p: z.infer<typeof messagingSettingsInput>) {
  if (!ctx.caps.has('tenant.settings.manage')) throw forbidden();
  const hours = [...new Set(p.reminderHours)].sort((a, b) => b - a);
  await tx`insert into messaging_settings (tenant_id, sender_name, reply_to_email, email_enabled, sms_enabled, whatsapp_enabled, reminder_hours, quiet_start, quiet_end, updated_by)
           values (${ctx.tenant.id}, ${p.senderName || null}, ${p.replyToEmail}, ${p.emailEnabled}, ${p.smsEnabled}, ${p.whatsappEnabled}, ${hours},
                   ${p.quietStart}::time, ${p.quietEnd}::time, ${ctx.user.userId})
           on conflict (tenant_id) do update set sender_name = excluded.sender_name, reply_to_email = excluded.reply_to_email, email_enabled = excluded.email_enabled,
             sms_enabled = excluded.sms_enabled, whatsapp_enabled = excluded.whatsapp_enabled, reminder_hours = excluded.reminder_hours,
             quiet_start = excluded.quiet_start, quiet_end = excluded.quiet_end, updated_by = excluded.updated_by, updated_at = now()`;
  await audit(tx, { actorUserId: ctx.user.userId, actorKind: ctx.actorKind, tenantId: ctx.tenant.id, action: 'messaging_settings.updated', requestId: ctx.requestId, metadata: { email: p.emailEnabled, sms: p.smsEnabled, whatsapp: p.whatsappEnabled } });
}

/** Provider state per channel, as the platform has configured it (never a secret). */
export function providerStatus(): Record<(typeof CHANNELS)[number], 'connected' | 'dev_outbox' | 'disconnected'> {
  const s = messagingStatus();
  return { email: s.email, sms: s.sms, whatsapp: 'disconnected' };
}

// ── delivery log ──
export async function deliveryLog(tx: Tx, tenantId: string, q: { channel?: string; status?: string; offset?: number }) {
  // notification_deliveries has no RLS: always filter by the context tenant explicitly
  const rows = await tx`select id, channel, template, status, provider, recipient_ref, attempts, error, is_test, preview, created_at
    from notification_deliveries where tenant_id = ${tenantId}
      and (${q.channel ?? null}::text is null or channel = ${q.channel ?? null})
      and (${q.status ?? null}::text is null or status = ${q.status ?? null})
    order by created_at desc limit 51 offset ${q.offset ?? 0}`;
  const [counts] = await tx<{ simulated: number; sent: number; failed: number; total: number }[]>`select
      count(*) filter (where status = 'simulated')::int as simulated, count(*) filter (where status in ('sent','delivered'))::int as sent,
      count(*) filter (where status = 'failed')::int as failed, count(*)::int as total
    from notification_deliveries where tenant_id = ${tenantId} and created_at > now() - interval '30 days'`;
  return { items: rows.slice(0, 50), hasMore: rows.length > 50, last30: counts };
}

const mask = (v: string) => (v.includes('@') ? v.replace(/^(.).*(@.*)$/, '$1•••$2') : v.replace(/^(\+?\d{3}).*(\d{2})$/, '$1•••••$2'));

export const testSendInput = z.object({ key: z.enum(TEMPLATE_KEYS), channel: z.enum(CHANNELS), locale: z.enum(['ar', 'en']) });

/** Render with sample data and record a SIMULATED delivery to the signed-in staff member's own contact. */
export async function testSend(tx: Tx, ctx: TenantContext, p: z.infer<typeof testSendInput>) {
  if (!ctx.caps.has('tenant.settings.manage')) throw forbidden();
  const t = (await listTemplates(tx, ctx.tenant.id)).find((x) => x.key === p.key && x.channel === p.channel && x.locale === p.locale);
  if (!t) throw new AppError('validation', 'errors.template_missing');
  const li = p.locale === 'ar' ? 0 : 1;
  const vars = Object.fromEntries(Object.entries(SAMPLE).map(([k, v]) => [k, v[li]]));
  vars.business_name = ctx.tenant.name;
  const body = renderTemplate(t.body, vars);
  const subject = t.subject ? renderTemplate(t.subject, vars) : null;
  const [u] = await tx<{ email: string | null; phone: string | null }[]>`select email, phone from users where id = ${ctx.user.userId}`;
  const dest = p.channel === 'email' ? u?.email : u?.phone;
  const ps = providerStatus()[p.channel];
  let outbox = false;
  if (dest && ps === 'dev_outbox' && !isProduction() && p.channel !== 'whatsapp') {
    await deliver({ channel: p.channel, destination: dest, subject: subject ?? undefined, body: `[TEST] ${body}` });
    outbox = true;
  }
  const preview = (subject ? `${subject}\n\n` : '') + body;
  await tx`insert into notification_deliveries (tenant_id, channel, template, recipient_user_id, recipient_ref, status, dedupe_key, preview, is_test)
           values (${ctx.tenant.id}, ${p.channel}, ${p.key}, ${ctx.user.userId}, ${dest ? mask(dest) : null}, 'simulated', ${`test:${ctx.tenant.id}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`}, ${preview.slice(0, 2000)}, true)`;
  await audit(tx, { actorUserId: ctx.user.userId, actorKind: ctx.actorKind, tenantId: ctx.tenant.id, action: 'message_template.test_send', requestId: ctx.requestId, metadata: { key: p.key, channel: p.channel, providerStatus: ps, outbox } });
  return { status: 'simulated' as const, providerStatus: ps, outbox, destination: dest ? mask(dest) : null, preview };
}
