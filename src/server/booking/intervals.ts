/** Half-open [start, end) intervals in epoch milliseconds, kept sorted & merged. */
export type Interval = [number, number];

export function normalize(list: Interval[]): Interval[] {
  const s = list.filter(([a, b]) => b > a).sort((x, y) => x[0] - y[0]);
  const out: Interval[] = [];
  for (const iv of s) {
    const last = out[out.length - 1];
    if (last && iv[0] <= last[1]) last[1] = Math.max(last[1], iv[1]);
    else out.push([iv[0], iv[1]]);
  }
  return out;
}

export function intersect(a: Interval[], b: Interval[]): Interval[] {
  const out: Interval[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    const s = Math.max(a[i][0], b[j][0]);
    const e = Math.min(a[i][1], b[j][1]);
    if (e > s) out.push([s, e]);
    if (a[i][1] < b[j][1]) i++;
    else j++;
  }
  return out;
}

export function subtract(a: Interval[], b: Interval[]): Interval[] {
  let cur = a.map((x) => [x[0], x[1]] as Interval);
  for (const [bs, be] of normalize(b)) {
    const next: Interval[] = [];
    for (const [s, e] of cur) {
      if (be <= s || bs >= e) next.push([s, e]);
      else {
        if (bs > s) next.push([s, bs]);
        if (be < e) next.push([be, e]);
      }
    }
    cur = next;
  }
  return cur;
}

/** Is [s, e) fully inside one interval of the (normalized) list? */
export function covers(list: Interval[], s: number, e: number): boolean {
  // binary search for the interval that could contain s
  let lo = 0;
  let hi = list.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (list[mid][1] <= s) lo = mid + 1;
    else if (list[mid][0] > s) hi = mid - 1;
    else return list[mid][1] >= e;
  }
  return false;
}

export function totalMinutes(list: Interval[]): number {
  return list.reduce((acc, [s, e]) => acc + (e - s) / 60000, 0);
}

export const MIN = 60000;
