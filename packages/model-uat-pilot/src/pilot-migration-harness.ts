import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  parseCriteria,
  type Criterion,
  type CriterionWitness,
  type Tier,
} from "@storytree/model-uat";

/** The three classified witness kinds (excludes legacy-unresolved `either`). */
type ClassifiedWitness = Exclude<CriterionWitness, "either">;
import {
  parseCriterionPointers,
  DetailArtifactId,
  type CriterionDetailBinding,
} from "@storytree/uat-criterion";
import { PILOT_STORY_IDS, type PilotStoryId } from "./pilot-cast.js";

export interface PilotPaths {
  /** Absolute or cwd-relative path to the repo root that holds `stories/` + seed dir. */
  readonly repoRoot: string;
}

export interface StoryMigrationReport {
  readonly storyId: PilotStoryId;
  readonly criteria: number;
  readonly byWitness: Readonly<Record<ClassifiedWitness, number>>;
  readonly byModelTier: Readonly<Partial<Record<Tier, number>>>;
  readonly detailPointers: number;
  readonly detailCoverage: number;
}

export interface PilotMigrationReport {
  readonly stories: readonly StoryMigrationReport[];
  readonly totals: {
    readonly criteria: number;
    readonly byWitness: Readonly<Record<ClassifiedWitness, number>>;
    readonly byModelTier: Readonly<Partial<Record<Tier, number>>>;
    readonly detailPointers: number;
  };
}

function emptyWitnessCounts() {
  return { machine: 0, model: 0, human: 0 } satisfies Record<ClassifiedWitness, number>;
}

function storyMdPath(repoRoot: string, storyId: PilotStoryId): string {
  return join(repoRoot, "stories", storyId, "story.md");
}

function loadStoryBody(repoRoot: string, storyId: PilotStoryId): string {
  return readFileSync(storyMdPath(repoRoot, storyId), "utf8");
}

/**
 * Assert the three pilot stories are fully migrated: zero legacy-unresolved
 * `either`, every model has a tier, and every criterion carries a well-formed
 * detail pointer.
 *
 * **This deliberately does not open the detail BODY (ADR-0307 D5).** It used to
 * read each body from the committed seed directory and re-validate it. That
 * directory is retired: the `uat-criterion` tier is live-canonical, so a body
 * now lives only in the shared store. Resolving one here would put a database
 * behind `pnpm -r test`, which is hermetic by design — no DB, no API key — so
 * the harness asserts what a story file can honestly witness on its own: that
 * every criterion is classified and points somewhere well-formed. Whether the
 * pointed-to artifact EXISTS is a live-store question and belongs to a
 * store-backed check, not to a package unit test.
 */
export function assertPilotMigrationComplete(paths: PilotPaths): void {
  for (const storyId of PILOT_STORY_IDS) {
    const body = loadStoryBody(paths.repoRoot, storyId);
    const criteria = parseCriteria(storyId, body);
    if (criteria.length === 0) {
      throw new Error(`${storyId}: expected UAT criteria, found none`);
    }
    for (const c of criteria) {
      if (c.witness === "either") {
        throw new Error(`${c.criterionId}: still legacy-unresolved either (ADR-0209 D8)`);
      }
      if (c.witness === "model" && c.tier === undefined) {
        throw new Error(`${c.criterionId}: model criterion missing tier`);
      }
    }
    const pointers = parseCriterionPointers(storyId, body);
    if (pointers.length !== criteria.length) {
      throw new Error(
        `${storyId}: detail pointers ${pointers.length} !== criteria ${criteria.length}`,
      );
    }
    const byId = new Map(pointers.map((p) => [p.criterion.criterionId, p]));
    for (const c of criteria) {
      const binding = byId.get(c.criterionId);
      if (binding === undefined) {
        throw new Error(`${c.criterionId}: missing (detail: …) pointer`);
      }
      const id = DetailArtifactId.safeParse(binding.detailArtifactId);
      if (!id.success) {
        throw new Error(
          `${c.criterionId}: malformed detail pointer "${binding.detailArtifactId}" — ${id.error.issues[0]?.message ?? "invalid"}`,
        );
      }
    }
  }
}

/**
 * An untagged / legacy-unresolved criterion must not be treated as migrated or
 * coerced into model judgment (ADR-0209 D8).
 */
export function isMigratedCriterion(criterion: Criterion): boolean {
  return criterion.witness !== "either";
}

/**
 * Report classified counts + detail coverage over the three pilots — the
 * measurement signal before corpus-wide rollout (ADR-0209 Consequences).
 */
export function reportPilotMigration(paths: PilotPaths): PilotMigrationReport {
  assertPilotMigrationComplete(paths);
  const stories: StoryMigrationReport[] = [];
  const totalsByWitness = emptyWitnessCounts();
  const totalsByTier: Partial<Record<Tier, number>> = {};
  let totalCriteria = 0;
  let totalPointers = 0;

  for (const storyId of PILOT_STORY_IDS) {
    const body = loadStoryBody(paths.repoRoot, storyId);
    const criteria = parseCriteria(storyId, body);
    const pointers = parseCriterionPointers(storyId, body);
    const byWitness = emptyWitnessCounts();
    const byModelTier: Partial<Record<Tier, number>> = {};
    for (const c of criteria) {
      if (c.witness === "either") continue;
      const w: ClassifiedWitness = c.witness;
      byWitness[w] += 1;
      totalsByWitness[w] += 1;
      if (w === "model" && c.tier !== undefined) {
        const tier = c.tier;
        byModelTier[tier] = (byModelTier[tier] ?? 0) + 1;
        totalsByTier[tier] = (totalsByTier[tier] ?? 0) + 1;
      }
    }
    totalCriteria += criteria.length;
    totalPointers += pointers.length;
    stories.push({
      storyId,
      criteria: criteria.length,
      byWitness,
      byModelTier,
      detailPointers: pointers.length,
      detailCoverage: criteria.length === 0 ? 0 : pointers.length / criteria.length,
    });
  }

  return {
    stories,
    totals: {
      criteria: totalCriteria,
      byWitness: totalsByWitness,
      byModelTier: totalsByTier,
      detailPointers: totalPointers,
    },
  };
}

export type { CriterionDetailBinding };
