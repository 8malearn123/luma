'use client';

import { useEffect, useState } from 'react';
import { apiFetch } from './api';

/**
 * One shared notification stream per browser tab.
 *  live     — Server-Sent Events from /api/v1/me/notifications/stream (instant)
 *  polling  — fallback every 60 s when streaming is unavailable (blocked by a
 *             proxy, the server could not LISTEN, repeated errors); a new
 *             stream attempt is made every 5 minutes
 * The stream only carries the unread count; components re-fetch content.
 */
export type RealtimeMode = 'connecting' | 'live' | 'polling';
interface Snapshot {
  unread: number | null;
  mode: RealtimeMode;
  /** increments on every change signal: use it as a reload trigger */
  version: number;
}

type Sub = (s: Snapshot) => void;
const subs = new Set<Sub>();
let snap: Snapshot = { unread: null, mode: 'connecting', version: 0 };
let es: EventSource | null = null;
let pollTimer: ReturnType<typeof setInterval> | null = null;
let retryTimer: ReturnType<typeof setTimeout> | null = null;
let errors = 0;

const POLL_MS = 60_000;
const RETRY_STREAM_MS = 5 * 60_000;

function set(p: Partial<Snapshot>) {
  snap = { ...snap, ...p };
  for (const s of subs) s(snap);
}

async function poll() {
  try {
    const r = await apiFetch<{ unread: number }>('/api/v1/me/notifications?limit=1');
    set({ unread: r.unread, version: snap.unread === r.unread ? snap.version : snap.version + 1 });
  } catch {
    /* offline: keep the last value */
  }
}

function startPolling() {
  set({ mode: 'polling' });
  if (!pollTimer) {
    void poll();
    pollTimer = setInterval(poll, POLL_MS);
  }
  if (!retryTimer) retryTimer = setTimeout(() => ((retryTimer = null), connect()), RETRY_STREAM_MS);
}

function connect() {
  if (typeof window === 'undefined' || es || !subs.size) return;
  if (typeof EventSource === 'undefined') return startPolling();
  es = new EventSource('/api/v1/me/notifications/stream');
  es.addEventListener('hello', (e) => {
    const d = JSON.parse((e as MessageEvent).data) as { realtime: boolean };
    if (!d.realtime) {
      // server could not subscribe: counts on connect only → poll instead
      es?.close();
      es = null;
      startPolling();
    }
  });
  es.addEventListener('unread', (e) => {
    errors = 0;
    const d = JSON.parse((e as MessageEvent).data) as { unread: number };
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
    set({ unread: d.unread, mode: 'live', version: snap.version + 1 });
  });
  es.onerror = () => {
    // EventSource reconnects by itself after a normal stream end; give up after repeated failures
    if (++errors >= 3) {
      es?.close();
      es = null;
      errors = 0;
      startPolling();
    }
  };
}

function disconnectIfIdle() {
  if (subs.size) return;
  es?.close();
  es = null;
  if (pollTimer) clearInterval(pollTimer);
  if (retryTimer) clearTimeout(retryTimer);
  pollTimer = retryTimer = null;
}

export function useNotificationSignal(): Snapshot {
  const [s, setS] = useState(snap);
  useEffect(() => {
    subs.add(setS);
    setS(snap);
    connect();
    return () => {
      subs.delete(setS);
      disconnectIfIdle();
    };
  }, []);
  return s;
}
