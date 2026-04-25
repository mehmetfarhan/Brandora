// POST /api/run/[id]/resume — re-run pipeline, skipping already-completed stages.

import { NextResponse } from "next/server";
import { getRun, persist, setState } from "@/lib/runs";
import { runPipeline } from "@/lib/pipeline";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(_: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const state = getRun(id);
  if (!state) return NextResponse.json({ error: "not_found" }, { status: 404 });

  // Don't kick off a second pipeline for a run that's still in progress —
  // the two would race on the shared state object and cause stages to "rewind".
  if (state.status === "running") {
    return NextResponse.json({ id: state.id, resumed: false, reason: "already_running" });
  }

  // Reset any non-completed stages to pending so the orchestrator restarts them.
  for (const k of ["research", "strategy", "calendar", "content"] as const) {
    const s = state.stages[k];
    if (s.status !== "completed") {
      state.stages[k] = { status: "pending" };
    }
  }
  state.status = "running";
  delete state.error;
  setState(state);
  persist(state);

  void runPipeline(state).catch(() => {
    /* errors captured via failRun */
  });
  return NextResponse.json({ id: state.id, resumed: true });
}
