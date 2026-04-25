"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { ZernioAccount } from "@/lib/zernio";
import { channelToZernioPlatform } from "@/lib/zernio";

// Channels grouped by where they live. The "always-on" group never depends on
// Zernio (they're not auto-publishable). The social group is gated by what the
// connected Zernio profile actually has.
const SOCIAL_CHANNELS = [
  "linkedin",
  "x",
  "instagram",
  "facebook",
  "whatsapp",
  "telegram",
] as const;
const ALWAYS_ON_CHANNELS = ["blog", "email"] as const;

export function BusinessForm({ defaults }: { defaults?: { name?: string; url?: string } }) {
  const router = useRouter();
  const [name, setName] = useState(defaults?.name ?? "");
  const [url, setUrl] = useState(defaults?.url ?? "");
  const [days, setDays] = useState(14);
  const [channels, setChannels] = useState<string[]>([]);
  const [hint, setHint] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Connected Zernio platforms (set of platform strings, e.g. {"facebook","telegram"}).
  const [connected, setConnected] = useState<Set<string> | null>(null);
  const [accountsError, setAccountsError] = useState<string | null>(null);
  const accountsLoading = connected === null && accountsError === null;

  useEffect(() => {
    let cancelled = false;
    fetch("/api/zernio/accounts", { cache: "no-store" })
      .then(async (r) => {
        if (!r.ok) {
          throw new Error(`accounts: ${r.status}`);
        }
        return r.json() as Promise<{ accounts: ZernioAccount[] }>;
      })
      .then(({ accounts }) => {
        if (cancelled) return;
        const set = new Set<string>();
        for (const a of accounts) {
          if (a.enabled === false || a.isActive === false) continue;
          set.add(a.platform);
        }
        setConnected(set);
        // Default-select connected social platforms + blog (most useful default).
        const defaults: string[] = [];
        for (const c of SOCIAL_CHANNELS) {
          const platform = channelToZernioPlatform(c);
          if (platform && set.has(platform)) defaults.push(c);
        }
        if (defaults.length === 0) defaults.push("blog");
        setChannels(defaults);
      })
      .catch((e) => {
        if (cancelled) return;
        setAccountsError((e as Error).message);
        // Fallback: allow blog/email so the user can still run the agent.
        setChannels(["blog"]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  function isAvailable(channel: string): boolean {
    if ((ALWAYS_ON_CHANNELS as readonly string[]).includes(channel)) return true;
    if (connected === null) return false;
    const platform = channelToZernioPlatform(channel);
    return platform !== null && connected.has(platform);
  }

  function toggleChannel(c: string) {
    if (!isAvailable(c)) return;
    setChannels((prev) => (prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          url: url.trim() || undefined,
          hints: hint.trim() ? [hint.trim()] : undefined,
          channels,
          calendar_days: days,
        }),
      });
      if (!res.ok) {
        const txt = await res.text();
        throw new Error(txt || `HTTP ${res.status}`);
      }
      const { id } = (await res.json()) as { id: string };
      router.push(`/run/${id}`);
    } catch (err) {
      setError((err as Error).message);
      setSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={onSubmit}
      className="rounded-xl border border-border bg-card/60 backdrop-blur p-6 sm:p-8 grid gap-5"
    >
      <div className="grid sm:grid-cols-2 gap-5">
        <label className="grid gap-2">
          <span className="text-sm font-medium">Business name</span>
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            placeholder="e.g. Limerence"
            className="rounded-md bg-muted/50 border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent"
          />
        </label>
        <label className="grid gap-2">
          <span className="text-sm font-medium">Website (optional)</span>
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://example.com"
            className="rounded-md bg-muted/50 border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent"
          />
        </label>
      </div>

      <label className="grid gap-2">
        <span className="text-sm font-medium">Hint for the agent (optional)</span>
        <input
          value={hint}
          onChange={(e) => setHint(e.target.value)}
          placeholder="e.g. focus on developer tooling messaging"
          className="rounded-md bg-muted/50 border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent"
        />
      </label>

      <div className="grid sm:grid-cols-[1fr_auto] gap-5 items-end">
        <div className="grid gap-2">
          <span className="text-sm font-medium">Channels</span>
          <div className="flex flex-wrap gap-2">
            {[...SOCIAL_CHANNELS, ...ALWAYS_ON_CHANNELS].map((c) => {
              const available = isAvailable(c);
              const on = channels.includes(c);
              const isSocial = (SOCIAL_CHANNELS as readonly string[]).includes(c);
              const platform = channelToZernioPlatform(c);
              const tip = !available
                ? isSocial
                  ? `No connected ${platform ?? c} account on Zernio. Connect it on the dashboard.`
                  : ""
                : "";
              return (
                <button
                  type="button"
                  key={c}
                  onClick={() => toggleChannel(c)}
                  disabled={!available}
                  title={tip}
                  className={[
                    "px-3 py-1.5 rounded-full border text-sm capitalize transition-colors",
                    !available
                      ? "bg-muted/20 text-muted-foreground/50 border-border/40 cursor-not-allowed line-through decoration-muted-foreground/40"
                      : on
                      ? "bg-accent text-accent-foreground border-accent"
                      : "bg-muted/40 text-muted-foreground border-border hover:border-accent/60",
                  ].join(" ")}
                >
                  {c}
                </button>
              );
            })}
          </div>
          <p className="text-xs text-muted-foreground">
            {accountsLoading && "loading connected accounts…"}
            {accountsError && (
              <span className="text-warning">
                couldn&rsquo;t check Zernio: {accountsError}. Blog/email still available.
              </span>
            )}
            {connected && (
              <>
                Greyed-out channels aren&rsquo;t connected on{" "}
                <a
                  href="https://zernio.com/dashboard"
                  target="_blank"
                  rel="noreferrer"
                  className="text-accent hover:underline underline-offset-2"
                >
                  Zernio
                </a>
                . Connect them there to enable.
              </>
            )}
          </p>
        </div>
        <div className="grid gap-2">
          <span className="text-sm font-medium">Calendar days</span>
          <div className="inline-flex items-stretch rounded-md border border-border bg-muted/50 overflow-hidden focus-within:ring-2 focus-within:ring-accent">
            <button
              type="button"
              onClick={() => setDays((d) => Math.max(3, d - 1))}
              disabled={days <= 3}
              aria-label="Decrease calendar days"
              className="px-3 py-2 text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed border-r border-border transition-colors"
            >
              −
            </button>
            <input
              type="number"
              min={3}
              max={30}
              value={days}
              onChange={(e) => setDays(Math.max(3, Math.min(30, Number(e.target.value) || 14)))}
              aria-label="Calendar days"
              className="no-spin w-14 bg-transparent text-center px-1 py-2 text-sm focus:outline-none"
            />
            <button
              type="button"
              onClick={() => setDays((d) => Math.min(30, d + 1))}
              disabled={days >= 30}
              aria-label="Increase calendar days"
              className="px-3 py-2 text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed border-l border-border transition-colors"
            >
              +
            </button>
          </div>
        </div>
      </div>

      {error && (
        <div className="rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
          {error}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
        <p className="text-xs text-muted-foreground">
          Country and local holidays are auto-detected from the research stage so important days
          (Eid, Ramadan, etc.) get content scheduled.
        </p>
        <button
          type="submit"
          disabled={submitting || channels.length === 0}
          className="inline-flex items-center justify-center gap-2 rounded-md bg-accent text-accent-foreground px-5 py-2.5 text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed hover:brightness-110"
        >
          {submitting ? "Starting…" : "Start agent →"}
        </button>
      </div>
    </form>
  );
}
