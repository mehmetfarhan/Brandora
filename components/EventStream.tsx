"use client";

import { useEffect, useRef } from "react";
import type { RunEvent } from "@/lib/types";

function summarize(
  ev: RunEvent,
): { kind: string; text: string; tone?: "ok" | "warn" | "bad" | "info" } | null {
  switch (ev.type) {
    case "stage_start":
      return { kind: "stage", text: `▶ ${ev.stage} stage started`, tone: "info" };
    case "stage_progress":
      return { kind: "info", text: `· ${ev.stage}: ${ev.message}` };
    case "tool_call":
      return { kind: "tool", text: `↗ tool ${ev.tool} (${ev.stage})`, tone: "info" };
    case "fact_check":
      return {
        kind: "fact",
        text: `${ev.verdict.supported ? "✓" : "✗"} fact #${ev.verdict.index}: ${ev.verdict.url}`,
        tone: ev.verdict.supported ? "ok" : "bad",
      };
    case "critic_round":
      return {
        kind: "critic",
        text: `◇ critic ${ev.stage} round ${ev.round}: score ${ev.score}${ev.pass ? " (pass)" : " (revising)"}`,
        tone: ev.pass ? "ok" : "warn",
      };
    case "stage_complete":
      return { kind: "stage", text: `✓ ${ev.stage} complete`, tone: "ok" };
    case "tokens":
      return {
        kind: "tokens",
        text: `tokens · in ${ev.tokens.input.toLocaleString()} · out ${ev.tokens.output.toLocaleString()} · cache_r ${ev.tokens.cache_read.toLocaleString()}`,
      };
    case "state":
      // Internal state-sync events from the SSE handshake and client-side
      // polling. They keep the React store in sync but they aren't pipeline
      // activity, so don't render them in the visible log.
      return null;
    case "error":
      return { kind: "error", text: `! ${ev.message}`, tone: "bad" };
    case "done":
      return { kind: "done", text: "■ done", tone: "ok" };
  }
}

const TONE: Record<string, string> = {
  ok: "text-success",
  warn: "text-warning",
  bad: "text-danger",
  info: "text-info",
};

export function EventStream({ events }: { events: RunEvent[] }) {
  const ref = useRef<HTMLDivElement>(null);
  // Pre-filter the events we'll actually render, so the visible-count and
  // auto-scroll line up with what the user sees.
  const visible = events
    .map((e) => ({ ev: e, s: summarize(e) }))
    .filter((row): row is { ev: RunEvent; s: NonNullable<ReturnType<typeof summarize>> } => row.s !== null);

  useEffect(() => {
    ref.current?.scrollTo({ top: ref.current.scrollHeight, behavior: "smooth" });
  }, [visible.length]);

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden flex flex-col h-[420px]">
      <div className="px-4 py-2.5 border-b border-border text-sm font-medium flex items-center justify-between">
        <span>Live event stream</span>
        <span className="text-xs font-mono text-muted-foreground">{visible.length} events</span>
      </div>
      <div ref={ref} className="flex-1 overflow-y-auto px-4 py-3 font-mono text-xs leading-relaxed">
        {visible.length === 0 ? (
          <div className="text-muted-foreground">waiting…</div>
        ) : (
          visible.map(({ ev, s }, i) => {
            const cls = s.tone ? TONE[s.tone] : "text-muted-foreground";
            return (
              <div key={i} className={cls}>
                <span className="text-muted-foreground">{new Date(ev.t).toISOString().slice(11, 19)} </span>
                <span>{s.text}</span>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
