/**
 * ADR-0563 — THE INNER LOOP'S EXIT: an opinion may not veto an observation, and attempt three is a
 * recorded decision point.
 *
 * Measured 2026-09-08/09: a session drove one arc for 31.5 hours across **61 `--real` builds**, burned
 * 100% of a weekly subscription quota, and landed none of its target work. Four of those builds
 * reached GATE and the spine signed them correctly — red observed, green observed, 11/11 contracts
 * covered, 679–878 assertions executed. The orchestrating session then read the test BODIES, judged
 * the assertions semantically irrelevant to the contracts they named, and refused to land: *"Matching
 * 11 names is not complete proof"*.
 *
 * **It was probably right about the tests.** {@link ./contract-coverage.js} says so in its own words: a
 * test asserting something substantive but semantically irrelevant to its contract *"still reads
 * covered"*. That residue is real and known. **But the remedy for it was already decided, and it is not
 * this one.** ADR-0447 made test strength a second axis measured MECHANICALLY — mutation testing — and
 * explicitly superseded the plan naming an LLM judge as the answer, because *"a killed mutant is an
 * observation, where a model judging a model's test is an opinion sharing the failure mode it judges."*
 *
 * **An observation can be satisfied; an opinion cannot.** Each rejection sent the session back to raise
 * the acceptance bar it had itself written — one spec file rewritten 23 times in 13 hours, 894 lines
 * written to keep 189 — which made the next build likelier to fail the same audit. There was no state
 * the work could reach that the auditor was obliged to accept. **That is the whole mechanism of the
 * unbounded loop**, and it sits upstream of the leaf: fixing the leaf would have made each lap cheaper
 * and more likely to pass, and the laps would have continued.
 *
 * This module is the deterministic RULER for both halves of the exit. It is the same Layer boundary
 * {@link ./decision-sweep.js} draws: the ORCHESTRATOR supplies the judgement (its objection, its
 * attempt history, whether the mutation rung reaches the package), and the spine supplies the rule
 * that says whether that judgement is admissible. It invents no objections and reads no store / git /
 * clock / network, so the whole adjudication is offline-testable.
 *
 * **Why reachability is INJECTED rather than computed here.** The mutation rung's reach is
 * `runnerFor` in `packages/cli/src/mutation-diff.ts`, and `@storytree/cli` depends on this package,
 * not the other way round. Computing it here would invert the dependency; the caller reads it from
 * the one classifier that owns it and passes the answer in, so the two can never disagree about the
 * same project.
 */

// ── D1/D2/D3 — the veto rule ────────────────────────────────────────────────────────────────────

/**
 * Why the orchestrator wants to refuse to land a verdict the spine already signed. The kind is the
 * whole decision: two of the three are OBSERVATIONS that can be satisfied, and one is an OPINION that
 * cannot.
 */
export type ObjectionKind =
  /**
   * *"These assertions do not really prove the contract they name."* An OPINION — the agent's own
   * reading of the test bodies, sharing the failure mode it judges (ADR-0447). Inadmissible as a veto
   * by ADR-0563 D1; it routes to the mutation rung instead, which can settle it.
   */
  | "test-quality"
  /**
   * The authored content breaks a standing decision. CHECKABLE against written text rather than
   * judged, which is the entire reason ADR-0563 D2 admits it. Not hypothetical: one rejection in the
   * 2026-09 run correctly caught the leaf granting itself shell proof-feedback against ADR-0232 D5.
   */
  | "rule-violation"
  /**
   * The mutation rung ran and mutants SURVIVED. An OBSERVATION — the instrument ADR-0447 designated,
   * speaking. It fully justifies further work, and unlike an opinion it can be satisfied.
   */
  | "surviving-mutants";

