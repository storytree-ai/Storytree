/**
 * `@storytree/model-uat` — the model-UAT-witness organism.
 *
 * Model promotion UAT: tier judgement, witness log, and promotion gate
 * for the model-uat-witness story. Pure zod, browser-safe, no `node:` imports.
 *
 * The package root re-exports the story's composed facade
 * (`model-uat-witness.ts`) plus the underlying capability types/values a
 * downstream consumer needs to call it — never requiring a reach into an
 * internal file.
 */
export type { Tier, CriterionWitness } from "./criterion.js";
export { Criterion, parseCriteria } from "./criterion.js";
export type { ModelRegistry, RegisteredModel } from "./model-registry.js";
export { MODEL_REGISTRY_VERSION, SEED_MODEL_REGISTRY, resolveJudge } from "./model-registry.js";
export type { WitnessResolution } from "./model-uat-witness.js";
export { resolveWitness, resolveStoryWitnesses } from "./model-uat-witness.js";
