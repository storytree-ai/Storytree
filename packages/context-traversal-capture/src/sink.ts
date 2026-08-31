/**
 * The durable local sink for context-traversal traces (ADR-0241), story `context-traversal-capture`,
 * capability `traversal-trace-sink`.
 *
 * A narrow append/read/list seam over one JSONL file per session, so a Postgres-backed
 * implementation can replace it later without touching a caller (ADR-0241 D8). Every event is
 * validated through increment 1's `ContextTraversalEvent` vocabulary BEFORE it reaches the bytes
 * (ADR-0241 D4); reads are tolerant and honestly partial — a bad line is skipped and counted, never
 * thrown on (ADR-0241 D5). Session identity is supplied by the caller, never derived here
 * (ADR-0241 D9): this module imports nothing beyond zod (via the telemetry vocabulary) and
 * `node:fs`/`node:os`/`node:path`, so it stays free of `@storytree/drive`.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { ContextTraversalEvent, createContextTraversalTrace } from "@storytree/context-traversal-telemetry";
import type { ContextTraversalReplay } from "@storytree/context-traversal-telemetry";

import { classifyTraceIdentity } from "./session-identity.js";
import type { TraceIdentityGrade, TraceIdentityKind } from "./session-identity.js";
import { foldSessionOrigin } from "./session-origin.js";
import type { SessionOriginClaim, SessionOriginKind, TraceOriginReading } from "./session-origin.js";

const TRAVERSAL_DIR_ENV = "STORYTREE_TRAVERSAL_DIR";
const SCHEMA_VERSION = 1;

/**
 * The identity ATTRIBUTES a written line may carry beside its event
 * (`linked-session-context-arc-inc-30`).
 *
 * ADDITIVE SIBLINGS OF `event`, NOT A SCHEMA BUMP, and that is a deliberate choice over bumping
 * `v`. They describe the line's `sessionId` — how well it names one context window, and which
 * worktree slot the window ran in — rather than changing any event's shape, so the event
 * vocabulary (`@storytree/context-traversal-telemetry`) is untouched. Bumping `v` instead would
 * have made every existing trace unreadable at a stroke, and an OLDER reader would refuse a NEWER
 * line; siblings degrade the other way, which is the direction that keeps a local trace usable.
 *
 * An ungraded line is a LEGACY SLOT-ERA line — written when `sessionId` was the pooled worktree
 * slot. Nothing on disk records which window wrote it, so it is never retrofitted, only labelled
 * ({@link classifyTraceIdentity}).
 */
export interface TraversalLineIdentity {
  /** How well this line's `sessionId` names one context window. Absent = the legacy slot era. */
  readonly grade?: TraceIdentityGrade;
  /** The worktree slot the window ran in — a GROUPING attribute recorded beside the identity. */
  readonly slot?: string | null;
  /**
   * HOW THE SESSION CAME TO EXIST — human-started, or cut by a predecessor (ADR-0484 D7).
   *
   * A third additive sibling on the same argument as the two above, and it inherits their absence
   * rule with one clause added: an absent `origin` is UNKNOWN and is never read as `human`. The
   * whole point of the increment that added it is that "the session's first read followed the
   * owner's prompt" was being assumed; a default here would restore the assumption under a new name.
   */
  readonly origin?: SessionOriginKind;
  /** The session that cut this one, when it named itself. Only ever present beside `origin: cut`. */
  readonly cutBy?: string | null;
  /** The arc/increment this session was cut to drive — a canonical identity, never free text. */
  readonly cutFor?: string | null;
}

export interface TraversalSinkLocation extends TraversalLineIdentity {
  readonly dir: string;
  readonly sessionId: string;
}

export interface TraversalListLocation {
  readonly dir: string;
}

export interface TraversalReadResult {
  readonly replay: ContextTraversalReplay;
  readonly skipped: number;
  /** What this session's id turns out to name — stated, never inferred from the id's shape. */
  readonly identity: TraceIdentityKind;
  /** Every distinct worktree slot the session's lines recorded, in first-seen order. */
  readonly slots: readonly string[];
  /** Who started the session, as its own lines declared it — `unknown` when none did. */
  readonly origin: TraceOriginReading;
}

