// Contract for the broken-worktree detector + repairer (`packages/cli/worktree-health.mjs`) — the
// SessionStart hook that announces (fail-LOUD, ADR-0162 heads-up injection) when the session's
// `.claude/worktrees/` slot is not a registered git worktree, and AUTO-REPAIRS the provable
// empty-husk variant (friction `session-worktree-never-created-branch-at-main`).
// Its behavioural invariants:
//   - a slot git resolves to itself (registered) or a non-slot cwd (main/subdir) is HEALTHY → silent;
//   - a slot git resolves UP to the main checkout is BROKEN → repair when the fingerprint is provable
//     (slot EMPTY + main HEAD on a `claude/*` branch: detach main in place, mount the branch at the
//     slot, re-classify), else the agent-visible SessionStart broken signal (restart remedy);
//   - `--hook` mode ALWAYS exits 0 (a heads-up, never a gate); standalone (doctor) exits 1 when broken
//     and stays READ-ONLY unless `--repair` is passed.
// The detector stays plain Node ESM (no tsx/deps — it may run before node_modules exists), so this
// sibling only types the exported surface. (Mirrors provision-worktree.d.mts / scripts/studio.d.mts.)

/** A git-derived fact pair for a cwd: the working-tree root git resolves it to, and the primary checkout. */
export interface GitProbe {
  topLevel: string | null;
  mainRoot: string | null;
}

/** The health verdict kinds — `broken` is the only unhealthy one (see {@link classifyWorktreeHealth}). */
export type WorktreeKind = "unknown" | "main" | "non-worktree" | "registered" | "broken";

/** A health verdict: healthy/unhealthy, its kind, and the facts the heads-up/summary quote. */
export interface WorktreeVerdict {
  healthy: boolean;
  kind: WorktreeKind;
  cwd: string;
  topLevel: string | null;
  hasNodeModules: boolean;
}

/** A git mutation result — success + captured streams, so the repair can act on and log a refusal. */
export interface GitRunResult {
  ok: boolean;
  stdout: string;
  stderr: string;
}

/** The outcome of an empty-husk repair attempt: healed (with the post-repair verdict) or declined/failed. */
export type RepairOutcome =
  | { repaired: true; verdict: WorktreeVerdict; branch: string; mainRoot: string }
  | { repaired: false; reason: string };

/** Absolute + symlink-resolved + case-folded (win32) path key; equal keys ⇒ same location. */
export function normPath(p: string): string;

/** True when `a` and `b` denote the same filesystem location. */
export function samePath(a: string, b: string): boolean;

/** The normalised slot ROOT `cwd` belongs to (`<main>/.claude/worktrees/<name>`), or null when not in one. */
export function slotRootOf(cwd: string, mainRoot: string): string | null;

/** True when `cwd` lives inside `<mainRoot>/.claude/worktrees/` — i.e. it is (meant to be) a worktree slot. */
export function isWorktreeSlot(cwd: string, mainRoot: string): boolean;

/** Run a git COMMAND (mutation) from `cwd`; reports success/failure + streams. Never throws. */
export function gitRun(cwd: string, args: string[]): GitRunResult;

/** Gather `git rev-parse --show-toplevel` and the common-dir parent from `cwd`; nulls when not in a repo. */
export function probeGit(cwd: string): GitProbe;

/** PURE health classification — no I/O; the broken-slot fingerprint is `slot AND topLevel !== cwd`. */
export function classifyWorktreeHealth(info: {
  cwd: string;
  topLevel: string | null;
  mainRoot: string | null;
  hasNodeModules: boolean;
}): WorktreeVerdict;

/** PURE repair decision — the safety fences: broken + slot EMPTY + main HEAD on a `claude/*` branch. */
export function repairDecision(facts: {
  kind: string;
  slotEmpty: boolean;
  mainBranch: string | null;
}): { repair: boolean; reason: string };

/** Attempt the empty-husk repair: gather facts, fence-check, detach main + `worktree add`, re-classify. */
export function repairBrokenSlot(
  cwd: string,
  verdict: { kind: string },
  opts?: {
    probe?: (cwd: string) => GitProbe;
    run?: (cwd: string, args: string[]) => GitRunResult;
    listDir?: (dir: string) => string[];
    check?: (cwd: string) => WorktreeVerdict;
  },
): RepairOutcome;

/** The `SessionStart` `additionalContext` JSON payload emitted for a broken slot (the agent-visible signal). */
export function brokenWorktreeContext(
  v: {
    cwd: string;
    topLevel: string | null;
    hasNodeModules: boolean;
  },
  noRepairReason?: string | null,
): string;

/** The `SessionStart` `additionalContext` JSON payload emitted after a successful auto-repair. */
export function repairedWorktreeContext(r: {
  verdict: { cwd: string };
  branch: string;
  mainRoot: string;
}): string;

/** STDOUT for the entry: repaired payload after a heal, broken payload when unhealthy, "" when silent. */
export function hookStdout(
  verdict: WorktreeVerdict,
  hookMode: boolean,
  repaired?: { verdict: { cwd: string }; branch: string; mainRoot: string } | null,
  noRepairReason?: string | null,
): string;

/** The process exit code: always 0 in `--hook` mode; else 0 healthy / 1 broken (the doctor signal). */
export function exitCode(verdict: { healthy: boolean }, hookMode: boolean): number;

/** A one-line human summary of a verdict for the diagnostic log. */
export function humanSummary(v: WorktreeVerdict): string;

/** Gather the live facts for `cwd` and classify; `probe`/`nodeModules` are injectable for tests. */
export function checkWorktree(
  cwd: string,
  opts?: { probe?: (cwd: string) => GitProbe; nodeModules?: (dir: string) => boolean },
): WorktreeVerdict;
