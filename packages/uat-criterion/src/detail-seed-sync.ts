import type { Store } from "@storytree/storage-protocol";
import { UAT_CRITERION_DETAIL_KIND } from "./detail-kind.js";

/**
 * Reconcile the `uat-criterion` detail tier from a SOURCE store to a TARGET store (ADR-0209 D5) —
 * the deliberate extension of the seed-canonical exception ADR-0055 established for the `agent`
 * kind. Mirrors `reconcileAgents`/`diffAgents` (packages/library/src/store/sync-agents.ts) shape
 * exactly, but kind-fenced to {@link UAT_CRITERION_DETAIL_KIND} only: docs of any other kind in
 * either store are never read or written.
 *
 * This module depends only on the `@storytree/storage-protocol` `Store` seam — no
 * `@storytree/library/store` import here, so no Cloud SQL / DBOS coupling. Seed loading
 * (`loadCorpus`) and the CLI `sync-uat-details --pg` command are consumer glue layered on top of
 * this pure core (ADR-0192).
 */

export interface ReconcileDetailsResult {
  /** Detail ids in the target BEFORE reconciliation (sorted). */
  readonly before: readonly string[];
  /** The canonical detail ids from the source (sorted). */
  readonly seed: readonly string[];
  /** Detail ids upserted from the source into the target (sorted). */
  readonly upserted: readonly string[];
  /** Target detail ids deleted because they were absent from the source (sorted). */
  readonly deleted: readonly string[];
  /** Detail ids in the target AFTER reconciliation (sorted). */
  readonly after: readonly string[];
  /** True iff the target's detail tier now equals the source's exactly. */
  readonly inSync: boolean;
}

export interface DetailDiff {
  /** The canonical detail ids from the source (sorted). */
  readonly seed: readonly string[];
  /** The detail ids currently in the target (sorted). */
  readonly live: readonly string[];
  /** Seed detail ids absent from the target (a sync would CREATE these). */
  readonly missing: readonly string[];
  /** Target detail ids absent from the seed (a sync would DELETE these). */
  readonly extra: readonly string[];
  /** True iff the target's detail tier equals the source's exactly (id-set parity). */
  readonly inSync: boolean;
}

function sortedIds(docs: { id: string }[]): string[] {
  return docs.map((d) => d.id).sort();
}

/**
 * READ-ONLY id-set comparison of the `uat-criterion` detail tier between `source` and `target` —
 * the diff a reconcile would close, with no writes. Used by the future best-effort
 * `check:uat-details-sync` drift gate.
 */
export async function diffDetails(source: Store, target: Store): Promise<DetailDiff> {
  const seed = sortedIds(await source.queryDocs({ kind: UAT_CRITERION_DETAIL_KIND }));
  const live = sortedIds(await target.queryDocs({ kind: UAT_CRITERION_DETAIL_KIND }));
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

/**
 * Make `target`'s `uat-criterion` detail tier equal `source`'s: upsert every source detail, then
 * delete every target detail whose id is NOT in the source. ONLY touches
 * `kind === UAT_CRITERION_DETAIL_KIND` — docs of any other kind in either store are never read or
 * written. Idempotent: a second run upserts identical content and deletes nothing.
 */
export async function reconcileDetails(
  source: Store,
  target: Store,
  opts?: { actor?: string },
): Promise<ReconcileDetailsResult> {
  const actor = opts?.actor ?? "uat-detail-tier-sync";

  const seedDetails = await source.queryDocs({ kind: UAT_CRITERION_DETAIL_KIND });
  const seedIds = new Set(seedDetails.map((d) => d.id));
  const before = sortedIds(await target.queryDocs({ kind: UAT_CRITERION_DETAIL_KIND }));

  const upserted: string[] = [];
  for (const d of seedDetails) {
    await target.upsertDoc({ id: d.id, kind: UAT_CRITERION_DETAIL_KIND, doc: d.doc, actor });
    upserted.push(d.id);
  }

  const deleted: string[] = [];
  for (const id of before) {
    if (!seedIds.has(id)) {
      await target.deleteDoc(id);
      deleted.push(id);
    }
  }

  const after = sortedIds(await target.queryDocs({ kind: UAT_CRITERION_DETAIL_KIND }));
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
