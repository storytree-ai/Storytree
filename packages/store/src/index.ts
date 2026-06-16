// @storytree/store — the Postgres store (ADR-0015/0017/0019): a thin typed Cloud SQL client
// (Node connector + IAM auth, no password, no DBOS) over JSONB docs + append-only events +
// a current-state projection. zod-validated at the write boundary.
export {
  createPool,
  closePool,
  DEFAULT_INSTANCE_CONNECTION_NAME,
  DEFAULT_DATABASE,
} from "./connection.js";
export type { CreatePoolOptions, PoolHandle } from "./connection.js";
export { applySchema, SCHEMA_SQL_PATH } from "./migrate.js";
// The disposable test-DB isolation guard (ADR-0054), surfaced for the DB-backed inner-loop proof
// (ADR-0064): the CLI asserts a db-backed proof's STORYTREE_DB_NAME is non-prod before any build.
export { createTestPool, assertTestDatabase, TEST_DB_ENV } from "./test-db.js";
export { PgLibraryStore } from "./pg-store.js";
export { PgWorkStore } from "./pg-work-store.js";
export type { WorkStoreClient } from "./pg-work-store.js";
// The Postgres home for the ADR-0016 binding-staleness change log (the @storytree/core ChangeStore
// seam), proven by a DB-backed round-trip against an isolated storytree_test (ADR-0064 §1).
export { PgChangeStore } from "./pg-change-store.js";
export type { ChangeStoreClient } from "./pg-change-store.js";
export { loadCorpus, loadComments } from "./load-corpus.js";
export type { LoadCorpusResult } from "./load-corpus.js";
export { reconcileAgents, syncSeedAgents, diffAgents, diffSeedAgents, AGENT_KIND } from "./sync-agents.js";
export type { SyncAgentsResult, AgentDiff } from "./sync-agents.js";
export { sessionIdFromBranch, retireMergedSession } from "./ingest-merge.js";
export type { MergeRetireStore } from "./ingest-merge.js";
export { batchMigrate } from "./batch-migrate.js";
export type { BatchMigrateResult } from "./batch-migrate.js";
export { renderStoredDoc, buildLibraryDoc, isStructuredKind } from "./render-doc.js";
export type { RenderedAsset, AssetWriteInput } from "./render-doc.js";
// Re-exported for the studio's lazily-imported pg backend (its health skew probe compares the
// DB's max schemaVersion against this; a static @storytree/core import breaks vite config load).
export { CURRENT_SCHEMA_VERSION } from "@storytree/core";
export { PgPresenceStore } from "./presence-store.js";
export type {
  PresenceClient,
  PresencePool,
  PresencePoolClient,
  PresenceEvent,
} from "./presence-store.js";
export { PgCommentStore, mergeCommentPatch } from "./pg-comment-store.js";
export type {
  Comment,
  CommentAnchor,
  CommentPatch,
  CommentFilter,
} from "./pg-comment-store.js";
export { PgUserStore, LastAdminError } from "./user-store.js";
export type {
  UserClient,
  UserPool,
  UserPoolClient,
  UserEvent,
} from "./user-store.js";
export { PgAttestationStore } from "./attestation-store.js";
export type { AttestationStoreClient } from "./attestation-store.js";
export { PgAdrStore } from "./adr-store.js";
export type { AdrAllocatorClient, AdrAllocation } from "./adr-store.js";
// Cloud SQL Admin REST client (ADR-0063): db-control over REST instead of the gcloud subprocess.
export {
  createCloudSqlAdmin,
  instanceUrl,
  parseInstanceStatus,
  SQLADMIN_BASE,
} from "./cloud-sql-admin.js";
export type {
  ActivationPolicy,
  InstanceStatus,
  HttpResponse,
  CloudSqlAdminDeps,
  CloudSqlAdmin,
} from "./cloud-sql-admin.js";
export { createAdcCloudSqlAdmin } from "./cloud-sql-admin-adc.js";
export type { AdcCloudSqlAdminOptions } from "./cloud-sql-admin-adc.js";
