/**
 * story-author's write fence: a pure `(relPath: string) => boolean` predicate over a path string —
 * no SDK, no store, no filesystem access.
 *
 * It admits exactly ONE root, `stories/**` — the work-hierarchy surface story-author owns.
 * Everything else is fail-closed denied: `packages/**`, `apps/**`, ADRs, gate/config, and any other
 * foreign path.
 *
 * **Why there is no longer a second admitted root (ADR-0307 D5).** ADR-0209 D5 widened this fence to
 * a per-kind seed directory (`apps/studio/data/seed-kinds/uat-criterion/`), because the detail tier
 * was *seed-canonical* — story-author authored a criterion and its detail body as one atomic pair of
 * FILE writes. ADR-0307 D5 withdraws that posture: every Library kind is live-canonical, so a detail
 * body is now authored into the shared store (`storytree library artifact new|edit … --pg`), never
 * as a committed file. A detail write is therefore no longer a file write at all, and a file fence
 * has nothing left to admit for it. The pair is still authored together; only the second half's
 * medium changed.
 */

/** The work-hierarchy surface — the one admitted root. */
const STORIES_ROOT = "stories/";

/**
 * story-author's write-scope predicate. Admits `stories/**` and fail-closed denies every other
 * path, including a prefix collision on the root segment (`stories-other/` is not `stories/`) and
 * path traversal.
 */
export function isStoryAuthorWriteAllowed(relPath: string): boolean {
  const normalized = relPath.replace(/\\/g, "/");

  // Fail-closed against traversal — never let ".." smuggle a write outside the admitted root.
  if (normalized.split("/").includes("..")) {
    return false;
  }

  return normalized.startsWith(STORIES_ROOT);
}
