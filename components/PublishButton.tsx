"use client";

import { useEffect, useState } from "react";
import { channelToZernioPlatform } from "@/lib/zernio";
import type { ZernioAccount } from "@/lib/zernio";

interface Props {
  runId: string;
  itemId: string;
  channel: string;
}

type State =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "no-account"; platform: string }
  | { kind: "no-mapping" }
  | { kind: "ready"; account: ZernioAccount }
  | { kind: "publishing" }
  | { kind: "published"; postId: string }
  | { kind: "error"; message: string };

export function PublishButton({ runId, itemId, channel }: Props) {
  const [state, setState] = useState<State>({ kind: "idle" });

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
    setState({ kind: "publishing" });
    try {
      const res = await fetch("/api/zernio/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ runId, itemId, publishNow: true }),
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
      setState({ kind: "published", postId: body.postId ?? "" });
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
    return <span className="text-[10px] font-mono text-muted-foreground">checking…</span>;
  }
  if (state.kind === "no-account") {
    return (
      <a
        href="https://zernio.com/dashboard"
        target="_blank"
        rel="noreferrer"
        className="text-[11px] font-medium text-warning underline-offset-2 hover:underline"
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
        className="text-[11px] font-medium rounded-md border border-accent/40 bg-accent/15 text-accent px-2 py-1"
      >
        publishing…
      </button>
    );
  }
  if (state.kind === "published") {
    return (
      <span className="text-[11px] font-mono text-success" title={state.postId}>
        ✓ published
      </span>
    );
  }
  if (state.kind === "error") {
    return (
      <button
        onClick={publish}
        className="text-[11px] font-medium text-danger underline-offset-2 hover:underline"
        title={state.message}
      >
        retry · {state.message.slice(0, 40)}
      </button>
    );
  }
  if (state.kind === "ready") {
    return (
      <button
        onClick={publish}
        className="text-[11px] font-medium rounded-md border border-accent/40 bg-accent/15 hover:bg-accent/25 text-accent px-2 py-1"
        title={`Publish via ${state.account.username ?? state.account.platform} on Zernio`}
      >
        publish via Zernio
      </button>
    );
  }
  // idle — initial render before the useEffect fires
  return null;
}
