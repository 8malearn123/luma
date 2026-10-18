import { api } from '@/server/http/handler';
import { tx } from '@/server/tenancy/context';
import { listInvoices } from '@/server/finance/invoices';

export const GET = api.tenant(['finance.view', 'payments.collect'], async (c) => ({ items: await tx(c.t, (db) => listInvoices(db)) }));
