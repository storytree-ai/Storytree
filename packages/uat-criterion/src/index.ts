/**
 * `@storytree/uat-criterion` — the uat-criterion-detail organism.
 *
 * Per-criterion Library detail artifacts (ADR-0209 D5/D6): kind schema,
 * criterion pointer, hash-anchor invalidation, and story-author write-scope.
 * The tier is LIVE-canonical (ADR-0307 D5) — the committed seed directory and
 * its store→store reconciler were retired with the seed-canonical posture.
 * The public root barrel re-exports every capability module's public surface —
 * consumers import `@storytree/uat-criterion`, never a sibling capability file
 * directly.
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

export { isStoryAuthorWriteAllowed } from "./story-author-scope.js";
