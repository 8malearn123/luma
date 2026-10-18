/**
 * Display formatting. Instants are stored in UTC; they are always rendered in
 * an explicit timezone (business timezone by default: Asia/Riyadh) and the zone
 * is shown wherever ambiguity is possible. 12/24h is a display preference only.
 */
export type Locale = 'ar' | 'en';

export const DEFAULT_TZ = 'Asia/Riyadh';

const intlLocale = (l: Locale) => (l === 'ar' ? 'ar-SA-u-nu-latn' : 'en-SA');

export function formatMoney(minor: number | null | undefined, currency = 'SAR', locale: Locale = 'ar'): string {
  if (minor === null || minor === undefined) return '—';
  return new Intl.NumberFormat(intlLocale(locale), {
    style: 'currency',
    currency,
    minimumFractionDigits: minor % 100 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(minor / 100);
}

/** Parse a user-entered amount ("150", "150.5") into minor units without float drift. */
export function parseMoneyToMinor(input: string): number | null {
  const s = input.trim().replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d))).replace(/,/g, '');
  const m = /^(\d{1,9})(?:\.(\d{1,2}))?$/.exec(s);
  if (!m) return null;
  return Number(m[1]) * 100 + Number((m[2] ?? '').padEnd(2, '0'));
}

export function formatDateTime(
  d: Date | string | number,
  opts: { tz?: string; locale?: Locale; hour12?: boolean; dateStyle?: 'full' | 'long' | 'medium' | 'short'; timeOnly?: boolean; dateOnly?: boolean } = {},
): string {
  const date = new Date(d);
  const { tz = DEFAULT_TZ, locale = 'ar', hour12 = true } = opts;
  const o: Intl.DateTimeFormatOptions = { timeZone: tz };
  if (!opts.timeOnly) Object.assign(o, { dateStyle: opts.dateStyle ?? 'medium' });
  if (!opts.dateOnly) Object.assign(o, { timeStyle: 'short', hour12 });
  return new Intl.DateTimeFormat(intlLocale(locale), o).format(date);
}

export function tzLabel(tz: string, locale: Locale = 'ar'): string {
  if (tz === 'Asia/Riyadh') return locale === 'ar' ? 'بتوقيت الرياض' : 'Riyadh time';
  return tz;
}

export function formatDuration(min: number, locale: Locale = 'ar'): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (locale === 'ar') return [h ? `${h} س` : '', m ? `${m} د` : ''].filter(Boolean).join(' ');
  return [h ? `${h}h` : '', m ? `${m}m` : ''].filter(Boolean).join(' ');
}

/** YYYY-MM-DD for a Date in a timezone */
export function localDate(d: Date, tz = DEFAULT_TZ): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}
