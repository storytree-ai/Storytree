/**
 * WHO STARTED THIS SESSION — story `context-traversal-capture`, capability
 * `terminal-capture-activation` (ADR-0484 D7, increment
 * `trace-records-whether-a-session-was-cut-or-human-started`).
 *
 * A trace records what a session READ. Its {@link ./session-identity.js} sibling records what the
 * trace's `sessionId` NAMES — which window, and which worktree slot the window ran in. Neither says
 * anything about the window's ORIGIN, and every analysis of this data has so far assumed the answer.
 *
 * THE OWNER'S OWN CORRECTION, 2026-08-30, on being shown that 82.8% of non-preamble reads arrive
 * from outside anything the capture can see: *"I suspect many of my prompts are actually sessions cut
 * by another agent, so actually to get to one of my prompts you may need to find a session that
 * seeded an arc."* A session cut by a predecessor is BRIEFED by that predecessor — its first reads
 * follow an agent-authored handover, not an operator instruction. So the natural reading of that
 * 82.8% ("the owner told it to") is wrong for an unknown and possibly large share of it. ADR-0484 D7
 * states it as the difference between *"the system's guidance drives what agents read"* and
 * *"agent-authored handovers drive what agents read"*, which imply opposite remedies.
 *
 * ⚠ ABSENCE IS A FIRST-CLASS ANSWER, AND IT IS NEVER "HUMAN". A session whose origin nobody declared
 * resolves to NOTHING here, and a read of such a trace classifies as {@link classifySessionOrigin}'s
 * `unknown`. Defaulting an undeclared session to human would silently restore the very assumption
 * this module exists to remove — and it would do it in the direction that reads as reassuring, which
 * is the failure mode the knowledge axis and `surface-depth.ts` already refuse elsewhere.
 *
 * ⚠ NOTHING HERE INFERS AN ORIGIN. Not from timing, not from a branch name, not from worktree reuse.
 * A guessed provenance is strictly worse than an absent one, because a reader cannot tell it apart
 * from a recorded one. Every trace written before this landed stays unlabelled and reads as
 * `unknown` — the same posture {@link classifyTraceIdentity} takes toward the legacy slot era, which
 * it labels rather than retrofits.
 *
 * PURE by construction, exactly as `session-identity.ts` is: no clock, no filesystem, no ambient
 * `process.env`. The environment and the persisted declaration are both INJECTED, so the whole
 * precedence is decided by values and is testable offline. The fs half lives beside it in
 * `origin-declaration.ts`.
 */
import { z } from "zod";

/**
 * The environment channel a storytree-owned cut sets MECHANICALLY: `human` or `cut`.
 *
 * Any other word is read as unstated rather than coerced — the `gradeOf` rule, applied here.
 */
export const SESSION_ORIGIN_ENV = "STORYTREE_SESSION_ORIGIN";

/**
 * The session that cut this one. Naming a cutter IS a claim of origin, so this alone resolves `cut`
 * even with {@link SESSION_ORIGIN_ENV} unset — "I was cut, by something" is strictly more than
 * today's nothing, which is the increment's own fence.
 */
export const CUT_BY_SESSION_ENV = "STORYTREE_CUT_BY";

/**
 * The arc or increment this session was cut to drive.
 *
 * A canonical IDENTITY, so recording it is allowed under ADR-0235 clause 6 on the same rule that
 * lets `library related <id>` record its anchor while `library search "<terms>"` drops the terms.
 *
 * ⚠ ON ITS OWN IT IS NOT A CLAIM OF ORIGIN, deliberately. A human-started session driving an
 * increment could carry the same value honestly, so promoting it to "this session was cut" would be
 * exactly the inference this module refuses. It rides an origin established by one of the two
 * channels above, and is dropped otherwise.
 */
export const CUT_FOR_UNIT_ENV = "STORYTREE_CUT_FOR";

/** How a context window came to exist. There is no third value: absence is modelled by `null`. */
export type SessionOriginKind = "human" | "cut";

