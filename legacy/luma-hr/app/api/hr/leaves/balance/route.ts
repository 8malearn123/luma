/**
 * /api/hr/leaves/balance?staff_id=…
 *   GET → { balance: { quota, used, remaining } } — the annual-leave
 *   balance chip shown next to each employee on the leave page.
 */
import { supabaseServer, jsonError, translateDbError } from '@/luma-hr/lib/supabase-server';

export async function GET(req: Request) {
  const supabase = await supabaseServer();
  const staffId = new URL(req.url).searchParams.get('staff_id');
  if (!staffId) return jsonError('staff_id مطلوب');

  const { data, error } = await supabase.rpc('leave_balance', { p_staff: staffId });
  if (error) return jsonError(translateDbError(error.message), 500);
  return Response.json({ balance: data?.[0] ?? null });
}
