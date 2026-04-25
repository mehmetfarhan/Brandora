// Generic critic→revise loop. Returns the (possibly revised) output and a
// VerificationRecord with all rounds for the verification artifact.

import { call, cacheBlock, MODEL_OPUS, parseJsonBlock, addUsage } from "../anthropic";
import type { CriticVerdict, StageName, TokenUsage, VerificationRecord } from "../types";
import { RUBRIC, REVISE } from "./rubrics";

const MAX_ROUNDS = 2;
const PASS_THRESHOLD = 75;

async function critique(stage: StageName, output: unknown): Promise<{ verdict: CriticVerdict; usage: TokenUsage }> {
  const system = [cacheBlock("You are a strict, fair auditor. Output only one JSON object.")];
  const user = `${RUBRIC[stage]}\n\nStage output to audit:\n\`\`\`json\n${JSON.stringify(output, null, 2)}\n\`\`\``;
  const result = await call({
    model: MODEL_OPUS,
    system,
    messages: [{ role: "user", content: user }],
    max_tokens: 2048,
    temperature: 0.2,
  });
  return { verdict: parseJsonBlock(result.text) as CriticVerdict, usage: result.usage };
}

async function revise(stage: StageName, output: unknown, issues: CriticVerdict["issues"]): Promise<{ output: unknown; usage: TokenUsage }> {
  const system = [cacheBlock("You are revising your previous output based on auditor feedback. Output only one JSON object.")];
  const user =
    `Previous output:\n\`\`\`json\n${JSON.stringify(output, null, 2)}\n\`\`\`\n\n` +
    `Auditor issues:\n\`\`\`json\n${JSON.stringify(issues, null, 2)}\n\`\`\`\n\n` +
    REVISE[stage];
  const result = await call({
    model: MODEL_OPUS,
    system,
    messages: [{ role: "user", content: user }],
    max_tokens: 8192,
    temperature: 0.4,
  });
  return { output: parseJsonBlock(result.text), usage: result.usage };
}

export interface CriticResult {
  output: unknown;
  record: VerificationRecord;
  usage: TokenUsage;
  onRound?: (round: number, score: number, pass: boolean) => void;
}

export async function critic(
  stage: StageName,
  output: unknown,
  onRound?: (round: number, score: number, pass: boolean) => void,
): Promise<CriticResult> {
  let current = output;
  let totalUsage: TokenUsage = { input: 0, output: 0, cache_read: 0, cache_create: 0 };
  const rounds: VerificationRecord["rounds"] = [];

  for (let r = 0; r <= MAX_ROUNDS; r++) {
    const c = await critique(stage, current);
    totalUsage = addUsage(totalUsage, c.usage);
    const v = c.verdict;
    const score = Number(v.score ?? 0);
    const passed = Boolean(v.pass ?? score >= PASS_THRESHOLD);
    const issues = v.issues ?? [];
    rounds.push({ round: r, score, pass: passed, issues });
    onRound?.(r, score, passed);
    if (passed || r === MAX_ROUNDS || issues.length === 0) break;
    const rev = await revise(stage, current, issues);
    totalUsage = addUsage(totalUsage, rev.usage);
    current = rev.output;
  }

  const last = rounds[rounds.length - 1];
  return {
    output: current,
    record: {
      score: last.score,
      pass: last.pass,
      issues: last.issues,
      revisions: Math.max(0, rounds.length - 1),
      rounds,
    },
    usage: totalUsage,
  };
}
