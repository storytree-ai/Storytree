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
  origin: z.enum(["human", "cut"]),
  // `.catch(null)` covers BOTH an absent key and a value of the wrong shape, in one place: an
  // unusable rider must degrade to "not stated" without ever rejecting the ORIGIN, which is the
  // part that matters. The same rule `TraceLineDoc` follows for `grade` and `slot`.
  cutBy: z.string().min(1).nullable().catch(null),
  cutFor: z.string().min(1).nullable().catch(null),
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
  if (declared !== null) return originOf(declared.origin, declared.cutBy, declared.cutFor);

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

export type OriginDeclarationOutcome =
  | { readonly declaration: SessionOriginDeclaration }
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
): OriginDeclarationOutcome {
  const word = request.origin;
  const cutBy = request.cutBy ?? null;
  const cutFor = request.cutFor ?? null;

  if (word !== undefined && word !== "human" && word !== "cut") {
    return { refusedBecause: "origin-word-unknown" };
  }
  if (word === "human" && (cutBy !== null || cutFor !== null)) {
    return { refusedBecause: "human-carries-no-cut-riders" };
  }
  if (word === "human") {
    return { declaration: { v: 1, origin: "human", cutBy: null, cutFor: null, declaredAt } };
  }
  // The resolver's own rule, not a second one: naming a cutter IS the claim, so the origin word is
  // not required beside it.
  if (word === "cut" || cutBy !== null) {
    return { declaration: { v: 1, origin: "cut", cutBy, cutFor, declaredAt } };
  }
  if (cutFor !== null) return { refusedBecause: "cut-for-alone-declares-nothing" };
  return { refusedBecause: "nothing-to-declare" };
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
    // A rider is a NON-EMPTY string or it is nothing: `null` (the column's own absence) and `""` (a
    // caller with nothing to say) both name nobody and must not become an entry a reader could
    // quote back as a cutter — the rule `slots` already follows.
    if (typeof claim.cutBy === "string" && claim.cutBy.length > 0 && !cutBy.includes(claim.cutBy)) {
      cutBy.push(claim.cutBy);
    }
    if (typeof claim.cutFor === "string" && claim.cutFor.length > 0 && !cutFor.includes(claim.cutFor)) {
      cutFor.push(claim.cutFor);
    }
  }
  return { reading: classifySessionOrigin(claims.map((claim) => claim.origin)), cutBy, cutFor };
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
