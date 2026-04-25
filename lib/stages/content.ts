// Content stage — Sonnet fan-out with deterministic per-channel lint and one
// revision pass before brand-voice critic.

import { MODEL_SONNET, addUsage, cacheBlock, call } from "../anthropic";
import type {
  CalendarItem,
  CalendarOutput,
  ContentItem,
  ContentOutput,
  ResearchOutput,
  StrategyOutput,
  TokenUsage,
} from "../types";
import type { StageResult } from "./research";

const SYSTEM = `You are a senior content writer. You write platform-native copy that matches a brand's voice exactly.

Rules:
- Match the brand voice's tone, dos, and don'ts. If their voice is dry, do NOT inject hype.
- Write to the specified channel's native format — no LinkedIn essays on X.
- One CTA per piece, never two.
- No invented stats. Reference dossier facts only.
- Output ONLY the draft text. No JSON wrapper, no code fences, no preamble, no commentary.`;

interface ChannelRule {
  max_chars: number;
  needs_cta: boolean;
  format: string;
}

const CHANNEL_RULES: Record<string, ChannelRule> = {
  linkedin: {
    max_chars: 2900,
    needs_cta: true,
    format: "Hook (1 line) → 2–4 short paragraphs → CTA. No hashtag spam — 0–3 max.",
  },
  x: {
    max_chars: 270,
    needs_cta: false,
    format: "Single tweet OR a 2–4 tweet thread joined by '\\n---\\n'. Each tweet ≤270 chars.",
  },
  twitter: {
    max_chars: 270,
    needs_cta: false,
    format: "Single tweet OR thread, 2–4 tweets joined by '\\n---\\n'. Each ≤270 chars.",
  },
  instagram: {
    max_chars: 2100,
    needs_cta: true,
    format: "Caption with hook in first line, body, CTA. 5–10 relevant hashtags grouped at end.",
  },
  facebook: {
    max_chars: 2200,
    needs_cta: true,
    format: "Conversational lead → 1–3 short paragraphs → clear CTA. 0–3 hashtags max. No clickbait.",
  },
  whatsapp: {
    max_chars: 1000,
    needs_cta: true,
    format:
      "Personal, channel-broadcast tone. 2–4 short lines, ≤1000 chars total. End with a single CTA. No hashtags. Use plain text — *bold* sparingly.",
  },
  telegram: {
    max_chars: 4000,
    needs_cta: true,
    format:
      "Channel-style broadcast. Strong one-line hook → 2–5 short paragraphs → CTA. Up to 4096 chars but stay tight. **bold** allowed; no hashtag spam.",
  },
  blog: {
    max_chars: 6000,
    needs_cta: true,
    format: "Markdown: H1 title, intro hook, 3–5 H2 sections, CTA paragraph at end.",
  },
  email: {
    max_chars: 1800,
    needs_cta: true,
    format: "Subject (≤60 chars) on first line, blank line, then plain-text body, single clear CTA.",
  },
};

function lint(draft: string, channel: string): ContentItem["lint"] {
  const rules = CHANNEL_RULES[channel] ?? CHANNEL_RULES.blog;
  const issues: string[] = [];
  let length_ok = true;
  let cta_ok = true;

  if ((channel === "x" || channel === "twitter") && draft.includes("\n---\n")) {
    const tweets = draft.split("\n---\n");
    tweets.forEach((tw, i) => {
      if (tw.trim().length > rules.max_chars) {
        issues.push(`Tweet ${i + 1} is ${tw.trim().length} chars (max ${rules.max_chars}).`);
        length_ok = false;
      }
    });
  } else if (draft.length > rules.max_chars) {
    issues.push(`Draft is ${draft.length} chars (max ${rules.max_chars}).`);
    length_ok = false;
  }

  if (rules.needs_cta) {
    const re = /\b(sign up|book|join|try|get started|learn more|read more|download|subscribe|reply|comment|dm|book a call|grab|claim)\b/i;
    if (!re.test(draft)) {
      issues.push("No clear CTA detected.");
      cta_ok = false;
    }
  }

  if (channel === "email") {
    const first = draft.split("\n", 1)[0] ?? "";
    if (first.length > 60) {
      issues.push(`Email subject line is ${first.length} chars (max 60).`);
      length_ok = false;
    }
  }

  return { length_ok, cta_ok, voice_ok: null, issues };
}

