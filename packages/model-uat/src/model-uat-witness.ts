import { Criterion, parseCriteria } from "./criterion.js";
import type { Tier } from "./criterion.js";
import { resolveJudge } from "./model-registry.js";
import type { ModelRegistry, RegisteredModel } from "./model-registry.js";

/**
 * The `model-uat-witness` story facade (ADR-0209): composes the three delivered
 * capabilities — `three-kind-witness` (`criterion.ts`), `model-tier-classification`
 * (also `criterion.ts`, the `tier` field + refusals), and `model-eligibility-registry`
 * (`model-registry.ts`) — into one entry point that resolves a criterion's declared
 * witness to a tiered outcome. Pure, no I/O.
 */

/**
 * The resolved outcome for one criterion's declared witness:
 * - `machine` / `human` — as declared, no further resolution needed.
 * - `legacy-unresolved` — an untagged (legacy `either`) criterion, never defaulted
 *   into model judgment and never even consulting the registry.
 * - `model-eligible` — a `model` criterion whose declared minimum tier is satisfied
 *   by an available, registered judge (substituted upward when a stronger judge is
 *   the only one available); carries both the criterion's own declared `tier` and
 *   the substituting `judge`.
 * - `model-hold` — a `model` criterion whose declared minimum tier has no available
 *   registered judge; carries the criterion's own declared `tier` and a non-empty
 *   `reason`, never silently downgraded, rerouted, or relabelled.
 */
export type WitnessResolution =
  | { status: "machine" }
  | { status: "human" }
  | { status: "legacy-unresolved" }
  | { status: "model-eligible"; tier: Tier; judge: RegisteredModel }
  | { status: "model-hold"; tier: Tier; reason: string };

/**
 * PURE: resolve one already-parsed {@link Criterion}'s declared witness to its
 * {@link WitnessResolution}, against the given {@link ModelRegistry}. A `machine`/
 * `human` witness resolves directly; a legacy `either` witness resolves to
 * `legacy-unresolved` without ever consulting the registry; a `model` witness (whose
 * `tier` is guaranteed present by the `Criterion` schema's own refinement) resolves
 * its required tier against the registry via `resolveJudge`.
 */
export function resolveWitness(criterion: Criterion, registry: ModelRegistry): WitnessResolution {
  switch (criterion.witness) {
    case "machine":
      return { status: "machine" };
    case "human":
      return { status: "human" };
    case "either":
      return { status: "legacy-unresolved" };
    case "model": {
      const requiredTier = criterion.tier;
      if (requiredTier === undefined) {
        // Unreachable: the Criterion schema refuses a `model` witness with no tier.
        throw new Error(`${criterion.id}: model witness with no declared tier — refused upstream`);
      }
      const judgeResolution = resolveJudge(requiredTier, registry);
      if (judgeResolution.status === "eligible") {
        return { status: "model-eligible", tier: requiredTier, judge: judgeResolution.judge };
      }
      return { status: "model-hold", tier: requiredTier, reason: judgeResolution.reason };
    }
  }
}

/**
 * PURE: parse a story's markdown `body` into its {@link Criterion} units
 * (`parseCriteria`) and resolve each one's witness (`resolveWitness`) against the
 * given `registry`. A story with no `## UAT Test Criteria` section resolves to `[]`.
 * Deterministic: the same `(storyId, body, registry)` always yields the same result.
 */
export function resolveStoryWitnesses(
  storyId: string,
  body: string,
  registry: ModelRegistry,
): WitnessResolution[] {
  return parseCriteria(storyId, body).map((criterion) => resolveWitness(criterion, registry));
}
