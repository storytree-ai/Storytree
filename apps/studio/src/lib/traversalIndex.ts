// The traversal tab's SESSION LIST (`traversal-panel-arc`, increment `traversal-panel-trace-index-list`).
//
// This module is the CLAIM-JOIN'S SUCCESSOR, and the withdrawal is the whole decision (ADR-0354 D2).
// `lib/traversalPicker.ts` joined "who claimed this story" against "what can be replayed here", and
// staging it falsified the join: 339 local traces on this machine, exactly ONE reachable, and only
// because the staging session took an `exploring` claim to manufacture a row. A claim is a LIVE
// signal and a replay is RETROSPECTIVE, so gating one on the other means an operator may only watch
// the sessions they happen to catch mid-flight. The list is now this machine's whole trace index.
//
// WHAT THE JOIN GOT RIGHT SURVIVES, and it is the entire risk of the withdrawal — dropping the join
// must not drop the honesty that lived beside it:
//
//   - PENDING, FAILED and EMPTY stay three distinct states. An index still in flight and a route
//     that refused are the ABSENCE of an observation; an index that answered `{sessions: []}` is a
//     real observation of a machine that has captured nothing. Collapsing any pair of these sends an
//     operator to the wrong place to look — their trace dir, the studio server, or simply waiting.
//   - A row is OFFERED AND EXPLAINED rather than dropped. An entry the index lists but which carries
//     no usable timestamp is still shown, saying so, instead of being filtered into invisibility.
//   - `dir` travels with the answer, because "no traces" and "no traces under the directory I was
//     pointed at" are different facts and only the second is checkable (`STORYTREE_TRAVERSAL_DIR`).
//   - The hosted studio captures no operator traces, so an honest EMPTY list is a correct answer
//     there and never an error.
//
// Pure: an index read in, a list out. No fetch, no clock, no React (the component owns all three).

import type { TraversalSessionEntry, TraversalSessionsPayload } from '../types';

/**
 * How the trace index answered. Carried verbatim from the picker it replaces — `pending` and
 * `failed` are deliberately separate from an EMPTY index, for the reason stated in the header.
 */
export type TraversalIndexState =
  | { readonly status: 'pending' }
  | { readonly status: 'failed'; readonly message: string }
  | { readonly status: 'read'; readonly payload: TraversalSessionsPayload };

/** One offered trace. `lastObservedAt` stays nullable — a trace whose events carried no usable
 *  timestamp is listed saying so, never stamped with a fabricated "now" to make it sortable. */
export interface TraversalTraceRow {
  readonly sessionId: string;
  readonly eventCount: number;
  readonly lastObservedAt: string | null;
}

/** The list the rail renders, and the four states it may honestly be in. */
export type TraversalTraceList =
  | { readonly state: 'pending'; readonly note: string }
  | { readonly state: 'failed'; readonly note: string }
  | { readonly state: 'empty'; readonly note: string; readonly dir: string }
  | {
      readonly state: 'listed';
      readonly rows: readonly TraversalTraceRow[];
      readonly dir: string;
      /** "346 local traces" — the count, said once, at the head of the rail. */
      readonly heading: string;
    };

/**
 * Build the rail's list from one index read.
 *
 * Ordering is NEWEST OBSERVED FIRST (ADR-0354 D2) and must be STABLE under re-read: a trace grows
 * only by capture, so a list that reshuffled between two reads of the same directory would be
 * lying about which session is most recent. Rows carrying no usable timestamp sort LAST as a
 * group — they cannot be placed on the axis the ordering is about — and every tie, including that
 * whole group, breaks on session id so the order is total rather than merely mostly-decided.
 */
export function buildTraversalTraceList(index: TraversalIndexState): TraversalTraceList {
  if (index.status === 'pending') {
    return { state: 'pending', note: 'reading this machine’s traces…' };
  }
  if (index.status === 'failed') {
    // Never "no traces": the studio server did not answer, and blaming the trace dir for the
    // server's silence sends an operator looking in a directory that may be perfectly healthy.
    return {
      state: 'failed',
      note: `could not read the local trace index — ${index.message}. This says nothing about whether traces exist.`,
    };
  }

  const { dir, sessions } = index.payload;
  if (sessions.length === 0) {
    return {
      state: 'empty',
      dir,
      note:
        `no traces under ${dir}. Traces are per-machine local JSONL, so a machine that has captured ` +
        `none — the hosted studio captures none at all — honestly has nothing to replay.`,
    };
  }

  const rows = [...sessions].sort(byNewestObservedFirst).map(toRow);
  return {
    state: 'listed',
    rows,
    dir,
    heading: `${rows.length} local trace${rows.length === 1 ? '' : 's'}`,
  };
}

function toRow(entry: TraversalSessionEntry): TraversalTraceRow {
  return {
    sessionId: entry.sessionId,
    eventCount: entry.eventCount,
    lastObservedAt: entry.lastObservedAt,
  };
}

function byNewestObservedFirst(a: TraversalSessionEntry, b: TraversalSessionEntry): number {
  const timeA = observedTime(a.lastObservedAt);
  const timeB = observedTime(b.lastObservedAt);
  if (timeA !== timeB) return timeB - timeA; // newest first
  return a.sessionId.localeCompare(b.sessionId);
}

/**
 * `null`, and an unparseable string, both sort to the BOTTOM rather than to the epoch — a trace
 * whose timestamp could not be read is not a trace from 1970, and placing it there would present a
 * failed read as an ancient session.
 */
function observedTime(at: string | null): number {
  if (at === null) return Number.NEGATIVE_INFINITY;
  const parsed = new Date(at).getTime();
  return Number.isNaN(parsed) ? Number.NEGATIVE_INFINITY : parsed;
}

/**
 * "5m earlier" — each row's age RELATIVE TO THE NEWEST TRACE IN THE LIST, not to the wall clock.
 *
 * Relative to the newest is what makes the rail readable on a machine whose traces are all months
 * old: every row would otherwise read "3 months ago" and the ordering the list is built on would be
 * invisible. A row with no usable timestamp says so instead of borrowing the neighbour's.
 */
export function traceAgeLabel(row: TraversalTraceRow, newest: TraversalTraceRow | undefined): string {
  if (row.lastObservedAt === null) return 'no timestamp recorded';
  const self = observedTime(row.lastObservedAt);
  if (self === Number.NEGATIVE_INFINITY) return 'no timestamp recorded';
  const top = newest ? observedTime(newest.lastObservedAt) : Number.NEGATIVE_INFINITY;
  if (top === Number.NEGATIVE_INFINITY) return 'observed';
  const deltaMs = Math.max(0, top - self);
  return deltaMs === 0 ? 'newest' : `${humaniseSpan(deltaMs)} earlier`;
}

/** Compact spans: 45s / 9m / 3h20m / 12d. Never a fractional unit — the rail is 196px wide. */
function humaniseSpan(ms: number): string {
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    const rest = minutes % 60;
    return rest === 0 ? `${hours}h` : `${hours}h${String(rest).padStart(2, '0')}m`;
  }
  return `${Math.floor(hours / 24)}d`;
}
