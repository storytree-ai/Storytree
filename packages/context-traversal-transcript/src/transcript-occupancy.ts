/**
 * Reads a host Claude Code transcript (JSONL) and reduces it to the parent window's own occupancy
 * series: one `OccupancyObservation` per model request, in file order, metadata only (ADR-0235 /
 * ADR-0241 / ADR-0248 D1). Never throws — a missing/unreadable/empty/truncated file, or an
 * unusable line within an otherwise-good file, degrades to an honest partial read instead.
 *
 * Story `context-traversal-transcript`, capability `transcript-occupancy-extraction`.
 */
import fs from "node:fs";

export interface OccupancyObservation {
  /** The model request's own id (`message.id`) — stable, and the ingest's identity seed. */
  readonly requestId: string;
  /** The request's ISO-8601 timestamp, carried through verbatim. */
  readonly at: string;
  /** Tokens RESIDENT in the window for this request: input + cache-read + cache-write. */
  readonly residentInputTokens: number;
  /** `message.model`, when the line declares one. Absent, never empty-string, when it does not. */
  readonly modelId?: string;
}

export interface TranscriptWindowRead {
  /** The host session id every usable line agreed on, or `undefined` when the file is unusable. */
  readonly windowId: string | undefined;
  /** Observations in the order the file recorded them. Empty when `windowId` is undefined. */
  readonly observations: readonly OccupancyObservation[];
  /** Assistant-shaped lines that could not be used (unparseable, truncated, no usable usage). */
  readonly skippedLines: number;
  /** Sidechain requests seen and deliberately excluded — reported, never silently dropped. */
  readonly sidechainRequests: number;
  /**
   * The SIDECHAIN requests' own readings, in file order — the helper windows' occupancy, kept
   * separate from {@link observations} rather than merged into it.
   *
   * These lines were always parsed and summed here (they have to be, to be counted at all); until
   * now the totals were computed and thrown away. Carrying them costs one array and is what lets a
   * caller show a helper window's own fullness WITHOUT re-implementing this file's parse rules
   * somewhere else — a second copy of "what counts as a resident total" is exactly how two surfaces
   * come to describe one transcript differently.
   *
   * ⚠ THEY ARE NEVER ADDED TO {@link observations}, AND A CALLER MUST NOT ADD THEM EITHER
   * (ADR-0413 D2, restated by ADR-0452 D4 — permanent, not deferred). A helper runs an independent
   * context window that is gone by the time the parent reaches its own peak; summing windows that
   * were never full at the same moment draws a fullness level no real window ever reached, and how
   * close a window sits to its limit is the whole purpose of the reading. Display them beside the
   * parent, never inside its number.
   *
   * ⚠ THEY DO NOT CARRY THE HELPER'S OWN WINDOW ID, and none is recoverable here: a subagent
   * transcript stamps its PARENT's `sessionId` on every line (measured 2026-08-21, 188/188 files).
   * A helper window's identity is therefore its FILE, which only the caller holding the path knows —
   * so this array is deliberately un-keyed rather than grouped.
   */
  readonly sidechainObservations: readonly OccupancyObservation[];
}

/** The three axes that make up resident occupancy for one request. Any other usage key is ignored. */
const RESIDENT_AXES = ["input_tokens", "cache_read_input_tokens", "cache_creation_input_tokens"] as const;

/**
 * A crash-truncated (or otherwise unparseable) line still textually declares its `type`. This is
 * the only way to tell an unusable assistant-shaped line apart from an unusable line of some other
 * type, which must not be counted at all.
 */
const ASSISTANT_SHAPE_PATTERN = /"type"\s*:\s*"assistant"/;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Sums the three resident-token axes; a missing axis is 0, an invalid one fails the whole line. */
function sumResidentTokens(usage: Record<string, unknown>): number | undefined {
  let total = 0;
  for (const axis of RESIDENT_AXES) {
    const value = usage[axis];
    if (value === undefined) continue;
    if (typeof value !== "number" || !Number.isInteger(value) || value < 0) return undefined;
    total += value;
  }
  return total;
}

