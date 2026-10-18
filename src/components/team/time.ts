import { utcToWall, wallToUtc } from '@/lib/tz';

/** datetime-local value (wall clock in the business timezone) → ISO instant. */
export const localInputToIso = (v: string, tz: string) => {
  const [d, time] = v.split('T');
  return wallToUtc(d, time.slice(0, 5), tz).toISOString();
};

/** ISO instant → datetime-local value in the business timezone. */
export const isoToLocalInput = (iso: string | Date, tz: string) => {
  const w = utcToWall(new Date(iso), tz);
  return `${w.date}T${w.time}`;
};

export const todayIn = (tz: string) => utcToWall(new Date(), tz).date;
