import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import PDFDocument from 'pdfkit';
import qrcode from 'qrcode-generator';
import type { Tx } from '../db';
import { withTenant, withUser } from '../db';
import { AppError, notFound } from '../errors';
import { audit } from '../audit';
import { nextNumber } from '../booking/service';
import type { TenantContext } from '../tenancy/context';

/**
 * Tax invoices, receipts and credit notes.
 *
 * Seller & buyer snapshots are taken at issue time (never re-derived from the
 * live catalog). Tax is documented configuration (finance_settings): when
 * prices include tax, the included tax is total × rate ÷ (1 + rate), rounded
 * half-up per document and allocated to lines (remainder on the last line).
 *
 * ZATCA-shaped, NOT ZATCA-connected:
 *  - simplified tax invoice layout (seller name, VAT number, address, date,
 *    lines, VAT breakdown, totals) and the Phase-1 TLV QR payload
 *    (1 seller · 2 VAT no. · 3 timestamp · 4 total incl. VAT · 5 VAT), Base64;
 *  - a gap-free invoice counter (ICV) and an internal SHA-256 hash chain for
 *    tamper evidence;
 *  - NO UBL XML, NO cryptographic stamp, NO clearance/reporting with the
 *    Fatoora platform (Phase 2). Every document says so and einvoicing_status
 *    stays `not_submitted`. Compliance has not been verified.
 *
 * Arabic renders correctly in the HTML document (browser shaping/bidi; print
 * or "save as PDF" from the browser). The legacy server PDF uses pdfkit, which
 * has no Arabic shaping, so it prints Latin labels only.
 */
export function includedTax(totalMinor: number, rateBps: number): number {
  if (rateBps <= 0) return 0;
  return Math.floor((totalMinor * rateBps + (10000 + rateBps) / 2) / (10000 + rateBps));
}

// ── TLV (ZATCA Phase-1 QR payload) ──
export interface TlvFields {
  sellerName: string;
  vatNumber: string;
  timestamp: string; // ISO 8601
  totalWithVat: string; // "115.00"
  vatTotal: string; // "15.00"
}

/** Truncate to at most `max` UTF-8 bytes without splitting a character. */
function utf8Clip(s: string, max: number): Buffer {
  let b = Buffer.from(s, 'utf8');
  if (b.length <= max) return b;
  let out = '';
  for (const ch of s) {
    if (Buffer.byteLength(out + ch, 'utf8') > max) break;
    out += ch;
  }
  b = Buffer.from(out, 'utf8');
  return b;
}

export function encodeTlv(f: TlvFields): string {
  const values = [f.sellerName, f.vatNumber, f.timestamp, f.totalWithVat, f.vatTotal];
  const parts = values.map((v, i) => {
    const val = utf8Clip(v, 255);
    return Buffer.concat([Buffer.from([i + 1, val.length]), val]);
  });
  return Buffer.concat(parts).toString('base64');
}

export function decodeTlv(b64: string): Record<number, string> {
  const buf = Buffer.from(b64, 'base64');
  const out: Record<number, string> = {};
  let i = 0;
  while (i + 2 <= buf.length) {
    const tag = buf[i];
    const len = buf[i + 1];
    out[tag] = buf.subarray(i + 2, i + 2 + len).toString('utf8');
    i += 2 + len;
  }
  return out;
}

/** QR as a standalone SVG (no external service). */
export function qrSvg(text: string): string {
  const qr = qrcode(0, 'M');
  qr.addData(text, 'Byte');
  qr.make();
  return qr.createSvgTag({ cellSize: 3, margin: 2, scalable: true });
}

const dec = (minor: number) => (minor / 100).toFixed(2);

interface FinanceRow {
  pricesIncludeTax: boolean;
  taxRateBps: number;
  taxLabel: string;
  taxRegistered: boolean;
  legalAddress: string | null;
  invoiceFooter: string | null;
  sellerVatNumber: string | null;
  crNumber: string | null;
  addressStreet: string | null;
  addressBuildingNo: string | null;
  addressDistrict: string | null;
  addressCity: string | null;
  addressPostalCode: string | null;
  addressAdditionalNo: string | null;
}

