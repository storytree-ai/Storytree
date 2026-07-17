// @storytree/notice-board — the notice-board organism (ADR-0068 step 6), extracted from the
// dissolving @storytree/core. The session-presence schema this barrel once carried was RETIRED
// (ADR-0200 D7): the per-unit CLAIM is the one session machinery. The claim shape + reclaim
// predicate (ADR-0009's claim, the ADR-0033 §4 named upgrade) — pure zod, browser-safe (the
// studio bundles it); the Postgres half is ./store/claim-store.
export * from "./claim.js";
