/**
 * /api/hr/availability?staff_id=…&date=2026-07-15&slot=30
 *   GET → bookable slots for one staff member on one date.
 *   This is what the PUBLIC booking page calls: approved leaves, days
 *   off, breaks and existing bookings are already excluded inside
 *   `get_available_slots`, so blocked times simply never reach the
 *   client — nothing to grey out, nothing to race against.
 */
import { supabaseServer, jsonError, translateDbError } from '@/luma-hr/lib/supabase-server';

export async function GET(req: Request) {
  const supabase = await supabaseServer();
  const url = new URL(req.url);
  const staffId = url.searchParams.get('staff_id');
  const date = url.searchParams.get('date');
  const slot = Number(url.searchParams.get('slot') ?? 30);

  if (!staffId || !date) return jsonError('staff_id و date مطلوبان');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return jsonError('صيغة التاريخ YYYY-MM-DD');
  if (date < new Date().toISOString().slice(0, 10))
    return jsonError('لا يمكن الحجز في تاريخ ماضٍ');

  const { data, error } = await supabase.rpc('get_available_slots', {
    p_staff: staffId,
    p_date: date,
    p_slot_minutes: slot,
  });

  if (error) return jsonError(translateDbError(error.message), 500);
  return Response.json({ date, staff_id: staffId, slots: data ?? [] });
}
