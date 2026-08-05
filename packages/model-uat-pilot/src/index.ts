/**
 * `@storytree/model-uat-pilot` — the model-uat-pilot organism.
 *
 * Three-story pilot migration harness (ADR-0209 D8): parse/assert/report
 * explicit witness classification + detail-pointer coverage for
 * drive-machinery, library-review, and library-tech-tree-overlay.
 * Consumers import `@storytree/model-uat-pilot`, never a sibling file.
 *
 * The seed-file helpers retired with the committed detail seed directory
 * (ADR-0307 D5) — detail bodies are live-canonical, so this harness reads
 * story files only and stays hermetic.
 */

export { PILOT_STORY_IDS, isPilotStoryId } from "./pilot-cast.js";
export type { PilotStoryId } from "./pilot-cast.js";

export {
  assertPilotMigrationComplete,
  isMigratedCriterion,
  reportPilotMigration,
} from "./pilot-migration-harness.js";
export type {
  PilotPaths,
  PilotMigrationReport,
  StoryMigrationReport,
} from "./pilot-migration-harness.js";
