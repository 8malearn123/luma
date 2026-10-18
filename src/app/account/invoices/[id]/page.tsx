import Link from 'next/link';
import { notFound } from 'next/navigation';
import { pageT, requireUser } from '@/server/http/page';
import { myInvoice } from '@/server/finance/invoices';
import { AppError } from '@/server/errors';
import { InvoiceDocumentView } from '@/components/finance/InvoiceDocument';
import { PrintButton } from '@/components/finance/PrintButton';

export const dynamic = 'force-dynamic';

/** A customer's own invoice (located through her own orders/bookings only). */
export default async function MyInvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  const { t, locale } = await pageT(user);
  let doc;
  try {
    doc = await myInvoice(user.userId, id);
  } catch (e) {
    if (e instanceof AppError) notFound();
    throw e;
  }
  return (
    <>
      <div className="page-head no-print">
        <div>
          <div className="crumbs"><Link href="/account/orders">{t('account.orders')}</Link></div>
          <h1>{doc.invoice.number}</h1>
          <div className="small muted">{doc.tenant.name}</div>
        </div>
        <PrintButton />
      </div>
      <InvoiceDocumentView doc={doc} tz={doc.tenant.timezone} locale={locale} />
    </>
  );
}
