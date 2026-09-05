// The arc surface's PURE derivation layer (ADR-0314) — momentum lanes, arc state, and the briefing
// panel's payload, all computed from an already-joined server value and nothing else.
//
// TWO INPUT SHAPES, AND THE SPLIT IS THE PAYLOAD DECISION MADE VISIBLE IN THE TYPES. The LANE half
// (`laneBars` / `laneCounts` / `arcState` / `arcClaimants` / `lastActivityAt` / `arcLanes`) takes
// `ArcRollupSummary` — the narrowed row `GET /api/arcs` ships for every arc. The BRIEFING half
// (`arcBriefing` / `landedSummary`) takes the whole `ArcRollup`, which the panel reads for the ONE
// arc it is open on off `GET /api/arcs/<id>`. A lane function that reached for `intent`, a
// question's `stakes` or an increment's outcome prose would not compile against the summary, which
// is the point: the list payload cannot be widened here by accident, only deliberately and in
// `packages/arc/src/arc-rollup.ts` where the projection lives.
//
// WHERE THE JOIN LIVES, AND WHY NONE OF IT IS HERE. `packages/arc/src/arc-rollup.ts` owns the
// arc → children join, and both `storytree arc show` and `GET /api/arcs` render from that one
// value. This module derives PRESENTATION from an already-joined rollup: which bars a lane draws,
// which state a lane reads, what the briefing panel shows. It never re-derives membership, never
// queries, and never reaches for `listAssets()` — an arc's `increments` and `lifecycle` are
// `.extend()` metadata the GuidanceAsset wire never projects, so a second join here would fork the
// surface from the CLI while looking like it followed precedent (measured in increment 1, #1020).
//
// Pure: no React, no fetch, no clock of its own. `now` is always injected, so every judgement below
// is reproducible in a test rather than dependent on when it ran.

import type {
  ArcRollup,
  ArcRollupIncrement,
  ArcRollupQuestion,
  ArcRollupSummary,
  ArcRollupSummaryIncrement,
  GuidanceAsset,
  SessionClaimGroup,
} from '../types';

// ---------- D2: bars are units, not time ----------

/** The one increment status that counts as LANDED (ADR-0305 D2 / ADR-0314 D2). */
export const LANDED_STATUS = 'closed';

/**
 * The one increment status that is WAITING ON THE OWNER (ADR-0359 D2/D3).
 *
 * ADR-0305 D2's lifecycle is `proposal → ready → active → closed`, and the line D3 draws through it
 * is decided versus undecided work: a `proposal` is a unit whose shape is still open to the owner's
 * review, where `ready` and `active` are already dispatched. Only this one is promoted into the
 * briefing's waiting half; the other two stay under "what comes next", exactly where they were.
 */
export const PROPOSAL_STATUS = 'proposal';

/**
 * A bar's tone — ADR-0314 D2's model, plus `gated` (ADR-0523 / inc-05). Green for landed, grey for
 * not yet, and — ONE extra tone on the same idiom, never a second one — a distinct treatment for
 * not-yet-landed work sitting behind a shut gate: grey means not done, gated means not STARTABLE.
 */
export type LaneBarTone = 'landed' | 'queued' | 'gated';

/** One bar of one lane: an increment, drawn as a unit rather than as a point in time. */
export interface LaneBar {
  id: string;
  title: string;
  /** The stored `IncrementStatus` (or `"?"`), kept so a tooltip can say WHICH grey this is. */
  status: string;
  tone: LaneBarTone;
}

/**
 * One lane's bars — landed first (oldest → newest), then queued/gated (longest-waiting → newest).
 *
 * THE ORDER CARRIES NO DATE MEANING (ADR-0314 D2: "Position along the lane carries no date
 * meaning"). What it carries is the ADR-0305 D7 separation: the landed run and the not-yet-landed
 * run stay visibly apart rather than interleaving, so a reader can never take an unbuilt intention
 * for something that happened. Within each run the rollup's own order survives — drive sorts
 * forward-looking work first and oldest-first within a rank, which puts the LONGEST-WAITING remedy
 * at the head of the grey/gated run, and that is the entry a reader most needs to see.
 *
 * `gated` names whether THIS ARC (not any one increment) currently has a shut gate — pass
 * {@link isGated}'s reading of the same rollup. A landed increment is never re-painted `gated`: work
 * that already happened is not waiting on anything, whatever the arc's own gate says today.
 */
