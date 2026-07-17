import type { ReliabilityGate } from "./reliability-gates.js";
import type { UatTestCriterion, UatTestCriterionWitness } from "./uat-test-criteria.js";

/**
 * ADR-0106 (amends ADR-0044 / ADR-0082 / ADR-0097): the per-test UAT witness RESOLUTION.
 *
 * A UAT leg's declared `witness` (`uat-test-criteria.ts`, ADR-0044) is a PERMISSION enum that defaults to
 * `either`. ADR-0106 demotes `either` to a transient **pre-adopt, undecided** state: the adopt
 * story-writer pass RESOLVES each leg to a concrete BINARY witness — `human` or `machine` — and an
 * adopted story has no `either` leg at rest. This module is the PURE core of that resolution: a
 * deterministic classifier (no store / clock / git / subprocess) the adopt pass (`packages/cli`) and
 * the studio surface (`apps/studio`) both call, so the binary they show can never fork.
 *
 * **The rule is ASYMMETRIC (ADR-0106 d.2), fail-closed toward the human (ADR-0040).** A leg becomes
 * `machine` ONLY on positive evidence — the author's explicit `(witness: machine)` declaration, the
 * positive assertion that a real test demonstrably covers it (trusted the way ADR-0097's `(covers:)`
 * is trusted; real coverage MEASUREMENT is named follow-on). Anything experiential ("the world *feels*
 * right", a visual/UX judgement) or any UNDECIDED (`either`) leg the pass cannot confidently back with
 * a machine check stays `human`. So `either` resolves to `human`, never silently to `machine` —
 * promoting an undecided leg to `machine` just because the story owns a suite would fail OPEN and drop
 * the human exactly as ADR-0106 warns ("a `machine` leg with nothing behind it would re-create the
 * orphan bug in reverse, going green *without* the human silently").
 *
 * **A `machine` label is a PROMISE of a real test (ADR-0106 d.2/d.3), never a bare flag — and the
 * binding is EXACT (`uat-machine-gate-resolution`).** Once a leg is declared `machine`, the classifier
 * looks up exactly `leg.proofGateId` (parsed verbatim by `uat-test-criteria.ts`'s `(proof-gate: story-id#gate-n)`
 * annotation, never inferred from ordering, title, package, or `(covers:)`) and resolves it ONLY when
 * that full id names a declared `observe` reliability gate carrying a proof command:
 *  - `observe`  — the named gate is a command-bearing `observe` gate → adopt observe-and-signs the leg
 *                 against THAT gate's exact command NOW (the cheap step, ADR-0085).
 *  - `refused`  — no binding, an unknown id, a non-observe gate, or a commandless observe gate. There is
 *                 no first-observe fallback, no ordering inference, no covers-based inference, and no
 *                 silent downgrade to `human` — a refusal is a binding defect the author must fix, not a
 *                 quiet reclassification.
 * Either way a `machine` leg only ever greens through a SIGNED verdict over a real run, never a flag.
 */

// ---------------------------------------------------------------------------
// Resolved (binary) witness
// ---------------------------------------------------------------------------

/**
 * The RESOLVED, binary witness of an adopted UAT leg (ADR-0106 d.1/d.5) — the resting state after the
 * adopt pass classifies it. `either` is NOT a member: it is the pre-adopt undecided value the classifier
 * consumes and resolves away. The owner surface is binary off this: a `human` leg shows the operator a
 * confirm affordance, a `machine` leg shows nothing (adopt/build handles it) — ADR-0106 d.5.
 */
export const RESOLVED_WITNESSES = ["human", "machine"] as const;
export type ResolvedWitnessKind = (typeof RESOLVED_WITNESSES)[number];

/**
 * For a `machine` leg, HOW resolution came out (`uat-machine-gate-resolution`):
 *  - `observe` — `leg.proofGateId` names a declared, command-bearing `observe` reliability gate →
 *                adopt observe-and-signs it now (ADR-0085 / ADR-0097, the cheap first step);
 *  - `refused` — no binding, an unknown id, a non-observe gate, or a commandless observe gate. A
 *                refusal names the defect (`reason`) — it is never a silent downgrade to `human` or
 *                to some other gate.
 */
export const WITNESS_COVERAGES = ["observe", "refused"] as const;
export type WitnessCoverage = (typeof WITNESS_COVERAGES)[number];

/**
 * The classifier's per-leg verdict. A `human` leg is left for operator attestation (the "I saw it
 * work" verdict, ADR-0082); a `machine` leg either resolves to the EXACT observe gate it is bound to
 * (carrying that gate's id and command so the adopt pass knows what to observe) or is explicitly
 * `refused` with a `reason` (`uat-machine-gate-resolution`).
 */
export type WitnessResolution =
  | { witness: "human" }
  | { witness: "machine"; coverage: "observe"; observedBy: string; proofCommand: string }
  | { witness: "machine"; coverage: "refused"; reason: string };

