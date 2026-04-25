"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { BulkPublish } from "./BulkPublish";
import { ChannelBadge } from "./ChannelBadge";
import { PublishButton } from "./PublishButton";
import type {
  CalendarOutput,
  ContentItem,
  ContentOutput,
  RunState,
  ResearchOutput,
  StrategyOutput,
} from "@/lib/types";

type Tab = "research" | "strategy" | "calendar" | "content" | "verification";

export function ArtifactView({
  state,
  tab,
  onTab,
}: {
  state: RunState;
  tab: Tab;
  onTab: (t: Tab) => void;
}) {
  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <div className="border-b border-border px-2 py-1.5 flex flex-wrap gap-1">
        {(["research", "strategy", "calendar", "content", "verification"] as Tab[]).map((t) => {
          const status =
            t === "verification"
              ? state.verification.research_facts || state.verification.research
                ? "ready"
                : "pending"
              : state.stages[t]?.status === "completed"
              ? "ready"
              : state.stages[t]?.status === "running"
              ? "running"
              : "pending";
          const isActive = tab === t;
          return (
            <button
              key={t}
              onClick={() => onTab(t)}
              className={[
                "px-3 py-1.5 rounded-md text-sm capitalize transition-colors",
                isActive ? "bg-accent text-accent-foreground" : "hover:bg-muted",
              ].join(" ")}
            >
              {t}
              <span className="ml-1.5 text-[10px] font-mono opacity-70">{status === "ready" ? "✓" : status === "running" ? "•" : ""}</span>
            </button>
          );
        })}
      </div>
      <div className="p-5 sm:p-6 max-h-[68vh] overflow-y-auto">
        {tab === "research" && <ResearchView state={state} />}
        {tab === "strategy" && <StrategyView state={state} />}
        {tab === "calendar" && <CalendarView state={state} />}
        {tab === "content" && <ContentView state={state} />}
        {tab === "verification" && <VerificationView state={state} />}
      </div>
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div className="text-sm text-muted-foreground">{children}</div>;
}

function ResearchView({ state }: { state: RunState }) {
  const d = state.stages.research.output as ResearchOutput | undefined;
  if (!d) return <Empty>Research has not started yet.</Empty>;
  return (
    <div className="prose-dark">
      <h1>{d.business?.name ?? "—"}</h1>
      <p>
        <strong>URL:</strong>{" "}
        {d.business?.url ? (
          <a href={d.business.url} target="_blank" rel="noreferrer">{d.business.url}</a>
        ) : (
          "—"
        )}{" "}
        · <strong>Niche:</strong> {d.niche || "—"} · <strong>Stage:</strong> {d.business?.stage || "—"}
      </p>
      <h2>Summary</h2>
      <p>{d.business?.summary}</p>
      {d.business?.offerings?.length ? (
        <>
          <h2>Offerings</h2>
          <ul>
            {d.business.offerings.map((o, i) => (
              <li key={i}>{o}</li>
            ))}
          </ul>
        </>
      ) : null}
      {d.voice ? (
        <>
          <h2>Brand Voice</h2>
          <p><strong>Tone:</strong> {d.voice.tone}</p>
          {d.voice.do?.length ? (
            <>
              <h3>Do</h3>
              <ul>{d.voice.do.map((x, i) => <li key={i}>{x}</li>)}</ul>
            </>
          ) : null}
          {d.voice.dont?.length ? (
            <>
              <h3>Don&rsquo;t</h3>
              <ul>{d.voice.dont.map((x, i) => <li key={i}>{x}</li>)}</ul>
            </>
          ) : null}
          {d.voice.examples?.length ? (
            <>
              <h3>Examples</h3>
              <ul>{d.voice.examples.map((x, i) => <li key={i}><em>{x}</em></li>)}</ul>
            </>
          ) : null}
        </>
      ) : null}
      {d.audience?.length ? (
        <>
          <h2>Audience</h2>
          {d.audience.map((p, i) => (
            <div key={i} className="mt-3">
              <h3>{p.persona}</h3>
              <ul>
                {p.pains?.length ? <li><strong>Pains:</strong> {p.pains.join("; ")}</li> : null}
                {p.desires?.length ? <li><strong>Desires:</strong> {p.desires.join("; ")}</li> : null}
                {p.where_they_are?.length ? <li><strong>Where:</strong> {p.where_they_are.join(", ")}</li> : null}
              </ul>
            </div>
          ))}
        </>
      ) : null}
      {d.sources?.length ? (
        <>
          <h2>Sources</h2>
          <ul>
            {d.sources.map((s, i) => {
              const flag = s.supported ? "✓" : s.supported === false ? "✗" : "?";
              const cls =
                s.supported === true ? "text-success" : s.supported === false ? "text-danger/90" : "text-muted-foreground";
              return (
                <li key={i}>
                  <span className={`mr-2 font-mono ${cls}`}>[{flag}]</span>
                  <a href={s.url} target="_blank" rel="noreferrer">{s.claim}</a>
                  {s.evidence ? <span className="text-muted-foreground"> — “{s.evidence}”</span> : null}
                </li>
              );
            })}
          </ul>
        </>
      ) : null}
    </div>
  );
}

