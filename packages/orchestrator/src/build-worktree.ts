/**
 * The REAL-mode build workspace (drive-machinery Phase F): a FRESH, DETACHED git worktree of the
 * driving repo, so the leaf authors against the node's real source at real repo paths while the
 * session's own working tree stays untouched. The worktree shares the repo's object store, so the
 * spine's post-green commit (see {@link commitAuthored}) is a REAL commit object the signed
 * verdict's `commitSha` points at — the GATE's clean-tree check then reads genuine `git status`,
 * never an injected fake.
 *
 * Lifecycle (ADR-0031): a signed REAL pass is PROMOTED — {@link promoteRealPass} parks the proven
 * commit on a `claude/real/<unit-id>-<run-id>` branch (pushed to origin when one exists), so it
 * rides the ADR-0022 PR/CI cadence to `main` via a NON-SQUASH merge that keeps the verdict's
 * `commitSha` a true ancestor. A V1 lesson made V2-shaped: a pass that evaporates is unfinished
 * work, and landing always goes through the merge gate, never around it.
 */

import { execFile } from "node:child_process";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";

import { ShellTestExecutor } from "./shell-test-executor.js";
import type { ShellCommand } from "./shell-test-executor.js";

/** A live build worktree: the checkout root, the HEAD it was cut from, and its own teardown. */
export interface BuildWorktree {
  /** The worktree checkout root (the leaf's cwd and the proof command's cwd). */
  root: string;
  /** The commit the worktree was cut from (`git rev-parse HEAD` at creation). */
  headSha: string;
  /** Remove the worktree registration and the temp directory (best-effort, idempotent). */
  remove(): Promise<void>;
}

/**
 * One spine-driven dependency-add group (ADR-0064 §2): the NEW deps to `pnpm add` into a specific
 * workspace package of the worktree, BEFORE the leaf authors. The leaf still cannot touch
 * `package.json`/`pnpm-lock.yaml` — the spine performs the add, declared in the node's spec.
 */
export interface AddDepsGroup {
  /** The workspace package the deps are added to (`pnpm add <deps> --filter <packageName>`). */
  packageName: string;
  /** The `pnpm add` package specs (each non-empty, no leading dash — validated upstream). */
  deps: string[];
}

/** Options for {@link createBuildWorktree} (ADR-0031 §2: dependency-bearing REAL targets). */
export interface CreateBuildWorktreeOptions {
  /**
   * Install workspace dependencies into the fresh worktree (`pnpm install --frozen-lockfile
   * --prefer-offline` — LOCKFILE-ONLY by construction; the shared pnpm store makes it mostly
   * hard-links). Without it the worktree has no node_modules and REAL targets must stay
   * builtins-only. The V1 slow-growth rule carries over: the LEAF can never add a dependency —
   * `package.json`/`pnpm-lock.yaml` sit outside every write scope (deny-by-default walls).
   */
  install?: boolean;
  /** Injectable installer (offline tests); defaults to spawning the real pnpm. */
  installRunner?: (root: string) => Promise<void>;
  /**
   * Spine-driven dependency adds (ADR-0064 §2): NEW deps the SPINE runs `pnpm add` for AFTER the
   * base install and BEFORE the leaf authors. Declared in the node spec, performed by the spine, the
   * leaf is unprivileged — `package.json`/`pnpm-lock.yaml` stay outside every write scope. The
   * resulting lockfile change lands in the PR's diff (the spine commits it with the authored files).
   * Requires `install: true` (validated upstream). A failed add tears the worktree down and throws.
   */
  addDeps?: AddDepsGroup[];
  /** Injectable dep-adder (offline tests); defaults to spawning the real `pnpm add`. */
  addDepsRunner?: (root: string, groups: AddDepsGroup[]) => Promise<void>;
}

/**
 * Cut a fresh detached worktree of `repoRoot`'s HEAD under the OS temp dir. The directory is
 * created by `git worktree add` itself (inside a private mkdtemp parent so teardown can remove
 * everything even if git's own removal hiccups). With `install: true` the worktree also gets a
 * lockfile-only dependency install before it is handed to the leaf (failure tears the worktree
 * down and throws — a half-installed workspace must not look buildable).
 */
