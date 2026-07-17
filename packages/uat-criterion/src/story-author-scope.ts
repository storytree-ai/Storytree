import { UAT_CRITERION_DETAIL_KIND } from "./detail-kind.js";

/**
 * story-author's widened write fence (ADR-0209 D5): a pure `(relPath: string) => boolean`
 * predicate that is the lawful write fence once story-author's authority extends beyond the
 * work hierarchy alone. It admits exactly the atomic pair:
 *
 *   - `stories/**` — the existing work-hierarchy surface (preserved default).
 *   - the detail-kind seed surface (`UAT_CRITERION_DETAIL_SEED_DIR`) — the seed-corpus
 *     subdirectory for the `uat-criterion` Library kind, named FROM
 *     `UAT_CRITERION_DETAIL_KIND` so the fence and the kind schema can never silently drift
 *     apart.
 *
 * Everything else — every other Library kind's seed path, `packages/**`, `apps/**`, ADRs,
 * gate/config, and any other foreign path — is fail-closed denied. This is a pure function
 * over a path string: no SDK, no store, no filesystem access.
 */

/**
 * The shared seed-corpus root: one subdirectory per Library kind sits beneath it. This is the
 * layout the widened fence is scoped against — admitting one kind's subdirectory must never
 * admit a neighbouring kind's.
 */
export const LIBRARY_SEED_KIND_ROOT = "apps/studio/data/seed-kinds/";

/**
 * The `uat-criterion` detail-kind's seed subdirectory, built from the shared root plus the
 * kind constant itself (never a disconnected literal).
 */
export const UAT_CRITERION_DETAIL_SEED_DIR = `${LIBRARY_SEED_KIND_ROOT}${UAT_CRITERION_DETAIL_KIND}/`;

/** The existing work-hierarchy surface, preserved as the default admitted root. */
const STORIES_ROOT = "stories/";

/**
 * story-author's write-scope predicate. Admits `stories/**` and the detail-kind seed surface;
 * fail-closed denies every other path, including a prefix collision on the kind segment (e.g.
 * `uat-criterion-extra/` is a different directory than `uat-criterion/`) and path traversal.
 */
export function isStoryAuthorWriteAllowed(relPath: string): boolean {
  const normalized = relPath.replace(/\\/g, "/");

  // Fail-closed against traversal — never let ".." smuggle a write outside either admitted root.
  if (normalized.split("/").includes("..")) {
    return false;
  }

  if (normalized.startsWith(STORIES_ROOT)) {
    return true;
  }

  if (normalized.startsWith(UAT_CRITERION_DETAIL_SEED_DIR)) {
    return true;
  }

  return false;
}
