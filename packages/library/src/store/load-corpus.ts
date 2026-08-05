import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import type { Pool } from "pg";
import { createPool, closePool } from "./connection.js";
import { applySchema } from "./migrate.js";
import { REPO_ROOT_ENV, resolveRepoRoot } from "../repo-root.js";

/**
 * The store MIGRATION (ADR-0017 / ADR-0019 Phase 2, ADR-0021): bring a database up to the current
 * schema and load the comment projection.
 *
 * IT USED TO CARRY THE CORPUS TOO, and that half is deleted rather than repointed. `loadCorpus` read
 * the structured knowledge units out of `apps/studio/data/knowledge.json` and upserted them here —
 * the seed→live direction ADR-0302 D1 abolishes. With the live store as the only source of truth
 * there is nothing for a file to migrate INTO it: the corpus is already there, and a loader pointing
 * at a committed file could only ever overwrite live state with an older copy of itself. So the
 * function goes with the file (ADR-0302 D4: deleted, not left inert), and what remains is the part
 * that was never about the corpus.
 *
 *  - {@link applySchema} (from `migrate.ts`) applies the idempotent DDL.
 *  - Comments (`apps/studio/data/comments.json`) are loaded into the dedicated `events.comment`
 *    projection + `events.comment_event` history (NOT the library tables) via {@link loadComments}.
 *    Postgres-specific, because comments use their own tables outside the narrow library `Store`.
 *
 * The hermetic suites that used `loadCorpus` to get a populated store now use
 * `@storytree/library/fixture`'s `loadFixtureCorpus`, which upserts a small frozen literal through
 * the same validated write boundary and needs no file and no credential.
 */

interface CommentLike {
  id: string;
  [k: string]: unknown;
}

/**
 * Resolve a path inside `apps/studio/data/` relative to the repo root — a PARAMETER (ADR-0246), not
 * this file's own location. `STORYTREE_REPO_ROOT` repoints the seed at another checkout; unset, the
 * module-location derivation (four dirs up from `packages/library/src/store/`) applies as before.
 */
function dataPath(file: string): string {
  const { root } = resolveRepoRoot({
    env: process.env[REPO_ROOT_ENV],
    derived: fileURLToPath(new URL("../../../../", import.meta.url)),
  });
  return join(root, "apps", "studio", "data", file);
}

/**
 * Load comments into the dedicated comment projection + history (ADR-0015 §6: comments are typed
 * events). Idempotent per comment id: upserts `events.comment` (current state) and appends a
 * `created`/`updated` event to `events.comment_event` — so a re-seed does not duplicate the
 * projection, and the history reflects each seed as an event. Postgres-specific.
 */
export async function loadComments(pool: Pool): Promise<number> {
  const comments = JSON.parse(await readFile(dataPath("comments.json"), "utf8")) as CommentLike[];
  for (const comment of comments) {
    const docJson = JSON.stringify(comment);
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const existing = await client.query<{ exists: boolean }>(
        "SELECT EXISTS (SELECT 1 FROM events.comment WHERE id = $1) AS exists",
        [comment.id],
      );
      const type = existing.rows[0]?.exists ? "updated" : "created";
      await client.query(
        "INSERT INTO events.comment_event (id, type, doc, actor) VALUES ($1, $2, $3::jsonb, $4)",
        [comment.id, type, docJson, "corpus-migration"],
      );
      await client.query(
        `INSERT INTO events.comment (id, doc) VALUES ($1, $2::jsonb)
         ON CONFLICT (id) DO UPDATE SET doc = EXCLUDED.doc, updated_at = now()`,
        [comment.id, docJson],
      );
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }
  return comments.length;
}

/**
 * Injectable deps for {@link runSeed} — each step is a zero-arg (or store-taking) async function
 * so the orchestration sequence can be tested offline without a DB connection.
 */
export interface SeedDeps {
  /** Apply the DB schema before loading data. */
  applySchema: () => Promise<void>;
  /** Load comments (Postgres-specific in production; fakeable offline). */
  loadComments: () => Promise<number>;
}

/**
 * Orchestration core: apply schema, then load comments — in that order.
 * Extracted from `main()` as the R2 refactor-for-testability target (library#gate-4 / ADR-0098 d.6).
 * `main()` wires the real (pool-bound) deps; tests inject fakes.
 *
 * The middle step was `loadCorpus`, and it is gone with the seed it read (ADR-0302 D1). The
 * ORDERING this function exists to prove is unchanged in kind — schema before data — so the R2 seam
 * and its suite survive the narrowing.
 */
export async function runSeed(deps: SeedDeps): Promise<void> {
  await deps.applySchema();
  const comments = await deps.loadComments();
  console.log(`schema applied; loaded ${comments} comments`);
}

/**
 * Script entry: when this file is the process entry point, build a live pool, apply the schema and
 * load comments, then tear down. NEVER invoked during tests (entry-guarded).
 */
async function main(): Promise<void> {
  const { pool, connector } = await createPool();
  try {
    await runSeed({
      applySchema: () => applySchema(pool),
      loadComments: () => loadComments(pool),
    });
  } finally {
    await closePool(pool, connector);
  }
}

const entry = process.argv[1];
if (entry !== undefined && import.meta.url === pathToFileURL(entry).href) {
  main().catch((err: unknown) => {
    console.error(err);
    process.exitCode = 1;
  });
}
