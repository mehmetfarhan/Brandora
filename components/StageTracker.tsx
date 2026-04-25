"use client";

import type { RunState, StageName, VerificationRecord } from "@/lib/types";

const STAGES: { key: StageName; n: string; title: string }[] = [
  { key: "research", n: "01", title: "Research & Discovery" },
  { key: "strategy", n: "02", title: "Strategy & Planning" },
  { key: "calendar", n: "—", title: "Content Calendar" },
  { key: "content", n: "03", title: "Content Generation" },
];

function statusDot(status: string) {
  switch (status) {
    case "running":
      return <span className="inline-block h-2.5 w-2.5 rounded-full bg-accent live-dot" />;
    case "completed":
      return <span className="inline-block h-2.5 w-2.5 rounded-full bg-success" />;
    case "failed":
      return <span className="inline-block h-2.5 w-2.5 rounded-full bg-danger" />;
    default:
      return <span className="inline-block h-2.5 w-2.5 rounded-full bg-border" />;
  }
}

function VerifyChip({ v }: { v?: VerificationRecord }) {
  if (!v) return <span className="text-xs text-muted-foreground">—</span>;
  const cls = v.pass ? "border-success/40 text-success" : "border-warning/40 text-warning";
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-md border ${cls} px-2 py-0.5 text-xs font-mono`}>
      <span>score {v.score}</span>
      {v.revisions > 0 && <span className="opacity-70">· {v.revisions} rev</span>}
    </span>
  );
}

export function StageTracker({ state, current }: { state: RunState; current: StageName | null }) {
  return (
    <ol className="grid sm:grid-cols-4 gap-3">
      {STAGES.map((s) => {
        const stage = state.stages[s.key];
        const v = state.verification[s.key];
        const isCurrent = current === s.key;
        return (
          <li
            key={s.key}
            className={[
              "rounded-xl border bg-card p-4 transition-colors",
              isCurrent ? "border-accent/60 ring-1 ring-accent/30" : "border-border",
            ].join(" ")}
          >
            <div className="flex items-center justify-between">
              <div className="text-xs font-mono text-muted-foreground">{s.n}</div>
              {statusDot(stage.status)}
            </div>
            <div className="mt-1 font-medium">{s.title}</div>
            <div className="mt-2 text-xs text-muted-foreground capitalize">{stage.status}</div>
            <div className="mt-3">
              <VerifyChip v={v} />
            </div>
          </li>
        );
      })}
    </ol>
  );
}
