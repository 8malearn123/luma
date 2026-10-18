/**
 * /api/hr/leaves/[id]/conflicts
 *   GET  → bookings colliding with the leave window (feeds the
 *          "هناك حجوزات نشطة خلال هذه الفترة" modal before approval).
 *   POST → resolve them after approval:
 *     { action: 'distribute' } → auto_distribute_bookings(): reassigns each
 *       booking to an available same-specialty colleague; unplaceable ones
 *       come back flagged 'needs_reschedule'.
 *     { action: 'notify' } → notify_and_reschedule(): cancels + logs for the
 *       apology/reschedule notification pipeline.
 */
import { supabaseServer, jsonError, translateDbError } from '@/luma-hr/lib/supabase-server';

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await supabaseServer();
  const { id } = await params;
  const { data, error } = await supabase.rpc('leave_conflicts', { p_leave: id });
  if (error) return jsonError(translateDbError(error.message), 500);
  return Response.json({ conflicts: data ?? [] });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await supabaseServer();
  const { id } = await params;
  const { action } = await req.json();

  if (action === 'distribute') {
    const { data, error } = await supabase.rpc('auto_distribute_bookings', { p_leave: id });
    if (error) return jsonError(translateDbError(error.message));
    const rerouted = (data ?? []).filter((r: any) => r.outcome === 'rerouted').length;
    const stuck = (data ?? []).filter((r: any) => r.outcome === 'needs_reschedule').length;
    return Response.json({ results: data, rerouted, needs_reschedule: stuck });
  }

  if (action === 'notify') {
    const { data, error } = await supabase.rpc('notify_and_reschedule', { p_leave: id });
    if (error) return jsonError(translateDbError(error.message));
    return Response.json({ notified: data });
  }

  return jsonError("action يجب أن يكون 'distribute' أو 'notify'");
}
