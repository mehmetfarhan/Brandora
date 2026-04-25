"use client";

import { useEffect, useState } from "react";
import { channelToZernioPlatform } from "@/lib/zernio";
import type { ZernioAccount } from "@/lib/zernio";
import type { ContentItem } from "@/lib/types";

interface ProgressEntry {
  id: string;
  channel: string;
  status: "queued" | "publishing" | "ok" | "skip" | "error";
  message?: string;
  postId?: string;
}

export function BulkPublish({ runId, items }: { runId: string; items: ContentItem[] }) {
  const [accounts, setAccounts] = useState<ZernioAccount[] | null>(null);
  const [accountsError, setAccountsError] = useState<string | null>(null);
  const [progress, setProgress] = useState<ProgressEntry[]>([]);
  const [publishing, setPublishing] = useState(false);
  const [scheduleFromCalendar, setScheduleFromCalendar] = useState(false);

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
    const initial: ProgressEntry[] = [
      ...eligible.map((e) => ({ id: e.item.id, channel: e.item.channel, status: "queued" as const })),
      ...skipped.map((s) => ({
        id: s.item.id,
        channel: s.item.channel,
        status: "skip" as const,
        message: s.reason,
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
            publishNow: !scheduleFromCalendar,
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
      <div className="rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-xs text-danger">
        Couldn&rsquo;t reach Zernio: {accountsError}
      </div>
    );
  }
  if (accounts === null) {
    return <div className="text-xs text-muted-foreground">checking connected channels…</div>;
  }

  const ok = progress.filter((p) => p.status === "ok").length;
  const errs = progress.filter((p) => p.status === "error").length;

  return (
    <div className="rounded-lg border border-border bg-muted/20 p-3 flex flex-wrap items-center gap-3">
      <div className="text-sm">
        <span className="font-medium">{eligible.length}</span> ready,{" "}
        <span className="text-muted-foreground">{skipped.length} skipped</span>
        {progress.length > 0 && (
          <>
            {" "}
            · <span className="text-success">{ok} published</span>
            {errs > 0 && <> · <span className="text-danger">{errs} failed</span></>}
          </>
        )}
      </div>
      <label className="text-xs text-muted-foreground inline-flex items-center gap-1.5 ml-auto">
        <input
          type="checkbox"
          checked={scheduleFromCalendar}
          onChange={(e) => setScheduleFromCalendar(e.target.checked)}
          className="accent-accent"
        />
        schedule per calendar date (instead of publish now)
      </label>
      <button
        onClick={publishAll}
        disabled={publishing || eligible.length === 0}
        className="rounded-md bg-accent text-accent-foreground text-sm font-semibold px-3 py-1.5 disabled:opacity-50 disabled:cursor-not-allowed hover:brightness-110"
      >
        {publishing ? "publishing…" : `publish all (${eligible.length})`}
      </button>
      {progress.length > 0 && (
        <ul className="basis-full mt-2 grid sm:grid-cols-2 gap-1 text-xs font-mono">
          {progress.map((p) => (
            <li
              key={p.id}
              className={
                p.status === "ok"
                  ? "text-success"
                  : p.status === "error"
                  ? "text-danger"
                  : p.status === "publishing"
                  ? "text-info"
                  : p.status === "skip"
                  ? "text-muted-foreground"
                  : "text-muted-foreground"
              }
            >
              {p.id} · {p.channel} · {p.status}
              {p.message ? ` — ${p.message.slice(0, 80)}` : ""}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
