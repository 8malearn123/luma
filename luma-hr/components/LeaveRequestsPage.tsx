'use client';
/**
 * LeaveRequestsPage — upgraded leave workflow.
 *  • Remaining annual balance chip next to every employee name.
 *  • Approving first checks /conflicts: if active bookings collide with
 *    the window, a resolution modal offers auto-distribute or
 *    notify-&-reschedule. Approval + resolution happen back-to-back so
 *    the schedule grid and the public booking engine are in sync the
 *    moment the modal closes (the DB availability functions read leave
 *    status directly — no cache to invalidate).
 */
import { useCallback, useEffect, useState } from 'react';
import { LEAVE_LABELS } from '@/luma-hr/lib/types';

interface LeaveRow {
  id: string; staff_id: string; start_date: string; end_date: string;
  type: keyof typeof LEAVE_LABELS; status: string; reason: string | null;
  staff_profiles: { full_name: string; role: string };
  balance?: { remaining: number };
}
interface Conflict {
  booking_id: string; client_name: string; client_phone: string | null;
  service_name: string; starts_at: string; price: number;
}

const GOLD = 'from-[#e5c158] via-[#d4af37] to-[#a8862e]';

export default function LeaveRequestsPage({ salonId }: { salonId: string }) {
  const [leaves, setLeaves] = useState<LeaveRow[]>([]);
  const [modal, setModal] = useState<{ leave: LeaveRow; conflicts: Conflict[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const say = (m: string) => { setToast(m); setTimeout(() => setToast(null), 3800); };

  const load = useCallback(async () => {
    const r = await fetch(`/api/hr/leaves?salon_id=${salonId}`);
    if (!r.ok) return;
    const { leaves } = await r.json();
    // hydrate remaining balances in parallel (one lightweight RPC each)
    const withBalance = await Promise.all(leaves.map(async (l: LeaveRow) => {
      const b = await fetch(`/api/hr/leaves/balance?staff_id=${l.staff_id}`).then(x => x.json()).catch(() => null);
      return { ...l, balance: b?.balance };
    }));
    setLeaves(withBalance);
  }, [salonId]);
  useEffect(() => { load(); }, [load]);

  /** Approve flow: check conflicts first, open the resolution modal if any. */
  async function approve(leave: LeaveRow) {
    setBusy(true);
    const { conflicts } = await fetch(`/api/hr/leaves/${leave.id}/conflicts`).then(r => r.json());
    const r = await fetch(`/api/hr/leaves/${leave.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'approve' }),
    });
    setBusy(false);
    if (!r.ok) return say((await r.json()).error ?? 'تعذر الاعتماد');

    if (conflicts?.length) setModal({ leave, conflicts });
    else say('تم اعتماد الإجازة — حُدّث جدول الدوام وحُظرت المواعيد في صفحة الحجز تلقائياً ✓');
    load();
  }

  async function reject(leave: LeaveRow) {
    setBusy(true);
    await fetch(`/api/hr/leaves/${leave.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'reject' }),
    });
    setBusy(false); say('تم رفض الطلب'); load();
  }

  /** Resolution modal actions. */
  async function resolve(action: 'distribute' | 'notify') {
    if (!modal) return;
    setBusy(true);
    const r = await fetch(`/api/hr/leaves/${modal.leave.id}/conflicts`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action }),
    });
    const j = await r.json();
    setBusy(false); setModal(null);
    if (!r.ok) return say(j.error ?? 'تعذر تنفيذ الإجراء');
    say(action === 'distribute'
      ? `وُزّع ${j.rerouted} حجزاً على الزميلات تلقائياً${j.needs_reschedule ? ` — ${j.needs_reschedule} بحاجة لإعادة جدولة يدوية` : ''} ✓`
      : `أُرسل إشعار الاعتذار وإعادة الجدولة لـ ${j.notified} عميلة ✓`);
  }

  return (
    <div dir="rtl" className="min-h-screen bg-[#09090b] p-6 text-zinc-100">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">طلبات الإجازة</h1>
          <p className="mt-1 text-sm text-zinc-500">الاعتماد يُحدّث جدول الدوام ويحظر مواعيد الحجز تلقائياً</p>
        </div>
      </header>

      <section className="grid gap-3">
        {leaves.map(l => (
          <article key={l.id} className="rounded-2xl border border-zinc-800 bg-[#111113] p-4">
            <div className="flex flex-wrap items-center gap-3">
              <span className="grid size-11 shrink-0 place-items-center rounded-full border border-[#a8862e]/60 bg-zinc-900 text-[#e5c158]">
                {l.staff_profiles.full_name.charAt(0)}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-semibold">{l.staff_profiles.full_name}</h3>
                  {/* remaining annual balance chip */}
                  {l.balance && (
                    <span className="rounded-full border border-[#a8862e]/40 bg-[#d4af37]/10 px-2.5 py-0.5 text-[11px] text-[#e5c158]">
                      الرصيد المتبقي: {l.balance.remaining} يوماً
                    </span>
                  )}
                </div>
                <p className="mt-1 text-xs text-zinc-500">
                  {LEAVE_LABELS[l.type]} · <bdo dir="ltr">{l.start_date}</bdo> ← <bdo dir="ltr">{l.end_date}</bdo>
                  {l.reason && <span className="mx-2 text-zinc-400">«{l.reason}»</span>}
                </p>
              </div>
              {l.status === 'pending' ? (
                <div className="flex gap-2">
                  <button disabled={busy} onClick={() => approve(l)}
                    className={`rounded-xl bg-gradient-to-l ${GOLD} px-5 py-2 text-xs font-bold text-black hover:brightness-110 disabled:opacity-40`}>
                    اعتماد
                  </button>
                  <button disabled={busy} onClick={() => reject(l)}
                    className="rounded-xl border border-rose-900 px-5 py-2 text-xs font-bold text-rose-300 hover:bg-rose-950/40 disabled:opacity-40">
                    رفض
                  </button>
                </div>
              ) : (
                <span className={`rounded-full px-3 py-1 text-[11px] ${
                  l.status === 'approved' ? 'bg-emerald-950 text-emerald-300'
                  : l.status === 'rejected' ? 'bg-rose-950 text-rose-300'
                  : 'bg-zinc-800 text-zinc-400'}`}>
                  {l.status === 'approved' ? 'معتمدة' : l.status === 'rejected' ? 'مرفوضة' : 'ملغاة'}
                </span>
              )}
            </div>
          </article>
        ))}
      </section>

      {/* ── booking-conflicts resolution modal ── */}
      {modal && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4"
             onClick={e => e.target === e.currentTarget && setModal(null)}>
          <div className="w-full max-w-lg rounded-2xl border border-[#a8862e]/40 bg-gradient-to-b from-[#141414] to-[#0a0a0a] p-6 shadow-2xl shadow-black">
            <div className="mb-1 text-3xl">📅</div>
            <h2 className="text-lg font-bold text-[#e5c158]">هناك حجوزات نشطة خلال هذه الفترة</h2>
            <p className="mt-1 text-sm text-zinc-400">
              لدى {modal.leave.staff_profiles.full_name} {modal.conflicts.length} حجزاً مؤكداً
              يتقاطع مع إجازتها — اختاري طريقة المعالجة:
            </p>

            <ul className="mt-4 max-h-44 divide-y divide-zinc-800 overflow-y-auto rounded-xl border border-zinc-800 bg-black/40">
              {modal.conflicts.map(c => (
                <li key={c.booking_id} className="flex items-center gap-3 p-3 text-sm">
                  <span className="text-[#e5c158]" dir="ltr">
                    {new Date(c.starts_at).toLocaleString('ar-SA', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}
                  </span>
                  <span className="flex-1 truncate">{c.client_name} · {c.service_name}</span>
                  <span className="text-zinc-500">{c.price} ر.س</span>
                </li>
              ))}
            </ul>

            <div className="mt-5 grid gap-2">
              <button disabled={busy} onClick={() => resolve('distribute')}
                className={`rounded-xl bg-gradient-to-l ${GOLD} py-3 text-sm font-bold text-black hover:brightness-110 disabled:opacity-40`}>
                توزيع الحجوزات تلقائياً على زميلات بنفس التخصص
              </button>
              <button disabled={busy} onClick={() => resolve('notify')}
                className="rounded-xl border border-zinc-700 py-3 text-sm font-semibold text-zinc-200 hover:bg-zinc-900 disabled:opacity-40">
                إرسال إشعار اعتذار وإعادة جدولة للعملاء
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className="fixed bottom-6 right-1/2 z-50 translate-x-1/2 rounded-full border border-[#a8862e]/50 bg-[#141414] px-6 py-3 text-sm text-[#e5c158] shadow-2xl">
          {toast}
        </div>
      )}
    </div>
  );
}
