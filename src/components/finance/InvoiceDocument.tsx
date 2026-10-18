import type { InvoiceDocument as Doc } from '@/server/finance/invoices';
import { translate } from '@/lib/i18n';
import type { Locale } from '@/lib/i18n';

/**
 * Printable tax invoice / credit note (server component, no client JS).
 * Bilingual labels: Arabic first, English underneath. Amounts in SAR with two
 * decimals, isolated LTR so they never reorder inside Arabic text. The QR is
 * an inline SVG of the stored TLV payload (no external service).
 */
const sar = (minor: number) => `${(minor / 100).toFixed(2)}`;

export function InvoiceDocumentView({ doc, tz }: { doc: Doc; tz: string; locale: Locale }) {
  const L = (k: string) => (
    <>
      {translate('ar', k)}
      <span className="bi" lang="en" dir="ltr">{translate('en', k)}</span>
    </>
  );
  const inv = doc.invoice;
  const s = inv.sellerSnapshot;
  const tr = inv.taxRuleSnapshot;
  const vat = tr.registered;
  const title = inv.kind === 'credit_note' ? 'inv.title_credit' : vat ? 'inv.title_simplified' : 'inv.title_invoice';
  // ISO-like local timestamp: unambiguous in both languages and never reordered by bidi
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(new Date(inv.issuedAt)).map((p) => [p.type, p.value]));
  const issued = `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}`;
  const Row = ({ k, v }: { k: string; v: React.ReactNode }) => (
    <tr>
      <th scope="row">{translate('ar', k)}<span className="bi" lang="en" dir="ltr">{translate('en', k)}</span></th>
      <td><bdi className="num">{v}</bdi></td>
    </tr>
  );
  const ap = s.addressParts;
  const address = ap && (ap.street || ap.city) ? [ap.buildingNo, ap.street, ap.district, ap.city, ap.postalCode, ap.additionalNo ? `(${ap.additionalNo})` : null].filter(Boolean).join('، ') : s.address;
  const excl = inv.totalMinor - inv.taxMinor;
  return (
    <article className="invoice-doc" dir="rtl" lang="ar" aria-label={translate('ar', title)}>
      <div className="head">
        <div>
          <h1>{L(title)}</h1>
          <div style={{ marginTop: 6 }}>
            <strong>{s.legalName || s.name}</strong>
            {s.legalName && s.legalName !== s.name && <div className="muted">{s.name}</div>}
            {address && <div className="muted">{address}</div>}
          </div>
        </div>
        <div>
          {inv.status === 'void' && <div className="void">{translate('ar', 'inv.void')} / VOID</div>}
          {doc.qrSvg && <div className="qr" aria-label={translate('ar', 'inv.qr_label')} dangerouslySetInnerHTML={{ __html: doc.qrSvg }} />}
        </div>
      </div>

      <table className="meta">
        <tbody>
          <Row k="inv.number" v={inv.number} />
          <Row k="inv.issued_at" v={issued} />
          {s.vatNumber && <Row k="inv.vat_number" v={s.vatNumber} />}
          {s.crNumber && <Row k="inv.cr_number" v={s.crNumber} />}
          {doc.original && <Row k="inv.credit_for" v={doc.original.number} />}
          {inv.icv != null && <Row k="inv.icv" v={inv.icv} />}
        </tbody>
      </table>

      <table className="meta">
        <tbody>
          <tr><th scope="row">{translate('ar', 'inv.customer')}<span className="bi" lang="en" dir="ltr">{translate('en', 'inv.customer')}</span></th><td><strong>{inv.buyerSnapshot.name || '—'}</strong></td></tr>
          {inv.buyerSnapshot.reference && <Row k="inv.reference" v={inv.buyerSnapshot.reference} />}
          {inv.creditReason && <tr><th scope="row">{translate('ar', 'common.reason')}<span className="bi" lang="en" dir="ltr">Reason</span></th><td>{inv.creditReason}</td></tr>}
        </tbody>
      </table>

      <table>
        <thead>
          <tr>
            <th>{L('inv.col_item')}</th>
            <th className="num">{L('inv.col_qty')}</th>
            <th className="num">{L('inv.col_unit')}</th>
            {vat && <th className="num">{L('inv.col_vat')}</th>}
            <th className="num">{L('inv.col_total')}</th>
          </tr>
        </thead>
        <tbody>
          {doc.items.map((it, i) => (
            <tr key={i}>
              <td>{it.description}</td>
              <td className="num">{it.quantity}</td>
              <td className="num">{sar(it.unitPriceMinor)}</td>
              {vat && <td className="num">{sar(it.taxMinor)}</td>}
              <td className="num">{sar(it.lineTotalMinor)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <table className="totals">
        <tbody>
          <tr><td>{L('inv.subtotal')}</td><td className="num">{sar(inv.subtotalMinor)}</td></tr>
          {inv.discountMinor > 0 && <tr><td>{L('inv.discount')}</td><td className="num">−{sar(inv.discountMinor)}</td></tr>}
          {vat && <tr><td>{L('inv.taxable')}</td><td className="num">{sar(excl)}</td></tr>}
          {vat && <tr><td>{tr.label} {(tr.rateBps / 100).toFixed(0)}%{tr.pricesIncludeTax ? ` (${translate('ar', 'inv.included')})` : ''}<span className="bi">VAT {(tr.rateBps / 100).toFixed(0)}%</span></td><td className="num">{sar(inv.taxMinor)}</td></tr>}
          <tr className="grand"><td>{L(vat ? 'inv.total_incl' : 'inv.total')}</td><td className="num">{sar(inv.totalMinor)} {inv.currency}</td></tr>
        </tbody>
      </table>

      {doc.credits.length > 0 && (
        <div style={{ marginTop: 10 }} className="muted">
          {translate('ar', 'inv.credits_issued')}: {doc.credits.map((c) => `${c.number} (${sar(c.totalMinor)})`).join('، ')}
        </div>
      )}
      {s.footer && <p style={{ marginTop: 12 }}>{s.footer}</p>}

      <div className="disclaimer" role="note">
        <div>{translate('ar', vat ? 'inv.disclaimer_vat' : 'inv.disclaimer_plain')}</div>
        <div lang="en" dir="ltr" style={{ marginTop: 4 }}>{translate('en', vat ? 'inv.disclaimer_vat' : 'inv.disclaimer_plain')}</div>
        {inv.contentHash && <div className="num" style={{ marginTop: 4, fontSize: 10, opacity: 0.7 }}>SHA-256 {inv.contentHash.slice(0, 32)}…</div>}
      </div>
    </article>
  );
}
