import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { closeDb, withSystem, withTenant, withUser } from '@/server/db';
import { connectSandbox, processProviderEvent, recordOnSitePayment, sandboxEmit, startOrderPayment } from '@/server/payments/service';
import { checkoutCart, getOrCreateCart, setCartLine, transitionOrder } from '@/server/commerce/orders';
import { commerceSettingsInput, quoteDelivery, saveAddress, updateCommerceSettings, updateDelivery, upsertZone, listAddresses } from '@/server/commerce/delivery';
import { completeReturn, decideReturn, receiveReturn, requestReturn, suggestedRefund } from '@/server/commerce/returns';
import { decodeTlv, encodeTlv, invoiceDocument, issueCreditNote, issueInvoice, verifyChain } from '@/server/finance/invoices';
import { financeSettingsInput, updateFinanceSettings } from '@/server/dashboard/settings';
import { activateMoyasar, moyasarKeysInput, paymentConnections, saveMoyasarKeys, testMoyasar } from '@/server/payments/connect';
import { encryptSecret } from '@/server/crypto';
import { deliveryLog, listTemplates, saveTemplate, testSend } from '@/server/services/messages';
import { notifyUser } from '@/server/services/notifications';
import { subscribe } from '@/server/realtime';
import { makeCustomer, makeSalon, type SalonFixture } from '../booking-fixtures';
import { uniq } from '../fixtures';

afterAll(closeDb);

let s: SalonFixture;
beforeAll(async () => {
  s = await makeSalon();
  const owner = await s.ctx();
  await s.run((tx) => connectSandbox(tx, owner));
});

async function product(name: string, price: number, onHand = 10, opts: { returnable?: boolean; cost?: number } = {}) {
  const [p] = await s.run((tx) => tx<{ id: string }[]>`insert into products (tenant_id, name, price_minor, cost_minor, returnable)
    values (${s.tenantId}, ${name}, ${price}, ${opts.cost ?? null}, ${opts.returnable ?? true}) returning id`);
  const [i] = await s.run((tx) => tx<{ id: string }[]>`insert into inventory_items (tenant_id, branch_id, usage, product_id, name, on_hand)
    values (${s.tenantId}, ${s.branchId}, 'retail', ${p.id}, ${name}, ${onHand}) returning id`);
  return { productId: p.id, inventoryId: i.id };
}

async function cartWith(userId: string, lines: { productId: string; quantity: number }[]) {
  return s.run(async (tx) => {
    const cart = await getOrCreateCart(tx, s.tenantId, { userId });
    for (const l of lines) await setCartLine(tx, s.tenantId, cart, l);
    return cart;
  });
}

const RIYADH = { recipientName: 'سارة', phone: '+966500000001', city: 'الرياض', district: 'الملقا', street: 'شارع الأمير', isDefault: true };

async function enableDelivery(opts: { cod?: boolean; returns?: boolean; refundFee?: boolean } = {}) {
  const owner = await s.ctx();
  await s.run(async (tx) => {
    const [{ n }] = await tx<{ n: number }[]>`select count(*)::int as n from delivery_zones`;
    if (!n) {
      await upsertZone(tx, owner, { branchId: s.branchId, name: 'Riyadh', cities: ['الرياض', 'Riyadh'], districts: [], feeMinor: 2500, freeOverMinor: 50000, minOrderMinor: 3000, etaMinHours: 24, etaMaxHours: 48, isActive: true });
      await upsertZone(tx, owner, { branchId: s.branchId, name: 'Malqa', cities: ['الرياض'], districts: ['الملقا'], feeMinor: 1500, freeOverMinor: null, minOrderMinor: 0, etaMinHours: 6, etaMaxHours: 12, isActive: true });
    }
    await updateCommerceSettings(tx, owner, commerceSettingsInput.parse({
      pickupEnabled: true, deliveryEnabled: true, cashOnDelivery: !!opts.cod, deliveryInstructions: null,
      returnsEnabled: opts.returns ?? true, returnWindowDays: 7, returnPolicyText: 'إرجاع خلال 7 أيام للمنتجات غير المفتوحة.', returnShippingPaidBy: 'customer', refundDeliveryFee: !!opts.refundFee,
    }));
  });
}

