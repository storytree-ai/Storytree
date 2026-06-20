// @storytree/store — a thin RE-EXPORT SHIM (ADR-0077). The shared Postgres substrate + the central
// drawers (the corpus store, the global ADR allocator, the shared comment store) moved into
// `@storytree/library/store`; the remaining drawers (presence / user / work / change / attestation /
// merge-ingest) still live here. This shim keeps the `@storytree/store` public API byte-identical so
// every consumer (cli, studio) is untouched while the store is dissolved unit by unit.

// ── Moved into @storytree/library/store (ADR-0077): the substrate + central drawers ──────────────
export {
  createPool,
  closePool,
  DEFAULT_INSTANCE_CONNECTION_NAME,
  DEFAULT_DATABASE,
  applySchema,
  SCHEMA_SQL_PATH,
  createTestPool,
  assertTestDatabase,
  TEST_DB_ENV,
  PgLibraryStore,
  loadCorpus,
  loadComments,
  reconcileAgents,
  syncSeedAgents,
  diffAgents,
  diffSeedAgents,
  AGENT_KIND,
  batchMigrate,
  renderStoredDoc,
  buildLibraryDoc,
  isStructuredKind,
  PgCommentStore,
  mergeCommentPatch,
  PgAdrStore,
  createCloudSqlAdmin,
  instanceUrl,
  parseInstanceStatus,
  SQLADMIN_BASE,
  createAdcCloudSqlAdmin,
} from "@storytree/library/store";
export type {
  CreatePoolOptions,
  PoolHandle,
  LoadCorpusResult,
  SyncAgentsResult,
  AgentDiff,
  BatchMigrateResult,
  RenderedAsset,
  AssetWriteInput,
  Comment,
  CommentAnchor,
  CommentPatch,
  CommentFilter,
  AdrAllocatorClient,
  AdrAllocation,
  ActivationPolicy,
  InstanceStatus,
  HttpResponse,
  CloudSqlAdminDeps,
  CloudSqlAdmin,
  AdcCloudSqlAdminOptions,
} from "@storytree/library/store";

// Re-exported for the studio's lazily-imported pg backend (its health skew probe compares the
// DB's max schemaVersion against this; a static @storytree/library import breaks vite config load).
export { CURRENT_SCHEMA_VERSION } from "@storytree/library";

// ── Moved into the owning organisms' node-only ./store subpaths (ADR-0077 U2) ─────────────────────
// The drawers now live with the organism that owns the seam; this shim re-exports them under the
// byte-identical @storytree/store names so cli + studio are untouched.

// notice-board: the presence store + the merge-retire backstop.
export { PgPresenceStore } from "@storytree/notice-board/store";
export type {
  PresenceClient,
  PresencePool,
  PresencePoolClient,
  PresenceEvent,
} from "@storytree/notice-board/store";
export { sessionIdFromBranch, retireMergedSession } from "@storytree/notice-board/store";
export type { MergeRetireStore } from "@storytree/notice-board/store";

// studio-members: the app-owned user (member) store.
export { PgUserStore, LastAdminError } from "@storytree/studio-members/store";
export type {
  UserClient,
  UserPool,
  UserPoolClient,
  UserEvent,
} from "@storytree/studio-members/store";

// drive-machinery (orchestrator): the work-hierarchy event store, the ADR-0016 change log (proven by
// a DB-backed round-trip against an isolated storytree_test, ADR-0064 §1), and the attestation log.
export { PgWorkStore } from "@storytree/orchestrator/store";
export type { WorkStoreClient } from "@storytree/orchestrator/store";
export { PgChangeStore } from "@storytree/orchestrator/store";
export type { ChangeStoreClient } from "@storytree/orchestrator/store";
export { PgAttestationStore } from "@storytree/orchestrator/store";
export type { AttestationStoreClient } from "@storytree/orchestrator/store";
