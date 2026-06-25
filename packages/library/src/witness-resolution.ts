import type { ReliabilityGate } from "./reliability-gates.js";
import type { UatTest, UatTestWitness } from "./uat-tests.js";

/**
 * ADR-0106 (amends ADR-0044 / ADR-0082 / ADR-0097): the per-test UAT witness RESOLUTION.
 *
 * A UAT leg's declared `witness` (`uat-tests.ts`, ADR-0044) is a PERMISSION enum that defaults to
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
 * **A `machine` label is a PROMISE of a real test (ADR-0106 d.2/d.3), never a bare flag.** Once a leg
 * is declared `machine`, the classifier ROUTES it — it never greens it:
 *  - `observe`     — the story already declares an `observe` reliability gate (an existing green suite,
 *                    ADR-0085); adopt observe-and-signs the leg against that suite NOW (the cheap step).
 *  - `build-tests` — no existing suite covers it yet; the leg becomes a `build-tests` obligation the
 *                    Build step authors red→green later (ADR-0098). It stays UNPROVEN (no verdict) until
 *                    then, so it holds the crown at `proposed` — it can never green without a real test.
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
 * For a `machine` leg, HOW its promised real test is supplied (ADR-0106 d.3):
 *  - `observe`     — an existing `observe` reliability-gate suite already covers it → adopt
 *                    observe-and-signs it now (ADR-0085 / ADR-0097, the cheap first step);
 *  - `build-tests` — no existing suite covers it → the Build step authors the test red→green
 *                    (ADR-0098); the leg stays unproven until then.
 */
export const WITNESS_COVERAGES = ["observe", "build-tests"] as const;
export type WitnessCoverage = (typeof WITNESS_COVERAGES)[number];

/**
 * The classifier's per-leg verdict. A `human` leg is left for operator attestation (the "I saw it
 * work" verdict, ADR-0082); a `machine` leg is routed to adopt-now (`observe`, carrying the covering
 * gate's id so the adopt pass knows which suite to observe) or defer-to-Build (`build-tests`).
 */
export type WitnessResolution =
  | { witness: "human" }
  | { witness: "machine"; coverage: "observe"; observedBy: string }
  | { witness: "machine"; coverage: "build-tests" };

// ---------------------------------------------------------------------------
// The pure classifier
// ---------------------------------------------------------------------------

/** The fields of a UAT leg the classifier reads — only its declared witness permission. */
export type ClassifierLeg = Pick<UatTest, "witness">;
/** The fields of a reliability gate the classifier reads — its id and kind (to find the observe suite). */
export type ClassifierGate = Pick<ReliabilityGate, "id" | "kind">;

/**
 * PURE: resolve a UAT leg's declared `witness` into a concrete BINARY witness (ADR-0106 d.1/d.2),
 * given the story's reliability gates (so a `machine` leg can be routed `observe` vs `build-tests`).
 *
 * The asymmetric rule, fail-closed toward the human:
 *  - `human`  (explicit)   → `human` — the author declared it experiential.
 *  - `either` (UNDECIDED)  → `human` — no positive evidence to back a machine check; the conservative
 *                            resolution (ADR-0040 *when in doubt, ask the human*). NEVER promoted to
 *                            `machine` from coverage alone (that would fail open and drop the human).
 *  - `machine` (explicit)  → `machine`, ROUTED by the story's coverage:
 *      · ≥1 `observe` gate declared → `{ observe, observedBy: <first observe gate id> }` (adopt signs it now);
 *      · otherwise                  → `build-tests` (a promise the Build step authors red→green).
 *
 * Deterministic and total — every leg resolves; a `machine` leg is never refused, only routed (it can
 * still only green through a signed verdict, never a flag). When several `observe` gates exist the FIRST
 * (declared order) is named the cover — a documented simplification mirroring `classifyAdoption`'s trust
 * model (no per-leg→suite measurement; that is named follow-on).
 */
export function resolveWitness(
  leg: ClassifierLeg,
  gates: readonly ClassifierGate[],
): WitnessResolution {
  // Asymmetric + fail-closed: only an explicit `machine` declaration reaches the machine branch;
  // `human` and the UNDECIDED `either` both resolve to `human` (ADR-0106 d.2 / ADR-0040).
  if (leg.witness !== "machine") return { witness: "human" };

  // A declared `machine` leg is a PROMISE of a real test — route it, never green it (ADR-0106 d.3).
  const observeGate = gates.find((g) => g.kind === "observe");
  return observeGate !== undefined
    ? { witness: "machine", coverage: "observe", observedBy: observeGate.id }
    : { witness: "machine", coverage: "build-tests" };
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
export function isUnresolvedWitness(witness: UatTestWitness): boolean {
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
