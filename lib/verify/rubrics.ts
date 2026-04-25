// Rubric prompts shared between critic and revise passes.

export const RUBRIC: Record<string, string> = {
  research: `You are a skeptical research auditor.

Score the dossier 0–100 on:
- Specificity (vague claims = lower score)
- Source coverage (are claims tied to URLs? are sources reputable?)
- Audience precision (no generic "small business owners")
- Voice grounding (is the voice description tied to actual brand copy?)
- Honesty about gaps (acknowledged unknowns > invented facts)

Pass threshold: 75. Return JSON:
{"score": int, "pass": bool, "issues": [{"severity": "critical|major|minor", "where": str, "fix": str}]}`,

  strategy: `You are a content strategy auditor.

Score 0–100 on:
- Pillar–audience fit (does each pillar actually solve a stated audience pain?)
- Channel justification (is each channel tied to where the audience is?)
- Cadence realism (over-ambitious cadences = downgrade)
- Distinctness (no two pillars saying the same thing)

Pass threshold: 75. Return JSON:
{"score": int, "pass": bool, "issues": [{"severity": "critical|major|minor", "where": str, "fix": str}]}`,

  calendar: `You are a content calendar auditor.

Score 0–100 on:
- Pillar coverage (every pillar represented across the window)
- Variety (no two consecutive items on the same pillar/channel pair)
- Hook specificity (no generic hooks like "5 tips for X")
- CTA clarity (every brief has a concrete next action)

Pass threshold: 75. Return JSON:
{"score": int, "pass": bool, "issues": [{"severity": "critical|major|minor", "where": str, "fix": str}]}`,

  content: `You are a brand-voice auditor.

For each item, judge whether the \`final\` text matches the dossier's voice (\`tone\`, \`do\`, \`dont\`).
Also judge channel-appropriateness (LinkedIn essays on X = fail).

Score the BATCH 0–100. Pass threshold: 75. Return JSON:
{"score": int, "pass": bool, "issues": [{"severity": "critical|major|minor", "where": "item_id or 'batch'", "fix": str}]}

Be specific in \`where\`: name the item id when the issue is per-item.`,
};

export const REVISE: Record<string, string> = {
  research:
    "Revise the dossier to address the issues below. Keep all valid sources. Do NOT invent new facts — if you can't fix an issue without evidence, mark the affected claim with `\"supported\": false`. Output only the corrected JSON.",
  strategy: "Revise the strategy JSON to address the issues. Output only the corrected JSON.",
  calendar:
    "Revise the calendar JSON to address the issues. Keep item IDs stable where possible. Output only the corrected JSON.",
  content:
    "Revise ONLY the items flagged in `issues`. Keep other items unchanged. Output the full updated content JSON.",
};
