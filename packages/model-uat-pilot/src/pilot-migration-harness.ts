import { readFileSync, readdirSync } from "node:fs";
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
  UatCriterionDetail,
  displayTitle,
  UAT_CRITERION_DETAIL_SEED_DIR,
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

function emptyWitnessCounts(): Record<ClassifiedWitness, number> {
  return { machine: 0, model: 0, human: 0 };
}

function storyMdPath(repoRoot: string, storyId: PilotStoryId): string {
  return join(repoRoot, "stories", storyId, "story.md");
}

function seedDir(repoRoot: string): string {
  return join(repoRoot, UAT_CRITERION_DETAIL_SEED_DIR);
}

/** On-disk filename for a detail id (`#` → `__`). */
export function detailSeedFilename(detailId: string): string {
  return `${detailId.replace(/#/g, "__")}.json`;
}

function loadDetail(repoRoot: string, detailId: string): UatCriterionDetail {
  const path = join(seedDir(repoRoot), detailSeedFilename(detailId));
  const raw = JSON.parse(readFileSync(path, "utf8")) as unknown;
  return UatCriterionDetail.parse(raw);
}

function loadStoryBody(repoRoot: string, storyId: PilotStoryId): string {
  return readFileSync(storyMdPath(repoRoot, storyId), "utf8");
}

/**
 * Assert the three pilot stories are fully migrated: zero legacy-unresolved
 * `either`, every model has a tier, every criterion has a resolvable detail
 * pointer whose seed body validates, and display titles stay story-owned.
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
      const detail = loadDetail(paths.repoRoot, binding.detailArtifactId);
      if (detail.id !== binding.detailArtifactId) {
        throw new Error(
          `${c.criterionId}: detail id mismatch seed=${detail.id} pointer=${binding.detailArtifactId}`,
        );
      }
      if (displayTitle({ criterion: c, detail }) !== c.title) {
        throw new Error(`${c.criterionId}: displayTitle must stay story-owned`);
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

/** List seed detail ids present on disk under the admitted seed dir. */
export function listSeedDetailIds(repoRoot: string): string[] {
  const dir = seedDir(repoRoot);
  return readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => f.replace(/\.json$/, "").replace(/__/g, "#"))
    .sort();
}

export type { CriterionDetailBinding };
