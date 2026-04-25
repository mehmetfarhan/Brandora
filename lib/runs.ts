// In-memory run store + per-run event bus. For a hackathon demo this avoids
// a DB while still streaming live progress over SSE. Persists state.json to
// disk under .runs/<id>/ so refresh keeps history.

import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { BusinessInput, RunEvent, RunState, StageName } from "./types";

const STAGES: StageName[] = ["research", "strategy", "calendar", "content"];
const RUNS_DIR = path.resolve(process.cwd(), ".runs");

interface RunSlot {
  state: RunState;
  subscribers: Set<(e: RunEvent) => void>;
  buffer: RunEvent[];
}

const runs = new Map<string, RunSlot>();

function nowIso() {
  return new Date().toISOString();
}

function ensureDir(p: string) {
  fs.mkdirSync(p, { recursive: true });
}

function shortId(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 24) || "run";
  const ts = new Date().toISOString().replace(/[:T.\-Z]/g, "").slice(0, 14);
  return `${ts}-${slug}-${randomUUID().slice(0, 4)}`;
}

export function createRun(input: BusinessInput): RunState {
  const id = shortId(input.name || "run");
  const state: RunState = {
    id,
    input,
    startedAt: nowIso(),
    updatedAt: nowIso(),
    status: "running",
    stages: Object.fromEntries(STAGES.map((s) => [s, { status: "pending" }])) as RunState["stages"],
    verification: {},
    tokens: { input: 0, output: 0, cache_read: 0, cache_create: 0 },
  };
  runs.set(id, { state, subscribers: new Set(), buffer: [] });
  persist(state);
  return state;
}

export function getRun(id: string): RunState | null {
  const slot = runs.get(id);
  if (slot) return slot.state;
  // Try loading from disk.
  const file = path.join(RUNS_DIR, id, "state.json");
  if (fs.existsSync(file)) {
    try {
      const state = JSON.parse(fs.readFileSync(file, "utf8")) as RunState;
      runs.set(id, { state, subscribers: new Set(), buffer: [] });
      return state;
    } catch {
      return null;
    }
  }
  return null;
}

export function listRuns(): RunState[] {
  if (!fs.existsSync(RUNS_DIR)) return [];
  const ids = fs.readdirSync(RUNS_DIR).filter((d) => fs.existsSync(path.join(RUNS_DIR, d, "state.json")));
  const states: RunState[] = [];
  for (const id of ids) {
    const s = getRun(id);
    if (s) states.push(s);
  }
  return states.sort((a, b) => b.startedAt.localeCompare(a.startedAt));
}

export function persist(state: RunState) {
  state.updatedAt = nowIso();
  const dir = path.join(RUNS_DIR, state.id);
  ensureDir(dir);
  const file = path.join(dir, "state.json");
  const tmp = file + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2));
  fs.renameSync(tmp, file);
}

export function emit(runId: string, event: RunEvent): void {
  const slot = runs.get(runId);
  if (!slot) return;
  slot.buffer.push(event);
  // Keep the buffer reasonable for late subscribers.
  if (slot.buffer.length > 2000) slot.buffer.splice(0, slot.buffer.length - 2000);
  for (const cb of slot.subscribers) {
    try {
      cb(event);
    } catch {
      // Swallow subscriber errors; one bad listener shouldn't kill the run.
    }
  }
}

export function subscribe(runId: string, cb: (e: RunEvent) => void): () => void {
  const slot = runs.get(runId);
  if (!slot) return () => {};
  // Replay the buffered events first so a refreshed client catches up.
  for (const e of slot.buffer) cb(e);
  slot.subscribers.add(cb);
  return () => slot.subscribers.delete(cb);
}

export function setState(state: RunState) {
  const slot = runs.get(state.id);
  if (slot) slot.state = state;
  persist(state);
}

export function failRun(runId: string, message: string) {
  const slot = runs.get(runId);
  if (!slot) return;
  slot.state.status = "failed";
  slot.state.error = message;
  persist(slot.state);
  emit(runId, { type: "error", message, t: Date.now() });
  emit(runId, { type: "done", t: Date.now() });
}

export function completeRun(runId: string) {
  const slot = runs.get(runId);
  if (!slot) return;
  slot.state.status = "completed";
  persist(slot.state);
  emit(runId, { type: "done", t: Date.now() });
}
