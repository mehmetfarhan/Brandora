// Orchestrator: runs the four stages with critic + fact-check, emits events,
// persists state.json after each step. Designed to run as a detached async
// task started by POST /api/run.

import { addUsage } from "./anthropic";
import { runResearch } from "./stages/research";
import { runStrategy } from "./stages/strategy";
import { runCalendar } from "./stages/calendar";
import { runContent } from "./stages/content";
import { critic } from "./verify/critic";
import { factCheck } from "./verify/facts";
import { completeRun, emit, failRun, persist, setState } from "./runs";
import type {
  CalendarOutput,
  ContentOutput,
  ResearchOutput,
  RunState,
  StrategyOutput,
  StageName,
} from "./types";

function setStage(state: RunState, stage: StageName, patch: Partial<RunState["stages"][StageName]>) {
  const cur = state.stages[stage];
  state.stages[stage] = { ...cur, ...patch };
  setState(state);
}

function startTokens(state: RunState) {
  emit(state.id, { type: "tokens", tokens: state.tokens, t: Date.now() });
}

export async function runPipeline(state: RunState): Promise<void> {
  try {
    // Resume-friendly: each stage block skips itself if already completed.
    // We always (re)compute downstream stages from the persisted upstream output.
    const isDone = (s: StageName) => state.stages[s]?.status === "completed";

    // ── Research ─────────────────────────────────────────────────────────
    let dossier: ResearchOutput;
    if (isDone("research")) {
      dossier = state.stages.research.output as ResearchOutput;
      emit(state.id, { type: "stage_complete", stage: "research", t: Date.now() });
    } else {
      setStage(state, "research", { status: "running", startedAt: new Date().toISOString() });
      emit(state.id, { type: "stage_start", stage: "research", t: Date.now() });
      emit(state.id, { type: "tool_call", stage: "research", tool: "web_search", t: Date.now() });

      const research = await runResearch(state.input, (msg) =>
        emit(state.id, { type: "stage_progress", stage: "research", message: msg, t: Date.now() }),
      );
      state.tokens = addUsage(state.tokens, research.usage);
      setStage(state, "research", { output: research.output });
      startTokens(state);

      // Fact-check (research-specific extra pass)
      emit(state.id, { type: "stage_progress", stage: "research", message: "fact-checking sources", t: Date.now() });
      const fc = await factCheck(research.output as ResearchOutput, (v) =>
        emit(state.id, { type: "fact_check", verdict: v, t: Date.now() }),
      );
      state.tokens = addUsage(state.tokens, fc.usage);
      state.verification.research_facts = { checked: fc.checked, demoted: fc.demoted, verdicts: fc.verdicts };
      setStage(state, "research", { output: fc.dossier });
      startTokens(state);

      // Generic critic for research
      emit(state.id, { type: "stage_progress", stage: "research", message: "critic reviewing dossier", t: Date.now() });
      const cR = await critic("research", fc.dossier, (round, score, pass) =>
        emit(state.id, { type: "critic_round", stage: "research", round, score, pass, t: Date.now() }),
      );
      state.tokens = addUsage(state.tokens, cR.usage);
      state.verification.research = cR.record;
      setStage(state, "research", {
        output: cR.output,
        status: "completed",
        completedAt: new Date().toISOString(),
      });
      emit(state.id, { type: "stage_complete", stage: "research", t: Date.now() });
      startTokens(state);
      dossier = cR.output as ResearchOutput;
    }

    // ── Strategy ─────────────────────────────────────────────────────────
    let strategy: StrategyOutput;
    if (isDone("strategy")) {
      strategy = state.stages.strategy.output as StrategyOutput;
      emit(state.id, { type: "stage_complete", stage: "strategy", t: Date.now() });
    } else {
      setStage(state, "strategy", { status: "running", startedAt: new Date().toISOString() });
      emit(state.id, { type: "stage_start", stage: "strategy", t: Date.now() });
      const strat = await runStrategy(dossier, state.input);
      state.tokens = addUsage(state.tokens, strat.usage);
      setStage(state, "strategy", { output: strat.output });
      startTokens(state);

      const cS = await critic("strategy", strat.output, (round, score, pass) =>
        emit(state.id, { type: "critic_round", stage: "strategy", round, score, pass, t: Date.now() }),
      );
      state.tokens = addUsage(state.tokens, cS.usage);
      state.verification.strategy = cS.record;
      setStage(state, "strategy", {
        output: cS.output,
        status: "completed",
        completedAt: new Date().toISOString(),
      });
      emit(state.id, { type: "stage_complete", stage: "strategy", t: Date.now() });
      startTokens(state);
      strategy = cS.output as StrategyOutput;
    }

    // ── Calendar ─────────────────────────────────────────────────────────
    let calendar: CalendarOutput;
    if (isDone("calendar")) {
      calendar = state.stages.calendar.output as CalendarOutput;
      emit(state.id, { type: "stage_complete", stage: "calendar", t: Date.now() });
    } else {
      setStage(state, "calendar", { status: "running", startedAt: new Date().toISOString() });
      emit(state.id, { type: "stage_start", stage: "calendar", t: Date.now() });
      const cal = await runCalendar(dossier, strategy, state.input);
      state.tokens = addUsage(state.tokens, cal.usage);
      setStage(state, "calendar", { output: cal.output });
      startTokens(state);

      const cC = await critic("calendar", cal.output, (round, score, pass) =>
        emit(state.id, { type: "critic_round", stage: "calendar", round, score, pass, t: Date.now() }),
      );
      state.tokens = addUsage(state.tokens, cC.usage);
      state.verification.calendar = cC.record;
      setStage(state, "calendar", {
        output: cC.output,
        status: "completed",
        completedAt: new Date().toISOString(),
      });
      emit(state.id, { type: "stage_complete", stage: "calendar", t: Date.now() });
      startTokens(state);
      calendar = cC.output as CalendarOutput;
    }

    // ── Content ──────────────────────────────────────────────────────────
    if (isDone("content")) {
      emit(state.id, { type: "stage_complete", stage: "content", t: Date.now() });
    } else {
      setStage(state, "content", { status: "running", startedAt: new Date().toISOString() });
      emit(state.id, { type: "stage_start", stage: "content", t: Date.now() });
      const cont = await runContent(
        dossier,
        strategy,
        calendar,
        (msg) => emit(state.id, { type: "stage_progress", stage: "content", message: msg, t: Date.now() }),
        (partial) => {
          // Persist partial progress so the UI's polling sees items as they land.
          setStage(state, "content", { output: { items: partial } });
        },
      );
      state.tokens = addUsage(state.tokens, cont.usage);
      setStage(state, "content", { output: cont.output });
      startTokens(state);

      const cT = await critic("content", cont.output, (round, score, pass) =>
        emit(state.id, { type: "critic_round", stage: "content", round, score, pass, t: Date.now() }),
      );
      state.tokens = addUsage(state.tokens, cT.usage);
      state.verification.content = cT.record;
      setStage(state, "content", {
        output: cT.output as ContentOutput,
        status: "completed",
        completedAt: new Date().toISOString(),
      });
      emit(state.id, { type: "stage_complete", stage: "content", t: Date.now() });
      startTokens(state);
    }

    state.status = "completed";
    delete state.error;
    persist(state);
    completeRun(state.id);
  } catch (e) {
    const message = (e as Error).message ?? String(e);
    persist(state);
    failRun(state.id, message);
  }
}