export async function createBuildWorktree(
  repoRoot: string,
  options: CreateBuildWorktreeOptions = {},
): Promise<BuildWorktree> {
  const parent = await fs.mkdtemp(path.join(os.tmpdir(), "storytree-real-"));
  const root = path.join(parent, "wt");
  await runGit(["worktree", "add", "--detach", root, "HEAD"], repoRoot);
  const headSha = (await runGit(["rev-parse", "HEAD"], root)).trim();

  // Tear the half-provisioned worktree down + rethrow — a worktree whose install/add failed must
  // never look buildable (the ADR-0031 fail-closed posture, shared by install and addDeps).
  const teardownAndThrow = async (label: string, e: unknown): Promise<never> => {
    try {
      await runGit(["worktree", "remove", "--force", root], repoRoot);
    } catch {
      // Best-effort; the directory removal below still runs.
    }
    await removeDirBestEffort(parent);
    throw new Error(`worktree ${label} failed (the worktree was torn down): ${(e as Error).message}`, {
      cause: e,
    });
  };

  if (options.install === true) {
    const installRunner = options.installRunner ?? defaultPnpmInstall;
    try {
      await installRunner(root);
    } catch (e) {
      await teardownAndThrow("dependency install", e);
    }
  }

  // ADR-0064 §2: the spine adds the node's declared NEW dependencies AFTER the base install and
  // BEFORE the leaf enters — the leaf never touches package.json/pnpm-lock.yaml, the spine does, and
  // the lockfile change becomes part of the PR diff. A failed add tears the worktree down (above).
  if (options.addDeps !== undefined && options.addDeps.length > 0) {
    const addDepsRunner = options.addDepsRunner ?? defaultPnpmAdd;
    try {
      await addDepsRunner(root, options.addDeps);
    } catch (e) {
      await teardownAndThrow("spine dependency add (pnpm add)", e);
    }
  }

  let removed = false;
  return {
    root,
    headSha,
    remove: async (): Promise<void> => {
      if (removed) return;
      removed = true;
      try {
        await runGit(["worktree", "remove", "--force", root], repoRoot);
      } catch {
        // Best-effort: fall through to the directory removal + prune below.
      }
      await removeDirBestEffort(parent);
      try {
        await runGit(["worktree", "prune"], repoRoot);
      } catch {
        // Pruning is housekeeping; a failure here must not mask the build result.
      }
    },
  };
}

/**
 * The SPINE-side commit of whatever the leaf authored (Phase F's clean-tree answer): called after
 * CONFIRM_GREEN, before the GATE reads the tree, so the gate's clean-tree requirement is met by a
 * REAL commit — never by faking `clean: true`. Attribution is explicit: the committer identity is
 * the spine acting for the resolved signer (passed per-command, no global config touched).
 *
 * Returns `committed: false` when the tree is already clean (nothing authored — the gate will then
 * attest the unchanged HEAD, which is honest: the proof ran against what HEAD already held).
 */
export async function commitAuthored(args: {
  worktreeRoot: string;
  message: string;
  /** The signer the commit is attributed to (email; the name is the spine's fixed identity). */
  author: string;
}): Promise<{ committed: boolean; commitSha: string }> {
  const porcelain = (await runGit(["status", "--porcelain"], args.worktreeRoot)).trim();
  if (porcelain.length === 0) {
    const sha = (await runGit(["rev-parse", "HEAD"], args.worktreeRoot)).trim();
    return { committed: false, commitSha: sha };
  }
  await runGit(["add", "-A"], args.worktreeRoot);
  await runGit(
    [
      "-c",
      "user.name=storytree-spine",
      "-c",
      `user.email=${args.author}`,
      "commit",
      "-m",
      args.message,
    ],
    args.worktreeRoot,
  );
  const sha = (await runGit(["rev-parse", "HEAD"], args.worktreeRoot)).trim();
  return { committed: true, commitSha: sha };
}

// ── Promotion (ADR-0031 §1): a signed REAL pass lands, it does not evaporate ─

