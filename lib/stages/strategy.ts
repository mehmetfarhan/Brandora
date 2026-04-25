// Strategy stage — pillars + channels with cadence.

import { MODEL_OPUS, cacheBlock, call, parseJsonBlock } from "../anthropic";
import type { BusinessInput, ResearchOutput, StrategyOutput, TokenUsage } from "../types";
import type { StageResult } from "./research";

const SYSTEM = `You are a content strategist. Given a research dossier, you design content pillars and channel mix.

Rules:
- Pillars must come from the business's actual offerings + audience pains, not generic categories.
- Channels must be justified by where the audience already is (use the dossier's \`where_they_are\`).
- Cadence must be realistic for an early/growth team — over-ambitious calendars are a downgrade.
- Output ONLY one JSON object, no prose.`;

export async function runStrategy(
  dossier: ResearchOutput,
  input: BusinessInput,
): Promise<StageResult<StrategyOutput>> {
  const channels = input.channels ?? ["linkedin", "x", "instagram", "blog"];
  const user = `Research dossier (verified):
\`\`\`json
${JSON.stringify(dossier, null, 2)}
\`\`\`

Requested channels (from input): ${channels.join(", ")}

Produce the strategy JSON:
\`\`\`json
{
  "pillars":  [{"name": str, "why": str, "examples_from_voice": [str]}],
  "channels": [{"name": str, "why": str, "cadence": {"per_week": int}, "format_notes": [str], "audience_fit": str}]
}
\`\`\`

Aim for 3–5 pillars. Channels: filter the requested list down to those that genuinely fit the audience, and add others if a strong fit. Return only the JSON object.`;

  const system = [cacheBlock(SYSTEM), cacheBlock("RESEARCH DOSSIER:\n" + JSON.stringify(dossier, null, 2))];
  const result = await call({
    model: MODEL_OPUS,
    system,
    messages: [{ role: "user", content: user }],
    max_tokens: 4096,
    temperature: 0.5,
  });
  const usage: TokenUsage = result.usage;
  return { output: parseJsonBlock(result.text) as StrategyOutput, usage, toolCalls: 0 };
}
