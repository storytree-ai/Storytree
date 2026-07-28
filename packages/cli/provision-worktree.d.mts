// Type declarations for the pure helpers provision-worktree.mjs exports, so a TS test (and
// `tsc --noEmit`) can import them without `allowJs`. The provisioner itself stays plain Node ESM (no
// tsx/deps) by design — it runs BEFORE node_modules exists — so this sibling only types the exported
// surface; the implementation lives in provision-worktree.mjs. (Mirrors scripts/studio.d.mts.)

/** The outcome of an install attempt: whether it succeeded and its process exit code. */
export interface InstallResult {
  ok: boolean;
  code: number;
}

/**
 * The outcome of a provision attempt (a no-op fast path has `provisioned: false`). `installed` /
 * `install-failed` come from the FRESH path, `refreshed` / `refresh-failed` from the STALE one — the
 * distinction drives which condition the agent-visible signal names.
 */
export interface ProvisionResult {
  provisioned: boolean;
  ok: boolean;
  code: number;
  reason: "already-provisioned" | "installed" | "install-failed" | "refreshed" | "refresh-failed";
}

/** Absolute path of the worktree that physically contains this module (`../../` from packages/cli/). */
export function thisWorktreeRoot(): string;

/** True when `root` has no completed pnpm install (no `node_modules/.modules.yaml`). */
export function needsProvision(root: string): boolean;

/**
 * True when `root`'s `pnpm-lock.yaml` differs from `node_modules/.pnpm/lock.yaml` — pnpm's copy of the
 * lockfile the last completed install ran against — i.e. the lockfile advanced under a provisioned
 * worktree. Fails OPEN (false) when either file is missing or unreadable.
 */
export function lockfileAdvanced(root: string): boolean;

/** Run `pnpm install` (falling back to `corepack pnpm`) at `root`; never throws. */
export function runPnpmInstall(root: string): InstallResult;

/**
 * Provision `root` unless already provisioned; a failed attempt retries `retries` more times (default
 * 1) from the warm store before giving up. `install` is injectable for tests.
 */
export function provisionWorktree(opts?: {
  root?: string;
  install?: (root: string) => InstallResult;
  log?: (msg: string) => void;
  retries?: number;
}): ProvisionResult;

/**
 * The `SessionStart` `additionalContext` JSON payload emitted (on stdout, `--hook` mode) when a worktree
 * still has unusable dependencies after all attempts — the agent-visible signal to run `pnpm install`.
 * `stale` selects whether the message names the never-provisioned or the lockfile-advanced condition.
 */
export function unprovisionedContext(root: string, stale?: boolean): string;

/**
 * STDOUT for the `--hook` entry: the `unprovisionedContext` payload when the install failed, else "".
 * A `reason` of `refresh-failed` selects the stale wording.
 */
export function hookStdout(
  result: { ok: boolean; reason?: string },
  root: string,
  hookMode: boolean,
): string;

/** The process exit code: always 0 in `--hook` mode, else `result.code`. */
export function exitCode(result: { code: number }, hookMode: boolean): number;