/** The outcome of {@link promoteRealPass}: where the proven commit now lives. */
export interface PromotionResult {
  /** The branch the proven commit was parked on (`claude/real/<unit-id>-<run-id>`). */
  branch: string;
  /** The exact commit the signed verdict attests (the branch tip). */
  commitSha: string;
  /** Whether the branch reached origin (false = local branch only; see `detail`). */
  pushed: boolean;
  /** Human detail: where it was pushed, or why it stayed local. */
  detail: string;
  /**
   * The URL of the non-draft PR opened for this branch — present only when `openPr` was requested,
   * the branch pushed, AND `gh pr create` succeeded. Opening the PR is what lets the green chain
   * AUTO-MERGE to trunk (ADR-0022: a non-draft PR → CI auto-merges; `claude/real/*` merges
   * NON-SQUASH per ADR-0031). A `gh` failure is DATA, not an error — the branch is still pushed and
   * the failure is appended to `detail`, so the worst case degrades to the manual-PR path.
   */
  prUrl?: string;
}

/** Run a `gh` command in `cwd`, resolving stdout (injectable so the PR-open path is offline-testable). */
export type GhRunner = (args: string[], cwd: string) => Promise<string>;

/**
 * Park a signed REAL pass's proven commit on a branch and (when an `origin` remote exists) push
 * it, so landing rides the ADR-0022 PR/CI cadence instead of evaporating with the worktree. The
 * branch name embeds the runId, so a retried build never collides with a prior run's branch.
 *
 * Honesty invariant (ADR-0031): the branch tip IS `commitSha` — the exact commit the verdict
 * signed. Landing must keep that commit in `main`'s ancestry (merge commit / fast-forward, never
 * a squash), or the persisted verdict loses its anchor to history.
 *
 * A push failure is DATA, not an error: the local branch is kept either way (preservation over
 * loss — V1's failed-ceremony rule), and the caller reports `detail`.
 */
export async function promoteRealPass(args: {
  repoRoot: string;
  unitId: string;
  runId: string;
  commitSha: string;
  /**
   * Default true. `false` parks the branch LOCALLY only — preservation without spread, e.g. when
   * the package regression suite came back red: the proven commit must not be lost, but a branch
   * known to break its package should not reach origin as a landing candidate.
   */
  push?: boolean;
  /**
   * When true AND the branch pushes, open a NON-DRAFT PR for it so the proven chain AUTO-MERGES to
   * trunk (ADR-0022 / ADR-0090 the local-loop's land step), instead of leaving the operator to run
   * `gh pr create` by hand. The studio's UI-driven `--real` build sets this — clicking Build IS the
   * approval to land. Default false: a terminal `storytree … build --real` keeps the suggest-a-PR
   * cadence (the human runs their own merge ceremony).
   */
  openPr?: boolean;
  /** PR title (openPr only). Default: `real: <unitId> proven via the gate`. */
  prTitle?: string;
  /** PR body (openPr only). Default: a NON-SQUASH landing note (ADR-0031). */
  prBody?: string;
  /** Injectable `gh` runner (openPr only) — defaults to the real `gh` CLI; tests pass a fake. */
  gh?: GhRunner;
}): Promise<PromotionResult> {
  const branch = `claude/real/${args.unitId}-${args.runId}`;
  await runGit(["branch", branch, args.commitSha], args.repoRoot);

  if (args.push === false) {
    return {
      branch,
      commitSha: args.commitSha,
      pushed: false,
      detail: "push withheld — local branch kept for forensics",
    };
  }

  let origin: string | null;
  try {
    origin = (await runGit(["remote", "get-url", "origin"], args.repoRoot)).trim();
  } catch {
    origin = null;
  }
  if (origin === null) {
    return {
      branch,
      commitSha: args.commitSha,
      pushed: false,
      detail: "no origin remote — local branch only",
    };
  }
  try {
    await runGit(["push", "-u", "origin", branch], args.repoRoot);
  } catch (e) {
    const firstLine = (e as Error).message.split("\n")[0] ?? "push failed";
    return {
      branch,
      commitSha: args.commitSha,
      pushed: false,
      detail: `push to origin failed — local branch kept: ${firstLine}`,
    };
  }
  // Pushed. Optionally open the non-draft PR that lets CI auto-merge it to trunk (ADR-0022). A gh
  // failure NEVER fails the promotion — the branch is up; we degrade to the manual-PR path.
  if (args.openPr === true) {
    const title = args.prTitle ?? `real: ${args.unitId} proven via the gate`;
    const body =
      args.prBody ??
      `UI-driven \`--real\` build (ADR-0090). Each node was driven through the prove-it-gate for ` +
        `real and the proven chain is parked at this branch's tip. Merge **NON-SQUASH** — every ` +
        `node's verdict commit must stay an ancestor of \`main\` (ADR-0031).`;
    try {
      const gh = args.gh ?? runGh;
      const out = await gh(
        ["pr", "create", "--head", branch, "--base", "main", "--title", title, "--body", body],
        args.repoRoot,
      );
      const prUrl = out.trim().split(/\s+/).filter(Boolean).pop();
      return {
        branch,
        commitSha: args.commitSha,
        pushed: true,
        detail: `pushed to ${origin}; PR opened (auto-merges to trunk on green CI)`,
        ...(prUrl !== undefined && prUrl.length > 0 ? { prUrl } : {}),
      };
    } catch (e) {
      const firstLine = (e as Error).message.split("\n")[0] ?? "gh pr create failed";
      return {
        branch,
        commitSha: args.commitSha,
        pushed: true,
        detail: `pushed to ${origin}; PR open failed (open it manually): ${firstLine}`,
      };
    }
  }
  return { branch, commitSha: args.commitSha, pushed: true, detail: `pushed to ${origin}` };
}

