/**
 * /api/hr/payroll/close
 *   POST { salon_id, month: 'YYYY-MM' } → "تصفية واعتماد الرواتب"
 *   Freezes the month via close_month(): inserts an immutable settlement
 *   + one slip per employee (frozen calculate_monthly_payout_v2 rows).
 *   The PDF endpoint below serves each slip for download/print; the
 *   accounting module consumes the settlement row.
 */
import { supabaseServer, jsonError, translateDbError } from '@/luma-hr/lib/supabase-server';

export async function POST(req: Request) {
  const supabase = await supabaseServer();
  const { salon_id, month } = await req.json();
  if (!salon_id || !/^\d{4}-\d{2}$/.test(month ?? ''))
    return jsonError('salon_id و month (YYYY-MM) مطلوبان');

  const { data: settlementId, error } = await supabase.rpc('close_month', {
    p_salon: salon_id,
    p_month: `${month}-01`,
  });
  if (error) {
    if (error.message.includes('MONTH_ALREADY_CLOSED'))
      return jsonError('هذا الشهر مُصفّى ومعتمد مسبقاً — لا يمكن إعادة فتحه.', 409);
    return jsonError(translateDbError(error.message));
  }

  // return the frozen slips so the UI can immediately offer the PDFs
  const { data: slips } = await supabase
    .from('payroll_slips')
    .select('id, staff_id, net_payout, breakdown, staff_profiles(full_name)')
    .eq('settlement_id', settlementId);

  return Response.json({ settlement_id: settlementId, slips: slips ?? [] }, { status: 201 });
}