async function sellerSnapshot(tx: Tx, tenantId: string) {
  const [t] = await tx<{ name: string; legalName: string | null; taxNumber: string | null }[]>`select name, legal_name, tax_number from tenants where id = ${tenantId}`;
  const [fs] = await tx<FinanceRow[]>`select * from finance_settings`;
  const vat = fs?.sellerVatNumber ?? (t.taxNumber && /^3\d{13}3$/.test(t.taxNumber) ? t.taxNumber : null);
  const seller = {
    name: t.name,
    legalName: t.legalName,
    taxNumber: vat ?? t.taxNumber,
    vatNumber: vat,
    crNumber: fs?.crNumber ?? null,
    address: fs?.legalAddress ?? null,
    addressParts: fs
      ? { street: fs.addressStreet, buildingNo: fs.addressBuildingNo, district: fs.addressDistrict, city: fs.addressCity, postalCode: fs.addressPostalCode, additionalNo: fs.addressAdditionalNo }
      : null,
    footer: fs?.invoiceFooter ?? null,
  };
  const rate = fs?.taxRegistered ? fs.taxRateBps : 0;
  const taxRule = { pricesIncludeTax: fs?.pricesIncludeTax ?? true, rateBps: rate, label: fs?.taxLabel ?? 'VAT', registered: fs?.taxRegistered ?? false, rounding: 'half_up per document' };
  return { seller, taxRule };
}

/** Allocate a document tax over lines proportionally (largest remainder on the last line). */
function allocate(total: number, weights: number[]): number[] {
  const sum = weights.reduce((a, b) => a + b, 0);
  if (!sum || !total) return weights.map(() => 0);
  const out = weights.map((w) => Math.floor((total * w) / sum));
  out[out.length - 1] += total - out.reduce((a, b) => a + b, 0);
  return out;
}

async function chainAndStore(
  tx: Tx,
  ctx: TenantContext,
  doc: {
    kind: 'invoice' | 'credit_note';
    prefix: string;
    counter: string;
    bookingId?: string | null;
    orderId?: string | null;
    creditForId?: string | null;
    creditReason?: string | null;
    returnId?: string | null;
    seller: Awaited<ReturnType<typeof sellerSnapshot>>['seller'];
    buyer: Record<string, unknown>;
    taxRule: Awaited<ReturnType<typeof sellerSnapshot>>['taxRule'];
    subtotal: number;
    discount: number;
    tax: number;
    total: number;
    lines: { description: string; quantity: number; unitPriceMinor: number; lineTotalMinor: number; taxMinor: number }[];
  },
) {
  // one writer per tenant: gap-free ICV + hash chain
  await tx`select pg_advisory_xact_lock(hashtext(${`luma-icv:${ctx.tenant.id}`}))`;
  const [prev] = await tx<{ icv: number; contentHash: string | null }[]>`select icv, content_hash from invoices where icv is not null order by icv desc limit 1`;
  const icv = (prev?.icv ?? 0) + 1;
  const previousHash = prev?.contentHash ?? createHash('sha256').update('0').digest('hex');
  const number = await nextNumber(tx, ctx.tenant.id, doc.counter, doc.prefix);
  const issuedAt = new Date();
  issuedAt.setMilliseconds(0);
  const qr =
    doc.taxRule.registered && doc.seller.vatNumber
      ? encodeTlv({ sellerName: doc.seller.legalName || doc.seller.name, vatNumber: doc.seller.vatNumber, timestamp: issuedAt.toISOString().replace('.000Z', 'Z'), totalWithVat: dec(doc.total), vatTotal: dec(doc.tax) })
      : null;
  const canonical = JSON.stringify({ number, icv, kind: doc.kind, issuedAt: issuedAt.toISOString(), seller: doc.seller.vatNumber, total: doc.total, tax: doc.tax, lines: doc.lines.map((l) => [l.description, l.quantity, l.lineTotalMinor, l.taxMinor]), previousHash });
  const contentHash = createHash('sha256').update(canonical).digest('hex');
  const [inv] = await tx<{ id: string }[]>`
    insert into invoices (tenant_id, number, kind, booking_id, order_id, seller_snapshot, buyer_snapshot, subtotal_minor, discount_minor, tax_minor, total_minor,
                          tax_rule_snapshot, issued_by, issued_at, credit_for_id, credit_reason, return_id, icv, previous_hash, content_hash, qr_tlv)
    values (${ctx.tenant.id}, ${number}, ${doc.kind}, ${doc.bookingId ?? null}, ${doc.orderId ?? null}, ${tx.json(doc.seller as never)}, ${tx.json(doc.buyer as never)},
            ${doc.subtotal}, ${doc.discount}, ${doc.tax}, ${doc.total}, ${tx.json(doc.taxRule as never)}, ${ctx.user.userId}, ${issuedAt},
            ${doc.creditForId ?? null}, ${doc.creditReason ?? null}, ${doc.returnId ?? null}, ${icv}, ${previousHash}, ${contentHash}, ${qr}) returning id`;
  for (const l of doc.lines) {
    await tx`insert into invoice_items (tenant_id, invoice_id, description, quantity, unit_price_minor, line_total_minor, tax_minor)
             values (${ctx.tenant.id}, ${inv.id}, ${l.description}, ${l.quantity}, ${l.unitPriceMinor}, ${l.lineTotalMinor}, ${l.taxMinor})`;
  }
  await audit(tx, { actorUserId: ctx.user.userId, actorKind: ctx.actorKind, tenantId: ctx.tenant.id, action: doc.kind === 'invoice' ? 'invoice.issued' : 'credit_note.issued', targetType: 'invoice', targetId: inv.id, requestId: ctx.requestId, metadata: { number, icv } });
  return { id: inv.id, number };
}