// ── The regression suite (ADR-0031 §2: a green node must not break its package) ─

/**
 * Run a package-suite regression command in the (installed) worktree and observe green/red the
 * same honest way the gate does — exit code only, `NODE_TEST*` scrubbed (the forged-green fix).
 * The V1 lesson adapted to package grain: a node's own proof going green never proves it didn't
 * break the package around it; promotion requires this suite green too.
 */
export async function runRegressionSuite(args: {
  command: ShellCommand;
  cwd: string;
}): Promise<{ result: "green" | "red" }> {
  return observeWorktreeCommand("regression-suite", args);
}

/**
 * Run the package typecheck (`tsc --noEmit` via the registry's `typecheck` command) in the
 * (installed) worktree and observe green/red by exit code, exactly like {@link runRegressionSuite}.
 * The hole it closes: the node's proof command and the regression suite both run under tsx, which
 * STRIPS types — a leaf can author type-illegal code that is runtime-green and would otherwise
 * surface only at PR-time CI (declare-presence, 2026-06-11: explicit-undefined patch literals vs
 * `exactOptionalPropertyTypes`). A red here is treated like a red suite: promotion parks the
 * branch local-only, the push is withheld.
 */
export async function runWorktreeTypecheck(args: {
  command: ShellCommand;
  cwd: string;
}): Promise<{ result: "green" | "red" }> {
  return observeWorktreeCommand("worktree-typecheck", args);
}

/** The shared observer: spawn the command in the worktree, read green/red off the exit code only. */
async function observeWorktreeCommand(
  label: string,
  args: { command: ShellCommand; cwd: string },
): Promise<{ result: "green" | "red" }> {
  const executor = new ShellTestExecutor({
    command: (): ShellCommand => platformShellCommand({ ...args.command, cwd: args.cwd }),
  });
  const observation = await executor.run(label);
  return { result: observation.result };
}

/**
 * Make a {@link ShellCommand} spawnable on this platform: on Windows, `pnpm` is a `.cmd` shim
 * that `execFile` cannot spawn directly (no shell), so it is wrapped as `cmd.exe /d /s /c pnpm …`.
 * Everything else passes through. `platform` is injectable for offline tests of both shapes.
 */
export function platformShellCommand(
  cmd: ShellCommand,
  platform: NodeJS.Platform = process.platform,
): ShellCommand {
  if (platform !== "win32" || cmd.file !== "pnpm") return cmd;
  return {
    file: process.env["ComSpec"] ?? "cmd.exe",
    args: ["/d", "/s", "/c", "pnpm", ...cmd.args],
    ...(cmd.cwd !== undefined ? { cwd: cmd.cwd } : {}),
    // Preserve any per-command env overrides through the win32 rewrap (ADR-0064 DB-backed proof).
    ...(cmd.env !== undefined ? { env: cmd.env } : {}),
  };
}

