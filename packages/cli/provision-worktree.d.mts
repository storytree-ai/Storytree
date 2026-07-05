// Type declarations for the pure helpers provision-worktree.mjs exports, so a TS test (and
// `tsc --noEmit`) can import them without `allowJs`. The provisioner itself stays plain Node ESM (no
// tsx/deps) by design — it runs BEFORE node_modules exists — so this sibling only types the exported
// surface; the implementation lives in provision-worktree.mjs. (Mirrors scripts/studio.d.mts.)

/** The outcome of an install attempt: whether it succeeded and its process exit code. */
export interface InstallResult {
  ok: boolean;
  code: number;
}

/** The outcome of a provision attempt (a no-op fast path has `provisioned: false`). */
export interface ProvisionResult {
  provisioned: boolean;
  ok: boolean;
  code: number;
  reason: "already-provisioned" | "installed" | "install-failed";
}

/** Absolute path of the worktree that physically contains this module (`../../` from packages/cli/). */
export function thisWorktreeRoot(): string;

/** True when `root` has no completed pnpm install (no `node_modules/.modules.yaml`). */
export function needsProvision(root: string): boolean;

/** Run `pnpm install` (falling back to `corepack pnpm`) at `root`; never throws. */
export function runPnpmInstall(root: string): InstallResult;

/** Provision `root` unless already provisioned; `install` is injectable for tests. */
export function provisionWorktree(opts?: {
  root?: string;
  install?: (root: string) => InstallResult;
  log?: (msg: string) => void;
}): ProvisionResult;

/** The process exit code: always 0 in `--hook` mode, else `result.code`. */
export function exitCode(result: { code: number }, hookMode: boolean): number;
