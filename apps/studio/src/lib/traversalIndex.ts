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

import { describeClaimRuntime, type ClaimHarnessT, type ClaimRuntime } from '@storytree/notice-board';
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
  /** The units this session recorded for itself, in first-seen order (ADR-0541 D1). */
  readonly units: readonly string[];
  /** The arcs those units resolve to. Several are LISTED, never reduced to one. */
  readonly arcs: readonly string[];
  /** Which agent harness(es) wrote the trace (ADR-0579). EMPTY is "not recorded" — see {@link traceRuntimeLabel}. */
  readonly harnesses: readonly ClaimHarnessT[];
  /** Which MACHINE(S) wrote it, by hostname — never the harness. Empty on the same rule. */
  readonly hosts: readonly string[];
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
      /**
       * Whether the corpus answered, carried through from the payload (ADR-0541 D1). False means
       * every row's arc is UNKNOWN rather than absent — see {@link traceArcLabel}.
       */
      readonly arcsResolved: boolean;
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
    // `?? false` rather than `?? true`: a payload from a server that predates the field says
    // nothing about the corpus, and the safe direction for an unknown is the one that REFUSES to
    // print "worked on no arc" — a positive claim — over rows nothing resolved.
    arcsResolved: index.payload.arcsResolved ?? false,
  };
}

