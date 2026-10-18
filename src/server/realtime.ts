import { sql } from './db';

/**
 * Realtime notification signal.
 *
 * A trigger on `notifications` does pg_notify('luma_notifications', user_id)
 * on insert / read-state change. Each server process holds ONE LISTEN
 * connection and fans the signal out in memory to that user's open
 * Server-Sent-Events streams. The signal carries no content: the browser
 * re-fetches through the normal authorized API, so nothing can leak through
 * the channel.
 *
 * Limits (documented in RUNBOOK): on serverless hosts a stream lives at most
 * the platform's function duration; the client reconnects automatically and
 * falls back to polling every 60 s if streaming is unavailable.
 */
type Listener = () => void;

const g = globalThis as unknown as {
  __lumaRealtime?: { subs: Map<string, Set<Listener>>; started: Promise<boolean> | null; ok: boolean };
};
const state = (g.__lumaRealtime ??= { subs: new Map(), started: null, ok: false });

function start(): Promise<boolean> {
  state.started ??= sql()
    .listen('luma_notifications', (userId) => {
      for (const l of state.subs.get(userId) ?? []) {
        try {
          l();
        } catch {
          /* a broken stream must not affect the others */
        }
      }
    })
    .then(() => (state.ok = true))
    .catch(() => {
      state.started = null; // retry on the next subscriber
      state.ok = false;
      return false;
    });
  return state.started;
}

export async function subscribe(userId: string, l: Listener): Promise<{ ok: boolean; unsubscribe: () => void }> {
  const ok = await start();
  let set = state.subs.get(userId);
  if (!set) state.subs.set(userId, (set = new Set<Listener>()));
  set.add(l);
  return {
    ok,
    unsubscribe: () => {
      set!.delete(l);
      if (!set!.size) state.subs.delete(userId);
    },
  };
}

export const realtimeStats = () => ({ listening: state.ok, users: state.subs.size, streams: [...state.subs.values()].reduce((n, s) => n + s.size, 0) });

/** Max lifetime of one SSE response; the client reconnects (keeps proxies and serverless limits happy). */
export const STREAM_MAX_MS = 5 * 60_000;
export const HEARTBEAT_MS = 25_000;
