'use client';
/**
 * OwnerHRDashboard — the salon owner's HR control room.
 * Tabs: staff profiles · leave approvals · unified shift calendar · payroll.
 * Styling follows the LUMA identity (Eclipse dark: obsidian + gold) with
 * Tailwind utility classes only — no external UI kit.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { PayrollRow, StaffLeave, StaffProfile, StaffSchedule } from '@/luma-hr/lib/types';
import { LEAVE_LABELS, ROLE_LABELS, WEEKDAYS_AR } from '@/luma-hr/lib/types';

type StaffWithRelations = StaffProfile & {
  staff_commissions: { base_salary: number; commission_type: string; commission_value: number }[];
  staff_schedules: StaffSchedule[];
};
type LeaveWithStaff = StaffLeave & { staff_profiles: { full_name: string; role: string } };
type Tab = 'staff' | 'leaves' | 'calendar' | 'payroll';

const fmtSAR = (n: number) =>
  new Intl.NumberFormat('ar-SA', { maximumFractionDigits: 0 }).format(n) + ' ر.س';

export default function OwnerHRDashboard({ salonId }: { salonId: string }) {
  const [tab, setTab] = useState<Tab>('staff');
  const [staff, setStaff] = useState<StaffWithRelations[]>([]);
  const [leaves, setLeaves] = useState<LeaveWithStaff[]>([]);
  const [payroll, setPayroll] = useState<PayrollRow[]>([]);
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const notify = (m: string) => { setToast(m); setTimeout(() => setToast(null), 3000); };

  /** One loader per data source; each tab refreshes what it shows. */
  const loadStaff = useCallback(async () => {
    const r = await fetch(`/api/hr/staff?salon_id=${salonId}`);
    const j = await r.json();
    if (r.ok) setStaff(j.staff);
  }, [salonId]);

  const loadLeaves = useCallback(async () => {
    const r = await fetch(`/api/hr/leaves?salon_id=${salonId}`);
    const j = await r.json();
    if (r.ok) setLeaves(j.leaves);
  }, [salonId]);

  const loadPayroll = useCallback(async () => {
    const r = await fetch(`/api/hr/payroll?salon_id=${salonId}&month=${month}`);
    const j = await r.json();
    if (r.ok) setPayroll(j.payroll);
  }, [salonId, month]);

  useEffect(() => { loadStaff(); loadLeaves(); }, [loadStaff, loadLeaves]);
  useEffect(() => { if (tab === 'payroll') loadPayroll(); }, [tab, loadPayroll]);

  /** Approve / reject with optimistic UI + rollback on failure. */
  async function reviewLeave(id: string, action: 'approve' | 'reject') {
    setBusy(true);
    const prev = leaves;
    setLeaves(ls => ls.map(l => l.id === id
      ? { ...l, status: action === 'approve' ? 'approved' : 'rejected' } : l));
    const r = await fetch(`/api/hr/leaves/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action }),
    });
    setBusy(false);
    if (!r.ok) {
      setLeaves(prev); // rollback
      notify((await r.json()).error ?? 'تعذر تنفيذ الإجراء');
    } else {
      notify(action === 'approve'
        ? 'تم اعتماد الإجازة — حُظرت مواعيدها من صفحة الحجز تلقائياً ✓'
        : 'تم رفض الطلب');
    }
  }

  const pending = useMemo(() => leaves.filter(l => l.status === 'pending'), [leaves]);
  const totals = useMemo(() => payroll.reduce((t, r) => t + Number(r.total_payout), 0), [payroll]);

  const TABS: [Tab, string][] = [
    ['staff', `الطاقم (${staff.length})`],
    ['leaves', `طلبات الإجازة${pending.length ? ` · ${pending.length}` : ''}`],
    ['calendar', 'جدول الدوام'],
    ['payroll', 'الرواتب والعمولات'],
  ];

  return (
    <div dir="rtl" className="min-h-screen bg-[#0C0B0E] text-[#f6f2ec] p-6 font-sans">
      <header className="mb-6">
        <h1 className="text-2xl font-bold">الموارد البشرية</h1>
        <p className="text-sm text-[#86818d] mt-1">إدارة الطاقم، الإجازات، الدوام، والرواتب</p>
      </header>

      <nav className="flex gap-2 border-b border-[#26242d] mb-6 overflow-x-auto">
        {TABS.map(([k, label]) => (
          <button key={k} onClick={() => setTab(k)}
            className={`px-4 py-2.5 text-sm font-semibold whitespace-nowrap border-b-2 transition
              ${tab === k ? 'border-[#ccab64] text-[#ccab64]' : 'border-transparent text-[#86818d] hover:text-[#e6ce95]'}`}>
            {label}
          </button>
        ))}
      </nav>

      {/* ─── STAFF ─── */}
      {tab === 'staff' && (
        <section className="grid gap-3">
          {staff.map(s => {
            const c = s.staff_commissions[0];
            return (
              <article key={s.id}
                className="flex items-center gap-4 rounded-xl border border-[#26242d] bg-[#15141A] p-4">
                <span className="grid size-12 shrink-0 place-items-center rounded-full border border-[#846a38] bg-[#1E1C24] text-lg text-[#ccab64]">
                  {s.full_name.charAt(0)}
                </span>
                <div className="min-w-0 flex-1">
                  <h3 className="truncate font-semibold">{s.full_name}</h3>
                  <p className="text-xs text-[#e6ce95]">
                    {ROLE_LABELS[s.role]}{s.specialties.length > 0 && ` · ${s.specialties.join(' · ')}`}
                  </p>
                </div>
                {c && (
                  <div className="hidden text-left sm:block">
                    <div className="text-sm text-[#ccab64]">{fmtSAR(c.base_salary)}</div>
                    <div className="text-[11px] text-[#86818d]">
                      + {c.commission_value}{c.commission_type === 'percentage' ? '٪ عمولة' : ' ر.س/حجز'}
                    </div>
                  </div>
                )}
                <span className={`rounded-full px-3 py-1 text-[11px]
                  ${s.status === 'active' ? 'bg-emerald-900/40 text-emerald-300' : 'bg-zinc-800 text-zinc-400'}`}>
                  {s.status === 'active' ? 'نشطة' : 'موقوفة'}
                </span>
              </article>
            );
          })}
          {staff.length === 0 && <Empty msg="لا يوجد موظفات بعد — أضيفي أول عضوة من زر الإضافة." />}
        </section>
      )}

      {/* ─── LEAVES ─── */}
      {tab === 'leaves' && (
        <section className="grid gap-3">
          {leaves.map(l => (
            <article key={l.id} className="rounded-xl border border-[#26242d] bg-[#15141A] p-4">
              <div className="flex flex-wrap items-center gap-3">
                <div className="min-w-0 flex-1">
                  <h3 className="font-semibold">{l.staff_profiles.full_name}</h3>
                  <p className="mt-0.5 text-xs text-[#86818d]">
                    {LEAVE_LABELS[l.type]} · {l.start_date} ← {l.end_date}
                    {l.reason && <span className="mx-2 text-[#e6ce95]">«{l.reason}»</span>}
                  </p>
                </div>
                {l.status === 'pending' ? (
                  <div className="flex gap-2">
                    <button disabled={busy} onClick={() => reviewLeave(l.id, 'approve')}
                      className="rounded-lg bg-gradient-to-l from-[#dbbd81] to-[#9c8047] px-4 py-2 text-xs font-bold text-[#131217] hover:brightness-110 disabled:opacity-50">
                      اعتماد
                    </button>
                    <button disabled={busy} onClick={() => reviewLeave(l.id, 'reject')}
                      className="rounded-lg border border-[#7c4a55] px-4 py-2 text-xs font-bold text-[#e29aa6] hover:bg-[#7c4a55]/20 disabled:opacity-50">
                      رفض
                    </button>
                  </div>
                ) : (
                  <StatusPill status={l.status} />
                )}
              </div>
            </article>
          ))}
          {leaves.length === 0 && <Empty msg="لا توجد طلبات إجازة." />}
        </section>
      )}

      {/* ─── UNIFIED SHIFT CALENDAR ─── */}
      {tab === 'calendar' && (
        <section className="overflow-x-auto rounded-xl border border-[#26242d]">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="bg-[#191820] text-[#ccab64]">
              <tr>
                <th className="p-3 text-right font-semibold">الموظفة</th>
                {WEEKDAYS_AR.map(d => <th key={d} className="p-3 font-semibold">{d}</th>)}
              </tr>
            </thead>
            <tbody>
              {staff.map(s => (
                <tr key={s.id} className="border-t border-[#1e1d24]">
                  <td className="p-3 font-semibold">{s.full_name}</td>
                  {[0, 1, 2, 3, 4, 5, 6].map(d => {
                    const row = s.staff_schedules.find(x => x.weekday === d);
                    return (
                      <td key={d} className="p-2 text-center">
                        {!row || row.is_day_off
                          ? <span className="text-xs text-[#58545f]">إجازة</span>
                          : <span dir="ltr" className="rounded-md bg-[#1E1C24] px-2 py-1 text-[11px] text-[#e6ce95]">
                              {row.shift_start?.slice(0, 5)}–{row.shift_end?.slice(0, 5)}
                            </span>}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {/* ─── PAYROLL ─── */}
      {tab === 'payroll' && (
        <section>
          <div className="mb-4 flex items-center gap-3">
            <input type="month" value={month} onChange={e => setMonth(e.target.value)}
              className="rounded-lg border border-[#26242d] bg-[#15141A] px-3 py-2 text-sm" />
            <span className="mr-auto rounded-lg border border-[#846a38] px-4 py-2 text-sm text-[#ccab64]">
              إجمالي الرواتب: <b>{fmtSAR(totals)}</b>
            </span>
          </div>
          <div className="overflow-x-auto rounded-xl border border-[#26242d]">
            <table className="w-full min-w-[760px] text-sm">
              <thead className="bg-[#191820] text-[#ccab64]">
                <tr>
                  {['الموظفة', 'الراتب الأساسي', 'الحجوزات المكتملة', 'المبيعات', 'العمولة', 'الصافي'].map(h =>
                    <th key={h} className="p-3 text-right font-semibold">{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {payroll.map(r => (
                  <tr key={r.staff_id} className="border-t border-[#1e1d24]">
                    <td className="p-3 font-semibold">{r.full_name}
                      <span className="mr-2 text-[11px] text-[#86818d]">{ROLE_LABELS[r.role]}</span></td>
                    <td className="p-3">{fmtSAR(r.base_salary)}</td>
                    <td className="p-3">{r.bookings_count}</td>
                    <td className="p-3">{fmtSAR(r.gross_sales)}</td>
                    <td className="p-3 text-[#e6ce95]">{fmtSAR(r.commission)}
                      <span className="mr-1 text-[10px] text-[#86818d]">
                        ({r.commission_type === 'percentage' ? `${r.commission_value}٪` : `${r.commission_value} ر.س/حجز`})
                      </span></td>
                    <td className="p-3 font-bold text-[#ccab64]">{fmtSAR(r.total_payout)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {toast && (
        <div className="fixed bottom-6 right-1/2 translate-x-1/2 rounded-full border border-[#846a38] bg-[#15141A] px-6 py-3 text-sm text-[#ccab64] shadow-2xl">
          {toast}
        </div>
      )}
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const map: Record<string, [string, string]> = {
    approved: ['معتمدة', 'bg-emerald-900/40 text-emerald-300'],
    rejected: ['مرفوضة', 'bg-rose-900/40 text-rose-300'],
    cancelled: ['ملغاة', 'bg-zinc-800 text-zinc-400'],
    pending: ['قيد المراجعة', 'bg-amber-900/40 text-amber-300'],
  };
  const [label, cls] = map[status] ?? map.pending;
  return <span className={`rounded-full px-3 py-1 text-[11px] ${cls}`}>{label}</span>;
}

function Empty({ msg }: { msg: string }) {
  return <p className="rounded-xl border border-dashed border-[#26242d] p-8 text-center text-sm text-[#86818d]">{msg}</p>;
}
