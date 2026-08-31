/**
 * DURABLE LOCAL WRITE, THEN ASYNCHRONOUS SHIP — story `context-traversal-capture`, capability
 * `traversal-trace-sink` (ADR-0484 D4).
 *
 * The shape is not "write to Postgres", and the difference is the whole decision. The capture path
 * still appends the event to this machine's JSONL trace SYNCHRONOUSLY and returns; this module
 * drains that file into the shared store afterwards, out of band, and retries. Three properties,
 * each here because its opposite was refused:
 *
 * 1. **A command NEVER waits on the database and never fails because of the log.** Writing inline
 *    would put a network round trip and a possible outage in front of the most frequent command in
 *    the system — and a bare read does not open a pool at all (`buildStore` gates `createPool` on
 *    `--pg`), which it must not start doing to write telemetry.
 * 2. **A failure to ship is NOT swallowed.** The old capture was a silent `try {} catch {}` under
 *    the comment *"the trace is a courtesy"*; the first half of that stands and "a courtesy" is
 *    withdrawn as too weak. A failed ship leaves the cursor UNADVANCED and records why, so the
 *    unshipped backlog is visible and reportable and *"we have no data"* stays distinguishable from
 *    *"nothing happened"*.
 * 3. **Local durability is the contract, not the destination.** The local write is what makes the
 *    asynchronous ship safe to lose. It is never skipped because the database happens to be up.
 *
 * ⚠ **NOTHING HERE BACKFILLS (ADR-0484 D6, owner-directed).** {@link ensureShipBaseline} stamps a
 * session's cursor at the trace file's CURRENT END the first time the capture path appends after
 * this landing, so only events traced FORWARD from it are ever shipped. Every existing local trace
 * stays valid and stays where it is; a reader spanning the change reads two stores, which is
 * cheaper than a migration nobody needed. A session that has no cursor is pure history and is
 * skipped entirely — the shipper never baselines one on its own, because doing so on a first sweep
 * IS the backfill by another name.
 *
 * RETRY IS THE CURSOR, NOT A LOOP. There is no in-process retry schedule: a failed attempt simply
 * leaves the offset where it was, so the NEXT attempt re-reads the same bytes. Combined with the
 * store's `ON CONFLICT (event_id) DO NOTHING`, a partial failure that had already committed some
 * rows re-sends them harmlessly. That is what makes the retry safe to be this simple, and it is why
 * a shipper that is killed mid-flight loses nothing.
 *
 * EVERY SHAPE READ OFF DISK IS A ZOD SCHEMA, never a hand-rolled type guard — the same rule
 * `sink.ts` follows for the event itself (ADR-0241 D4). Two things follow that a chain of `typeof`
 * checks does not give: a malformed cursor degrades to the empty cursor in ONE place rather than
 * field by field, and the two attributes whose rule is "unrecognised means unstated" say exactly
 * that with `.catch()` instead of leaving a reader to infer it from a ternary.
 */
import fs from "node:fs";
import path from "node:path";

import { ContextTraversalEvent } from "@storytree/context-traversal-telemetry";
import { z } from "zod";

import type { TraceIdentityGrade } from "../session-identity.js";
import type { SessionOriginKind } from "../session-origin.js";
import { TRAVERSAL_TRACE_EXT } from "../sink.js";
import type { TraversalEventLocation, TraversalEventStore } from "./traversal-event-store.js";

/** The filename suffix a session's ship cursor is stored under, beside its `.jsonl` trace. */
export const SHIP_CURSOR_EXT = ".ship.json";

/** The marker file recording when a ship was last ATTEMPTED on this machine (the throttle). */
const SHIP_ATTEMPT_MARKER = ".ship-attempt";

/** The environment variable the detached shipper carries, so it can recognise itself. */
export const SHIP_CHILD_ENV = "STORYTREE_TRAVERSAL_SHIP";

/**
 * The trace-directory override. Its presence means a caller has taken the trace somewhere of its
 * own, which is what {@link shouldStartShip} refuses to sweep ambiently — see the rule there.
 */
export const TRAVERSAL_DIR_ENV = "STORYTREE_TRAVERSAL_DIR";