/** The orchestrator's stated reason for not wanting to land, as plain injected data. */
export interface LandingObjection {
  readonly kind: ObjectionKind;
  /** The objection stated plainly, in the orchestrator's own words. Carried onto the adjudication. */
  readonly statement: string;
  /**
   * REQUIRED for `rule-violation`: the standing decision the authored content breaks (`ADR-0232 D5`).
   * Absent or blank makes the objection an opinion wearing a rule's clothes, and it is refused —
   * naming the rule is what makes this exception checkable rather than another judgement call.
   */
  readonly decision?: string;
  /**
   * REQUIRED for `surviving-mutants`: how many survived. Zero is the rung REPORTING A PASS, so a
   * zero-survivor objection is no objection at all (ADR-0563 D1: *"none surviving means land it"*).
   */
  readonly survivors?: number;
}

/** Everything {@link adjudicateLanding} reads — injected, so the adjudication is pure and offline. */
export interface AdjudicateLandingSpec {
  /** The unit whose landing is being adjudicated, carried onto the result. */
  readonly unitId: string;
  /** True iff the spine SIGNED a verdict for this unit (`hasSignedVerdict` in {@link ./rollup.js}). */
  readonly signed: boolean;
  /** The orchestrator's objection, when it has one. Absent = it is content to land. */
  readonly objection?: LandingObjection;
  /**
   * Can the mutation rung reach the package this unit's code lands in? Read from `runnerFor` by the
   * caller (see the module note). `false` today for `packages/orchestrator` alone, which is precisely
   * where the 2026-09 run's every line of production code lived — the gap announced itself on all 61
   * builds as `NARROWED:` and nobody acted on it.
   */
  readonly strengthSignalAvailable: boolean;
}

/** What the orchestrator must do with the verdict. */
export type LandingDisposition =
  /** Land it; nothing is owed. */
  | "land"
  /** Land it, and route the suspicion to the mutation rung — the instrument that can settle it (D1). */
  | "land-and-measure"
  /** Land it, and DECLARE the gap: no strength signal exists here, so the suspicion has nowhere to go (D3). */
  | "land-and-declare-gap"
  /** An observation justifies further work on this unit. */
  | "rework"
  /** The one admissible veto: the authored content breaks a named standing decision (D2). */
  | "refuse"
  /** No signed verdict, so there is nothing to land or veto — the attempt policy governs instead. */
  | "not-signed";

/** The adjudication of one landing. */
export interface LandingAdjudication {
  readonly unitId: string;
  readonly disposition: LandingDisposition;
  /**
   * May the orchestrator refuse to land? True ONLY for an admissible rule violation (D2) or a real
   * surviving-mutant observation. Never true on the orchestrator's own reading of the tests.
   */
  readonly mayRefuse: boolean;
  /**
   * Is an owner escalation owed? True when the orchestrator suspects the tests in a package the
   * mutation rung cannot reach — D3's *"escalate; never self-audit"*. Enforcing an existing decision
   * (D2) creates no owner question, so a rule violation never sets this.
   */
  readonly escalates: boolean;
  /** Why, in the orchestrator's own words where it supplied them, else the rule that decided it. */
  readonly reason: string;
  /** Set iff an objection was REJECTED as inadmissible: which rule refused it, and why. */
  readonly inadmissible?: string;
}

/** True iff `s` carries something other than whitespace. */
function stated(s: string | undefined): boolean {
  return (s ?? "").trim().length > 0;
}

/**
 * PURE: adjudicate one landing against ADR-0563 D1–D3 — the single deterministic home of *"is this
 * refusal admissible?"*.
 *
 * D1 alone would have ended the 2026-09 run at its FIRST rejection rather than its sixty-first build.
 * Note what it does NOT do: the suspicion is never discarded, only re-routed. A `test-quality`
 * objection becomes a measurement where one is available and an ESCALATION where none is — what it
 * may never become is a veto the authoring session settles by itself.
 */
