import { NextResponse } from 'next/server';
import { api } from '@/server/http/handler';
import { processProviderEvent } from '@/server/payments/service';

const PROVIDERS = new Set(['sandbox', 'moyasar']);

/**
 * Provider webhooks. Authenticated by the provider signature / shared secret
 * (verified in processProviderEvent with the business account's secret), not
 * by cookies — hence allowCrossOrigin. Responses carry no detail.
 */
export const POST = api.public<{ provider: string }>(
  async (c) => {
    if (!PROVIDERS.has(c.params.provider)) return NextResponse.json({ ok: false }, { status: 404 });
    const raw = await c.req.text();
    if (raw.length > 256 * 1024) return NextResponse.json({ ok: false }, { status: 413 });
    const outcome = await processProviderEvent(c.params.provider, raw, c.req.headers);
    if (outcome === 'rejected') return NextResponse.json({ ok: false }, { status: 400 });
    // duplicate / ignored / unknown / mismatch are acknowledged so the provider stops retrying;
    // mismatches are flagged for human review internally.
    return NextResponse.json({ ok: true });
  },
  { allowCrossOrigin: true, rateLimit: [600, 60] },
);
