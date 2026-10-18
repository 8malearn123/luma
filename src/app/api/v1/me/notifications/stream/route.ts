import { api } from '@/server/http/handler';
import { withUser } from '@/server/db';
import { HEARTBEAT_MS, STREAM_MAX_MS, subscribe } from '@/server/realtime';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Server-Sent Events: `event: unread` with the signed-in user's unread count,
 * sent on connect and whenever one of HER notifications changes. The stream
 * carries counts only; content is fetched through /api/v1/me/notifications.
 * Ends after STREAM_MAX_MS (the browser's EventSource reconnects by itself).
 */
export const GET = api.user(async (c) => {
  const userId = c.user.userId;
  const unread = () =>
    withUser(userId, async (tx) => {
      const [r] = await tx<{ n: number }[]>`select count(*)::int as n from notifications where user_id = ${userId} and read_at is null and expires_at > now()`;
      return r.n;
    });
  const enc = new TextEncoder();
  let cleanup = () => {};
  const stream = new ReadableStream<Uint8Array>({
    async start(ctrl) {
      let closed = false;
      const send = (chunk: string) => {
        if (!closed) ctrl.enqueue(enc.encode(chunk));
      };
      let pending: ReturnType<typeof setTimeout> | null = null;
      const push = () => {
        // coalesce bursts (e.g. "mark all read") into one count query
        if (pending) return;
        pending = setTimeout(async () => {
          pending = null;
          try {
            send(`event: unread\ndata: ${JSON.stringify({ unread: await unread() })}\n\n`);
          } catch {
            /* transient DB error: the next signal or the client poll catches up */
          }
        }, 250);
      };
      const sub = await subscribe(userId, push);
      send(`retry: 5000\nevent: hello\ndata: ${JSON.stringify({ realtime: sub.ok })}\n\n`);
      send(`event: unread\ndata: ${JSON.stringify({ unread: await unread() })}\n\n`);
      const hb = setInterval(() => send(`: ping\n\n`), HEARTBEAT_MS);
      const end = setTimeout(() => cleanup(), STREAM_MAX_MS);
      cleanup = () => {
        if (closed) return;
        closed = true;
        clearInterval(hb);
        clearTimeout(end);
        if (pending) clearTimeout(pending);
        sub.unsubscribe();
        try {
          ctrl.close();
        } catch {
          /* already closed */
        }
      };
      c.req.signal.addEventListener('abort', () => cleanup());
    },
    cancel() {
      cleanup();
    },
  });
  return new Response(stream, {
    headers: { 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-cache, no-transform', connection: 'keep-alive', 'x-accel-buffering': 'no' },
  });
});
