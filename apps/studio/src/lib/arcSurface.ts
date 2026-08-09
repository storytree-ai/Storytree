// The arc surface's PURE derivation layer (ADR-0314) — momentum lanes, arc state, and the briefing
// panel's payload, all computed from ONE already-joined `ArcRollup` and nothing else.
//
// WHERE THE JOIN LIVES, AND WHY NONE OF IT IS HERE. `packages/drive/src/arc-rollup.ts` owns the
// arc → children join, and both `storytree arc show` and `GET /api/arcs` render from that one
// value. This module derives PRESENTATION from an already-joined rollup: which bars a lane draws,
// which state a lane reads, what the briefing panel shows. It never re-derives membership, never
// queries, and never reaches for `listAssets()` — an arc's `increments` and `lifecycle` are
// `.extend()` metadata the GuidanceAsset wire never projects, so a second join here would fork the
// surface from the CLI while looking like it followed precedent (measured in increment 1, #1020).
//
// Pure: no React, no fetch, no clock of its own. `now` is always injected, so every judgement below
// is reproducible in a test rather than dependent on when it ran.

import type { ArcRollup, ArcRollupIncrement, ArcRollupQuestion } from '../types';

// ---------- D2: bars are units, not time ----------

/** The one increment status that counts as LANDED (ADR-0305 D2 / ADR-0314 D2). */
export const LANDED_STATUS = 'closed';

/** A bar's tone — the whole of ADR-0314 D2's model. Green for landed, grey for not yet. */
export type LaneBarTone = 'landed' | 'queued';

/** One bar of one lane: an increment, drawn as a unit rather than as a point in time. */
export interface LaneBar {
  id: string;
  title: string;
  /** The stored `IncrementStatus` (or `"?"`), kept so a tooltip can say WHICH grey this is. */
  status: string;
  tone: LaneBarTone;
}

/**
 * One lane's bars — landed first (oldest → newest), then queued (longest-waiting → newest).
 *
 * THE ORDER CARRIES NO DATE MEANING (ADR-0314 D2: "Position along the lane carries no date
 * meaning"). What it carries is the ADR-0305 D7 separation: the landed run and the queued run stay
 * visibly apart rather than interleaving, so a reader can never take an unbuilt intention for
 * something that happened. Within each run the rollup's own order survives — drive sorts
 * forward-looking work first and oldest-first within a rank, which puts the LONGEST-WAITING remedy
 * at the head of the grey run, and that is the entry a reader most needs to see.
 */
export function laneBars(rollup: ArcRollup): LaneBar[] {
  const bar = (inc: ArcRollupIncrement): LaneBar => ({
    id: inc.id,
    title: inc.title,
    status: inc.status,
    tone: inc.status === LANDED_STATUS ? 'landed' : 'queued',
  });
  const landed = rollup.increments.filter((i) => i.status === LANDED_STATUS).map(bar);
  const queued = rollup.increments.filter((i) => i.status !== LANDED_STATUS).map(bar);
  return [...landed, ...queued];
}

/**
 * How many units an arc is KNOWN to have, split by tone.
 *
 * DELIBERATELY NOT A RATIO, AND THE OMISSION IS LOAD-BEARING (ADR-0314 D2). A percentage claims a
 * denominator; an arc has none, because its `endState` is prose rather than a checklist. An arc with
 * 3 landed and 2 queued is not "60% done" — it is an arc with five KNOWN units, and the surface
 * never asserts that five is all of them. Nothing here returns a fraction, and
 * `arcSurface.test.ts` fences the shape so nothing can quietly add one.
 */
export interface LaneCounts {
  landed: number;
  queued: number;
}

export function laneCounts(rollup: ArcRollup): LaneCounts {
  let landed = 0;
  let queued = 0;
  for (const inc of rollup.increments) {
    if (inc.status === LANDED_STATUS) landed += 1;
    else queued += 1;
  }
  return { landed, queued };
}

// ---------- D4: the states, and the one this surface refuses to invent ----------

/**
 * The states the surface KNOWS (ADR-0267 D7, defined by ADR-0314 D4; `closed` added by ADR-0335).
 * All five are named here because the vocabulary is decided; only four are ever COMPUTED — see
 * {@link arcState}.
 *
 * - `waiting`  — an authored open question is sitting on this arc. Answerable right now, from the
 *                briefing panel, without a re-onboarding round trip.
 * - `blocked`  — the arc cannot proceed and there is NOTHING for the owner to answer.
 * - `running`  — moving.
 * - `quiet`    — moving slowly, nobody stuck (ADR-0314 D4's re-definition, load-bearing now that
 *                B3 "gone quiet" was rejected as a `blocked` predicate).
 * - `closed`   — `lifecycle: closed` (ADR-0335: mechanical, derived from the increment log — never
 *                a curated flag a session must remember to flip). Distinct from `quiet`: a quiet arc
 *                is still active and may resume any time on its own; a closed one reopens only when
 *                new forward-looking work is parked on it.
 */
