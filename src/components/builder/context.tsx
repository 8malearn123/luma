'use client';

import { createContext, useContext } from 'react';
import { ApiError } from '@/lib/client/api';

export interface Opt {
  id: string;
  name: string;
  status: string;
}
export interface BuilderOptions {
  services: Opt[];
  products: Opt[];
  categories: (Opt & { kind: 'service' | 'product' })[];
  staff: Opt[];
  packages: Opt[];
  branches: Opt[];
}

export interface BuilderEnv {
  slug: string;
  options: BuilderOptions;
  assets: Record<string, { w640: string; w1280: string; alt: string | null; altEn: string | null }>;
  addAsset: (id: string, url: string, alt: string) => void;
}

export const BuilderCtx = createContext<BuilderEnv | null>(null);
export function useBuilder(): BuilderEnv {
  const c = useContext(BuilderCtx);
  if (!c) throw new Error('BuilderCtx missing');
  return c;
}

/** Multipart upload through the tenant asset pipeline (validated + re-encoded server-side). */
export async function uploadImage(slug: string, file: File, purpose: string, altAr: string): Promise<{ id: string; url: string }> {
  const fd = new FormData();
  fd.set('file', file);
  fd.set('purpose', purpose);
  fd.set('altAr', altAr);
  let res: Response;
  try {
    res = await fetch(`/api/v1/t/${slug}/assets`, { method: 'POST', body: fd, headers: { 'x-luma-request': '1' }, credentials: 'same-origin' });
  } catch {
    throw new ApiError('network', 'errors.network', 0);
  }
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(data?.error?.code ?? 'internal', data?.error?.message ?? 'errors.internal', res.status, data?.error?.details);
  return { id: data.id, url: data.url };
}