async function generate(
  item: CalendarItem,
  cachedSystem: ReturnType<typeof cacheBlock>[],
): Promise<{ draft: string; usage: TokenUsage }> {
  const rules = CHANNEL_RULES[item.channel] ?? CHANNEL_RULES.blog;
  const user = `Calendar item:
\`\`\`json
${JSON.stringify(item, null, 2)}
\`\`\`

Channel rules: ${JSON.stringify({ max_chars: rules.max_chars, needs_cta: rules.needs_cta })}
Channel format: ${rules.format}

Produce the content for this item. Markdown is fine for blog. For X threads, separate tweets with the literal line "---" (three hyphens on their own line).

Output ONLY the draft text. No JSON, no code fences, no headings like "Draft:", no commentary. Just the content itself.`;

  const result = await call({
    model: MODEL_SONNET,
    system: cachedSystem,
    messages: [{ role: "user", content: user }],
    max_tokens: 4096,
    temperature: 0.7,
  });
  return { draft: stripWrapper(result.text), usage: result.usage };
}

/** Defensive cleanup: strip a JSON wrapper or fenced block if the model added one
 * despite instructions. */
function stripWrapper(text: string): string {
  let s = text.trim();
  // Strip a fenced block.
  if (s.startsWith("```")) {
    const after = s.replace(/^```[a-zA-Z0-9]*\n?/, "");
    const closeIdx = after.lastIndexOf("```");
    s = (closeIdx >= 0 ? after.slice(0, closeIdx) : after).trim();
  }
  // If it looks like {"draft": "..."}, extract the value of `draft`.
  if (s.startsWith("{") && s.includes('"draft"')) {
    try {
      const obj = JSON.parse(s) as { draft?: string };
      if (typeof obj.draft === "string") return obj.draft.trim();
    } catch {
      // Truncated JSON — try a regex extraction.
      const m = s.match(/"draft"\s*:\s*"((?:\\.|[^"\\])*)/);
      if (m) {
        return m[1].replace(/\\n/g, "\n").replace(/\\"/g, '"').replace(/\\\\/g, "\\").trim();
      }
    }
  }
  return s;
}

async function reviseDraft(
  item: CalendarItem,
  draft: string,
  issues: string[],
  cachedSystem: ReturnType<typeof cacheBlock>[],
): Promise<{ draft: string; usage: TokenUsage }> {
  const user = `The draft below failed automated lint:

Issues: ${issues.join("; ")}

Original draft:
"""
${draft}
"""

Fix all issues without changing the core message. Output ONLY the corrected draft text. No JSON, no code fences, no commentary.`;

  const result = await call({
    model: MODEL_SONNET,
    system: cachedSystem,
    messages: [{ role: "user", content: user }],
    max_tokens: 4096,
    temperature: 0.5,
  });
  const fixed = stripWrapper(result.text);
  return { draft: fixed || draft, usage: result.usage };
}

export async function runContent(
  dossier: ResearchOutput,
  strategy: StrategyOutput,
  calendar: CalendarOutput,
  onProgress?: (msg: string) => void,
  onItem?: (items: ContentItem[]) => void,
): Promise<StageResult<ContentOutput>> {
  const cachedSystem = [
    cacheBlock(SYSTEM),
    cacheBlock("RESEARCH DOSSIER:\n" + JSON.stringify(dossier, null, 2)),
    cacheBlock("STRATEGY:\n" + JSON.stringify(strategy, null, 2)),
  ];

  let usage: TokenUsage = { input: 0, output: 0, cache_read: 0, cache_create: 0 };
  const items: ContentItem[] = [];

  for (const item of calendar.items ?? []) {
    onProgress?.(`drafting ${item.id} for ${item.channel}`);
    const gen = await generate(item, cachedSystem);
    usage = addUsage(usage, gen.usage);
    let draft = gen.draft;
    let l = lint(draft, item.channel);
    if (l.issues.length) {
      onProgress?.(`lint flagged ${item.id} (${l.issues.length} issues), revising`);
      const rev = await reviseDraft(item, draft, l.issues, cachedSystem);
      usage = addUsage(usage, rev.usage);
      draft = rev.draft;
      l = lint(draft, item.channel);
    }
    items.push({ ...item, draft, final: draft, lint: l });
    // Push partial progress to the orchestrator so the UI can render items
    // as they're produced rather than waiting for the whole batch.
    onItem?.([...items]);
  }

  return { output: { items }, usage, toolCalls: 0 };
}
