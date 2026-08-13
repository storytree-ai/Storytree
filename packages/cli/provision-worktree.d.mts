// Type declarations for the pure helpers provision-worktree.mjs exports, so a TS test (and
// `tsc --noEmit`) can import them without `allowJs`. The provisioner itself stays plain Node ESM (no
// tsx/deps) by design — it runs BEFORE node_modules exists — so this sibling only types the exported
// surface; the implementation lives in provision-worktree.mjs. (Mirrors scripts/studio.d.mts.)

/** The outcome of an install attempt: whether it succeeded and its process exit code. */
export interface InstallResult {
  ok: boolean;
  code: number;
}

/** Which of the three conditions a message or result is about. */
export type ProvisionCondition = "fresh" | "stale" | "unlinked";

/**
 * The outcome of a provision attempt (a no-op fast path has `provisioned: false`). `installed` /
 * `install-failed` come from the FRESH path, `refreshed` / `refresh-failed` from the STALE one, and
 * `relinked` / `relink-failed` from the UNLINKED one — the distinction drives which condition the
 * agent-visible signal names, which is the whole point: all three present identically at the tool
 * call and only one of the three remedies is the right one.
 */
export interface ProvisionResult {
  provisioned: boolean;
  ok: boolean;
  code: number;
  reason:
    | "already-provisioned"
    | "installed"
    | "install-failed"
    | "refreshed"
    | "refresh-failed"
    | "relinked"
    | "relink-failed";
}

/** Absolute path of the worktree that physically contains this module (`../../` from packages/cli/). */
export function thisWorktreeRoot(): string;

/** True when `root` has no completed pnpm install (no `node_modules/.modules.yaml`). */
export function needsProvision(root: string): boolean;

/**
 * True when an install COMPLETED at `root` but linked nothing — `node_modules/.modules.yaml` is
 * present and `node_modules/.bin` is not. The third condition, and the one both `needsProvision` and
 * `lockfileAdvanced` read as healthy. Returns false on an unprovisioned root (that is
 * `needsProvision`'s question) and on a directory with no `pnpm-lock.yaml`.
 */
export function needsRelink(root: string): boolean;

/**
 * The two lockfiles `lockfileAdvanced` compares: `wanted` is the tracked `pnpm-lock.yaml`, `current`
 * is pnpm's `node_modules/.pnpm/lock.yaml` copy of the lockfile the last completed install ran
 * against. Exported so a second reader asks about the same files rather than re-deriving the paths.
 */
export function lockfilePair(root: string): { wanted: string; current: string };

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
 * `condition` selects which of the three states the message names.
 */
export function unprovisionedContext(root: string, condition?: ProvisionCondition): string;

/**
 * STDOUT for the `--hook` entry: the `unprovisionedContext` payload when the install failed, else "".
 * A `reason` of `refresh-failed` selects the stale wording, `relink-failed` the unlinked wording.
 */
export function hookStdout(
  result: { ok: boolean; reason?: string },
  root: string,
  hookMode: boolean,
): string;

/** The process exit code: always 0 in `--hook` mode, else `result.code`. */
export function exitCode(result: { code: number }, hookMode: boolean): number;
