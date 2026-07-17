import { readFile } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import type { Pool } from "pg";
import type { Store } from "@storytree/storage-protocol";
import { createPool, closePool } from "./connection.js";
import { applySchema } from "./migrate.js";
import { PgLibraryStore } from "./pg-store.js";
import { libraryTemplates } from "../templates.js";

/**
 * The corpus migration (ADR-0017 / ADR-0019 Phase 2, ADR-0021): seed the runtime store from the
 * studio data files so the DB holds the COMPLETE Library — every artifact the studio shows.
 *
 *  - The structured knowledge units in `apps/studio/data/knowledge.json` (every `KIND_SPECS` kind)
 *    are upserted as artifacts in their STRUCTURED form (kind = the unit's `kind`).
 *  - The `template` units (the per-kind `template-<kind>` scaffolds + `template-adr`, which scaffolds
 *    the ADR source layer, not a knowledge kind) come from `libraryTemplates()` (ADR-0210 — re-homed
 *    from the retired generated `apps/studio/data/assets.json`; they have no structured knowledge
 *    source) and are upserted in their rendered form (kind = `template`). Validation accepts both via
 *    `validateLibraryDoc`.
 *  - Comments (`apps/studio/data/comments.json`) are loaded into the dedicated `events.comment`
 *    projection + `events.comment_event` history (NOT the library tables) via {@link loadComments}.
 *
 * `loadCorpus` is store-agnostic (works against InMemoryStore in tests). `loadComments` is
 * Postgres-specific because comments use their own tables, outside the narrow library {@link Store}.
 */

/** A loaded knowledge unit, kept loose so validation happens at the store boundary. */
interface KnowledgeUnitLike {
  id: string;
  kind: string;
  [k: string]: unknown;
}

interface CommentLike {
  id: string;
  [k: string]: unknown;
}

/** Resolve a path inside `apps/studio/data/` relative to the repo root (this file's location). */
function dataPath(file: string): string {
  // packages/library/src/store/load-corpus.ts -> repo root is four dirs up.
  return fileURLToPath(new URL(`../../../../apps/studio/data/${file}`, import.meta.url));
}

export interface LoadCorpusResult {
  knowledge: number;
  templates: number;
}

/**
 * Read the studio data files and upsert every library artifact into `store`: the structured
 * knowledge units (from knowledge.json) and the generated `template` artifacts (from assets.json).
 * Returns the counts loaded. Validation happens inside {@link Store.upsertDoc} (the loud boundary).
 */
export async function loadCorpus(store: Store): Promise<LoadCorpusResult> {
  const units = JSON.parse(await readFile(dataPath("knowledge.json"), "utf8")) as KnowledgeUnitLike[];
  const templates = libraryTemplates();

  for (const unit of units) {
    await store.upsertDoc({ id: unit.id, kind: unit.kind, doc: unit, actor: "corpus-migration" });
  }
  for (const tpl of templates) {
    await store.upsertDoc({ id: tpl.id, kind: "template", doc: tpl, actor: "corpus-migration" });
  }

  return { knowledge: units.length, templates: templates.length };
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
  /** The store to seed corpus artifacts into. */
  store: Store;
  /** Load the knowledge corpus into `store`. */
  loadCorpus: (store: Store) => Promise<LoadCorpusResult>;
  /** Load comments (Postgres-specific in production; fakeable offline). */
  loadComments: () => Promise<number>;
}

/**
 * Orchestration core: apply schema, load corpus, load comments — in that order.
 * Extracted from `main()` as the R2 refactor-for-testability target (library#gate-4 / ADR-0098 d.6).
 * `main()` wires the real (pool-bound) deps; tests inject fakes.
 */
export async function runSeed(deps: SeedDeps): Promise<void> {
  await deps.applySchema();
  const counts = await deps.loadCorpus(deps.store);
  const comments = await deps.loadComments();
  console.log(
    `loaded ${counts.knowledge} knowledge units + ${counts.templates} templates, ${comments} comments`,
  );
}

/**
 * Script entry: when this file is the process entry point, build a live pool, apply the schema,
 * load the full corpus + comments, then tear down. NEVER invoked during tests (entry-guarded).
 */
async function main(): Promise<void> {
  const { pool, connector } = await createPool();
  try {
    const store = new PgLibraryStore(pool);
    await runSeed({
      applySchema: () => applySchema(pool),
      store,
      loadCorpus,
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