/**
 * How long a machine waits between ship ATTEMPTS. Five minutes: long enough that a burst of
 * commands is one process, short enough that a laptop's trace is minutes rather than hours behind
 * the shared store.
 */
export const SHIP_THROTTLE_MS = 5 * 60_000;

/**
 * The detached shipper's own deadline. It has no parent watching it, so a `createPool` that hangs
 * against a stopped instance would otherwise leave an invisible process burning on a shared box.
 *
 * ⚠ IT MUST COMFORTABLY EXCEED A COLD CONNECTOR HANDSHAKE. The keyless Cloud SQL connector's first
 * handshake measures seconds on a warm box and far longer on a cold instance; a watchdog shorter
 * than that would kill every ship before it could start one, and the backlog would grow while the
 * report said only that attempts kept failing.
 */
export const SHIP_WATCHDOG_MS = 3 * 60_000;

/** The line-format version the reader accepts, matching the JSONL sink's own `v`. */
const SCHEMA_VERSION = 1;

/**
 * What has and has not reached the shared store for ONE session.
 *
 * A BYTE OFFSET rather than an event count, and that choice is what keeps the steady-state cost of
 * asking "is there a backlog?" to one `stat` plus one small read — an event count would mean
 * re-parsing the whole trace on every invocation, on the command's own path, which is precisely the
 * cost this design exists to avoid.
 */
export const ShipCursorDoc = z.object({
  v: z.literal(1),
  /** Bytes of the trace file already shipped. Advanced only over lines the store accepted. */
  offset: z.number().int().nonnegative(),
  /** Events successfully shipped, cumulative. */
  shipped: z.number().int().nonnegative(),
  /** Lines skipped as unusable while shipping, cumulative — counted, never silently dropped. */
  unshippable: z.number().int().nonnegative(),
  lastShippedAt: z.string().min(1).optional(),
  lastAttemptAt: z.string().min(1).optional(),
  /** Why the last attempt failed. Present exactly when the last attempt did not land. */
  lastError: z.string().min(1).optional(),
  consecutiveFailures: z.number().int().nonnegative(),
});

export type ShipCursor = z.infer<typeof ShipCursorDoc>;

const EMPTY_CURSOR: ShipCursor = { v: 1, offset: 0, shipped: 0, unshippable: 0, consecutiveFailures: 0 };

/**
 * One line of a trace file as the shipper reads it.
 *
 * The two identity attributes use `.catch()` rather than a strict enum, and that IS the rule
 * `sink.ts` states in prose: an unrecognised grade is read as "this reader cannot vouch for it",
 * never coerced into a grade it might not be — and never allowed to reject the line's EVENT, which
 * is the part that matters. A bad `slot` degrades the same way.
 */
const TraceLineDoc = z.object({
  v: z.literal(SCHEMA_VERSION),
  event: ContextTraversalEvent,
  grade: z.enum(["window", "declared"]).optional().catch(undefined),
  slot: z.string().nullish().catch(null),
  // The session's ORIGIN and its two riders (ADR-0484 D7), degrading the same way: an unrecognised
  // origin ships as UNDECLARED rather than as either value it might have been.
  // Stryker disable next-line StringLiteral: EQUIVALENT — an emptied enum member is not a word any
  // writer produces, so `.catch(undefined)` answers the same "undeclared" for it either way, which
  // the `an-unrecognised-origin` case already asserts against real bytes.
  origin: z.enum(["human", "cut"]).optional().catch(undefined),
  cutBy: z.string().nullish().catch(null),
  cutFor: z.string().nullish().catch(null),
});

type TraceLine = z.infer<typeof TraceLineDoc>;

function tracePath(dir: string, sessionId: string): string {
  return path.join(dir, `${sessionId}${TRAVERSAL_TRACE_EXT}`);
}

function cursorPath(dir: string, sessionId: string): string {
  return path.join(dir, `${sessionId}${SHIP_CURSOR_EXT}`);
}

/**
 * Read a session's cursor, or `null` when it has none — which is the difference between a session
 * this shipper is responsible for and one that is pure pre-landing history (see the D6 note above).
 *
 * TOLERANT on the same rule as the trace reader: a cursor that is unreadable AS A CURSOR — bad
 * JSON, a missing field, a negative offset — degrades to the empty cursor rather than throwing.
 * That is the safe direction: an unreadable cursor re-ships from the file's start, and the store's
 * idempotence absorbs the duplicates. A MISSING file is the other answer entirely and is `null`.
 */
