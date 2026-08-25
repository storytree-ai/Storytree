import { activeReliabilityGates, type ReliabilityGate } from "./reliability-gates.js";
import type { UatTestCriterion } from "./uat-test-criteria.js";
import { resolveWitness, type ClassifierGate } from "./witness-resolution.js";

/**
 * WHICH own-proof obligations gate a story's crown (ADR-0085 as narrowed by ADR-0443 D2).
 *
 * ADR-0085 defines a story's own-proof obligation set as its per-test UAT criteria UNION its
 * `## Reliability Gates`. Three filters then apply, and this module is the ONE place all three live,
 * so the CLI crown, the studio map, the desktop overlay and the story-build report can never
 * disagree about what a story still owes.
 *
 * The three, and why each is not an obligation:
 *  - **would-be** (ADR-0097) — an aspirational leg in a `## UAT Test Criteria (would-be)` section:
 *    recorded, rendered, but never green-blocking until a real test backs it.
 *  - **retired in place** (ADR-0436) — a gate that kept its ordinal but left the obligation set.
 *  - **unsignable** (ADR-0443 D2, new) — an acceptance step deliberately authored with NO proof
 *    attached. See {@link isSignableUatCriterion}.
 *
 * ⚠ This is an OBLIGATION filter, never a DISPLAY filter. Every surface still renders the full
 * authored list — a step that vanishes from view is exactly how its gap stops being visible, and
 * ADR-0443's honesty rests on the step's own text remaining readable ("the gap stays visible in each
 * step's own text, which is the only place it was ever visible"). `activeReliabilityGates` carries
 * the same warning for the same reason.
 */

/**
 * PURE (ADR-0443 D2): can this UAT criterion EVER be signed as authored?
 *
 * A `human` leg is signable — an operator attestation proves it (ADR-0082). An `either` leg resolves
 * to `human` (ADR-0106's asymmetric, fail-closed rule), so it is signable too. A `machine` leg is
 * signable when it names the command-bearing `observe` gate it proves against.
 *
 * **The one unsignable shape is a `machine` leg that names no gate at all** — `resolveWitness`
 * refuses it `missing-binding`. That is the state a story-author pass deliberately leaves when the
 * journey step is real but nothing can witness it yet: `proof-binding-integrity`'s surviving leg
 * says so in its own prose — *"It names no `(proof-gate:)`, and none may be minted for it — binding
 * it to a package suite that never opens the runtime would be the rubber-stamp ADR-0097 §2 forbids."*
 * No adopt pass can sign it, so holding a crown grey on it is a permanent block, not an incentive.
 * Measured 2026-08-25 against the live corpus: exactly 26 such legs across exactly the 9 stories
 * ADR-0443's own measurement names.
 *
 * **The other three refusals are NOT covered, deliberately.** `unknown-gate`, `ineligible-gate` and
 * `missing-command` mean the author BOUND the leg and the binding is broken — a defect to repair,
 * not an admission that nothing can witness the step. ADR-0443's Consequences draw exactly this line
 * for the mirror-image case: *"a gate pointing at a deleted step is not an unsignable obligation, it
 * is a broken one."* A broken binding keeps holding the crown, which is what makes someone fix it.
 */
export function isSignableUatCriterion(
  criterion: UatTestCriterion,
  gates: readonly ClassifierGate[],
): boolean {
  const resolved = resolveWitness(criterion, gates);
  return !(
    resolved.witness === "machine" &&
    resolved.coverage === "refused" &&
    resolved.refusal === "missing-binding"
  );
}

/**
 * PURE: the UAT criteria that are real crown obligations — the authored list minus the would-be legs
 * (ADR-0097) and minus the unsignable ones ({@link isSignableUatCriterion}, ADR-0443 D2).
 *
 * Gates are passed in because signability is resolved against the story's OWN declared gates: the
 * FULL parse, not `activeReliabilityGates`. A leg bound to a gate that was later retired in place is
 * `ineligible`/broken rather than never-bound, and must keep holding the crown so the mismatch gets
 * repaired rather than silently absorbed.
 */
export function crownUatCriteria(
  criteria: readonly UatTestCriterion[],
  gates: readonly ReliabilityGate[],
): UatTestCriterion[] {
  return criteria.filter((c) => c.wouldBe !== true && isSignableUatCriterion(c, gates));
}

/**
 * PURE: a story's full own-proof obligation set for the crown (ADR-0085 ∩ ADR-0097 ∩ ADR-0436 ∩
 * ADR-0443 D2) — the signable, non-would-be UAT criteria UNION the still-active reliability gates.
 *
 * This is the second argument every caller should hand `rollupStoryGreen`. Building the union HERE
 * rather than at each call site is the point: before ADR-0443 the two filters were open-coded in the
 * CLI, the studio server and the desktop backend independently, so a third filter had to be added in
 * three places or it silently was not applied at all — the "green check that verified nothing" shape.
 */
export function crownObligations(
  criteria: readonly UatTestCriterion[],
  gates: readonly ReliabilityGate[],
): (UatTestCriterion | ReliabilityGate)[] {
  return [...crownUatCriteria(criteria, gates), ...activeReliabilityGates(gates)];
}

/**
 * PURE: the criteria this story can never sign as authored — the set {@link crownObligations} drops
 * under ADR-0443 D2. Returned so a surface can SAY SO rather than silently shrinking the checklist:
 * ADR-0416 D2's *"silence is not acceptable"* applies to a dropped obligation exactly as it does to
 * an added one, and a green crown that quietly stopped counting three steps is the abuse ADR-0443's
 * Consequences flag as held by author judgment rather than by a gate.
 */
export function unsignableUatCriteria(
  criteria: readonly UatTestCriterion[],
  gates: readonly ReliabilityGate[],
): UatTestCriterion[] {
  return criteria.filter((c) => c.wouldBe !== true && !isSignableUatCriterion(c, gates));
}
