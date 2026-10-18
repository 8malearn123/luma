import { z } from 'zod';
import { addDays, utcToWall, wallToUtc } from '@/lib/tz';

/** Period in the business timezone: local dates [from, to] inclusive → UTC instants [start, end). */
export const periodQuery = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

export function resolvePeriod(q: z.infer<typeof periodQuery>, tz: string) {
  const today = utcToWall(new Date(), tz).date;
  const to = q.to ?? today;
  const from = q.from ?? `${today.slice(0, 8)}01`;
  const fromD = from <= to ? from : to;
  return { fromDate: fromD, toDate: to, start: wallToUtc(fromD, '00:00', tz), end: wallToUtc(addDays(to, 1), '00:00', tz), endDateExclusive: addDays(to, 1) };
}
