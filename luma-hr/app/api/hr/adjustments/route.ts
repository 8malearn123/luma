/**
 * /api/hr/adjustments
 *   POST { staff_id, month: 'YYYY-MM-01', kind: 'advance'|'deduction'|'bonus',
 *          amount, note? }
 *   Records سلف/خصومات/مكافآت. The DB freeze-guard rejects any write for a
 *   month that has already been settled (تصفية) — surfaced as a clear error.
 */
import { supabaseServer, jsonError, translateDbError } from '@/luma-hr/lib/supabase-server';

export async function POST(req: Request) {
  const supabase = await supabaseServer();
  const body = await req.json();

  if (!body.staff_id || !body.month || !body.kind || !(Number(body.amount) > 0))
    return jsonError('staff_id و month و kind و amount (> 0) مطلوبة');

  const { data, error } = await supabase
    .from('staff_adjustments')
    .insert({
      staff_id: body.staff_id,
      month: body.month,
      kind: body.kind,
      amount: Number(body.amount),
      note: body.note || null,
    })
    .select()
    .single();

  if (error) {
    if (error.message.includes('MONTH_ALREADY_CLOSED'))
      return jsonError('هذا الشهر مُصفّى — لا يمكن إضافة بنود عليه.', 409);
    return jsonError(translateDbError(error.message));
  }
  return Response.json({ adjustment: data }, { status: 201 });
}
