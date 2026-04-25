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

const SYSTEM = `You are the brand's actual social media manager — a human writer with taste, not a generic AI.

PRIME DIRECTIVE: a casual reader scrolling past this post must NOT be able to tell it was written by AI. If a reader could tell, you've failed.

Voice & taste:
- Match the brand voice's tone, dos, don'ts, and *cadence* exactly. Study \`voice.examples\` and write to that exact rhythm — sentence length distribution, punctuation habits, vocabulary, idioms.
- If their voice is dry, do NOT inject hype. If their voice is playful, don't go corporate.
- One CTA per piece, never two. Match the brand's CTA style (some brands never end on "What do you think?" — others always do).
- No invented stats. Reference dossier facts only.

Forbidden AI-tells (these are an instant fail):
- Em-dash overuse for ornamentation ("It's not just X — it's Y."). Use sparingly, only where a real writer would.
- Cliché openers: "Let's dive in", "Let me break it down", "In today's fast-paced world", "Unlock the power of", "Game-changer", "It's a no-brainer".
- Cliché closers: "What do you think? Let me know in the comments!", "Drop a 🚀 if you agree", generic "Stay tuned!".
- Three-item parallel lists used to fill space when a single sentence would do.
- Hashtag spam (#growth #business #entrepreneur stacks). Use the brand's actual hashtag pattern or none.
- "I" / "we" used inconsistently — pick the voice the brand actually uses (most B2B is "we", most personal brands are "I").
- Robotic transition words at sentence starts: "Furthermore,", "Moreover,", "Additionally,", "However,".
- Empty hype adjectives: "incredible", "amazing", "powerful", "revolutionary", unless the brand actually uses them.

Length:
- Match the brand's *typical* post length on this channel, not the platform maximum. Most real brand posts are far shorter than the platform allows. Defer to the channel rules below for a realistic length window.
- Don't pad. If the idea fits in two short lines, use two short lines.

Output ONLY the draft text. No JSON wrapper, no code fences, no preamble, no commentary.`;

interface ChannelRule {
  /** Hard upper bound. Should be well below the platform max — real brand
   * posts are far shorter than the maximum allowed. Going near max is itself
   * an AI-tell. */
  max_chars: number;
  /** Aim for this length when nothing else dictates otherwise. */
  target_chars: number;
  /** Anything below this is suspiciously thin for a real post. */
  min_chars: number;
  needs_cta: boolean;
  format: string;
}

const CHANNEL_RULES: Record<string, ChannelRule> = {
  // LinkedIn — viral B2B posts are usually 600–1200 chars, not 2900.
  linkedin: {
    max_chars: 1500,
    target_chars: 900,
    min_chars: 350,
    needs_cta: true,
    format:
      "Hook on line 1 (must earn the click-to-expand). 2–4 short paragraphs (1–3 sentences each, with line breaks between). One CTA. 0–3 hashtags max, lowercase, integrated — no #stack at the end.",
  },
  x: {
    max_chars: 270,
    target_chars: 200,
    min_chars: 50,
    needs_cta: false,
    format:
      "Single tweet OR a 2–4 tweet thread joined by '\\n---\\n'. Each tweet ≤270 chars. Conversational, not formal. No hashtag spam.",
  },
  twitter: {
    max_chars: 270,
    target_chars: 200,
    min_chars: 50,
    needs_cta: false,
    format:
      "Single tweet OR thread, 2–4 tweets joined by '\\n---\\n'. Each ≤270 chars. Conversational tone.",
  },
  // Instagram captions — most brands use 100–500 chars, not 2100.
  instagram: {
    max_chars: 900,
    target_chars: 350,
    min_chars: 80,
    needs_cta: true,
    format:
      "Caption: a hook on the first line (Instagram truncates), then 1–3 short blocks, then a single CTA. Use line breaks (blank lines) between sections. Hashtags ONLY if the brand actually uses them — 3–6 relevant ones grouped after a blank line. No spam stacks.",
  },
  // Facebook page posts — typical is 80–250 chars; long-form is rarer.
  facebook: {
    max_chars: 800,
    target_chars: 250,
    min_chars: 60,
    needs_cta: true,
    format:
      "Conversational lead (1–2 sentences). At most 1–2 short paragraphs. One clear CTA. 0–2 hashtags max. No clickbait, no emoji-stacking.",
  },
  // WhatsApp Channels — short broadcasts, like a friend sending an update.
  whatsapp: {
    max_chars: 600,
    target_chars: 220,
    min_chars: 60,
    needs_cta: true,
    format:
      "Personal channel-broadcast tone. 2–4 short lines. End with a single CTA. No hashtags. Plain text; use *bold* sparingly for one or two words at most.",
  },
  // Telegram channels — broadcast-y but room for a short narrative.
  telegram: {
    max_chars: 1500,
    target_chars: 500,
    min_chars: 120,
    needs_cta: true,
    format:
      "Strong one-line hook → 1–3 short paragraphs → CTA. Use **bold** sparingly. No hashtag spam.",
  },
  // Blog — long-form is OK here, but most B2B blog posts are 600–1500 words.
  blog: {
    max_chars: 4500,
    target_chars: 2200,
    min_chars: 600,
    needs_cta: true,
    format:
      "Markdown: H1 title, intro hook (2–4 sentences), 3–5 H2 sections, short paragraphs, ending with a CTA paragraph.",
  },
  // Email — a marketing email is a few short paragraphs, not a wall.
  email: {
    max_chars: 1100,
    target_chars: 500,
    min_chars: 150,
    needs_cta: true,
    format:
      "Subject line (≤55 chars) on line 1, blank line, then plain-text body in 2–4 short paragraphs, ending with one clear CTA + sign-off.",
  },
};

