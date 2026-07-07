/**
 * /api/hr/schedules
 *   GET ?staff_id=…  → the 7 weekly rows for one employee
 *   PUT              → bulk upsert of weekly rows (owner only via RLS)
 * Shape checks (shift_end > shift_start, day-off rows carry no times,
 * breaks inside the shift) live in the DB constraints, so a malformed
 * payload fails atomically instead of half-applying.
 */
import { supabaseServer, jsonError, translateDbError } from '@/luma-hr/lib/supabase-server';

export async function GET(req: Request) {
  const supabase = await supabaseServer();
  const staffId = new URL(req.url).searchParams.get('staff_id');
  if (!staffId) return jsonError('staff_id مطلوب');

  const { data, error } = await supabase
    .from('staff_schedules')
    .select('*')
    .eq('staff_id', staffId)
    .order('weekday');

  if (error) return jsonError(translateDbError(error.message), 500);
  return Response.json({ schedule: data });
}

export async function PUT(req: Request) {
  const supabase = await supabaseServer();
  const body = await req.json();

  if (!body.staff_id || !Array.isArray(body.days) || body.days.length === 0)
    return jsonError('staff_id و days[] مطلوبان');

  const rows = body.days.map((d: any) => ({
    staff_id: body.staff_id,
    weekday: d.weekday,
    is_day_off: !!d.is_day_off,
    shift_start: d.is_day_off ? null : d.shift_start,
    shift_end: d.is_day_off ? null : d.shift_end,
    break_start: d.is_day_off ? null : d.break_start ?? null,
    break_end: d.is_day_off ? null : d.break_end ?? null,
  }));

  const { data, error } = await supabase
    .from('staff_schedules')
    .upsert(rows, { onConflict: 'staff_id,weekday' })
    .select();

  if (error) return jsonError(translateDbError(error.message));
  return Response.json({ schedule: data });
}
