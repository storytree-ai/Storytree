import { z } from "zod";
import { BuildPhase } from "./work-event.js";

/**
 * The token-usage DATA shapes (the runtime-cost SIBLING stream to `events.verdict`).
 *
 * A signed {@link Verdict} deliberately carries NO runtime cost — proof and spend are different
 * axes: *"did it work?"* is the gate's signed fact, *"what did it cost?"* is accounting. Usage
 * therefore rides its OWN event kind + store table (`events.usage_event`), never a verdict field,
 * so the signed proof doc stays byte-stable and unforgeable while accounting stays queryable.
 *
 * DATA SHAPES + the store `kind` literal ONLY (ADR-0068 §3): the COMPUTE that builds a usage
 * event (`usageEvent`) is the farmer organism's and lives in `@storytree/orchestrator`; the
 * CAPTURE vocabulary the leaf runtimes record against (`TokenUsage` in `@storytree/agent`'s
 * model-events port) is mirrored here field-for-field — proof-protocol depends on nothing, so it
 * duplicates like `Tier`/`Status` rather than importing across the seam.
 */

/** The store `kind` for per-slice token-usage events (the `events.usage_event` stream). */
export const USAGE_EVENT_KIND = "usage";

/**
 * One request's/slice's token counts, camelCase per the SDK's `ModelUsage` vocabulary. The four
 * axes bill differently (cache reads are ~10× cheaper than fresh input; cache creation ~1.25×),
 * so a roll-up must keep them apart — a single "tokens" number would hide that ~95% of measured
 * spend is cache-read re-billing (the 2026-07-16 trace mining).
 */
export const TokenUsage = z
  .object({
    inputTokens: z.number().int().nonnegative(),
    cacheCreationInputTokens: z.number().int().nonnegative(),
    cacheReadInputTokens: z.number().int().nonnegative(),
    outputTokens: z.number().int().nonnegative(),
  })
  .strict();
export type TokenUsage = z.infer<typeof TokenUsage>;

/** Per-model token counts + the SDK's metered cost for that model (subscription-billed = advisory). */
export const ModelTokenUsage = TokenUsage.extend({
  costUsd: z.number().nonnegative().optional(),
}).strict();
export type ModelTokenUsage = z.infer<typeof ModelTokenUsage>;

/** Which leaf runtime produced a usage row (ADR-0030's two PhaseAuthor implementations). */
export const UsageSource = z.enum(["sdk-leaf", "owned-loop"]);
export type UsageSource = z.infer<typeof UsageSource>;

/**
 * The doc carried by one per-slice usage event: what ONE authoring slice (one SDK `query()` /
 * one owned-loop step) of one gate run consumed. `phase` reuses the {@link BuildPhase} wire
 * vocabulary (in practice only the two authoring phases bill — the spine's own observation
 * phases run no model). `turns`/`costUsd` mirror the SDK result's coarse accounting
 * (`num_turns`/`total_cost_usd` — the metered cost is a phantom under subscription billing,
 * recorded as advisory context, never a meter to enforce against). `byModel` keeps the SDK's
 * per-model split when the runtime reports one (an opus turn and a haiku turn price differently).
 */
export const UsageEventDoc = z
  .object({
    unitId: z.string(),
    runId: z.string(),
    phase: BuildPhase,
    source: UsageSource,
    usage: TokenUsage,
    model: z.string().optional(),
    turns: z.number().int().nonnegative().optional(),
    costUsd: z.number().nonnegative().optional(),
    byModel: z.record(z.string(), ModelTokenUsage).optional(),
  })
  .strict();
export type UsageEventDoc = z.infer<typeof UsageEventDoc>;