export type ArcSurfaceState = 'waiting' | 'blocked' | 'running' | 'quiet' | 'closed';

/** The states {@link arcState} may actually return. `blocked` is NOT among them — by decision. */
export type DerivableArcState = Exclude<ArcSurfaceState, 'blocked'>;

/**
 * `blocked` IS NOT DERIVABLE FROM STORED STATE TODAY, AND THIS SURFACE REFUSES TO FAKE IT.
 *
 * ADR-0314 D4 gives `blocked` exactly two sources — a claim the arc cannot take on the story
 * nodes / capabilities it needs, and an unmet dependency on other work — and NEITHER exists yet:
 * the claim half needs ADR-0306's resolvable story/capability pointers and ADR-0308's per-increment
 * claim set (neither built — `Increment` carries no `dependsOn` and no claim set), and with no
 * dependency edge between increments there is no dependency source to read either.
 *
 * The tempting substitutes are all REJECTED BY NAME. The mock round offered B1 (an undecided
 * `proposed` ADR on the arc), B2 (never started — zero increments) and B3 (gone quiet — nothing in
 * more than 7 days); D4 rejects all three because they answer "has this arc been quiet", which is a
 * SYMPTOM rather than a cause, and at 2026-08-05 density B3 lit 8 arcs and collapsed `blocked` and
 * `quiet` into near-synonyms. ADR-0267 D7's fence against a session inventing a `blocked` predicate
 * still stands. So the lane leaves `blocked` UNLIT and says so, rather than lighting a lie: a
 * `blocked` that conflated "nobody has touched this" with "this cannot proceed" would train the
 * owner to ignore it.
 *
 * This constant exists so the refusal is a testable fact and not a comment nobody reads.
 */
export const BLOCKED_IS_DERIVABLE = false;

/** Human-readable reason for {@link BLOCKED_IS_DERIVABLE}, rendered where the state would go. */
export const BLOCKED_UNAVAILABLE_NOTE =
  'blocked is not lit — its sources (an unavailable claim, an unmet dependency) need ADR-0306/0308, which are not built';

/**
 * How long an arc may go without a landing or a parking before it reads `quiet` rather than
 * `running`. Seven days is the window the mock round measured "gone quiet" over; here it means what
 * it says (moving slowly) instead of standing in for `blocked` (ADR-0314 D4).
 */
export const QUIET_AFTER_DAYS = 7;

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * The most recent moment this arc DID something, as epoch ms — the max over every increment's
 * landing date and parking stamp. `null` when the arc has no dated increment at all (a fresh arc,
 * or one whose rows carry no usable date).
 *
 * Both halves count, and that is deliberate. A landing is obvious activity; a PARKING is activity
 * too — somebody decided a unit of this arc's work and wrote it down. Reading landings alone would
 * report an arc that gained four parked entries yesterday as untouched.
 *
 * Unparseable values are skipped rather than treated as epoch 0, so one malformed row cannot drag a
 * live arc into `quiet`.
 */
export function lastActivityAt(rollup: ArcRollup): number | null {
  let latest: number | null = null;
  const consider = (value: string | undefined): void => {
    if (value === undefined || value === '') return;
    const at = Date.parse(value);
    if (Number.isNaN(at)) return;
    if (latest === null || at > latest) latest = at;
  };
  for (const inc of rollup.increments) {
    consider(inc.outcome?.date);
    consider(inc.parked);
  }
  return latest;
}

/**
 * One arc's state (ADR-0314 D4, `closed` added by ADR-0335). `closed` wins over everything else —
 * a fully-drained arc reads as closed even if it happens to carry a stray unanswered question, since
 * `waiting` promises "answerable right now, in flight" and a closed arc is not in flight. Short of
 * that, `waiting` wins: an arc the owner can unblock by reading and replying is the one thing this
 * surface exists to surface, so it never hides behind a recency judgement.
 *
 * Never returns `blocked` — see {@link BLOCKED_IS_DERIVABLE}. The return type says so, so a future
 * session cannot add it here without deliberately widening the signature.
 */
export function arcState(rollup: ArcRollup, now: Date): DerivableArcState {
  if (rollup.lifecycle === 'closed') return 'closed';
  if (rollup.questions.length > 0) return 'waiting';
  const last = lastActivityAt(rollup);
  if (last === null) return 'quiet';
  return now.getTime() - last <= QUIET_AFTER_DAYS * DAY_MS ? 'running' : 'quiet';
}

// ---------- the lane list ----------

/** One lane, ready to render: the arc, its bars, its counts and its state. */
export interface ArcLane {
  arc: ArcRollup;
  bars: LaneBar[];
  counts: LaneCounts;
  state: DerivableArcState;
  /** The most recent landing/parking, epoch ms — `null` when the arc has no dated increment. */
  lastActivity: number | null;
}

const STATE_RANK: Readonly<Record<DerivableArcState, number>> = {
  waiting: 0,
  running: 1,
  quiet: 2,
  closed: 3,
};