function toRow(entry: TraversalSessionEntry): TraversalTraceRow {
  return {
    sessionId: entry.sessionId,
    eventCount: entry.eventCount,
    lastObservedAt: entry.lastObservedAt,
    units: entry.units ?? [],
    arcs: entry.arcs ?? [],
    // `?? []` for a server that predates ADR-0579: no key is the same fact as an empty list — the
    // trace told this reader nothing — and the rail says so in words rather than reading `.length`
    // off undefined.
    harnesses: entry.harnesses ?? [],
    hosts: entry.hosts ?? [],
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

/**
 * WHAT THE TRACE ROW SAYS ABOUT THE ARC — the owner's complaint, answered (ADR-0541).
 *
 * *"i can't tell what arc each session was working on if any, the left panel just shows me
 * trace/session ids."* The `if any` is the hard half, and it is why this returns a discriminated
 * state rather than a string: the four honest answers are genuinely different facts, and two of them
 * look identical from the arc list alone.
 *
 * ⚠ `no-arc` AND `unrecorded` MUST NEVER COLLAPSE (ADR-0541 D4). Both have an empty arc list. The
 * first is a session that claimed real work belonging to no arc — 20% of the measured September
 * population, `r3f-world-spike` (renamed `forest-rendering-engine` and then split into four lanes on
 * 2026-09-12, ADR-0562 — the September trace rows still carry the ORIGINAL id, so this recorded
 * measurement keeps it) and 26 other unhomed units — which is a RECORDED FACT about the
 * work. The second is a session that recorded nothing at all. Rendering the first as the second
 * reports known work as unknown and inflates September's apparent unknown share from 13% to 33%.
 * The units list is the only thing that separates them, which is why it rides the wire even when it
 * resolves cleanly.
 *
 * `unresolved` is the fifth, and it is not a state of the SESSION at all — it is a state of this
 * READ. The offline json backend holds no arcs, so nothing could be looked up; saying "no arc" there
 * would be a claim about the work made on the strength of a store that never answered.
 */
export type TraceArcState =
  /** Resolved to one or more arcs. Several are listed; the list is never reduced to one. */
  | { readonly state: 'arcs'; readonly arcs: readonly string[] }
  /** Units recorded, none of them on an arc — a fact about the work, not missing data. */
  | { readonly state: 'no-arc'; readonly units: readonly string[] }
  /** Nothing recorded. The permanent answer for the older two-thirds of the list (ADR-0541 D5). */
  | { readonly state: 'unrecorded' }
  /** The corpus could not be consulted, so the units are unresolved rather than unhomed. */
  | { readonly state: 'unresolved'; readonly units: readonly string[] };

/**
 * Classify one row. `arcsResolved` is the LIST's flag, not the row's: whether the corpus answered is
 * one fact about the request, and asking it per row would invite a caller to pass it per row.
 */
// Stryker disable next-line BlockStatement: KILLED, NAMEABLE ONLY AS A TIMEOUT — the
// `traversal-routes.ts` precedent, met here through React rather than through HTTP. An emptied body
// returns `undefined`, so every consumer throws on `classified.state`; the pure tests below fail on
// it instantly, but the covering set also includes `TraversalTab.test.tsx`, whose `waitFor` retries
// the failing render until its own budget expires. Vitest reaches `src/components/` before
// `src/lib/`, so the runner records a Timeout and attributes no killing test — which
// `adjudicateMutants` counts as UNPROVEN rather than as a pass. The mutant IS caught; what is
// missing is the runner's ability to name what caught it.
export function traceArcState(row: TraversalTraceRow, arcsResolved: boolean): TraceArcState {
  // Recorded-nothing is decided FIRST and independently of the corpus. A session with no units has
  // nothing to resolve, so a silent store changes nothing about the answer — and reporting it as
  // "unresolved" would blame the store for an absence that is the session's own.
  if (row.units.length === 0) return { state: 'unrecorded' };
  if (!arcsResolved) return { state: 'unresolved', units: row.units };
  if (row.arcs.length === 0) return { state: 'no-arc', units: row.units };
  return { state: 'arcs', arcs: row.arcs };
}

/**
 * The rail's one-line label for a row — the rail is 196px wide, so this is terse by construction.
 *
 * The two empty-arc states get DIFFERENT WORDS, not a shared blank: "no arc" is an answer and
 * "not recorded" is the absence of one, and an operator comparing traces has to be able to tell
 * which they are looking at without opening anything.
 */
export function traceArcLabel(row: TraversalTraceRow, arcsResolved: boolean): string {
  const classified = traceArcState(row, arcsResolved);
  switch (classified.state) {
    case 'arcs':
      return classified.arcs.join(' · ');
    case 'no-arc':
      return `no arc · ${classified.units.join(' · ')}`;
    case 'unresolved':
      return `arc unresolved · ${classified.units.join(' · ')}`;
    case 'unrecorded':
      return 'arc not recorded';
  }
}

/**
 * The full sentence behind the label, for the row's `title`. Says what the short form cannot fit —
 * above all that a blank row is a session that never said, and NOT a session that did nothing.
 */
export function traceArcTitle(row: TraversalTraceRow, arcsResolved: boolean): string {
  const classified = traceArcState(row, arcsResolved);
  switch (classified.state) {
    case 'arcs':
      return classified.arcs.length === 1
        ? `Worked on the arc ${classified.arcs[0]} — recorded by the session itself (${row.units.join(', ')}).`
        : `Worked across ${classified.arcs.length} arcs: ${classified.arcs.join(', ')} — every one listed, none picked as the winner.`;
    case 'no-arc':
      return `Claimed real work belonging to NO arc: ${classified.units.join(', ')}. That is a recorded fact about the work, not missing data.`;
    case 'unresolved':
      return `Recorded ${classified.units.join(', ')}, but the corpus could not be consulted, so these are unresolved rather than unhomed.`;
    case 'unrecorded':
      return 'This session never recorded what it was working on. Traces are attributed going forward only — no arc is ever inferred from a pooled worktree slot (ADR-0541 D3).';
  }
}

// ---------------------------------------------------------------------------
// WHICH HARNESS WROTE THE TRACE, AND ON WHICH MACHINE (ADR-0579)
// ---------------------------------------------------------------------------
//
// An audit read ~40 hours of Codex work on the owner's laptop as a second machine's, because the
// worktree was named after its WORK and nothing on the record could correct the reading. Every trace
// line now records the agent harness and the machine that wrote it, DETECTED from the writing process
// and never declared; these three functions are how the rail says them. The absence rule is the
// decision's fifth clause: a trace written before detection existed carries neither value, and the
// rail says "not recorded" — never a blank, and never a value inferred from anything else.

/**
 * How much of the pair a trace recorded — the classification the stylesheet tones by, so an ABSENCE
 * can be dimmed without the stylesheet re-deriving which kind it is (the `data-arc` precedent):
 * `recorded` has a harness AND a machine, `partial` one of the two (most often a process no
 * recognised harness ran), `unrecorded` neither.
 */
export type TraceRuntimeState = 'recorded' | 'partial' | 'unrecorded';

export function traceRuntimeState(row: TraversalTraceRow): TraceRuntimeState {
  const harness = row.harnesses.length > 0;
  const host = row.hosts.length > 0;
  if (harness && host) return 'recorded';
  if (harness || host) return 'partial';
  return 'unrecorded';
}

/**
 * The rail's line for WHICH HARNESS wrote a trace and ON WHICH MACHINE — and the tail of the replay's
 * header, which names the selected trace from the same row.
 *
 * THE ORDINARY CASE IS WORDED BY THE CLAIM LEDGER'S OWN RENDERER. One harness on one machine — every
 * trace written since detection landed — goes through `describeClaimRuntime`, the one copy every claim
 * surface prints through, so this rail and the claim dock say "codex on MicksMSpro" and "not
 * recorded" in the same words. That is the renderer's whole reason for being one copy: an unrecorded
 * half worded two ways is how one surface comes to imply what another denies. It is legal because the
 * trace and the ledger share one vocabulary, held identical by test (ADR-0579 D7).
 *
 * SEVERAL ARE LISTED, never reduced to one — two machines under one trace id is the cross-machine
 * collision a reader must be shown — in the same sentence shape, each half joined the way `storytree
 * traversal list` joins it. They are listed APART and never paired: the trace records the two facts
 * apart, so which harness ran on which machine is not on the record ({@link traceRuntimeTitle} says so).
 */
export function traceRuntimeLabel(row: TraversalTraceRow): string {
  const [harness, ...otherHarnesses] = row.harnesses;
  const [host, ...otherHosts] = row.hosts;
  if (otherHarnesses.length === 0 && otherHosts.length === 0) {
    const runtime: ClaimRuntime = {};
    // Stryker disable ConditionalExpression: EQUIVALENT, both guards. They exist for
    // `exactOptionalPropertyTypes`, which refuses an explicit `undefined` on an optional key; at run
    // time an assigned `undefined` and an absent key read identically through `describeClaimRuntime`
    // (`runtime.harness === undefined`, `normalizeClaimHost(undefined)`), so forcing either guard true
    // prints the same words and no assertion can separate them. The four answers they feed ARE pinned.
    if (harness !== undefined) runtime.harness = harness;
    if (host !== undefined) runtime.host = host;
    // Stryker restore ConditionalExpression
    return describeClaimRuntime(runtime);
  }
  const harnesses = row.harnesses.join(', ');
  const hosts = row.hosts.join(', ');
  if (row.harnesses.length === 0) return `harness not recorded, on ${hosts}`;
  if (row.hosts.length === 0) return `${harnesses}, host not recorded`;
  return `${harnesses} on ${hosts}`;
}

/**
 * The full sentence behind {@link traceRuntimeLabel}, for the row's `title`. It says what the short
 * form cannot fit: that both values were DETECTED rather than declared, that a missing harness is
 * never a human at a keyboard, that a blank is permanent rather than pending, and — when there are
 * several — that no pairing between them is on the record.
 *
 * ⚠ `host` IS THE MACHINE (ADR-0579 D8), so the sentence says "machine" in words: older traversal
 * prose uses "host" for the agent harness, and a hover that said "host" would inherit the ambiguity.
 */
export function traceRuntimeTitle(row: TraversalTraceRow): string {
  const { harnesses, hosts } = row;
  if (harnesses.length === 0 && hosts.length === 0) {
    return (
      'This trace recorded neither the agent harness that wrote it nor the machine it ran on. Lines ' +
      'written before detection existed carry neither, and nothing fills them in afterwards — not a ' +
      'worktree name, a branch, or the machine you are reading this on (ADR-0579).'
    );
  }
  const who =
    harnesses.length > 0
      ? harnesses.join(', ')
      : 'a process no recognised agent harness ran — a terminal, a script or CI, never read as a human at a keyboard —';
  const where =
    hosts.length > 0
      ? `${hosts.length > 1 ? 'the machines' : 'the machine'} ${hosts.join(', ')}`
      : 'a machine that was not recorded, and none is inferred';
  // The pairing caveat needs BOTH halves recorded and one of them plural: with no harness at all there
  // is no "which harness ran where" to disclaim, and one of each is a pair the record does state.
  const apart =
    harnesses.length > 0 && hosts.length > 0 && (harnesses.length > 1 || hosts.length > 1)
      ? ' The trace records the harness and the machine apart, so which harness ran on which machine is not recorded.'
      : '';
  return `Written by ${who} on ${where}. Detected from the process that wrote each line, never declared (ADR-0579).${apart}`;
}
