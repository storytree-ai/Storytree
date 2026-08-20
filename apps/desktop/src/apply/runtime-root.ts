// Runtime-root resolver (ADR-0181) — the desktop serves code from a pinned-`main` runtime worktree,
// decoupled from the developer's working checkout.
//
// WHY: main.ts derived STUDIO_DIST + BACKEND_ENTRY, and the sidecar its repoRoot/stories/docs, from
// `appRoot` (app.getAppPath()) — i.e. whatever checkout the Electron shell launched from, which in
// practice is a DIRTY feature branch (the observed 2026-07-08 bug: the app served
// `claude/win-arm-real-worktree-fix` WIP instead of merged `main`). This resolver is the seam that
// fixes it: a CONFIGURED runtime worktree path is authoritative and FAIL-CLOSED — it must EXIST and be
// PINNED to `main` (HEAD equal-to-or-behind `origin/main`, ADR-0181 — a detached HEAD at origin/main is
// the canonical form), else resolution refuses rather than silently serving a stray branch. When no runtime is
// configured, it falls back to the launch checkout (today's behaviour) so a developer launching the
// shell from a worktree during development is unaffected.
//
// This module is PURE (no node:fs, no node:child_process): the Electron glue (main.ts) supplies the
// `exists`/`branchOf` probes over real fs+git; the test drives them with in-memory doubles. The
// operator witnesses the resolved runtime in the launched app (ADR-0070) — this pure core proves the
// decision logic, the wiring is attested.

/** The environment variable that points the desktop at its pinned-`main` runtime worktree. */
export const RUNTIME_ROOT_ENV = "STORYTREE_DESKTOP_RUNTIME";

/**
 * Pick the configured runtime-worktree path from ADR-0181's TWO sources, env-wins-then-file:
 *  - the {@link RUNTIME_ROOT_ENV} env value (authoritative when a non-blank string), else
 *  - the `path` field of a `desktop.runtime.json` config file (its raw contents passed in).
 *
 * This is the seam that lets an INSTALLED shortcut engage pinned `main`: a Windows `.lnk` sets no env,
 * so without a config source the app would always take the launch-checkout fallback (the observed stale
 * bug). The config file (`~/.storytree/desktop.runtime.json`, matching the `~/.storytree/secrets.json`
 * home) supplies the runtime path the env can't. Returns a trimmed non-empty path, or `null` when
 * neither source yields one — then {@link resolveRuntimeRoot} serves the launch checkout as before.
 *
 * PURE: the caller supplies the env value + the file contents (or `null` when the file is absent /
 * unreadable), so this decides offline with no fs. A malformed/one-off config is treated as
 * unconfigured (`null`), never a throw — the resolver's fail-closed refusal is reserved for a
 * configured-but-invalid *worktree*, not an unreadable config file.
 */
export function pickConfiguredRuntime(env: string | null, configRaw: string | null): string | null {
  const fromEnv = env?.trim();
  if (fromEnv) return fromEnv;
  if (configRaw === null) return null;
  try {
    const parsed = JSON.parse(configRaw) as { path?: unknown };
    const path = typeof parsed.path === "string" ? parsed.path.trim() : "";
    return path.length > 0 ? path : null;
  } catch {
    return null; // malformed JSON → treat as unconfigured, never a crash
  }
}

