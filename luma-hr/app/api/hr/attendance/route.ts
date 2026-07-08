/**
 * /api/hr/attendance
 *   POST { action: 'in' | 'out' } → employee clock-in / clock-out for today
 *   GET  ?staff_id=…&month=YYYY-MM → deviation flags for the schedule grid
 *        (late minutes per day + absences) and the month summary that the
 *        payroll calculator consumes.
 */
import { supabaseServer, jsonError, translateDbError } from '@/luma-hr/lib/supabase-server';

export async function POST(req: Request) {
  const supabase = await supabaseServer();
  const { action } = await req.json();
  if (action !== 'in' && action !== 'out') return jsonError("action: 'in' أو 'out'");

  const { data: me } = await supabase.rpc('my_staff_id');
  if (!me) return jsonError('هذا الحساب غير مرتبط بملف موظفة', 403);

  const today = new Date().toISOString().slice(0, 10);
  const patch = action === 'in'
    ? { staff_id: me, work_date: today, clock_in: new Date().toISOString() }
    : { staff_id: me, work_date: today, clock_out: new Date().toISOString() };

  const { data, error } = await supabase
    .from('staff_attendance')
    .upsert(patch, { onConflict: 'staff_id,work_date' })
    .select()
    .single();

  if (error) return jsonError(translateDbError(error.message));
  return Response.json({ attendance: data });
}

export async function GET(req: Request) {
  const supabase = await supabaseServer();
  const url = new URL(req.url);
  const staffId = url.searchParams.get('staff_id');
  const month = url.searchParams.get('month') ?? new Date().toISOString().slice(0, 7);
  if (!staffId) return jsonError('staff_id مطلوب');

  const [{ data: days, error: e1 }, { data: sum, error: e2 }] = await Promise.all([
    supabase.rpc('attendance_deviations', { p_staff: staffId, p_month: `${month}-01` }),
    supabase.rpc('attendance_summary', { p_staff: staffId, p_month: `${month}-01` }),
  ]);
  if (e1 || e2) return jsonError(translateDbError((e1 ?? e2)!.message), 500);
  return Response.json({ days: days ?? [], summary: sum?.[0] ?? null });
}