export function readShipCursor(dir: string, sessionId: string): ShipCursor | null {
  let raw: string;
  try {
    // Stryker disable next-line StringLiteral: EQUIVALENT — an unrecognised encoding string is not
    // rejected by the runtime this suite runs on, so `"utf8"` -> `""` reads the same bytes. The
    // literal is kept because it states the intent; nothing observable distinguishes the two.
    raw = fs.readFileSync(cursorPath(dir, sessionId), "utf8");
  } catch {
    return null;
  }

  try {
    const parsed = ShipCursorDoc.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : EMPTY_CURSOR;
  } catch {
    return EMPTY_CURSOR;
  }
}

/** Persist a cursor. Never throws: an unwritable cursor returns false and simply re-ships later. */
export function writeShipCursor(dir: string, sessionId: string, cursor: ShipCursor): boolean {
  try {
    fs.mkdirSync(dir, { recursive: true });
    // Stryker disable next-line StringLiteral: EQUIVALENT — utf8 is `writeFileSync`'s own default,
    // so naming it changes nothing observable; it is stated because the reader is explicit too.
    fs.writeFileSync(cursorPath(dir, sessionId), `${JSON.stringify(cursor)}\n`, "utf8");
    return true;
  } catch {
    return false;
  }
}

/** A trace file's size in bytes, or 0 when there is no file yet (a brand-new session). */
function traceSize(dir: string, sessionId: string): number {
  // Stryker disable BlockStatement: EQUIVALENT — both callers compare this against an offset that
  // is itself 0 for a session with no file, so an emptied handler (which returns `undefined`) and
  // this `0` reach the same answer for every input. The literal makes the return type honest.
  try {
    return fs.statSync(tracePath(dir, sessionId)).size;
  } catch {
    return 0;
  }
  // Stryker restore BlockStatement
}

/**
 * Stamp a session's cursor at the trace file's CURRENT END, once, if it has none — the forward-only
 * baseline ADR-0484 D6 requires.
 *
 * Called from the capture path BEFORE the append, so the events this invocation is about to write
 * are the first that can ever ship. A session that already carries a cursor is untouched, so this
 * is one `readFileSync` of a small file in the steady state.
 *
 * Never throws, on the capture path's own contract (ADR-0241 D3).
 */
export function ensureShipBaseline(dir: string, sessionId: string): void {
  if (readShipCursor(dir, sessionId) !== null) return;
  writeShipCursor(dir, sessionId, { ...EMPTY_CURSOR, offset: traceSize(dir, sessionId) });
}

/** The still-unshipped tail of one session's trace, parsed. */
interface PendingSlice {
  readonly lines: readonly TraceLine[];
  /** Lines in the slice that could not be used — skipped and COUNTED, never thrown on. */
  readonly rejected: number;
  /** Bytes this slice covers: up to and including its last complete line, never a partial one. */
  readonly consumedBytes: number;
  /** The whole file's size, so a caller can report the backlog in bytes. */
  readonly size: number;
}

const EMPTY_SLICE: PendingSlice = { lines: [], rejected: 0, consumedBytes: 0, size: 0 };


/**
 * How far into a trace a cursor may legally point.
 *
 * A trace is append-only and never rotated (ADR-0241 D7), so `offset > size` means something
 * outside this system replaced the file. CLAMP rather than re-ship: the bytes the cursor covered
 * are gone, and shipping whatever now occupies those offsets would be a guess about a file this
 * shipper has never read.
 */
function clampOffset(offset: number, size: number): number {
  return Math.min(offset, size);
}

