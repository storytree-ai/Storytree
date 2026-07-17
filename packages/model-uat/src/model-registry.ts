import { z } from "zod";
import { TIER_LEVELS, Tier } from "./criterion.js";

/**
 * The `model-eligibility-registry` capability (ADR-0209 D2): a criterion's required
 * tier resolves against an explicit, VERSIONED registry — a stronger registered judge
 * substitutes upward, an unregistered or self-declared model is ineligible, and a
 * required tier with no available registered judge HOLDS rather than downgrading,
 * rerouting, or relabelling it. Pure, no I/O — the registry is data, the resolver is
 * a function.
 */

// ---------------------------------------------------------------------------
// The registry: explicit and versioned
// ---------------------------------------------------------------------------

/** The current registry schema version. Bump when the registry shape changes. */
export const MODEL_REGISTRY_VERSION = 1;

/**
 * One registered model: its stable id, the tier it confers (never self-declared —
 * only presence in the registry confers a tier), and whether it is currently
 * available. Availability is a registry INPUT, not an inference — an admitted but
 * currently-down judge must still resolve to a HOLD, never a silent downgrade.
 */
export const RegisteredModel = z
  .object({
    id: z.string().min(1),
    tier: Tier,
    available: z.boolean(),
  })
  .strict();
export type RegisteredModel = z.infer<typeof RegisteredModel>;

/** The versioned registry of registered judges. */
export const ModelRegistry = z
  .object({
    version: z.number(),
    models: z.array(RegisteredModel),
  })
  .strict();
export type ModelRegistry = z.infer<typeof ModelRegistry>;

/**
 * The seed registry reflecting today's reality (ADR-0209 Context): the live runtime
 * is the Claude Agent SDK on subscription; Fable is the only admitted `frontier`
 * judge. GPT-5.6 Sol is a future-only candidate (pending a separate subscription-
 * funded OpenAI runtime) and is deliberately left out of the seed rather than marked
 * eligible-by-aspiration.
 */
export const SEED_MODEL_REGISTRY: ModelRegistry = {
  version: MODEL_REGISTRY_VERSION,
  models: [
    { id: "claude-opus-4-8", tier: "advanced", available: true },
    { id: "claude-fable-5", tier: "frontier", available: true },
  ],
};

// ---------------------------------------------------------------------------
// Resolution
// ---------------------------------------------------------------------------

/** The registry's tier ordering, weakest first — mirrors `TIER_LEVELS`. */
const TIER_RANK: Record<Tier, number> = Object.fromEntries(
  TIER_LEVELS.map((tier, index) => [tier, index]),
) as Record<Tier, number>;

/** The outcome of resolving a required tier against a registry. */
export type JudgeResolution =
  | { status: "eligible"; judge: RegisteredModel }
  | { status: "hold"; reason: string };

/**
 * PURE: resolve a criterion's required minimum tier against the current registry.
 * A registered, AVAILABLE judge whose tier is at least the required tier is
 * eligible — substitute upward only, never downward. When no such judge exists
 * (absent, self-declared/unregistered, or registered-but-unavailable), the
 * criterion HOLDS with a reason — never downgraded, rerouted, or relabelled.
 */
export function resolveJudge(requiredTier: Tier, registry: ModelRegistry): JudgeResolution {
  const requiredRank = TIER_RANK[requiredTier];
  const eligible = registry.models
    .filter((model) => model.available && TIER_RANK[model.tier] >= requiredRank)
    .sort((a, b) => TIER_RANK[a.tier] - TIER_RANK[b.tier]);

  const judge = eligible[0];
  if (judge !== undefined) {
    return { status: "eligible", judge };
  }

  return {
    status: "hold",
    reason: `no available registered judge satisfies the required "${requiredTier}" tier`,
  };
}
