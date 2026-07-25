/**
 * The build spawn boundary organism (story `context-traversal-spawn`, ADR-0235 / ADR-0241).
 *
 * A `--real`/`--live` build spawns one child leaf session per authoring slice. This package turns
 * that boundary's per-slice run accounting into linked parent/child traversal lanes and appends
 * them through `context-traversal-capture`'s existing sink.
 *
 * The barrel is deliberately EMPTY at scaffold time: one export line is appended per capability as
 * that capability's source lands. A barrel that re-exports a not-yet-authored file makes
 * `pnpm -r typecheck` red before the first build can observe its own red.
 */

export {};