/**
 * Read and parse the bytes of a session's trace that lie past `offset`.
 *
 * A CRASH-TRUNCATED FINAL LINE IS NEVER CONSUMED. The slice stops at the last `\n`, so a line still
 * being written is left for the next attempt rather than shipped half-parsed — the append-only
 * file's one genuine race, and the reason this works in BYTES rather than in lines.
 *
 * Reads the whole file rather than seeking to the tail, deliberately: a trace is metadata-only JSONL
 * measured in hundreds of bytes per event, this runs OUT OF BAND at most once every few minutes, and
 * the positional-read version of it was ten lines of file-descriptor handling whose failure paths no
 * test could reach. The COMMAND's own path never calls this — it calls {@link hasUnshippedEvents},
 * which is a `stat`.
 */
function readPendingSlice(dir: string, sessionId: string, offset: number): PendingSlice {
  let whole: Buffer;
  try {
    whole = fs.readFileSync(tracePath(dir, sessionId));
  } catch {
    return EMPTY_SLICE;
  }

  const size = whole.length;
  const slice = whole.subarray(clampOffset(offset, size));
  const lastNewline = slice.lastIndexOf(0x0a);
  // Stryker disable next-line ConditionalExpression: EQUIVALENT on the FALSE arm — with no newline
  // `subarray(0, -1 + 1)` is already empty, so falling through yields the same zero-byte slice. The
  // early return states the case; the OFF-BY-ONE it guards against is killed by
  // `a-one-byte-unusable-line-still-advances-the-cursor`.
  if (lastNewline === -1) return { ...EMPTY_SLICE, size };
  const complete = slice.subarray(0, lastNewline + 1);

  const lines: TraceLine[] = [];
  let rejected = 0;
  for (const untrimmed of complete.toString("utf8").split("\n")) {
    // Stryker disable next-line MethodExpression: EQUIVALENT for a JSON line — `JSON.parse` already
    // tolerates trailing whitespace, so a CRLF trace parses with or without this strip. It is kept
    // because it states what a LINE is (the bytes before the terminator) rather than leaving the
    // reader to notice that the parser happens to be forgiving.
    const line = untrimmed.endsWith("\r") ? untrimmed.slice(0, -1) : untrimmed;
    if (line.trim().length === 0) continue;

    let candidate: unknown;
    // Stryker disable BlockStatement: EQUIVALENT — an emptied handler leaves `candidate` `undefined`,
    // which is exactly what this assignment sets it to, and `TraceLineDoc.safeParse` rejects and
    // counts it identically either way. The assignment states the intent at the point it applies.
    try {
      candidate = JSON.parse(line);
    } catch {
      candidate = undefined;
    }
    // Stryker restore BlockStatement
    const parsed = TraceLineDoc.safeParse(candidate);
    if (parsed.success) lines.push(parsed.data);
    else rejected += 1;
  }

  return { lines, rejected, consumedBytes: complete.length, size };
}

/** One run of consecutive lines sharing an identity, and the events it carries. */
interface IdentityRun {
  readonly location: TraversalEventLocation;
  readonly events: ContextTraversalEvent[];
}

/**
 * The WRITABLE draft of the two attributes a line only sometimes carries — the `SinkIdentityDraft`
 * shape `terminal-capture.ts` already uses, for the same reason: `TraversalEventLocation`'s members
 * are `readonly`, and an ABSENT key is what says "this line stated nothing".
 */
interface OptionalLineAttributes {
  grade?: TraceIdentityGrade;
  origin?: SessionOriginKind;
}

/**
 * The location a line's identity attributes name, in the shape the store's append takes.
 *
 * The two OPTIONAL attributes are drafted into their own bag and spread, rather than branched over:
 * with `exactOptionalPropertyTypes` an absent key and an explicit `undefined` are different values,
 * and `grade` alone already needed a ternary — a second optional would have made it four arms, one
 * of which nothing would ever exercise.
 */
function locationOf(sessionId: string, line: TraceLine): TraversalEventLocation {
  const optional: OptionalLineAttributes = {};
  if (line.grade !== undefined) optional.grade = line.grade;
  if (line.origin !== undefined) optional.origin = line.origin;
  return {
    sessionId,
    slot: line.slot ?? null,
    cutBy: line.cutBy ?? null,
    cutFor: line.cutFor ?? null,
    ...optional,
  };
}

