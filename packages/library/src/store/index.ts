// `@storytree/library/store` — the node-only store realization of the library organism (ADR-0077).
//
// The shared Postgres SUBSTRATE (Node connector + keyless IAM, no DBOS) plus the CENTRAL drawers —
// the corpus store (PgLibraryStore), the global ADR allocator (PgAdrStore), and the shared comment
// store (PgCommentStore) — moved here out of `@storytree/store` so the library owns its own
// persistence. This subpath carries `node:`/`pg` imports, so it is NEVER re-exported from the
// library ROOT barrel (or the `/sources` `/knowledge` `/knowledge-render` subpaths): those stay
// pure-zod / browser-safe for the studio Vite bundle. Node consumers import this subpath directly.
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
export { loadCorpus, loadComments } from "./load-corpus.js";
export type { LoadCorpusResult } from "./load-corpus.js";
export { reconcileAgents, syncSeedAgents, diffAgents, diffSeedAgents, AGENT_KIND } from "./sync-agents.js";
export type { SyncAgentsResult, AgentDiff } from "./sync-agents.js";
export { batchMigrate } from "./batch-migrate.js";
export type { BatchMigrateResult } from "./batch-migrate.js";
export { renderStoredDoc, buildLibraryDoc, isStructuredKind } from "./render-doc.js";
export type { RenderedAsset, AssetWriteInput } from "./render-doc.js";
export { PgCommentStore, mergeCommentPatch } from "./pg-comment-store.js";
export type {
  Comment,
  CommentAnchor,
  CommentPatch,
  CommentFilter,
} from "./pg-comment-store.js";
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