export async function issueInvoice(tx: Tx, ctx: TenantContext, ref: { bookingId?: string; orderId?: string }) {
  if (!ref.bookingId === !ref.orderId) throw new AppError('validation', 'errors.validation');
  const existing = await tx<{ id: string; number: string }[]>`select id, number from invoices where status = 'issued' and kind = 'invoice'
     and booking_id is not distinct from ${ref.bookingId ?? null}::uuid and order_id is not distinct from ${ref.orderId ?? null}::uuid`;
  if (existing[0]) return existing[0];
  const { seller, taxRule } = await sellerSnapshot(tx, ctx.tenant.id);
  let lines: { description: string; quantity: number; unitPriceMinor: number; lineTotalMinor: number }[] = [];
  let buyer: Record<string, unknown>;
  let subtotal = 0;
  let discount = 0;
  if (ref.bookingId) {
    const [b] = await tx<{ id: string; number: string; status: string; subtotalMinor: number; discountMinor: number; totalMinor: number; tenantCustomerId: string }[]>`select * from bookings where id = ${ref.bookingId}`;
    if (!b) throw notFound('booking');
    if (['draft', 'held', 'expired'].includes(b.status)) throw new AppError('invalid_transition', 'errors.invalid_transition');
    const items = await tx<{ serviceName: string; variantName: string | null; priceMinor: number; addonsMinor: number }[]>`select service_name, variant_name, price_minor, addons_minor from booking_items where booking_id = ${b.id} and status = 'active' order by seq`;
    lines = items.map((i) => ({ description: [i.serviceName, i.variantName].filter(Boolean).join(' — '), quantity: 1, unitPriceMinor: i.priceMinor + i.addonsMinor, lineTotalMinor: i.priceMinor + i.addonsMinor }));
    subtotal = b.subtotalMinor;
    discount = b.discountMinor;
    const [c] = await tx<{ displayName: string }[]>`select display_name from tenant_customers where id = ${b.tenantCustomerId}`;
    buyer = { name: c?.displayName ?? '', reference: b.number };
  } else {
    const [o] = await tx<{ id: string; number: string; status: string; subtotalMinor: number; discountMinor: number; deliveryFeeMinor: number; tenantCustomerId: string; fulfillmentMethod: string; deliveryAddress: Record<string, string | null> | null }[]>`select * from orders where id = ${ref.orderId!}`;
    if (!o) throw notFound('order');
    if (o.status === 'pending_payment' || o.status === 'draft' || o.status === 'cancelled') throw new AppError('invalid_transition', 'errors.invalid_transition');
    const items = await tx<{ name: string; variantName: string | null; unitPriceMinor: number; quantity: number; lineTotalMinor: number }[]>`select name, variant_name, unit_price_minor, quantity, line_total_minor from order_items where order_id = ${o.id} order by id`;
    lines = items.map((i) => ({ description: [i.name, i.variantName].filter(Boolean).join(' — '), quantity: i.quantity, unitPriceMinor: i.unitPriceMinor, lineTotalMinor: i.lineTotalMinor }));
    if (o.deliveryFeeMinor > 0) lines.push({ description: 'التوصيل / Delivery', quantity: 1, unitPriceMinor: o.deliveryFeeMinor, lineTotalMinor: o.deliveryFeeMinor });
    subtotal = o.subtotalMinor + o.deliveryFeeMinor;
    discount = o.discountMinor;
    const [c] = await tx<{ displayName: string }[]>`select display_name from tenant_customers where id = ${o.tenantCustomerId}`;
    buyer = { name: c?.displayName ?? '', reference: o.number, ...(o.deliveryAddress ? { city: o.deliveryAddress.city } : {}) };
  }
  const base = subtotal - discount;
  const tax = taxRule.pricesIncludeTax === false ? Math.floor((base * taxRule.rateBps + 5000) / 10000) : includedTax(base, taxRule.rateBps);
  const grand = taxRule.pricesIncludeTax === false ? base + tax : base;
  const lineTax = allocate(tax, lines.map((l) => l.lineTotalMinor));
  return chainAndStore(tx, ctx, {
    kind: 'invoice', prefix: 'INV', counter: 'invoice', bookingId: ref.bookingId, orderId: ref.orderId, seller, buyer, taxRule,
    subtotal, discount, tax, total: grand, lines: lines.map((l, i) => ({ ...l, taxMinor: lineTax[i] })),
  });
}

