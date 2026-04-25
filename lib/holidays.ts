// Holiday / cultural-day lookup. We ask Claude (no tools, low temperature)
// to enumerate the major public holidays and culturally important days for
// a country across a date range. The agent uses these to anchor content on
// days the audience cares about (Eid al-Fitr, Independence Day, etc.).

import { MODEL_OPUS, cacheBlock, call, parseJsonBlock } from "./anthropic";
import type { ScheduleOccasion, TokenUsage } from "./types";

const SYSTEM = `You are an authority on national, religious, and cultural calendars. You list major public holidays and widely-observed religious / cultural days for a given country across a date range.

Rules:
- Only return days that fall WITHIN the requested date range (inclusive).
- Use ISO 8601 dates (YYYY-MM-DD).
- Cover: national public holidays, major religious holidays observed by the local majority (e.g. Eid al-Fitr, Eid al-Adha, Ramadan start/mid/end days, Christmas, Easter), and globally significant marketing days that resonate locally (e.g. Mother's Day, New Year).
- For multi-day occasions, list each day separately ("Eid al-Fitr Day 1", "Day 2", "Day 3").
- Names: short, English. Add a one-line "notes" field with brief context when useful (e.g. "fasting begins").
- Output ONLY a JSON object {"occasions": [...]}, no prose.`;

const USER = (country: string, start: string, end: string) => `Country: ${country}
Date range: ${start} to ${end} (inclusive)

Schema:
\`\`\`json
{
  "occasions": [
    {"date": "YYYY-MM-DD", "name": "Eid al-Fitr Day 1", "notes": "..."}
  ]
}
\`\`\`

Return only the JSON object.`;

export interface HolidaysResult {
  occasions: ScheduleOccasion[];
  usage: TokenUsage;
}

/** Look up culturally important days for a country in [start, end]. Returns
 * an empty list (and zero usage) on failure rather than throwing — the
 * pipeline can still produce a calendar without holidays. */
export async function lookupHolidays(
  country: string,
  start: string,
  end: string,
): Promise<HolidaysResult> {
  if (!country || country.trim().length < 2) {
    return { occasions: [], usage: { input: 0, output: 0, cache_read: 0, cache_create: 0 } };
  }
  try {
    const result = await call({
      model: MODEL_OPUS,
      system: [cacheBlock(SYSTEM)],
      messages: [{ role: "user", content: USER(country, start, end) }],
      max_tokens: 2048,
      temperature: 0.1,
    });
    const parsed = parseJsonBlock(result.text) as { occasions?: ScheduleOccasion[] };
    const occasions = Array.isArray(parsed.occasions) ? parsed.occasions : [];
    // Filter to the requested window defensively.
    const filtered = occasions.filter(
      (o) => typeof o.date === "string" && o.date >= start && o.date <= end && o.name,
    );
    return { occasions: filtered, usage: result.usage };
  } catch {
    return { occasions: [], usage: { input: 0, output: 0, cache_read: 0, cache_create: 0 } };
  }
}
