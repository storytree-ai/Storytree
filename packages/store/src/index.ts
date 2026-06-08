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
export { loadCorpus, loadComments } from "./load-corpus.js";
export type { LoadCorpusResult } from "./load-corpus.js";
