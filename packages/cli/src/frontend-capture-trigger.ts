// Whether a branch's diff is worth a corpus-scale comparative capture
// (frontend-visual-judgment-arc, increment `frontend-corpus-scale-comparative-capture`).
//
// REUSES `ci-affected.ts`'s classifier — the same one CI and `pnpm gate --scope` already run — rather
// than a new hand-rolled path list (the increment's own design note, restating ADR-0195/ADR-0304 D2:
// "reuse the affected-classifier, do not write a second one"). This module adds nothing to WHAT counts
// as a change; it only names WHICH classified projects are the rendered forest-map surface.
//
// FAILS WIDE, the way ADR-0324's librarian-curation trigger does: a `full` classification (an
// unmapped path, a package.json, the corpus-seed dir, or an unreadable `origin/main` — see
// `ci-affected.ts`'s own header) is read as "capture", never "skip". Only a genuinely `affected`
// scope whose projects are ALL outside the render surface may skip.

import type { AffectedScope } from "./ci-affected.js";

/**
 * Workspace project NAMES (the `package.json` `name`, not the dir) that constitute the rendered
 * forest-map surface: the studio app that mounts TreeView/SceneView, plus the pure geometry/scene
 * packages `frontend-builder`'s own tool scope names ("the render layer + `src/lib` generators").
 * Extending this set is a statement about what counts as the render surface, not a quiet edit —
 * keep it in sync with `frontend-builder`'s tool-scope prose if it ever widens.
 */
export const RENDER_SURFACE_PROJECTS: ReadonlySet<string> = new Set([
  "studio",
  "@storytree/forest-world",
  "@storytree/forest-world-r3f",
  "@storytree/app-surface",
]);

/** The trigger verdict: whether a comparative capture is worth running, and why. */
export interface RenderSurfaceTrigger {
  readonly affected: boolean;
  readonly reason: string;
}

/**
 * Decide whether `scope` (already classified by `classifyChangedFiles`) touches the render surface.
 * `full` fails wide (always affected); `affected` fires only when at least one touched project is a
 * render-surface project.
 */
export function renderSurfaceTrigger(scope: AffectedScope): RenderSurfaceTrigger {
  if (scope.mode === "full") {
    return {
      affected: true,
      reason: `full scope (${scope.reason}) — fails wide, so the capture runs`,
    };
  }
  const touched = scope.projects.filter((p) => RENDER_SURFACE_PROJECTS.has(p));
  if (touched.length > 0) {
    return {
      affected: true,
      reason: `touches render-surface project(s): ${touched.join(", ")}`,
    };
  }
  return {
    affected: false,
    reason:
      scope.projects.length > 0
        ? `affected scope touches ${scope.projects.join(", ")}, none of them the render surface`
        : "affected scope touches no projects",
  };
}
