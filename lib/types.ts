// Stage output schemas — typed JSON written to run state.

export type StageName = "research" | "strategy" | "calendar" | "content";

export interface BusinessInput {
  name: string;
  url?: string;
  hints?: string[];
  channels?: string[];
  calendar_days?: number;
}

export interface ResearchOutput {
  business: {
    name: string;
    url?: string;
    summary: string;
    offerings: string[];
    stage: "early" | "growth" | "enterprise" | string;
    /** ISO English country name (e.g. "Jordan", "Saudi Arabia", "United States"). */
    country?: string;
  };
  niche: string;
  voice: { tone: string; do: string[]; dont: string[]; examples: string[] };
  audience: { persona: string; pains: string[]; desires: string[]; where_they_are: string[] }[];
  sources: { url: string; claim: string; supported: boolean | null; evidence?: string }[];
}

export interface StrategyOutput {
  pillars: { name: string; why: string; examples_from_voice: string[] }[];
  channels: {
    name: string;
    why: string;
    cadence: { per_week: number };
    format_notes: string[];
    audience_fit: string;
  }[];
}

export interface CalendarItem {
  id: string;
  date: string;
  channel: string;
  pillar: string;
  brief: string;
  hook: string;
  cta: string;
  /** Optional named day this item is anchored to (e.g. "Eid al-Fitr Day 1"). */
  occasion?: string;
  /** Stable group id shared across items that publish the same idea on the
   * same date across multiple channels — UI groups by this. */
  group_id?: string;
}

export interface ScheduleOccasion {
  date: string; // YYYY-MM-DD
  name: string;
  notes?: string;
}

export interface CalendarOutput {
  /** ISO English country name as detected by research (or empty). */
  country?: string;
  /** Holidays / culturally important days the calendar tried to align with. */
  occasions?: ScheduleOccasion[];
  items: CalendarItem[];
}

export interface ContentItem extends CalendarItem {
  draft: string;
  final: string;
  lint: { length_ok: boolean; cta_ok: boolean; voice_ok: boolean | null; issues: string[] };
}

export interface ContentOutput {
  items: ContentItem[];
}

export interface CriticVerdict {
  score: number;
  pass: boolean;
  issues: { severity: "critical" | "major" | "minor"; where: string; fix: string }[];
}

export interface FactVerdict {
  index: number;
  url: string;
  claim?: string;
  supported: boolean;
  evidence?: string;
  reasoning?: string;
}

export interface StageRecord {
  status: "pending" | "running" | "completed" | "failed";
  output?: unknown;
  startedAt?: string;
  completedAt?: string;
}

export interface VerificationRecord {
  score: number;
  pass: boolean;
  revisions: number;
  issues: CriticVerdict["issues"];
  rounds: { round: number; score: number; pass: boolean; issues: CriticVerdict["issues"] }[];
}

export interface FactCheckRecord {
  checked: number;
  demoted: number;
  verdicts: FactVerdict[];
}

export interface TokenUsage {
  input: number;
  output: number;
  cache_read: number;
  cache_create: number;
}

export interface RunState {
  id: string;
  input: BusinessInput;
  startedAt: string;
  updatedAt: string;
  status: "running" | "completed" | "failed";
  stages: Record<StageName, StageRecord>;
  verification: Partial<Record<StageName, VerificationRecord>> & {
    research_facts?: FactCheckRecord;
  };
  tokens: TokenUsage;
  error?: string;
}

export type RunEvent =
  | { type: "stage_start"; stage: StageName; t: number }
  | { type: "stage_progress"; stage: StageName; message: string; t: number }
  | { type: "tool_call"; stage: StageName; tool: string; t: number }
  | { type: "fact_check"; verdict: FactVerdict; t: number }
  | { type: "critic_round"; stage: StageName; round: number; score: number; pass: boolean; t: number }
  | { type: "stage_complete"; stage: StageName; t: number }
  | { type: "tokens"; tokens: TokenUsage; t: number }
  | { type: "state"; state: RunState; t: number }
  | { type: "error"; message: string; t: number }
  | { type: "done"; t: number };
