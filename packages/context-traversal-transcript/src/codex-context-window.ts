/**
 * Reads the current Codex task's raw context-window occupancy from its exactly identified rollout.
 *
 * This is additive to Storytree's Claude transcript reader. Codex identity is direct
 * (`CODEX_THREAD_ID`), rollout selection is confirmed by `session_meta.payload.id`, and only usage
 * metadata leaves the parser. Missing or malformed host state is an explicit absence, never an
 * exception or a numeric zero.
 *
 * Story `context-traversal-transcript`, capability `codex-own-window-reading` (ADR-0555).
 */
import fs from "node:fs";
import path from "node:path";

export type CodexContextWindowUnavailableReason =
  | "identity-unavailable"
  | "rollout-unavailable"
  | "usage-unavailable";

export interface CodexContextWindowUnavailable {
  readonly status: "unavailable";
  readonly reason: CodexContextWindowUnavailableReason;
}

export type CodexModelContextWindow =
  | { readonly status: "available"; readonly tokens: number }
  | { readonly status: "unavailable"; readonly reason: "not-declared" };

export interface CodexCompositionUnavailable {
  readonly status: "unavailable";
  readonly reason: "not-exposed";
}

export interface CodexSchedulingBandUnavailable {
  readonly status: "unavailable";
  readonly reason: "policy-unsettled";
}

export type CodexUsageSource = "token_usage_record" | "event_msg.token_count";

export interface CodexContextWindowAvailable {
  readonly status: "available";
  readonly threadId: string;
  readonly usageSource: CodexUsageSource;
  readonly residentInputTokens: number;
  readonly peakInputTokens: number;
  readonly modelContextWindow: CodexModelContextWindow;
  readonly composition: CodexCompositionUnavailable;
  readonly schedulingBand: CodexSchedulingBandUnavailable;
}

export type CodexContextWindowRead = CodexContextWindowAvailable | CodexContextWindowUnavailable;

/** Environment-shaped by design: parent-session and cwd keys may be present but never identify. */
export type CodexIdentityEnvironment = Readonly<Record<string, string | undefined>>;

interface RolloutRecord {
  readonly type?: unknown;
  readonly payload?: unknown;
}

interface ParsedRollout {
  readonly records: ReadonlySet<RolloutRecord>;
  readonly sessionIds: ReadonlySet<string>;
}

const COMPOSITION_UNAVAILABLE: CodexCompositionUnavailable = {
  status: "unavailable",
  reason: "not-exposed",
};

const SCHEDULING_BAND_UNAVAILABLE: CodexSchedulingBandUnavailable = {
  status: "unavailable",
  reason: "policy-unsettled",
};

function unavailable(reason: CodexContextWindowUnavailableReason): CodexContextWindowUnavailable {
  return { status: "unavailable", reason };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  // JSON primitives have safe property reads in JavaScript; null and arrays are the two shapes
  // that cannot act as a record here. The subsequent field validators still accept no primitive.
  return value !== null && !Array.isArray(value);
}

function nonNegativeInteger(value: unknown): number | undefined {
  return Number.isSafeInteger(value) && (value as number) >= 0 ? (value as number) : undefined;
}

function positiveInteger(value: unknown): number | undefined {
  return Number.isSafeInteger(value) && (value as number) > 0 ? (value as number) : undefined;
}

/**
 * Every JSONL file beneath the supplied sessions root. Directory links are not followed, and an
 * unreadable branch contributes no candidates instead of failing the whole read.
 */
function collectRolloutFiles(root: string): string[] {
  const files = new Set<string>();

  const visit = (dir: string): void => {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isFile()) {
        if (entry.name.endsWith(".jsonl")) files.add(full);
      } else if (entry.isDirectory()) {
        visit(full);
      }
    }
  };

  visit(root);
  return Array.from(files);
}

/** Parse usable metadata records and collect every session identity the file declares. */
function parseRollout(file: string): ParsedRollout | undefined {
  let raw: string;
  try {
    raw = fs.readFileSync(file, "utf8");
  } catch {
    return undefined;
  }

  const records = new Set<RolloutRecord>();
  const sessionIds = new Set<string>();

  for (const rawLine of raw.split(/\r?\n/)) {
    let parsed: unknown;
    // Stryker disable BlockStatement: leaving `parsed` undefined is observably identical to this
    // explicit decline because the shape guard immediately rejects both; malformed JSON is covered.
    try {
      parsed = JSON.parse(rawLine);
    } catch {
      continue;
    }
    // Stryker restore BlockStatement
    if (!isPlainObject(parsed)) continue;

    // Retain only the two routing members. Prompt, response, reasoning, tool data, paths and every
    // other arbitrary member are discarded here and can never reach the public result.
    const record: RolloutRecord = { type: parsed.type, payload: parsed.payload };
    records.add(record);

    if (record.type !== "session_meta" || !isPlainObject(record.payload)) continue;
    const id = record.payload.id;
    if (typeof id === "string" && id.length > 0) sessionIds.add(id);
  }

  return { records, sessionIds };
}