export function adjudicateLanding(spec: AdjudicateLandingSpec): LandingAdjudication {
  const { unitId, signed, objection, strengthSignalAvailable } = spec;

  if (!signed) {
    return {
      unitId,
      disposition: "not-signed",
      mayRefuse: false,
      escalates: false,
      reason: "no signed verdict for this unit — the attempt policy governs, not the veto rule",
    };
  }

  if (objection === undefined) {
    return {
      unitId,
      disposition: "land",
      mayRefuse: false,
      escalates: false,
      reason: "the spine signed a verdict and the orchestrator raised no objection",
    };
  }

  if (objection.kind === "rule-violation") {
    // The exception is admissible only because it is CHECKABLE. An objection naming no decision is
    // not checkable, so it is exactly the judgement D1 forbids and falls through to that branch.
    if (stated(objection.decision)) {
      return {
        unitId,
        disposition: "refuse",
        mayRefuse: true,
        escalates: false,
        reason: `the authored content breaks ${(objection.decision ?? "").trim()}: ${objection.statement} — refusing enforces an existing decision and creates no owner question (ADR-0563 D2)`,
      };
    }
    return inadmissibleOpinion(
      unitId,
      objection,
      strengthSignalAvailable,
      "a rule-violation objection that names no standing decision is an opinion wearing a rule's clothes (ADR-0563 D2) — name the decision, or route it as a test-quality suspicion (ADR-0563 D1)",
    );
  }

  if (objection.kind === "surviving-mutants") {
    const survivors = objection.survivors ?? 0;
    if (survivors > 0) {
      return {
        unitId,
        disposition: "rework",
        mayRefuse: true,
        escalates: false,
        reason: `${survivors} mutant(s) survived: ${objection.statement} — an observation, and it fully justifies further work (ADR-0563 D1)`,
      };
    }
    return {
      unitId,
      disposition: "land",
      mayRefuse: false,
      escalates: false,
      reason: "the mutation rung ran and no mutant survived — ADR-0563 D1: none surviving means land it",
      inadmissible:
        "no mutant survived, so this is the rung reporting a PASS rather than an objection (ADR-0563 D1)",
    };
  }

  return inadmissibleOpinion(
    unitId,
    objection,
    strengthSignalAvailable,
    "ADR-0563 D1: the orchestrator may not refuse to land a signed verdict on its own reading of the authored tests — a model judging a model's test is an opinion sharing the failure mode it judges (ADR-0447)",
  );
}

/**
 * The landing of every inadmissible objection: the verdict LANDS, and the suspicion is re-routed
 * rather than dropped — to the mutation rung where it can reach, and to the OWNER where it cannot
 * (ADR-0563 D3, which is what converts `packages/orchestrator`'s known blind spot from a silent gap
 * into an escalation trigger).
 */
function inadmissibleOpinion(
  unitId: string,
  objection: LandingObjection,
  strengthSignalAvailable: boolean,
  inadmissible: string,
): LandingAdjudication {
  return strengthSignalAvailable
    ? {
        unitId,
        disposition: "land-and-measure",
        mayRefuse: false,
        escalates: false,
        reason: `landing the signed verdict; the suspicion "${objection.statement}" routes to the mutation rung, whose surviving mutants would be an observation`,
        inadmissible,
      }
    : {
        unitId,
        disposition: "land-and-declare-gap",
        mayRefuse: false,
        escalates: true,
        reason: `landing the signed verdict and DECLARING the gap: the mutation rung cannot reach this package, so the suspicion "${objection.statement}" has no instrument — it goes to the owner, never to self-audit (ADR-0563 D3)`,
        inadmissible,
      };
}

// ── D4/D5 — the attempt policy ──────────────────────────────────────────────────────────────────

/**
 * The consecutive-failure count at which the orchestrator STOPS and decides, rather than launching a
 * silent fourth run. Three is the owner's number, directed in conversation on 2026-09-12: *"i think 3
 * attempts then orchestrator makes a call on if n more attempts should be given."*
 */
export const ATTEMPT_DECISION_POINT = 3;