describe('delivery', () => {
  it('delivery cannot be switched on without an active zone; one method must stay on', async () => {
    const owner = await s.ctx();
    expect(() => commerceSettingsInput.parse({ pickupEnabled: false, deliveryEnabled: false, cashOnDelivery: false, deliveryInstructions: null, returnsEnabled: false, returnWindowDays: 7, returnPolicyText: null, returnShippingPaidBy: 'customer', refundDeliveryFee: false })).toThrow();
    await expect(s.run((tx) => updateCommerceSettings(tx, owner, { pickupEnabled: true, deliveryEnabled: true, cashOnDelivery: false, deliveryInstructions: null, returnsEnabled: false, returnWindowDays: 7, returnPolicyText: null, returnShippingPaidBy: 'customer', refundDeliveryFee: false })))
      .rejects.toMatchObject({ message: 'errors.delivery_zone_required' });
  });

  it('quotes the most specific zone, free-over threshold and minimum order', async () => {
    await enableDelivery();
    const q1 = await s.run((tx) => quoteDelivery(tx, { city: 'الرياض', district: 'الملقا' }, 10000));
    expect(q1).toMatchObject({ ok: true, zoneName: 'Malqa', feeMinor: 1500 });
    const q2 = await s.run((tx) => quoteDelivery(tx, { city: ' riyadh ', district: 'العليا' }, 10000));
    expect(q2).toMatchObject({ ok: true, zoneName: 'Riyadh', feeMinor: 2500 });
    expect(await s.run((tx) => quoteDelivery(tx, { city: 'Riyadh' }, 60000))).toMatchObject({ ok: true, feeMinor: 0 });
    expect(await s.run((tx) => quoteDelivery(tx, { city: 'Riyadh' }, 1000))).toMatchObject({ ok: false, reason: 'below_minimum' });
    expect(await s.run((tx) => quoteDelivery(tx, { city: 'جدة' }, 10000))).toMatchObject({ ok: false, reason: 'not_covered' });
  });

  it('address book is private to its owner (RLS)', async () => {
    const a = await makeCustomer(s, 'AddrA');
    const b = await makeCustomer(s, 'AddrB');
    const saved = await withUser(a.user.userId, (tx) => saveAddress(tx, a.user.userId, RIYADH));
    expect(await withUser(b.user.userId, (tx) => tx`select id from customer_addresses where id = ${saved.id}`)).toHaveLength(0);
    // even inside a business scope, another person's address is invisible
    expect(await withTenant({ tenantId: s.tenantId, userId: b.user.userId }, (tx) => tx`select id from customer_addresses where id = ${saved.id}`)).toHaveLength(0);
    expect(await withTenant({ tenantId: s.tenantId, userId: s.owner.userId }, (tx) => tx`select id from customer_addresses`)).toHaveLength(0);
  });

  it('checkout with delivery: server fee, address snapshot, foreign address refused, manipulated fee refused', async () => {
    await enableDelivery();
    const p = await product(`Cream ${uniq()}`, 6000);
    const c = await makeCustomer(s, 'Deliv');
    const other = await makeCustomer(s, 'Other');
    const addr = await withUser(c.user.userId, (tx) => saveAddress(tx, c.user.userId, RIYADH));
    const foreign = await withUser(other.user.userId, (tx) => saveAddress(tx, other.user.userId, RIYADH));
    const cart = await cartWith(c.user.userId, [{ productId: p.productId, quantity: 1 }]);
    const base = { branchId: s.branchId, acceptedSubtotalMinor: 6000, payAtPickup: false, fulfillment: 'delivery' as const };
    const asCustomer = <T,>(fn: Parameters<typeof withTenant<T>>[1]) => withTenant({ tenantId: s.tenantId, userId: c.user.userId }, fn);
    await expect(asCustomer((tx) => checkoutCart(tx, s.tenantId, { userId: c.user.userId, tenantCustomerId: c.tenantCustomerId }, cart, { ...base, addressId: foreign.id, acceptedDeliveryFeeMinor: 1500 })))
      .rejects.toMatchObject({ message: 'errors.address_required' });
    await expect(asCustomer((tx) => checkoutCart(tx, s.tenantId, { userId: c.user.userId, tenantCustomerId: c.tenantCustomerId }, cart, { ...base, addressId: addr.id, acceptedDeliveryFeeMinor: 0 })))
      .rejects.toMatchObject({ code: 'conflict', message: 'errors.delivery_fee_changed' });
    const o = await asCustomer((tx) => checkoutCart(tx, s.tenantId, { userId: c.user.userId, tenantCustomerId: c.tenantCustomerId }, cart, { ...base, addressId: addr.id, acceptedDeliveryFeeMinor: 1500 }));
    expect(o).toMatchObject({ deliveryFeeMinor: 1500, totalMinor: 7500, fulfillment: 'delivery' });
    // later edits to the address book never change the placed order
    await withUser(c.user.userId, (tx) => saveAddress(tx, c.user.userId, { ...RIYADH, street: 'تغيّر' }, addr.id));
    const [row] = await s.run((tx) => tx<{ deliveryAddress: { street: string; phone: string }; fulfillmentMethod: string; totalMinor: number }[]>`select delivery_address, fulfillment_method, total_minor from orders where id = ${o.orderId}`);
    expect(row).toMatchObject({ fulfillmentMethod: 'delivery', totalMinor: 7500, deliveryAddress: { street: 'شارع الأمير', phone: '+966500000001' } });
    // the snapshot holds the destination only (no account ids)
    expect(Object.keys(row.deliveryAddress)).not.toContain('id');
  });

  it('cash on delivery requires the switch; staged delivery deducts stock once and splits revenue', async () => {
    await enableDelivery({ cod: false });
    const p = await product(`Oil ${uniq()}`, 4000, 5, { cost: 1000 });
    const c = await makeCustomer(s, 'COD');
    const addr = await withUser(c.user.userId, (tx) => saveAddress(tx, c.user.userId, { ...RIYADH, district: 'العليا' }));
    const cart = await cartWith(c.user.userId, [{ productId: p.productId, quantity: 2 }]);
    const input = { branchId: s.branchId, acceptedSubtotalMinor: 8000, payAtPickup: true, fulfillment: 'delivery' as const, addressId: addr.id, acceptedDeliveryFeeMinor: 2500 };
    const cust = { userId: c.user.userId, tenantCustomerId: c.tenantCustomerId };
    const asC = <T,>(fn: Parameters<typeof withTenant<T>>[1]) => withTenant({ tenantId: s.tenantId, userId: c.user.userId }, fn);
    await expect(asC((tx) => checkoutCart(tx, s.tenantId, cust, cart, input))).rejects.toMatchObject({ message: 'errors.terms_not_allowed' });
    await enableDelivery({ cod: true });
    const o = await asC((tx) => checkoutCart(tx, s.tenantId, cust, cart, input));
    expect(o).toMatchObject({ terms: 'on_site', totalMinor: 10500 });
    const owner = await s.ctx();
    // the generic "collected" transition is refused for deliveries
    await s.run((tx) => updateDelivery(tx, owner, o.orderId, { status: 'ready' }));
    await expect(s.run((tx) => transitionOrder(tx, owner, o.orderId, 'collected'))).rejects.toMatchObject({ code: 'invalid_transition' });
    let [ord] = await s.run((tx) => tx`select status, hold_expires_at from orders where id = ${o.orderId}`);
    expect(ord).toMatchObject({ status: 'ready', holdExpiresAt: null });
    await expect(s.run((tx) => updateDelivery(tx, owner, o.orderId, { status: 'delivered' }))).rejects.toMatchObject({ code: 'invalid_transition' });
    await s.run((tx) => updateDelivery(tx, owner, o.orderId, { status: 'out_for_delivery', courierName: 'مندوب', trackingRef: 'TRK1', trackingUrl: 'https://track.example/TRK1' }));
    await expect(s.run((tx) => updateDelivery(tx, owner, o.orderId, { status: 'failed_attempt' }))).rejects.toMatchObject({ message: 'errors.reason_required' });
    await s.run((tx) => updateDelivery(tx, owner, o.orderId, { status: 'failed_attempt', note: 'لم يرد العميل' }));
    await s.run((tx) => updateDelivery(tx, owner, o.orderId, { status: 'out_for_delivery' }));
    // courier must have collected the cash first
    await expect(s.run((tx) => updateDelivery(tx, owner, o.orderId, { status: 'delivered' }))).rejects.toMatchObject({ code: 'payment_required' });
    await s.run((tx) => recordOnSitePayment(tx, owner, { orderId: o.orderId, amountMinor: 10500, method: 'cash', reference: 'COD-1', idempotencyKey: uniq() }));
    await s.run((tx) => updateDelivery(tx, owner, o.orderId, { status: 'delivered' }));
    [ord] = await s.run((tx) => tx`select o.status, f.status as f_status, f.attempts, f.tracking_ref from orders o join fulfillments f on f.order_id = o.id where o.id = ${o.orderId}`);
    expect(ord).toMatchObject({ status: 'collected', fStatus: 'delivered', attempts: 2, trackingRef: 'TRK1' });
    const [inv] = await s.run((tx) => tx`select on_hand, reserved from inventory_items where id = ${p.inventoryId}`);
    expect([Number(inv.onHand), Number(inv.reserved)]).toEqual([3, 0]);
    const rev = await s.run((tx) => tx<{ account: string; amt: number }[]>`select account, sum(credit_minor - debit_minor)::int as amt from financial_entries where ref_type = 'order_collected' and ref_id = ${o.orderId} group by account`);
    expect(Object.fromEntries(rev.map((r) => [r.account, r.amt]))).toMatchObject({ product_revenue: 8000, delivery_revenue: 2500 });
    const tl = await s.run((tx) => tx<{ status: string }[]>`select status from fulfillment_events where order_id = ${o.orderId} order by created_at, id`);
    expect(tl.map((e) => e.status)).toEqual(expect.arrayContaining(['placed', 'ready', 'out_for_delivery', 'failed_attempt', 'delivered']));
    // the customer was told about each stage
    const n = await withUser(c.user.userId, (tx) => tx<{ title: string }[]>`select title from notifications where user_id = ${c.user.userId}`);
    expect(n.map((x) => x.title)).toEqual(expect.arrayContaining(['order.notice_out_for_delivery', 'order.notice_failed_attempt', 'order.notice_delivered']));
  });

  it('tracking URL must be https', async () => {
    const { deliveryUpdateInput } = await import('@/server/commerce/delivery');
    expect(() => deliveryUpdateInput.parse({ status: 'out_for_delivery', trackingUrl: 'javascript:alert(1)' })).toThrow();
    expect(() => deliveryUpdateInput.parse({ status: 'out_for_delivery', trackingUrl: 'http://x.example/a' })).toThrow();
  });
});

