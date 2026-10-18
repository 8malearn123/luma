'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch } from '@/lib/client/api';
import { useT } from '../I18n';

interface Status {
  status: string;
  targetStatus?: string;
  financialStatus?: string;
}

/**
 * Polls the server for a payment's verified outcome. The browser redirect from
 * the provider is never trusted; only server state (set by verified provider
 * events) is shown. Refreshes the page when the outcome is final.
 */
export function PaymentStatusPoller({ paymentId, bookingId }: { paymentId?: string; bookingId?: string }) {
  const t = useT();
  const router = useRouter();
  const [s, setS] = useState<Status | null>(null);
  useEffect(() => {
    let stop = false;
    let n = 0;
    const tick = async () => {
      try {
        let st: Status;
        if (paymentId) st = await apiFetch<Status>(`/api/v1/me/payments/${paymentId}`);
        else {
          const d = await apiFetch<{ booking: { status: string; financialStatus: string } }>(`/api/v1/me/bookings/${bookingId}`);
          st = { status: d.booking.status === 'pending_payment' ? 'processing' : 'succeeded', targetStatus: d.booking.status, financialStatus: d.booking.financialStatus };
        }
        if (stop) return;
        setS(st);
        if (['succeeded', 'failed', 'cancelled', 'needs_review', 'expired'].includes(st.status)) {
          router.refresh();
          return;
        }
      } catch {
        /* transient: keep polling */
      }
      if (!stop && n++ < 60) setTimeout(tick, n < 10 ? 2000 : 5000);
    };
    void tick();
    return () => {
      stop = true;
    };
  }, [paymentId, bookingId, router]);
  const st = s?.status ?? 'processing';
  const key = st === 'succeeded' ? 'pay.succeeded' : st === 'failed' || st === 'cancelled' || st === 'expired' ? 'pay.failed' : st === 'needs_review' ? 'pay.needs_review' : 'pay.processing';
  return (
    <div className="alert info sf-alert" role="status" aria-live="polite">
      {t(key)}
    </div>
  );
}
