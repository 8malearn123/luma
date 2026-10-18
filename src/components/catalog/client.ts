'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError, apiFetch } from '@/lib/client/api';

/** Tenant-scoped API path helper. */
export const tapi = (slug: string, path: string) => `/api/v1/t/${encodeURIComponent(slug)}${path}`;

/** Small data loader with explicit loading/error states and manual reload. */
export function useLoad<T>(url: string | null) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [loading, setLoading] = useState(!!url);
  const seq = useRef(0);
  const reload = useCallback(async () => {
    if (!url) return;
    const n = ++seq.current;
    setLoading(true);
    try {
      const r = await apiFetch<T>(url);
      if (n === seq.current) {
        setData(r);
        setError(null);
      }
    } catch (e) {
      if (n === seq.current) setError(e instanceof ApiError ? e : new ApiError('internal', 'errors.internal', 500));
    } finally {
      if (n === seq.current) setLoading(false);
    }
  }, [url]);
  useEffect(() => {
    void reload();
  }, [reload]);
  return { data, error, loading, reload, setData };
}

/** Upload an image through the server pipeline (re-encoded, metadata stripped). */
export async function uploadImage(slug: string, file: File, purpose: string, altAr = '', altEn = ''): Promise<{ id: string; url: string; dominantColors: string[] }> {
  const fd = new FormData();
  fd.set('file', file);
  fd.set('purpose', purpose);
  fd.set('altAr', altAr);
  if (altEn) fd.set('altEn', altEn);
  const res = await fetch(tapi(slug, '/assets'), { method: 'POST', body: fd, headers: { 'x-luma-request': '1' }, credentials: 'same-origin' });
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(body?.error?.code ?? 'internal', body?.error?.message ?? 'errors.internal', res.status, body?.error?.details, body?.requestId);
  return body;
}

export const WEEKDAYS: [string, string][] = [
  ['الأحد', 'Sun'],
  ['الاثنين', 'Mon'],
  ['الثلاثاء', 'Tue'],
  ['الأربعاء', 'Wed'],
  ['الخميس', 'Thu'],
  ['الجمعة', 'Fri'],
  ['السبت', 'Sat'],
];

/** "150" / "150.50" ⇄ minor units, without floats. */
export const minorToInput = (m: number | null | undefined) => (m == null ? '' : m % 100 === 0 ? String(m / 100) : (m / 100).toFixed(2));
