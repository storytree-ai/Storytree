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
import { claimBand, formatLastHeard, type ClaimBand } from './claimBands';

// ---------- D2: bars are units, not time ----------

/**
 * The one TERMINAL increment status (ADR-0305 D2).
 *
 * ⚠ NAMED `LANDED_STATUS` UNTIL ADR-0564, AND THE NAME WAS THE BUG. A closed increment is finished,
 * NOT necessarily landed: on `rendering-engine-structure-arc`, 77 were closed and 6 had landed
 * anything, and this constant's name is what licensed every reader here to paint all 77 green.
 * Whether a close was a LANDING is {@link ArcRollupSummaryIncrement.disposition} / the outcome's own
 * disposition — never this. Use it to ask "is this over?", never "did this work?".
 */
export const CLOSED_STATUS = 'closed';

/**
 * WHAT A CLOSE MEANT, read off a FULL rollup increment (ADR-0564 D1).
 *
 * The lane strip does not need this — `GET /api/arcs` resolves the reading server-side and ships it
 * as `disposition`, because `outcome` does not ride that wire. The BRIEFING panel does: it takes the
 * whole `ArcRollup`, whose increments carry `outcome` verbatim, so the same rule has to be readable
 * from here too.
 *
 * It is a TRANSCRIPTION of `incrementDisposition` in `packages/arc/src/arc-rollup.ts`, which is
 * where the rule lives and is fenced; this surface does not own it. Kept as a copy rather than an
 * import for the reason the whole `types.ts` mirror exists — this app reads the server's SHAPE, not
 * its source.
 */
export function dispositionOf(inc: ArcRollupIncrement): 'landed' | 'failed' | 'withdrawn' | undefined {
  if (inc.status !== CLOSED_STATUS) return undefined;
  if (inc.outcome?.disposition !== undefined) return inc.outcome.disposition;
  if (inc.outcome?.pr !== undefined && inc.outcome.pr !== '') return 'landed';
  // NOT `failed`. A close nobody recorded and no PR derives is UNRECORDED — see `laneBars`.
  return undefined;
}