/** A file is attributable only when all usable session metadata agrees on the exact target id. */
function exactlyIdentifies(rollout: ParsedRollout, threadId: string): boolean {
  return rollout.sessionIds.size === 1 && rollout.sessionIds.has(threadId);
}

interface OccupancySeries {
  readonly usageSource: CodexUsageSource;
  readonly values: readonly number[];
  readonly modelContextWindow: number | undefined;
}

function occupancySeries(rollout: ParsedRollout, threadId: string): OccupancySeries | undefined {
  const authoritative = new Array<number>();
  const fallback = new Array<number>();
  const seenResponseIds = new Set<string>();
  let modelContextWindow: number | undefined;

  for (const record of rollout.records) {
    if (!isPlainObject(record.payload)) continue;

    if (record.type === "token_usage_record") {
      // A response id is the request identity for this vocabulary. Repeated records for the same
      // response are one observation, and a row attributed to another thread is never borrowed.
      if (record.payload.thread_id !== threadId) continue;
      const responseId = record.payload.response_id;
      if (typeof responseId !== "string" || responseId.trim().length === 0 || seenResponseIds.has(responseId)) {
        continue;
      }
      const usage = isPlainObject(record.payload.usage) ? record.payload.usage : undefined;
      const inputTokens = usage === undefined ? undefined : nonNegativeInteger(usage.input_tokens);
      if (inputTokens === undefined) continue;
      seenResponseIds.add(responseId);
      authoritative.push(inputTokens);
      continue;
    }

    if (record.type !== "event_msg" || record.payload.type !== "token_count") continue;
    const info = isPlainObject(record.payload.info) ? record.payload.info : undefined;
    if (info === undefined) continue;

    // Capacity is independent from occupancy vocabulary and the latest valid declaration wins.
    const declaredCapacity = positiveInteger(info.model_context_window);
    if (declaredCapacity !== undefined) modelContextWindow = declaredCapacity;

    const lastUsage = isPlainObject(info.last_token_usage) ? info.last_token_usage : undefined;
    const inputTokens = lastUsage === undefined ? undefined : nonNegativeInteger(lastUsage.input_tokens);
    if (inputTokens !== undefined) fallback.push(inputTokens);
  }

  if (authoritative.length > 0) {
    return { usageSource: "token_usage_record", values: authoritative, modelContextWindow };
  }
  if (fallback.length > 0) {
    return { usageSource: "event_msg.token_count", values: fallback, modelContextWindow };
  }
  return undefined;
}

/**
 * Read one Codex task's raw occupancy from the current sessions root.
 *
 * The operation is synchronous because it is one local metadata read used by a synchronous CLI
 * seam. It never throws: missing identity, filesystem state, exact attribution or usage each has a
 * typed result.
 */
export function readCodexContextWindow(
  sessionsRoot: string,
  environment: CodexIdentityEnvironment,
): CodexContextWindowRead {
  const rawThreadId = environment.CODEX_THREAD_ID;
  if (rawThreadId === undefined || rawThreadId.trim().length === 0) return unavailable("identity-unavailable");
  const threadId = rawThreadId.trim();

  const matches: ParsedRollout[] = [];
  for (const file of collectRolloutFiles(sessionsRoot)) {
    const rollout = parseRollout(file);
    if (rollout !== undefined && exactlyIdentifies(rollout, threadId)) matches.push(rollout);
  }

  // Resumed/copied duplicates are intentionally not resolved by path order or recency.
  if (matches.length !== 1) return unavailable("rollout-unavailable");
  const selected = matches[0]!;

  const series = occupancySeries(selected, threadId);
  if (series === undefined) return unavailable("usage-unavailable");
  const residentInputTokens = series.values.at(-1)!;

  const modelContextWindow: CodexModelContextWindow =
    series.modelContextWindow === undefined
      ? { status: "unavailable", reason: "not-declared" }
      : { status: "available", tokens: series.modelContextWindow };

  return {
    status: "available",
    threadId,
    usageSource: series.usageSource,
    residentInputTokens,
    peakInputTokens: Math.max(...series.values),
    modelContextWindow,
    composition: COMPOSITION_UNAVAILABLE,
    schedulingBand: SCHEDULING_BAND_UNAVAILABLE,
  };
}