export interface TraversalSessionSummary {
  readonly sessionId: string;
  readonly eventCount: number;
  readonly lastObservedAt: string | undefined;
  /** What this session's id names ({@link TraversalReadResult.identity}). */
  readonly identity: TraceIdentityKind;
  /** Every distinct worktree slot the session's lines recorded, in first-seen order. */
  readonly slots: readonly string[];
  /** Who started the session ({@link TraversalReadResult.origin}). */
  readonly origin: TraceOriginReading;
}

/**
 * Resolves the directory traces are written under: `STORYTREE_TRAVERSAL_DIR` when set (env always
 * wins, the `STORYTREE_SECRETS_FILE` precedent), else `~/.storytree/traces`. Callers that need a
 * deterministic, HOME-independent location (every test in this package) pass an explicit `dir`
 * instead of calling this helper.
 */
export function resolveTraversalDir(): string {
  const override = process.env[TRAVERSAL_DIR_ENV];
  if (override !== undefined && override.trim().length > 0) return override;
  return path.join(os.homedir(), ".storytree", "traces");
}

function sessionFilePath(dir: string, sessionId: string): string {
  return path.join(dir, `${sessionId}.jsonl`);
}

/**
 * Appends `events` to the session's JSONL file, one `{"v":1,"event":{…}}` line per event —
 * plus this append's {@link TraversalLineIdentity} attributes when it supplies any — synchronously.
 * Every event is parsed through `ContextTraversalEvent` first; an event that fails
 * validation is silently dropped from the batch — its siblings still land (contract
 * `invalid-events-never-reach-the-bytes`). Never throws: a missing directory is created, and any
 * other failure (an unwritable target) returns `false` instead of propagating.
 */
export function appendTraversalEvents(events: readonly unknown[], location: TraversalSinkLocation): boolean {
  if (events.length === 0) return true;

  // The identity attributes are stamped ONCE per append and repeated on every line, rather than
  // written to a per-session header: the file is append-only and each line must stand alone, since
  // a crash-truncated read replays whatever IS readable (ADR-0241 D5) — a header would be the one
  // line whose loss silently re-labelled the whole trace.
  //
  // ONE RULE FOR ALL FIVE ATTRIBUTES, not five near-identical guards. An attribute is stamped when
  // it NAMES something and is omitted otherwise, and the omission is the load-bearing half: an
  // absent `origin` key is what makes a line read back `unknown` rather than `human`, and an absent
  // `grade` is what makes a legacy line legible as one (ADR-0484 D7 / inc-30). Written five times
  // over, that rule had five places to drift and no single place to test.
  const identity: Record<string, string> = {};
  const stamp = (key: string, value: string | null | undefined): void => {
    // Stryker disable next-line ConditionalExpression: the `undefined` half is EQUIVALENT and the
    // `null` half is not. `JSON.stringify` omits a key whose value is `undefined`, so dropping this
    // conjunct writes the same bytes; dropping the `null` one writes `"cutBy":null` onto every
    // human-started line, which `a-null-cutter-writes-no-key` asserts against real bytes. Both are
    // spelled because the RULE is "names something", not "is not undefined".
    if (value !== undefined && value !== null) identity[key] = value;
  };
  stamp("grade", location.grade);
  stamp("slot", location.slot);
  stamp("origin", location.origin);
  stamp("cutBy", location.cutBy);
  stamp("cutFor", location.cutFor);

  const lines: string[] = [];
  for (const candidate of events) {
    const parsed = ContextTraversalEvent.safeParse(candidate);
    if (parsed.success) {
      lines.push(`${JSON.stringify({ v: SCHEMA_VERSION, event: parsed.data, ...identity })}\n`);
    }
  }
  if (lines.length === 0) return true;

  try {
    fs.mkdirSync(location.dir, { recursive: true });
    fs.appendFileSync(sessionFilePath(location.dir, location.sessionId), lines.join(""), {
      encoding: "utf8",
    });
    return true;
  } catch {
    return false;
  }
}

