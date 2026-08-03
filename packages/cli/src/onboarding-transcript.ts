/**
 * Harness adapters for the onboarding-budget monitor (ADR-0162 Phase 2 / ADR-0291).
 *
 * Both supported harnesses emit JSONL with top-level timestamps. Claude Code uses assistant/user
 * `tool_use` / `tool_result` content blocks paired by id. Codex uses `response_item` call/output
 * payloads paired by `call_id`; those calls normalize into the existing tool vocabulary.
 *
 * PARSING IS PURE over the text: {@link parseTranscript} detects the harness, pairs calls/results,
 * computes the per-tool latency (`result_ts − use_ts` — the baseline's metric, ADR-0162
 * Context; these are event-emission times, so the numbers are directional by design), extracts a
 * classification target from the tool input, and returns the ordered {@link TraceToolCall}[] the
 * budget core consumes. It never throws on a malformed line — it skips it.
 */

import type { TraceToolCall } from "./onboarding-budget.js";

/** A tool_use block reduced to what we need, keyed while we wait for its result. */
interface PendingUse {
  index: number;
  tool: string;
  target: string;
  useMs: number;
}

/**
 * PURE: derive a classification target from a tool's input object. Read/Edit/Write → the file path;
 * Bash/PowerShell → the command; Grep/Glob → the path or pattern; Agent/Task → the subagent type.
 * Everything else → "" (the classifier then treats it as generic orientation overhead).
 */
export function extractToolTarget(tool: string, input: unknown): string {
  const obj = typeof input === "object" && input !== null ? (input as Record<string, unknown>) : {};
  const str = (k: string): string => (typeof obj[k] === "string" ? (obj[k] as string) : "");

  switch (tool) {
    case "Read":
    case "Edit":
    case "Write":
    case "MultiEdit":
      return str("file_path");
    case "NotebookEdit":
      return str("notebook_path");
    case "Bash":
    case "PowerShell":
      return str("command");
    case "Grep":
      return str("path") || str("glob") || str("pattern");
    case "Glob":
      return str("path") ? `${str("path")}/${str("pattern")}` : str("pattern");
    case "LS":
      return str("path");
    case "Agent":
    case "Task":
      return str("subagent_type") || str("description");
    default:
      return "";
  }
}

/** Parse an ISO timestamp to epoch ms, or NaN. */
function tsMs(v: unknown): number {
  if (typeof v !== "string") return Number.NaN;
  const t = Date.parse(v);
  return Number.isNaN(t) ? Number.NaN : t;
}

/** The content blocks of a transcript entry, or [] when absent/non-array. */
function contentBlocks(entry: Record<string, unknown>): Record<string, unknown>[] {
  const msg = entry["message"];
  const content = typeof msg === "object" && msg !== null ? (msg as Record<string, unknown>)["content"] : undefined;
  if (!Array.isArray(content)) return [];
  return content.filter((b): b is Record<string, unknown> => typeof b === "object" && b !== null);
}

export interface ParsedTranscript {
  harness: "claude" | "codex" | "unknown";
  sessionId: string;
  calls: TraceToolCall[];
}

export interface ParseTranscriptOpts {
  /** The session id to stamp on the result; defaults to the transcript's own `sessionId` field, else "unknown". */
  sessionId?: string;
}

/**
 * PURE: parse a Claude Code transcript (JSONL text) into the ordered tool-call trace the budget core
 * measures. Tool calls are ordered by their `tool_use` timestamp; each latency is `result_ts −
 * use_ts` for the matching result, or 0 when there is no matching result (an unpaired trailing call).
 */
export function parseClaudeTranscript(jsonl: string, opts: ParseTranscriptOpts = {}): ParsedTranscript {
  const pending = new Map<string, PendingUse>();
  const resultMs = new Map<string, number>();
  const uses: PendingUse[] = [];
  let derivedSessionId: string | undefined;
  let index = 0;

  for (const line of jsonl.split("\n")) {
    const trimmed = line.trim();
    if (trimmed === "") continue;
    let entry: Record<string, unknown>;
    try {
      const parsed: unknown = JSON.parse(trimmed);
      if (typeof parsed !== "object" || parsed === null) continue;
      entry = parsed as Record<string, unknown>;
    } catch {
      continue; // malformed line — skip, never throw.
    }

    if (derivedSessionId === undefined && typeof entry["sessionId"] === "string") {
      derivedSessionId = entry["sessionId"] as string;
    }

    const at = tsMs(entry["timestamp"]);
    for (const block of contentBlocks(entry)) {
      const btype = block["type"];
      if (btype === "tool_use") {
        const id = typeof block["id"] === "string" ? (block["id"] as string) : "";
        const tool = typeof block["name"] === "string" ? (block["name"] as string) : "";
        const target = extractToolTarget(tool, block["input"]);
        const use: PendingUse = { index: index++, tool, target, useMs: at };
        uses.push(use);
        if (id !== "") pending.set(id, use);
      } else if (btype === "tool_result") {
        const forId = typeof block["tool_use_id"] === "string" ? (block["tool_use_id"] as string) : "";
        if (forId !== "" && !resultMs.has(forId)) resultMs.set(forId, at);
      }
    }
  }

  // Re-associate each pending use with its result timestamp (results may arrive on a later line).
  const useById = new Map<PendingUse, string>();
  for (const [id, use] of pending) useById.set(use, id);

  const calls: TraceToolCall[] = uses.map((use) => {
    const id = useById.get(use);
    const rMs = id !== undefined ? resultMs.get(id) : undefined;
    const latencyMs =
      rMs !== undefined && Number.isFinite(rMs) && Number.isFinite(use.useMs) && rMs > use.useMs
        ? rMs - use.useMs
        : 0;
    return { tool: use.tool, target: use.target, latencyMs };
  });

  return { harness: "claude", sessionId: opts.sessionId ?? derivedSessionId ?? "unknown", calls };
}

