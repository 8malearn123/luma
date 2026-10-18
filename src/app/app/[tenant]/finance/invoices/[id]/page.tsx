import Link from 'next/link';
import { notFound } from 'next/navigation';
import { can, pageT, requireTenant } from '@/server/http/page';
import { tx } from '@/server/tenancy/context';
import { invoiceDocument } from '@/server/finance/invoices';
import { AppError } from '@/server/errors';
import { InvoiceDocumentView } from '@/components/finance/InvoiceDocument';
import { PrintButton } from '@/components/finance/PrintButton';
import { CreditNoteForm } from '@/components/finance/CreditNoteForm';

export const dynamic = 'force-dynamic';

/** Tenant-scoped invoice document (RLS: another business's id is a 404). */
export default async function InvoicePage({ params }: { params: Promise<{ tenant: string; id: string }> }) {
  const { tenant, id } = await params;
  const ctx = await requireTenant(tenant);
  const { t, locale } = await pageT(ctx.user);
  if (!can(ctx, 'finance.view', 'payments.collect', 'orders.manage')) return <div className="alert warn" role="alert">{t('common.permission_denied')}</div>;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  let doc;
  try {
    doc = await tx(ctx, (db) => invoiceDocument(db, id));
  } catch (e) {
    if (e instanceof AppError) notFound();
    throw e;
  }
  const credited = doc.credits.reduce((n, c) => n + c.totalMinor, 0);
  const inv = doc.invoice;
  return (
    <>
      <div className="page-head no-print">
        <div>
          <div className="crumbs"><Link href={`/app/${tenant}/finance?tab=invoices`}>{t('nav.finance')}</Link></div>
          <h1>{inv.number}</h1>
          <div className="small muted">{t(inv.kind === 'credit_note' ? 'inv.title_credit' : 'inv.title_invoice')} · {t('inv.einvoicing_state')}: {t(`inv.einv.${inv.einvoicingStatus}`)}</div>
        </div>
        <div className="row">
          <PrintButton />
          <a className="btn btn-quiet btn-sm" href={`/api/v1/t/${tenant}/finance/invoices/${id}/pdf`} target="_blank" rel="noopener">{t('inv.legacy_pdf')}</a>
        </div>
      </div>
      {inv.kind === 'invoice' && inv.status === 'issued' && ctx.caps.has('refunds.issue') && (
        <div className="no-print" style={{ marginBottom: 12 }}><CreditNoteForm tenant={tenant} invoiceId={id} remainingMinor={inv.totalMinor - credited} /></div>
      )}
      <InvoiceDocumentView doc={doc} tz={ctx.tenant.timezone} locale={locale} />
    </>
  );
}