/**
 * The consecutive-failure count above which the call is no longer the orchestrator's to make.
 * ADR-0563 D4 requires a ceiling and deliberately leaves the number to implementation, so this is
 * **two decision points**: the orchestrator grants one extension itself, and the second passes to the
 * owner — *"past some count the honest answer stops being 'try again' and becomes 'this unit is
 * wrong', which is not the orchestrator's call to make."* For scale, the run that forced this
 * decision reached 21 attempts on a single unit.
 */
export const ATTEMPT_CEILING = ATTEMPT_DECISION_POINT * 2;

/** One attempt at driving a unit to a signed verdict. */
export interface AttemptRecord {
  /**
   * The increment this attempt was made under. ADR-0563 D5: a retry is NOT a new unit of decided
   * work, so every attempt on one unit must carry ONE increment id. The 2026-09 run minted 72,
   * `…-ninth-plan` through `…-nineteenth-plan`, which falsified the arc's own log and — through the
   * board — the owner's reading of progress.
   */
  readonly incrementId: string;
  /** True iff the spine signed a verdict on this attempt. */
  readonly signed: boolean;
}

/**
 * What is DIFFERENT about the attempts being granted. The kinds are the whole point of D4: three of
 * them name something that actually changed, and one names the ratchet that produced the 31.5-hour
 * run.
 */
export type AttemptDifferenceKind =
  /** A different input reaches the unit. */
  | "changed-input"
  /** A defect was found and fixed — the next attempt runs against different code. */
  | "fixed-defect"
  /** A new observation exists: surviving mutants, a captured failure, a measurement. */
  | "new-observation"
  /** A test-authoring leaf revised the test (ADR-0563 D6). Consumes one of the granted attempts. */
  | "revised-test"
  /**
   * NOT a difference. *"A better spec"* is the acceptance bar being raised by the same session that
   * will then fail it — the ratchet D1 forbids, wearing another hat. ADR-0563 D4 names it explicitly.
   */
  | "better-spec";

/** The orchestrator's recorded decision to grant further attempts. */
export interface AttemptGrant {
  /** How many further attempts are granted. Must be at least one. */
  readonly attempts: number;
  /** Which kind of difference this grant rests on. */
  readonly kind: AttemptDifferenceKind;
  /** What will be different, stated plainly. Blank is refused — the RECORDING is the decision. */
  readonly difference: string;
}

/** Everything {@link decideAttempt} reads — injected, so the policy is pure and offline. */
export interface AttemptPolicySpec {
  readonly unitId: string;
  /** Every attempt on this unit so far, OLDEST FIRST. */
  readonly attempts: readonly AttemptRecord[];
  /** The grant the orchestrator is recording, when it is deciding whether to continue past a decision point. */
  readonly grant?: AttemptGrant;
}

/** What the orchestrator must do about attempting this unit again. */
export type AttemptDisposition =
  /** Below the decision point — keep going. */
  | "proceed"
  /** AT or past the decision point with no recorded grant — STOP and decide (D4). */
  | "stop-and-decide"
  /** A grant resting on a real difference — proceed for that many more. */
  | "granted"
  /** A grant that names no real difference — refused, because granting it is the ratchet itself. */
  | "refused"
  /** Above the ceiling — the call is the owner's. */
  | "escalate"
  /** The spine signed a verdict — the loop is OVER, and the veto rule governs from here. */
  | "signed";

/** The attempt policy's decision for one unit. */
export interface AttemptDecision {
  readonly unitId: string;
  readonly disposition: AttemptDisposition;
  /** Consecutive failures counted back from the MOST RECENT attempt; a signed attempt resets it. */
  readonly consecutiveFailures: number;
  /** How many more failures before the decision point. Zero once it is reached. */
  readonly remainingBeforeDecision: number;
  /** The attempts actually granted — `0` unless the disposition is `granted`. */
  readonly granted: number;
  /**
   * ADR-0563 D5: true iff the attempts on this unit span MORE THAN ONE increment, i.e. a retry minted
   * a fresh row instead of reusing its own. A separate finding, deliberately: it never changes the
   * disposition, because the honest answer to "may I attempt again?" does not depend on the
   * bookkeeping error, and folding them would let one mask the other.
   */
  readonly mintedPerAttempt: boolean;
  /** The distinct increment ids seen across the attempts, in first-seen order. */
  readonly increments: readonly string[];
  /** The rule that decided it, including the D5 finding when one fired. */
  readonly reason: string;
}

