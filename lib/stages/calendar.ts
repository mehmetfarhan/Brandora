// Calendar stage — dated items per channel, holiday-aware, with shared idea
// per day across the selected channels.

import { MODEL_OPUS, cacheBlock, call, parseJsonBlock, addUsage } from "../anthropic";
import { lookupHolidays } from "../holidays";
import type {
  BusinessInput,
  CalendarItem,
  CalendarOutput,
  ResearchOutput,
  ScheduleOccasion,
  StrategyOutput,
  TokenUsage,
} from "../types";
import type { StageResult } from "./research";

const SYSTEM = `You are a content planner. Produce a dated content calendar that respects the channel cadences and pillar coverage, and leans into important local days.

Rules:
- Each posting day has ONE shared idea — same pillar, hook, and CTA across all channels you pick for that day. Channels just give it different shape.
- For every channel selected for a posting day, emit ONE item (so 3 channels on the same day = 3 items with identical pillar/hook/cta but channel-specific brief).
- Use the holiday list to anchor important days (e.g. Eid, Ramadan, Independence Day). When an item lands on a holiday, set "occasion" to the holiday's name. Don't force every holiday — only the ones that genuinely fit the brand.
- Spread pillars across non-holiday days — no two consecutive non-holiday posting days on the same pillar.
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

  // Selected channels: prefer what strategy actually mapped to (only those
  // also present in the user's selection). The strategy may have filtered the
  // user's input down to what fits — respect that, but cap to user input too.
  const userChannels = new Set((input.channels ?? []).map((c) => c.toLowerCase()));
  const stratChannelNames = strategy.channels.map((c) => c.name);
  const channels = userChannels.size === 0
    ? stratChannelNames
    : stratChannelNames.filter((n) => {
        const low = n.toLowerCase();
        // tolerate "facebook (Page Name)" matching "facebook" in the input.
        for (const u of userChannels) if (low.includes(u)) return true;
        return false;
      });

  // Holiday lookup based on detected country.
  const country = (dossier.business.country ?? "").trim();
  const holidays = await lookupHolidays(country, start, end);
  let usage: TokenUsage = holidays.usage;

  const occasionsBlock = holidays.occasions.length
    ? `Important days in ${country || "the audience country"} between ${start} and ${end}:\n` +
      holidays.occasions
        .map((o) => `- ${o.date} — ${o.name}${o.notes ? " (" + o.notes + ")" : ""}`)
        .join("\n")
    : country
    ? `No major local holidays found for ${country} between ${start} and ${end}; pick posting dates by cadence.`
    : `Country unknown; pick posting dates by cadence.`;

  const user = `Strategy:
\`\`\`json
${JSON.stringify(strategy, null, 2)}
\`\`\`

Selected channels (planner must use ALL of these per posting day): ${channels.join(", ")}
Country (for holiday alignment): ${country || "unknown"}
Date window: ${start} to ${end} (${days} days)

${occasionsBlock}

Plan the ${days}-day calendar. For each posting day:
1. Pick a pillar + a single hook + a single CTA.
2. Emit ONE item per selected channel (so ${channels.length} items per posting day) with the SAME pillar/hook/cta and a channel-specific brief.
3. Set "group_id" to a short stable id shared by every item on the same day (e.g. "g01", "g02"…).
4. If the day matches a holiday above, set "occasion" to that holiday's name.

Each channel's cadence (per_week) bounds how many posting days it appears on across the window. Spread accordingly.

Schema:
\`\`\`json
{
  "country": str,
  "occasions": [{"date": "YYYY-MM-DD", "name": str, "notes": str}],
  "items": [
    {"id": str, "group_id": str, "date": "YYYY-MM-DD", "channel": str,
      "pillar": str, "brief": str, "hook": str, "cta": str, "occasion": str}
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
    max_tokens: 8192,
    temperature: 0.5,
  });
  usage = addUsage(usage, result.usage);

  const out = parseJsonBlock(result.text) as CalendarOutput;

  // Always carry the country and occasions through, even if the model omitted them.
  if (!out.country && country) out.country = country;
  if (!out.occasions || out.occasions.length === 0) {
    out.occasions = holidays.occasions as ScheduleOccasion[];
  }

  // Cadence cap (deterministic): channel.per_week * (days / 7) max items per channel.
  const caps: Record<string, number> = Object.fromEntries(
    strategy.channels.map((c) => [c.name, Math.max(1, Math.floor(c.cadence.per_week * (days / 7)))]),
  );
  const counts: Record<string, number> = {};
  const kept: CalendarItem[] = [];
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

  return { output: out, usage, toolCalls: 0 };
}