/**
 * Credit note against an issued invoice (returns, refunds, corrections).
 * `amountMinor` is the amount credited to the customer, VAT included; the sum of
 * credit notes can never exceed the original invoice total.
 */
export async function issueCreditNote(tx: Tx, ctx: TenantContext, invoiceId: string, p: { amountMinor: number; reason: string; returnId?: string | null }) {
  const [inv] = await tx<{ id: string; kind: string; status: string; totalMinor: number; bookingId: string | null; orderId: string | null; buyerSnapshot: Record<string, unknown>; taxRuleSnapshot: { rateBps: number; registered: boolean; pricesIncludeTax: boolean; label: string }; number: string }[]>`
    select * from invoices where id = ${invoiceId} for update`;
  if (!inv || inv.kind !== 'invoice') throw notFound('invoice');
  if (inv.status !== 'issued') throw new AppError('invalid_transition', 'errors.invalid_transition');
  if (!p.reason.trim()) throw new AppError('validation', 'errors.reason_required', { field: 'reason' });
  const [{ credited }] = await tx<{ credited: number }[]>`select coalesce(sum(total_minor), 0)::bigint as credited from invoices where credit_for_id = ${invoiceId} and status = 'issued'`;
  const left = inv.totalMinor - Number(credited);
  if (p.amountMinor <= 0 || p.amountMinor > left) throw new AppError('validation', 'errors.credit_exceeds', { remainingMinor: left, field: 'amountMinor' });
  // the issuing business's CURRENT identity is used for the credit note header; the tax rule follows the original invoice
  const { seller } = await sellerSnapshot(tx, ctx.tenant.id);
  const rule = inv.taxRuleSnapshot;
  const tax = rule.registered ? includedTax(p.amountMinor, rule.rateBps) : 0;
  return chainAndStore(tx, ctx, {
    kind: 'credit_note', prefix: 'CN', counter: 'credit_note', bookingId: inv.bookingId, orderId: inv.orderId, creditForId: inv.id, creditReason: p.reason.slice(0, 300), returnId: p.returnId ?? null,
    seller, buyer: { ...inv.buyerSnapshot, originalInvoice: inv.number }, taxRule: { ...rule, pricesIncludeTax: true, rounding: 'half_up per document' },
    subtotal: p.amountMinor, discount: 0, tax, total: p.amountMinor,
    lines: [{ description: `${p.reason.slice(0, 200)} — ${inv.number}`, quantity: 1, unitPriceMinor: p.amountMinor, lineTotalMinor: p.amountMinor, taxMinor: tax }],
  });
}

