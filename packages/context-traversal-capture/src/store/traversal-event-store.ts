/**
 * The SHARED context-traversal event log — story `context-traversal-capture`, capability
 * `traversal-trace-sink` (ADR-0484 D1).
 *
 * `sink.ts` said in its own header why it was shaped the way it was: *"a narrow append/read/list
 * seam over one JSONL file per session, so a Postgres-backed implementation can replace it later
 * without touching a caller (ADR-0241 D8)."* This module is that implementation, and it is
 * deliberately the SAME three verbs — append, read, list — behind {@link TraversalEventStore}. No
 * caller of the capture path changed to make it exist.
 *
 * WHAT IT IS NOT. It is not the write path of a `storytree` command. The capture path still writes
 * the local JSONL line synchronously and returns; `ship.ts` drains that file into this store out of
 * band (ADR-0484 D4). A command never waits on this store and never fails because of it, and a bare
 * read must not open a pool it did not already need — which is why nothing here builds one: the
 * caller injects a {@link TraversalPool}, exactly as the caller has always injected the session
 * identity (ADR-0241 D9).
 *
 * THE CONTRACT IS THE JSONL SINK'S CONTRACT, INCLUDING ITS TOLERANCE. A row whose `event` no longer
 * parses through the vocabulary is SKIPPED AND COUNTED, never thrown on (ADR-0241 D5); a duplicate
 * identity is skipped the same way; a session with no rows replays as empty rather than throwing.
 * The parity suite in `traversal-event-store.test.ts` runs BOTH backends through one set of
 * assertions, so "the same contract" is a test rather than a claim in this comment.
 *
 * The pool is DUCK-TYPED (the `PgClaimStore` precedent), so this file imports no `pg` types and the
 * offline suite drives a real in-memory table rather than a canned-row fake.
 */
import { createContextTraversalTrace, ContextTraversalEvent } from "@storytree/context-traversal-telemetry";
import { z } from "zod";

import { classifyTraceIdentity } from "../session-identity.js";
import type { TraceIdentityGrade } from "../session-identity.js";
import { foldSessionOrigin } from "../session-origin.js";
import type { SessionOriginClaim, SessionOriginKind } from "../session-origin.js";
import type { TraversalReadResult, TraversalSessionSummary } from "../sink.js";

/** The narrow query seam a `pg` `Pool` already satisfies structurally. */
export interface TraversalPool {
  query(text: string, values?: unknown[]): Promise<{ rows: unknown[] }>;
}

/**
 * Where one append lands: the session, plus the line-identity attributes the JSONL sink stamps.
 *
 * Structurally the JSONL sink's `TraversalSinkLocation` minus its `dir` — the destination is the
 * store instance here, which is exactly the difference a backend swap is allowed to make.
 */
export interface TraversalEventLocation {
  readonly sessionId: string;
  readonly grade?: TraceIdentityGrade;
  readonly slot?: string | null;
  /** How the session came to exist (ADR-0484 D7). Absent = undeclared, which is never `human`. */
  readonly origin?: SessionOriginKind;
  readonly cutBy?: string | null;
  readonly cutFor?: string | null;
}

/**
 * The append/read/list seam ADR-0241 D8 named, made explicit so two backends can be held to one
 * contract.
 *
 * ASYNC even though the JSONL backend is synchronous, and that asymmetry is deliberate rather than
 * sloppy: the capture path calls `appendTraversalEvents` DIRECTLY and stays synchronous, because a
 * promise on that path is exactly the wait ADR-0484 D4 forbids. This interface exists for the
 * SHIPPER and the parity suite, which are both already off the command's path.
 */
export interface TraversalEventStore {
  /** Append events. Returns false when the whole batch failed to land; never throws. */
  append(events: readonly unknown[], location: TraversalEventLocation): Promise<boolean>;
  /** Replay one session, honestly partial: a row that cannot be used is skipped and counted. */
  read(sessionId: string): Promise<TraversalReadResult>;
  /** Every session this store holds, with its event count and last-observed time. */
  list(): Promise<TraversalSessionSummary[]>;
}

/**
 * One `events.traversal_event` row as the driver hands it back.
 *
 * A ZOD SCHEMA rather than a hand-rolled type guard, on the same rule `sink.ts` follows for the
 * event itself (ADR-0241 D4) — and the two identity attributes use `.catch()` because their rule is
 * "unrecognised means unstated": an unknown `grade` is read as a legacy line rather than coerced
 * into a grade it might not be, and neither attribute may reject the row's EVENT, which is the part
 * that matters.
 */