/**
 * Group consecutive lines into runs sharing ONE identity, so each run is one append.
 *
 * The store's append takes one location for a batch, exactly as the JSONL sink stamps one identity
 * per append — so a trace whose attributes changed mid-file (a window that moved worktree, or a
 * session that declared its origin partway through) must be shipped as several appends rather than
 * have one line's attributes silently applied to its neighbours. Order is preserved, which is the
 * property `seq` then records.
 *
 * ⚠ EVERY attribute is compared, not just the two that existed first. A comparison that ignored the
 * origin would take the FIRST line's answer and apply it to the whole run — which for the ordinary
 * shape (a session declaring after it had already read something) means shipping declared events as
 * undeclared, silently, in exactly the direction ADR-0484 D7 exists to prevent.
 */
function sameIdentity(a: TraversalEventLocation, b: TraversalEventLocation): boolean {
  return (
    a.grade === b.grade &&
    a.slot === b.slot &&
    a.origin === b.origin &&
    a.cutBy === b.cutBy &&
    a.cutFor === b.cutFor
  );
}

function groupByIdentity(lines: readonly TraceLine[], sessionId: string): IdentityRun[] {
  const runs: IdentityRun[] = [];
  for (const line of lines) {
    const location = locationOf(sessionId, line);
    const last = runs[runs.length - 1];
    if (last !== undefined && sameIdentity(last.location, location)) {
      last.events.push(line.event);
    } else {
      runs.push({ location, events: [line.event] });
    }
  }
  return runs;
}

/** What one session's ship attempt did. */
export interface ShipSessionOutcome {
  readonly sessionId: string;
  /** True when every pending line reached the store (or there was nothing to ship). */
  readonly ok: boolean;
  readonly shipped: number;
  /** Lines the store could never accept — skipped and counted, and the cursor moves past them. */
  readonly unshippable: number;
  /** Present exactly when `ok` is false. */
  readonly error?: string;
}

export interface ShipDeps {
  readonly dir: string;
  readonly store: TraversalEventStore;
  /** Injected clock, so the cursor's timestamps are deterministic under test. */
  readonly now?: () => Date;
}

/** The outcome of a session the shipper had nothing to do for. */
function nothingToShip(sessionId: string): ShipSessionOutcome {
  return { sessionId, ok: true, shipped: 0, unshippable: 0 };
}

/**
 * Offer every run to the store, stopping at the first that does not land; the message is the reason
 * the cursor stays where it is, or `undefined` when the whole slice landed.
 *
 * STOPS rather than pressing on, because the cursor is a single offset: a later run that landed
 * while an earlier one did not could not be recorded as shipped without also recording the earlier
 * one, and the re-send is free (the store is idempotent on `event_id`).
 */
async function sendRuns(runs: readonly IdentityRun[], store: TraversalEventStore): Promise<string | undefined> {
  try {
    for (const run of runs) {
      if (!(await store.append(run.events, run.location))) return "the store refused the batch";
    }
    return undefined;
  } catch (cause: unknown) {
    return cause instanceof Error ? cause.message : String(cause);
  }
}

/**
 * Ship one session's unshipped tail.
 *
 * A session with NO cursor is skipped — it is pre-landing history and shipping it would be the
 * backfill ADR-0484 D6 refuses.
 *
 * On success the cursor advances over the whole slice, INCLUDING lines the reader could not use:
 * an unusable line is counted as `unshippable` and stepped past, because leaving it in place would
 * wedge the queue behind one corrupt byte forever. On failure the cursor does not move at all, so
 * the same bytes are retried, and the failure is recorded on the cursor where the backlog report
 * can read it.
 */
export async function shipTraversalSession(sessionId: string, deps: ShipDeps): Promise<ShipSessionOutcome> {
  const cursor = readShipCursor(deps.dir, sessionId);
  if (cursor === null) return nothingToShip(sessionId);

  const pending = readPendingSlice(deps.dir, sessionId, cursor.offset);
  if (pending.consumedBytes === 0) return nothingToShip(sessionId);

  const at = (deps.now ?? (() => new Date()))().toISOString();
  const error = await sendRuns(groupByIdentity(pending.lines, sessionId), deps.store);

  if (error !== undefined) {
    writeShipCursor(deps.dir, sessionId, {
      ...cursor,
      lastAttemptAt: at,
      lastError: error,
      consecutiveFailures: cursor.consecutiveFailures + 1,
    });
    return { sessionId, ok: false, shipped: 0, unshippable: 0, error };
  }

  writeShipCursor(deps.dir, sessionId, {
    v: 1,
    offset: clampOffset(cursor.offset, pending.size) + pending.consumedBytes,
    shipped: cursor.shipped + pending.lines.length,
    unshippable: cursor.unshippable + pending.rejected,
    lastShippedAt: at,
    lastAttemptAt: at,
    consecutiveFailures: 0,
  });
  return { sessionId, ok: true, shipped: pending.lines.length, unshippable: pending.rejected };
}

