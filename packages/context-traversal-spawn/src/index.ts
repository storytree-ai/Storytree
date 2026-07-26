/**
 * The build spawn boundary organism (story `context-traversal-spawn`, ADR-0235 / ADR-0241).
 *
 * A `--real`/`--live` build spawns one child leaf session per authoring slice. This package turns
 * that boundary's per-slice run accounting into linked parent/child traversal lanes and appends
 * them through `context-traversal-capture`'s existing sink.
 *
 * The barrel starts EMPTY and gains one export line per capability as that capability's source
 * lands — a barrel that re-exports a not-yet-authored file makes `pnpm -r typecheck` red before the
 * first build can observe its own red. Each line is added here, outside the leaf's write scope,
 * because a `--real` leaf is fenced to its own file pair and hits a scope wall on this file.
 */

// capability `leaf-slice-spawn-observations`
export { observeLeafSlices, BUILD_SPAWN_BOUNDARY_COVERAGE } from "./observe-leaf-slices.js";
export type { LeafSliceRun, LeafSliceUsage, ObserveLeafSlicesArgs } from "./observe-leaf-slices.js";

// capability `build-spawn-capture`
export { captureBuildSpawn } from "./build-capture.js";
export type { CaptureBuildSpawnArgs } from "./build-capture.js";

// capability `multi-adapter-replay`
export { showTraversalSessionAllAdapters } from "./replay-adapters.js";
