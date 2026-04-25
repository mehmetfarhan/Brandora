"use client";

import type { RunState, StageName, VerificationRecord } from "@/lib/types";

interface DisplayCard {
  /** Stage(s) backing this card. Calendar + Content merge into one "Schedule" card. */
  keys: StageName[];
  n: string;
  title: string;
}

const CARDS: DisplayCard[] = [
  { keys: ["research"], n: "01", title: "Research & Discovery" },
  { keys: ["strategy"], n: "02", title: "Strategy & Planning" },
  { keys: ["calendar", "content"], n: "03", title: "Schedule & Content" },
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

/** For merged cards: pick the "least complete" backing stage's status so the
 * card stays running while either child is still running. */
function aggregateStatus(state: RunState, keys: StageName[]): string {
  const order = ["pending", "running", "failed", "completed"];
  let worst = "completed";
  for (const k of keys) {
    const s = state.stages[k]?.status ?? "pending";
    if (order.indexOf(s) < order.indexOf(worst)) worst = s;
  }
  return worst;
}

/** For merged cards: average the score and sum revisions when both have run. */
function aggregateVerify(state: RunState, keys: StageName[]): VerificationRecord | undefined {
  const records = keys
    .map((k) => state.verification[k])
    .filter((v): v is VerificationRecord => !!v);
  if (records.length === 0) return undefined;
  if (records.length === 1) return records[0];
  const avg = Math.round(records.reduce((a, b) => a + b.score, 0) / records.length);
  const revisions = records.reduce((a, b) => a + (b.revisions ?? 0), 0);
  return { ...records[0], score: avg, revisions, pass: records.every((r) => r.pass) };
}

export function StageTracker({ state, current }: { state: RunState; current: StageName | null }) {
  return (
    <ol className="grid sm:grid-cols-3 gap-3">
      {CARDS.map((card) => {
        const status = aggregateStatus(state, card.keys);
        const v = aggregateVerify(state, card.keys);
        const isCurrent = current !== null && card.keys.includes(current);
        return (
          <li
            key={card.title}
            className={[
              "rounded-xl border bg-card p-4 transition-colors",
              isCurrent ? "border-accent/60 ring-1 ring-accent/30" : "border-border",
            ].join(" ")}
          >
            <div className="flex items-center justify-between">
              <div className="text-xs font-mono text-muted-foreground">{card.n}</div>
              {statusDot(status)}
            </div>
            <div className="mt-1 font-medium">{card.title}</div>
            <div className="mt-2 text-xs text-muted-foreground capitalize">{status}</div>
            <div className="mt-3">
              <VerifyChip v={v} />
            </div>
          </li>
        );
      })}
    </ol>
  );
}
