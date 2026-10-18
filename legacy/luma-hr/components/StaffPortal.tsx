'use client';
/**
 * StaffPortal — the employee's mobile-first self-service view.
 * One snapshot RPC (`my_portal_snapshot`) hydrates all three sections:
 *   1. upcoming confirmed bookings
 *   2. month-to-date earnings (base + live commission)
 *   3. leave requests: active list + submission form
 * The submit flow surfaces the DB's overlap rejection as a friendly
 * message instead of letting duplicate/overlapping requests through.
 */
import { useCallback, useEffect, useState } from 'react';
import { LEAVE_LABELS, type LeaveType } from '@/luma-hr/lib/types';
import { createBrowserClient } from '@supabase/ssr';

interface Snapshot {
  staff_id: string;
  full_name: string;
  upcoming: { id: string; client: string; service: string; starts_at: string; ends_at: string; price: number }[];
  month_payout: {
    base_salary: number; commission: number; total_payout: number;
    bookings_count: number; gross_sales: number;
  };
  pending_leaves: { id: string; start_date: string; end_date: string; type: LeaveType; status: string }[];
}

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);

const fmtSAR = (n: number) =>
  new Intl.NumberFormat('ar-SA', { maximumFractionDigits: 0 }).format(n) + ' ر.س';
const fmtDay = (iso: string) =>
  new Date(iso).toLocaleDateString('ar-SA', { weekday: 'long', day: 'numeric', month: 'long' });
const fmtTime = (iso: string) =>
  new Date(iso).toLocaleTimeString('ar-SA', { hour: 'numeric', minute: '2-digit' });