const EMPTY_READ: TranscriptWindowRead = {
  windowId: undefined,
  observations: [],
  skippedLines: 0,
  sidechainRequests: 0,
  sidechainObservations: [],
};

export function readTranscriptWindow(filePath: string): TranscriptWindowRead {
  let raw: string;
  try {
    raw = fs.readFileSync(filePath, "utf8");
  } catch {
    return EMPTY_READ;
  }

  let skippedLines = 0;
  const parentSeen = new Set<string>();
  const sidechainSeen = new Set<string>();
  const sessionIdsSeen = new Set<string>();
  const parentObservations: OccupancyObservation[] = [];
  const sidechainObservations: OccupancyObservation[] = [];

  for (const line of raw.split(/\r?\n/)) {
    if (line.trim() === "") continue;

    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch {
      if (ASSISTANT_SHAPE_PATTERN.test(line)) skippedLines++;
      continue;
    }

    if (!isPlainObject(parsed) || parsed.type !== "assistant") continue;

    const messageRecord = isPlainObject(parsed.message) ? parsed.message : undefined;
    const requestId =
      messageRecord !== undefined && typeof messageRecord.id === "string" ? messageRecord.id : undefined;
    const isSidechain = parsed.isSidechain === true;

    // No usable request identity at all: can never be deduped, so it is always its own skip.
    if (requestId === undefined) {
      skippedLines++;
      continue;
    }

    // Dedupe by message.id ONLY, before any other validation: a later line for an already-seen
    // request is neither an observation nor a skip, no matter what it contains.
    const seen = isSidechain ? sidechainSeen : parentSeen;
    if (seen.has(requestId)) continue;
    seen.add(requestId);

    const sessionId = parsed.sessionId;
    const timestamp = parsed.timestamp;
    if (typeof sessionId !== "string" || typeof timestamp !== "string") {
      skippedLines++;
      continue;
    }

    const usage = messageRecord !== undefined ? messageRecord.usage : undefined;
    if (!isPlainObject(usage)) {
      skippedLines++;
      continue;
    }

    const total = sumResidentTokens(usage);
    if (total === undefined) {
      skippedLines++;
      continue;
    }

    const modelId =
      messageRecord !== undefined && typeof messageRecord.model === "string" ? messageRecord.model : undefined;
    const observation: OccupancyObservation =
      modelId !== undefined
        ? { requestId, at: timestamp, residentInputTokens: total, modelId }
        : { requestId, at: timestamp, residentInputTokens: total };

    // A subagent's own window — excluded from the parent series, kept in its own (rule: never
    // merged, see `sidechainObservations`). Its `sessionId` is deliberately NOT added to
    // `sessionIdsSeen`: the line carries the PARENT's id, so counting it would make a helper-only
    // file appear to name a window it does not.
    if (isSidechain) {
      sidechainObservations.push(observation);
      continue;
    }

    sessionIdsSeen.add(sessionId);
    parentObservations.push(observation);
  }

  const sidechainRequests = sidechainSeen.size;

  // No usable line at all, or usable lines that disagree about the window's own identity: refuse
  // rather than guess, since every downstream event keys on this id.
  //
  // A SUBAGENT TRANSCRIPT LANDS HERE BY CONSTRUCTION and that is the correct answer, not a failure:
  // every one of its assistant lines is a sidechain line, so nothing ever reaches `sessionIdsSeen`
  // and the file names no parent window of its own. Its readings still travel out on
  // `sidechainObservations` — the refusal is about the WINDOW ID, never about the readings.
  if (sessionIdsSeen.size !== 1) {
    return { windowId: undefined, observations: [], skippedLines, sidechainRequests, sidechainObservations };
  }

  const [windowId] = sessionIdsSeen;
  return { windowId, observations: parentObservations, skippedLines, sidechainRequests, sidechainObservations };
}