/** A paid (sandbox) pickup order that has been collected. */
async function collectedOrder(lines: { productId: string; quantity: number }[], subtotal: number) {
  const c = await makeCustomer(s, `R${uniq()}`);
  const cart = await cartWith(c.user.userId, lines);
  const o = await s.run((tx) => checkoutCart(tx, s.tenantId, { userId: c.user.userId, tenantCustomerId: c.tenantCustomerId }, cart, { branchId: s.branchId, acceptedSubtotalMinor: subtotal, payAtPickup: false }));
  const pay = await s.run((tx) => startOrderPayment(tx, c.user.userId, o.orderId, `o-${uniq()}`));
  const ev = await sandboxEmit(pay.paymentId, 'succeeded');
  await processProviderEvent('sandbox', ev.body, ev.headers);
  const owner = await s.ctx();
  await s.run((tx) => transitionOrder(tx, owner, o.orderId, 'ready'));
  await s.run((tx) => transitionOrder(tx, owner, o.orderId, 'collected'));
  const items = await s.run((tx) => tx<{ id: string; productId: string }[]>`select id, product_id from order_items where order_id = ${o.orderId}`);
  return { c, orderId: o.orderId, items, paymentId: pay.paymentId };
}

describe('returns', () => {
  beforeAll(() => enableDelivery({ returns: true }));

  it('customer request → approve → receive (restock once) → complete with refund + credit note', async () => {
    const a = await product(`Mask ${uniq()}`, 3000, 10);
    const b = await product(`Brush ${uniq()}`, 2000, 10, { returnable: false });
    const { c, orderId, items } = await collectedOrder([{ productId: a.productId, quantity: 2 }, { productId: b.productId, quantity: 1 }], 8000);
    const itemA = items.find((i) => i.productId === a.productId)!.id;
    const itemB = items.find((i) => i.productId === b.productId)!.id;
    const owner = await s.ctx();
    await s.run((tx) => issueInvoice(tx, owner, { orderId }));
    const asC = <T,>(fn: Parameters<typeof withTenant<T>>[1]) => withTenant({ tenantId: s.tenantId, userId: c.user.userId }, fn);
    await expect(asC((tx) => requestReturn(tx, s.tenantId, c.user.userId, orderId, { items: [{ orderItemId: itemB, quantity: 1 }], reasonCode: 'damaged', reason: 'مكسور' })))
      .rejects.toMatchObject({ message: 'errors.item_not_returnable' });
    await expect(asC((tx) => requestReturn(tx, s.tenantId, c.user.userId, orderId, { items: [{ orderItemId: itemA, quantity: 3 }], reasonCode: 'damaged', reason: 'مكسور' })))
      .rejects.toMatchObject({ message: 'errors.return_qty_exceeds' });
    // another customer cannot request a return on this order
    const stranger = await makeCustomer(s, 'Stranger');
    await expect(withTenant({ tenantId: s.tenantId, userId: stranger.user.userId }, (tx) => requestReturn(tx, s.tenantId, stranger.user.userId, orderId, { items: [{ orderItemId: itemA, quantity: 1 }], reasonCode: 'other', reason: 'xxx' })))
      .rejects.toMatchObject({ code: 'not_found' });
    const r = await asC((tx) => requestReturn(tx, s.tenantId, c.user.userId, orderId, { items: [{ orderItemId: itemA, quantity: 2 }], reasonCode: 'damaged', reason: 'العبوة مكسورة' }));
    expect(r.status).toBe('requested');
    // open request quantity counts against a second request
    await expect(asC((tx) => requestReturn(tx, s.tenantId, c.user.userId, orderId, { items: [{ orderItemId: itemA, quantity: 1 }], reasonCode: 'damaged', reason: 'again' })))
      .rejects.toMatchObject({ message: 'errors.return_qty_exceeds' });
    await expect(s.run((tx) => decideReturn(tx, owner, r.number, { decision: 'reject' }))).rejects.toMatchObject({ message: 'errors.reason_required' });
    await s.run((tx) => decideReturn(tx, owner, r.number, { decision: 'approve' }));
    const [line] = await s.run((tx) => tx<{ id: string }[]>`select id from returns where request_number = ${r.number}`);
    await s.run((tx) => receiveReturn(tx, owner, r.number, { restock: [{ returnId: line.id, restock: true }] }));
    let [inv] = await s.run((tx) => tx`select on_hand from inventory_items where id = ${a.inventoryId}`);
    expect(Number(inv.onHand)).toBe(10); // 10 − 2 sold + 2 restocked
    await expect(s.run((tx) => receiveReturn(tx, owner, r.number, { restock: [{ returnId: line.id, restock: true }] }))).rejects.toMatchObject({ code: 'invalid_transition' });
    [inv] = await s.run((tx) => tx`select on_hand from inventory_items where id = ${a.inventoryId}`);
    expect(Number(inv.onHand)).toBe(10);
    const sug = await s.run((tx) => suggestedRefund(tx, r.number));
    expect(sug.suggestedMinor).toBe(6000);
    await expect(s.run((tx) => completeReturn(tx, owner, r.number, { refundAmountMinor: 6001, idempotencyKey: uniq() }))).rejects.toMatchObject({ message: 'errors.refund_exceeds' });
    const done = await s.run((tx) => completeReturn(tx, owner, r.number, { refundAmountMinor: 6000, idempotencyKey: uniq() }));
    expect(done.refundId).toBeTruthy();
    expect(done.creditNote?.number).toMatch(/^CN-/);
    const [oi] = await s.run((tx) => tx`select returned_qty from order_items where id = ${itemA}`);
    expect(oi.returnedQty).toBe(2);
    const [ref] = await s.run((tx) => tx`select status, amount_minor from refunds where id = ${done.refundId!}`);
    expect(ref.amountMinor).toBe(6000);
    // a credit note can never exceed what is left on the invoice
    const [invRow] = await s.run((tx) => tx<{ id: string }[]>`select id from invoices where order_id = ${orderId} and kind = 'invoice'`);
    await expect(s.run((tx) => issueCreditNote(tx, owner, invRow.id, { amountMinor: 2001, reason: 'too much' }))).rejects.toMatchObject({ message: 'errors.credit_exceeds' });
    // the customer sees her return through her own order
    const seen = await withUser(c.user.userId, (tx) => tx`select status from returns where request_number = ${r.number}`);
    expect(seen.every((x) => x.status === 'completed')).toBe(true);
  });

  it('window closed and disabled policy are enforced for customers', async () => {
    const a = await product(`Gel ${uniq()}`, 2500, 5);
    const { c, orderId, items } = await collectedOrder([{ productId: a.productId, quantity: 1 }], 2500);
    await s.run((tx) => tx`update fulfillments set collected_at = now() - interval '8 days' where order_id = ${orderId}`);
    await expect(withTenant({ tenantId: s.tenantId, userId: c.user.userId }, (tx) => requestReturn(tx, s.tenantId, c.user.userId, orderId, { items: [{ orderItemId: items[0].id, quantity: 1 }], reasonCode: 'changed_mind', reason: 'لا أحتاجه' })))
      .rejects.toMatchObject({ message: 'errors.return_window_closed' });
  });
});

