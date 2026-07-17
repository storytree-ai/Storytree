// @storytree/notice-board/store — the node-only Postgres drawers the notice-board organism owns
// (ADR-0077 U2). The presence store + stale-session reaper this barrel once carried were RETIRED
// with the presence core (ADR-0200 D7); the claim ledger below is the one session machinery.
// node+pg-only — NEVER re-exported from the root `.` barrel, which the studio's browser bundle imports.

// The CI merge-clear backstop (ADR-0138 §4): releases a merged branch's node_claim rows, fail-soft.
export { releaseBranchClaims } from "./ingest-merge.js";
export type { BranchClaimReleaseStore } from "./ingest-merge.js";

// The per-unit CLAIM-LEDGER store (ADR-0009's claim on plain Postgres; the ADR-0033 §4 enforcing
// upgrade of presence; GRADED per ADR-0200 D2 — exploring/waiting shared, work exclusive, with
// atomic oldest-live-waiter promotion on every work release). node+pg-only.
export { PgClaimStore } from "./claim-store.js";
export type {
  ClaimClient,
  ClaimPool,
  ClaimPoolClient,
  ClaimOptions,
  ClaimAuditEvent,
  SharedClaimGrade,
  UpgradeOptions,
} from "./claim-store.js";