/**
 * PURE: decide whether a unit may be attempted again (ADR-0563 D4), and report whether its retries
 * reused their increment (D5).
 *
 * The decision point RECURS: past three consecutive failures, every further attempt needs a recorded
 * grant, so arriving at four with nothing recorded stops the loop exactly as arriving at three does.
 * That is fail-closed on purpose — the failure this encodes was a session that never stopped at all.
 */
export function decideAttempt(spec: AttemptPolicySpec): AttemptDecision {
  const { unitId, attempts, grant } = spec;

  const increments: string[] = [];
  for (const a of attempts) if (!increments.includes(a.incrementId)) increments.push(a.incrementId);
  const mintedPerAttempt = increments.length > 1;
  const d5 = mintedPerAttempt
    ? ` — ⚠ these attempts span ${increments.length} increments; ADR-0563 D5: a retry is not a new unit of decided work and must reuse its own increment`
    : "";

  const decide = (
    disposition: AttemptDisposition,
    consecutiveFailures: number,
    granted: number,
    reason: string,
  ): AttemptDecision => ({
    unitId,
    disposition,
    consecutiveFailures,
    remainingBeforeDecision: Math.max(0, ATTEMPT_DECISION_POINT - consecutiveFailures),
    granted,
    mintedPerAttempt,
    increments,
    reason: `${reason}${d5}`,
  });

  const last = attempts[attempts.length - 1];
  if (last?.signed === true) {
    return decide("signed", 0, 0, "the spine signed a verdict — the loop is over; the veto rule governs from here");
  }

  let consecutiveFailures = 0;
  for (let i = attempts.length - 1; i >= 0; i--) {
    if (attempts[i]?.signed === true) break;
    consecutiveFailures++;
  }

  if (consecutiveFailures >= ATTEMPT_CEILING) {
    return decide(
      "escalate",
      consecutiveFailures,
      0,
      `${consecutiveFailures} consecutive failures is at or above the ceiling of ${ATTEMPT_CEILING} — the call passes to the owner, because past some count the honest answer stops being "try again" and becomes "this unit is wrong" (ADR-0563 D4)`,
    );
  }

  if (consecutiveFailures < ATTEMPT_DECISION_POINT) {
    return decide(
      "proceed",
      consecutiveFailures,
      0,
      `${consecutiveFailures} consecutive failure(s), below the decision point of ${ATTEMPT_DECISION_POINT}`,
    );
  }

  if (grant === undefined) {
    return decide(
      "stop-and-decide",
      consecutiveFailures,
      0,
      `${consecutiveFailures} consecutive failures with no signed verdict — STOP and decide whether to grant N more, RECORDING what will be different about them (ADR-0563 D4)`,
    );
  }

  if (grant.kind === "better-spec") {
    return decide(
      "refused",
      consecutiveFailures,
      0,
      `"a better spec" does not count as different (ADR-0563 D4) — it is the acceptance ratchet D1 forbids, wearing another hat: the same session raises the bar it will then fail`,
    );
  }

  if (!stated(grant.difference)) {
    return decide(
      "refused",
      consecutiveFailures,
      0,
      "the grant states no difference — D4 requires RECORDING what will be different about the further attempts, and the recording IS the decision",
    );
  }

  if (!Number.isInteger(grant.attempts) || grant.attempts < 1) {
    return decide(
      "refused",
      consecutiveFailures,
      0,
      `a grant of ${grant.attempts} attempt(s) grants nothing — state a whole number of further attempts, or stop`,
    );
  }

  return decide(
    "granted",
    consecutiveFailures,
    grant.attempts,
    `${grant.attempts} further attempt(s) granted on a recorded difference (${grant.kind}): ${grant.difference.trim()}`,
  );
}
