"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

const ALL_CHANNELS = [
  "linkedin",
  "x",
  "instagram",
  "facebook",
  "whatsapp",
  "telegram",
  "blog",
  "email",
] as const;

export function BusinessForm({ defaults }: { defaults?: { name?: string; url?: string } }) {
  const router = useRouter();
  const [name, setName] = useState(defaults?.name ?? "");
  const [url, setUrl] = useState(defaults?.url ?? "");
  const [days, setDays] = useState(14);
  const [channels, setChannels] = useState<string[]>(["linkedin", "x", "instagram", "blog"]);
  const [hint, setHint] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggleChannel(c: string) {
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
            {ALL_CHANNELS.map((c) => {
              const on = channels.includes(c);
              return (
                <button
                  type="button"
                  key={c}
                  onClick={() => toggleChannel(c)}
                  className={[
                    "px-3 py-1.5 rounded-full border text-sm capitalize transition-colors",
                    on
                      ? "bg-accent text-accent-foreground border-accent"
                      : "bg-muted/40 text-muted-foreground border-border hover:border-accent/60",
                  ].join(" ")}
                >
                  {c}
                </button>
              );
            })}
          </div>
        </div>
        <label className="grid gap-2">
          <span className="text-sm font-medium">Calendar days</span>
          <input
            type="number"
            min={3}
            max={30}
            value={days}
            onChange={(e) => setDays(Math.max(3, Math.min(30, Number(e.target.value) || 14)))}
            className="w-28 rounded-md bg-muted/50 border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent"
          />
        </label>
      </div>

      {error && (
        <div className="rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
          {error}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
        <p className="text-xs text-muted-foreground">
          The agent runs entirely server-side. No third-party APIs beyond Anthropic.
        </p>
        <button
          type="submit"
          disabled={submitting}
          className="inline-flex items-center justify-center gap-2 rounded-md bg-accent text-accent-foreground px-5 py-2.5 text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed hover:brightness-110"
        >
          {submitting ? "Starting…" : "Start agent →"}
        </button>
      </div>
    </form>
  );
}