export default function StaffPortal() {
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [form, setForm] = useState({ start_date: '', end_date: '', type: 'annual' as LeaveType, reason: '' });
  const [sending, setSending] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    const { data } = await supabase.rpc('my_portal_snapshot');
    if (data?.[0]) setSnap(data[0] as Snapshot);
  }, []);
  useEffect(() => { load(); }, [load]);

  async function submitLeave(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    if (!form.start_date || !form.end_date)
      return setMsg({ ok: false, text: 'حدّدي تاريخ البداية والنهاية' });
    if (form.end_date < form.start_date)
      return setMsg({ ok: false, text: 'تاريخ النهاية قبل البداية' });

    setSending(true);
    const r = await fetch('/api/hr/leaves', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    });
    setSending(false);

    if (r.ok) {
      setMsg({ ok: true, text: 'أُرسل طلبك — بانتظار موافقة الإدارة ✓' });
      setForm({ start_date: '', end_date: '', type: 'annual', reason: '' });
      load(); // refresh the active-requests list
    } else {
      setMsg({ ok: false, text: (await r.json()).error ?? 'تعذر إرسال الطلب' });
    }
  }

  if (!snap)
    return <div dir="rtl" className="grid min-h-screen place-items-center bg-[#0C0B0E] text-[#86818d]">جارٍ التحميل…</div>;

  const p = snap.month_payout;

  return (
    <div dir="rtl" className="mx-auto min-h-screen max-w-md bg-[#0C0B0E] p-4 pb-16 text-[#f6f2ec]">
      <header className="mb-5 flex items-center gap-3">
        <span className="grid size-12 place-items-center rounded-full border border-[#846a38] bg-[#1E1C24] text-lg text-[#ccab64]">
          {snap.full_name.charAt(0)}
        </span>
        <div>
          <h1 className="font-bold">أهلاً {snap.full_name} 👋</h1>
          <p className="text-xs text-[#86818d]">بوابة الموظفة · لوما</p>
        </div>
      </header>

      {/* ── month earnings ── */}
      <section className="mb-5 rounded-2xl border border-[#846a38]/50 bg-gradient-to-bl from-[#1E1C24] to-[#15141A] p-5">
        <p className="text-xs text-[#e6ce95]">أرباحكِ هذا الشهر (حتى الآن)</p>
        <p className="mt-1 text-3xl font-bold text-[#ccab64]">{fmtSAR(p.total_payout)}</p>
        <div className="mt-4 grid grid-cols-3 gap-2 text-center text-[11px]">
          <div className="rounded-lg bg-[#0C0B0E]/60 p-2">
            <div className="text-[#e6ce95]">{fmtSAR(p.base_salary)}</div>
            <div className="mt-0.5 text-[#86818d]">أساسي</div>
          </div>
          <div className="rounded-lg bg-[#0C0B0E]/60 p-2">
            <div className="text-[#e6ce95]">{fmtSAR(p.commission)}</div>
            <div className="mt-0.5 text-[#86818d]">عمولات</div>
          </div>
          <div className="rounded-lg bg-[#0C0B0E]/60 p-2">
            <div className="text-[#e6ce95]">{p.bookings_count}</div>
            <div className="mt-0.5 text-[#86818d]">حجز مكتمل</div>
          </div>
        </div>
      </section>

      {/* ── upcoming bookings ── */}
      <section className="mb-5">
        <h2 className="mb-2 text-sm font-bold text-[#ccab64]">مواعيدكِ القادمة</h2>
        <div className="grid gap-2">
          {snap.upcoming.map(b => (
            <article key={b.id} className="flex items-center gap-3 rounded-xl border border-[#26242d] bg-[#15141A] p-3">
              <div className="min-w-[54px] text-center">
                <div className="text-sm font-bold text-[#ccab64]">{fmtTime(b.starts_at)}</div>
                <div className="text-[10px] text-[#86818d]">{fmtDay(b.starts_at)}</div>
              </div>
              <div className="h-8 w-px bg-[#26242d]" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold">{b.client}</div>
                <div className="truncate text-[11px] text-[#86818d]">{b.service}</div>
              </div>
              <div className="text-sm text-[#e6ce95]">{fmtSAR(b.price)}</div>
            </article>
          ))}
          {snap.upcoming.length === 0 &&
            <p className="rounded-xl border border-dashed border-[#26242d] p-5 text-center text-xs text-[#86818d]">
              لا توجد مواعيد قادمة 🎉
            </p>}
        </div>
      </section>

      {/* ── leaves ── */}
      <section>
        <h2 className="mb-2 text-sm font-bold text-[#ccab64]">إجازاتي</h2>

        {snap.pending_leaves.length > 0 && (
          <div className="mb-3 grid gap-2">
            {snap.pending_leaves.map(l => (
              <div key={l.id} className="flex items-center justify-between rounded-xl border border-[#26242d] bg-[#15141A] p-3 text-xs">
                <span>{LEAVE_LABELS[l.type]} · {l.start_date} ← {l.end_date}</span>
                <span className={l.status === 'approved' ? 'text-emerald-300' : 'text-amber-300'}>
                  {l.status === 'approved' ? 'معتمدة ✓' : 'قيد المراجعة'}
                </span>
              </div>
            ))}
          </div>
        )}

        <form onSubmit={submitLeave} className="rounded-2xl border border-[#26242d] bg-[#15141A] p-4">
          <h3 className="mb-3 text-xs font-bold text-[#e6ce95]">طلب إجازة جديدة</h3>
          <div className="mb-2 grid grid-cols-2 gap-2">
            <label className="text-[11px] text-[#86818d]">من
              <input type="date" required value={form.start_date}
                onChange={e => setForm(f => ({ ...f, start_date: e.target.value }))}
                className="mt-1 w-full rounded-lg border border-[#26242d] bg-[#0C0B0E] p-2.5 text-sm text-[#f6f2ec]" />
            </label>
            <label className="text-[11px] text-[#86818d]">إلى
              <input type="date" required value={form.end_date}
                onChange={e => setForm(f => ({ ...f, end_date: e.target.value }))}
                className="mt-1 w-full rounded-lg border border-[#26242d] bg-[#0C0B0E] p-2.5 text-sm text-[#f6f2ec]" />
            </label>
          </div>
          <label className="text-[11px] text-[#86818d]">النوع
            <select value={form.type}
              onChange={e => setForm(f => ({ ...f, type: e.target.value as LeaveType }))}
              className="mt-1 mb-2 w-full rounded-lg border border-[#26242d] bg-[#0C0B0E] p-2.5 text-sm">
              {Object.entries(LEAVE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </label>
          <textarea rows={2} placeholder="السبب (اختياري)…" value={form.reason}
            onChange={e => setForm(f => ({ ...f, reason: e.target.value }))}
            className="mb-3 w-full rounded-lg border border-[#26242d] bg-[#0C0B0E] p-2.5 text-sm" />

          {msg && (
            <p className={`mb-3 rounded-lg p-2.5 text-center text-xs
              ${msg.ok ? 'bg-emerald-900/30 text-emerald-300' : 'bg-rose-900/30 text-rose-300'}`}>
              {msg.text}
            </p>
          )}

          <button disabled={sending}
            className="w-full rounded-xl bg-gradient-to-l from-[#dbbd81] via-[#ccab64] to-[#9c8047] py-3 text-sm font-bold text-[#131217] hover:brightness-110 disabled:opacity-50">
            {sending ? 'جارٍ الإرسال…' : 'إرسال الطلب'}
          </button>
        </form>
      </section>
    </div>
  );
}
