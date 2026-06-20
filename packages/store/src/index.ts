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

// ── Still home here: the drawers that move to other organisms in later ADR-0077 units ────────────
export { PgWorkStore } from "./pg-work-store.js";
export type { WorkStoreClient } from "./pg-work-store.js";
// The Postgres home for the ADR-0016 binding-staleness change log (the ChangeStore seam), proven by
// a DB-backed round-trip against an isolated storytree_test (ADR-0064 §1).
export { PgChangeStore } from "./pg-change-store.js";
export type { ChangeStoreClient } from "./pg-change-store.js";
export { sessionIdFromBranch, retireMergedSession } from "./ingest-merge.js";
export type { MergeRetireStore } from "./ingest-merge.js";
export { PgPresenceStore } from "./presence-store.js";
export type {
  PresenceClient,
  PresencePool,
  PresencePoolClient,
  PresenceEvent,
} from "./presence-store.js";
export { PgUserStore, LastAdminError } from "./user-store.js";
export type {
  UserClient,
  UserPool,
  UserPoolClient,
  UserEvent,
} from "./user-store.js";
export { PgAttestationStore } from "./attestation-store.js";
export type { AttestationStoreClient } from "./attestation-store.js";
