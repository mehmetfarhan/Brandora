// POST /api/run — start a new run, kick off pipeline in the background, return id.

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createRun, listRuns } from "@/lib/runs";
import { runPipeline } from "@/lib/pipeline";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const InputSchema = z.object({
  name: z.string().min(1).max(120),
  url: z.string().url().optional(),
  hints: z.array(z.string()).optional(),
  channels: z.array(z.string()).optional(),
  calendar_days: z.number().int().min(3).max(30).optional(),
});

export async function GET() {
  return NextResponse.json({ runs: listRuns().map((r) => ({ id: r.id, name: r.input.name, status: r.status, startedAt: r.startedAt })) });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const parsed = InputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  }
  const state = createRun(parsed.data);
  // Fire and forget — events go through the run's bus, state persists to disk.
  void runPipeline(state).catch(() => {
    /* errors already captured via failRun */
  });
  return NextResponse.json({ id: state.id });
}
