# Pipeline — The Agent Lab Web App

Production-style web app for The Agent Lab hackathon (Amman, 2026-04-25).

A single autonomous agent that, given a business, runs **Research → Strategy → Calendar → Content** with self-verification at every stage. The whole pipeline streams to the browser in real time over Server-Sent Events.

## Run it

```bash
cp .env.example .env.local        # paste your ANTHROPIC_API_KEY
npm install
npm run dev                        # http://localhost:3000
```

To smoke-test without typing in the form, open `http://localhost:3000`, fill in `Limerence` + `https://limerence.sh`, and hit start.

## How it scores against the rubric

| Criterion | Weight | Where it lives |
|---|---|---|
| Self-Verification | **25%** | `lib/verify/critic.ts` (critic→revise loop) + `lib/verify/facts.ts` (re-fetches every cited URL). |
| Content Quality | **25%** | `lib/stages/content.ts` deterministic per-channel lint + revise pass before brand-voice critic. |
| Research Depth | 20% | `lib/stages/research.ts` Opus + `web_search` + `web_fetch`. |
| Pipeline Completeness | 20% | `lib/pipeline.ts` orchestrates all four stages end-to-end. |
| Tech | 5% | Next.js 16, Anthropic SDK, prompt caching on system + frozen dossier, SSE streaming, atomic JSON checkpointing. |
| Demo | 5% | The web app you're running. |

## Architecture

```
app/
├── page.tsx                       # Landing + business form
├── run/[id]/page.tsx              # Live run view (server) → RunView (client)
└── api/run/
    ├── route.ts                   # POST start run, GET list
    └── [id]/
        ├── route.ts               # GET run state
        └── events/route.ts        # SSE stream
lib/
├── anthropic.ts                   # Anthropic client; web_search/web_fetch tools; cache_control; retry
├── runs.ts                        # In-memory store + per-run event bus + state.json on disk
├── pipeline.ts                    # Orchestrator: stages + critic + fact-check
├── stages/{research,strategy,calendar,content}.ts
└── verify/{critic,facts,rubrics}.ts
components/
├── BusinessForm.tsx               # Landing form
├── RunView.tsx                    # Subscribes to SSE, drives the live page
├── StageTracker.tsx               # Four-stage progress with critic chips
├── EventStream.tsx                # Live event log feed
├── ArtifactView.tsx               # Tabbed dossier / strategy / calendar / content / verification
└── ChannelBadge.tsx               # Channel-tinted pills
```

## Demo flow

1. Open `/`, type business name, hit start.
2. You're redirected to `/run/<id>`. The four stages tick green left-to-right.
3. The right panel shows live tool calls, fact-check verdicts, critic scores.
4. The center auto-advances tabs (Research → Strategy → Calendar → Content → Verification).
5. The Verification tab is the moneyshot: demoted research claims and a critic score progression like `62 → 84` show the agent fixed its own work.

## Notes

- Runs persist to `.runs/<id>/state.json`, so refreshing the run page works.
- `web_fetch` is a beta server tool. If your key doesn't have it, research falls back to `web_search` only.
- For a hackathon demo, pick a business with substantial public copy (sponsor sites work well).
