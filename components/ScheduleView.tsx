"use client";

import { useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { BulkPublish } from "./BulkPublish";
import { ChannelBadge } from "./ChannelBadge";
import { PublishButton } from "./PublishButton";
import type {
  CalendarItem,
  CalendarOutput,
  ContentItem,
  ContentOutput,
  RunState,
} from "@/lib/types";

const DOW_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function isoToDate(iso: string): Date {
  // Use UTC midnight to avoid TZ drift on grid math.
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, (m || 1) - 1, d || 1));
}

function dateToIso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function addDaysIso(iso: string, n: number): string {
  const d = isoToDate(iso);
  d.setUTCDate(d.getUTCDate() + n);
  return dateToIso(d);
}

interface ScheduleEntry extends CalendarItem {
  // Optional content fields when the content stage has produced a draft.
  draft?: string;
  final?: string;
  lint?: ContentItem["lint"];
}

export function ScheduleView({ state }: { state: RunState }) {
  const cal = state.stages.calendar.output as CalendarOutput | undefined;
  const content = state.stages.content.output as ContentOutput | undefined;

  // Merge: prefer content items (they have draft/final), fall back to calendar
  // items so partial runs still render the planning even before content is done.
  const merged: ScheduleEntry[] = useMemo(() => {
    if (content?.items?.length) return content.items as ScheduleEntry[];
    if (cal?.items?.length) return cal.items as ScheduleEntry[];
    return [];
  }, [cal, content]);

  // Group by date.
  const byDate = useMemo(() => {
    const m = new Map<string, ScheduleEntry[]>();
    for (const it of merged) {
      const arr = m.get(it.date) ?? [];
      arr.push(it);
      m.set(it.date, arr);
    }
    // Sort each day's items by group then channel for stable layout.
    for (const arr of m.values()) {
      arr.sort((a, b) => {
        const g = (a.group_id ?? "").localeCompare(b.group_id ?? "");
        if (g !== 0) return g;
        return a.channel.localeCompare(b.channel);
      });
    }
    return m;
  }, [merged]);

  // Holiday map: ISO date → name.
  const occasions = useMemo(() => {
    const m = new Map<string, string>();
    for (const o of cal?.occasions ?? []) m.set(o.date, o.name);
    return m;
  }, [cal?.occasions]);

  // Compute the grid: pad min/max dates to week boundaries (Sun..Sat).
  const grid = useMemo(() => {
    const dates = [...byDate.keys()].sort();
    if (dates.length === 0) return null;
    const first = dates[0];
    const last = dates[dates.length - 1];
    const firstDate = isoToDate(first);
    const lastDate = isoToDate(last);
    // Pad start back to Sunday (UTC), end forward to Saturday.
    const padStart = firstDate.getUTCDay();
    const padEnd = 6 - lastDate.getUTCDay();
    const startIso = addDaysIso(first, -padStart);
    const endIso = addDaysIso(last, padEnd);
    const out: { iso: string; inWindow: boolean }[] = [];
    for (let cur = startIso; cur <= endIso; cur = addDaysIso(cur, 1)) {
      out.push({ iso: cur, inWindow: cur >= first && cur <= last });
    }
    return { cells: out, first, last };
  }, [byDate]);

  const [selected, setSelected] = useState<string | null>(() => {
    const dates = [...byDate.keys()].sort();
    return dates[0] ?? null;
  });

  const allItems: ContentEntryWithFinal[] = useMemo(() => {
    return merged
      .filter((m) => !!m.final && m.final.length > 0)
      .map((m) => ({
        ...m,
        draft: m.draft ?? "",
        final: m.final ?? "",
        lint: m.lint ?? { length_ok: true, cta_ok: true, voice_ok: null, issues: [] },
      }));
  }, [merged]);

  if (!grid) {
    return <div className="text-sm text-muted-foreground">Schedule hasn&rsquo;t been planned yet.</div>;
  }

  const headerInfo: string[] = [];
  if (cal?.country) headerInfo.push(cal.country);
  if (occasions.size > 0) headerInfo.push(`${occasions.size} important day${occasions.size === 1 ? "" : "s"}`);
  headerInfo.push(`${byDate.size} posting day${byDate.size === 1 ? "" : "s"}`);
  headerInfo.push(`${merged.length} post${merged.length === 1 ? "" : "s"}`);

  return (
    <div className="grid gap-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="text-xs font-mono text-muted-foreground">{headerInfo.join("  ·  ")}</div>
        {allItems.length > 0 && (
          <details className="group text-xs">
            <summary className="cursor-pointer rounded-md border border-border bg-card hover:border-accent/60 px-2.5 py-1 text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 list-none [&::-webkit-details-marker]:hidden">
              <span>schedule entire calendar</span>
              <span className="text-[10px] opacity-60 group-open:rotate-180 transition-transform">▾</span>
            </summary>
            <div className="mt-2 max-w-xl">
              <BulkPublish
                runId={state.id}
                items={allItems}
                actionLabel="schedule all"
                forceSchedule
                hideScheduleToggle
                compact
              />
              <p className="mt-1 text-[11px] text-muted-foreground">
                Queues every post on Zernio at its scheduled calendar date instead of publishing now.
              </p>
            </div>
          </details>
        )}
      </div>

      {/* Calendar grid */}
      <div className="rounded-lg border border-border bg-card overflow-hidden">
        <div className="grid grid-cols-7 text-[11px] font-mono uppercase text-muted-foreground border-b border-border">
          {DOW_LABELS.map((l) => (
            <div key={l} className="px-2 py-1.5 text-center">
              {l}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {grid.cells.map(({ iso, inWindow }) => {
            const items = byDate.get(iso);
            const has = !!items?.length;
            const occasion = occasions.get(iso);
            const isSelected = iso === selected;
            const dayOfMonth = Number(iso.slice(8, 10));
            return (
              <button
                key={iso}
                type="button"
                onClick={() => has && setSelected(iso)}
                disabled={!has}
                className={[
                  "aspect-[1.4/1] border-r border-b border-border/60 px-2 py-1.5 flex flex-col items-start gap-1 text-left transition-colors",
                  !inWindow ? "opacity-30" : "",
                  has ? "cursor-pointer hover:bg-muted/40" : "cursor-default",
                  isSelected ? "bg-accent/15 ring-1 ring-accent/40 z-10" : "",
                  occasion ? "bg-warning/5" : "",
                ].join(" ")}
              >
                <div className="flex items-center justify-between w-full">
                  <span className="text-xs font-mono text-muted-foreground">{dayOfMonth}</span>
                  {has && (
                    <span className="text-[10px] font-mono text-accent">{items!.length}</span>
                  )}
                </div>
                {occasion && (
                  <span className="text-[10px] font-medium text-warning leading-tight">
                    🌙 {occasion}
                  </span>
                )}
                {has && !occasion && (
                  <div className="flex flex-wrap gap-0.5">
                    {Array.from(new Set(items!.map((i) => i.channel.split(/[\s(]/)[0]))).slice(0, 4).map((c) => (
                      <span key={c} className="inline-block h-1.5 w-1.5 rounded-full bg-accent/60" title={c} />
                    ))}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Selected day expansion */}
      {selected && byDate.get(selected) && (
        <SelectedDay
          iso={selected}
          occasion={occasions.get(selected)}
          items={byDate.get(selected)!}
          runId={state.id}
        />
      )}
    </div>
  );
}

interface ContentEntryWithFinal extends ContentItem {}

function SelectedDay({
  iso,
  occasion,
  items,
  runId,
}: {
  iso: string;
  occasion?: string;
  items: ScheduleEntry[];
  runId: string;
}) {
  // Group items by group_id (or fall back to hook so old runs still work).
  const groups = useMemo(() => {
    const m = new Map<string, ScheduleEntry[]>();
    for (const it of items) {
      const key = it.group_id || it.hook || it.id;
      const arr = m.get(key) ?? [];
      arr.push(it);
      m.set(key, arr);
    }
    return [...m.values()];
  }, [items]);

  // Items that have a final draft can be published. Anything still pre-draft
  // is filtered out of the bulk action to avoid sending empty content.
  const publishable: ContentEntryWithFinal[] = useMemo(() => {
    return items
      .filter((it) => !!it.final && it.final.length > 0)
      .map((it) => ({
        ...it,
        draft: it.draft ?? "",
        final: it.final ?? "",
        lint: it.lint ?? { length_ok: true, cta_ok: true, voice_ok: null, issues: [] },
      }));
  }, [items]);

  const dateLabel = formatDayLabel(iso);

  return (
    <section className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <div className="text-xs font-mono text-muted-foreground">{iso}</div>
          <div className="font-semibold tracking-tight">
            {occasion ? (
              <span className="text-warning">🌙 {occasion}</span>
            ) : (
              "Posting day"
            )}
          </div>
        </div>
        <div className="text-xs text-muted-foreground">
          {items.length} post{items.length === 1 ? "" : "s"} · {groups.length} idea
          {groups.length === 1 ? "" : "s"}
        </div>
      </div>

      {publishable.length > 0 && (
        <div className="mt-3">
          <BulkPublish
            runId={runId}
            items={publishable}
            actionLabel={`publish all on ${dateLabel}`}
            compact
          />
        </div>
      )}

      <div className="mt-4 grid gap-5">
        {groups.map((group, gi) => (
          <DayIdea key={gi} runId={runId} group={group} />
        ))}
      </div>
    </section>
  );
}

function formatDayLabel(iso: string): string {
  // "2026-04-30" → "Apr 30"
  const d = isoToDate(iso);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

function DayIdea({ runId, group }: { runId: string; group: ScheduleEntry[] }) {
  const head = group[0];
  return (
    <div className="rounded-md border border-border/60 bg-muted/20 p-4">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{head.pillar}</div>
      <h3 className="mt-1 font-semibold">{head.hook}</h3>
      {head.cta && <p className="text-xs text-muted-foreground mt-1">CTA: {head.cta}</p>}

      <div className="mt-3 grid sm:grid-cols-2 gap-3">
        {group.map((item) => (
          <ChannelRendition key={item.id} runId={runId} item={item} />
        ))}
      </div>
    </div>
  );
}

function ChannelRendition({ runId, item }: { runId: string; item: ScheduleEntry }) {
  const hasDraft = !!item.final && item.final.length > 0;
  return (
    <div className="rounded-md border border-border bg-card p-3">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-[11px] font-mono text-muted-foreground">{item.id}</span>
        <ChannelBadge channel={item.channel} />
        {item.lint && (
          <span className="ml-auto flex gap-1.5 text-[10px] font-mono">
            <span className={item.lint.length_ok ? "text-success" : "text-danger"}>len</span>
            <span className={item.lint.cta_ok ? "text-success" : "text-danger"}>cta</span>
          </span>
        )}
      </div>
      {hasDraft ? (
        <div className="prose-dark mt-2 text-xs">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{item.final ?? ""}</ReactMarkdown>
        </div>
      ) : (
        <p className="mt-2 text-xs text-muted-foreground italic">{item.brief}</p>
      )}
      <div className="mt-3 flex items-center justify-between gap-2">
        {item.lint?.issues?.length ? (
          <div className="text-[10px] text-warning">{item.lint.issues.join(" · ")}</div>
        ) : (
          <span />
        )}
        {hasDraft && <PublishButton runId={runId} itemId={item.id} channel={item.channel} />}
      </div>
    </div>
  );
}
