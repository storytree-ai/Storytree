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
// ADR-0250: the remote-session data-plane refusal — `createPool` enforces it, and the build
// preflight (`ensureLiveDb`) reads it directly so a blocked session refuses instantly instead of
// burning the multi-minute cold-start poll on an instance that was never the problem.
export {
  dataPlaneRefusal,
  isDataPlaneBlockedSession,
  ALLOW_DATA_PLANE_ENV,
  REMOTE_MARKER_DIR,
} from "./data-plane.js";
export type { EnvLike, DataPlaneProbe } from "./data-plane.js";
export { applySchema, SCHEMA_SQL_PATH } from "./migrate.js";
// The disposable test-DB isolation guard (ADR-0054), surfaced for the DB-backed inner-loop proof
// (ADR-0064): the CLI asserts a db-backed proof's STORYTREE_DB_NAME is non-prod before any build.
export { createTestPool, assertTestDatabase, TEST_DB_ENV } from "./test-db.js";
export { PgLibraryStore } from "./pg-store.js";
export { loadComments } from "./load-corpus.js";
// The seed↔live reconcilers are GONE (ADR-0302 D4, ADR-0307 D3): `sync-agents`, `sync-corpus` and
// `export-corpus` existed only to keep a committed mirror in step with the live store, and the
// live store is now the only source of truth (ADR-0302 D1). Deleted, not left inert — a reconciler
// with nothing to reconcile is exactly the "kept but neutered" outcome D4 forbids.
export { batchMigrate } from "./batch-migrate.js";
export type { BatchMigrateResult } from "./batch-migrate.js";
export { renderStoredDoc, buildLibraryDoc, isStructuredKind } from "./render-doc.js";
export type { RenderedAsset, AssetWriteInput } from "./render-doc.js";
// The agent renderer (ADR-0051): assemble a Library `agent` artifact into a system prompt by
// injecting its typed `asset:` refs. Lives with the schema it reads (the drive extraction moved it
// out of `@storytree/cli`); the CLI commands, the build drivers, and the generators all consume it.
export {
  renderAgentPrompt,
  renderAgentEssentials,
  renderAgentDigest,
  renderAgentFile,
  renderCursorAgentFile,
  renderGeminiAgentFile,
  renderCodexAgentFile,
  renderAgentStep,
  delegatableAgentIds,
  essentialsGateViolations,
  estimateTokens,
  ESSENTIALS_TOKEN_BUDGET,
  DEDICATED_SURFACE_AGENTS,
  GENERATED_AGENT_MARKER,
} from "./render-agent.js";
export type {
  AgentPrompt,
  RenderAgentResult,
  AgentDigest,
  RenderDigestResult,
  RenderAgentFileResult,
  RenderAgentStepResult,
} from "./render-agent.js";
// The process-node extractor (ADR-0154 follow-on / ADR-0161): read a `process`'s branch-edges into a
// context-DAG node the CLI shapes into an ADR-0023 `next:` envelope via the shared emitter. Counterpart
// to `renderAgentStep`; like it, returns node DATA only (never imports the drive-side emitter).
export { renderProcessNode, processGraphViolations } from "./render-process.js";
export type { RenderProcessNodeResult } from "./render-process.js";
export { PgCommentStore, mergeCommentPatch, normalizeCommentAnchor } from "./pg-comment-store.js";
export type {
  Comment,
  CommentAnchor,
  CommentPatch,
  CommentFilter,
} from "./pg-comment-store.js";
export {
  PgSuggestionStore,
  applySuggestionTransition,
  mergeSuggestionPatch,
  SuggestionSchema,
} from "./pg-suggestion-store.js";
export type { Suggestion, SuggestionPatch, SuggestionFilter } from "./pg-suggestion-store.js";
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
