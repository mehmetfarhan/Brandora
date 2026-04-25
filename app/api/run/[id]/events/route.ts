// GET /api/run/[id]/events — Server-Sent Events stream for a run.
// Subscribes to the in-memory bus, replays buffered events for late joiners,
// and ends when a `done` event is received.

import { getRun, subscribe } from "@/lib/runs";
import type { RunEvent } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function format(ev: RunEvent): string {
  return `event: ${ev.type}\ndata: ${JSON.stringify(ev)}\n\n`;
}

export async function GET(_: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const state = getRun(id);
  if (!state) return new Response("not found", { status: 404 });

  const stream = new ReadableStream({
    start(controller) {
      const enc = new TextEncoder();

      // Initial state snapshot so the client can render before the next event.
      controller.enqueue(enc.encode(format({ type: "state", state, t: Date.now() })));

      // Heartbeat to keep proxies from closing the connection.
      const ping = setInterval(() => {
        try {
          controller.enqueue(enc.encode(": ping\n\n"));
        } catch {
          /* controller closed */
        }
      }, 15000);

      let unsub: (() => void) | null = null;
      let closed = false;
      const closeAll = () => {
        if (closed) return;
        closed = true;
        clearInterval(ping);
        if (unsub) {
          try {
            unsub();
          } catch {
            /* ignore */
          }
        }
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      };

      // `subscribe` may invoke `cb` synchronously while replaying buffered
      // events. We must not reference `unsub` from inside `cb` until it's
      // bound — guard with `closed` and the closeAll helper.
      const cb = (ev: RunEvent) => {
        if (closed) return;
        try {
          controller.enqueue(enc.encode(format(ev)));
        } catch {
          closeAll();
          return;
        }
        if (ev.type === "done") closeAll();
      };

      unsub = subscribe(id, cb);
      // If subscribe replayed a buffered "done" synchronously, closeAll already
      // fired before we bound `unsub`; defend by re-checking.
      if (closed && unsub) {
        try {
          unsub();
        } catch {
          /* ignore */
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