/**
 * The default dep-adder (ADR-0064 §2): `pnpm add <deps> --filter <packageName>` per group, run at
 * the worktree root. Sequential (each group resolves + writes the lockfile), `--prefer-offline` so a
 * spec already in the shared store hard-links. The package specs are an `execFile` arg vector (no
 * shell), and leading-dash specs are refused upstream — so an author can never inject a flag.
 */
async function defaultPnpmAdd(root: string, groups: AddDepsGroup[]): Promise<void> {
  for (const group of groups) {
    // Canonical filter form: `pnpm --filter <pkg> add …` (the filter selects the package the `add`
    // command runs in). `--prefer-offline` hard-links specs already in the shared store. Retried on
    // a transient Windows file-lock (win32-arm64 esbuild.exe — see {@link retryOnWindowsFileLock}).
    const cmd = platformShellCommand({
      file: "pnpm",
      args: ["--filter", group.packageName, "add", "--prefer-offline", ...group.deps],
      cwd: root,
    });
    const label = `pnpm --filter ${group.packageName} add ${group.deps.join(" ")}`;
    await retryOnWindowsFileLock(() => spawnPnpm(cmd, label), {
      onRetry: (attempt, e) => warnRetry(label, attempt, e),
    });
  }
}

/**
 * The default installer: a lockfile-only, shared-store-preferring pnpm install in the worktree,
 * retried on a transient Windows file-lock. On win32-arm64 the fresh worktree's install/relink
 * intermittently fails to `unlink` a just-materialised binary (`@esbuild/win32-arm64/esbuild.exe`)
 * whose handle a sibling process holds for a beat; a short backoff clears it (ADR-0031 worktree
 * reliability). `pnpm install` is idempotent, so re-running after a partial failure completes it.
 */
async function defaultPnpmInstall(root: string): Promise<void> {
  const cmd = platformShellCommand({
    file: "pnpm",
    args: ["install", "--frozen-lockfile", "--prefer-offline"],
    cwd: root,
  });
  await retryOnWindowsFileLock(() => spawnPnpm(cmd, "pnpm install"), {
    onRetry: (attempt, e) => warnRetry("pnpm install", attempt, e),
  });
}

/** Spawn one pnpm command (no shell), rejecting with a labelled error that carries the stderr. */
function spawnPnpm(cmd: ShellCommand, label: string): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    execFile(
      cmd.file,
      cmd.args,
      { cwd: cmd.cwd, maxBuffer: 64 * 1024 * 1024 },
      (error, _stdout, stderr) => {
        if (error === null) {
          resolve();
          return;
        }
        reject(new Error(`${label} failed: ${error.message}\n${stderr}`, { cause: error }));
      },
    );
  });
}

/** One-line notice that a worktree pnpm step hit a Windows lock and is being retried. */
function warnRetry(label: string, attempt: number, e: unknown): void {
  const first = ((e as Error).message ?? String(e)).split("\n")[0] ?? "";
  console.error(`[worktree] ${label} hit a Windows file-lock (attempt ${attempt}); retrying: ${first}`);
}

// ── Windows file-lock tolerance (win32-arm64 esbuild.exe) ────────────────────
//
// On Windows a briefly-held file handle (a running esbuild/tsx, or pnpm's own hardlink/copy relink)
// makes `unlink`/`rename` fail transiently with EPERM/EBUSY — the handle releases a beat later. Two
// places in the REAL-build lifecycle hit it: the fresh worktree's `pnpm install` (can't unlink
// `@esbuild/win32-arm64/esbuild.exe`), and the teardown `fs.rm` (can't remove node_modules holding
// a just-run binary — the ~12 stale `storytree-real-*` temp dirs came from teardown throwing here).
// A short capped-backoff retry clears both.

/** Transient Windows file-lock errno codes — a briefly-held handle, retryable. */
const WINDOWS_LOCK_CODES = new Set(["EPERM", "EBUSY", "EACCES", "ENOTEMPTY", "EMFILE", "ENFILE"]);

/**
 * True when `e` looks like a transient Windows file-lock (so it is worth retrying). Matches either
 * the errno `code` (fs operations keep it) OR the errno token in the message — pnpm surfaces the
 * lock as a child-process failure whose `code` is the numeric exit code, with the real
 * `EPERM: operation not permitted, unlink '…esbuild.exe'` text folded into the message.
 */
