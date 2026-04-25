"use client";

import { ChannelBadge } from "./ChannelBadge";
import { ScheduleView } from "./ScheduleView";
import type {
  RunState,
  ResearchOutput,
  StrategyOutput,
} from "@/lib/types";

type Tab = "research" | "strategy" | "schedule" | "verification";

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
        {(["research", "strategy", "schedule", "verification"] as Tab[]).map((t) => {
          const status =
            t === "verification"
              ? state.verification.research_facts || state.verification.research
                ? "ready"
                : "pending"
              : t === "schedule"
              ? state.stages.calendar?.status === "completed" || state.stages.content?.status === "completed"
                ? "ready"
                : state.stages.calendar?.status === "running" || state.stages.content?.status === "running"
                ? "running"
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
        {tab === "schedule" && <ScheduleView state={state} />}
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
      {d.business?.assets && d.business.assets.length > 0 ? (
        <BrandAssetsGallery state={state} assets={d.business.assets} />
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

function BrandAssetsGallery({
  state,
  assets,
}: {
  state: RunState;
  assets: NonNullable<ResearchOutput["business"]["assets"]>;
}) {
  const ok = assets.filter((a) => a.filename && !a.error);
  const failed = assets.filter((a) => !a.filename || a.error);

  function kindOrder(k: string | undefined): number {
    const order = ["logo", "icon", "hero", "product", "team", "social", "ad"];
    const idx = order.indexOf(k ?? "");
    return idx === -1 ? 99 : idx;
  }
  const sorted = [...ok].sort((a, b) => kindOrder(a.kind) - kindOrder(b.kind));

  return (
    <>
      <h2>Brand assets</h2>
      <p className="text-sm text-muted-foreground -mt-1">
        {ok.length} downloaded · {failed.length > 0 ? `${failed.length} skipped` : "ready to reuse on posts or as references for image/video generation"}
      </p>
      <div className="not-prose mt-4 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        {sorted.map((a, i) => (
          <BrandAssetCard key={`${a.filename}-${i}`} runId={state.id} asset={a} />
        ))}
      </div>
      {failed.length > 0 ? (
        <details className="mt-3 not-prose">
          <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground">
            {failed.length} assets couldn&rsquo;t be saved (403, oversize, etc.)
          </summary>
          <ul className="mt-2 text-xs text-muted-foreground space-y-1 font-mono">
            {failed.map((a, i) => (
              <li key={i} className="truncate">
                <span className="text-warning mr-2">{a.kind ?? "?"}</span>
                <span className="text-foreground">{a.url}</span> — {a.error}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </>
  );
}

function BrandAssetCard({
  runId,
  asset,
}: {
  runId: string;
  asset: NonNullable<ResearchOutput["business"]["assets"]>[number];
}) {
  const src = asset.publicPath ?? `/api/run/${runId}/assets/${asset.filename}`;
  const isVideo = (asset.contentType ?? "").startsWith("video/");
  const sizeKb = asset.bytes ? Math.round(asset.bytes / 1024) : null;
  return (
    <a
      href={src}
      target="_blank"
      rel="noreferrer"
      className="group rounded-lg border border-border bg-muted/30 overflow-hidden hover:border-accent/60 transition-colors"
      title={asset.description ?? asset.url}
    >
      <div className="aspect-square bg-card flex items-center justify-center overflow-hidden">
        {isVideo ? (
          // eslint-disable-next-line jsx-a11y/media-has-caption
          <video src={src} className="max-h-full max-w-full object-contain" muted playsInline />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={src}
            alt={asset.description ?? asset.kind ?? "brand asset"}
            className="max-h-full max-w-full object-contain"
          />
        )}
      </div>
      <div className="px-3 py-2 text-xs">
        <div className="flex items-center justify-between gap-2">
          <span className="font-mono text-muted-foreground uppercase tracking-wide text-[10px]">
            {asset.kind ?? "asset"}
          </span>
          {sizeKb !== null && (
            <span className="font-mono text-[10px] text-muted-foreground">{sizeKb} KB</span>
          )}
        </div>
        {asset.description ? (
          <div className="mt-1 text-foreground line-clamp-2 group-hover:text-accent">
            {asset.description}
          </div>
        ) : null}
      </div>
    </a>
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