/** Phrases that scream "AI wrote this" and are vanishingly rare in real
 * brand copy. Hits trigger a lint flag. */
const AI_TELL_PATTERNS: { re: RegExp; label: string }[] = [
  { re: /\blet's (dive|break it down|unpack|explore)\b/i, label: "cliche-opener" },
  { re: /\bin today's (fast-paced|ever-changing|digital) world\b/i, label: "cliche-opener" },
  { re: /\b(unlock|unleash) the (power|potential)\b/i, label: "cliche-cta" },
  { re: /\bgame[- ]changer\b/i, label: "cliche-hype" },
  { re: /\bno[- ]brainer\b/i, label: "cliche-hype" },
  { re: /\bstay tuned\b/i, label: "cliche-closer" },
  { re: /\bdrop a [🚀💯🔥👇] if\b/i, label: "cliche-cta" },
  { re: /\bwhat do you think\?\s+let me know in the comments\b/i, label: "cliche-closer" },
  { re: /\bit's not just .{1,30} — it's\b/i, label: "em-dash-trope" },
  { re: /\b(furthermore|moreover|additionally),/i, label: "robotic-transition" },
  { re: /\b(revolutionary|cutting[- ]edge|world[- ]class)\b/i, label: "empty-hype" },
];

const HASHTAG_STACK = /(?:#[A-Za-z0-9_]+\s*){5,}/;

/** Resolve verbose strategy-stage channel names like "facebook (Folowise
 * Bootcamp | Amman)" to a canonical key in CHANNEL_RULES. */
function canonicalChannelKey(channel: string): string {
  const c = (channel || "").toLowerCase();
  for (const k of Object.keys(CHANNEL_RULES)) {
    if (c.includes(k)) return k;
  }
  if (/(^|\s|\()x(\s|\)|$)/.test(c)) return "x";
  return "blog";
}

function lint(draft: string, channel: string): ContentItem["lint"] {
  const key = canonicalChannelKey(channel);
  const rules = CHANNEL_RULES[key];
  const issues: string[] = [];
  let length_ok = true;
  let cta_ok = true;

  // Length: hard bound, soft "thin", and soft "bloat" (near-max is an AI-tell).
  if ((key === "x" || key === "twitter") && draft.includes("\n---\n")) {
    const tweets = draft.split("\n---\n");
    tweets.forEach((tw, i) => {
      if (tw.trim().length > rules.max_chars) {
        issues.push(`Tweet ${i + 1} is ${tw.trim().length} chars (max ${rules.max_chars}).`);
        length_ok = false;
      }
    });
  } else {
    const len = draft.length;
    if (len > rules.max_chars) {
      issues.push(`Draft is ${len} chars (max ${rules.max_chars}).`);
      length_ok = false;
    } else if (len < rules.min_chars) {
      issues.push(
        `Draft is ${len} chars — below the channel minimum ${rules.min_chars} (suspiciously thin).`,
      );
      length_ok = false;
    } else if (len > rules.max_chars * 0.95) {
      issues.push(
        `Draft is ${len} chars — too close to the cap ${rules.max_chars}. Real brand posts rarely hit the maximum; trim toward ${rules.target_chars} chars.`,
      );
    }
  }

  // AI-tell phrases — flag anything obvious.
  const tellHits: string[] = [];
  for (const { re, label } of AI_TELL_PATTERNS) {
    if (re.test(draft)) tellHits.push(label);
  }
  if (HASHTAG_STACK.test(draft)) tellHits.push("hashtag-stack");
  if (tellHits.length > 0) {
    issues.push(`AI-tells detected: ${[...new Set(tellHits)].join(", ")} — rewrite without these.`);
  }

  // Em-dash overuse: more than one ornamental em-dash in a short post screams AI.
  const emDashCount = (draft.match(/—/g) ?? []).length;
  if (emDashCount > 2) {
    issues.push(
      `${emDashCount} em-dashes — that's an AI-writing tell. Use commas, periods, or parentheses instead.`,
    );
  }

  if (rules.needs_cta) {
    const re = /\b(sign up|book|join|try|get started|learn more|read more|download|subscribe|reply|comment|dm|book a call|grab|claim)\b/i;
    if (!re.test(draft)) {
      issues.push("No clear CTA detected.");
      cta_ok = false;
    }
  }

  if (key === "email") {
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
  const key = canonicalChannelKey(item.channel);
  const rules = CHANNEL_RULES[key];
  const user = `Calendar item:
\`\`\`json
${JSON.stringify(item, null, 2)}
\`\`\`

Channel: ${item.channel} (canonical: ${key})
Length: aim for around ${rules.target_chars} characters. Stay between ${rules.min_chars} and ${rules.max_chars}. Going near the maximum is itself an AI-tell — real brand posts are usually well below the platform max.
CTA required: ${rules.needs_cta ? "yes (one only)" : "no"}
Channel format: ${rules.format}

Before you write, study the brand voice in the cached dossier:
- Read \`voice.examples\` carefully and mirror the cadence (sentence length, punctuation, vocabulary).
- Apply \`voice.do\` literally; never violate \`voice.dont\`.
- Use the brand's actual idioms and rhythm, not generic social-media copy patterns.

Then produce the content. Markdown is fine for blog. For X threads, separate tweets with the literal line "---" (three hyphens on their own line). Do NOT include channel prefixes like "[FACEBOOK]" or "[INSTAGRAM]" — just the post body.

Output ONLY the draft text. No JSON, no code fences, no headings like "Draft:", no commentary. Just the content itself.`;

  const result = await call({
    model: MODEL_SONNET,
    system: cachedSystem,
    messages: [{ role: "user", content: user }],
    max_tokens: 4096,
    temperature: 0.75,
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