export async function listInvoices(tx: Tx) {
  return tx`select id, number, kind, total_minor, tax_minor, status, issued_at, booking_id, order_id, buyer_snapshot, credit_for_id, icv, qr_tlv is not null as has_qr
            from invoices order by issued_at desc limit 300`;
}

export interface InvoiceDocument {
  invoice: {
    id: string;
    number: string;
    kind: 'invoice' | 'receipt' | 'credit_note';
    invoiceType: string;
    status: string;
    issuedAt: Date;
    icv: number | null;
    contentHash: string | null;
    previousHash: string | null;
    subtotalMinor: number;
    discountMinor: number;
    taxMinor: number;
    totalMinor: number;
    currency: string;
    sellerSnapshot: Awaited<ReturnType<typeof sellerSnapshot>>['seller'];
    buyerSnapshot: Record<string, string | null>;
    taxRuleSnapshot: { label: string; rateBps: number; registered: boolean; pricesIncludeTax: boolean };
    creditReason: string | null;
    einvoicingStatus: string;
    qrTlv: string | null;
  };
  items: { description: string; quantity: number; unitPriceMinor: number; lineTotalMinor: number; taxMinor: number }[];
  original: { id: string; number: string } | null;
  credits: { id: string; number: string; totalMinor: number; issuedAt: Date }[];
  qrSvg: string | null;
  tlv: Record<number, string> | null;
}

/** Everything the HTML invoice page renders (caller has already scoped the tenant). */
export async function invoiceDocument(tx: Tx, id: string): Promise<InvoiceDocument> {
  const [inv] = await tx<InvoiceDocument['invoice'][]>`select id, number, kind, invoice_type, status, issued_at, icv, content_hash, previous_hash, subtotal_minor, discount_minor,
      tax_minor, total_minor, currency, seller_snapshot, buyer_snapshot, tax_rule_snapshot, credit_reason, einvoicing_status, qr_tlv, credit_for_id from invoices where id = ${id}`;
  if (!inv) throw notFound('invoice');
  const items = (await tx<{ description: string; quantity: string; unitPriceMinor: number; lineTotalMinor: number; taxMinor: number }[]>`
    select description, quantity, unit_price_minor, line_total_minor, tax_minor from invoice_items where invoice_id = ${id} order by id`).map((i) => ({ ...i, quantity: Number(i.quantity) }));
  const cf = (inv as unknown as { creditForId: string | null }).creditForId;
  const [original] = cf ? await tx<{ id: string; number: string }[]>`select id, number from invoices where id = ${cf}` : [];
  const credits = await tx<{ id: string; number: string; totalMinor: number; issuedAt: Date }[]>`select id, number, total_minor, issued_at from invoices where credit_for_id = ${id} order by issued_at`;
  return { invoice: inv, items, original: original ?? null, credits, qrSvg: inv.qrTlv ? qrSvg(inv.qrTlv) : null, tlv: inv.qrTlv ? decodeTlv(inv.qrTlv) : null };
}

/** The customer's own invoice: located through her own orders/bookings, then read in that business's scope. */
export async function myInvoice(userId: string, invoiceId: string): Promise<InvoiceDocument & { tenant: { name: string; slug: string; timezone: string } }> {
  if (!/^[0-9a-f-]{36}$/i.test(invoiceId)) throw notFound('invoice');
  const tenants = await withUser(userId, (tx) => tx<{ tenantId: string }[]>`
    select distinct tenant_id from bookings where customer_user_id = ${userId}
    union select distinct tenant_id from orders where customer_user_id = ${userId}`);
  for (const { tenantId } of tenants) {
    const found = await withTenant({ tenantId, userId }, async (tx) => {
      const [own] = await tx`select i.id from invoices i left join bookings b on b.id = i.booking_id left join orders o on o.id = i.order_id
                             where i.id = ${invoiceId} and coalesce(b.customer_user_id, o.customer_user_id) = ${userId}`;
      if (!own) return null;
      const [t] = await tx<{ name: string; slug: string; timezone: string }[]>`select name, slug, timezone from tenants where id = ${tenantId}`;
      return { ...(await invoiceDocument(tx, invoiceId)), tenant: t };
    });
    if (found) return found;
  }
  throw notFound('invoice');
}

