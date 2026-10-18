import { NextResponse, type NextRequest } from 'next/server';
import { env, isProduction } from '@/server/env';
import { processProviderEvent, sandboxEmit } from '@/server/payments/service';
import { sandboxPaymentForCustomer } from '@/server/booking/sandbox';
import { sessionUser } from '@/server/http/page';

/**
 * SANDBOX ONLY. Simulates the provider: emits a signed event and delivers it
 * to the same handler a real webhook uses, then redirects the browser back.
 * The return page still polls the server — the redirect proves nothing.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ paymentId: string }> }) {
  if (isProduction() || !env().PAYMENTS_SANDBOX_ENABLED) return new NextResponse('Not found', { status: 404 });
  const origin = req.headers.get('origin');
  if (origin && origin !== req.nextUrl.origin && origin !== new URL(env().APP_BASE_URL).origin) return new NextResponse('Forbidden', { status: 403 });
  const { paymentId } = await params;
  const user = await sessionUser();
  if (!user) return new NextResponse('Not found', { status: 404 });
  const p = await sandboxPaymentForCustomer(user.userId, paymentId);
  if (!p) return new NextResponse('Not found', { status: 404 });
  const form = await req.formData();
  const outcome = form.get('outcome') === 'fail' ? 'failed' : 'succeeded';
  const ev = await sandboxEmit(paymentId, outcome);
  await processProviderEvent('sandbox', ev.body, ev.headers);
  return NextResponse.redirect(new URL(p.returnPath, req.url), 303);
}
