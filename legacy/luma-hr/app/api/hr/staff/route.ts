/**
 * /api/hr/staff
 *   GET  → list the salon's staff (profiles + commission config)
 *   POST → create a staff profile (+ default schedule + commission row)
 * RLS restricts every query to salons owned by the signed-in user.
 */
import { supabaseServer, jsonError, translateDbError } from '@/luma-hr/lib/supabase-server';

export async function GET(req: Request) {
  const supabase = await supabaseServer();
  const salonId = new URL(req.url).searchParams.get('salon_id');
  if (!salonId) return jsonError('salon_id مطلوب');

  const { data, error } = await supabase
    .from('staff_profiles')
    .select('*, staff_commissions(*), staff_schedules(*)')
    .eq('salon_id', salonId)
    .neq('status', 'archived')
    .order('created_at');

  if (error) return jsonError(translateDbError(error.message), 500);
  return Response.json({ staff: data });
}

export async function POST(req: Request) {
  const supabase = await supabaseServer();
  const body = await req.json();

  // minimal server-side validation — DB constraints are the last line
  if (!body.salon_id || !body.full_name?.trim() || !body.role)
    return jsonError('salon_id و full_name و role حقول إلزامية');

  const { data: profile, error } = await supabase
    .from('staff_profiles')
    .insert({
      salon_id: body.salon_id,
      full_name: body.full_name.trim(),
      role: body.role,
      specialties: body.specialties ?? [],
      phone: body.phone || null,
      email: body.email || null,
    })
    .select()
    .single();

  if (error) return jsonError(translateDbError(error.message));

  // Default schedule: Sun–Thu 10:00–20:00, Fri off, Sat 12:00–20:00.
  // The owner adjusts it later from the shift calendar.
  const defaults = [0, 1, 2, 3, 4, 5, 6].map((d) => ({
    staff_id: profile.id,
    weekday: d,
    is_day_off: d === 5,
    shift_start: d === 5 ? null : d === 6 ? '12:00' : '10:00',
    shift_end: d === 5 ? null : '20:00',
  }));

  const [{ error: schedErr }, { error: commErr }] = await Promise.all([
    supabase.from('staff_schedules').insert(defaults),
    supabase.from('staff_commissions').insert({
      staff_id: profile.id,
      base_salary: body.base_salary ?? 0,
      commission_type: body.commission_type ?? 'percentage',
      commission_value: body.commission_value ?? 0,
    }),
  ]);
  if (schedErr || commErr)
    return jsonError(translateDbError((schedErr ?? commErr)!.message));

  return Response.json({ staff: profile }, { status: 201 });
}