/** One session's declared origin. Only ever built from an explicit claim, never from a default. */
export interface SessionOrigin {
  readonly kind: SessionOriginKind;
  /** The session that cut this one, when it named itself. Always null on a `human` origin. */
  readonly cutBy: string | null;
  /** The arc/increment this session was cut to drive. Always null on a `human` origin. */
  readonly cutFor: string | null;
}

/**
 * The persisted declaration a session writes about ITSELF — the route for a cut the environment
 * could not reach (a desktop `spawn_task` chip, whose environment the harness owns).
 *
 * `v` is a literal rather than a tolerated number: a declaration this reader does not understand
 * must resolve to no origin at all, and a version bump is exactly that case.
 */
export const SessionOriginDeclarationDoc = z.object({
  v: z.literal(1),
  /**
   * ⚠ NULLABLE SINCE ADR-0541 D2, and the null is a real state rather than a tolerated absence: a
   * session that CLAIMS WORK writes this file to record the units it claimed, and claiming work is
   * not a claim of origin. Such a declaration states units and nothing else, so it must not be able
   * to assert an origin nobody declared — {@link resolveSessionOrigin} falls THROUGH it to the
   * environment rather than treating it as a `human`/`cut` answer.
   */
  //
  // ⚠ ABSENT AND UNRECOGNISED STAY DIFFERENT, which is why this is a `preprocess` and not a
  // `.catch(null)`. An ABSENT origin is the units-only declaration and reads as null; an
  // origin WORD this reader does not know still REJECTS the whole document — "a declaration this
  // reader cannot understand is no claim at all" — because coercing it to null would quietly accept
  // a file written by a version whose meaning we cannot vouch for.
  origin: z.preprocess((v) => (v === undefined ? null : v), z.enum(["human", "cut"]).nullable()),
  // `.catch(null)` covers BOTH an absent key and a value of the wrong shape, in one place: an
  // unusable rider must degrade to "not stated" without ever rejecting the ORIGIN, which is the
  // part that matters. The same rule `TraceLineDoc` follows for `grade` and `slot`.
  cutBy: z.string().min(1).nullable().catch(null),
  cutFor: z.string().min(1).nullable().catch(null),
  /**
   * THE UNITS THIS SESSION CLAIMED (ADR-0541 D2) — written by `noticeboard declare` at the moment
   * it claims, so the arc a session was working on becomes a RECORDED FACT rather than a derived one.
   *
   * A SECOND FIELD BESIDE `cutFor`, not a widening of it, because the two are different evidence.
   * `cutFor` is provenance — "the unit I was CUT to drive" — and the `traversal origin` verb's rules
   * about it (ADR-0487 clause 1) are explicitly untouched, including its refusal to hang cut riders
   * on a `human` origin. This is activity: "the units I claimed", recorded whatever the origin. They
   * meet at the trace line, where {@link resolveSessionUnits} unions them into the one plural rider a
   * reader sees — which is the level ADR-0541's annotation on ADR-0487 describes.
   *
   * `.catch([])` on the same rule as the riders above: every declaration written before this landed
   * has no such key, and an unusable value must degrade to "claimed nothing" rather than reject the
   * whole document and un-declare a session's origin.
   */
  units: z.array(z.string().min(1)).catch([]),
  /** When the session declared. Read by the `traversal origin` render, never by the resolution. */
  declaredAt: z.string().min(1).nullable().catch(null),
});

export type SessionOriginDeclaration = z.infer<typeof SessionOriginDeclarationDoc>;