export function isWindowsFileLockError(e: unknown): boolean {
  if (e === null || typeof e !== "object") return false;
  const code = (e as { code?: unknown }).code;
  if (typeof code === "string" && WINDOWS_LOCK_CODES.has(code)) return true;
  const message = (e as { message?: unknown }).message;
  return typeof message === "string" && /\b(?:EPERM|EBUSY|EACCES|ENOTEMPTY)\b/.test(message);
}

/** Options for {@link retryOnWindowsFileLock}. */
export interface RetryOnLockOptions {
  /** Max attempts including the first (default 6). */
  attempts?: number;
  /** Base backoff in ms; doubles each retry, capped at 3000ms (default 150). */
  baseDelayMs?: number;
  /** Injectable sleep (tests pass a no-wait stub); default real `setTimeout`. */
  sleep?: (ms: number) => Promise<void>;
  /** Which errors are retryable (default {@link isWindowsFileLockError}). */
  retryable?: (e: unknown) => boolean;
  /** Best-effort per-retry notice (e.g. a log line). Never throws into the retry loop. */
  onRetry?: (attempt: number, e: unknown) => void;
}

/**
 * Run `op`, retrying on a transient Windows file-lock with capped exponential backoff. A
 * non-retryable error, or the final attempt, rethrows unchanged — so a genuine install failure
 * (a bad lockfile, a missing dep) still fails fast and loud, only the flaky lock is absorbed.
 */
export async function retryOnWindowsFileLock<T>(
  op: () => Promise<T>,
  options: RetryOnLockOptions = {},
): Promise<T> {
  const attempts = options.attempts ?? 6;
  const baseDelayMs = options.baseDelayMs ?? 150;
  const sleep = options.sleep ?? ((ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms)));
  const retryable = options.retryable ?? isWindowsFileLockError;
  let lastErr: unknown;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await op();
    } catch (e) {
      lastErr = e;
      if (attempt >= attempts || !retryable(e)) throw e;
      try {
        options.onRetry?.(attempt, e);
      } catch {
        // A logging hook must never break the retry.
      }
      await sleep(Math.min(baseDelayMs * 2 ** (attempt - 1), 3000));
    }
  }
  // Unreachable — the loop returns or throws — but satisfies the type checker.
  throw lastErr;
}

/**
 * Remove a directory tree, tolerant of the Windows file-lock that stranded ~12 stale
 * `storytree-real-*` temp dirs. `fs.rm`'s own `maxRetries` handles the common case; the outer
 * {@link retryOnWindowsFileLock} covers a lock that outlives them. Best-effort by construction —
 * `force` swallows ENOENT and a final failure is swallowed, never thrown: teardown housekeeping
 * must never mask the build result (the next `git worktree prune` + OS temp cleanup reclaim it).
 */
async function removeDirBestEffort(dir: string): Promise<void> {
  try {
    await retryOnWindowsFileLock(() =>
      fs.rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }),
    );
  } catch {
    // Swallow — see the doc comment: debris, not a failure.
  }
}

/** Run a git command in `cwd`, resolving stdout; rejects (loud) on a non-zero exit. */
function runGit(args: string[], cwd: string): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    execFile("git", args, { cwd, maxBuffer: 16 * 1024 * 1024 }, (error, stdout, stderr) => {
      if (error === null) {
        resolve(stdout);
        return;
      }
      reject(
        new Error(`git ${args.join(" ")} failed in ${cwd}: ${error.message}\n${stderr}`, {
          cause: error,
        }),
      );
    });
  });
}

/** The default {@link GhRunner}: spawn the `gh` CLI in `cwd` (the operator's authed local env). */
function runGh(args: string[], cwd: string): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    execFile("gh", args, { cwd, maxBuffer: 16 * 1024 * 1024 }, (error, stdout, stderr) => {
      if (error === null) {
        resolve(stdout);
        return;
      }
      reject(
        new Error(`gh ${args.join(" ")} failed in ${cwd}: ${error.message}\n${stderr}`, {
          cause: error,
        }),
      );
    });
  });
}
