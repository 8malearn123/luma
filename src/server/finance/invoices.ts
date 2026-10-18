import { existsSync } from 'node:fs';
import PDFDocument from 'pdfkit';
import type { Tx } from '../db';
import { AppError, notFound } from '../errors';
import { audit } from '../audit';
import { nextNumber } from '../booking/service';
import type { TenantContext } from '../tenancy/context';

/**
 * Invoices / receipts with seller & buyer snapshots taken at issue time (never
 * re-derived from the live catalog). Tax is a documented configuration
 * (finance_settings): when prices include tax, the included tax is
 * total × rate ÷ (1 + rate), rounded half-up per document. Tax is shown only
 * when the business marked itself tax-registered.
 *
 * NOT ZATCA e-invoicing: no clearance/reporting integration, no cryptographic
 * stamp. The PDF says so. PDF Arabic shaping/bidi is not verified (pdfkit has
 * no bidi algorithm); labels are bilingual Latin + Arabic glyph fallback.
 */
export function includedTax(totalMinor: number, rateBps: number): number {
  if (rateBps <= 0) return 0;
  return Math.floor((totalMinor * rateBps + (10000 + rateBps) / 2) / (10000 + rateBps));
}

export async function issueInvoice(tx: Tx, ctx: TenantContext, ref: { bookingId?: string; orderId?: string }) {
  if (!ref.bookingId === !ref.orderId) throw new AppError('validation', 'errors.validation');
  const existing = await tx<{ id: string; number: string }[]>`select id, number from invoices where status = 'issued' and kind = 'invoice'
     and booking_id is not distinct from ${ref.bookingId ?? null}::uuid and order_id is not distinct from ${ref.orderId ?? null}::uuid`;
  if (existing[0]) return existing[0];
  const [t] = await tx<{ name: string; legalName: string | null; taxNumber: string | null }[]>`select name, legal_name, tax_number from tenants where id = ${ctx.tenant.id}`;
  const [fs] = await tx<{ pricesIncludeTax: boolean; taxRateBps: number; taxLabel: string; taxRegistered: boolean; legalAddress: string | null; invoiceFooter: string | null }[]>`select * from finance_settings`;
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
    const [c] = await tx<{ displayName: string; phone: string | null }[]>`select display_name, phone from tenant_customers where id = ${b.tenantCustomerId}`;
    buyer = { name: c?.displayName ?? '', reference: b.number };
  } else {
    const [o] = await tx<{ id: string; number: string; status: string; subtotalMinor: number; discountMinor: number; tenantCustomerId: string }[]>`select * from orders where id = ${ref.orderId!}`;
    if (!o) throw notFound('order');
    if (o.status === 'pending_payment' || o.status === 'draft') throw new AppError('invalid_transition', 'errors.invalid_transition');
    const items = await tx<{ name: string; variantName: string | null; unitPriceMinor: number; quantity: number; lineTotalMinor: number }[]>`select name, variant_name, unit_price_minor, quantity, line_total_minor from order_items where order_id = ${o.id}`;
    lines = items.map((i) => ({ description: [i.name, i.variantName].filter(Boolean).join(' — '), quantity: i.quantity, unitPriceMinor: i.unitPriceMinor, lineTotalMinor: i.lineTotalMinor }));
    subtotal = o.subtotalMinor;
    discount = o.discountMinor;
    const [c] = await tx<{ displayName: string }[]>`select display_name from tenant_customers where id = ${o.tenantCustomerId}`;
    buyer = { name: c?.displayName ?? '', reference: o.number };
  }
  const total = subtotal - discount;
  const rate = fs?.taxRegistered ? fs.taxRateBps : 0;
  const tax = fs?.pricesIncludeTax === false ? Math.floor((total * rate + 5000) / 10000) : includedTax(total, rate);
  const grand = fs?.pricesIncludeTax === false ? total + tax : total;
  const number = await nextNumber(tx, ctx.tenant.id, 'invoice', 'INV');
  const seller = { name: t.name, legalName: t.legalName, taxNumber: t.taxNumber, address: fs?.legalAddress ?? null, footer: fs?.invoiceFooter ?? null };
  const taxRule = { pricesIncludeTax: fs?.pricesIncludeTax ?? true, rateBps: rate, label: fs?.taxLabel ?? 'VAT', registered: fs?.taxRegistered ?? false, rounding: 'half_up per document' };
  const [inv] = await tx<{ id: string }[]>`
    insert into invoices (tenant_id, number, kind, booking_id, order_id, seller_snapshot, buyer_snapshot, subtotal_minor, discount_minor, tax_minor, total_minor, tax_rule_snapshot, issued_by)
    values (${ctx.tenant.id}, ${number}, 'invoice', ${ref.bookingId ?? null}, ${ref.orderId ?? null}, ${tx.json(seller as never)}, ${tx.json(buyer as never)},
            ${subtotal}, ${discount}, ${tax}, ${grand}, ${tx.json(taxRule as never)}, ${ctx.user.userId}) returning id`;
  for (const l of lines) {
    await tx`insert into invoice_items (tenant_id, invoice_id, description, quantity, unit_price_minor, line_total_minor) values (${ctx.tenant.id}, ${inv.id}, ${l.description}, ${l.quantity}, ${l.unitPriceMinor}, ${l.lineTotalMinor})`;
  }
  await audit(tx, { actorUserId: ctx.user.userId, actorKind: ctx.actorKind, tenantId: ctx.tenant.id, action: 'invoice.issued', targetType: 'invoice', targetId: inv.id, requestId: ctx.requestId, metadata: { number } });
  return { id: inv.id, number };
}

