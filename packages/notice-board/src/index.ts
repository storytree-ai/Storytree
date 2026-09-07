// @storytree/notice-board — the notice-board organism (ADR-0068 step 6), extracted from the
// dissolving @storytree/core. The session-presence schema this barrel once carried was RETIRED
// (ADR-0200 D7): the per-unit CLAIM is the one session machinery. The claim shape + reclaim
// predicate (ADR-0009's claim, the ADR-0033 §4 named upgrade) — pure zod, browser-safe (the
// studio bundles it); the Postgres half is ./store/claim-store.
export * from "./claim.js";
// The HISTORY half — the pure folds over `events.claim_event` (ADR-0310 D1): where `claim.ts`
// renders point-in-time STATE, these read TRANSITIONS (holdings, refusals, the whole-log summary).
// Pure and browser-safe alongside it; the SQL read is `PgClaimStore.auditHistory`.
export * from "./claim-history.js";
// The NARROW CI liveness signal's pure half (ADR-0535 D2): what may vouch for a claim's liveness
// from outside this machine, and every refusal that keeps it narrow. No fetch, no clock, no store —
// the observing lives in ./store/ingest-ci-activity.ts, which is node-only.
export * from "./ci-corroboration.js";
