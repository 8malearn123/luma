'use client';
/**
 * ShiftSchedulePage — the weekly grid as the booking engine's single
 * source of truth, now annotated with live attendance deviations.
 *  • Shift hours here ARE what get_available_slots() reads — editing a
 *    cell immediately reshapes the public booking page's slots.
 *  • Days where the employee clocked in late (or missed the shift with
 *    no approved leave) are painted with a soft red highlight and a
 *    "تأخير n دقيقة" / "غياب" flag, fed by attendance_deviations().
 *  • The month's aggregated lateness/absences flow into payroll v2.
 */
import { useCallback, useEffect, useState } from 'react';
import type { StaffProfile, StaffSchedule } from '@/luma-hr/lib/types';
import { WEEKDAYS_AR } from '@/luma-hr/lib/types';

type StaffRow = StaffProfile & { staff_schedules: StaffSchedule[] };
interface Deviation { work_date: string; late_minutes: number; absent: boolean }

export default function ShiftSchedulePage({ salonId }: { salonId: string }) {
  const [staff, setStaff] = useState<StaffRow[]>([]);
  const [devs, setDevs] = useState<Record<string, Deviation[]>>({});
  const month = new Date().toISOString().slice(0, 7);

  const load = useCallback(async () => {
    const { staff } = await fetch(`/api/hr/staff?salon_id=${salonId}`).then(r => r.json());
    setStaff(staff);
    // pull this month's deviations per employee (parallel, small payloads)
    const entries = await Promise.all(staff.map(async (s: StaffRow) => {
      const { days } = await fetch(`/api/hr/attendance?staff_id=${s.id}&month=${month}`).then(r => r.json());
      return [s.id, days] as const;
    }));
    setDevs(Object.fromEntries(entries));
  }, [salonId, month]);
  useEffect(() => { load(); }, [load]);

  /** Latest deviation for a given weekday within the current month —
   *  what the grid shows on that column for quick scanning. */
  function flagFor(staffId: string, weekday: number): Deviation | null {
    const list = (devs[staffId] ?? []).filter(d =>
      new Date(d.work_date).getDay() === weekday && (d.late_minutes > 0 || d.absent));
    return list.length ? list[list.length - 1] : null;
  }

  return (
    <div dir="rtl" className="min-h-screen bg-[#09090b] p-6 text-zinc-100">
      <header className="mb-6">
        <h1 className="text-2xl font-bold">جدول الدوام</h1>
        <p className="mt-1 text-sm text-zinc-500">
          الساعات هنا هي مصدر الحقيقة الوحيد لمواعيد الحجز المتاحة · العلامات الحمراء من سجل الحضور الفعلي
        </p>
      </header>

      <div className="overflow-x-auto rounded-2xl border border-zinc-800">
        <table className="w-full min-w-[840px] text-sm">
          <thead className="bg-[#111113] text-[#e5c158]">
            <tr>
              <th className="p-3 text-right font-semibold">الموظفة</th>
              {WEEKDAYS_AR.map(d => <th key={d} className="p-3 font-semibold">{d}</th>)}
            </tr>
          </thead>
          <tbody>
            {staff.map(s => (
              <tr key={s.id} className="border-t border-zinc-800/70">
                <td className="p-3 font-semibold">
                  {s.full_name}
                  {/* month aggregate under the name */}
                  <MonthAggregate devs={devs[s.id] ?? []} />
                </td>
                {[0, 1, 2, 3, 4, 5, 6].map(wd => {
                  const row = s.staff_schedules.find(x => x.weekday === wd);
                  const flag = flagFor(s.id, wd);
                  return (
                    <td key={wd} className={`p-2 text-center align-middle transition
                        ${flag ? 'bg-rose-950/40' : ''}`}>
                      {!row || row.is_day_off
                        ? <span className="text-xs text-zinc-600">إجازة</span>
                        : (
                          <div className="inline-flex flex-col items-center gap-1">
                            <span dir="ltr" className="rounded-md bg-zinc-900 px-2 py-1 text-[11px] text-[#e8d9a8]">
                              {row.shift_start?.slice(0, 5)}–{row.shift_end?.slice(0, 5)}
                            </span>
                            {flag && (
                              <span className="rounded-full bg-rose-900/60 px-2 py-0.5 text-[10px] text-rose-200">
                                {flag.absent ? 'غياب' : `تأخير ${flag.late_minutes} دقيقة`}
                              </span>
                            )}
                          </div>
                        )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="mt-4 text-xs text-zinc-600">
        إجمالي دقائق التأخير والغيابات يُرحَّل تلقائياً إلى حاسبة الرواتب نهاية الشهر
        (يظهر كسطر معلومات، والخصم قرار إداري يُسجَّل كبند خصم موثَّق).
      </p>
    </div>
  );
}

function MonthAggregate({ devs }: { devs: Deviation[] }) {
  const late = devs.reduce((t, d) => t + d.late_minutes, 0);
  const abs = devs.filter(d => d.absent).length;
  if (!late && !abs) return null;
  return (
    <div className="mt-1 text-[10px] font-normal text-rose-300/80">
      هذا الشهر: {late ? `${late} دقيقة تأخير` : ''}{late && abs ? ' · ' : ''}{abs ? `${abs} غياب` : ''}
    </div>
  );
}