export function laneBars(rollup: ArcRollupSummary, gated = false): LaneBar[] {
  const bar = (inc: ArcRollupSummaryIncrement): LaneBar => ({
    id: inc.id,
    title: inc.title,
    status: inc.status,
    tone: inc.status === LANDED_STATUS ? 'landed' : gated ? 'gated' : 'queued',
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

export function laneCounts(rollup: ArcRollupSummary): LaneCounts {
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
 * The states the surface KNOWS (ADR-0267 D7, defined by ADR-0314 D4; `closed` added by ADR-0335;
 * `claimed` added by ADR-0351; `moving` RETIRED and `parked` added by ADR-0374; `blocked` LIT by
 * ADR-0523 / `arc-queue-and-question-legibility-arc` inc-05). All six are named here, and now all
 * six are COMPUTED — see {@link arcState}.
 *
 * - `waiting`  — an authored open question is sitting on this arc. Answerable right now, from the
 *                briefing panel, without a re-onboarding round trip.
 * - `blocked`  — this arc's OWN {@link isGated} reads true: at least one authored gate is still
 *                shut, so it cannot be STARTED. See {@link BLOCKED_IS_DERIVABLE} for which of
 *                ADR-0314 D4's two named sources this actually is, and which remains unlit.
 * - `claimed`  — a LIVE session provably holds a claim that resolves to this arc. The only state on
 *                this surface backed by the claim ledger rather than by dates, and it is asserted
 *                POSITIVELY ONLY — see {@link arcClaimants} for why its absence proves nothing.
 * - `quiet`    — the DEFAULT, and since ADR-0374 D4 the only fall-through: no session is on it and
 *                nothing on it is waiting on the owner. Nobody stuck, nothing moving right now.
 *
 *                ⚠ `moving` LIVED HERE AND IS GONE, which is the second half of a correction
 *                ADR-0351 D1 only half-made. That rename replaced `running` (which falsely implied a
 *                session) with `moving` (honest about measuring recency) — but the owner's objection
 *                was never only to the WORD: an arc nothing is claimed on and nothing is waiting on
 *                is quiet, whatever landed on it last week. Recency answered a question nobody was
 *                asking, and answered it degenerately: at landing velocity every recent arc read
 *                `moving`, so the state discriminated nothing, exactly as `running` had. The
 *                predicate is deleted rather than re-tuned — a longer window would only move the
 *                degeneracy, since the fault is that recency is not the question.
 * - `parked`   — `lifecycle: parked` (ADR-0374 D1): open work the owner has DECIDED not to do for
 *                now. Distinct from `quiet` in the one way that matters to a reader: a quiet arc is
 *                still on the worklist and may resume at any moment; a parked one is off it by
 *                decision, and only `arc reopen` brings it back.
 * - `closed`   — `lifecycle: closed` (ADR-0335: mechanical, derived from the increment log — never
 *                a curated flag a session must remember to flip). Distinct from `parked`: closed
 *                MET its end state, parked did not and still wants the work.
 */
export type ArcSurfaceState = 'waiting' | 'claimed' | 'blocked' | 'quiet' | 'parked' | 'closed';

/**
 * Every state {@link arcState} may return — ALL SIX, now that ADR-0523's authored gate supplies a
 * source for `blocked`. Kept as a distinct alias rather than inlining {@link ArcSurfaceState} at
 * each call site, for the reason it existed in the first place: a FUTURE state added to
 * `ArcSurfaceState` with no way yet to compute it should again narrow THIS type by name (an
 * `Exclude<...>`), spending the guard knowingly rather than by omission — exactly as `blocked` itself
 * was excluded here until this increment lit it.
 */
export type DerivableArcState = ArcSurfaceState;

/**
 * True while at least one of this arc's OWN gates (ADR-0523) is still shut — the arc cannot be
 * STARTED, so its own not-yet-landed increments draw `gated` rather than `queued` (one extra bar
 * tone, not a new idiom; see {@link laneBars}).
 *
 * Computed off the row's own `gates` alone, independent of whether {@link arcLanes} is currently
 * showing this arc nested under its blocker or promoted to the top level: the `waiting` exception
 * there is about REACHABILITY, not about whether the arc can actually be started, and the two must
 * not be conflated — a waiting-and-gated arc is still gated.
 */
export function isGated(rollup: ArcRollupSummary): boolean {
  return rollup.gates.some((g) => g.shut);
}

/**
 * The live claims that provably resolve to this arc — the claim-ledger join behind `claimed`.
 *
 * ── THIS IS A POSITIVE-ONLY ASSERTION, AND THE ASYMMETRY IS THE DESIGN ────────────────────────
 *
 * A match means a session IS on this arc. A non-match means NOTHING — not "nobody is working on
 * it". The surface must therefore never render an "unclaimed" state, and `arcState` falls through
 * to the recency states instead, which claim less.
 *
 * That is forced by measured coverage rather than caution. The typed edge from an increment to a
 * claimable unit (`cites`) is populated on 5 of 613 live increments for the `capability:` scheme
 * (0.8%), and an arc cannot be a `cites` target at all — `CiteRef` admits only
 * `story:` / `capability:` / `asset:`. Claims taken directly on an arc id do happen but are ~5% of
 * hold spans. So a claim-DERIVED replacement for the recency states would report "nothing claimed"
 * on nearly every arc even while a session sat on one: a confident false negative, which is strictly
 * worse than a vague-but-honest recency reading. Additive and positive-only is the version the data
 * actually supports.
 *
 * THREE PATHS, UNIONED, because sessions declare at three different grains and all three are real:
 *   1. the claim is ON the arc id itself (`noticeboard declare --node <arc-id>`, the cross-capability
 *      case ADR-0270 D1 allows);
 *   2. the claim is on one of this arc's own increment ids (which is how `<arc-id>-inc-NN` claims
 *      match — as MEMBERS of the rollup, never as a string prefix);
 *   3. the claim is on a unit an increment CITES (`story:`/`capability:`/`asset:` — the scheme is
 *      stripped, since claims are taken on bare unit ids).
 *
 * EVERY PATH IS AN EXACT MATCH AGAINST A MEMBER OF THIS ARC, and a `startsWith(<arc-id>-)` rule was
 * tried and REMOVED. It looked like it bought the `<arc-id>-inc-NN` case for free, but that case is
 * already path 2 (those sub-ids ARE the increments), so all the prefix actually added was false
 * positives: any arc whose id is a prefix of another unit's id would silently absorb that unit's
 * claims, and a session would be reported onto an arc it had never touched. A positive-only signal
 * cannot afford a false positive — it is the only thing the signal asserts.
 *
 * `groups === null` (no live store, or nothing has answered) yields `[]`, which is the same
 * not-proven answer as a genuine no-match — deliberately, because the two are equally unable to
 * support a negative claim.
 */
export function arcClaimants(
  rollup: ArcRollupSummary,
  groups: readonly SessionClaimGroup[] | null,
): Array<{ sessionId: string; branch: string; unitId: string }> {
  if (groups === null || groups.length === 0) return [];

  const units = new Set<string>([rollup.id]);
  for (const inc of rollup.increments) {
    units.add(inc.id);
    for (const ref of inc.cites ?? []) {
      // `story:foo` / `capability:foo` / `asset:foo` → `foo`; a bare id passes through unchanged.
      const colon = ref.indexOf(':');
      units.add(colon === -1 ? ref : ref.slice(colon + 1));
    }
  }

  const hits: Array<{ sessionId: string; branch: string; unitId: string }> = [];
  for (const group of groups) {
    for (const claim of group.claims) {
      if (units.has(claim.unitId)) {
        hits.push({ sessionId: group.sessionId, branch: group.branch, unitId: claim.unitId });
      }
    }
  }
  return hits;
}

/**
 * `blocked` NOW LIGHTS — FROM ONE OF ITS TWO NAMED SOURCES, NOT BOTH.
 *
 * ADR-0314 D4 gave `blocked` exactly two sources — a claim the arc cannot take on the story nodes /
 * capabilities it needs, and an unmet dependency on other work — and said NEITHER was derivable
 * because ADR-0306/0308 were not yet built. Both of those ADRs ARE built and live now, but reading
 * that as "so both sources exist" would be wrong on the specifics: ADR-0306 resolves an increment's
 * `story:`/`capability:` citations and reports one that dangles, and ADR-0308 orders increments
 * WITHIN one arc so takeability is a query there — neither one computes whether a story or
 * capability this arc needs is already HELD by somebody else, which is what the claim source
 * actually asks. What DOES supply a source is a different, later decision: ADR-0523's arc-to-arc
 * GATE (`storytree arc gate`), which is exactly "an unmet dependency on other work", expressed at
 * arc grain rather than increment grain. So `blocked` is derivable from the gate alone — see
 * {@link isGated}.
 *
 * The mock round's three rejected substitutes (B1 an undecided `proposed` ADR, B2 never-started, B3
 * gone-quiet) are UNCHANGED by this: none of them became a source, and ADR-0314 D4's rejection of
 * all three by name still stands. Only the gate is new.
 *
 * The CLAIM half stays undecided — see {@link BLOCKED_UNAVAILABLE_NOTE} for the caveat this leaves,
 * and why it is rendered rather than deleted now that the constant it annotates has flipped.
 */
export const BLOCKED_IS_DERIVABLE = true;

/**
 * The half of `blocked` that REMAINS underivable, rendered where a reader might otherwise take an
 * arc's silence on `blocked` as proof nothing is stopping it — precisely the risk
 * {@link BLOCKED_IS_DERIVABLE}'s doc names for the claim source. Kept rather than deleted alongside
 * that flip: the note's SUBJECT moved (from "neither source exists" to "one source exists and one
 * does not"), but the reason to say something out loud did not.
 */
export const BLOCKED_UNAVAILABLE_NOTE =
  'blocked lights only from an authored arc-to-arc gate (storytree arc gate) — the other named source, a claim this arc cannot take on the story nodes or capabilities it needs, is still not derivable, so an arc reading anything else here is not proof that nothing else is stopping it';

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
export function lastActivityAt(rollup: ArcRollupSummary): number | null {
  let latest: number | null = null;
  const consider = (value: string | undefined): void => {
    if (value === undefined || value === '') return;
    const at = Date.parse(value);
    if (Number.isNaN(at)) return;
    if (latest === null || at > latest) latest = at;
  };
  for (const inc of rollup.increments) {
    consider(inc.landedOn);
    consider(inc.parked);
  }
  return latest;
}

/**
 * One arc's state (ADR-0314 D4; `closed` added by ADR-0335, `parked` and the `quiet` fall-through by
 * ADR-0374 D4, `blocked` LIT by ADR-0523 / inc-05).
 *
 * THE ORDER IS THE DECISION, read top to bottom:
 *
 *   1. `closed` / `parked` — the two STORED lifecycles win over everything, because an arc that is
 *      off the worklist is off it whatever else is true of it. A drained arc reads closed even if it
 *      carries a stray unanswered question: `waiting` promises "answerable right now, in flight",
 *      and neither of these is in flight.
 *   2. `waiting` — an arc the owner can unblock by reading and replying is the one thing this
 *      surface exists to surface, so it outranks everything below it, INCLUDING `blocked`: answering
 *      the question may be exactly what releases the gate, and — the property `arcLanes`'s nesting
 *      rule depends on — a gate must never bury a question, so `waiting` has to win this comparison
 *      for that rule to have anything to key off.
 *   3. `blocked` — {@link isGated} reads true: at least one of this arc's own gates is still shut,
 *      so it cannot be started, whatever else is true of it. Ranked above `claimed` because a shut
 *      gate is a definite, external fact (the blocker has not closed), where a claim only reports
 *      that a session happens to be on the arc — which can be true of a gated arc doing legitimate
 *      prep work ahead of its blocker closing, and the reader still needs to see the gate.
 *   4. `claimed` — a session is provably on it. Positive-only: a non-match falls THROUGH and never
 *      asserts "unclaimed" (see {@link arcClaimants} for the measured reason).
 *   5. `quiet` — everything else. Not a computed judgement any more but a residual, and stating it
 *      that way is the point of ADR-0374 D4: an arc nobody is claiming, with nothing waiting on the
 *      owner and no shut gate, IS quiet. There is nothing further to measure, and the recency test
 *      that used to sit here (`moving` vs `quiet`) is deleted rather than widened.
 *
 * `now` is still taken, and deliberately: it is part of this function's published shape, every
 * caller injects it, and the lane list still sorts on {@link lastActivityAt}. It is simply no longer
 * consulted for the STATE — the surface reads the clock to ORDER lanes, never to label one.
 */
export function arcState(
  rollup: ArcRollupSummary,
  now: Date,
  claims: readonly SessionClaimGroup[] | null = null,
): DerivableArcState {
  void now;
  if (rollup.lifecycle === 'closed') return 'closed';
  if (rollup.lifecycle === 'parked') return 'parked';
  // The COUNT, not the question array — the list projection carries how many wait on the owner and
  // leaves the questions themselves to the per-id read. `> 0` is the identical predicate the array's
  // `.length > 0` was; what changed is that the surface no longer needs every arc's `stakes` prose
  // on the wire to answer it.
  if (rollup.openQuestions > 0) return 'waiting';
  if (isGated(rollup)) return 'blocked';
  if (arcClaimants(rollup, claims).length > 0) return 'claimed';
  return 'quiet';
}

// ---------- the lane list ----------

/** One lane, ready to render: the arc, its bars, its counts and its state. */
export interface ArcLane {
  /** The LANE projection off `GET /api/arcs`. The whole rollup is the briefing panel's own read. */
  arc: ArcRollupSummary;
  bars: LaneBar[];
  counts: LaneCounts;
  state: DerivableArcState;
  /** The most recent landing/parking, epoch ms — `null` when the arc has no dated increment. */
  lastActivity: number | null;
  /** Live sessions provably holding this arc — empty is NOT proof of absence (see arcClaimants). */
  claimants: Array<{ sessionId: string; branch: string; unitId: string }>;
  /**
   * Arcs queued behind THIS one (ADR-0523 / inc-05) — the disclosure's nested rows, each a full
   * `ArcLane` in its own right, so depth is a RECURSIVE property rather than a second shape: a
   * queued arc that itself gates others keeps its own caret. EMPTY for almost every arc, which
   * {@link arcLanes} is required to preserve at zero rendering cost — see that function's own doc.
   *
   * A member here is ALWAYS excluded from the top-level list `arcLanes` returns, with the one
   * exception `arcLanes` names: a `waiting` arc is promoted to the top level instead, so it is never
   * ALSO nested here — an arc is reachable at the top or through exactly one disclosure, never both
   * and never neither.
   */
  queued: ArcLane[];
}

const STATE_RANK = {
  waiting: 0,
  blocked: 1,
  claimed: 2,
  quiet: 3,
  parked: 4,
  closed: 5,
} satisfies Readonly<Record<DerivableArcState, number>>;

/**
 * Which arcs {@link arcLanes} draws — the CLI's `ArcScope` naming (`packages/arc/src/arc.ts`),
 * reused here as a plain string union rather than an import: the studio must not depend on that
 * package. `active` is the default and matches ADR-0239 D3 / ADR-0335's own worklist framing.
 *
 * ONE SCOPE PER LIFECYCLE, AND NO `all` (ADR-0374 D5 — the owner's call: "this is not a useful
 * view"). The CLI keeps `--all`, because a terminal reader can grep a long list and scan the
 * `[closed]` / `[parked]` tags. This surface draws LANES, and `all` drew the union of three
 * different answers in one column with the tag carried only by a small state chip — the reader who
 * most needs the split is the one least able to see it there. Every arc is reachable through exactly
 * one of these three scopes, so nothing is hidden by the removal; what goes is a fourth view that
 * answered no question of its own.
 */
export type ArcLaneScope = 'active' | 'parked' | 'closed';

/**
 * Every arc in `scope` as a lane, waiting arcs first, then claimed, then quiet; within a state the
 * most recently active first, ties broken by id so the order is total and a render is stable between
 * polls. (`parked` and `closed` also carry a rank, but each has a scope to itself now, so those two
 * only ever sort against their own kind.)
 *
 * `scope` defaults to `active` (ADR-0239 D3's worklist framing): the surface answers "where is this
 * initiative up to", and a pile of finished initiatives above the live ones would bury the answer.
 * Neither closed nor parked arcs are HIDDEN, only default-excluded — ADR-0335 added the `closed`
 * scope after the CLI already had `--closed` but the studio surface had no equivalent, so "one click
 * away in the Library" was a promise the map itself did not keep (this doc used to say that;
 * ADR-0335 corrected it in place rather than superseding, since the DECISION — active-by-default —
 * never changed, only the surface's ability to widen it). ADR-0374 D5 added `parked` beside it and
 * removed `all`.
 *
 * THE FILTER IS AN EXACT LIFECYCLE MATCH, not the old boolean split. `(closed) === (scope ===
 * 'closed')` had only two answers to give, so a third lifecycle would have fallen into whichever
 * side it did not name — sweeping every parked arc back onto the active worklist, which is the one
 * place parking exists to remove it from.
 *
 * Waiting-first is the D3 posture expressed as an ordering: the panel is "where the owner acts", so
 * the arcs that have something for them to act on sit at the top of the list they scan.
 *
 * THE NESTING RULE (ADR-0523, `arc-queue-and-question-legibility-arc` inc-05). An arc Y carrying a
 * still-shut gate on arc X (`Y.gates` holds `{id: X.id, shut: true}`) is reachable ONLY through X's
 * disclosure: it is REMOVED from the top-level list this function returns and appears instead in
 * X's own {@link ArcLane.queued}. This is what makes authoring a gate shorten the worklist rather
 * than lengthen it — the arc's whole end-state promise. Resolution is scoped to arcs sharing
 * `scope`: a blocker that is not itself in `scope` (a different lifecycle) has no visible row to
 * nest under here, so its dependent falls back to an ordinary top-level lane rather than becoming
 * silently unreachable — a fail-open posture matching the drive-side rollup's own read of a gate it
 * cannot resolve (an unresolvable blocker is treated as shut, never as satisfied). In practice this
 * is rare: once a blocker CLOSES its gates read `shut: false` (see below), and a `parked` blocker is
 * the only other case scope can split a live edge across.
 *
 * ⚠ THE ONE EXCEPTION: a `waiting` arc is ALWAYS promoted to the top level, gated or not, and is
 * therefore NEVER ALSO nested — reachable at the top or through exactly one disclosure, never both,
 * and never buried (ADR-0314 D3: a gate must never hide a question the owner needs to answer). This
 * is exactly {@link arcState}'s own precedence (`waiting` outranks `blocked`) read as a reachability
 * rule rather than a label.
 *
 * A gate that has been resolved (`shut: false` — the blocker closed) stops nesting its arc the
 * moment the data says so: nobody has to run `arc ungate` for the promotion to take effect here,
 * only to clear the stale edge from the record.
 */
export function arcLanes(
  arcs: readonly ArcRollupSummary[],
  now: Date,
  scope: ArcLaneScope = 'active',
  claims: readonly SessionClaimGroup[] | null = null,
): ArcLane[] {
  const scoped = arcs.filter((arc) => arc.lifecycle === scope);

  const sortLanes = (lanes: ArcLane[]): ArcLane[] =>
    lanes.sort((a, b) => {
      const rank = STATE_RANK[a.state] - STATE_RANK[b.state];
      if (rank !== 0) return rank;
      const la = a.lastActivity ?? -Infinity;
      const lb = b.lastActivity ?? -Infinity;
      if (la !== lb) return lb - la;
      return a.arc.id.localeCompare(b.arc.id);
    });

  type LaneCore = Omit<ArcLane, 'queued'>;
  const coreById = new Map<string, LaneCore>(
    scoped.map((arc) => {
      const state = arcState(arc, now, claims);
      const core: LaneCore = {
        arc,
        bars: laneBars(arc, isGated(arc)),
        counts: laneCounts(arc),
        state,
        lastActivity: lastActivityAt(arc),
        claimants: arcClaimants(arc, claims),
      };
      return [arc.id, core];
    }),
  );

  // Only a SHUT gate whose blocker resolves inside `scoped` hides (and nests) its arc — see the doc
  // above. `waiting` always wins, so a question-carrying arc is never hidden by this.
  const inScope = new Set(scoped.map((a) => a.id));
  const isNested = (arc: ArcRollupSummary): boolean =>
    coreById.get(arc.id)!.state !== 'waiting' && arc.gates.some((g) => g.shut && inScope.has(g.id));

  const buildLane = (arc: ArcRollupSummary): ArcLane => {
    const children = scoped.filter(
      (other) => isNested(other) && other.gates.some((g) => g.id === arc.id && g.shut),
    );
    return { ...coreById.get(arc.id)!, queued: sortLanes(children.map(buildLane)) };
  };

  return sortLanes(scoped.filter((arc) => !isNested(arc)).map(buildLane));
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
  /** The WHOLE rollup — the panel's own per-id read, not the lane's summary row. */
  arc: ArcRollup;
  /**
   * Open questions on this arc — empty when nothing waits on the owner.
   *
   * FILTERED BY LIFECYCLE since ADR-0434 D3, not the whole `rollup.questions` array. A settled
   * question is not waiting on anybody, and leaving it here would reproduce in this panel the exact
   * defect that decision removed from the arc rollup: a question whose answer was already recorded
   * still rendering as something the owner owes an answer to.
   */
  waiting: ArcRollupQuestion[];
  /**
   * Questions this arc has SETTLED, each carrying the answer it recorded (ADR-0434 D3).
   *
   * A sibling field rather than a flag on {@link waiting}, for the reason the `proposals` field
   * below gives about itself: every existing reader of `waiting` keeps looking at exactly what it
   * was looking at. Settled questions stay on the arc rather than being deleted — that is the half
   * of ADR-0434 that closes `retiring-an-answered-question-orphans-the-prose-that-raised-it`, where
   * clearing the wait by retirement left the arc showing no trace of the question OR its answer.
   */
  settled: ArcRollupQuestion[];
  /**
   * Parked PROPOSALS — the second thing waiting on the owner (ADR-0359 D2), rendered beside
   * `waiting` rather than merged into it.
   *
   * A SIBLING FIELD, DELIBERATELY. `waiting` keeps meaning "authored open questions" so no existing
   * reader of it silently changes what it is looking at — most importantly {@link arcState}, which
   * derives the LANE chip from `rollup.questions` and must keep doing so (D4: all 13 active arcs
   * carried open increments on 2026-08-12, so a proposal-lit `waiting` would light every lane and
   * discriminate nothing — the degeneracy ADR-0351 D1 had just removed).
   *
   * DISJOINT from {@link next}, not a subset of it. Rendering a proposal in both blocks was tried
   * and removed: the panel is being de-noised, and the same row twice on one screen is noise of
   * exactly the kind this change exists to cut. So a proposal MOVES here; `next` is what remains.
   */
  proposals: ArcRollupIncrement[];
  /**
   * What is queued but NOT waiting on the owner — `ready` and `active`, longest-waiting first
   * (the rollup's own order). Proposals moved to {@link proposals} (ADR-0359 D3): this block is
   * decided work in flight, and the distinction is the whole point of splitting them.
   */
  next: ArcRollupIncrement[];
  /** Landed increments, NEWEST first — "where it is up to" reads backwards from now. */
  landed: ArcRollupIncrement[];
}

/**
 * The landed log as ONE LINE (ADR-0359 D1) — `13 landed · last 2026-08-05 #1186`.
 *
 * The panel used to render one row per closed increment, which is 57 rows on
 * `verification-integrity-arc` against the live store on 2026-08-12, at the bottom of a scroll the
 * owner has to travel past whatever they came for. The list is not deleted — it moves behind a
 * closed-by-default disclosure and this is what the summary says instead.
 *
 * THE COUNT IS A COUNT AND NEVER A RATIO. ADR-0314 D2's denominator fence reaches here for the same
 * reason it reaches `laneCounts`: an arc's `endState` is prose, so "13 of N" has no N and "13
 * landed" is the whole honest claim.
 *
 * The "most recent" landing is the MAX over parsed dates, not the last element — the rollup's order
 * is drive's status-rank sort, and reading position as recency is exactly the mistake ADR-0314 D2
 * forbids on the bars. What it does not know it OMITS: a landing with no date prints the count
 * alone, and one with no PR prints the date alone, rather than rendering an empty separator.
 */
export function landedSummary(rollup: ArcRollup): string {
  const landed = rollup.increments.filter((i) => i.status === LANDED_STATUS);
  if (landed.length === 0) return 'Nothing has landed yet';

  let newest: ArcRollupIncrement | null = null;
  let newestAt = -Infinity;
  for (const inc of landed) {
    const date = inc.outcome?.date;
    if (date === undefined || date === '') continue;
    const at = Date.parse(date);
    if (Number.isNaN(at) || at < newestAt) continue;
    newest = inc;
    newestAt = at;
  }

  const parts = [`${landed.length} landed`];
  if (newest?.outcome?.date) {
    const pr = newest.outcome.pr;
    parts.push(`last ${newest.outcome.date}${pr ? ` ${pr}` : ''}`);
  }
  return parts.join(' · ');
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
    waiting: rollup.questions.filter((q) => q.lifecycle === 'open'),
    settled: rollup.questions.filter((q) => q.lifecycle === 'settled'),
    proposals: rollup.increments.filter((i) => i.status === PROPOSAL_STATUS),
    next: rollup.increments.filter(
      (i) => i.status !== LANDED_STATUS && i.status !== PROPOSAL_STATUS,
    ),
    landed,
  };
}

// ---------- inc-01/inc-02 (arc-queue-and-question-legibility-arc): the question's OWN reading ----------
//
// A question's full authoring fields — `statement` / `context` / `options` / `analogy` / `diagram` /
// `recommendation` — do NOT arrive on {@link ArcRollupQuestion}. That shape carries only `stakes` and
// `description` (the fields `arc-rollup.ts`'s per-arc join has ever read), and widening it is
// EXACTLY what the increment's own warning forbids: "the panel's data source does not change and
// must not widen" is about that join (`ArcRollupSummary` / `ArcRollup`, measured at 1,364,425 bytes
// over 76 arcs re-polled every 30 s) — packages/arc is a sibling lane's territory this increment too.
//
// The fields exist somewhere else already, at zero extra network cost: `open-question` is a
// structured Knowledge kind (KIND_SPECS), so every one of its authoring fields already rides the
// wire on `GuidanceAsset.fields` (`packages/library/src/store/render-doc.ts`'s `extractFields`) —
// the SAME already-loaded Library corpus `useAppData().assets` hands to the Library lens on every
// mount, arc drawer open or not. Reading it here is not "fetching more"; it is a second, independent
// consumer of a read the studio pays for regardless. `ArcSurfaceProps.assets` carries it in, exactly
// the way `claims` does — the surface still holds no fetch of its own.

/**
 * The seven authoring fields a question's reading cost is measured over — the arc's own methodology
 * (`arc-queue-and-question-legibility-arc`, measured 2026-09-05 over all 40 live open-question rows:
 * median 1,761 words, `statement` a median 6% of that, `context` the largest single field at 29%).
 * `answer` is deliberately excluded: it exists only once a question is SETTLED, and reading it is a
 * different job (the archaeology of how it got there) from what an open question costs to read.
 */
export const QUESTION_WORD_BUDGET_FIELDS = [
  'stakes',
  'statement',
  'context',
  'options',
  'analogy',
  'diagram',
  'recommendation',
] as const;

/** The two fields inc-02 puts behind a fold, in fold order: analogy, then context. */
const FOLDED_QUESTION_FIELDS = ['analogy', 'context'] as const;

/** PURE: whitespace-separated tokens — the same crude count the arc's own corpus sweep used. */
export function wordCount(text: string | undefined): number {
  if (text === undefined) return 0;
  const trimmed = text.trim();
  return trimmed === '' ? 0 : trimmed.split(/\s+/).length;
}

/**
 * A question's per-kind structured fields, read off the Library corpus the studio ALREADY loads
 * (`ArcSurfaceProps.assets`) — never a new fetch. `{}` when the corpus has not answered yet or holds
 * no structured asset for this id, so every reader below degrades to "nothing measured" rather than
 * throwing — the same absent-is-empty posture {@link ArcRollupQuestion}'s own optional fields take.
 */
export function questionFields(
  assets: readonly GuidanceAsset[],
  questionId: string,
): Record<string, string> {
  return assets.find((a) => a.id === questionId)?.fields ?? {};
}

/** The row-level facts the inc-01 flat list needs, computed from one question's structured fields. */
export interface QuestionRowStats {
  /** Summed over {@link QUESTION_WORD_BUDGET_FIELDS} — how much reading this question stores. */
  wordTotal: number;
  /** True when the `diagram` field is absent or blank — the row's "no diagram" flag. */
  noDiagram: boolean;
}

export function questionRowStats(fields: Record<string, string>): QuestionRowStats {
  const wordTotal = QUESTION_WORD_BUDGET_FIELDS.reduce((sum, f) => sum + wordCount(fields[f]), 0);
  return { wordTotal, noDiagram: wordCount(fields['diagram']) === 0 };
}

/** One parsed option card — the authoring convention's inline `FOR:`/`AGAINST:` pair, split out. */
export interface OptionCard {
  /** Everything before the first `FOR:` marker — the option's own label and description, trimmed. */
  summary: string;
  /** Empty when the paragraph carries no `FOR:` marker. */
  forText: string;
  /** Empty when the paragraph carries no `AGAINST:` marker (or it precedes `FOR:`). */
  againstText: string;
}

/**
 * Split the `options` field into one card per option (paragraphs, blank-line separated), each parsed
 * on the existing authoring convention — `storytree question new`'s own placeholder asks for "the
 * candidate answers, each with its trade-off (name both sides — A vs B)", and every live row already
 * writes it as inline `FOR: … AGAINST: …`. A paragraph carrying neither marker is not a parse
 * failure (a question predating the convention, or one that phrases it differently): it survives as
 * a card with empty `forText`/`againstText` and its whole text in `summary`, never dropped.
 */
/**
 * What separates one option from the next: a BLANK line, however much whitespace it carries.
 *
 * Hoisted out of the chain below rather than written inline, because a `Stryker disable next-line`
 * directive does not reach a regex sitting inside a method chain — at statement level it does, and
 * the pattern reads better named than buried in a `.split()`.
 */
// Stryker disable next-line Regex: EQUIVALENT — `\s*` is greedy and `\n` is itself whitespace, so `\n\s*\n` already consumes any run of blank lines; the trailing `+` states the intent (one or more) and cannot move a split.
const OPTION_SEPARATOR = /\n\s*\n+/;

export function parseOptionCards(optionsText: string | undefined): OptionCard[] {
  // Stryker disable next-line ConditionalExpression,MethodExpression,StringLiteral: EQUIVALENT for
  // the `.trim() === ''` half — a blank or whitespace-only input falls through to the split below,
  // whose paragraphs are all empty after trimming and are then removed by the `.filter`, yielding
  // the same `[]`. The guard is an early exit, not a decision. (The `=== undefined` half IS
  // load-bearing — without it `.trim()` throws — and a test pins it.)
  if (optionsText === undefined || optionsText.trim() === '') return [];
  return optionsText
    .split(OPTION_SEPARATOR)
    .map((paragraph) => paragraph.trim())
    .filter((paragraph) => paragraph !== '')
    .map((paragraph): OptionCard => {
      const forIdx = paragraph.indexOf('FOR:');
      // AGAINST: counts only where it FOLLOWS FOR:, which searching from `forIdx` gives us. When
      // there is no FOR: at all, `forIdx` is -1 and this searches the whole paragraph — harmless,
      // because the guard below rejects the paragraph on `forIdx` regardless of what was found.
      //
      // That guard used to be duplicated here as `forIdx === -1 ? -1 : …`, which made BOTH checks
      // unfalsifiable: the ternary forced `againstIdx` to -1 exactly when the guard was already
      // going to reject, so neither could be observed failing. One check, once.
      const againstIdx = paragraph.indexOf('AGAINST:', forIdx);
      if (forIdx === -1 || againstIdx === -1) {
        return { summary: paragraph, forText: '', againstText: '' };
      }
      return {
        summary: paragraph.slice(0, forIdx).trim(),
        forText: paragraph.slice(forIdx + 'FOR:'.length, againstIdx).trim(),
        againstText: paragraph.slice(againstIdx + 'AGAINST:'.length).trim(),
      };
    });
}

/**
 * The word-budget readout inc-02 asks for: what is stored, what renders without expanding anything,
 * and what sits behind a fold. `aboveFold` is defined as `total - folded` rather than as its own
 * independent sum — so the three numbers are ALWAYS arithmetically consistent by construction, and a
 * reader never has to wonder where a fourth, uncounted bucket of words went.
 */
export interface WordBudget {
  total: number;
  aboveFold: number;
  folded: number;
}

export function questionWordBudget(fields: Record<string, string>): WordBudget {
  const total = QUESTION_WORD_BUDGET_FIELDS.reduce((sum, f) => sum + wordCount(fields[f]), 0);
  const folded = FOLDED_QUESTION_FIELDS.reduce((sum, f) => sum + wordCount(fields[f]), 0);
  return { total, aboveFold: total - folded, folded };
}