/** Invoices the customer can open for one of her orders/bookings (tenant scope). */
export async function invoicesFor(tx: Tx, ref: { orderId?: string; bookingId?: string }) {
  return tx<{ id: string; number: string; kind: string; totalMinor: number; issuedAt: Date }[]>`
    select id, number, kind, total_minor, issued_at from invoices
    where status = 'issued' and (order_id = ${ref.orderId ?? null}::uuid or booking_id = ${ref.bookingId ?? null}::uuid) order by issued_at`;
}

/** Invoice-chain integrity check (internal tamper evidence). */
export async function verifyChain(tx: Tx): Promise<{ ok: boolean; checked: number; brokenAt: string | null }> {
  const rows = await tx<{ number: string; icv: number; previousHash: string; contentHash: string }[]>`select number, icv, previous_hash, content_hash from invoices where icv is not null order by icv`;
  let prev = createHash('sha256').update('0').digest('hex');
  for (const [i, r] of rows.entries()) {
    if (r.icv !== i + 1 || r.previousHash !== prev) return { ok: false, checked: i, brokenAt: r.number };
    prev = r.contentHash;
  }
  return { ok: true, checked: rows.length, brokenAt: null };
}

// ── legacy server PDF (Latin labels; Arabic is not shaped by pdfkit) ──
const FONT_CANDIDATES = [process.env.INVOICE_FONT_PATH, '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'].filter(Boolean) as string[];
const money = (m: number) => `${(m / 100).toFixed(2)} SAR`;

export async function renderInvoicePdf(tx: Tx, id: string): Promise<{ number: string; pdf: Buffer }> {
  const d = await invoiceDocument(tx, id);
  const inv = d.invoice;
  const doc = new PDFDocument({ size: 'A4', margin: 48, info: { Title: inv.number } });
  const font = FONT_CANDIDATES.find((p) => existsSync(p));
  if (font) doc.font(font);
  const chunks: Buffer[] = [];
  doc.on('data', (c: Buffer) => chunks.push(c));
  const done = new Promise<void>((r) => doc.on('end', () => r()));
  const s = inv.sellerSnapshot;
  const title = inv.kind === 'credit_note' ? 'Credit note' : inv.taxRuleSnapshot.registered ? 'Simplified tax invoice' : 'Invoice';
  doc.fontSize(18).text(`${title}  ${inv.number}`);
  if (inv.status === 'void') doc.fillColor('red').text('VOID').fillColor('black');
  doc.moveDown(0.5).fontSize(10);
  doc.text(`Seller: ${s.legalName || s.name}`);
  if (s.vatNumber) doc.text(`VAT number: ${s.vatNumber}`);
  if (s.address) doc.text(`Address: ${s.address}`);
  doc.text(`Issued: ${inv.issuedAt.toISOString().slice(0, 16).replace('T', ' ')} UTC`);
  if (d.original) doc.text(`Credit for invoice: ${d.original.number}`);
  doc.text(`Customer ref: ${inv.buyerSnapshot.reference ?? ''}`);
  doc.moveDown();
  for (const it of d.items) doc.text(`× ${it.quantity}   ${money(it.lineTotalMinor)}   (VAT ${money(it.taxMinor)})`);
  doc.moveDown();
  doc.text(`Subtotal: ${money(inv.subtotalMinor)}`);
  if (inv.discountMinor) doc.text(`Discount: -${money(inv.discountMinor)}`);
  const tr = inv.taxRuleSnapshot;
  if (tr.registered) doc.text(`${tr.label} ${(tr.rateBps / 100).toFixed(2)}% ${tr.pricesIncludeTax ? '(included)' : ''}: ${money(inv.taxMinor)}`);
  doc.fontSize(12).text(`Total: ${money(inv.totalMinor)}`);
  doc.moveDown().fontSize(8).fillColor('#666')
    .text('Line descriptions and Arabic text are shown in the HTML document (print it from the browser).')
    .text('Not connected to ZATCA e-invoicing (Fatoora, Phase 2): no cryptographic stamp, not cleared or reported. Compliance not verified.');
  doc.end();
  await done;
  return { number: inv.number, pdf: Buffer.concat(chunks) };
}