/**
 * The branch the runtime worktree tracks — the desktop serves pinned, CI-proven `main` only. NOTE:
 * "on `main`" means PINNED to `main` (HEAD equal-to-or-behind `origin/main`), NOT necessarily the local
 * `main` branch NAME: the canonical runtime worktree is a DETACHED HEAD at `origin/main` (ADR-0181,
 * `git worktree add <path> origin/main`), which deliberately leaves the local `main` name free for the
 * developer's own checkout. See {@link RuntimeRootProbes.pinnedToOriginMain}.
 */
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
  /**
   * True iff git RESOLVES `path` as a work tree (`git -C <path> rev-parse --is-inside-work-tree`).
   *
   * Separate from {@link branchOf} because a lost worktree REGISTRATION and a stray branch are
   * indistinguishable through `branchOf` alone — both read null — yet their remedies are opposite. A
   * linked worktree's `.git` is a FILE pointing at `<main>/.git/worktrees/<name>`; destroy or re-clone
   * the main checkout's `.git` and that admin dir goes with it, leaving every file in the worktree
   * intact but unreadable by git (`fatal: not a git repository`), which `git worktree repair` cannot
   * rebuild. Measured 2026-08-20: the runtime worktree held legitimate merged `main` throughout, so the
   * refusal was about READABILITY, never about the code being stray. Fail-closed like its siblings —
   * any git error reads FALSE.
   */
  isGitWorktree: (path: string) => boolean;
  /** The git branch checked out at `path`, or null when it is not a resolvable git worktree. */
  branchOf: (path: string) => string | null;
  /**
   * True iff `path`'s HEAD is reachable from `origin/main` — HEAD equal-to-or-behind `origin/main`
   * (`git merge-base --is-ancestor HEAD origin/main`, exit 0). This is what "pinned to `main`" actually
   * MEANS (ADR-0181): the canonical runtime worktree is a DETACHED HEAD at `origin/main`
   * (`git worktree add <path> origin/main`), leaving the local `main` branch NAME free for the
   * developer's own checkout. Reads TRUE for detached-at-origin/main and detached-behind-origin/main
   * (the update flow ff's the behind case); reads FALSE for a commit OUTSIDE `origin/main`'s history (a
   * stray feature branch — the 2026-07-08 bug this guard exists to reject). Fail-closed: any git error
   * (no `origin/main` ref, git missing) reads FALSE.
   */
  pinnedToOriginMain: (path: string) => boolean;
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
 *  - Configured and PRESENT but not a registered worktree (git cannot read it at all — the admin dir in
 *    the main checkout is gone) → refuse naming the lost REGISTRATION, because every `git` remedy the
 *    pin arm below suggests would itself fail with `fatal: not a git repository`.
 *  - Configured but NOT pinned to `main` (a stray commit outside `origin/main`'s history) → refuse: the
 *    desktop must serve pinned `main`, not whatever branch the runtime worktree drifted to.
 *  - Configured, present, pinned to `main` (a detached HEAD at/behind `origin/main` — the canonical
 *    form — OR the local `main` branch, for back-compat) → serve it (`source: "runtime"`).
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
  // A lost REGISTRATION is not a branch-pin failure and must not borrow its remedy (ADR-0181). With no
  // admin dir EVERY `git -C <path> …` command fails outright, so the re-pin hint below would hand the
  // reader a command that cannot run — measured 2026-08-20, where it cost a full investigation before
  // anyone noticed the suggested fix was answering a different question. Diagnose readability BEFORE
  // asking about the branch, so each state carries the fix that actually applies to it.
  if (!probes.isGitWorktree(configured)) {
    return {
      ok: false,
      error:
        `runtime worktree at ${configured} exists, but git does not recognise it as a worktree — its ` +
        `registration is missing (the '.git/worktrees/<name>' admin directory inside the MAIN ` +
        `checkout, which a destroyed or re-cloned main '.git' takes with it). The files here are ` +
        `intact and this is NOT a branch problem: git commands run here fail with "fatal: not a git ` +
        `repository", and 'git worktree repair' cannot rebuild a missing admin directory. Re-create ` +
        `it from your MAIN checkout — this worktree only ever tracks ${RUNTIME_BRANCH}, so it holds ` +
        `no unique work: move ${configured} aside, run ` +
        `git -C <main-checkout> worktree add --detach ${configured} origin/${RUNTIME_BRANCH}, then ` +
        `pnpm install && pnpm --filter studio build inside it (ADR-0181).`,
    };
  }
  // "On `main`" means PINNED to `main`, not the literal local branch NAME (ADR-0181). Accept either the
  // local `main` branch (back-compat) OR a HEAD reachable from `origin/main` — the canonical runtime
  // worktree is a DETACHED HEAD at `origin/main` (`git worktree add <path> origin/main`), so a literal
  // branch-name check rejected the exact worktree the bootstrap recipe produces. Still REJECTS a commit
  // OUTSIDE `origin/main`'s history (a stray feature branch — the 2026-07-08 bug this guard exists for).
  const branch = probes.branchOf(configured);
  const pinned = branch === RUNTIME_BRANCH || probes.pinnedToOriginMain(configured);
  if (!pinned) {
    return {
      ok: false,
      error:
        `runtime worktree at ${configured} is on '${branch ?? "(detached/unknown)"}', which is not ` +
        `pinned to origin/${RUNTIME_BRANCH} — the desktop must serve pinned, CI-proven ${RUNTIME_BRANCH} ` +
        `(ADR-0181). A detached HEAD at origin/${RUNTIME_BRANCH} is the canonical form (it leaves the ` +
        `'${RUNTIME_BRANCH}' branch free for your dev checkout). Re-pin it: ` +
        `git -C ${configured} fetch origin && git -C ${configured} checkout --detach origin/${RUNTIME_BRANCH}`,
    };
  }
  return { ok: true, root: configured, source: "runtime" };
}
