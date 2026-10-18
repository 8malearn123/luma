/**
 * /api/hr/leaves
 *   GET  → owner: all salon leaves (?salon_id=…&status=pending)
 *          staff: own history (no params)
 *   POST → staff submits a new leave request (forced to 'pending';
 *          overlap with an existing live request is rejected by the
 *          DB EXCLUDE constraint — race-proof).
 */
import { supabaseServer, jsonError, translateDbError } from '@/luma-hr/lib/supabase-server';

export async function GET(req: Request) {
  const supabase = await supabaseServer();
  const url = new URL(req.url);
  const salonId = url.searchParams.get('salon_id');
  const status = url.searchParams.get('status');

  let q = supabase
    .from('staff_leaves')
    .select('*, staff_profiles!inner(id, full_name, role, salon_id)')
    .order('created_at', { ascending: false });

  if (salonId) q = q.eq('staff_profiles.salon_id', salonId);
  if (status) q = q.eq('status', status);

  const { data, error } = await q;
  if (error) return jsonError(translateDbError(error.message), 500);
  return Response.json({ leaves: data });
}

export async function POST(req: Request) {
  const supabase = await supabaseServer();
  const body = await req.json();

  if (!body.start_date || !body.end_date || !body.type)
    return jsonError('start_date و end_date و type حقول إلزامية');
  if (body.end_date < body.start_date)
    return jsonError('تاريخ النهاية قبل تاريخ البداية');

  // resolve the caller's own staff profile — employees can only file for themselves
  const { data: me } = await supabase.rpc('my_staff_id');
  if (!me) return jsonError('هذا الحساب غير مرتبط بملف موظفة', 403);

  const { data, error } = await supabase
    .from('staff_leaves')
    .insert({
      staff_id: me,
      start_date: body.start_date,
      end_date: body.end_date,
      type: body.type,
      reason: body.reason || null,
      status: 'pending', // RLS also enforces this
    })
    .select()
    .single();

  if (error) return jsonError(translateDbError(error.message));
  return Response.json({ leave: data }, { status: 201 });
}
