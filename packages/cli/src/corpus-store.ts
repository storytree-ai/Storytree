// Open the CANONICAL library store for a GENERATOR (ADR-0302 D1, ADR-0307 D2/D4).
//
// ADR-0307 D4 draws the line this module sits on: a **generator may hold a store connection**;
// anything on the harness's own startup or per-prompt path may not. `build:guidance` /
// `build:agents` are invoked — by a session, by the gate, by CI — so they read the live store
// directly. Their OUTPUTS stay committed files exactly as ADR-0302 D5 requires; only the SOURCE
// moves off `apps/studio/data/knowledge.json`.
//
// ## Why this fails loudly instead of falling back to the seed
//
// The seed is being decommitted, and ADR-0302 D4's rule is that mirror machinery is deleted rather
// than left inert. A generator that silently fell back to a stale committed corpus would be the
// same failure in a different costume: it would regenerate CLAUDE.md from an OLD agent artifact,
// `check:guidance` would report "in sync", and the live edit a session had just made would appear
// to have been reverted with nothing naming the cause. So an unreachable store is a hard, named
// failure here — never a degraded success.
//
// ## The two reachable shapes
//
// `STORYTREE_STORE_URL` (the ADR-0259 store door, ordinary HTTPS) wins when set, because it is the
// only shape a client without a Cloud SQL connector can reach; otherwise the direct keyless
// connector (ADR-0021). Both are READ paths — a generator never writes to the store.

import { HttpStore, type Store } from "@storytree/storage-protocol";
import { createPool, closePool, PgLibraryStore } from "@storytree/library/store";

import { loadLocalSecrets } from "./secrets.js";
import { resolveStoreDoor, STORE_DOOR_URL_ENV, type StoreDoorConfig } from "./store-door.js";

/** Which live source a generator will read. Resolved from the environment, never guessed. */
export type CorpusSource =
  | { readonly kind: "door"; readonly door: StoreDoorConfig }
  | { readonly kind: "pg" };

/** An open corpus store plus its teardown. Always `close()` in a `finally`. */
export interface OpenCorpusStore {
  readonly store: Store;
  readonly source: CorpusSource;
  close(): Promise<void>;
}

/**
 * Pick the live source from the environment: the store door when `STORYTREE_STORE_URL` is set,
 * otherwise the direct Cloud SQL connector. Pure — the whole environment-shaped decision, so the
 * precedence is asserted by unit test rather than inferred from a live run.
 */
export function chooseCorpusSource(env: NodeJS.ProcessEnv): CorpusSource {
  const door = resolveStoreDoor(env);
  return door ? { kind: "door", door } : { kind: "pg" };
}

/**
 * The message a generator dies with when the live store cannot be read. Pure, so the remedy text is
 * covered by a test — this is the error a session actually meets when the DB is down, and it has to
 * name the source it tried and the command that fixes it.
 */
export function corpusUnreachableMessage(tool: string, source: CorpusSource, cause: string): string {
  const where =
    source.kind === "door"
      ? `the store door at ${source.door.baseUrl} (${STORE_DOOR_URL_ENV})`
      : "the live Cloud SQL store";
  const remedy =
    source.kind === "door"
      ? `Check ${STORE_DOOR_URL_ENV} and its credential, or unset it to use the direct connector.`
      : "Bring the store up with `pnpm db:up` (then `pnpm db:probe` to confirm) and re-run.";
  return [
    `${tool} — cannot read ${where}: ${cause}`,
    "",
    "The live store is the only source of truth (ADR-0302 D1); this generator does NOT fall back to",
    "a committed corpus, because regenerating guidance from a stale source reports success while",
    "silently reverting live edits.",
    remedy,
  ].join("\n");
}

/**
 * Open the live library store for `tool`, or throw {@link corpusUnreachableMessage}.
 *
 * Secrets are hydrated first (`STORYTREE_DB_USER` from `~/.storytree/secrets.json` when unset), so
 * a session needs no env prefix — the same ergonomics every other `--pg` path already has.
 */
export async function openCorpusStore(tool: string): Promise<OpenCorpusStore> {
  const source = chooseCorpusSource(process.env);
  if (source.kind === "door") {
    return { store: new HttpStore(source.door), source, close: async () => {} };
  }
  await loadLocalSecrets();
  try {
    const { pool, connector } = await createPool();
    return {
      store: new PgLibraryStore(pool),
      source,
      close: () => closePool(pool, connector),
    };
  } catch (err) {
    throw new Error(corpusUnreachableMessage(tool, source, err instanceof Error ? err.message : String(err)));
  }
}
