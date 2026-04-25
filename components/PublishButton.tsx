"use client";

import { useEffect, useState } from "react";
import { channelToZernioPlatform } from "@/lib/zernio";
import type { ZernioAccount } from "@/lib/zernio";

interface Props {
  runId: string;
  itemId: string;
  channel: string;
  /** ISO date for this item; passed through so we can label "schedule for Apr 30". */
  date?: string;
}

type Mode = "schedule" | "now";

type State =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "no-account"; platform: string }
  | { kind: "no-mapping" }
  | { kind: "ready"; account: ZernioAccount }
  | { kind: "publishing"; mode: Mode }
  | { kind: "published"; mode: Mode; postId: string }
  | { kind: "error"; message: string };

function formatDay(iso?: string): string | null {
  if (!iso) return null;
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return null;
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

export function PublishButton({ runId, itemId, channel, date }: Props) {
  const [state, setState] = useState<State>({ kind: "idle" });
  const [mode, setMode] = useState<Mode>("schedule");

  useEffect(() => {
    let cancelled = false;
    const platform = channelToZernioPlatform(channel);
    if (!platform) {
      setState({ kind: "no-mapping" });
      return;
    }
    setState({ kind: "loading" });
    fetch("/api/zernio/accounts", { cache: "no-store" })
      .then(async (r) => {
        if (!r.ok) {
          const t = await r.text().catch(() => "");
          throw new Error(`accounts: ${r.status} ${t.slice(0, 120)}`);
        }
        return r.json() as Promise<{ accounts: ZernioAccount[] }>;
      })
      .then(({ accounts }) => {
        if (cancelled) return;
        const acct = accounts.find(
          (a) => a.platform === platform && a.enabled !== false && a.isActive !== false,
        );
        if (acct) setState({ kind: "ready", account: acct });
        else setState({ kind: "no-account", platform });
      })
      .catch((e) => {
        if (!cancelled) setState({ kind: "error", message: (e as Error).message });
      });
    return () => {
      cancelled = true;
    };
  }, [channel]);

  async function publish() {
    const useSchedule = mode === "schedule";
    setState({ kind: "publishing", mode });
    try {
      const res = await fetch("/api/zernio/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ runId, itemId, publishNow: !useSchedule }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        postId?: string;
        error?: string;
      };
      if (!res.ok || !body.ok) {
        setState({ kind: "error", message: body.error || `HTTP ${res.status}` });
        return;
      }
      setState({ kind: "published", mode, postId: body.postId ?? "" });
    } catch (e) {
      setState({ kind: "error", message: (e as Error).message });
    }
  }

  if (state.kind === "no-mapping") {
    return (
      <span className="text-[10px] font-mono text-muted-foreground" title="Not a social channel">
        not publishable
      </span>
    );
  }
  if (state.kind === "loading") {
    return (
      <span className="text-[10px] font-mono text-muted-foreground inline-flex items-center gap-1">
        <Spinner /> checking…
      </span>
    );
  }
  if (state.kind === "no-account") {
    return (
      <a
        href="https://zernio.com/dashboard"
        target="_blank"
        rel="noreferrer"
        className="inline-flex items-center gap-1 text-[11px] font-medium text-warning underline-offset-2 hover:underline"
        title={`No connected ${state.platform} account`}
      >
        connect {state.platform} →
      </a>
    );
  }
  if (state.kind === "publishing") {
    return (
      <button
        disabled
        className="inline-flex items-center gap-1.5 rounded-md border border-accent/40 bg-accent/15 text-accent text-[11px] font-medium px-2 py-1"
      >
        <Spinner /> {state.mode === "schedule" ? "scheduling…" : "publishing…"}
      </button>
    );
  }
  if (state.kind === "published") {
    return (
      <span
        className="inline-flex items-center gap-1 text-[11px] font-mono text-success"
        title={state.postId}
      >
        <CheckIcon /> {state.mode === "schedule" ? "scheduled" : "published"}
      </span>
    );
  }
  if (state.kind === "error") {
    return (
      <button
        onClick={publish}
        className="inline-flex items-center gap-1 text-[11px] font-medium text-danger underline-offset-2 hover:underline"
        title={state.message}
      >
        retry · {state.message.slice(0, 40)}
      </button>
    );
  }
  if (state.kind === "ready") {
    const dateLabel = formatDay(date);
    const isSchedule = mode === "schedule";
    const tip = isSchedule
      ? `Queue on Zernio${dateLabel ? ` for ${dateLabel}` : ""} via ${state.account.username ?? state.account.platform}`
      : `Publish now on Zernio via ${state.account.username ?? state.account.platform}`;
    return (
      <div className="inline-flex items-center gap-1 rounded-md border border-border bg-card p-0.5 text-[11px] font-medium">
        <button
          type="button"
          onClick={() => setMode("schedule")}
          className={[
            "rounded-[5px] px-2 py-0.5 transition-colors",
            isSchedule ? "bg-info/15 text-info" : "text-muted-foreground hover:text-foreground",
          ].join(" ")}
          title="Schedule for the calendar date"
        >
          schedule
        </button>
        <button
          type="button"
          onClick={() => setMode("now")}
          className={[
            "rounded-[5px] px-2 py-0.5 transition-colors",
            !isSchedule ? "bg-accent/20 text-accent" : "text-muted-foreground hover:text-foreground",
          ].join(" ")}
          title="Publish immediately"
        >
          now
        </button>
        <button
          type="button"
          onClick={publish}
          title={tip}
          className={[
            "rounded-[5px] px-2 py-0.5 inline-flex items-center gap-1",
            isSchedule
              ? "bg-info/20 hover:bg-info/30 text-info"
              : "bg-accent text-accent-foreground hover:brightness-110",
          ].join(" ")}
        >
          {isSchedule ? <CalendarIcon /> : <SendIcon />}
          {isSchedule ? (dateLabel ? `for ${dateLabel}` : "schedule") : "send"}
        </button>
      </div>
    );
  }
  // idle — initial render before the useEffect fires
  return null;
}

function Spinner() {
  return (
    <svg
      className="h-3 w-3 animate-spin"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="3"
      strokeLinecap="round"
    >
      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg
      className="h-3 w-3"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="3"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="m5 12 5 5L20 7" />
    </svg>
  );
}

function CalendarIcon() {
  return (
    <svg
      className="h-3 w-3"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <path d="M16 2v4M8 2v4M3 10h18" />
    </svg>
  );
}

function SendIcon() {
  return (
    <svg
      className="h-3 w-3"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M22 2 11 13" />
      <path d="m22 2-7 20-4-9-9-4 20-7Z" />
    </svg>
  );
}