interface ParsedLine {
  readonly v: unknown;
  readonly event: unknown;
  readonly grade?: unknown;
  readonly slot?: unknown;
  readonly origin?: unknown;
  readonly cutBy?: unknown;
  readonly cutFor?: unknown;
}

function isParsedLineShape(value: unknown): value is ParsedLine {
  return typeof value === "object" && value !== null && "v" in value && "event" in value;
}

/**
 * A line's identity grade, or undefined for a legacy slot-era line (and for any line whose grade is
 * not one of the two known words — an unrecognised grade is read as "this reader cannot vouch for
 * it", never coerced into a grade it might not be).
 */
function gradeOf(line: ParsedLine): TraceIdentityGrade | undefined {
  return line.grade === "window" || line.grade === "declared" ? line.grade : undefined;
}

/**
 * A line's origin claim, on the same rule as {@link gradeOf}: an unrecognised word is read as "this
 * line declared nothing", never coerced into one of the two origins it might not be. Coercing here
 * would be the reassuring-direction guess the whole attribute exists to prevent.
 */
function claimOf(line: ParsedLine): SessionOriginClaim {
  const origin = line.origin === "human" || line.origin === "cut" ? line.origin : undefined;
  // The two RIDERS pass through unjudged. `foldSessionOrigin` is the one place that decides what
  // names somebody, and it is shared with the Postgres reader — a second `typeof` here would be the
  // same rule in a second place, which is the shape that drifts.
  return { origin, cutBy: line.cutBy, cutFor: line.cutFor };
}

/**
 * Reads a session's JSONL file back through a FRESH `createContextTraversalTrace()` and returns its
 * replay alongside a count of every line that could not be used. Tolerant of a trailing `\r`, a
 * final crash-truncated partial line, a duplicate identity (which increment 1's in-memory trace
 * would throw on), a JSON-parse failure, and an unknown `v`. A session with no file yet replays as
 * empty with zero skipped, rather than throwing.
 */
export function readTraversalSession(location: TraversalSinkLocation): TraversalReadResult {
  const trace = createContextTraversalTrace();

  let raw: string;
  try {
    raw = fs.readFileSync(sessionFilePath(location.dir, location.sessionId), "utf8");
  } catch {
    // No file: no lines, so nothing to classify. Classified through the SAME function as every
    // other read rather than hardcoded, so the empty case can never drift into its own rule — and
    // the renders below print no identity line at all for a replay with no events, so this value
    // labels nothing.
    return {
      replay: trace.replay(location.sessionId),
      skipped: 0,
      identity: classifyTraceIdentity([]),
      slots: [],
      // Stryker disable next-line ArrayDeclaration: EQUIVALENT — the fold reads `.origin` / `.cutBy`
      // / `.cutFor` off each element, and every element of a junk array answers `undefined`, so any
      // non-empty literal here folds to the same `unknown` with no riders. Called rather than
      // hardcoded so the empty case can never drift into its own rule.
      origin: foldSessionOrigin([]),
    };
  }

  const rawLines = raw.split("\n");
  // A well-formed file ends with a trailing "\n", which splits into one empty trailing element —
  // drop it. A crash-truncated file has no trailing newline, so its last element is the genuine
  // partial line and must still be walked (and counted as skipped) below.
  if (rawLines.length > 0 && rawLines[rawLines.length - 1] === "") rawLines.pop();

  const seenEventIds = new Set<string>();
  const seenVisitIds = new Set<string>();
  // Collected from the lines that were actually USED: a skipped line vouches for nothing, so a
  // corrupt tail can neither add an identity grade nor invent a slot.
  const grades: (TraceIdentityGrade | undefined)[] = [];
  const slots: string[] = [];
  // Stryker disable next-line ArrayDeclaration: EQUIVALENT — a seeded junk element answers
  // `undefined` for all three fields it is read for, so it contributes to neither the reading nor
  // either rider list. The empty start is what makes the accumulator honest, not what makes it work.
  const claims: SessionOriginClaim[] = [];
  let skipped = 0;

  for (const untrimmed of rawLines) {
    const line = untrimmed.endsWith("\r") ? untrimmed.slice(0, -1) : untrimmed;
    if (line.trim().length === 0) continue;

    let candidate: unknown;
    try {
      candidate = JSON.parse(line);
    } catch {
      skipped += 1;
      continue;
    }

    if (!isParsedLineShape(candidate) || candidate.v !== SCHEMA_VERSION) {
      skipped += 1;
      continue;
    }

    const parsedEvent = ContextTraversalEvent.safeParse(candidate.event);
    if (!parsedEvent.success) {
      skipped += 1;
      continue;
    }

    const event = parsedEvent.data;
    const visitId = "visitId" in event ? event.visitId : undefined;
    const alreadySeen = seenEventIds.has(event.eventId) || (visitId !== undefined && seenVisitIds.has(visitId));
    if (alreadySeen) {
      skipped += 1;
      continue;
    }

    seenEventIds.add(event.eventId);
    if (visitId !== undefined) seenVisitIds.add(visitId);
    grades.push(gradeOf(candidate));
    claims.push(claimOf(candidate));
    if (typeof candidate.slot === "string" && candidate.slot.length > 0 && !slots.includes(candidate.slot)) {
      slots.push(candidate.slot);
    }
    trace.append(event);
  }

  return {
    replay: trace.replay(location.sessionId),
    skipped,
    identity: classifyTraceIdentity(grades),
    slots,
    origin: foldSessionOrigin(claims),
  };
}