/**
 * Every session this shipper is responsible for — i.e. every session carrying a cursor.
 *
 * Enumerating CURSORS rather than traces is what keeps the sweep proportional to sessions active
 * since the landing rather than to the whole local history, and it is the same rule that keeps the
 * shipper from backfilling: a trace with no cursor is not in this set at all.
 */
export function shippableSessions(dir: string): string[] {
  let entries: string[];
  try {
    entries = fs.readdirSync(dir);
  } catch {
    return [];
  }
  return entries
    .filter((entry) => entry.endsWith(SHIP_CURSOR_EXT))
    .map((entry) => entry.slice(0, -SHIP_CURSOR_EXT.length));
}

/** One session's unshipped position, as the backlog report states it. */
export interface TraversalBacklogSession {
  readonly sessionId: string;
  readonly unshippedEvents: number;
  readonly unshippedBytes: number;
  /** The `at` of the oldest event still waiting — the "since when" half of the report. */
  readonly oldestUnshippedAt: string | undefined;
  readonly shipped: number;
  readonly unshippable: number;
  readonly lastShippedAt: string | undefined;
  readonly lastAttemptAt: string | undefined;
  readonly lastError: string | undefined;
  readonly consecutiveFailures: number;
}

export interface TraversalBacklog {
  /** Sessions with something still unshipped, oldest-waiting first. */
  readonly waiting: readonly TraversalBacklogSession[];
  /** Every session carrying a cursor, including the fully-shipped ones. */
  readonly tracked: number;
  readonly totalUnshippedEvents: number;
  readonly oldestUnshippedAt: string | undefined;
  /** Sessions whose LAST attempt failed — the "we have no data" case, named rather than implied. */
  readonly failing: readonly TraversalBacklogSession[];
}

/**
 * Oldest-waiting FIRST, and a row whose pending bytes hold no readable event sorts LAST.
 *
 * Such a row is genuinely waiting — there are bytes the store has not seen — but it has no AGE, and
 * a reader scans this list from the top. Sorting it first would push the oldest real backlog down
 * the page behind a row that cannot be dated at all. Compared with `<` rather than
 * `localeCompare`, because the values are ISO-8601 timestamps whose byte order IS their time order
 * and a locale-aware collation is one more thing that could disagree with that.
 */
// Stryker disable ConditionalExpression,EqualityOperator: EQUIVALENT FOR WHAT THIS ORDER PROMISES,
// which is "oldest first, undateable last" and nothing more. Two rows this report cannot date have
// no relative order it claims, and two rows carrying the SAME instant are not ordered by the key
// either — so the tie arms below are unobservable through any honest assertion. The promise itself
// IS asserted, by `the-backlog-is-ordered-oldest-first-and-an-undateable-row-never-jumps-the-queue`.
function byOldestUnshipped(a: TraversalBacklogSession, b: TraversalBacklogSession): number {
  const left = a.oldestUnshippedAt;
  const right = b.oldestUnshippedAt;
  if (left === undefined) return right === undefined ? 0 : 1;
  if (right === undefined) return -1;
  return left < right ? -1 : 1;
}
// Stryker restore ConditionalExpression,EqualityOperator

/** One session's row in the backlog report. */
function backlogRow(dir: string, sessionId: string, cursor: ShipCursor): TraversalBacklogSession {
  const pending = readPendingSlice(dir, sessionId, cursor.offset);
  return {
    sessionId,
    unshippedEvents: pending.lines.length,
    unshippedBytes: pending.size - clampOffset(cursor.offset, pending.size),
    oldestUnshippedAt: pending.lines[0]?.event.at,
    shipped: cursor.shipped,
    unshippable: cursor.unshippable,
    lastShippedAt: cursor.lastShippedAt,
    lastAttemptAt: cursor.lastAttemptAt,
    lastError: cursor.lastError,
    consecutiveFailures: cursor.consecutiveFailures,
  };
}

