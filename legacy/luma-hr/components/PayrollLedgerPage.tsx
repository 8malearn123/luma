'use client';
/**
 * PayrollLedgerPage — from "estimated tracker" to absolute-truth ledger.
 *  • Every row comes from calculate_monthly_payout_v2: service commission
 *    (tiered), product commission, 100% digital tips, bonuses, and سلف /
 *    deductions — all sourced from real completed bookings, POS product
 *    sales and the adjustments ledger.
 *  • "تصفية واعتماد الرواتب" freezes the month server-side (immutable
 *    settlement + per-employee slips ready for PDF) and blocks any
 *    further adjustment edits for that month.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';

interface LedgerRow {
  staff_id: string; full_name?: string; month: string; base_salary: number;
  service_gross: number; service_rate: number; service_commission: number;
  product_gross: number; product_rate: number; product_commission: number;
  tips: number; bonuses: number; advances: number; deductions: number;
  late_minutes: number; absences: number; net_payout: number;
}

const GOLD = 'from-[#e5c158] via-[#d4af37] to-[#a8862e]';
const sar = (n: number) => new Intl.NumberFormat('ar-SA', { maximumFractionDigits: 0 }).format(n) + ' ر.س';

export default function PayrollLedgerPage({ salonId }: { salonId: string }) {
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [rows, setRows] = useState<LedgerRow[]>([]);
  const [closed, setClosed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const say = (m: string) => { setToast(m); setTimeout(() => setToast(null), 4200); };

  const load = useCallback(async () => {
    const r = await fetch(`/api/hr/payroll?salon_id=${salonId}&month=${month}&v=2`);
    if (!r.ok) return;
    const j = await r.json();
    setRows(j.payroll); setClosed(!!j.closed);
  }, [salonId, month]);
  useEffect(() => { load(); }, [load]);

  const total = useMemo(() => rows.reduce((t, r) => t + Number(r.net_payout), 0), [rows]);

  /** Record a cash advance (سلفة) — lands in staff_adjustments and is
   *  deducted from the net immediately on reload. */
  async function addAdvance(row: LedgerRow) {
    const amount = Number(prompt(`مبلغ السلفة لـ ${row.full_name} (ر.س):`) ?? 0);
    if (!amount || amount <= 0) return;
    const r = await fetch('/api/hr/adjustments', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ staff_id: row.staff_id, month: `${month}-01`, kind: 'advance', amount }),
    });
    r.ok ? (say('سُجّلت السلفة وخُصمت من الصافي ✓'), load()) : say((await r.json()).error);
  }

  /** Month-end settlement — the one-way door. */
  async function closeMonth() {
    if (!confirm(`تصفية واعتماد رواتب شهر ${month}؟\nبعد الاعتماد تُجمَّد الأرقام نهائياً وتُصدر قسائم الرواتب.`)) return;
    setBusy(true);
    const r = await fetch('/api/hr/payroll/close', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ salon_id: salonId, month }),
    });
    setBusy(false);
    const j = await r.json();
    if (!r.ok) return say(j.error ?? 'تعذر إغلاق الشهر');
    setClosed(true);
    say(`تمت التصفية ✓ صدرت ${j.slips.length} قسيمة راتب وحُدّث النظام المحاسبي`);
  }

  return (
    <div dir="rtl" className="min-h-screen bg-[#09090b] p-6 text-zinc-100">
      <header className="mb-6 flex flex-wrap items-center gap-3">
        <div className="ml-auto">
          <h1 className="text-2xl font-bold">الرواتب والعمولات</h1>
          <p className="mt-1 text-sm text-zinc-500">سجل نهائي من الحجوزات المكتملة ومبيعات المنتجات — لا تقديرات</p>
        </div>
        <input type="month" value={month} onChange={e => setMonth(e.target.value)}
          className="rounded-xl border border-zinc-800 bg-[#111113] px-3 py-2 text-sm" />
        <div className="rounded-xl border border-[#a8862e]/50 px-4 py-2 text-sm text-[#e5c158]">
          الإجمالي: <b>{sar(total)}</b>
        </div>
        {closed ? (
          <span className="rounded-xl bg-emerald-950 px-4 py-2 text-sm font-bold text-emerald-300">
            الشهر مُصفّى ومعتمد ✓
          </span>
        ) : (
          <button disabled={busy || rows.length === 0} onClick={closeMonth}
            className={`rounded-xl bg-gradient-to-l ${GOLD} px-5 py-2.5 text-sm font-bold text-black hover:brightness-110 disabled:opacity-40`}>
            تصفية واعتماد الرواتب
          </button>
        )}
      </header>

      <div className="overflow-x-auto rounded-2xl border border-zinc-800">
        <table className="w-full min-w-[1080px] text-sm">
          <thead className="bg-[#111113] text-[#e5c158]">
            <tr>{['الموظفة', 'الأساسي', 'مبيعات الخدمات', 'عمولة الخدمات', 'مبيعات المنتجات', 'عمولة المنتجات', 'بقشيش إلكتروني', 'سلف وخصومات', 'الحضور', 'الصافي', ''].map(h =>
              <th key={h} className="whitespace-nowrap p-3 text-right font-semibold">{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.staff_id} className="border-t border-zinc-800/70">
                <td className="p-3 font-semibold">{r.full_name}</td>
                <td className="p-3">{sar(r.base_salary)}</td>
                <td className="p-3">{sar(r.service_gross)}</td>
                <td className="p-3 text-[#e8d9a8]">
                  {sar(r.service_commission)}
                  <span className="mr-1 text-[10px] text-zinc-500">({r.service_rate}٪{Number(r.service_rate) !== 10 ? ' · شريحة' : ''})</span>
                </td>
                <td className="p-3">{sar(r.product_gross)}</td>
                <td className="p-3 text-[#e8d9a8]">
                  {sar(r.product_commission)}
                  <span className="mr-1 text-[10px] text-zinc-500">({r.product_rate}٪)</span>
                </td>
                {/* tips pass through at 100% — no commission math touches them */}
                <td className="p-3 text-emerald-300">{sar(r.tips)}</td>
                <td className="p-3 text-rose-300">
                  −{sar(Number(r.advances) + Number(r.deductions))}
                  {!closed && (
                    <button onClick={() => addAdvance(r)}
                      className="mr-2 rounded-md border border-zinc-700 px-2 py-0.5 text-[10px] text-zinc-300 hover:bg-zinc-800">
                      + سلفة
                    </button>
                  )}
                </td>
                <td className="p-3 text-[11px] text-zinc-400">
                  {r.late_minutes > 0 || r.absences > 0
                    ? <span className="text-rose-300/90">{r.late_minutes} د تأخير · {r.absences} غياب</span>
                    : <span className="text-emerald-400/80">منتظم ✓</span>}
                </td>
                <td className="p-3 text-base font-bold text-[#e5c158]">{sar(r.net_payout)}</td>
                <td className="p-3">
                  {closed && (
                    <a href={`/api/hr/payroll/slip?staff_id=${r.staff_id}&month=${month}`}
                       className="text-[11px] text-zinc-400 underline hover:text-[#e5c158]">
                      قسيمة PDF
                    </a>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {toast && (
        <div className="fixed bottom-6 right-1/2 z-50 translate-x-1/2 rounded-full border border-[#a8862e]/50 bg-[#141414] px-6 py-3 text-sm text-[#e5c158] shadow-2xl">
          {toast}
        </div>
      )}
    </div>
  );
}