/**
 * Which arcs {@link arcLanes} draws — the CLI's `ArcScope` naming (`packages/cli/src/arc.ts`),
 * reused here as a plain string union rather than an import: the studio must not depend on `cli`.
 * `active` is the default and matches ADR-0239 D3 / ADR-0335's own worklist framing.
 */
export type ArcLaneScope = 'active' | 'closed' | 'all';

/**
 * Every arc in `scope` as a lane, waiting arcs first, then running, then quiet, then closed; within
 * a state the most recently active first, ties broken by id so the order is total and a render is
 * stable between polls.
 *
 * `scope` defaults to `active` (ADR-0239 D3's worklist framing): the surface answers "where is this
 * initiative up to", and a pile of finished initiatives above the live ones would bury the answer.
 * Closed arcs are NOT hidden, only DEFAULT-excluded — ADR-0335 added the `closed`/`all` scopes after
 * the CLI already had `--closed`/`--all` but the studio surface had no equivalent, so "one click away
 * in the Library" was a promise the map itself did not keep (this doc used to say that; ADR-0335
 * corrected it in place rather than superseding, since the DECISION — active-by-default — never
 * changed, only the surface's ability to widen it).
 *
 * Waiting-first is the D3 posture expressed as an ordering: the panel is "where the owner acts", so
 * the arcs that have something for them to act on sit at the top of the list they scan.
 */
export function arcLanes(arcs: readonly ArcRollup[], now: Date, scope: ArcLaneScope = 'active'): ArcLane[] {
  return arcs
    .filter((arc) => {
      if (scope === 'all') return true;
      return (arc.lifecycle === 'closed') === (scope === 'closed');
    })
    .map((arc) => ({
      arc,
      bars: laneBars(arc),
      counts: laneCounts(arc),
      state: arcState(arc, now),
      lastActivity: lastActivityAt(arc),
    }))
    .sort((a, b) => {
      const rank = STATE_RANK[a.state] - STATE_RANK[b.state];
      if (rank !== 0) return rank;
      const la = a.lastActivity ?? -Infinity;
      const lb = b.lastActivity ?? -Infinity;
      if (la !== lb) return lb - la;
      return a.arc.id.localeCompare(b.arc.id);
    });
}

/**
 * Which lane the briefing panel opens on: the first one with something waiting on the owner, else
 * the first lane, else `null` when there are no active arcs. Pure so the default is testable rather
 * than an accident of render order.
 */
export function defaultLaneId(lanes: readonly ArcLane[]): string | null {
  const waiting = lanes.find((lane) => lane.state === 'waiting');
  return (waiting ?? lanes[0])?.arc.id ?? null;
}

// ---------- D3: the briefing panel's payload ----------

/**
 * What the right-hand panel shows for one arc (ADR-0314 D3) — the three questions ADR-0267's end
 * state names, in the order a returning owner asks them:
 *
 *   what is it about   → `intent` (on the arc itself)
 *   where is it up to  → `landed`, newest first
 *   what comes next    → `next`, longest-waiting first
 *
 * plus `waiting` — what is sitting on the owner right now, which is the half that makes the panel
 * somewhere to ACT rather than another index.
 */
export interface ArcBriefing {
  arc: ArcRollup;
  /** Open questions on this arc — empty when nothing waits on the owner. */
  waiting: ArcRollupQuestion[];
  /** Not-yet-landed increments, longest-waiting first (the rollup's own order). */
  next: ArcRollupIncrement[];
  /** Landed increments, NEWEST first — "where it is up to" reads backwards from now. */
  landed: ArcRollupIncrement[];
}

/**
 * An arc's prose as a plain-text BRIEFING LEAD — inline emphasis markers stripped, whitespace
 * collapsed.
 *
 * Arc `intent` / `endState` are markdown in the store (real intents open `**The intent.**`), and the
 * panel renders them as text, so the raw markers would show through as literal asterisks. Rendering
 * them THROUGH the studio's `Markdown` component is the wrong trade here: it reads `useAppData()`,
 * which would couple this surface to a React context and cost it the provider-free isolation that
 * lets it prove standalone — the same reason the Library lens keeps its components provider-free.
 *
 * Only PAIRED `**`/`__` and backticks are stripped. Single `*` and `_` are deliberately left alone:
 * they turn up inside ids and file paths far more often than they mean italics, and mangling an id
 * in a briefing is worse than showing one stray character. The formatted original is always one
 * click away through the artifact link (ADR-0314 D3).
 */
export function briefingLead(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/gs, '$1')
    .replace(/__(.+?)__/gs, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

export function arcBriefing(rollup: ArcRollup): ArcBriefing {
  const landed = rollup.increments.filter((i) => i.status === LANDED_STATUS).slice().reverse();
  return {
    arc: rollup,
    waiting: rollup.questions,
    next: rollup.increments.filter((i) => i.status !== LANDED_STATUS),
    landed,
  };
}
