// Runtime-root resolver (ADR-0181) — the desktop serves code from a pinned-`main` runtime worktree,
// decoupled from the developer's working checkout.
//
// WHY: main.ts derived STUDIO_DIST + BACKEND_ENTRY, and the sidecar its repoRoot/stories/docs, from
// `appRoot` (app.getAppPath()) — i.e. whatever checkout the Electron shell launched from, which in
// practice is a DIRTY feature branch (the observed 2026-07-08 bug: the app served
// `claude/win-arm-real-worktree-fix` WIP instead of merged `main`). This resolver is the seam that
// fixes it: a CONFIGURED runtime worktree path is authoritative and FAIL-CLOSED — it must EXIST and be
// on `main`, else resolution refuses rather than silently serving a stray branch. When no runtime is
// configured, it falls back to the launch checkout (today's behaviour) so a developer launching the
// shell from a worktree during development is unaffected.
//
// This module is PURE (no node:fs, no node:child_process): the Electron glue (main.ts) supplies the
// `exists`/`branchOf` probes over real fs+git; the test drives them with in-memory doubles. The
// operator witnesses the resolved runtime in the launched app (ADR-0070) — this pure core proves the
// decision logic, the wiring is attested.

/** The environment variable that points the desktop at its pinned-`main` runtime worktree. */
export const RUNTIME_ROOT_ENV = "STORYTREE_DESKTOP_RUNTIME";

/** The branch the runtime worktree must be on — the desktop serves pinned, CI-proven `main` only. */
export const RUNTIME_BRANCH = "main";

/** Inputs to the resolve: the configured runtime path (null when unset) and the launch checkout root. */
export interface RuntimeRootConfig {
  /** The configured runtime worktree path (from {@link RUNTIME_ROOT_ENV} / desktop.runtime.json), or null. */
  configured: string | null;
  /** The checkout the Electron shell launched from — the fallback when nothing is configured. */
  launchRoot: string;
}

/** The injected filesystem+git probes so the resolve is pure and offline-testable. */
export interface RuntimeRootProbes {
  /** True iff `path` exists as a directory the app can serve from. */
  exists: (path: string) => boolean;
  /** The git branch checked out at `path`, or null when it is not a resolvable git worktree. */
  branchOf: (path: string) => string | null;
}

/**
 * The resolve outcome. `source` distinguishes the pinned-runtime path (`"runtime"`) from the
 * dev-convenience fallback (`"launch"`) so the caller can log which one the app is serving. A refusal
 * carries an actionable, self-contained error (never a silent fallback to a stray branch).
 */
export type RuntimeRootResolution =
  | { ok: true; root: string; source: "runtime" | "launch" }
  | { ok: false; error: string };

/**
 * Resolve the root the desktop serves from, fail-closed (ADR-0181 Decision 1):
 *  - No runtime configured → serve the launch checkout (`source: "launch"`), today's behaviour.
 *  - Configured but MISSING → refuse with a `git worktree add` hint (never fall back to the launch
 *    checkout, which would re-introduce the stray-branch bug the configuration exists to prevent).
 *  - Configured but NOT on `main` → refuse: the desktop must serve pinned `main`, not whatever branch
 *    the runtime worktree drifted to.
 *  - Configured, present, on `main` → serve it (`source: "runtime"`).
 */
export function resolveRuntimeRoot(
  config: RuntimeRootConfig,
  probes: RuntimeRootProbes,
): RuntimeRootResolution {
  const configured = config.configured?.trim();
  if (!configured) {
    return { ok: true, root: config.launchRoot, source: "launch" };
  }
  if (!probes.exists(configured)) {
    return {
      ok: false,
      error:
        `runtime worktree not found at ${configured} — create it: ` +
        `git worktree add ${configured} origin/${RUNTIME_BRANCH} (ADR-0181)`,
    };
  }
  const branch = probes.branchOf(configured);
  if (branch !== RUNTIME_BRANCH) {
    return {
      ok: false,
      error:
        `runtime worktree at ${configured} is on '${branch ?? "(detached/unknown)"}', not ` +
        `'${RUNTIME_BRANCH}' — the desktop must serve pinned ${RUNTIME_BRANCH} (ADR-0181). ` +
        `Fast-forward it: git -C ${configured} checkout ${RUNTIME_BRANCH} && git -C ${configured} pull --ff-only`,
    };
  }
  return { ok: true, root: configured, source: "runtime" };
}