export async function listInvoices(tx: Tx) {
  return tx`select id, number, kind, total_minor, tax_minor, status, issued_at, booking_id, order_id, buyer_snapshot from invoices order by issued_at desc limit 300`;
}

const FONT_CANDIDATES = [process.env.INVOICE_FONT_PATH, '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'].filter(Boolean) as string[];
const money = (m: number) => `${(m / 100).toFixed(2)} SAR`;

export async function renderInvoicePdf(tx: Tx, id: string): Promise<{ number: string; pdf: Buffer }> {
  const [inv] = await tx<{ number: string; kind: string; sellerSnapshot: Record<string, string | null>; buyerSnapshot: Record<string, string>; subtotalMinor: number; discountMinor: number; taxMinor: number; totalMinor: number; taxRuleSnapshot: { label: string; rateBps: number; registered: boolean; pricesIncludeTax: boolean }; issuedAt: Date; status: string }[]>`
    select * from invoices where id = ${id}`;
  if (!inv) throw notFound('invoice');
  const items = await tx<{ description: string; quantity: string; unitPriceMinor: number; lineTotalMinor: number }[]>`select description, quantity, unit_price_minor, line_total_minor from invoice_items where invoice_id = ${id}`;
  const doc = new PDFDocument({ size: 'A4', margin: 48, info: { Title: inv.number } });
  const font = FONT_CANDIDATES.find((p) => existsSync(p));
  if (font) doc.font(font);
  const chunks: Buffer[] = [];
  doc.on('data', (c: Buffer) => chunks.push(c));
  const done = new Promise<void>((r) => doc.on('end', () => r()));
  const s = inv.sellerSnapshot;
  doc.fontSize(18).text(`${inv.kind === 'invoice' ? 'Invoice / فاتورة' : 'Receipt / إيصال'}  ${inv.number}`);
  if (inv.status === 'void') doc.fillColor('red').text('VOID / ملغاة').fillColor('black');
  doc.moveDown(0.5).fontSize(10);
  doc.text(`Seller: ${s.legalName || s.name}`);
  if (s.taxNumber) doc.text(`Tax number: ${s.taxNumber}`);
  if (s.address) doc.text(`Address: ${s.address}`);
  doc.text(`Issued: ${inv.issuedAt.toISOString().slice(0, 16).replace('T', ' ')} UTC`);
  doc.text(`Customer: ${inv.buyerSnapshot.name ?? ''}   Ref: ${inv.buyerSnapshot.reference ?? ''}`);
  doc.moveDown();
  doc.fontSize(11).text('Items', { underline: true }).fontSize(10);
  for (const it of items) doc.text(`${it.description}   × ${Number(it.quantity)}   ${money(it.lineTotalMinor)}`);
  doc.moveDown();
  doc.text(`Subtotal: ${money(inv.subtotalMinor)}`);
  if (inv.discountMinor) doc.text(`Discount: −${money(inv.discountMinor)}`);
  const tr = inv.taxRuleSnapshot;
  if (tr.registered) doc.text(`${tr.label} ${(tr.rateBps / 100).toFixed(2)}% ${tr.pricesIncludeTax ? '(included)' : ''}: ${money(inv.taxMinor)}`);
  doc.fontSize(12).text(`Total: ${money(inv.totalMinor)}`);
  doc.moveDown().fontSize(8).fillColor('#666')
    .text('This document is generated by LUMA for record keeping. It is not a ZATCA-cleared e-invoice and carries no e-invoicing QR/stamp.')
    .text('هذا المستند للسجلات فقط وليس فاتورة إلكترونية معتمدة من هيئة الزكاة.');
  if (s.footer) doc.text(s.footer);
  doc.end();
  await done;
  return { number: inv.number, pdf: Buffer.concat(chunks) };
}
