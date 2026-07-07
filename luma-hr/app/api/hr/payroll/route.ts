/**
 * /api/hr/payroll?salon_id=…&month=2026-07
 *   GET → the salon's monthly payroll breakdown (one row per active
 *   employee: base salary + commission from completed bookings).
 *   Backed entirely by the `salon_monthly_payroll` SQL function so the
 *   numbers shown in the UI and any export are always identical.
 */
import { supabaseServer, jsonError, translateDbError } from '@/luma-hr/lib/supabase-server';

export async function GET(req: Request) {
  const supabase = await supabaseServer();
  const url = new URL(req.url);
  const salonId = url.searchParams.get('salon_id');
  const month = url.searchParams.get('month'); // 'YYYY-MM'

  if (!salonId) return jsonError('salon_id مطلوب');
  if (month && !/^\d{4}-\d{2}$/.test(month)) return jsonError('صيغة الشهر YYYY-MM');

  const { data, error } = await supabase.rpc('salon_monthly_payroll', {
    p_salon: salonId,
    p_month: (month ? `${month}-01` : new Date().toISOString().slice(0, 8) + '01'),
  });

  if (error) return jsonError(translateDbError(error.message), 500);

  const rows = data ?? [];
  const totals = rows.reduce(
    (t: { payout: number; commission: number; sales: number }, r: any) => ({
      payout: t.payout + Number(r.total_payout),
      commission: t.commission + Number(r.commission),
      sales: t.sales + Number(r.gross_sales),
    }),
    { payout: 0, commission: 0, sales: 0 },
  );

  return Response.json({ payroll: rows, totals });
}