/** Parse a JSON object stored in a Codex call's string input/arguments, or return an empty object. */
function parseCallArgs(raw: unknown): Record<string, unknown> {
  if (typeof raw !== "string") return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    return typeof parsed === "object" && parsed !== null ? parsed as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

/** Normalize one Codex call into the existing harness-neutral budget vocabulary. */
function codexToolTarget(payload: Record<string, unknown>): { tool: string; target: string } {
  const name = typeof payload["name"] === "string" ? payload["name"] as string : "";
  const raw = typeof payload["input"] === "string"
    ? payload["input"] as string
    : typeof payload["arguments"] === "string"
      ? payload["arguments"] as string
      : "";
  const args = parseCallArgs(raw);

  if (name === "exec") {
    if (/tools\.apply_patch\s*\(/.test(raw)) return { tool: "Edit", target: raw };
    if (/tools\.shell_command\s*\(/.test(raw)) return { tool: "PowerShell", target: raw };
  }
  if (/apply_patch|write|edit/i.test(name)) {
    return { tool: "Edit", target: String(args["path"] ?? args["file_path"] ?? raw) };
  }
  if (/spawn_agent|followup_task|create_thread/i.test(name)) {
    return { tool: "Agent", target: String(args["task_name"] ?? args["target"] ?? name) };
  }
  if (/shell_command|exec_command/i.test(name)) {
    return { tool: "PowerShell", target: String(args["command"] ?? raw) };
  }
  if (/read|open|find|list|view|screenshot/i.test(name)) {
    return { tool: "Read", target: String(args["path"] ?? args["ref_id"] ?? raw) };
  }
  return { tool: name || "CodexTool", target: raw };
}

/** Parse Codex rollout JSONL (`response_item` call/output pairs keyed by `call_id`). */
export function parseCodexTranscript(jsonl: string, opts: ParseTranscriptOpts = {}): ParsedTranscript {
  const pending = new Map<string, PendingUse>();
  const resultMs = new Map<string, number>();
  const uses: PendingUse[] = [];
  let derivedSessionId: string | undefined;
  let index = 0;

  for (const line of jsonl.split("\n")) {
    const trimmed = line.trim();
    if (trimmed === "") continue;
    let entry: Record<string, unknown>;
    try {
      const parsed: unknown = JSON.parse(trimmed);
      if (typeof parsed !== "object" || parsed === null) continue;
      entry = parsed as Record<string, unknown>;
    } catch {
      continue;
    }

    const payloadValue = entry["payload"];
    const payload = typeof payloadValue === "object" && payloadValue !== null
      ? payloadValue as Record<string, unknown>
      : {};
    if (entry["type"] === "session_meta" && derivedSessionId === undefined) {
      const id = payload["session_id"] ?? payload["id"];
      if (typeof id === "string") derivedSessionId = id;
    }
    if (entry["type"] !== "response_item") continue;

    const type = payload["type"];
    const callId = typeof payload["call_id"] === "string" ? payload["call_id"] as string : "";
    const at = tsMs(entry["timestamp"]);
    if (type === "custom_tool_call" || type === "function_call") {
      const normalized = codexToolTarget(payload);
      const use: PendingUse = { index: index++, ...normalized, useMs: at };
      uses.push(use);
      if (callId !== "") pending.set(callId, use);
    } else if (type === "custom_tool_call_output" || type === "function_call_output") {
      if (callId !== "" && !resultMs.has(callId)) resultMs.set(callId, at);
    }
  }

  const useById = new Map<PendingUse, string>();
  for (const [id, use] of pending) useById.set(use, id);
  const calls = uses.map((use): TraceToolCall => {
    const id = useById.get(use);
    const rMs = id !== undefined ? resultMs.get(id) : undefined;
    const latencyMs = rMs !== undefined && Number.isFinite(rMs) && Number.isFinite(use.useMs) && rMs > use.useMs
      ? rMs - use.useMs
      : 0;
    return { tool: use.tool, target: use.target, latencyMs };
  });
  return { harness: "codex", sessionId: opts.sessionId ?? derivedSessionId ?? "unknown", calls };
}

/** Auto-detect the supported harness while preserving the original public entrypoint. */
export function parseTranscript(jsonl: string, opts: ParseTranscriptOpts = {}): ParsedTranscript {
  if (/"type"\s*:\s*"session_meta"|"type"\s*:\s*"response_item"/.test(jsonl)) {
    return parseCodexTranscript(jsonl, opts);
  }
  if (/"type"\s*:\s*"(?:assistant|user)"/.test(jsonl) && /"tool_(?:use|result)"/.test(jsonl)) {
    return parseClaudeTranscript(jsonl, opts);
  }
  return { harness: "unknown", sessionId: opts.sessionId ?? "unknown", calls: [] };
}