/** Parse a declaration read off disk, or null when it is not one this reader understands. */
export function parseSessionOriginDeclaration(value: unknown): SessionOriginDeclaration | null {
  const parsed = SessionOriginDeclarationDoc.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export interface SessionOriginInput {
  /** The invocation's environment. Injected, never read ambiently, so this module stays pure. */
  readonly env: Readonly<Record<string, string | undefined>>;
  /** This session's own persisted declaration, or null when it has never written one. */
  readonly declaration: SessionOriginDeclaration | null;
}

function trimmedEnv(env: SessionOriginInput["env"], name: string): string | null {
  const value = env[name];
  if (value === undefined) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Assemble an origin from an established claim, dropping the riders a `human` origin cannot carry.
 *
 * A human-started session was cut by nobody and for nothing, so carrying either value through would
 * put a field on the row that a reader could quote back as a cut.
 */
function originOf(
  kind: SessionOriginKind,
  cutBy: string | null,
  cutFor: string | null,
): SessionOrigin {
  return kind === "human" ? { kind, cutBy: null, cutFor: null } : { kind, cutBy, cutFor };
}

/**
 * Resolve how this session came to exist, or null to record nothing.
 *
 * ⚠ PRECEDENCE: THE DECLARATION WINS, and the reason is precision rather than recency. The
 * declaration file is keyed by THIS SESSION'S OWN ID, so it cannot belong to another window; the
 * environment is not, and an exported `STORYTREE_CUT_BY` outlives the shell that set it and is
 * inherited by every process started under it. Between two claims, the one that names whose claim
 * it is wins.
 *
 * Null is the ordinary outcome and never an error — an undeclared session is uninstrumented for this
 * question, exactly as a null identity leaves an invocation uncaptured.
 */
export function resolveSessionOrigin(input: SessionOriginInput): SessionOrigin | null {
  const declared = input.declaration;
  // ⚠ A declaration with a NULL origin states no origin and therefore wins NOTHING here (ADR-0541
  // D2): it is the file a session writes when it CLAIMS WORK, which says what it is working on and
  // nothing about how it came to exist. Letting it short-circuit would mean claiming work silently
  // un-declared an origin the environment had established — a claim erasing a claim.
  if (declared !== null && declared.origin !== null) {
    return originOf(declared.origin, declared.cutBy, declared.cutFor);
  }

  const word = trimmedEnv(input.env, SESSION_ORIGIN_ENV);
  const cutBy = trimmedEnv(input.env, CUT_BY_SESSION_ENV);
  const cutFor = trimmedEnv(input.env, CUT_FOR_UNIT_ENV);

  if (word === "human") return originOf("human", null, null);
  // An unrecognised word falls through to the cutter rather than resolving: it states nothing this
  // module may vouch for, and a session that named its cutter has still made a claim.
  if (word === "cut" || cutBy !== null) return originOf("cut", cutBy, cutFor);
  return null;
}

/**
 * WHY A DECLARATION REQUEST WAS REFUSED — a reason CODE, never a sentence.
 *
 * ⚠ THE RULE LIVES HERE, BESIDE THE RESOLVER WHOSE RULES IT MIRRORS. A caller declaring an origin is
 * asking the same three questions {@link resolveSessionOrigin} answers — is this word one of the two
 * origins, may a `human` origin carry cut riders, is a bare `cutFor` a claim — and the first draft of
 * this increment restated all three inside the CLI's own dispatch. Two copies of one rule drift, and
 * they drift silently: the CLI would keep refusing a combination the resolver had started accepting,
 * or worse, accept one it had stopped. So the decision is one function, and the operator-facing
 * SENTENCE for each code is the CLI's own business.
 */
export type OriginDeclarationRefusal =
  | "origin-word-unknown"
  | "human-carries-no-cut-riders"
  | "cut-for-alone-declares-nothing"
  | "nothing-to-declare";

/** What a caller asked to declare, before any of it has been judged. */
export interface OriginDeclarationRequest {
  readonly origin?: string | undefined;
  readonly cutBy?: string | undefined;
  readonly cutFor?: string | undefined;
}

/**
 * ⚠ THE VERB'S DECLARATION ALWAYS STATES AN ORIGIN, and the type says so. The persisted document's
 * `origin` is nullable since ADR-0541 D2 — a session that only CLAIMS WORK writes one with no origin
 * — but this outcome is the operator-run verb's, whose whole job is to establish one; every path
 * that cannot is a refusal. Narrowing it here means a render of this result never has to handle a
 * null it cannot receive, and never has to invent a word for it.
 */
export type OriginDeclarationOutcome =
  | { readonly declaration: SessionOriginDeclaration & { readonly origin: SessionOriginKind } }
  | { readonly refusedBecause: OriginDeclarationRefusal };

/**
 * Judge a declaration request: the document to persist, or the reason it cannot be one.
 *
 * REFUSING RATHER THAN SILENTLY NARROWING is the whole point. A dropped `--cut-for` would leave the
 * operator believing they had recorded a unit they had not, and the trace would then disagree with
 * the person who wrote it — which on this attribute is the same class of harm as a guessed origin.
 */
export function declareSessionOrigin(
  request: OriginDeclarationRequest,
  declaredAt: string,
  existing: SessionOriginDeclaration | null = null,
): OriginDeclarationOutcome {
  const word = request.origin;
  const cutBy = request.cutBy ?? null;
  const cutFor = request.cutFor ?? null;
  // ⚠ THE CLAIMED UNITS SURVIVE A RE-DECLARATION, and that is why `existing` is a parameter of the
  // JUDGE rather than something the caller stitches on afterwards (ADR-0541 D2). Re-declaring an
  // origin corrects the ORIGIN; it says nothing about the work the session claimed, and the write is
  // a whole-file replace — so a caller that assembled the document itself would silently delete the
  // units on the next `traversal origin` run. There is one way to build this document, and it cannot
  // lose them.
  const units = existing?.units ?? [];

  if (word !== undefined && word !== "human" && word !== "cut") {
    return { refusedBecause: "origin-word-unknown" };
  }
  if (word === "human" && (cutBy !== null || cutFor !== null)) {
    return { refusedBecause: "human-carries-no-cut-riders" };
  }
  if (word === "human") {
    return { declaration: { v: 1, origin: "human", cutBy: null, cutFor: null, units, declaredAt } };
  }
  // The resolver's own rule, not a second one: naming a cutter IS the claim, so the origin word is
  // not required beside it.
  if (word === "cut" || cutBy !== null) {
    return { declaration: { v: 1, origin: "cut", cutBy, cutFor, units, declaredAt } };
  }
  if (cutFor !== null) return { refusedBecause: "cut-for-alone-declares-nothing" };
  return { refusedBecause: "nothing-to-declare" };
}

/**
 * THE DECLARATION A SESSION WRITES WHEN IT CLAIMS WORK — `noticeboard declare`'s automatic channel
 * (ADR-0541 D2), the sibling of the operator-run {@link declareSessionOrigin} above.
 *
 * ⚠ IT TOUCHES THE ORIGIN HALF NOT AT ALL, and that is the decision. Claiming work is not a claim of
 * origin: a session that claims `map-arc-inc-01` has said what it is DOING, not how it came to
 * exist, and stamping an origin here would be exactly the inference ADR-0484 D7 exists to refuse —
 * arriving through a back door, on a path nobody would think to read as a provenance claim. An
 * undeclared session that claims work therefore stays `unknown` for origin and gains a unit.
 *
 * UNITS ACCUMULATE rather than replace, because a session claims over its lifetime: it declares one
 * capability, then another, and both are true of the trace. First-seen order, deduped, blanks
 * dropped — the {@link foldSessionOrigin} rule, applied to the write side.
 *
 * Returns `null` when there is NOTHING NEW to record — no usable unit, or every unit already
 * present. A null is what lets the caller skip the write entirely, so a declare that re-states an
 * existing claim does not rewrite the file (and, more importantly, does not restamp `declaredAt`
 * over the moment the session actually first said this).
 */
export function withClaimedUnits(
  existing: SessionOriginDeclaration | null,
  units: readonly string[],
  declaredAt: string,
): SessionOriginDeclaration | null {
  const merged = [...(existing?.units ?? [])];
  let added = false;
  for (const unit of units) {
    const trimmed = unit.trim();
    if (trimmed.length === 0 || merged.includes(trimmed)) continue;
    merged.push(trimmed);
    added = true;
  }
  if (!added) return null;
  return {
    v: 1,
    origin: existing?.origin ?? null,
    cutBy: existing?.cutBy ?? null,
    cutFor: existing?.cutFor ?? null,
    units: merged,
    declaredAt: existing?.declaredAt ?? declaredAt,
  };
}

/**
 * What a READ trace's lines say about the session's origin — stated by a render rather than left to
 * a reader to infer from which fields happen to be present.
 *
 * `unknown` is the honest answer for every trace written before this existed and for every session
 * that never declared. It is NOT a synonym for `human`, and no consumer may treat it as one.
 */
export type SessionOriginReading = SessionOriginKind | "unknown" | "mixed";

/**
 * One usable line or row's origin attributes, as its reader found them.
 *
 * Shaped for the FOLD rather than for storage: both the JSONL reader and the Postgres reader build
 * these while walking the lines they actually used, then fold once. A skipped line vouches for
 * nothing and contributes none.
 */
export interface SessionOriginClaim {
  readonly origin: SessionOriginKind | undefined;
  /**
   * The two riders arrive UNJUDGED — `unknown`, not `string | null`.
   *
   * Both readers hand over whatever their storage gave them (a JSONL line's parsed field, a
   * database column), and {@link foldSessionOrigin} is the ONE place that decides what names
   * somebody. A reader that pre-filtered would be applying the same rule a second time, in a place
   * no test of the fold can reach.
   */
  readonly cutBy: unknown;
  readonly cutFor: unknown;
}

/** What a whole trace says about its session's origin. */
export interface TraceOriginReading {
  readonly reading: SessionOriginReading;
  /** Every distinct session named as this one's cutter, in first-seen order. */
  readonly cutBy: readonly string[];
  /** Every distinct arc/increment this session was declared cut to drive, in first-seen order. */
  readonly cutFor: readonly string[];
}

/**
 * Classify the origin claims a trace's lines carry.
 *
 * ⚠ AN UNDECLARED LINE IS NOT A COMPETING CLAIM, and that is where this deliberately DIFFERS from
 * {@link classifyTraceIdentity}. There, an ungraded line is a positive fact — it was written by the
 * slot-era writer — so a trace holding both grades and blanks is genuinely `mixed`. Here a blank
 * says only "not declared yet", and a session that declares at minute ten was cut at minute zero:
 * counting its earlier lines against it would render nearly every declared session `mixed`, which
 * is noise rather than a finding. So absence is skipped, and `mixed` is reserved for the one shape
 * that really is contradictory — lines claiming BOTH a human start and an agent cut.
 */
export function classifySessionOrigin(
  claims: readonly (SessionOriginKind | undefined)[],
): SessionOriginReading {
  const seen = new Set<SessionOriginKind>();
  for (const claim of claims) {
    if (claim !== undefined) seen.add(claim);
  }
  if (seen.size === 0) return "unknown";
  if (seen.size > 1) return "mixed";
  return seen.has("cut") ? "cut" : "human";
}

/**
 * Fold a trace's per-line origin claims into the one reading a render states.
 *
 * ONE FOLD, TWO BACKENDS — the JSONL reader and the Postgres reader both call this, for the same
 * reason `summarizeTraversalSession` exists: two hand-mirrored copies of "what a session's origin
 * is" would be kept honest only by a parity test, which is a fence rather than a structure.
 */
export function foldSessionOrigin(claims: readonly SessionOriginClaim[]): TraceOriginReading {
  const cutBy: string[] = [];
  const cutFor: string[] = [];
  for (const claim of claims) {
    collectNames(claim.cutBy, cutBy);
    collectNames(claim.cutFor, cutFor);
  }
  return { reading: classifySessionOrigin(claims.map((claim) => claim.origin)), cutBy, cutFor };
}

/**
 * Add whatever a rider NAMES to `into` — first-seen order, deduped.
 *
 * A rider is a NON-EMPTY string, or a LIST of them, or it names nobody: `null` (the column's own
 * absence), `""` (a caller with nothing to say) and every other shape all contribute nothing and
 * must never become an entry a reader could quote back — the rule `slots` already follows.
 *
 * ⚠ THE LIST FORM IS WHY THIS IS A FUNCTION. A session that claims SEVERAL units records several
 * (ADR-0541 D2), and one appended line carries one identity stamp — so the plural has to live inside
 * the rider itself. This is the one place that decides what names somebody, and it is shared with the
 * Postgres reader, so both backends learn the list form together or neither does. Written twice
 * inline, they would not have.
 */
function collectNames(value: unknown, into: string[]): void {
  if (typeof value === "string") {
    if (value.length > 0 && !into.includes(value)) into.push(value);
    return;
  }
  if (!Array.isArray(value)) return;
  for (const entry of value) collectNames(entry, into);
}

/**
 * THE UNITS THIS SESSION HAS NAMED — the plural rider a trace line carries (ADR-0541 D2).
 *
 * TWO SOURCES, ONE READING. The `cutFor` an established origin carries is provenance: the unit a
 * predecessor cut this session to drive. The declaration's `units` are activity: what the session
 * claimed on the ledger. They answer the same question a reader of the trace rail is asking — *what
 * was this session working on* — so they meet here, unioned, first-seen order, deduped.
 *
 * ⚠ RECORDED WHATEVER THE ORIGIN, which is the half ADR-0541 D2 moves. Before it, the unit rode an
 * established `cut` origin and was dropped without one — so a human-started session that claimed
 * real work recorded nothing, and 20% of the September population would have read as unknown while
 * being perfectly well known. The units no longer wait for an origin to exist.
 */
export function resolveSessionUnits(input: {
  readonly origin: SessionOrigin | null;
  readonly declaration: SessionOriginDeclaration | null;
}): readonly string[] {
  const units: string[] = [];
  collectNames(input.origin?.cutFor, units);
  collectNames(input.declaration?.units, units);
  return units;
}

/**
 * The value a trace line's `cutFor` rider is stamped with for a given unit list, or null to stamp
 * nothing.
 *
 * ONE UNIT STAYS A BARE STRING, and that is deliberate rather than an optimisation: it keeps the
 * bytes of the overwhelmingly common case identical to every line written before ADR-0541, so a
 * reader that has not learned the list form still reads them, and the shared store's single-valued
 * `cut_for` column still receives them. The list form appears only where a single value genuinely
 * cannot carry the fact.
 */
export function lineCutFor(units: readonly string[]): string | readonly string[] | null {
  if (units.length === 0) return null;
  return units.length === 1 ? (units[0] ?? null) : units;
}

/** One line saying what a reading means, for the replay and index renders. */
export function describeSessionOrigin(reading: SessionOriginReading): string {
  switch (reading) {
    case "human":
      return "started by an operator — its first reads follow a human prompt";
    case "cut":
      return "cut by a predecessor SESSION — its first reads follow an agent-authored handover, not an operator instruction, so a read here is not evidence of what the owner asked for";
    case "unknown":
      return "UNRECORDED — this session never declared how it started. NOT a synonym for human-started: reading it as one restores the assumption ADR-0484 D7 removed, and in the direction that reads as reassuring";
    case "mixed":
      return "CONTRADICTORY — this session's lines claim BOTH a human start and an agent cut; neither may be quoted as its origin";
  }
}

// ---------------------------------------------------------------------------
// The coverage reading (ADR-0487)
// ---------------------------------------------------------------------------

/** How many sessions say what about their own origin. Counts partition the population exactly. */
export interface SessionOriginCensus {
  readonly total: number;
  readonly human: number;
  readonly cut: number;
  readonly unknown: number;
  readonly mixed: number;
  /**
   * The share of sessions carrying a QUOTABLE origin — `(human + cut) / total`, and `0` for an empty
   * population rather than a division by zero. `mixed` is excluded on purpose: those sessions did
   * state something, but nothing a reader may quote, so counting them here would inflate exactly the
   * figure this census exists to keep honest.
   */
  readonly quotableShare: number;
}

/**
 * Fold a population of per-session readings into a coverage census (ADR-0487 deliverable 3).
 *
 * ⚠ THIS IS A READING, NOT A COMPLIANCE GRADE, and the distinction is load-bearing rather than
 * decorative. Its purpose is to make the PARTIALITY of origin coverage visible in the data instead
 * of assumed away: any figure computed over origins is computed over the declared subset, and
 * without this number a reader cannot tell how big that subset is. It is deliberately not a gate
 * rung — a compliance gate over a judgment ceremony manufactures the very theatre
 * `a-compliance-gate-turns-a-judgment-ceremony-into-theatre` names, and it could not score the
 * honest case (a session that simply never ran the verb) as anything but a failure.
 *
 * `unknown` is counted, never subtracted or defaulted. It is the honest majority for as long as the
 * pre-declaration history is in the population, and quietly dropping it would restore the reassuring
 * reading ADR-0484 D7 removed.
 */
export function censusSessionOrigins(
  readings: readonly SessionOriginReading[],
): SessionOriginCensus {
  let human = 0;
  let cut = 0;
  let unknown = 0;
  let mixed = 0;
  for (const reading of readings) {
    if (reading === "human") human += 1;
    else if (reading === "cut") cut += 1;
    else if (reading === "mixed") mixed += 1;
    else unknown += 1;
  }
  const total = readings.length;
  return {
    total,
    human,
    cut,
    unknown,
    mixed,
    quotableShare: total === 0 ? 0 : (human + cut) / total,
  };
}

// ---------------------------------------------------------------------------
// The SessionStart ask (ADR-0487)
// ---------------------------------------------------------------------------

/** What {@link undeclaredOriginNudge} needs. Both fields are RESOLVED by the caller, never read here. */
export interface OriginNudgeInput {
  /** This session's trace identity, or null when the invocation resolves none. */
  readonly sessionId: string | null;
  /** The origin already established, by declaration or environment — null when none is. */
  readonly origin: SessionOrigin | null;
}

/**
 * THE ONE LINE THAT ASKS A SESSION FOR ITS OWN ORIGIN — the SessionStart channel (ADR-0487).
 *
 * ADR-0484 D7 built two channels and neither had a producer, so every trace since read `unknown`:
 * the environment channel needs a launcher storytree does not own (a cut is a desktop `spawn_task`
 * chip), and the declaration verb needs somebody to run it. ADR-0487 settles WHICH side is asked —
 * the SUCCESSOR, from its own side, rather than a mandated line in every cut brief.
 *
 * ⚠ WHY THE SUCCESSOR AND NOT THE CUTTER, since the CLI's own render leans the other way. Whether a
 * session was cut AT ALL is the one part it can answer for itself: it need only look at its own
 * opening — an operator's prompt, or a predecessor's brief. Only the cutter's IDENTITY is
 * genuinely unavailable, and asking the cutter for it buys the difference between "usually" and
 * "always", because a brief already names its predecessor for unrelated reasons. The decisive half
 * is arithmetic rather than taste: a cutter-side mandate can only ever produce `cut` labels, so
 * `unknown` keeps conflating human-started with undeclared-cut and the SHARE ADR-0484 D7 exists to
 * measure has no denominator. Asking every session yields both populations.
 *
 * SILENT ONCE ANSWERED, and silent where there is nothing to answer. A session that has already
 * declared — or whose launcher set the environment — costs no line, so this is a question asked
 * until it is answered rather than a standing tax on every start. A session resolving NO trace
 * identity (the primary checkout, CI, the lobby) is not asked at all, because those are exactly the
 * runs that capture no trace: there is no row for an origin to label.
 *
 * PURE, like its {@link undeclaredSessionNudge} sibling in `drive` and like everything else in this
 * module: no clock, no filesystem, no ambient `process.env`. The caller resolves both inputs.
 */
export function undeclaredOriginNudge(input: OriginNudgeInput): string {
  if (input.sessionId === null) return "";
  if (input.origin !== null) return "";
  return (
    `[storytree] Session "${input.sessionId}" has NOT declared its ORIGIN (ADR-0487) — so every ` +
    "line it traces reads `unknown`, which is never a synonym for human-started. You can answer " +
    "this from your own opening: an operator's prompt means `human`, a predecessor's brief means " +
    "`cut`. Declare it once, and every line from here on carries the answer: " +
    "pnpm storytree traversal origin --origin human — or, if a predecessor briefed you, " +
    "pnpm storytree traversal origin --cut-by <the session that cut you, when its brief names it> " +
    "[--cut-for <arc-or-increment-id>]. Nothing infers this, and nothing may: an origin nobody " +
    "stated stays absent rather than guessed.\n"
  );
}