/**
 * How many events are unshipped, and since when (ADR-0484 D4's reportable backlog).
 *
 * Deliberately NOT derived from the cursor alone: the cursor knows how far it got, not what is
 * waiting. Answering "since when" means parsing the pending tail, which is why this is a REPORT
 * rather than something the capture path computes — it costs a read of each tracked session's trace
 * and is never on a command's own path.
 */
export function traversalShipBacklog(dir: string): TraversalBacklog {
  const rows: TraversalBacklogSession[] = [];
  for (const sessionId of shippableSessions(dir)) {
    const cursor = readShipCursor(dir, sessionId);
    // Stryker disable next-line ConditionalExpression: EQUIVALENT — every id here came from a cursor
    // FILE that `shippableSessions` just listed, and an unreadable cursor degrades to the empty
    // cursor rather than to null, so this is null only if the file vanished between the two calls.
    // The guard satisfies the type; it is not a runtime branch a test can reach.
    if (cursor !== null) rows.push(backlogRow(dir, sessionId, cursor));
  }

  const waiting = rows.filter((row) => row.unshippedBytes > 0).sort(byOldestUnshipped);
  return {
    waiting,
    tracked: rows.length,
    totalUnshippedEvents: rows.reduce((total, row) => total + row.unshippedEvents, 0),
    oldestUnshippedAt: waiting[0]?.oldestUnshippedAt,
    failing: rows.filter((row) => row.consecutiveFailures > 0),
  };
}

/** What a whole-machine sweep did. */
export interface ShipReport {
  /** Only the sessions that MOVED — shipped, skipped a line, or failed. */
  readonly sessions: readonly ShipSessionOutcome[];
  readonly shipped: number;
  readonly unshippable: number;
  readonly failed: number;
}

/** Did this outcome do anything worth reporting, or was the session simply up to date? */
function moved(outcome: ShipSessionOutcome): boolean {
  return !outcome.ok || outcome.shipped > 0 || outcome.unshippable > 0;
}

/** Ship every session carrying a cursor. One failing session never stops the others. */
export async function shipTraversalBacklog(deps: ShipDeps): Promise<ShipReport> {
  const outcomes: ShipSessionOutcome[] = [];
  for (const sessionId of shippableSessions(deps.dir)) {
    outcomes.push(await shipTraversalSession(sessionId, deps));
  }
  const sessions = outcomes.filter(moved);
  return {
    sessions,
    shipped: sessions.reduce((total, outcome) => total + outcome.shipped, 0),
    unshippable: sessions.reduce((total, outcome) => total + outcome.unshippable, 0),
    failed: sessions.filter((outcome) => !outcome.ok).length,
  };
}

// ---------------------------------------------------------------------------
// The trigger's two cheap questions
// ---------------------------------------------------------------------------

/**
 * Does THIS session have bytes the store has not seen? One small read and one `stat`.
 *
 * Asked on the command's own path, after the local append, to decide whether an out-of-band ship is
 * worth starting at all — so it must stay cheap enough to run on every invocation, and it must
 * never look at any session but this one (the local history is hundreds of files).
 */
export function hasUnshippedEvents(dir: string, sessionId: string): boolean {
  const cursor = readShipCursor(dir, sessionId);
  if (cursor === null) return false;
  return traceSize(dir, sessionId) > cursor.offset;
}

/**
 * Has enough time passed since the last ship ATTEMPT on this machine?
 *
 * The throttle is per-MACHINE and keyed on the attempt rather than on success, so a database that
 * is down costs one bounded attempt per window instead of one per `storytree` invocation — the
 * retry stays alive without a burst of commands becoming a burst of processes.
 */
