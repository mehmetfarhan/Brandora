"use client";

import Link from "next/link";
import { useEffect, useMemo, useReducer, useState } from "react";
import { ArtifactView } from "./ArtifactView";
import { EventStream } from "./EventStream";
import { StageTracker } from "./StageTracker";
import type { RunEvent, RunState, StageName } from "@/lib/types";

type Tab = "research" | "strategy" | "calendar" | "content" | "verification";

interface RunViewState {
  state: RunState;
  events: RunEvent[];
  current: StageName | null;
  done: boolean;
}

function reducer(state: RunViewState, ev: RunEvent): RunViewState {
  const events = [...state.events, ev];
  switch (ev.type) {
    case "state":
      return { ...state, state: ev.state, events };
    case "stage_start":
      return { ...state, current: ev.stage, events };
    case "stage_progress":
      return { ...state, events };
    case "tool_call":
      return { ...state, events };
    case "fact_check":
      return { ...state, events };
    case "critic_round":
      return { ...state, events };
    case "stage_complete": {
      const next = { ...state.state };
      next.stages = { ...next.stages, [ev.stage]: { ...next.stages[ev.stage], status: "completed" } };
      return { ...state, state: next, events };
    }
    case "tokens": {
      const next: RunState = { ...state.state, tokens: ev.tokens };
      return { ...state, state: next, events };
    }
    case "error":
      return { ...state, done: true, events };
    case "done":
      return { ...state, done: true, current: null, events };
  }
}

export function RunView({ initial }: { initial: RunState }) {
  const [s, dispatch] = useReducer(reducer, {
    state: initial,
    events: [],
    current: null,
    done: initial.status !== "running",
  });
  const [tab, setTab] = useState<Tab>("research");

  // Refresh full state from disk after each `done` so artifacts reflect any
  // late writes (e.g. critic revisions). Also refetch periodically while running
  // for late SSE buffer drift.
  useEffect(() => {
    let cancelled = false;
    async function pull() {
      try {
        const res = await fetch(`/api/run/${initial.id}`, { cache: "no-store" });
        if (!res.ok) return;
        const next = (await res.json()) as RunState;
        if (!cancelled) dispatch({ type: "state", state: next, t: Date.now() });
      } catch {
        // ignore
      }
    }
    if (s.done) void pull();
    const id = setInterval(pull, 4000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [initial.id, s.done]);

  // SSE subscription
  useEffect(() => {
    const es = new EventSource(`/api/run/${initial.id}/events`);
    const onMessage = (msg: MessageEvent) => {
      try {
        const ev = JSON.parse(msg.data) as RunEvent;
        dispatch(ev);
      } catch {
        // ignore
      }
    };
    // Subscribe to all event types
    const types: RunEvent["type"][] = [
      "state",
      "stage_start",
      "stage_progress",
      "tool_call",
      "fact_check",
      "critic_round",
      "stage_complete",
      "tokens",
      "error",
      "done",
    ];
    for (const t of types) es.addEventListener(t, onMessage);
    es.onerror = () => {
      // Browser will auto-reconnect; if the run is done, close cleanly.
      if (s.done) es.close();
    };
    return () => es.close();
  }, [initial.id, s.done]);

  // Auto-advance tabs as stages complete (until user clicks one).
  const userTouchedRef = useUserTouchedRef();
  useEffect(() => {
    if (userTouchedRef.current) return;
    const stages: { key: StageName; tab: Tab }[] = [
      { key: "research", tab: "research" },
      { key: "strategy", tab: "strategy" },
      { key: "calendar", tab: "calendar" },
      { key: "content", tab: "content" },
    ];
    for (const st of stages) {
      if (s.state.stages[st.key]?.status === "running") {
        setTab(st.tab);
        return;
      }
    }
    // If everything completed and verification has data, jump to it on done.
    if (s.done) setTab("verification");
  }, [s.state.stages.research.status, s.state.stages.strategy.status, s.state.stages.calendar.status, s.state.stages.content.status, s.done]);

  const status = s.state.status === "failed" ? "failed" : s.done ? "completed" : "running";

  const headerStatus = useMemo(() => {
    if (status === "failed") return { color: "text-danger", label: "failed" };
    if (status === "completed") return { color: "text-success", label: "completed" };
    return { color: "text-accent", label: "running" };
  }, [status]);

  return (
    <main className="flex flex-col">
      <header className="px-6 sm:px-10 py-5 flex items-center justify-between border-b border-border bg-card/40 backdrop-blur sticky top-0 z-10">
        <div className="flex items-center gap-3 min-w-0">
          <Link href="/" className="text-sm text-muted-foreground hover:text-foreground">←</Link>
          <span className={`inline-block h-2 w-2 rounded-full ${status === "running" ? "bg-accent live-dot" : status === "completed" ? "bg-success" : "bg-danger"}`} />
          <div className="truncate">
            <div className="font-semibold tracking-tight truncate">{s.state.input.name}</div>
            <div className="text-xs font-mono text-muted-foreground truncate">{s.state.id}</div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Tokens state={s.state} />
          <Link
            href="/channels"
            className="text-xs font-medium text-muted-foreground hover:text-foreground"
          >
            channels
          </Link>
          {status === "failed" && <ResumeButton runId={s.state.id} />}
          <div className={`text-xs font-mono uppercase ${headerStatus.color}`}>{headerStatus.label}</div>
        </div>
      </header>

      <section className="px-6 sm:px-10 py-6 max-w-7xl mx-auto w-full">
        <StageTracker state={s.state} current={s.current} />
      </section>

      <section className="px-6 sm:px-10 pb-12 grid lg:grid-cols-[1fr_360px] gap-6 max-w-7xl mx-auto w-full">
        <div className="min-w-0">
          <ArtifactView
            state={s.state}
            tab={tab}
            onTab={(t) => {
              userTouchedRef.current = true;
              setTab(t);
            }}
          />
        </div>
        <div>
          <EventStream events={s.events} />
        </div>
      </section>
    </main>
  );
}

function ResumeButton({ runId }: { runId: string }) {
  const [pending, setPending] = useState(false);
  return (
    <button
      onClick={async () => {
        setPending(true);
        try {
          await fetch(`/api/run/${runId}/resume`, { method: "POST" });
          // Force a full reload so the SSE re-subscribes with a fresh state.
          window.location.reload();
        } catch {
          setPending(false);
        }
      }}
      disabled={pending}
      className="rounded-md border border-accent/40 bg-accent/15 hover:bg-accent/25 text-accent text-xs font-medium px-3 py-1.5 disabled:opacity-50"
    >
      {pending ? "Resuming…" : "Resume run"}
    </button>
  );
}

function Tokens({ state }: { state: RunState }) {
  const t = state.tokens;
  return (
    <div className="hidden sm:flex items-center gap-3 font-mono text-xs text-muted-foreground">
      <span>in {t.input.toLocaleString()}</span>
      <span>·</span>
      <span>out {t.output.toLocaleString()}</span>
      <span>·</span>
      <span title="cache reads">cr {t.cache_read.toLocaleString()}</span>
    </div>
  );
}

import { useRef } from "react";
function useUserTouchedRef() {
  const ref = useRef(false);
  return ref;
}
