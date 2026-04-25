// Research stage — Opus + web_search + web_fetch (with web_search-only fallback).

import {
  MODEL_OPUS,
  WEB_FETCH_TOOL,
  WEB_SEARCH_TOOL,
  cacheBlock,
  call,
  parseJsonBlock,
} from "../anthropic";
import type { BusinessInput, ResearchOutput, TokenUsage } from "../types";

const SYSTEM = `You are a senior brand researcher. Given a business, you produce a rigorous, evidence-backed dossier.

Rules:
- Use web_search and web_fetch to gather real, citable facts. Prefer the company's own site, then reputable third parties.
- Every non-trivial claim MUST be tied to a source URL. If you cannot find evidence, say so — do NOT invent.
- Capture brand voice from actual copy on their website / posts, not from your imagination.
- Audience personas should be specific (role, context, pain) — no generic "small business owners".
- Output ONLY one JSON object matching the schema, no prose around it.`;

const USER = (input: BusinessInput) => `Research this business and produce the dossier.

Business input:
\`\`\`json
${JSON.stringify(input, null, 2)}
\`\`\`

Schema:
\`\`\`json
{
  "business":  {
    "name": str, "url": str, "summary": str, "offerings": [str],
    "stage": "early|growth|enterprise", "country": str,
    "assets": [{"url": str, "kind": "logo|hero|product|team|social|icon|ad", "description": str}]
  },
  "niche":     str,
  "voice":     {"tone": str, "do": [str], "dont": [str], "examples": [str]},
  "audience":  [{"persona": str, "pains": [str], "desires": [str], "where_they_are": [str]}],
  "sources":   [{"url": str, "claim": str, "supported": null}]
}
\`\`\`

For \`business.country\`: use the English country name where the business is based or operates primarily (e.g. "Jordan", "Saudi Arabia", "United States"). If unclear, infer from website TLD/contact info; if still unknown, leave the empty string.

For \`business.assets\`: collect the brand's own visual assets so they can be reused in posts or as references. Be specific and avoid stock photos. Look for:
- The official **logo** (check the site's HTML: \`<link rel="icon">\`, \`<link rel="apple-touch-icon">\`, \`<meta property="og:image">\`, plus any logo URL referenced in nav / footer / favicon).
- A **hero** image from the homepage.
- 1–3 representative **product** images from the catalog or features pages.
- Brand profile pictures or banners from social media if exposed in HTML.
Each asset entry: \`url\` MUST be a direct media URL (ending in .png/.jpg/.svg/.webp/.mp4 or returning an image content-type), \`kind\` from the enum, \`description\` short (e.g. "primary wordmark, white-on-black"). 4–10 assets is plenty; quality > quantity. Skip if you genuinely can't find any.

Aim for 3–5 audience personas, 8–15 sources covering the business's site, social presence, and at least one third-party mention.
Return only the JSON object.`;

export interface StageResult<T> {
  output: T;
  usage: TokenUsage;
  toolCalls: number;
}

export async function runResearch(
  input: BusinessInput,
  onProgress?: (msg: string) => void,
): Promise<StageResult<ResearchOutput>> {
  const system = [cacheBlock(SYSTEM)];
  const messages = [{ role: "user" as const, content: USER(input) }];

  onProgress?.("calling research agent (web search + fetch)");
  let result;
  try {
    result = await call({
      model: MODEL_OPUS,
      system,
      messages,
      tools: [WEB_SEARCH_TOOL, WEB_FETCH_TOOL],
      max_tokens: 8192,
      temperature: 0.4,
    });
  } catch (e) {
    const msg = String((e as Error).message ?? e).toLowerCase();
    if (msg.includes("web_fetch") || msg.includes("web-fetch") || msg.includes("beta")) {
      onProgress?.("web_fetch unavailable, retrying with web_search only");
      result = await call({
        model: MODEL_OPUS,
        system,
        messages,
        tools: [WEB_SEARCH_TOOL],
        max_tokens: 8192,
        temperature: 0.4,
      });
    } else throw e;
  }

  onProgress?.(`got dossier (${result.serverToolCalls} tool calls)`);
  const dossier = parseJsonBlock(result.text) as ResearchOutput;
  for (const s of dossier.sources ?? []) {
    if (s.supported === undefined) s.supported = null;
  }
  return { output: dossier, usage: result.usage, toolCalls: result.serverToolCalls };
}