/** Did this increment LAND something? The question `status === 'closed'` was answering wrongly. */
export function hasLanded(inc: ArcRollupIncrement): boolean {
  return dispositionOf(inc) === 'landed';
}

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
 * A bar's tone — ADR-0314 D2's model, plus `gated` (ADR-0523 / inc-05) and ADR-0564's three
 * terminal readings.
 *
 * Two FAMILIES, and the split is what the reader is actually asking:
 *   - **TERMINAL** — `landed` (green: something landed), `failed` (red: the orchestrator recorded a
 *     failure), `withdrawn` (stopped rather than lost — a duplicate, a superseded plan), and
 *     `unrecorded` (closed, with no recorded call and no PR to derive one from).
 *   - **NOT YET** — `queued` (grey: not done), `gated` (not STARTABLE — ADR-0523's one extra tone).
 *
 * ⚠ `unrecorded` IS THE ONE THAT LOOKS REDUNDANT AND IS NOT. Every increment closed before ADR-0564
 * existed is in it: 71 of the 77 on the arc that exposed this. It cannot be `landed` (D2: never
 * green merely because it closed), it cannot be `failed` (D3 requires "the orchestrator's recorded
 * call", and ADR-0564's context names two such rows that landed a decision and would be libelled),
 * and it cannot be `queued` — the work is OVER. Folding it into any neighbour re-introduces one of
 * the two errors this decision exists to separate.
 *
 * ⚠ `withdrawn` IS NOT A SHADE OF `failed` (D3, in terms): it "must not be reported as one". They
 * are separate values so that collapsing them costs a deliberate edit and reds a test.
 */
export type LaneBarTone = 'landed' | 'failed' | 'withdrawn' | 'unrecorded' | 'queued' | 'gated';

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
 * {@link isGated}'s reading of the same rollup. A TERMINAL increment is never re-painted `gated`:
 * work that already happened is not waiting on anything, whatever the arc's own gate says today —
 * and that is true of a failure as much as of a landing.
 *
 * ⚠ THE TONE COMES FROM `disposition`, NEVER FROM `status` (ADR-0564 D2). `status === 'closed'`
 * answers "is this over?"; it was being read as "did this work?", and on the arc that exposed it the
 * two answers differed on 71 of 77 rows. The split below is still HISTORY vs FUTURE — so every
 * terminal reading, failures included, stays in the first run: a reader who saw a failure among the
 * queued bars would take finished work for work still to come.
 */
export function laneBars(rollup: ArcRollupSummary, gated = false): LaneBar[] {
  const bar = (inc: ArcRollupSummaryIncrement): LaneBar => ({
    id: inc.id,
    title: inc.title,
    status: inc.status,
    tone:
      inc.status === CLOSED_STATUS
        ? // An absent `disposition` on a closed row is the server saying NOBODY RECORDED ONE and no
          // PR derived one — not that it failed. See `LaneBarTone` for why that needs its own value.
          (inc.disposition ?? 'unrecorded')
        : gated
          ? 'gated'
          : 'queued',
  });
  const terminal = rollup.increments.filter((i) => i.status === CLOSED_STATUS).map(bar);
  const open = rollup.increments.filter((i) => i.status !== CLOSED_STATUS).map(bar);
  return [...terminal, ...open];
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
  /** Closed on a RECORDED failure (ADR-0564 D3). */
  failed: number;
  /** Closed as WITHDRAWN — stopped, not lost. Counted apart from `failed`, which D3 requires. */
  withdrawn: number;
  /** Closed with no recorded call and no PR to derive one from — every pre-ADR-0564 non-merge row. */
  unrecorded: number;
  /** Not yet terminal — `proposal` / `ready` / `active`, and any unrecognised status. */
  queued: number;
}

/**
 * ⚠ SPLIT BY TONE, NOT BY `status` (ADR-0564). This counted `status === 'closed'` as LANDED, so the
 * headline number beside the strip repeated the bars' lie in words — "77 landed" where 6 had landed.
 * The four terminal buckets are separate for the same reason the tones are: folding any of them into
 * `landed` restores the false green, and folding `unrecorded` into `queued` makes finished work read
 * as outstanding.
 */
export function laneCounts(rollup: ArcRollupSummary): LaneCounts {
  const counts: LaneCounts = { landed: 0, failed: 0, withdrawn: 0, unrecorded: 0, queued: 0 };
  for (const inc of rollup.increments) {
    if (inc.status !== CLOSED_STATUS) counts.queued += 1;
    else counts[inc.disposition ?? 'unrecorded'] += 1;
  }
  return counts;
}

/** The order the label reads in: history first, then what is still to come. */
const COUNT_ORDER: readonly (keyof LaneCounts)[] = ['landed', 'failed', 'withdrawn', 'unrecorded', 'queued'];

/**
 * {@link LaneCounts} as the one line the row prints and the aria-label speaks.
 *
 * ZERO BUCKETS ARE OMITTED, which is what keeps the widened split from costing the density ADR-0314
 * D2 bought: the overwhelmingly common arc reads exactly as it did before — `3 landed · 2 queued` —
 * and the extra words appear only on an arc that actually has failures to report. An arc with
 * nothing in it at all says `0 landed` rather than nothing, so an empty lane is never a blank.
 *
 * STILL A COUNT AND NEVER A RATIO. The ADR-0314 D2 denominator fence is untouched by the split: more
 * buckets is more honesty about what the known units WERE, not a claim about how many there are.
 */
export function laneCountsLabel(counts: LaneCounts): string {
  const parts = COUNT_ORDER.filter((key) => counts[key] > 0).map((key) => `${counts[key]} ${key}`);
  return parts.length === 0 ? '0 landed' : parts.join(' · ');
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
 * - `claimed`  — a LIVE session provably holds a claim that resolves to this arc, and we have heard
 *                from it inside the staleness window. One of the two states on this surface backed
 *                by the claim ledger rather than by dates, and it is asserted POSITIVELY ONLY — see
 *                {@link arcClaimants} for why its absence proves nothing.
 * - `unknown`  — ADDED BY ADR-0535 D1, AND IT IS THE STATE THIS SURFACE MOST NEEDED. A session took
 *                a claim resolving to this arc and never released it, and nobody has heard from it
 *                since. That is NOT "nobody is working here" and it is NOT calm: it is the absence
 *                of an answer, and the lane says so, carrying how long since we last heard
 *                ({@link arcLastHeardMs}).
 *
 *                ⚠ THIS EXISTS BECAUSE ITS ABSENCE MISLED THE OWNER. He looked at an arc that
 *                rendered `quiet`, concluded the work was finished, and it was not — the session
 *                holding it was 432 tool calls in with a PR open. Two faults produced that: the
 *                studio's own read dropped the stale row in SQL before the browser could see it,
 *                and with the row gone the lane fell through to `quiet`. ADR-0366 D4 had already
 *                decided the principle on another surface — *"a liveness probe that cannot answer
 *                is not a probe that answered no"* — and this applies it to a surface that predates
 *                it and did the exact opposite.
 * - `quiet`    — the DEFAULT, and since ADR-0374 D4 the only fall-through: NOTHING IS CLAIMED HERE
 *                AT ALL and nothing on it is waiting on the owner. Nobody stuck, nothing moving
 *                right now. Since ADR-0535 D1 that reading is finally true: a held-but-dark claim
 *                lands in `unknown` rather than collapsing into this.
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
export type ArcSurfaceState =
  | 'waiting'
  | 'claimed'
  | 'unknown'
  | 'blocked'
  | 'quiet'
  | 'parked'
  | 'closed';

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
 *
 * ── EACH HIT NOW CARRIES ITS BAND, AND THE THIRD BAND NEVER GETS HERE (ADR-0535 D1) ───────────
 *
 * A hit is `live` (heard from inside the staleness window) or `unknown` (held, unheard-from) —
 * {@link arcState} renders those as two different states, because collapsing them was the misread.
 * `abandoned` claims are DROPPED here rather than banded: they belong in the tidy-up list, and an
 * arc carrying a fortnight-old ghost as `unknown` teaches its reader to ignore the column, which is
 * exactly how the previous presence layer died. That drop is a RENDERING choice made against a
 * display-only threshold (`lib/claimBands.ts`) — it changes no store read and no takeover rule.
 */
export interface ArcClaimant {
  sessionId: string;
  branch: string;
  unitId: string;
  /** `live` or `unknown` — `abandoned` never reaches an arc lane (see above). */
  band: Exclude<ClaimBand, 'abandoned'>;
  /** Elapsed ms since this holder was last heard from — the server's stamp, not re-derived. */
  heartbeatAgeMs: number;
}

export function arcClaimants(
  rollup: ArcRollupSummary,
  groups: readonly SessionClaimGroup[] | null,
): ArcClaimant[] {
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

  const hits: ArcClaimant[] = [];
  for (const group of groups) {
    for (const claim of group.claims) {
      if (!units.has(claim.unitId)) continue;
      const band = claimBand(claim);
      if (band === 'abandoned') continue;
      hits.push({
        sessionId: group.sessionId,
        branch: group.branch,
        unitId: claim.unitId,
        band,
        heartbeatAgeMs: claim.heartbeatAgeMs,
      });
    }
  }
  return hits;
}

/**
 * HOW LONG SINCE ANYBODY ON THIS ARC WAS HEARD FROM, in ms — the number an `unknown` lane is
 * REQUIRED to carry, and `null` when the arc has no claimant to be silent about.
 *
 * The MINIMUM across claimants, not the maximum: the question a reader is asking is "when did this
 * arc last show a sign of life", and the most recent contact answers it. Taking the max would age
 * an arc by its stalest holder even while another session was actively working it.
 */
export function arcLastHeardMs(claimants: readonly ArcClaimant[]): number | null {
  if (claimants.length === 0) return null;
  return Math.min(...claimants.map((c) => c.heartbeatAgeMs));
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
    // EVERY close counts as activity, landing or not (ADR-0564 D5 renamed the field it reads, and
    // changed nothing here): a failure is a session's work too, and an arc that spent a week failing
    // is not a quiet arc.
    consider(inc.closedOn);
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
 *   4. `claimed` — a session is provably on it AND we have heard from it recently. Positive-only: a
 *      non-match falls THROUGH and never asserts "unclaimed" (see {@link arcClaimants} for the
 *      measured reason).
 *   5. `unknown` — a session holds it and nobody has heard from it (ADR-0535 D1). Ranked BELOW
 *      `claimed` and ABOVE `quiet`, which is the whole ordering claim: a proven-live holder is
 *      better news than a silent one, and a silent one is not the same news as an empty arc.
 *      An arc with one live claimant and one dark one reads `claimed` — the live session answers
 *      the reader's question, and the dark row is still visible in the lane's own claimant list.
 *   6. `quiet` — everything else. Not a computed judgement any more but a residual, and stating it
 *      that way is the point of ADR-0374 D4: an arc nobody is claiming, with nothing waiting on the
 *      owner and no shut gate, IS quiet. There is nothing further to measure, and the recency test
 *      that used to sit here (`moving` vs `quiet`) is deleted rather than widened.
 *
 *      ⚠ THIS IS NOW A NARROWER CLAIM THAN IT WAS, AND THAT IS THE REPAIR. It used to absorb every
 *      claim the studio's own read had already thrown away, so it asserted calm over sessions that
 *      were mid-flight. It reaches only genuinely unclaimed arcs now.
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
  const claimants = arcClaimants(rollup, claims);
  if (claimants.some((c) => c.band === 'live')) return 'claimed';
  if (claimants.length > 0) return 'unknown';
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
  /** Sessions provably holding this arc, each banded `live` or `unknown` — empty is NOT proof of
   *  absence (see {@link arcClaimants}), and plainly-abandoned holders are not here at all. */
  claimants: ArcClaimant[];
  /** Ms since anybody on this arc was last heard from — `null` with no claimants. What the
   *  `unknown` chip prints, so the state never asserts silence without saying how long. */
  lastHeardMs: number | null;
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

/**
 * What the lane's state chip PRINTS — the state word, plus, for `unknown`, how long since anybody
 * on the arc was heard from (ADR-0535 D1).
 *
 * THE AGE IS ON THE FACE OF THE CHIP, NOT IN ITS TOOLTIP, AND THAT IS THE POINT. The owner who was
 * misled read a word and drew a conclusion; he did not hover. A state that says "we do not know"
 * without saying for how long is only marginally better than one that says "quiet" — the age is
 * what turns it into something a reader can act on ("ten minutes" and "nine hours" want completely
 * different responses).
 */
export function claimChipLabel(lane: Pick<ArcLane, 'state' | 'lastHeardMs'>): string {
  if (lane.state !== 'unknown' || lane.lastHeardMs === null) return lane.state;
  return `${lane.state} · ${formatLastHeard(lane.lastHeardMs)}`;
}

/**
 * The lane state chip's tooltip — who is holding the arc, and for `unknown`, what the surface is
 * actually saying. `null` when there is nothing to add (no claimants), so the chip renders no empty
 * `title`.
 *
 * The `unknown` wording is careful on purpose: it names the holder, says we have not heard from
 * them, and says explicitly that this is NOT a statement that they stopped. A tooltip that read
 * "session s1 is gone" would be the same over-claim in a smaller font.
 */
export function claimChipTitle(
  lane: Pick<ArcLane, 'state' | 'claimants' | 'lastHeardMs'>,
): string | null {
  const sessions = [...new Set(lane.claimants.map((c) => c.sessionId))];
  if (sessions.length === 0) return null;
  const units = lane.claimants.map((c) => c.unitId).join(', ');
  if (lane.state !== 'unknown') return `held by ${sessions.join(', ')} — ${units}`;
  const age = lane.lastHeardMs === null ? 'a while' : formatLastHeard(lane.lastHeardMs);
  return `held by ${sessions.join(', ')} (${units}) — last heard from ${age} ago. The claim was never released and we cannot tell whether the session is still working; this is not a report that it stopped.`;
}

const STATE_RANK = {
  waiting: 0,
  blocked: 1,
  claimed: 2,
  unknown: 3,
  quiet: 4,
  parked: 5,
  closed: 6,
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
      const claimants = arcClaimants(arc, claims);
      const core: LaneCore = {
        arc,
        bars: laneBars(arc, isGated(arc)),
        counts: laneCounts(arc),
        state,
        lastActivity: lastActivityAt(arc),
        claimants,
        lastHeardMs: arcLastHeardMs(claimants),
      };
      return [arc.id, core];
    }),
  );

  // Only a SHUT gate whose blocker resolves inside `scoped` hides (and nests) its arc — see the doc
  // above. `waiting` always wins, so a question-carrying arc is never hidden by this.
  const inScope = new Set(scoped.map((a) => a.id));
  const isNested = (arc: ArcRollupSummary): boolean =>
    coreById.get(arc.id)!.state !== 'waiting' && arc.gates.some((g) => g.shut && inScope.has(g.id));

  // `ancestors` bounds the recursion the same way `gateCycleFor`'s own DFS does
  // (`packages/arc/src/arc.ts`) — write-time cycle refusal (ADR-0523 D4) means production data never
  // needs this, but a tree walk with no bound of its own is one bad row (or one write path that
  // bypassed the refusal) away from recursing forever, and this function has no server round-trip to
  // time it out. An ancestor met again renders with no further children rather than hanging the tab.
  const buildLane = (arc: ArcRollupSummary, ancestors: ReadonlySet<string> = new Set()): ArcLane => {
    const core = coreById.get(arc.id)!;
    if (ancestors.has(arc.id)) return { ...core, queued: [] };
    const path = new Set(ancestors).add(arc.id);
    const children = scoped.filter(
      (other) => isNested(other) && other.gates.some((g) => g.id === arc.id && g.shut),
    );
    return { ...core, queued: sortLanes(children.map((child) => buildLane(child, path))) };
  };

  return sortLanes(scoped.filter((arc) => !isNested(arc)).map((arc) => buildLane(arc)));
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

/**
 * The lane with this id, searched THROUGH the queue tree — `null` when no lane carries it.
 *
 * A queued arc is not a member of the top-level list (see {@link arcLanes}'s nesting rule), so a
 * `lanes.find(...)` over that list can only ever answer about arcs nothing is blocking. The chip run
 * makes a queued arc directly selectable, which means the selection guard has to be able to SEE one:
 * without this, clicking a chip failed the guard and silently snapped the panel back to
 * {@link defaultLaneId}.
 *
 * Termination rides on {@link arcLanes}'s own `ancestors` bound — the tree it returns is finite even
 * on cyclic data, so this walk cannot be the thing that hangs the tab.
 */
export function findLane(lanes: readonly ArcLane[], id: string): ArcLane | null {
  for (const lane of lanes) {
    if (lane.arc.id === id) return lane;
    const nested = findLane(lane.queued, id);
    if (nested !== null) return nested;
  }
  return null;
}

/** The house suffix every arc id carries (`storytree arc new` appends it — `packages/arc/src/arc.ts`). */
const ARC_ID_SUFFIX = '-arc';

/**
 * PURE: the SHORT name for an arc — its own id, de-kebabbed, with the house `-arc` suffix dropped.
 *
 * THE SHORT NAME ALREADY EXISTED AND IS NOT A NEW FIELD (owner, 2026-09-06: "Do we have arc titles?
 * if not we should add them"). Arcs DO carry a `title`, and it is what the lane draws — but the
 * authoring convention writes it as an END-STATE SENTENCE ("The shipped ground wears the approved
 * material, layer by layer"), so it reads as a description and runs long. Measured against the live
 * store on 2026-09-06 over all 134 arcs: `title` is a median 62 chars, p90 86, max 115, while the id
 * minus this suffix is a median 23, p90 35, max 57 — a third of the length, because ids were
 * hand-picked as short English phrases. `id` already rides {@link ArcRollupSummary}, so a chip label
 * derived here costs no schema change, no backfill across 134 rows, and — the reason that matters —
 * creates no SECOND authored name that can drift from the first.
 *
 * Only the first word is capitalised: this is a name, not a heading, and title-casing every word
 * ("Land Ground Stack") reads as a proper noun the corpus does not have.
 *
 * Never returns empty: an id that de-kebabs to nothing (all punctuation) falls back to the id itself,
 * so a malformed row draws something findable rather than a blank chip.
 */
export function shortLabel(id: string): string {
  const stem = id.endsWith(ARC_ID_SUFFIX) ? id.slice(0, -ARC_ID_SUFFIX.length) : id;
  const words = stem.split('-').filter((word) => word.length > 0);
  const first = words[0];
  if (first === undefined) return id;
  return [first.charAt(0).toUpperCase() + first.slice(1), ...words.slice(1)].join(' ');
}

/**
 * One arc queued behind another, as the lane row's chip run draws it (owner-directed 2026-09-06).
 *
 * `gates` is how DEPTH survives without nesting: a queued arc that itself holds others up carries the
 * count as a `+N`, rather than opening a second level of rows. That is the owner's own bound from the
 * inc-05 conversation — "its not like you would need to see more than one layer deep".
 */
export interface QueueChip {
  id: string;
  /** {@link shortLabel} of the arc's id — never its long title, which is the thing being escaped. */
  label: string;
  /** The arc's own long title, for the chip's hover — the detail stays reachable, just not inline. */
  title: string;
  /**
   * How many arcs THIS one in turn holds up AND the run does not itself draw. Zero for a leaf, and
   * zero for a link the {@link queueRun} chain hoisted — a `+N` exists to say there is depth NOT
   * drawn, so once it is drawn there is nothing left for it to say.
   */
  gates: number;
  /**
   * How many OTHER arcs must also close before this one can start — its shut gates, minus the one
   * it hangs under here. Zero almost always; above zero it is the thing an arrow cannot say.
   *
   * WHY IT HAS TO BE DRAWN. An arrow reads as a promise: `A -> B` says *when A lands, B can start*.
   * That is FALSE while B is also waiting on something else, and the queue's real shape today is
   * exactly that — measured over the live store 2026-09-07, the single gated arc in the whole
   * corpus (`mount-the-land-on-a-real-surface-arc`) is gated by TWO. So the connector that made the
   * line readable is also the connector that can lie, and this is the field that stops it.
   */
  otherGates: number;
  /**
   * The queued arc's own unit counts. It draws no bars of its own here, so this is what a hover has
   * to carry: an arc that landed work and was THEN gated would otherwise lose that signal entirely.
   */
  counts: LaneCounts;
}

/**
 * What the connector between a run's chips is allowed to MEAN.
 *
 * `chain` — every chip is queued behind the one before it, so an arrow between them states a real
 * edge. `set` — the chips are siblings behind one blocker, in no order at all, so the run must draw
 * a separator that asserts nothing.
 */
export type QueueShape = 'chain' | 'set';

/** One lane's queue as the row draws it: the chips, and what their separator is allowed to claim. */
export interface QueueRun {
  chips: QueueChip[];
  shape: QueueShape;
}

/** One `ArcLane` as a chip, with `gates` supplied by the caller — see {@link QueueChip.gates}. */
function queueChipOf(lane: ArcLane, gates: number): QueueChip {
  return {
    id: lane.arc.id,
    label: shortLabel(lane.arc.id),
    title: lane.arc.title || lane.arc.id,
    gates,
    // MINUS ONE: the gate it hangs under here is itself shut (arcLanes nests on no other condition),
    // so it is always one of these and would otherwise be counted as an "other".
    otherGates: Math.max(0, lane.arc.gates.filter((gate) => gate.shut).length - 1),
    counts: lane.counts,
  };
}

/**
 * The chips of a LINEAR queue, hoisted one level at a time — see {@link queueRun}.
 *
 * Termination rides on {@link arcLanes}'s own `ancestors` bound, exactly as {@link findLane}'s walk
 * does: the tree that function returns is finite even on cyclic rows (an ancestor met again is built
 * with no children), so a second guard here would duplicate a bound that already holds one level up.
 */
function queueChain(node: ArcLane | undefined): QueueChip[] {
  if (node === undefined) return [];
  // The chain continues only while each level holds exactly one. At the first that branches, the
  // depth below stays a `+N` on THIS chip rather than becoming a run that claims an order.
  const next = node.queued.length === 1 ? node.queued[0] : undefined;
  return [queueChipOf(node, next === undefined ? node.queued.length : 0), ...queueChain(next)];
}

/**
 * PURE: one lane's queue, flattened to the chip run the row draws, with the shape its separator is
 * allowed to assert.
 *
 * THE ARROW IS EARNED, NOT ASSUMED (owner-directed 2026-09-07: "why not just put an arrow, this way
 * if we have multiple arcs qued in a linked list we can draw the full linage with -> separators").
 * inc-07 refused connector arrows outright, on the ground that `ArcLane.queued` is a TREE and one
 * arc can gate several, so an arrow run would assert a running order the data does not carry. That
 * refusal is NARROWED here rather than reversed, and the narrowing is mechanical:
 *
 *   - the queue branches at the top (`queued.length > 1`) → a SET. Direct children only, each
 *     carrying what it in turn holds up as `+N`, and a separator that is not an arrow. Unchanged
 *     from inc-07 in both derivation and meaning.
 *   - the queue is LINEAR (`queued.length === 1`) → a CHAIN. The walk hoists each single child in
 *     turn, so `A -> B -> C` draws three REAL edges and reads as the lineage the owner asked for.
 *     It stops at the first level that branches, and that last chip carries the rest as `+N`.
 *
 * So a fan-out can never render as a false chain: the shape is read off the data, never chosen.
 *
 * Empty for almost every arc — the density property ADR-0523 earned and this rendering must preserve:
 * an ungated arc costs no chip line at all, and with 121 closed arcs in the store that is the
 * difference between a scannable list and 121 three-line blocks.
 */
export function queueRun(lane: ArcLane): QueueRun {
  if (lane.queued.length !== 1) {
    return { chips: lane.queued.map((child) => queueChipOf(child, child.queued.length)), shape: 'set' };
  }
  return { chips: queueChain(lane.queued[0]), shape: 'chain' };
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
  // LANDINGS, not closures (ADR-0564 D2). Filtering on `status === 'closed'` made this line say
  // "77 landed" about an arc that had landed 6 — the same lie as the bars, in words, in the one
  // place a reader goes for the number.
  const landed = rollup.increments.filter(hasLanded);
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
  // "Where is it up to" is a HISTORY question, so every terminal increment belongs here — a failure
  // is part of where an arc got to, and dropping it would hide the very rows ADR-0564 exists to
  // surface. The panel renders each one's own reading (`dispositionOf`); what this must NOT do is
  // keep calling the whole run `landed` without saying which of them landed.
  // No defensive `.slice()` before the reverse: `filter` already returns a fresh array, so copying
  // it again protects nothing and no test can tell the difference.
  const closed = rollup.increments.filter((i) => i.status === CLOSED_STATUS).reverse();
  return {
    arc: rollup,
    waiting: rollup.questions.filter((q) => q.lifecycle === 'open'),
    settled: rollup.questions.filter((q) => q.lifecycle === 'settled'),
    proposals: rollup.increments.filter((i) => i.status === PROPOSAL_STATUS),
    next: rollup.increments.filter(
      (i) => i.status !== CLOSED_STATUS && i.status !== PROPOSAL_STATUS,
    ),
    landed: closed,
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
