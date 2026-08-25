import type { Pool } from "pg";

import {
  countWorkHierarchy,
  ProjectedCapability,
  ProjectedStory,
  WorkHierarchySnapshot,
} from "../work-hierarchy-projection.js";

/**
 * The Postgres home of the WORK-HIERARCHY PROJECTION (ADR-0445 D1, `map-freshness-arc` inc-02).
 *
 * Five tables (`events.work_hierarchy_snapshot` + `work_story` / `work_capability` /
 * `work_criterion` / `work_gate`, declared in `schema.sql`) holding a one-directional mirror of
 * `stories/**` so the forest map's QUESTION half can eventually be read from the same place its
 * PROOF half already is. The shape, and why it carries authored facts rather than folded ones, is
 * documented once in `../work-hierarchy-projection.ts`; this module is only its persistence.
 *
 * ## A WHOLE-SNAPSHOT REPLACE, IN ONE TRANSACTION
 *
 * {@link PgWorkHierarchyStore.writeSnapshot} deletes every row and re-inserts, rather than upserting
 * per id. That is not laziness: the projection is TOTAL over the tree, so a story DELETED from
 * `stories/**` has to vanish from here, and an upsert-only loader can never express a deletion — it
 * would leave a retired story standing in the store forever, reading to a later reader as a story the
 * checkout simply failed to mention. Postgres MVCC means a concurrent reader sees the PREVIOUS
 * complete snapshot until COMMIT, so the replace is never observable half-done.
 *
 * ## NOTHING HERE IS AN AUTHORING SURFACE
 *
 * There is one writer (`hierarchy:load`) and one direction (checkout → store). No route, no CLI verb
 * and no studio surface writes these rows, and none may: `story-author` writes markdown under
 * `stories/**` and nothing else (ADR-0309 D3). A second writer would make the mirror the thing that
 * drifts, which is ADR-0302's whole lesson arriving one layer down.
 *
 * ## THE CLIENT IS A SEAM
 *
 * Both methods take an optional {@link WorkHierarchyClient} so the statement SEQUENCE — that the
 * replace is bracketed by BEGIN/COMMIT and rolls back on a failure mid-way — is provable offline
 * against a recording fake, with no credential. Passing nothing uses the live pool.
 */

/** The singleton key of the stamp row — there is exactly one projection at a time. */
export const WORK_HIERARCHY_SNAPSHOT_ID = "current";

/**
 * The narrow slice of `pg`'s client this store uses, so a fake can stand in for it offline.
 *
 * Written so a real `Pool` and a real `PoolClient` SATISFY it structurally — hence `unknown[]` rather
 * than `readonly unknown[]` for the values, which a mutable `any[]` parameter would not accept. That
 * is what lets both methods below take the live handle by plain assignment instead of the
 * `as unknown as` chain an incompatible shape would have forced, and a cast that wide is exactly the
 * type evidence the house standard refuses to discard.
 */
export interface WorkHierarchyClient {
  query: (text: string, values?: unknown[]) => Promise<{ rows: unknown[] }>;
  release?: () => void;
}

/** Row shape of the stamp. */
interface SnapshotRow {
  schema_version: number;
  commit_sha: string;
  stories_tree_sha: string;
  generated_at: Date | string;
  generator: string;
}

/** Row shape of a story / capability projection row. */
interface DocRow {
  doc: unknown;
}

/** Row shape of a criterion / gate row, which carries its owning story beside the doc. */
interface OwnedDocRow {
  story_id: string;
  doc: unknown;
}

const TABLES = [
  "events.work_gate",
  "events.work_criterion",
  "events.work_capability",
  "events.work_story",
] as const;

function asIso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : String(value);
}

export class PgWorkHierarchyStore {
  constructor(private readonly pool: Pool) {}

