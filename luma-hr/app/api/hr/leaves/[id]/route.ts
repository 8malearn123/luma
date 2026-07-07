/**
 * /api/hr/leaves/[id]
 *   PATCH → review a leave request.
 *     owner:  { action: 'approve' | 'reject', note? }
 *     staff:  { action: 'cancel' }  (own pending requests only)
 * The DB trigger `leave_transition_guard` enforces the state machine,
 * stamps the reviewer, and auto-cancels conflicting bookings on approval —
 * so this handler stays thin on purpose.
 */
import { supabaseServer, jsonError, translateDbError } from '@/luma-hr/lib/supabase-server';

const ACTIONS = { approve: 'approved', reject: 'rejected', cancel: 'cancelled' } as const;

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await supabaseServer();
  const { id } = await params;
  const body = await req.json();

  const next = ACTIONS[body.action as keyof typeof ACTIONS];
  if (!next) return jsonError("action يجب أن يكون 'approve' أو 'reject' أو 'cancel'");

  const { data, error } = await supabase
    .from('staff_leaves')
    .update({ status: next, review_note: body.note || null })
    .eq('id', id)
    .select()
    .single();

  if (error) return jsonError(translateDbError(error.message));
  return Response.json({ leave: data });
}
