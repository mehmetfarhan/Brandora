// Calendar stage — dated items per channel with cadence cap enforced after.

import { MODEL_OPUS, cacheBlock, call, parseJsonBlock } from "../anthropic";
import type { BusinessInput, CalendarOutput, ResearchOutput, StrategyOutput } from "../types";
import type { StageResult } from "./research";

const SYSTEM = `You are a content planner. Produce a dated content calendar that respects the channel cadences and pillar coverage.

Rules:
- Spread pillars evenly across the calendar — no two consecutive items on the same pillar/channel pair.
- Hooks must be specific to the business and pillar, not generic clickbait.
- Output ONLY one JSON object, no prose.`;

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function addDays(iso: string, days: number): string {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export async function runCalendar(
  dossier: ResearchOutput,
  strategy: StrategyOutput,
  input: BusinessInput,
): Promise<StageResult<CalendarOutput>> {
  const days = input.calendar_days ?? 14;
  const start = todayIso();
  const end = addDays(start, days - 1);

  const user = `Strategy:
\`\`\`json
${JSON.stringify(strategy, null, 2)}
\`\`\`

Plan a ${days}-day calendar starting ${start}. Distribute items by each channel's \`per_week\` cadence.

Schema:
\`\`\`json
{
  "items": [
    {"id": str, "date": "YYYY-MM-DD", "channel": str, "pillar": str,
      "brief": str, "hook": str, "cta": str}
  ]
}
\`\`\`

Return only the JSON object.`;

  const system = [
    cacheBlock(SYSTEM),
    cacheBlock("RESEARCH DOSSIER:\n" + JSON.stringify(dossier, null, 2)),
  ];

  const result = await call({
    model: MODEL_OPUS,
    system,
    messages: [{ role: "user", content: user }],
    max_tokens: 6144,
    temperature: 0.5,
  });

  const out = parseJsonBlock(result.text) as CalendarOutput;

  // Cadence cap (deterministic): channel.per_week * (days / 7) max items per channel.
  const caps: Record<string, number> = Object.fromEntries(
    strategy.channels.map((c) => [c.name, Math.max(1, Math.floor(c.cadence.per_week * (days / 7)))]),
  );
  const counts: Record<string, number> = {};
  const kept: typeof out.items = [];
  for (const item of out.items ?? []) {
    const cap = caps[item.channel];
    const c = counts[item.channel] ?? 0;
    if (cap && c >= cap) continue;
    counts[item.channel] = c + 1;
    kept.push(item);
  }

  // Re-id sequentially & clamp dates into window.
  for (let i = 0; i < kept.length; i++) {
    const it = kept[i];
    it.id = String(i + 1).padStart(3, "0");
    if (typeof it.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(it.date) || it.date < start || it.date > end) {
      it.date = start;
    }
  }
  out.items = kept;

  return { output: out, usage: result.usage, toolCalls: 0 };
}
