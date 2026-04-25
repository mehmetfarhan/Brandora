// Fact-check pass for the research stage: re-fetch each cited URL and judge
// whether the claim is supported. Mark unsupported claims and report verdicts.

import { call, cacheBlock, MODEL_SONNET, parseJsonBlock, WEB_FETCH_TOOL, addUsage } from "../anthropic";
import type { FactVerdict, ResearchOutput, TokenUsage } from "../types";

const SYSTEM = `You verify claims against source pages.

Use web_fetch to load the URL. Judge whether the claim is directly supported.

Output ONLY one JSON object per call:
{"supported": bool, "evidence": str, "reasoning": str}

- "supported": true ONLY if the page contains text that clearly supports the claim.
- "evidence": a short verbatim quote from the page (≤30 words). Empty string if not supported.
- "reasoning": one sentence on why.`;

export interface FactCheckResult {
  dossier: ResearchOutput;
  verdicts: FactVerdict[];
  demoted: number;
  checked: number;
  usage: TokenUsage;
}

export async function factCheck(
  dossier: ResearchOutput,
  onVerdict?: (v: FactVerdict) => void,
): Promise<FactCheckResult> {
  const system = [cacheBlock(SYSTEM)];
  const verdicts: FactVerdict[] = [];
  let demoted = 0;
  let usage: TokenUsage = { input: 0, output: 0, cache_read: 0, cache_create: 0 };

  for (let i = 0; i < dossier.sources.length; i++) {
    const src = dossier.sources[i];
    const url = src.url ?? "";
    const claim = src.claim ?? "";
    if (!url || !claim) {
      src.supported = false;
      const v: FactVerdict = { index: i, url, claim, supported: false, reasoning: "missing url or claim" };
      verdicts.push(v);
      onVerdict?.(v);
      demoted++;
      continue;
    }

    let supported = false;
    let evidence = "";
    let reasoning = "";

    try {
      const result = await call({
        model: MODEL_SONNET,
        system,
        messages: [{ role: "user", content: `URL: ${url}\nClaim: ${claim}\n\nFetch the URL and judge. Return the JSON object only.` }],
        tools: [WEB_FETCH_TOOL],
        max_tokens: 1024,
        temperature: 0,
      });
      usage = addUsage(usage, result.usage);
      const parsed = parseJsonBlock(result.text) as { supported?: boolean; evidence?: string; reasoning?: string };
      supported = Boolean(parsed.supported);
      evidence = parsed.evidence ?? "";
      reasoning = parsed.reasoning ?? "";
    } catch (e) {
      reasoning = `fetch_error: ${String((e as Error).message ?? e).slice(0, 160)}`;
    }

    src.supported = supported;
    if (evidence) src.evidence = evidence;
    if (!supported) demoted++;
    const v: FactVerdict = { index: i, url, claim, supported, evidence, reasoning };
    verdicts.push(v);
    onVerdict?.(v);
  }

  return { dossier, verdicts, demoted, checked: dossier.sources.length, usage };
}
