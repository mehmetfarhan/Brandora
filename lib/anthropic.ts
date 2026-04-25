// LLM call layer.
//
// Originally this used the Anthropic SDK and an API key, but we now shell out
// to the local `claude` CLI so the agent runs against the user's logged-in
// session (no API key needed). The exported `call()` shape is unchanged so
// the stages and verifiers don't need to change.

import { spawn } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { TokenUsage } from "./types";

// We map our internal model ids to the CLI aliases. The CLI accepts "opus",
// "sonnet", "haiku" or the full id; the alias path is the most forgiving.
export const MODEL_OPUS = "opus";
export const MODEL_SONNET = "sonnet";
export const MODEL_HAIKU = "haiku";

// Server-tool stand-ins. Stages still pass these in `tools`; we translate
// them into Claude Code's WebSearch / WebFetch built-ins.
export const WEB_SEARCH_TOOL = { name: "web_search", type: "web_search_20250305" } as const;
export const WEB_FETCH_TOOL = { name: "web_fetch", type: "web_fetch_20250910" } as const;
export const WEB_FETCH_BETA = "web-fetch-2025-09-10";

export type CacheBlock = { type: "text"; text: string; cache_control: { type: "ephemeral" } };
export function cacheBlock(text: string): CacheBlock {
  return { type: "text", text, cache_control: { type: "ephemeral" } };
}

export interface CallArgs {
  model: string;
  system: CacheBlock[] | string;
  messages: { role: "user" | "assistant"; content: string | unknown[] }[];
  tools?: ReadonlyArray<unknown>;
  max_tokens?: number;
  temperature?: number;
  betas?: string[];
}

export interface CallResult {
  text: string;
  raw: unknown;
  usage: TokenUsage;
  stop_reason: string | null;
  serverToolCalls: number;
}

function flattenSystem(system: CallArgs["system"]): string {
  if (typeof system === "string") return system;
  return system.map((b) => b.text).join("\n\n---\n\n");
}

function flattenMessages(messages: CallArgs["messages"]): string {
  // We only ever pass a single user message in this app.
  return messages
    .map((m) => {
      if (typeof m.content === "string") return m.content;
      return (m.content as Array<{ type?: string; text?: string }>)
        .map((b) => b.text ?? "")
        .join("\n");
    })
    .join("\n\n");
}

function classifyTools(tools?: ReadonlyArray<unknown>): { allow: string[]; sawWebTool: boolean } {
  if (!tools || tools.length === 0) return { allow: [], sawWebTool: false };
  const allow = new Set<string>();
  let sawWebTool = false;
  for (const t of tools) {
    const ty = (t as { type?: string }).type;
    if (typeof ty !== "string") continue;
    if (ty.startsWith("web_search")) {
      allow.add("WebSearch");
      sawWebTool = true;
    } else if (ty.startsWith("web_fetch")) {
      allow.add("WebFetch");
      sawWebTool = true;
    }
  }
  return { allow: [...allow], sawWebTool };
}

function pickAlias(model: string): "opus" | "sonnet" | "haiku" {
  const m = model.toLowerCase();
  if (m.includes("opus")) return "opus";
  if (m.includes("haiku")) return "haiku";
  return "sonnet";
}

function nodeSpawn(
  cmd: string,
  args: string[],
  stdin: string,
  timeoutMs: number,
): Promise<{ stdout: string; stderr: string; code: number | null }> {
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, args, { stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    let killedForTimeout = false;
    const timer = setTimeout(() => {
      killedForTimeout = true;
      try {
        proc.kill("SIGKILL");
      } catch {
        // ignore
      }
    }, timeoutMs);

    proc.stdout.on("data", (d: Buffer) => (stdout += d.toString()));
    proc.stderr.on("data", (d: Buffer) => (stderr += d.toString()));
    proc.on("error", (e) => {
      clearTimeout(timer);
      reject(e);
    });
    proc.on("close", (code) => {
      clearTimeout(timer);
      if (killedForTimeout) {
        return reject(new Error(`claude CLI timed out after ${timeoutMs}ms`));
      }
      resolve({ stdout, stderr, code });
    });

    proc.stdin.on("error", () => {
      // pipe broke — surface via close handler
    });
    proc.stdin.write(stdin);
    proc.stdin.end();
  });
}

