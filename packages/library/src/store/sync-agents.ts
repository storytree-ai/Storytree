import type { Store } from "@storytree/storage-protocol";
import { InMemoryStore } from "@storytree/storage-protocol";
import { loadCorpus } from "./load-corpus.js";

/**
 * Reconcile the Library's `agent` tier from the SEED to a target store (ADR-0055).
 *
 * The agent tier is **seed-canonical**: agents are authored in `apps/studio/data/knowledge.json`
 * and the renderer (`storytree agents`, the CLAUDE.md region per ADR-0051, the `.claude/agents`
 * files per ADR-0052) reads the seed offline. That is the EXCEPTION to ADR-0023's live-store-is-the-
 * edit-surface default, which still holds for every OTHER kind. Because edits land in the seed, the
 * live Cloud SQL projection drifts unless it is re-synced — twice now (PR #117 reshape, ADR-0051/0052
 * rename+extend) the seed changed and the live tier was left stale, breaking `storytree agents --pg`
 * and the studio. This is the one reusable mechanism that closes that loop.
 *
 * The reconciliation is intentionally **agent-kind only** and idempotent.
 */

export const AGENT_KIND = "agent";

export interface SyncAgentsResult {
  /** Agent ids in the target BEFORE reconciliation (sorted). */
  readonly before: readonly string[];
  /** The canonical agent ids from the source/seed (sorted). */
  readonly seed: readonly string[];
  /** Agent ids upserted from the source into the target (sorted). */
  readonly upserted: readonly string[];
  /** Target agent ids deleted because they were absent from the source (sorted). */
  readonly deleted: readonly string[];
  /** Agent ids in the target AFTER reconciliation (sorted). */
  readonly after: readonly string[];
  /** True iff the target's agent tier now equals the source's exactly. */
  readonly inSync: boolean;
}

function sortedIds(docs: { id: string }[]): string[] {
  return docs.map((d) => d.id).sort();
}

export interface AgentDiff {
  /** The canonical agent ids from the source/seed (sorted). */
  readonly seed: readonly string[];
  /** The agent ids currently in the target (sorted). */
  readonly live: readonly string[];
  /** Seed agent ids absent from the target (a sync would CREATE these). */
  readonly missing: readonly string[];
  /** Target agent ids absent from the seed (a sync would DELETE these). */
  readonly extra: readonly string[];
  /** True iff the target's agent tier equals the source's exactly (id-set parity). */
  readonly inSync: boolean;
}

/**
 * READ-ONLY id-set comparison of the `agent` tier between `source` and `target` — the diff a sync
 * would close, with no writes. Used by the best-effort live drift check (`check:agents-sync`).
 */
export async function diffAgents(source: Store, target: Store): Promise<AgentDiff> {
  const seed = sortedIds(await source.queryDocs({ kind: AGENT_KIND }));
  const live = sortedIds(await target.queryDocs({ kind: AGENT_KIND }));
  const seedSet = new Set(seed);
  const liveSet = new Set(live);
  return {
    seed,
    live,
    missing: seed.filter((id) => !liveSet.has(id)),
    extra: live.filter((id) => !seedSet.has(id)),
    inSync: seed.length === live.length && seed.every((id, i) => id === live[i]),
  };
}

/** Convenience over {@link diffAgents}: compare `target` against the SEED corpus (read-only). */
export async function diffSeedAgents(target: Store): Promise<AgentDiff> {
  const seed = new InMemoryStore();
  await loadCorpus(seed);
  return diffAgents(seed, target);
}

/**
 * Make `target`'s `agent` tier equal `source`'s: upsert every source agent, then delete every
 * target agent whose id is NOT in the source. ONLY touches `kind === "agent"` — docs of any other
 * kind in either store are never read or written. Idempotent: a second run upserts identical content
 * and deletes nothing. Writes are validated at the target's write boundary (a malformed agent doc
 * fails loud), so a broken seed agent surfaces rather than corrupting the live tier.
 */
export async function reconcileAgents(
  source: Store,
  target: Store,
  opts?: { actor?: string },
): Promise<SyncAgentsResult> {
  const actor = opts?.actor ?? "agent-tier-sync";

  const seedAgents = await source.queryDocs({ kind: AGENT_KIND });
  const seedIds = new Set(seedAgents.map((d) => d.id));
  const before = sortedIds(await target.queryDocs({ kind: AGENT_KIND }));

  const upserted: string[] = [];
  for (const d of seedAgents) {
    await target.upsertDoc({ id: d.id, kind: AGENT_KIND, doc: d.doc, actor });
    upserted.push(d.id);
  }

  const deleted: string[] = [];
  for (const id of before) {
    if (!seedIds.has(id)) {
      await target.deleteDoc(id);
      deleted.push(id);
    }
  }

  const after = sortedIds(await target.queryDocs({ kind: AGENT_KIND }));
  const seed = [...seedIds].sort();
  const inSync = after.length === seed.length && after.every((id, i) => id === seed[i]);

  return {
    before,
    seed,
    upserted: upserted.sort(),
    deleted: deleted.sort(),
    after,
    inSync,
  };
}

/**
 * Convenience over {@link reconcileAgents}: load the SEED corpus (apps/studio/data) into a throwaway
 * in-memory store and reconcile `target`'s agent tier to it. This is what `storytree library
 * sync-agents --pg` runs against the live store. `loadCorpus` validates every unit as it seeds, so a
 * malformed seed never reaches the target.
 */
export async function syncSeedAgents(
  target: Store,
  opts?: { actor?: string },
): Promise<SyncAgentsResult> {
  const seed = new InMemoryStore();
  await loadCorpus(seed);
  return reconcileAgents(seed, target, opts);
}