  /**
   * Replace the stored projection with `snapshot`, in one transaction.
   *
   * `actor` is recorded on the stamp for the "who loaded this" audit. Throws on any failure, having
   * rolled back — a partially-written hierarchy is worse than an old complete one, because the drift
   * check would then report differences that describe the loader's crash rather than the tree.
   */
  async writeSnapshot(
    snapshot: WorkHierarchySnapshot,
    actor: string,
    client?: WorkHierarchyClient,
  ): Promise<void> {
    const parsed = WorkHierarchySnapshot.parse(snapshot);
    const counts = countWorkHierarchy(parsed);
    const owned: WorkHierarchyClient = client ?? (await this.pool.connect());
    try {
      await owned.query("BEGIN");
      for (const table of TABLES) await owned.query(`DELETE FROM ${table}`);

      for (const story of parsed.stories) {
        // The nested obligation arrays are dropped from the story doc: they live in their own rows,
        // and one copy cannot disagree with itself.
        const { uatTestCriteria, reliabilityGates, ...bare } = story;
        await owned.query(
          `INSERT INTO events.work_story (id, title, status, proof_mode, uat_witness, doc)
           VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
          [story.id, story.title, story.status, story.proofMode, story.uatWitness, JSON.stringify(bare)],
        );
        for (const [ordinal, criterion] of uatTestCriteria.entries()) {
          await owned.query(
            `INSERT INTO events.work_criterion
               (criterion_id, story_id, revision_id, ordinal, witness, would_be, doc)
             VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)`,
            [
              criterion.criterionId,
              story.id,
              criterion.revisionId,
              ordinal,
              criterion.witness,
              criterion.wouldBe,
              JSON.stringify(criterion),
            ],
          );
        }
        for (const [ordinal, gate] of reliabilityGates.entries()) {
          await owned.query(
            `INSERT INTO events.work_gate (id, story_id, ordinal, kind, covers, retired, doc)
             VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)`,
            [gate.id, story.id, ordinal, gate.kind, gate.covers, gate.retired ?? false, JSON.stringify(gate)],
          );
        }
      }

      for (const capability of parsed.capabilities) {
        await owned.query(
          `INSERT INTO events.work_capability
             (id, story_id, title, status, proof_mode, contract_count, doc)
           VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)`,
          [
            capability.id,
            capability.storyId,
            capability.title,
            capability.status,
            capability.proofMode,
            capability.contractCount,
            JSON.stringify(capability),
          ],
        );
      }

      await owned.query(
        `INSERT INTO events.work_hierarchy_snapshot
           (id, schema_version, commit_sha, stories_tree_sha, generated_at, generator, actor,
            story_count, capability_count, criterion_count, gate_count, at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, now())
         ON CONFLICT (id) DO UPDATE SET
           schema_version = EXCLUDED.schema_version,
           commit_sha = EXCLUDED.commit_sha,
           stories_tree_sha = EXCLUDED.stories_tree_sha,
           generated_at = EXCLUDED.generated_at,
           generator = EXCLUDED.generator,
           actor = EXCLUDED.actor,
           story_count = EXCLUDED.story_count,
           capability_count = EXCLUDED.capability_count,
           criterion_count = EXCLUDED.criterion_count,
           gate_count = EXCLUDED.gate_count,
           at = now()`,
        [
          WORK_HIERARCHY_SNAPSHOT_ID,
          parsed.schemaVersion,
          parsed.commitSha,
          parsed.storiesTreeSha,
          parsed.generatedAt,
          parsed.generator,
          actor,
          counts.stories,
          counts.capabilities,
          counts.criteria,
          counts.gates,
        ],
      );
      await owned.query("COMMIT");
    } catch (err) {
      await owned.query("ROLLBACK");
      throw err;
    } finally {
      if (client === undefined) owned.release?.();
    }
  }

  /**
   * Read the stored projection back, reassembled into a {@link WorkHierarchySnapshot}.
   *
   * `null` means NO projection has ever been loaded — deliberately distinct from an EMPTY one, which
   * would mean the loader ran against a tree with no stories. A caller must not collapse the two: one
   * says "nobody has looked", the other says "somebody looked and there was nothing there", and both
   * are failures for different reasons.
   */
  async readSnapshot(client?: WorkHierarchyClient): Promise<WorkHierarchySnapshot | null> {
    const q: WorkHierarchyClient = client ?? this.pool;
    const stamp = await q.query(
      `SELECT schema_version, commit_sha, stories_tree_sha, generated_at, generator
         FROM events.work_hierarchy_snapshot WHERE id = $1`,
      [WORK_HIERARCHY_SNAPSHOT_ID],
    );
    const row = stamp.rows[0] as SnapshotRow | undefined;
    if (row === undefined) return null;

    const [stories, capabilities, criteria, gates] = await Promise.all([
      q.query("SELECT doc FROM events.work_story"),
      q.query("SELECT doc FROM events.work_capability"),
      q.query("SELECT story_id, doc FROM events.work_criterion ORDER BY story_id, ordinal"),
      q.query("SELECT story_id, doc FROM events.work_gate ORDER BY story_id, ordinal"),
    ]);

    const criteriaByStory = new Map<string, unknown[]>();
    for (const r of criteria.rows as OwnedDocRow[]) {
      const list = criteriaByStory.get(r.story_id) ?? [];
      list.push(r.doc);
      criteriaByStory.set(r.story_id, list);
    }
    const gatesByStory = new Map<string, unknown[]>();
    for (const r of gates.rows as OwnedDocRow[]) {
      const list = gatesByStory.get(r.story_id) ?? [];
      list.push(r.doc);
      gatesByStory.set(r.story_id, list);
    }

    return WorkHierarchySnapshot.parse({
      schemaVersion: row.schema_version,
      commitSha: row.commit_sha,
      storiesTreeSha: row.stories_tree_sha,
      generatedAt: asIso(row.generated_at),
      generator: row.generator,
      stories: (stories.rows as DocRow[]).map((r) => {
        const bare = r.doc as Record<string, unknown>;
        const id = String(bare["id"] ?? "");
        return ProjectedStory.parse({
          ...bare,
          uatTestCriteria: criteriaByStory.get(id) ?? [],
          reliabilityGates: gatesByStory.get(id) ?? [],
        });
      }),
      capabilities: (capabilities.rows as DocRow[]).map((r) => ProjectedCapability.parse(r.doc)),
    });
  }
}