interface ClaudeJsonResult {
  type?: string;
  subtype?: string;
  is_error?: boolean;
  result?: string;
  total_cost_usd?: number;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    cache_read_input_tokens?: number;
    cache_creation_input_tokens?: number;
  };
  duration_ms?: number;
  session_id?: string;
}

const CLAUDE_BIN = process.env.CLAUDE_BIN || "claude";
const DEFAULT_TIMEOUT_MS = Number(process.env.AGENT_LAB_TIMEOUT_MS ?? 8 * 60 * 1000);

export async function call(args: CallArgs): Promise<CallResult> {
  const systemText = flattenSystem(args.system);
  const userText = flattenMessages(args.messages);
  const { allow } = classifyTools(args.tools);
  const model = pickAlias(args.model);

  // Always use a tempfile for system prompt — sizes can grow with cached
  // dossier/strategy blocks and argv has limits.
  const tmpDir = mkdtempSync(join(tmpdir(), "agent-lab-"));
  const systemFile = join(tmpDir, "system.txt");
  writeFileSync(systemFile, systemText, "utf8");

  const flags: string[] = [
    "-p",
    "--no-session-persistence",
    "--output-format",
    "json",
    "--system-prompt-file",
    systemFile,
    "--model",
    model,
    "--setting-sources",
    "user", // skip project + local CLAUDE.md from this repo
    "--strict-mcp-config",
    "--mcp-config",
    '{"mcpServers":{}}', // run without any MCP servers attached
    "--disable-slash-commands",
  ];

  // If tools were requested, allow them. Otherwise pass an empty tools list
  // to disable all built-ins.
  if (allow.length > 0) {
    flags.push("--allowed-tools", allow.join(","));
  } else {
    flags.push("--tools", "");
  }

  let lastErr: unknown = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const out = await nodeSpawn(CLAUDE_BIN, flags, userText, DEFAULT_TIMEOUT_MS);
      if (out.code !== 0) {
        throw new Error(
          `claude CLI exited ${out.code}: ${(out.stderr || out.stdout).slice(0, 600)}`,
        );
      }
      const trimmed = out.stdout.trim();
      // The CLI may print non-JSON warnings before the JSON block in some
      // setups. Find the last JSON object in the output.
      const start = trimmed.indexOf("{");
      const end = trimmed.lastIndexOf("}");
      if (start === -1 || end === -1 || end < start) {
        throw new Error(`claude CLI produced no JSON: ${trimmed.slice(0, 300)}`);
      }
      const parsed = JSON.parse(trimmed.slice(start, end + 1)) as ClaudeJsonResult;
      if (parsed.is_error) {
        throw new Error(`claude CLI error: ${parsed.subtype ?? "unknown"} :: ${parsed.result ?? ""}`);
      }
      const usage: TokenUsage = {
        input: parsed.usage?.input_tokens ?? 0,
        output: parsed.usage?.output_tokens ?? 0,
        cache_read: parsed.usage?.cache_read_input_tokens ?? 0,
        cache_create: parsed.usage?.cache_creation_input_tokens ?? 0,
      };
      try {
        rmSync(tmpDir, { recursive: true, force: true });
      } catch {
        // best-effort cleanup
      }
      return {
        text: (parsed.result ?? "").trim(),
        raw: parsed,
        usage,
        stop_reason: parsed.subtype ?? null,
        serverToolCalls: 0,
      };
    } catch (e) {
      lastErr = e;
      const sleepMs = Math.min(8000, 1500 * Math.pow(2, attempt)) + Math.random() * 500;
      await new Promise((r) => setTimeout(r, sleepMs));
    }
  }
  try {
    rmSync(tmpDir, { recursive: true, force: true });
  } catch {
    // ignore
  }
  throw lastErr ?? new Error("claude CLI call failed");
}

export function parseJsonBlock(text: string): unknown {
  let s = text.trim();
  if (s.startsWith("```")) {
    const inner = s.split("```")[1] ?? "";
    s = inner.startsWith("json") ? inner.slice(4) : inner;
    s = s.split("```")[0].trim();
  }
  const start = s.indexOf("{");
  const end = s.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) {
    throw new Error("No JSON object found in model output: " + text.slice(0, 200));
  }
  return JSON.parse(s.slice(start, end + 1));
}

export function addUsage(a: TokenUsage, b: TokenUsage): TokenUsage {
  return {
    input: a.input + b.input,
    output: a.output + b.output,
    cache_read: a.cache_read + b.cache_read,
    cache_create: a.cache_create + b.cache_create,
  };
}
