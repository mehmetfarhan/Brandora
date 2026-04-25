"use client";

import { useEffect, useState } from "react";
import { channelToZernioPlatform } from "@/lib/zernio";
import type { ZernioAccount } from "@/lib/zernio";
import type { ContentItem } from "@/lib/types";

type ProgressStatus = "queued" | "publishing" | "ok" | "skip" | "error";

interface ProgressEntry {
  id: string;
  channel: string;
  status: ProgressStatus;
  message?: string;
  postId?: string;
}

export interface BulkPublishProps {
  runId: string;
  items: ContentItem[];
  /** Action button label override. The eligible count is appended automatically. */
  actionLabel?: string;
  /** Hide the Schedule/Now toggle (caller pre-decides). */
  hideScheduleToggle?: boolean;
  /** Force the action to schedule, regardless of toggle (overrides default). */
  forceSchedule?: boolean;
  /** Initial state of the schedule toggle. Defaults to true — most users want
   * to queue at the calendar date, not publish now. */
  defaultSchedule?: boolean;
  /** Compact rendering. */
  compact?: boolean;
}

export function BulkPublish({
  runId,
  items,
  actionLabel,
  hideScheduleToggle,
  forceSchedule,
  defaultSchedule = true,
  compact,
}: BulkPublishProps) {
  const [accounts, setAccounts] = useState<ZernioAccount[] | null>(null);
  const [accountsError, setAccountsError] = useState<string | null>(null);
  const [progress, setProgress] = useState<ProgressEntry[]>([]);
  const [publishing, setPublishing] = useState(false);
  const [scheduleFromCalendar, setScheduleFromCalendar] = useState(
    forceSchedule !== undefined ? forceSchedule : defaultSchedule,
  );

  useEffect(() => {
    let cancelled = false;
    fetch("/api/zernio/accounts", { cache: "no-store" })
      .then(async (r) => {
        if (!r.ok) throw new Error(`accounts: ${r.status}`);
        return r.json() as Promise<{ accounts: ZernioAccount[] }>;
      })
      .then(({ accounts }) => {
        if (!cancelled) setAccounts(accounts);
      })
      .catch((e) => {
        if (!cancelled) setAccountsError((e as Error).message);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Reset progress when the items list identity changes (e.g. picking a new day).
  useEffect(() => {
    setProgress([]);
  }, [items]);

  // Identify which items map to a connected, enabled account.
  const eligible: { item: ContentItem; platform: string }[] = [];
  const skipped: { item: ContentItem; reason: string }[] = [];
  if (accounts) {
    for (const item of items) {
      const platform = channelToZernioPlatform(item.channel);
      if (!platform) {
        skipped.push({ item, reason: "channel not publishable" });
        continue;
      }
      const acct = accounts.find(
        (a) => a.platform === platform && a.enabled !== false && a.isActive !== false,
      );
      if (!acct) {
        skipped.push({ item, reason: `no connected ${platform}` });
        continue;
      }
      eligible.push({ item, platform });
    }
  }

  async function publishAll() {
    if (publishing) return;
    setPublishing(true);
    const useSchedule = forceSchedule || scheduleFromCalendar;
    const initial: ProgressEntry[] = [
      ...eligible.map((e) => ({ id: e.item.id, channel: e.item.channel, status: "queued" as const })),
      ...skipped.map((s) => ({
        id: s.item.id,
        channel: s.item.channel,
        status: "skip" as const,
        message: `not connected — ${s.reason}`,
      })),
    ];
    setProgress(initial);

    for (const { item } of eligible) {
      setProgress((p) =>
        p.map((e) => (e.id === item.id ? { ...e, status: "publishing" } : e)),
      );
      try {
        const res = await fetch("/api/zernio/publish", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            runId,
            itemId: item.id,
            publishNow: !useSchedule,
          }),
        });
        const body = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          postId?: string;
          error?: string;
        };
        if (!res.ok || !body.ok) {
          setProgress((p) =>
            p.map((e) =>
              e.id === item.id
                ? { ...e, status: "error", message: body.error || `HTTP ${res.status}` }
                : e,
            ),
          );
          continue;
        }
        setProgress((p) =>
          p.map((e) => (e.id === item.id ? { ...e, status: "ok", postId: body.postId } : e)),
        );
      } catch (e) {
        setProgress((p) =>
          p.map((entry) =>
            entry.id === item.id
              ? { ...entry, status: "error", message: (e as Error).message }
              : entry,
          ),
        );
      }
    }
    setPublishing(false);
  }

  if (accountsError) {
    return (
      <div className="rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-xs text-danger">
        Couldn&rsquo;t reach Zernio: {accountsError}
      </div>
    );
  }
  if (accounts === null) {
    return (
      <div className="rounded-lg border border-border bg-muted/20 px-3 py-2 text-xs text-muted-foreground inline-flex items-center gap-2">
        <Spinner /> checking connected channels…
      </div>
    );
  }

  const ok = progress.filter((p) => p.status === "ok").length;
  const errs = progress.filter((p) => p.status === "error").length;
  const labelText = (actionLabel ?? "publish all").replace(/\s*\(\d+\)\s*$/, "");
  const useSchedule = forceSchedule || scheduleFromCalendar;
  const buttonText = publishing
    ? useSchedule
      ? "scheduling…"
      : "publishing…"
    : `${labelText} (${eligible.length})`;

  return (
    <div
      className={[
        "rounded-xl border border-border bg-gradient-to-br from-card to-muted/30",
        compact ? "p-3" : "p-4",
      ].join(" ")}
    >
      <div className="flex flex-wrap items-center gap-3">
        <Stats eligible={eligible.length} skipped={skipped.length} ok={ok} errs={errs} />

        <div className="ml-auto flex items-center gap-2 flex-wrap">
          {!hideScheduleToggle && (
            <ModeToggle value={scheduleFromCalendar} onChange={setScheduleFromCalendar} />
          )}
          <button
            onClick={publishAll}
            disabled={publishing || eligible.length === 0}
            className={[
              "inline-flex items-center gap-1.5 rounded-md font-semibold disabled:opacity-50 disabled:cursor-not-allowed transition-all",
              compact ? "px-3 py-1.5 text-xs" : "px-4 py-2 text-sm",
              useSchedule
                ? "bg-info/15 hover:bg-info/25 border border-info/40 text-info"
                : "bg-accent text-accent-foreground hover:brightness-110 shadow-sm shadow-accent/20",
            ].join(" ")}
          >
            {publishing ? <Spinner /> : useSchedule ? <CalendarIcon /> : <SendIcon />}
            <span>{buttonText}</span>
          </button>
        </div>
      </div>

      {progress.length > 0 && (
        <ul className="mt-3 grid gap-1 text-xs font-mono border-t border-border/60 pt-3">
          {progress.map((p) => (
            <li key={p.id} className="flex items-center gap-2">
              <StatusDot status={p.status} />
              <span className="text-muted-foreground">{p.id}</span>
              <span className="text-foreground/80">{p.channel}</span>
              <span className={statusClass(p.status)}>{p.status}</span>
              {p.message && (
                <span className="text-muted-foreground truncate">— {p.message}</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Stats({
  eligible,
  skipped,
  ok,
  errs,
}: {
  eligible: number;
  skipped: number;
  ok: number;
  errs: number;
}) {
  return (
    <div className="text-sm flex items-center gap-2 flex-wrap">
      <span className="font-medium">{eligible}</span>
      <span className="text-muted-foreground">ready</span>
      {skipped > 0 && (
        <>
          <span className="text-muted-foreground/40">·</span>
          <span
            className="text-muted-foreground"
            title="Items whose channel has no connected Zernio account, or that aren't social channels (blog/email)."
          >
            {skipped} not connected
          </span>
        </>
      )}
      {ok > 0 && (
        <>
          <span className="text-muted-foreground/40">·</span>
          <span className="text-success font-medium">{ok} done</span>
        </>
      )}
      {errs > 0 && (
        <>
          <span className="text-muted-foreground/40">·</span>
          <span className="text-danger font-medium">{errs} failed</span>
        </>
      )}
    </div>
  );
}

function ModeToggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <div
      role="tablist"
      aria-label="Publish mode"
      className="inline-flex items-center rounded-md border border-border bg-card p-0.5 text-xs font-medium"
    >
      <button
        type="button"
        role="tab"
        aria-selected={value}
        onClick={() => onChange(true)}
        className={[
          "inline-flex items-center gap-1 rounded-[5px] px-2.5 py-1 transition-colors",
          value
            ? "bg-info/15 text-info"
            : "text-muted-foreground hover:text-foreground",
        ].join(" ")}
        title="Queue on Zernio at the calendar date"
      >
        <CalendarIcon className="h-3 w-3" />
        Schedule
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={!value}
        onClick={() => onChange(false)}
        className={[
          "inline-flex items-center gap-1 rounded-[5px] px-2.5 py-1 transition-colors",
          !value
            ? "bg-accent/20 text-accent"
            : "text-muted-foreground hover:text-foreground",
        ].join(" ")}
        title="Publish immediately on Zernio"
      >
        <SendIcon className="h-3 w-3" />
        Now
      </button>
    </div>
  );
}

function StatusDot({ status }: { status: ProgressStatus }) {
  const cls =
    status === "ok"
      ? "bg-success"
      : status === "error"
      ? "bg-danger"
      : status === "publishing"
      ? "bg-accent live-dot"
      : status === "skip"
      ? "bg-muted-foreground/40"
      : "bg-border";
  return <span className={`inline-block h-2 w-2 rounded-full ${cls}`} />;
}

function statusClass(status: ProgressStatus): string {
  switch (status) {
    case "ok":
      return "text-success";
    case "error":
      return "text-danger";
    case "publishing":
      return "text-accent";
    case "skip":
      return "text-muted-foreground";
    default:
      return "text-muted-foreground";
  }
}

function Spinner() {
  return (
    <svg
      className="h-3.5 w-3.5 animate-spin"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
    >
      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
    </svg>
  );
}

function CalendarIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className ?? "h-3.5 w-3.5"}
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

function SendIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className ?? "h-3.5 w-3.5"}
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
