/**
 * The host transcript surface as the orchestrator's own context-window occupancy
 * (ADR-0235 clause 1, a new boundary; ADR-0241 local persistence; ADR-0248 D1).
 *
 * Export lines are appended here as each capability's source lands. The barrel stays connective
 * glue: it is deliberately un-asserted, so no capability claims it as proof.
 *
 * This package is node-only by construction (it reads real transcript bytes and writes real trace
 * bytes), so like `@storytree/context-traversal-capture` it is never bundled by the studio.
 */
export {};
