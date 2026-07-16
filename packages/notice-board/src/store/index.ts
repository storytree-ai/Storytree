// @storytree/notice-board/store — the node-only Postgres drawers the notice-board organism owns
// (ADR-0077 U2): the presence store (ADR-0033) and the merge-retire backstop (ADR-0033 / ADR-0041).
// node+pg-only — NEVER re-exported from the root `.` barrel, which the studio's browser bundle imports.

export { PgPresenceStore } from "./presence-store.js";
export type {
  PresenceClient,
  PresencePool,
  PresencePoolClient,
  PresenceEvent,
} from "./presence-store.js";

export { sessionIdFromBranch, retireMergedSession } from "./ingest-merge.js";
export type { MergeRetireStore } from "./ingest-merge.js";

export { reapStaleSessions } from "./reaper.js";
export type { ReaperStore } from "./reaper.js";

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
