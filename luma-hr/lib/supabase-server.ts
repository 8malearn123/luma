/**
 * Server-side Supabase client for Next.js App Router route handlers.
 * The session cookie is forwarded so RLS policies evaluate against the
 * signed-in user (owner or staff member) — the API layer never needs the
 * service-role key for normal HR operations.
 */
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export async function supabaseServer() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (list) =>
          list.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)),
      },
    },
  );
}

/** Uniform JSON error helper so the UI can rely on { error } shape. */
export function jsonError(message: string, status = 400) {
  return Response.json({ error: message }, { status });
}

/**
 * Translates the DB guard exceptions (migration 0002) into user-facing
 * Arabic messages instead of leaking raw Postgres errors.
 */
export function translateDbError(message: string): string {
  if (message.includes('STAFF_UNAVAILABLE'))
    return 'الموظفة غير متاحة في هذا الوقت (إجازة، خارج الدوام، أو استراحة).';
  if (message.includes('no_double_booking'))
    return 'يوجد حجز آخر لنفس الموظفة في هذا الوقت.';
  if (message.includes('no_overlapping_live_leaves'))
    return 'يوجد طلب إجازة آخر يتقاطع مع هذه الفترة.';
  if (message.includes('LEAVE_ALREADY_FINALIZED'))
    return 'تم البت في هذا الطلب مسبقاً ولا يمكن تعديله.';
  if (message.includes('ONLY_OWNER_MAY_REVIEW'))
    return 'اعتماد الإجازات صلاحية مالكة الصالون فقط.';
  return 'حدث خطأ غير متوقع، حاولي مرة أخرى.';
}
