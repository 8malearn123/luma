import { NextResponse } from 'next/server';
import { api, uuid } from '@/server/http/handler';
import { notFound } from '@/server/errors';
import { tx } from '@/server/tenancy/context';
import { renderInvoicePdf } from '@/server/finance/invoices';

/** Tenant-scoped, membership-protected download (RLS: other tenants' invoice ids are 404). */
export const GET = api.tenant<{ id: string }>(['finance.view', 'payments.collect'], async (c) => {
  if (!uuid.safeParse(c.params.id).success) throw notFound();
  const { number, pdf } = await tx(c.t, (db) => renderInvoicePdf(db, c.params.id));
  return new NextResponse(new Uint8Array(pdf), {
    headers: { 'content-type': 'application/pdf', 'content-disposition': `inline; filename="${number}.pdf"`, 'cache-control': 'private, no-store' },
  });
});
