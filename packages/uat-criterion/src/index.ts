/**
 * `@storytree/uat-criterion` — the uat-criterion-detail organism.
 *
 * Seed-canonical per-criterion Library detail artifacts (ADR-0209 D5/D6):
 * kind schema, seed-canonical reconcile, criterion pointer, hash-anchor
 * invalidation, and story-author write-scope. The public root barrel
 * re-exports every capability module's public surface — consumers import
 * `@storytree/uat-criterion`, never a sibling capability file directly.
 */

export {
  UAT_CRITERION_DETAIL_KIND,
  UatCriterionDetailRef,
  UatCriterionDetail,
} from "./detail-kind.js";
export type { UatCriterionDetail as UatCriterionDetailType } from "./detail-kind.js";

export {
  DetailArtifactId,
  CriterionDetailBinding,
  bindDetail,
  displayTitle,
  parseCriterionPointers,
} from "./criterion-pointer.js";
export type { DisplayableBinding } from "./criterion-pointer.js";

export {
  computeDetailHash,
  computeDetailAnchor,
  classifyDetailAnchor,
} from "./detail-hash.js";
export type { DetailHashInput, DetailAnchor, DetailAnchorFreshness } from "./detail-hash.js";

export { diffDetails, reconcileDetails } from "./detail-seed-sync.js";
export type { DetailDiff, ReconcileDetailsResult } from "./detail-seed-sync.js";

export {
  LIBRARY_SEED_KIND_ROOT,
  UAT_CRITERION_DETAIL_SEED_DIR,
  isStoryAuthorWriteAllowed,
} from "./story-author-scope.js";