describe('tax invoices (ZATCA-shaped, not connected)', () => {
  it('TLV encodes the five Phase-1 fields and round-trips Arabic', () => {
    const b64 = encodeTlv({ sellerName: 'صالون نورة', vatNumber: '310122393500003', timestamp: '2026-10-18T10:00:00Z', totalWithVat: '115.00', vatTotal: '15.00' });
    const raw = Buffer.from(b64, 'base64');
    expect(raw[0]).toBe(1);
    expect(raw[1]).toBe(Buffer.byteLength('صالون نورة'));
    expect(decodeTlv(b64)).toEqual({ 1: 'صالون نورة', 2: '310122393500003', 3: '2026-10-18T10:00:00Z', 4: '115.00', 5: '15.00' });
  });

  it('VAT settings are validated; registered invoices carry a QR, line VAT and a verifiable chain', async () => {
    const owner = await s.ctx();
    const base = { pricesIncludeTax: true, taxRateBps: 1500, taxLabel: 'ضريبة القيمة المضافة', taxRegistered: true, legalAddress: 'الرياض', invoiceFooter: null };
    expect(() => financeSettingsInput.parse({ ...base, sellerVatNumber: '123' })).toThrow();
    expect(() => financeSettingsInput.parse({ ...base })).toThrow(); // registered needs a VAT number
    await s.run((tx) => updateFinanceSettings(tx, owner, financeSettingsInput.parse({ ...base, sellerVatNumber: '310122393500003', crNumber: '1010101010', addressCity: 'الرياض', addressPostalCode: '12345', addressBuildingNo: '1234' })));
    const a = await product(`Serum ${uniq()}`, 11500, 5);
    const { orderId } = await collectedOrder([{ productId: a.productId, quantity: 1 }], 11500);
    const inv = await s.run((tx) => issueInvoice(tx, owner, { orderId }));
    const again = await s.run((tx) => issueInvoice(tx, owner, { orderId }));
    expect(again.id).toBe(inv.id); // one invoice per order
    const d = await s.run((tx) => invoiceDocument(tx, inv.id));
    expect(d.invoice.taxMinor).toBe(1500);
    expect(d.items.reduce((n, i) => n + i.taxMinor, 0)).toBe(1500);
    expect(d.tlv).toMatchObject({ 2: '310122393500003', 4: '115.00', 5: '15.00' });
    expect(d.qrSvg).toContain('<svg');
    expect(d.invoice.einvoicingStatus).toBe('not_submitted');
    const cn = await s.run((tx) => issueCreditNote(tx, owner, inv.id, { amountMinor: 5750, reason: 'تصحيح' }));
    const cd = await s.run((tx) => invoiceDocument(tx, cn.id));
    expect(cd.invoice.kind).toBe('credit_note');
    expect(cd.original?.number).toBe(inv.number);
    expect(cd.invoice.taxMinor).toBe(750);
    expect(await s.run((tx) => verifyChain(tx))).toMatchObject({ ok: true });
    // tampering with a stored document breaks the chain
    await withSystem('test: tamper', (tx) => tx`update invoices set content_hash = 'x' where id = ${inv.id}`);
    expect(await s.run((tx) => verifyChain(tx))).toMatchObject({ ok: false });
    await s.run((tx) => updateFinanceSettings(tx, owner, financeSettingsInput.parse({ ...base, taxRegistered: false, taxRateBps: 0 })));
  });

  it('another business cannot read an invoice by id', async () => {
    const owner = await s.ctx();
    const a = await product(`Lotion ${uniq()}`, 1000, 5);
    const { orderId } = await collectedOrder([{ productId: a.productId, quantity: 1 }], 1000);
    const inv = await s.run((tx) => issueInvoice(tx, owner, { orderId }));
    const other = await makeSalon();
    await expect(other.run((tx) => invoiceDocument(tx, inv.id))).rejects.toMatchObject({ code: 'not_found' });
  });
});