const TraversalRowDoc = z.object({
  event: ContextTraversalEvent,
  grade: z.enum(["window", "declared"]).nullish().catch(null),
  slot: z.string().nullish().catch(null),
  // Same `.catch()` rule, and here it carries one more clause: an unrecognised origin word must
  // become UNDECLARED rather than either of the two it might have been, because the reassuring
  // coercion is the one this attribute exists to prevent (ADR-0484 D7).
  origin: z.enum(["human", "cut"]).nullish().catch(null),
  cutBy: z.string().nullish().catch(null),
  cutFor: z.string().nullish().catch(null),
});

/** The `session_id` projection the list query returns. */
const SessionIdRowDoc = z.object({ session_id: z.string().min(1) });

/**
 * Fold rows — in APPEND order, which is what `seq` carries — into the same
 * `{ replay, skipped, identity, slots }` a JSONL read returns.
 *
 * Shared by {@link PgTraversalEventStore.read} and its `list` so the two can never disagree about
 * what a session's events are, the way `summarizeTraversalSession` exists on the JSONL side.
 */
function foldRows(sessionId: string, rows: readonly unknown[]): TraversalReadResult {
  const trace = createContextTraversalTrace();
  const seenEventIds = new Set<string>();
  const seenVisitIds = new Set<string>();
  const grades: (TraceIdentityGrade | undefined)[] = [];
  const slots: string[] = [];
  // Stryker disable next-line ArrayDeclaration: EQUIVALENT — a seeded junk element answers
  // `undefined` for every field the fold reads, so it changes neither the reading nor either rider
  // list. The same call, and the same reason, as the JSONL reader's.
  const claims: SessionOriginClaim[] = [];
  let skipped = 0;

  for (const candidate of rows) {
    const parsed = TraversalRowDoc.safeParse(candidate);
    if (!parsed.success) {
      skipped += 1;
      continue;
    }
    const { event, grade, slot, origin, cutBy, cutFor } = parsed.data;
    if (seenEventIds.has(event.eventId)) {
      skipped += 1;
      continue;
    }
    // THE VISIT IDENTITY IS A SECOND, INDEPENDENT TRAP, and the guard around it is load-bearing
    // rather than defensive: only a VISIT event carries one, and a search does not. Treating an
    // absent id as an id would make the SECOND search in a session look like a repeat of the first.
    const visitId = "visitId" in event ? event.visitId : undefined;
    if (visitId !== undefined) {
      if (seenVisitIds.has(visitId)) {
        skipped += 1;
        continue;
      }
      seenVisitIds.add(visitId);
    }
    seenEventIds.add(event.eventId);
    grades.push(grade ?? undefined);
    claims.push({ origin: origin ?? undefined, cutBy, cutFor });
    // A slot is a WORKTREE NAME or it is nothing. `null` (the column's own absence) and `""` (a
    // caller that had nothing to say) both name no worktree and must not become an entry a reader
    // could quote back as one.
    if (typeof slot === "string" && slot.length > 0 && !slots.includes(slot)) slots.push(slot);
    trace.append(event);
  }

  return {
    replay: trace.replay(sessionId),
    skipped,
    identity: classifyTraceIdentity(grades),
    slots,
    origin: foldSessionOrigin(claims),
  };
}

/**
 * ⚠ THE SQL IS THE ONE PART THE OFFLINE DOUBLE CANNOT VOUCH FOR, and `ON CONFLICT (event_id) DO
 * NOTHING` is the clause that carries the most weight — it is what makes a retry safe. The double
 * implements that semantic INDEPENDENTLY (which is what lets it answer parity questions honestly),
 * and the consequence is that it cannot notice this text changing. Proved instead END TO END through
 * the CLI against the live store, recorded on the increment.
 */
// Stryker disable StringLiteral: EQUIVALENT against the in-memory double by construction — it
// routes on the INSERT verb and implements the conflict rule itself, so every other clause here is
// unobservable. The live proof is the witness, and it is named above rather than implied.
const INSERT_EVENT_SQL = [
  "INSERT INTO events.traversal_event",
  "  (event_id, session_id, observed_at, grade, slot, origin, cut_by, cut_for, event)",
  "VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)",
  "ON CONFLICT (event_id) DO NOTHING",
].join("\n");
// Stryker restore StringLiteral

// The three origin columns are ALIASED back to the camelCase the JSONL line uses, so one row schema
// (`TraversalRowDoc`) and one fold serve both backends — the alternative was a second shape whose
// only difference was spelling, which is exactly the hand-mirroring `foldSessionOrigin` exists to
// prevent.
//
// Stryker disable next-line StringLiteral: EQUIVALENT against the in-memory double by construction —
// it routes on the `WHERE session_id = $1` fragment and answers with the aliased keys itself, so no
// other token here is observable offline. The live proof is the witness: the columns were read back
// through this statement against the real store and recorded on the increment, exactly as
// `INSERT_EVENT_SQL` above is.
// Stryker disable StringLiteral
const SELECT_SESSION_SQL = [
  'SELECT event, grade, slot, origin, cut_by AS "cutBy", cut_for AS "cutFor"',
  "FROM events.traversal_event WHERE session_id = $1 ORDER BY seq ASC",
].join("\n");
// Stryker restore StringLiteral

