import type { Store } from "@storytree/storage-protocol";
import { InMemoryStore } from "@storytree/storage-protocol";
import { loadCorpus } from "./load-corpus.js";
import { AGENT_KIND } from "./sync-agents.js";

/**
 * Reconcile the Library's NON-AGENT tier from the SEED to a target store — the migration step that
 * closes the ADR-0095 graduation gap (amends ADR-0023 / ADR-0055's seed-vs-live model).
 *
 * The non-agent tier (principle / definition / pattern / guardrail / techstack / process /
 * open-question / proposal / template) is **live-canonical** (ADR-0023): the live Cloud SQL store is
 * the edit surface, and `apps/studio/data/knowledge.json` is a migration seed / lagging export, NOT
 * the edit-here surface. But the ADR-0095 graduation flow WRITES a freshly-derived principle into the
 * seed (so the offline agent renderer — `build:claude`/`build:agents` — picks it up), which leaves it
 * **seed-only**: `storytree library artifact <id> --pg` returns "no artifact", `artifact edit <id>
 * --pg` has nothing to act on, and any agent that cites it renders a `> MISSING REF` against the LIVE
 * store and the studio. This reconcile carries that newly-graduated artifact across into the live tier.
 *
 * The conflict policy is the INVERSE of the seed-canonical agent sync ({@link reconcileAgents}), and
 * the difference is the whole point:
 *
 *  - **MIGRATE-ONLY (upsert ABSENT, never overwrite).** A seed artifact already present in the live
 *    store is LEFT ALONE — its live content may carry `artifact edit --pg` edits the seed has not
 *    caught up to. Overwriting it would revert those live-canonical edits, the exact harm
 *    `load-corpus.ts --force` does and that this command must NOT.
 *  - **NEVER DELETE.** A live artifact absent from the seed is a live-canonical CREATION (the normal
 *    case — most artifacts are born via `artifact new --pg` and exported to the seed only later, if
 *    ever), not stale drift. The agent sync deletes seed-absent agents because the seed is canonical
 *    there; here the live store is canonical, so a seed-absent live artifact is kept.
 *
 * The net effect is idempotent: the first run carries the seed-only graduates across, a second run
 * finds them present and creates nothing. Writes are validated at the target's write boundary, so a
 * malformed seed artifact fails loud rather than corrupting the live tier.
 */

function sortedIds(docs: { id: string }[]): string[] {
  return docs.map((d) => d.id).sort();
}

function nonAgent(docs: { kind: string }[]): { id: string; kind: string; doc: unknown }[] {
  return docs.filter((d) => d.kind !== AGENT_KIND) as { id: string; kind: string; doc: unknown }[];
}

export interface SyncCorpusResult {
  /** The non-agent artifact ids in the source/seed (sorted). */
  readonly seed: readonly string[];
  /** The non-agent artifact ids in the target BEFORE reconciliation (sorted). */
  readonly before: readonly string[];
  /** Seed artifacts CREATED in the target because they were absent from the live store (sorted). */
  readonly created: readonly string[];
  /** Seed artifacts left untouched because they already exist live (live-canonical; sorted). */
  readonly skipped: readonly string[];
  /** The non-agent artifact ids in the target AFTER reconciliation (sorted). */
  readonly after: readonly string[];
  /** True iff every seed non-agent artifact is now present in the target (the gap is closed). */
  readonly complete: boolean;
}

export interface CorpusDiff {
  /** The non-agent artifact ids in the source/seed (sorted). */
  readonly seed: readonly string[];
  /** The non-agent artifact ids currently in the target (sorted). */
  readonly live: readonly string[];
  /** Seed non-agent ids ABSENT from the target — a sync would CREATE these (sorted). */
  readonly missing: readonly string[];
  /** True iff no seed non-agent artifact is missing from the target. */
  readonly complete: boolean;
}

/**
 * READ-ONLY id-set comparison of the non-agent tier: the seed ids missing from `target`, with no
 * writes. Deliberately ASYMMETRIC vs {@link diffAgents} — it reports only `missing` (the migration
 * gap), NOT live ids absent from the seed, because under live-canonical those are expected creations,
 * not drift. Used by the best-effort live drift check (`check:corpus-sync`).
 */
export async function diffCorpus(source: Store, target: Store): Promise<CorpusDiff> {
  const seed = sortedIds(nonAgent(await source.queryDocs()));
  const live = sortedIds(nonAgent(await target.queryDocs()));
  const liveSet = new Set(live);
  const missing = seed.filter((id) => !liveSet.has(id));
  return { seed, live, missing, complete: missing.length === 0 };
}

/** Convenience over {@link diffCorpus}: compare `target` against the SEED corpus (read-only). */
export async function diffSeedCorpus(target: Store): Promise<CorpusDiff> {
  const seed = new InMemoryStore();
  await loadCorpus(seed);
  return diffCorpus(seed, target);
}

/**
 * Carry every NON-AGENT source artifact ABSENT from `target` into it; leave artifacts already present
 * untouched (migrate-only — see the module doc). ONLY skips `kind === "agent"` (that tier has its own
 * seed-canonical {@link reconcileAgents}); every other kind is in scope. Presence is tested against
 * the target's FULL id set, so an id already held under any kind is never overwritten. Idempotent: a
 * second run creates nothing. Validation happens at the target's write boundary.
 */
export async function reconcileCorpus(
  source: Store,
  target: Store,
  opts?: { actor?: string },
): Promise<SyncCorpusResult> {
  const actor = opts?.actor ?? "corpus-tier-sync";

  const seedDocs = nonAgent(await source.queryDocs());
  const liveDocs = await target.queryDocs();
  const liveAllIds = new Set(liveDocs.map((d) => d.id));
  const before = sortedIds(nonAgent(liveDocs));

  const created: string[] = [];
  const skipped: string[] = [];
  for (const d of seedDocs) {
    if (liveAllIds.has(d.id)) {
      skipped.push(d.id);
      continue;
    }
    await target.upsertDoc({ id: d.id, kind: d.kind, doc: d.doc, actor });
    created.push(d.id);
  }

  const afterDocs = await target.queryDocs();
  const after = sortedIds(nonAgent(afterDocs));
  const afterAllIds = new Set(afterDocs.map((d) => d.id));
  const seed = sortedIds(seedDocs);
  const complete = seed.every((id) => afterAllIds.has(id));

  return {
    seed,
    before,
    created: created.sort(),
    skipped: skipped.sort(),
    after,
    complete,
  };
}

/**
 * Convenience over {@link reconcileCorpus}: load the SEED corpus (apps/studio/data) into a throwaway
 * in-memory store and migrate `target`'s non-agent tier from it. This is what `storytree library
 * sync-corpus --pg` runs against the live store. `loadCorpus` validates every unit as it seeds, so a
 * malformed seed artifact never reaches the target.
 */
export async function syncSeedCorpus(
  target: Store,
  opts?: { actor?: string },
): Promise<SyncCorpusResult> {
  const seed = new InMemoryStore();
  await loadCorpus(seed);
  return reconcileCorpus(seed, target, opts);
}