/**
 * The filename convention a trace is stored under. Exported so an index built over the same
 * directory splits ids exactly the way this module joins them, rather than re-spelling `.jsonl`.
 */
export const TRAVERSAL_TRACE_EXT = ".jsonl";

/**
 * ONE session's summary, or `null` when the file replays to zero usable events.
 *
 * ★ EXTRACTED SO THERE IS ONE FOLD, not two that a test has to hold together. This body used to be
 * inlined in {@link listTraversalSessions} and hand-MIRRORED again in the studio's incremental index
 * — two copies of "what a summary is", kept honest only by a deep-equality parity test, which is a
 * fence rather than a structure. Both callers now call this, so a field added to
 * {@link TraversalSessionSummary} cannot reach one answer and miss the other.
 */
export function summarizeTraversalSession(
  dir: string,
  sessionId: string,
): TraversalSessionSummary | null {
  const { replay, identity, slots, origin } = readTraversalSession({ dir, sessionId });
  if (replay.events.length === 0) return null;
  const lastEvent = replay.events[replay.events.length - 1];
  return {
    sessionId,
    eventCount: replay.events.length,
    origin,
    // Stryker disable next-line OptionalChaining: EQUIVALENT — the zero-event case returned above,
    // so `events.length - 1` is a valid index and `lastEvent` is never undefined here. The `?.` is
    // `noUncheckedIndexedAccess` satisfying the compiler, not a runtime guard.
    lastObservedAt: lastEvent?.at,
    identity,
    slots,
  };
}

/**
 * Enumerates every captured session under `dir`: its event count and the timestamp of its
 * last-observed (chronologically last) event. A session file that fails to read, or replays to zero
 * usable events, is omitted rather than reported with a fabricated timestamp.
 */
export function listTraversalSessions(location: TraversalListLocation): TraversalSessionSummary[] {
  let entries: string[];
  try {
    entries = fs.readdirSync(location.dir);
  } catch {
    return [];
  }

  const summaries: TraversalSessionSummary[] = [];
  for (const entry of entries) {
    // Stryker disable next-line ConditionalExpression: EQUIVALENT for this list's ANSWER — a
    // non-trace entry that slipped past the filter is read by `summarizeTraversalSession`, which
    // returns null for a file it cannot replay, so the list is identical either way. The filter is
    // there to avoid the read, not to change the result; the incremental index beside it asserts the
    // no-read property directly, by counting.
    if (!entry.endsWith(TRAVERSAL_TRACE_EXT)) continue;
    const sessionId = entry.slice(0, -TRAVERSAL_TRACE_EXT.length);
    const summary = summarizeTraversalSession(location.dir, sessionId);
    if (summary !== null) summaries.push(summary);
  }
  return summaries;
}