export function shouldAttemptShip(dir: string, now: Date, throttleMs: number): boolean {
  let raw: string;
  // Stryker disable StringLiteral,BlockStatement: EQUIVALENT — the encoding literal as above; and an
  // emptied handler leaves `raw` undefined, which `Date.parse` answers `NaN` for, which the guard
  // below turns into this same `true`. Two routes to one answer; this one states the reason.
  try {
    raw = fs.readFileSync(path.join(dir, SHIP_ATTEMPT_MARKER), "utf8");
  } catch {
    return true;
  }
  // Stryker restore StringLiteral,BlockStatement
  const last = Date.parse(raw);
  // An unreadable marker is treated as NO marker — the safe direction is attempting, because the
  // cost of an extra attempt is one bounded process and the cost of never attempting is silence.
  if (Number.isNaN(last)) return true;
  return now.getTime() - last >= throttleMs;
}

/** Is THIS process the detached shipper? It must neither register as session work nor re-spawn. */
export function isShipChildProcess(env: Readonly<Record<string, string | undefined>>): boolean {
  return env[SHIP_CHILD_ENV] === "1";
}

/** Everything {@link shouldStartShip} reads. Injected, so the decision is pure and testable. */
export interface ShipTriggerInput {
  /** This invocation's trace session, or null when no identity resolved. */
  readonly sessionId: string | null;
  /** The invocation's environment. Read here, never ambiently. */
  readonly env: Readonly<Record<string, string | undefined>>;
  /** The resolved trace directory. */
  readonly dir: string;
  readonly now: Date;
  /** Whether capture is on at all for this invocation (`STORYTREE_TRAVERSAL=off` opts out). */
  readonly captureEnabled: boolean;
}

/**
 * Should this invocation start the out-of-band shipper?
 *
 * PURE, and separated from the spawn on purpose: the spawn is one line that cannot be exercised
 * without starting a real process against a real database, while the DECISION is five rules that
 * each fail in a different direction. Keeping them apart is what lets the rules be proven.
 *
 * The rules, in the order that makes the common case cheapest:
 *   1. an identity resolved — an unidentified run captures nothing, so it has nothing to ship;
 *   2. this process is not itself the shipper — otherwise every ship starts another;
 *   3. capture is on at all;
 *   4. ⚠ the trace directory is this MACHINE's own, not an override. `STORYTREE_TRAVERSAL_DIR` means
 *      a caller has taken the trace somewhere of its own — a fixture, a scratch run, another
 *      machine's directory mounted for inspection — and the shared log is keyed by SESSION, so
 *      draining someone else's directory into it would file their events under this machine's ship
 *      path with nothing saying so. The explicit `storytree traversal ship` still drains an
 *      overridden directory when a person asks; what is refused is doing it AMBIENTLY. That every
 *      test is hermetic by construction follows from the rule rather than motivating it;
 *   5. this session has bytes the store has not seen, and the machine has not attempted a ship
 *      inside the throttle window — the two reads that keep the common case to a `stat` and a small
 *      file, never a sweep of a directory holding hundreds of sessions' traces.
 */
export function shouldStartShip(input: ShipTriggerInput): boolean {
  // Stryker disable next-line ConditionalExpression: EQUIVALENT — a null session is ALSO refused two
  // rules down, because `hasUnshippedEvents` looks for a cursor named after it and finds none. This
  // states the rule at the top where a reader expects it rather than leaving it to a coincidence.
  if (input.sessionId === null) return false;
  if (isShipChildProcess(input.env)) return false;
  if (!input.captureEnabled) return false;
  if (input.env[TRAVERSAL_DIR_ENV] !== undefined) return false;
  if (!hasUnshippedEvents(input.dir, input.sessionId)) return false;
  return shouldAttemptShip(input.dir, input.now, SHIP_THROTTLE_MS);
}

/** Record a ship attempt. Written BEFORE the attempt starts, so a hang cannot unthrottle it. */
export function markShipAttempt(dir: string, now: Date): void {
  try {
    fs.mkdirSync(dir, { recursive: true });
    // Stryker disable next-line StringLiteral: EQUIVALENT — utf8 is the default, as above.
    fs.writeFileSync(path.join(dir, SHIP_ATTEMPT_MARKER), now.toISOString(), "utf8");
  } catch {
    // Best-effort: an unwritable marker only means the next invocation may attempt again.
  }
}