function StrategyView({ state }: { state: RunState }) {
  const s = state.stages.strategy.output as StrategyOutput | undefined;
  if (!s) return <Empty>Strategy hasn&rsquo;t produced yet.</Empty>;
  return (
    <div className="prose-dark">
      <h1>Pillars</h1>
      <div className="grid sm:grid-cols-2 gap-3 not-prose">
        {s.pillars?.map((p, i) => (
          <div key={i} className="rounded-lg border border-border bg-muted/30 p-4">
            <div className="font-medium">{p.name}</div>
            <div className="text-sm text-muted-foreground mt-1">{p.why}</div>
            {p.examples_from_voice?.length ? (
              <ul className="mt-2 text-xs text-muted-foreground space-y-0.5">
                {p.examples_from_voice.map((x, j) => (
                  <li key={j}>• {x}</li>
                ))}
              </ul>
            ) : null}
          </div>
        ))}
      </div>
      <h1 className="mt-6">Channels</h1>
      <div className="grid sm:grid-cols-2 gap-3 not-prose">
        {s.channels?.map((c, i) => (
          <div key={i} className="rounded-lg border border-border bg-muted/30 p-4">
            <div className="flex items-center gap-2"><ChannelBadge channel={c.name} /><span className="text-sm">·</span><span className="text-sm font-mono">{c.cadence?.per_week}/wk</span></div>
            <div className="text-sm text-muted-foreground mt-2">{c.why}</div>
            <div className="text-xs text-muted-foreground mt-1">Audience fit: {c.audience_fit}</div>
            {c.format_notes?.length ? (
              <ul className="mt-2 text-xs text-muted-foreground space-y-0.5">
                {c.format_notes.map((x, j) => (
                  <li key={j}>• {x}</li>
                ))}
              </ul>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}

function CalendarView({ state }: { state: RunState }) {
  const c = state.stages.calendar.output as CalendarOutput | undefined;
  if (!c?.items?.length) return <Empty>Calendar hasn&rsquo;t been built yet.</Empty>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-muted-foreground border-b border-border">
            <th className="py-2 pr-3 font-medium">#</th>
            <th className="py-2 pr-3 font-medium">Date</th>
            <th className="py-2 pr-3 font-medium">Channel</th>
            <th className="py-2 pr-3 font-medium">Pillar</th>
            <th className="py-2 pr-3 font-medium">Hook</th>
          </tr>
        </thead>
        <tbody>
          {c.items.map((it) => (
            <tr key={it.id} className="border-b border-border/50">
              <td className="py-2 pr-3 font-mono text-muted-foreground">{it.id}</td>
              <td className="py-2 pr-3 font-mono">{it.date}</td>
              <td className="py-2 pr-3"><ChannelBadge channel={it.channel} /></td>
              <td className="py-2 pr-3 text-muted-foreground">{it.pillar}</td>
              <td className="py-2 pr-3">{it.hook}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ContentCard({ item, runId }: { item: ContentItem; runId: string }) {
  return (
    <div className="rounded-lg border border-border bg-muted/20 p-4">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs font-mono text-muted-foreground">{item.id}</span>
        <ChannelBadge channel={item.channel} />
        <span className="text-xs font-mono text-muted-foreground">{item.date}</span>
        <span className="text-xs text-muted-foreground">· {item.pillar}</span>
        <span className="ml-auto flex gap-1.5 text-[10px] font-mono">
          <span className={item.lint.length_ok ? "text-success" : "text-danger"}>len</span>
          <span className={item.lint.cta_ok ? "text-success" : "text-danger"}>cta</span>
        </span>
      </div>
      <h3 className="mt-2 font-medium">{item.hook}</h3>
      <div className="prose-dark mt-2 text-sm">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{item.final}</ReactMarkdown>
      </div>
      <div className="mt-3 flex items-center justify-between gap-2">
        {item.lint.issues.length ? (
          <div className="text-[11px] text-warning">lint: {item.lint.issues.join(" · ")}</div>
        ) : (
          <span />
        )}
        <PublishButton runId={runId} itemId={item.id} channel={item.channel} />
      </div>
    </div>
  );
}

function ContentView({ state }: { state: RunState }) {
  const c = state.stages.content.output as ContentOutput | undefined;
  if (!c?.items?.length) return <Empty>Content hasn&rsquo;t been generated yet.</Empty>;
  return (
    <div className="grid gap-4">
      <BulkPublish runId={state.id} items={c.items} />
      <div className="grid sm:grid-cols-2 gap-3">
        {c.items.map((it) => (
          <ContentCard key={it.id} item={it} runId={state.id} />
        ))}
      </div>
    </div>
  );
}

function VerificationView({ state }: { state: RunState }) {
  const fc = state.verification.research_facts;
  return (
    <div className="grid gap-6">
      {fc ? (
        <section>
          <h2 className="text-base font-semibold">Fact-check (research sources)</h2>
          <p className="text-sm text-muted-foreground">
            Checked <strong>{fc.checked}</strong> sources, demoted <strong>{fc.demoted}</strong> as unsupported.
          </p>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left border-b border-border text-muted-foreground">
                  <th className="py-1.5 pr-3">#</th>
                  <th className="py-1.5 pr-3">URL</th>
                  <th className="py-1.5 pr-3">Supported</th>
                  <th className="py-1.5 pr-3">Reasoning</th>
                </tr>
              </thead>
              <tbody>
                {fc.verdicts.map((v, i) => (
                  <tr key={i} className="border-b border-border/50">
                    <td className="py-1.5 pr-3 font-mono text-muted-foreground">{v.index}</td>
                    <td className="py-1.5 pr-3 max-w-xs truncate"><a href={v.url} target="_blank" rel="noreferrer">{v.url}</a></td>
                    <td className={`py-1.5 pr-3 font-mono ${v.supported ? "text-success" : "text-danger"}`}>{v.supported ? "✓" : "✗"}</td>
                    <td className="py-1.5 pr-3 text-muted-foreground">{v.reasoning ?? ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {(["research", "strategy", "calendar", "content"] as const).map((s) => {
        const v = state.verification[s];
        if (!v) return null;
        return (
          <section key={s}>
            <h2 className="text-base font-semibold capitalize">{s} critic</h2>
            <p className="text-sm text-muted-foreground">
              Score <strong className={v.pass ? "text-success" : "text-warning"}>{v.score}</strong> ·{" "}
              {v.revisions} revision{v.revisions === 1 ? "" : "s"}
              {v.rounds.length > 1 ? <> · progression {v.rounds.map((r) => r.score).join(" → ")}</> : null}
            </p>
            {v.issues.length ? (
              <ul className="mt-2 text-sm text-muted-foreground space-y-1">
                {v.issues.map((it, i) => (
                  <li key={i}>
                    <span className="text-warning font-mono mr-2">[{it.severity}]</span>
                    <span className="font-medium">{it.where}:</span> {it.fix}
                  </li>
                ))}
              </ul>
            ) : null}
          </section>
        );
      })}

      <section>
        <h2 className="text-base font-semibold">Token usage</h2>
        <div className="mt-2 grid grid-cols-2 sm:grid-cols-4 gap-3">
          {Object.entries(state.tokens).map(([k, v]) => (
            <div key={k} className="rounded-md border border-border bg-muted/30 p-3">
              <div className="text-xs text-muted-foreground capitalize">{k.replace("_", " ")}</div>
              <div className="text-lg font-mono">{v.toLocaleString()}</div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