describe('Moyasar connection (untested adapter; honest states)', () => {
  const pk = 'pk_test_' + 'a'.repeat(24);
  const sk = 'sk_test_' + 'b'.repeat(24);

  it('validates key pairs, stores secrets encrypted and never returns them', async () => {
    const other = await makeSalon();
    const owner = await other.ctx();
    expect(() => moyasarKeysInput.parse({ publishableKey: 'pk_xx', secretKey: sk, webhookSecret: 'w'.repeat(24), methods: ['mada'] })).toThrow();
    await expect(other.run((tx) => saveMoyasarKeys(tx, owner, { publishableKey: pk, secretKey: 'sk_live_' + 'b'.repeat(24), webhookSecret: 'w'.repeat(24), methods: ['mada'] })))
      .rejects.toMatchObject({ message: 'errors.moyasar_mode_mismatch' });
    const saved = await other.run((tx) => saveMoyasarKeys(tx, owner, { publishableKey: pk, secretKey: sk, webhookSecret: 'w'.repeat(24), methods: ['mada', 'applepay'] }));
    expect(saved).toMatchObject({ mode: 'test', status: 'pending_verification' });
    const [row] = await other.run((tx) => tx`select secret_ciphertext, webhook_secret_ciphertext from payment_accounts where id = ${saved.id}`);
    expect(row.secretCiphertext).not.toContain(sk);
    const view = JSON.stringify(await other.run((tx) => paymentConnections(tx)));
    expect(view).not.toContain(sk);
    expect(view).not.toContain('w'.repeat(24));
    expect(view).toContain('sk_test_…bbbb');
    // with the adapter disabled the test is "unreachable" and activation is refused
    expect(await other.run((tx) => testMoyasar(tx, owner, saved.id))).toMatchObject({ result: 'unreachable', detail: 'adapter_disabled' });
    await expect(other.run((tx) => activateMoyasar(tx, owner, saved.id))).rejects.toMatchObject({ code: 'unavailable' });
    // a probe result is recorded honestly
    expect(await other.run((tx) => testMoyasar(tx, owner, saved.id, async () => ({ result: 'failed', detail: 'http_401_unauthorized' })))).toMatchObject({ result: 'failed' });
    const [st] = await other.run((tx) => tx`select status, last_test_result from payment_accounts where id = ${saved.id}`);
    expect(st).toMatchObject({ status: 'pending_verification', lastTestResult: 'failed' });
  });

  it('webhook: locates the checkout by invoice id, re-fetches the charge, rejects a foreign charge', async () => {
    const m = await makeSalon();
    const owner = await m.ctx();
    const hook = 'h'.repeat(32);
    const [acct] = await withSystem('test: moyasar account', (tx) => tx<{ id: string }[]>`insert into payment_accounts (tenant_id, provider, mode, status, secret_ciphertext, webhook_secret_ciphertext, methods_enabled, verified_at)
      values (${m.tenantId}, 'moyasar', 'test', 'active', ${encryptSecret(sk)}, ${encryptSecret(hook)}, ${['mada']}, now()) returning id`);
    const [prod] = await m.run((tx) => tx<{ id: string }[]>`insert into products (tenant_id, name, price_minor) values (${m.tenantId}, 'Kit', 5000) returning id`);
    await m.run((tx) => tx`insert into inventory_items (tenant_id, branch_id, usage, product_id, name, on_hand) values (${m.tenantId}, ${m.branchId}, 'retail', ${prod.id}, 'Kit', 3)`);
    const c = await makeCustomer(m, 'MoyasarBuyer');
    const cart = await m.run(async (tx) => {
      const id = await getOrCreateCart(tx, m.tenantId, { userId: c.user.userId });
      await setCartLine(tx, m.tenantId, id, { productId: prod.id, quantity: 1 });
      return id;
    });
    const o = await m.run((tx) => checkoutCart(tx, m.tenantId, { userId: c.user.userId, tenantCustomerId: c.tenantCustomerId }, cart, { branchId: m.branchId, acceptedSubtotalMinor: 5000, payAtPickup: false }));
    const [pay] = await withSystem('test: moyasar payment', (tx) => tx<{ id: string }[]>`insert into payments (tenant_id, payment_account_id, purpose, order_id, kind, amount_minor, provider, provider_payment_id, idempotency_key)
      values (${m.tenantId}, ${acct.id}, 'order', ${o.orderId}, 'full', 5000, 'moyasar', 'inv_abc', ${`k-${uniq()}`}) returning id`);
    const charge = { id: 'pay_xyz', status: 'paid', amount: 5000, currency: 'SAR', invoice_id: 'inv_abc', source: { type: 'mada' } };
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(charge), { status: 200, headers: { 'content-type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);
    try {
      const body = JSON.stringify({ id: `evt-${uniq()}`, type: 'payment_paid', secret_token: hook, data: { id: 'pay_xyz', status: 'paid', amount: 5000, currency: 'SAR', invoice_id: 'inv_abc' } });
      expect(await processProviderEvent('moyasar', body, new Headers())).toBe('applied');
      const [p] = await m.run((tx) => tx`select status, provider_charge_id from payments where id = ${pay.id}`);
      expect(p).toMatchObject({ status: 'succeeded', providerChargeId: 'pay_xyz' });
      // wrong token
      const bad = JSON.stringify({ id: `evt-${uniq()}`, type: 'payment_paid', secret_token: 'nope'.repeat(8), data: { id: 'pay_xyz', invoice_id: 'inv_abc' } });
      expect(await processProviderEvent('moyasar', bad, new Headers())).toBe('rejected');
      // a charge that belongs to another checkout is refused even with the right token
      fetchMock.mockImplementation(async () => new Response(JSON.stringify({ ...charge, id: 'pay_other', invoice_id: 'inv_other' }), { status: 200 }));
      const foreign = JSON.stringify({ id: `evt-${uniq()}`, type: 'payment_paid', secret_token: hook, data: { id: 'pay_other', invoice_id: 'inv_abc' } });
      expect(await processProviderEvent('moyasar', foreign, new Headers())).toBe('rejected');
    } finally {
      vi.unstubAllGlobals();
    }
    void owner;
  });
});

describe('messaging templates and delivery log (no provider: simulated)', () => {
  it('rejects unknown placeholders and platform-owned templates; overrides are per business', async () => {
    const owner = await s.ctx();
    await expect(s.run((tx) => saveTemplate(tx, owner, { key: 'booking_reminder', channel: 'whatsapp', locale: 'ar', body: 'موعدك {date} {password}', isActive: true })))
      .rejects.toMatchObject({ message: 'errors.template_unknown_vars' });
    await expect(s.run((tx) => saveTemplate(tx, owner, { key: 'verification_code', channel: 'sms', locale: 'ar', body: 'رمزك {code}', isActive: true })))
      .rejects.toMatchObject({ message: 'errors.template_platform_owned' });
    // and the database refuses it too
    await expect(s.run((tx) => tx`insert into message_templates (tenant_id, key, channel, locale, body) values (${s.tenantId}, 'verification_code', 'sms', 'ar', 'x {code}')`)).rejects.toThrow();
    await s.run((tx) => saveTemplate(tx, owner, { key: 'booking_reminder', channel: 'whatsapp', locale: 'ar', body: 'أهلاً {customer_name}، موعدك {date} {time} لدى {business_name}', isActive: true }));
    const mine = (await s.run((tx) => listTemplates(tx, s.tenantId))).find((t) => t.key === 'booking_reminder' && t.channel === 'whatsapp' && t.locale === 'ar')!;
    expect(mine.custom).toBe(true);
    // default email bodies hold real line breaks, not a literal backslash-n
    const email = (await s.run((tx) => listTemplates(tx, s.tenantId))).find((t) => t.key === 'booking_confirmed' && t.channel === 'email' && t.locale === 'ar')!;
    expect(email.body).toContain('\n');
    expect(email.body).not.toContain('\\n');
    const other = await makeSalon();
    const theirs = (await other.run((tx) => listTemplates(tx, other.tenantId))).find((t) => t.key === 'booking_reminder' && t.channel === 'whatsapp' && t.locale === 'ar')!;
    expect(theirs.custom).toBe(false);
    // RLS: the other business cannot see this override even when asking for it
    expect(await other.run((tx) => tx`select id from message_templates where tenant_id = ${s.tenantId}`)).toHaveLength(0);
  });

  it('test send renders sample data and records a simulated delivery visible only to this business', async () => {
    const owner = await s.ctx();
    const r = await s.run((tx) => testSend(tx, owner, { key: 'booking_reminder', channel: 'whatsapp', locale: 'ar' }));
    expect(r.status).toBe('simulated');
    expect(r.providerStatus).toBe('disconnected');
    expect(r.preview).toContain('سارة');
    expect(r.preview).not.toMatch(/\{[a-z_]+\}/);
    const log = await s.run((tx) => deliveryLog(tx, s.tenantId, {}));
    expect(log.items[0]).toMatchObject({ status: 'simulated', isTest: true, template: 'booking_reminder' });
    const other = await makeSalon();
    expect((await other.run((tx) => deliveryLog(tx, other.tenantId, {}))).items).toHaveLength(0);
  });
});

describe('realtime notification signal', () => {
  it('LISTEN/NOTIFY wakes the subscriber of that user only', async () => {
    const u = await makeCustomer(s, 'RT');
    const v = await makeCustomer(s, 'RT2');
    let hitsU = 0;
    let hitsV = 0;
    const subU = await subscribe(u.user.userId, () => hitsU++);
    const subV = await subscribe(v.user.userId, () => hitsV++);
    expect(subU.ok).toBe(true);
    await withUser(u.user.userId, (tx) => notifyUser(tx, u.user.userId, null, { type: 't', title: 'x', dedupeKey: `rt:${uniq()}` }));
    for (let i = 0; i < 40 && !hitsU; i++) await new Promise((r) => setTimeout(r, 50));
    expect(hitsU).toBeGreaterThan(0);
    expect(hitsV).toBe(0);
    subU.unsubscribe();
    subV.unsubscribe();
    // listing addresses for a user with none is empty (sanity for the account page)
    expect(await withUser(v.user.userId, (tx) => listAddresses(tx, v.user.userId))).toEqual([]);
  });
});
