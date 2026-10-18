import { api } from '@/server/http/handler';
import { tx } from '@/server/tenancy/context';
import { verifyChain } from '@/server/finance/invoices';

/** Internal tamper-evidence check of the invoice counter + hash chain. */
export const GET = api.tenant('finance.view', async (c) => tx(c.t, (db) => verifyChain(db)));
