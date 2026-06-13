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
export { PgLibraryStore } from "./pg-store.js";
export { PgWorkStore } from "./pg-work-store.js";
export type { WorkStoreClient } from "./pg-work-store.js";
export { loadCorpus, loadComments } from "./load-corpus.js";
export type { LoadCorpusResult } from "./load-corpus.js";
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