const SELECT_SESSION_IDS_SQL =
  "SELECT session_id FROM events.traversal_event GROUP BY session_id ORDER BY MAX(seq) ASC";

/** The `events.traversal_event` implementation of {@link TraversalEventStore} (ADR-0484 D1). */
export class PgTraversalEventStore implements TraversalEventStore {
  readonly #pool: TraversalPool;

  constructor(pool: TraversalPool) {
    this.#pool = pool;
  }

  /**
   * Append a batch. Every event is parsed through the vocabulary BEFORE it reaches the store, so
   * ADR-0241 D4's "invalid events never reach the bytes" holds over rows exactly as it holds over
   * lines; an event that fails validation is dropped from the batch and its siblings still land.
   *
   * IDEMPOTENT ON `event_id`, which is what makes a RETRY safe: a ship that failed after the
   * database had already committed part of the batch re-sends those rows on the next attempt, and
   * `ON CONFLICT DO NOTHING` absorbs them rather than duplicating a session's history.
   *
   * Returns false rather than throwing when the write fails — the same fail-silent shape
   * `appendTraversalEvents` has, so a caller's control flow never changes because of telemetry
   * (ADR-0241 D3). The SHIPPER reads that false and leaves its cursor unadvanced, which is what
   * turns the failure into a REPORTABLE backlog rather than a swallowed one (ADR-0484 D4).
   */
  async append(events: readonly unknown[], location: TraversalEventLocation): Promise<boolean> {
    const valid: ContextTraversalEvent[] = [];
    for (const candidate of events) {
      const parsed = ContextTraversalEvent.safeParse(candidate);
      if (parsed.success) valid.push(parsed.data);
    }
    // Stryker disable next-line ConditionalExpression: EQUIVALENT — with an empty batch the loop
    // below runs zero times and returns true anyway. The guard is here so an empty append issues no
    // statement at all, which `an-empty-append-touches-the-pool-not-at-all` asserts on the CALLS
    // rather than on the return value; removing it changes neither.
    if (valid.length === 0) return true;

    try {
      for (const event of valid) {
        await this.#pool.query(INSERT_EVENT_SQL, [
          event.eventId,
          location.sessionId,
          event.at,
          location.grade ?? null,
          location.slot ?? null,
          location.origin ?? null,
          location.cutBy ?? null,
          location.cutFor ?? null,
          JSON.stringify(event),
        ]);
      }
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Replay one session in APPEND order (`seq`), honestly partial.
   *
   * `seq` and never `observed_at`: append order is the only "earlier" this producer is allowed to
   * know (ADR-0235), and it is the order the JSONL reader returns — ordering by the event's own
   * timestamp here would make the two backends disagree about a trace whose clock went backwards.
   *
   * A read that fails returns an EMPTY replay rather than throwing, on the same rule as the JSONL
   * reader's missing file: a query surface must not turn a storage failure into a crash.
   */
  async read(sessionId: string): Promise<TraversalReadResult> {
    try {
      const { rows } = await this.#pool.query(SELECT_SESSION_SQL, [sessionId]);
      return foldRows(sessionId, rows);
    } catch {
      return foldRows(sessionId, []);
    }
  }

  /**
   * Every session in the store. A session that replays to zero usable events is omitted rather than
   * reported with a fabricated timestamp — `listTraversalSessions`' rule, over rows.
   */
  async list(): Promise<TraversalSessionSummary[]> {
    let sessionIds: string[];
    try {
      const { rows } = await this.#pool.query(SELECT_SESSION_IDS_SQL);
      sessionIds = rows.flatMap((row) => {
        const parsed = SessionIdRowDoc.safeParse(row);
        return parsed.success ? [parsed.data.session_id] : [];
      });
    } catch {
      return [];
    }

    const summaries: TraversalSessionSummary[] = [];
    for (const sessionId of sessionIds) {
      const { replay, identity, slots, origin } = await this.read(sessionId);
      if (replay.events.length === 0) continue;
      const lastEvent = replay.events[replay.events.length - 1];
      summaries.push({
        sessionId,
        eventCount: replay.events.length,
        origin,
        // Stryker disable next-line OptionalChaining: EQUIVALENT — the zero-event case is skipped
        // above, so this index is valid and `lastEvent` is never undefined. The `?.` satisfies
        // `noUncheckedIndexedAccess`; it is not a runtime guard.
        lastObservedAt: lastEvent?.at,
        identity,
        slots,
      });
    }
    return summaries;
  }
}