// ---------------------------------------------------------------------------
// The pure classifier
// ---------------------------------------------------------------------------

/** The fields of a UAT leg the classifier reads — its declared witness permission and exact proof-gate binding. */
export type ClassifierLeg = Pick<UatTestCriterion, "witness" | "proofGateId">;
/** The fields of a reliability gate the classifier reads — its id, kind, and declared proof command. */
export type ClassifierGate = Pick<ReliabilityGate, "id" | "kind" | "proofCommand">;

/**
 * PURE: resolve a UAT leg's declared `witness` into a concrete BINARY witness (ADR-0106 d.1/d.2),
 * given the story's reliability gates (so an explicit `machine` leg can be resolved against its exact
 * binding — `uat-machine-gate-resolution`).
 *
 * The asymmetric rule, fail-closed toward the human:
 *  - `human`  (explicit)   → `human` — the author declared it experiential.
 *  - `either` (UNDECIDED)  → `human` — no positive evidence to back a machine check; the conservative
 *                            resolution (ADR-0040 *when in doubt, ask the human*). NEVER promoted to
 *                            `machine` from coverage alone (that would fail open and drop the human).
 *  - `machine` (explicit)  → looks up EXACTLY `leg.proofGateId`, never the first `observe` gate found,
 *                            never by ordering, never by `(covers:)` inference:
 *      · that id names a declared, command-bearing `observe` gate → `{ observe, observedBy, proofCommand }`;
 *      · no binding, an unknown id, a non-observe gate, or a commandless observe gate → `{ refused, reason }`.
 *
 * Deterministic and total — every leg resolves, to a routing or an explicit refusal (never a silent
 * downgrade). A refusal is a binding defect the author must fix, never quietly reclassified.
 */
export function resolveWitness(
  leg: ClassifierLeg,
  gates: readonly ClassifierGate[],
): WitnessResolution {
  // Asymmetric + fail-closed: only an explicit `machine` declaration reaches the machine branch;
  // `human` and the UNDECIDED `either` both resolve to `human` (ADR-0106 d.2 / ADR-0040).
  if (leg.witness !== "machine") return { witness: "human" };

  // A declared `machine` leg is a PROMISE of a real test — resolved ONLY against its exact binding
  // (ADR-0106 d.3 / `uat-machine-gate-resolution`), never routed by coverage inference.
  const gateId = leg.proofGateId;
  if (gateId === undefined) {
    return {
      witness: "machine",
      coverage: "refused",
      reason:
        "no proof-gate binding — a machine leg must name the exact observe gate it proves against, e.g. (proof-gate: story-id#gate-n)",
    };
  }

  const bound = gates.find((g) => g.id === gateId);
  if (bound === undefined) {
    return {
      witness: "machine",
      coverage: "refused",
      reason: `bound gate "${gateId}" is not among this story's declared reliability gates`,
    };
  }

  if (bound.kind !== "observe") {
    return {
      witness: "machine",
      coverage: "refused",
      reason: `bound gate "${gateId}" is a "${bound.kind}" gate, not an observe gate — a machine leg can only bind to a command-bearing observe gate`,
    };
  }

  if (bound.proofCommand === undefined) {
    return {
      witness: "machine",
      coverage: "refused",
      reason: `bound gate "${gateId}" declares no proof command to observe`,
    };
  }

  return { witness: "machine", coverage: "observe", observedBy: bound.id, proofCommand: bound.proofCommand };
}

/**
 * PURE: the RESOLVED binary witness of a leg (ADR-0106 d.5) — the projection the studio reads to decide
 * whether to show the operator a confirm affordance. Just `resolveWitness(...).witness`, named so the UI
 * surface never re-implements the asymmetric rule (and never renders the word `either`).
 */
export function resolvedWitnessOf(
  leg: ClassifierLeg,
  gates: readonly ClassifierGate[],
): ResolvedWitnessKind {
  return resolveWitness(leg, gates).witness;
}

// ---------------------------------------------------------------------------
// The "no `either` at rest" guard (ADR-0106 d.1/d.5)
// ---------------------------------------------------------------------------

/** A leg's declared witness is still UNDECIDED (`either`) — not yet resolved by the adopt pass. */
export function isUnresolvedWitness(witness: UatTestCriterionWitness): boolean {
  return witness === "either";
}

/**
 * PURE: the UAT legs of an ADOPTED story that are still `either` at rest — the invariant violation
 * ADR-0106 d.1 forbids ("an adopted story has no `either` legs"). Returns the offending legs (empty =
 * the story is clean). The adopt pass resolves `either` away (by recording each leg's decided witness);
 * this is the read-time guard the studio / a corpus check uses to surface any leg that slipped through
 * undecided. Pure — it inspects only the declared witnesses, no store or clock.
 */
export function unresolvedUatLegs<T extends ClassifierLeg>(legs: readonly T[]): T[] {
  return legs.filter((leg) => isUnresolvedWitness(leg.witness));
}
