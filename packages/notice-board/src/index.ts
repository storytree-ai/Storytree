// @storytree/notice-board — the notice-board organism (ADR-0068 step 6), extracted from the
// dissolving @storytree/core. The session-presence schema + staleness classification
// (PresenceDeclarationDoc / classifyPresence / mergeDeclaration / STALE_THRESHOLD_MS /
// POSSIBLY_DEAD_THRESHOLD_MS). Pure zod, browser-safe — the studio bundles it.
export * from "./presence.js";
// The enforcing twin of presence: the per-unit write-CLAIM shape + reclaim predicate (ADR-0009's
// claim, the ADR-0033 section 4 named upgrade). Pure zod too; the Postgres half is ./store/claim-store.
export * from "./claim.js";
