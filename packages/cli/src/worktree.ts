/**
 * `storytree worktree prune` — reap dead git worktrees under `.claude/worktrees/` (ADR-0142 / ADR-0033).
 *
 * THE GAP THIS FILLS. The merge ceremony deliberately keeps a worktree alive across its branch's
 * death: session identity is worktree-derived (ADR-0033), so after CI merges a PR, `storytree branch
 * next` cuts a FRESH branch IN THE SAME worktree and the session continues (ADR-0142). That reuse is a
 * feature — but nothing ever reaps a worktree once its session truly ends, so `.claude/worktrees/`
 * accumulates (measured 2026-07-11: 557 dirs on disk, only 44 git-registered — the rest orphaned
 * husks). The ceremony CANNOT self-clean (the merge is async on CI after the session stopped, and a
 * session can't delete its own cwd), so the fix is a STANDING, opportunistic prune: reap a worktree
 * only once its branch is merged AND no live session is using it.
 *
 * SHAPE. Pure decision (`classifyWorktree`) split from IO (`gatherSnapshots` / `executePrune`) behind
 * an injected {@link WorktreeIo} — the `deriveIdentity`/`branch.ts` seam pattern — so the whole safety
 * policy is proven offline with fixtures, no real git and no real fs. The command
 * ({@link pruneWorktrees}) gathers, classifies, prints a dry-run plan by default, and only removes
 * under `--force --yes`.
 *
 * OBSERVABILITY. Every keep carries a machine-readable {@link HoldReason} beside its prose, so a run
 * can report WHY it drained nothing rather than just that it did. Every executing run appends its
 * counts to the drain ledger and {@link worktreeDrainStatus} reads that series back as a check that
 * exits non-zero on a measured stall (`worktree-drain.ts` — worktree-reaper-integrity-arc strand 3).
 * This is the half that was missing: the reaper was silent on success AND on nothing-to-do, so weeks
 * of reaping zero looked exactly like health.
 *
 * SAFETY (this is destructive — every rule errs toward KEEP):
 *   - the primary checkout and the CURRENT worktree are NEVER reaped (force cannot override);
 *   - a worktree whose session holds a live claim on the ledger (--pg, ADR-0200 D6) is kept — its
 *     basename is the session id (ADR-0033);
 *   - a `git worktree lock`ed worktree is kept (an explicit "do not touch" — harness or human);
 *   - a dirty tree (uncommitted changes) is kept;
 *   - a registered worktree is reaped only when its HEAD is merged into origin/main AND it is idle
 *     (mtime older than the threshold — the offline proxy for "no live session", which the notice
 *     board answers authoritatively under --pg);
 *   - a detached-HEAD worktree (an intentional gate, maybe) is kept unless `--include-detached`;
 *   - an orphaned dir (absent from `git worktree list`) is reaped only when idle and not visibly dirty.
 */
import { execFileSync, spawnSync } from "node:child_process";
import { readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import path from "node:path";
import process from "node:process";

import type { Envelope } from "./envelope.js";
import {
  buildDrainRecord,
  classifyDrainHealth,
  defaultDrainLedgerIo,
  drainLedgerPath,
  formatDrainCensus,
  formatDrainHealth,
  readDrainHistory,
  recordDrainRun,
  type DrainLedgerIo,
} from "./worktree-drain.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type WorktreeKind = "registered" | "orphan";
export type Decision = "reap" | "keep";

/**
 * WHY a keep was taken — the machine-readable half of {@link WorktreeVerdict.reason}.
 *
 * The prose reason is for a human reading one line; this is for COUNTING across the whole registry
 * (`worktree-drain.ts`). Grouping the keeps is what makes "held back 59 candidates every run for a
 * week" legible without an owner running a manual stock take — the exact blindness that let the
 * poisoned idle clock rot for weeks (worktree-reaper-integrity-arc, strand 3). Do not derive these
 * by matching the reason string: the census must not break when someone rewords a message.
 *
 * `cooling` is the one to watch. It means "reapable in EVERY way except idle" — the near-miss cohort
 * a healthy drain converts into reaps as the clock advances. A cooling cohort that stays large across
 * a full threshold period while nothing is ever reaped is the poisoned-clock signature.
 */
export type HoldReason =
  /** The primary checkout or this session's own worktree — structural, never reapable. */
  | "anchor"
  /** A live claim on the notice board (--pg, ADR-0200 D6). */
  | "live"
  /** `git worktree lock` is held (ADR-owner fork: no expiry, no releaser). */
  | "locked"
  /** Uncommitted changes present. */
  | "dirty"
  /** Branch not merged into origin/main — live work, the healthy reason to hold. */
  | "unmerged"
  /** Detached HEAD, kept without `--include-detached`. */
  | "detached"
  /** Merged/orphaned and otherwise reapable, but still inside the idle threshold. */
  | "cooling";

/** The default idle threshold (48 h): older-than ≈ "no live session" (ADR heuristic, tunable). */
export const DEFAULT_THRESHOLD_MS = 48 * 60 * 60 * 1000;

/** A pure, IO-free snapshot of one worktree candidate — everything the policy needs to decide. */
export interface WorktreeSnapshot {
  /** Absolute path to the worktree directory. */
  readonly path: string;
  /** Basename of {@link path} — equals the ADR-0033 session id for a `.claude/worktrees/<name>`. */
  readonly name: string;
  /** Registered in `git worktree list`, or an orphaned on-disk dir git no longer tracks. */
  readonly kind: WorktreeKind;
  /** Registered detached-HEAD (no branch) — treated conservatively. */
  readonly detached: boolean;
  /** The branch name, or null for detached / orphan. */
  readonly branch: string | null;
  /** HEAD is an ancestor of origin/main — every commit already landed (registered only). */
  readonly merged: boolean;
  /** Uncommitted changes present (best-effort for orphans; false when unknowable). */
  readonly dirty: boolean;
  /**
   * `git worktree lock` is held on this worktree (registered only; an orphan cannot be locked).
   * A lock is a DELIBERATE "do not touch this" — the harness takes one for a live claude session,
   * and a human takes one to park a worktree — so it is an unconditional keep.
   */
  readonly locked: boolean;
  /** The reason git recorded with the lock (`locked <reason>`), or null for a bare lock. */
  readonly lockReason: string | null;
  /** Newest activity-proxy mtime in ms; 0 when nothing could be stat'd (treated as very old). */
  readonly mtimeMs: number;
}

/** The knobs the decision reads — clock, threshold, the never-touch anchors, and the live set. */
export interface PrunePolicy {
  readonly now: number;
  readonly thresholdMs: number;
  /** The primary checkout root — never reaped. */
  readonly primaryRoot: string;
  /** This session's worktree (its cwd toplevel) — never reaped; null when run from the primary. */
  readonly currentWorktree: string | null;
  /** Opt-in (--include-detached) to reap idle detached-HEAD worktrees. */
  readonly includeDetached: boolean;
  /** Worktree basenames with a live claim on the ledger (--pg, ADR-0200 D6); empty offline. A match ⇒ keep. */
  readonly liveSessions: ReadonlySet<string>;
}

export interface WorktreeVerdict {
  readonly path: string;
  readonly name: string;
  readonly kind: WorktreeKind;
  readonly decision: Decision;
  readonly reason: string;
  /** The keep's machine-readable bucket; null on a reap. Drives the drain census. */
  readonly hold: HoldReason | null;
}

// ---------------------------------------------------------------------------
// Path helpers (Windows-aware equality)
// ---------------------------------------------------------------------------

/** Canonicalise for comparison: resolve, strip a trailing separator, lowercase on win32. */
function normPath(p: string): string {
  const resolved = path.resolve(p).replace(/[/\\]+$/, "");
  return process.platform === "win32" ? resolved.toLowerCase() : resolved;
}

function samePath(a: string, b: string | null): boolean {
  return b !== null && normPath(a) === normPath(b);
}

// ---------------------------------------------------------------------------
// The pure decision — the safety policy, fully fixture-testable
// ---------------------------------------------------------------------------

/**
 * Decide reap/keep for ONE snapshot under a policy. Guard order matters: the never-touch anchors and
 * the live-session / dirty keeps come FIRST so nothing below can talk them into a reap.
 */
export function classifyWorktree(s: WorktreeSnapshot, policy: PrunePolicy): WorktreeVerdict {
  const keep = (hold: HoldReason, reason: string): WorktreeVerdict => ({
    ...base(s),
    decision: "keep",
    reason,
    hold,
  });
  const reap = (reason: string): WorktreeVerdict => ({
    ...base(s),
    decision: "reap",
    reason,
    hold: null,
  });

  // Absolute keeps — --force NEVER overrides these two (deleting your own cwd or the primary is
  // catastrophic; the task's hard invariant).
  if (samePath(s.path, policy.primaryRoot)) return keep("anchor", "primary checkout — never reaped");
  if (samePath(s.path, policy.currentWorktree)) {
    return keep("anchor", "current worktree (this session)");
  }

  // A live session is authoritative (--pg): its session id IS this worktree's basename (ADR-0033).
  if (policy.liveSessions.has(s.name)) {
    return keep("live", "live session on the notice board (--pg)");
  }

  // `git worktree lock` is an explicit "do not touch": the harness holds one for a live claude
  // session and a human holds one to park a worktree deliberately. Reaping through a lock would
  // destroy exactly the worktree someone asked us to leave alone, so it outranks merged/idle.
  // Release it with `git worktree unlock <path>`.
  //
  // KNOWN LIMITATION (open owner fork, worktree-reaper-integrity-arc). This keep has no expiry and
  // nothing in this repo releases it: locks are taken by the Claude Code harness, and its reason
  // reads `claude session <name> (pid N)`. That PID is NOT liveness-checked here, so a lock left by
  // a crashed session keeps its worktree forever — measured 2026-07-27, all 5 locks on the dev box
  // named DEAD pids. Those 5 were already being kept before this branch existed (by the poisoned
  // clock, silently), so naming the reason is strictly better than the accident it replaces — but
  // it is a permanent-keep class that only grows. Resolving it (probe the pid, age the lock out, or
  // accept the drift) is an owner decision, deliberately NOT made here.
  if (s.locked) {
    return keep(
      "locked",
      `locked (git worktree lock)${s.lockReason !== null ? ` — ${s.lockReason}` : ""}`,
    );
  }

  // Uncommitted work is never thrown away.
  if (s.dirty) return keep("dirty", "uncommitted changes present");

  const ageMs = s.mtimeMs > 0 ? policy.now - s.mtimeMs : Number.POSITIVE_INFINITY;
  const idle = ageMs >= policy.thresholdMs;
  const idleFor = Number.isFinite(ageMs) ? `${Math.floor(ageMs / 3_600_000)}h` : "unknown age";
  const thresholdH = Math.round(policy.thresholdMs / 3_600_000);

  if (s.kind === "orphan") {
    if (!idle) return keep("cooling", `orphaned but active < ${thresholdH}h ago`);
    return reap(`orphaned (absent from git worktree list), idle ${idleFor}`);
  }

  // Registered from here.
  if (s.detached) {
    if (!policy.includeDetached) {
      return keep(
        "detached",
        "detached HEAD (may be an intentional gate) — pass --include-detached to reap",
      );
    }
    if (!idle) return keep("cooling", `detached HEAD, active < ${thresholdH}h ago`);
    return reap(`detached HEAD, idle ${idleFor} (--include-detached)`);
  }
  if (!s.merged) return keep("unmerged", "branch not merged into origin/main (live work)");
  // merged + clean + not-current + no live row:
  if (!idle) {
    return keep(
      "cooling",
      `merged but active < ${thresholdH}h ago (a session may be mid closing leg)`,
    );
  }
  return reap(`merged into origin/main, clean, idle ${idleFor}`);
}

function base(s: WorktreeSnapshot): Pick<WorktreeVerdict, "path" | "name" | "kind"> {
  return { path: s.path, name: s.name, kind: s.kind };
}

// ---------------------------------------------------------------------------
// IO seam
// ---------------------------------------------------------------------------

/** The injected IO surface — git plumbing + fs. Real impl is {@link defaultWorktreeIo}. */
export interface WorktreeIo {
  /** Run git (throws on non-zero exit); stdout trimmed. Per-worktree probes pass `-C <path>`. */
  runGit(args: readonly string[]): string;
  /** Basenames of the immediate subdirectories of `dir` (empty when `dir` is absent). */
  listChildDirs(dir: string): string[];
  /** Newest activity-proxy mtime (ms) for a worktree dir; 0 when nothing could be stat'd. */
  statMtimeMs(dir: string): number;
  /**
   * Does `dir` carry its OWN `.git` (a real worktree), vs a leftover husk whose files remain but whose
   * git link is gone? Cheap (a single `existsSync`) — and the guard that stops a husk's `git status`
   * from walking UP into the primary checkout and mis-reporting the primary's dirty state as the husk's.
   */
  hasOwnGit(dir: string): boolean;
  /** Recursively remove a directory (throws on failure — the command counts failures). */
  removeDir(dir: string): void;
}

/**
 * The admin files read as activity signals, relative to `.git/worktrees/<name>/`.
 *
 * THE RULE THAT DEFINES THIS SET: a signal may only be written by an operation IN THIS WORKTREE.
 * Anything that repo-wide git housekeeping rewrites is measuring the REPO's last maintenance, not
 * this worktree's last use, and silently resets the idle clock on every worktree at once.
 *
 * `logs/HEAD` — the per-worktree REFLOG — was in this set and broke exactly that way: git's auto-gc
 * (`gc.auto` defaults to 6700, reached often on a busy repo) runs `reflog expire --all`, which
 * rewrites EVERY worktree's reflog in a single pass. Measured 2026-07-27: all 76 worktrees carried
 * an IDENTICAL `logs/HEAD` mtime, so every one of them read as "active" at once and 59 merged-and-
 * clean worktrees were held back by `merged but active < 48h ago`. The damage was not that those 59
 * were all overdue — it is that NO worktree could EVER age past the threshold, because each gc reset
 * the whole registry's clock before any of them could. `.claude/worktrees/` grew to ~93 GB. Reflogs
 * are excluded for good — do not re-add `logs/**` here (`worktree-idle-signal.test.ts` fails if you
 * do).
 *
 * HEAD / index / ORIG_HEAD all pass the rule: git writes them only for ops in this worktree
 * (checkout, commit, merge, rebase), and gc/repack/fetch leave them alone.
 *
 * THE WORKTREE'S OWN FILES FAIL THE RULE, and are read only as an orphan fallback — see
 * {@link readIdleSignals}. The reflog was one instance of a general shape, not the whole defect.
 */
export const ADMIN_ACTIVITY_SIGNALS: readonly string[] = ["HEAD", "index", "ORIG_HEAD"];

/**
 * The signals read from the WORKTREE itself. These do NOT satisfy the rule above and are used only
 * when no admin dir can be resolved (an orphan / husk), where nothing better exists.
 *
 * WHY THEY ARE NOT HONEST SIGNALS (measured 2026-08-19, worktree-reaper-eligibility-arc). A
 * directory's mtime changes whenever ANY entry is created, deleted or renamed at its top level —
 * by anyone, for any reason. It is not a record of this worktree being USED; it is a record of
 * something having touched it. Four unrelated worktrees — `gemini-subagents-preserved`,
 * `dreamy-colden-6536f2`, `admiring-bose-15ce17`, `adr0178-gate` — carried a `dir` mtime of
 * 2026-08-18T12:24:25.807/.807/.856/.866Z, a 59 ms window with no shared session, while their admin
 * signals sat frozen in JULY (2026-07-09 through 2026-07-25). A pass had created an EMPTY `.codex/`
 * directory in each; creating a child stamps the parent, so 25-40 days of accumulated idleness was
 * erased by a directory that contained nothing. The same signal also picks up pure DELETIONS inside
 * the worktree root, which leave no other trace at all.
 *
 * Measured effect on eligibility: of 17 surviving worktrees, `dir` bound 10 of them and was the ONLY
 * one of the five signals whose removal changed any verdict — dropping it took eligibility from 6/17
 * to 10/17, while dropping `gitfile`, `HEAD`, `index` or `ORIG_HEAD` changed nothing. `gitfile` never
 * bound at all: it is written at `worktree add` and is a millisecond-duplicate of admin `HEAD`, so it
 * contributes no information — and `git worktree repair` rewrites it for EVERY worktree in one pass,
 * which is the same repo-wide-housekeeping shape the reflog had.
 *
 * This is the SAME fault class as the reflog (worktree-reaper-integrity-arc) arriving through a
 * different door, and the distinction matters for the fix: the reflog was an INTERNALLY WRONG signal
 * — git housekeeping owned it. These are HONEST files being reset from OUTSIDE. Excluding one bad
 * signal at a time is what let the second instance survive the first arc's fix, so the rule is now
 * stated positively and the worktree tree is not read at all when an admin dir exists.
 */
export const WORKTREE_FALLBACK_SIGNALS: readonly string[] = ["<dir>", ".git"];

/** One worktree's idle reading, per signal — the instrument behind `worktree drain --idle`. */
export interface IdleSignalReading {
  /** The worktree dir the reading is for. */
  readonly dir: string;
  /** The admin dir `<dir>/.git` points at, or null for an orphan / husk with no gitfile. */
  readonly admin: string | null;
  /** Every signal considered, with its mtime in ms (0 = could not be stat'd). */
  readonly signals: ReadonlyMap<string, number>;
  /** The signal that produced {@link mtimeMs}, or null when nothing could be stat'd. */
  readonly binding: string | null;
  /** The idle clock's reading — the newest signal the rule above admits. */
  readonly mtimeMs: number;
  /** True when the reading fell back to the worktree's own files (no admin dir was readable). */
  readonly fellBack: boolean;
}

const mtimeOr0 = (p: string): number => {
  try {
    return statSync(p).mtimeMs;
  } catch {
    return 0;
  }
};

/** Resolve `<dir>/.git`'s `gitdir:` pointer to the admin dir; null for an orphan / plain dir. */
function resolveAdminDir(dir: string): string | null {
  try {
    const m = /^gitdir:\s*(.+)$/m.exec(readFileSync(path.join(dir, ".git"), "utf8"));
    return m && m[1] !== undefined ? m[1].trim() : null;
  } catch {
    return null;
  }
}

/**
 * Read every idle signal for one worktree, keeping WHICH signal bound — never a tree walk.
 *
 * The max-of-everything reading this replaces could not say which signal held a worktree back, which
 * is precisely why an external clock reset survived a whole arc: the reaper reported "merged but
 * active < 48h ago" and named no culprit. Keeping the breakdown is what makes the next instance of
 * this fault class visible without a bespoke script.
 */
export function readIdleSignals(dir: string): IdleSignalReading {
  const signals = new Map<string, number>();
  const admin = resolveAdminDir(dir);

  // A REGISTERED worktree is judged ONLY by its admin signals: those are the files git writes for
  // ops in THIS worktree, and nothing else writes them. The worktree tree itself is not consulted —
  // anything at all can write into a checkout, so reading it measures the world, not the worktree.
  if (admin !== null) {
    for (const f of ADMIN_ACTIVITY_SIGNALS) signals.set(f, mtimeOr0(path.join(admin, f)));
  }
  const adminBest = pickBinding(signals);

  // An orphan (no gitfile) has no admin dir, and a registered worktree whose admin is unreadable has
  // nothing left to read. Fall back to the worktree's own files rather than returning 0 — 0 reads as
  // INFINITELY old and would reap on a failed stat, the one direction that destroys work.
  if (adminBest.mtimeMs > 0) {
    return { dir, admin, signals, binding: adminBest.binding, mtimeMs: adminBest.mtimeMs, fellBack: false };
  }
  signals.set("<dir>", mtimeOr0(dir));
  signals.set(".git", mtimeOr0(path.join(dir, ".git")));
  const best = pickBinding(signals);
  return { dir, admin, signals, binding: best.binding, mtimeMs: best.mtimeMs, fellBack: true };
}

function pickBinding(signals: ReadonlyMap<string, number>): {
  binding: string | null;
  mtimeMs: number;
} {
  let binding: string | null = null;
  let mtimeMs = 0;
  for (const [name, ms] of signals) {
    if (ms > mtimeMs) {
      mtimeMs = ms;
      binding = name;
    }
  }
  return { binding, mtimeMs };
}

/** Read the newest mtime among a small FIXED set of activity signals — never a tree walk. */
function defaultStatMtimeMs(dir: string): number {
  return readIdleSignals(dir).mtimeMs;
}

/** Recursive remove with a Windows fallback for long/locked node_modules paths. */
function defaultRemoveDir(dir: string): void {
  try {
    rmSync(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
    return;
  } catch (err) {
    // Windows chokes on long paths + files held by a straggler process; `rmdir /s /q` is more robust.
    if (process.platform === "win32") {
      const res = spawnSync("cmd", ["/c", "rmdir", "/s", "/q", dir], { encoding: "utf8" });
      if (res.status === 0) return;
      // One more rmSync pass — rmdir may have cleared enough to let node finish it.
      rmSync(dir, { recursive: true, force: true, maxRetries: 2, retryDelay: 300 });
      return;
    }
    throw err;
  }
}

/** The production IO — real git, real fs. */
export const defaultWorktreeIo: WorktreeIo = {
  runGit(args) {
    return (execFileSync("git", [...args], { encoding: "utf8" }) as string).trim();
  },
  listChildDirs(dir) {
    try {
      return readdirSync(dir, { withFileTypes: true })
        .filter((e) => e.isDirectory())
        .map((e) => e.name);
    } catch {
      return [];
    }
  },
  statMtimeMs: defaultStatMtimeMs,
  hasOwnGit(dir) {
    try {
      statSync(path.join(dir, ".git"));
      return true;
    } catch {
      return false;
    }
  },
  removeDir: defaultRemoveDir,
};

// ---------------------------------------------------------------------------
// Gather — build snapshots from git + fs (via the seam)
// ---------------------------------------------------------------------------

interface RegisteredEntry {
  readonly path: string;
  readonly branch: string | null;
  readonly detached: boolean;
  readonly locked: boolean;
  readonly lockReason: string | null;
}

/** Parse `git worktree list --porcelain` into per-worktree records. */
export function parseWorktreeList(porcelain: string): RegisteredEntry[] {
  const out: RegisteredEntry[] = [];
  type Cur = {
    path?: string;
    branch: string | null;
    detached: boolean;
    locked: boolean;
    lockReason: string | null;
  };
  let cur: Cur | null = null;
  const flush = (): void => {
    if (cur?.path !== undefined) {
      out.push({
        path: cur.path,
        branch: cur.branch,
        detached: cur.detached,
        locked: cur.locked,
        lockReason: cur.lockReason,
      });
    }
    cur = null;
  };
  for (const raw of porcelain.split(/\r?\n/)) {
    const line = raw.trimEnd();
    if (line.startsWith("worktree ")) {
      flush();
      cur = {
        path: line.slice("worktree ".length),
        branch: null,
        detached: false,
        locked: false,
        lockReason: null,
      };
    } else if (cur !== null && line.startsWith("branch ")) {
      // e.g. "branch refs/heads/claude/foo" → "claude/foo".
      cur.branch = line.slice("branch ".length).replace(/^refs\/heads\//, "");
    } else if (cur !== null && line === "detached") {
      cur.detached = true;
    } else if (cur !== null && (line === "locked" || line.startsWith("locked "))) {
      // Porcelain emits a bare "locked", or "locked <reason>" when one was given
      // (e.g. `locked claude session art-factory-story-split (pid 56740)`).
      cur.locked = true;
      const reason = line.slice("locked".length).trim();
      cur.lockReason = reason.length > 0 ? reason : null;
    }
  }
  flush();
  return out;
}

export interface GatherContext {
  readonly primaryRoot: string;
  readonly worktreesDir: string;
}

/** Resolve the primary root, the worktrees dir, and this session's worktree from git. */
export function resolveContext(io: WorktreeIo): GatherContext & { currentWorktree: string | null } {
  const commonGitDir = io.runGit(["rev-parse", "--path-format=absolute", "--git-common-dir"]);
  const primaryRoot = path.dirname(commonGitDir);
  const worktreesDir = path.join(primaryRoot, ".claude", "worktrees");
  let currentWorktree: string | null = null;
  try {
    const top = io.runGit(["rev-parse", "--show-toplevel"]);
    currentWorktree = top.length > 0 ? top : null;
  } catch {
    currentWorktree = null;
  }
  return { primaryRoot, worktreesDir, currentWorktree };
}

/**
 * The set of local branch names fully merged into origin/main — ONE `git branch --merged` spawn for
 * the whole registry, instead of a `merge-base` per worktree (the batch that keeps the scan fast).
 */
function mergedBranchSet(io: WorktreeIo): ReadonlySet<string> {
  try {
    const out = io.runGit([
      "branch",
      "--merged",
      "refs/remotes/origin/main",
      "--format=%(refname:short)",
    ]);
    return new Set(out.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length > 0));
  } catch {
    return new Set();
  }
}

/** True when a detached worktree's HEAD is already in origin/main (per-dir; few detached exist). */
function detachedMerged(io: WorktreeIo, dir: string): boolean {
  try {
    io.runGit(["-C", dir, "merge-base", "--is-ancestor", "HEAD", "refs/remotes/origin/main"]);
    return true;
  } catch {
    return false;
  }
}

/**
 * Is the worktree at `dir` DIRTY (uncommitted changes)? Husk-safe and spawn-frugal: a dir with no own
 * `.git` is a leftover husk, NOT its own worktree — running `git status` there would walk UP to the
 * primary and mis-report the PRIMARY's dirty state, so a husk is reported clean (nothing of its own to
 * lose). Only a dir with its own `.git` is probed, and even then the toplevel is re-checked so a
 * pathological link can't leak the parent's status. Called ONLY on reap candidates (never the whole
 * scan), so the git spawn cost is bounded to what is about to be deleted.
 *
 * `--no-optional-locks` IS LOAD-BEARING, not tidiness. A plain `git status` REWRITES the index when
 * the stat cache has drifted, which bumps admin `index` — an idle signal. That made this probe
 * self-defeating in three ways, all measured (worktree-reaper-eligibility-arc): a candidate deferred
 * by the `--cap` was pushed back to `cooling` for a fresh 48 h having never been removed; and BOTH
 * read-only surfaces — the default dry-run `prune` and `drain`, which advertises itself as removing
 * nothing and safe to run anywhere — reset the clock of the exact cohort they were reporting on.
 * With the flag, git answers from the index without writing it back (verified against git 2.54: the
 * index was byte-identical after, and rewritten without it). Do not drop it to "simplify" the call.
 */
export function worktreeDirty(io: WorktreeIo, dir: string): boolean {
  if (!io.hasOwnGit(dir)) return false;
  try {
    const top = io.runGit(["-C", dir, "rev-parse", "--show-toplevel"]);
    if (normPath(top) !== normPath(dir)) return false;
    return io.runGit(["-C", dir, "--no-optional-locks", "status", "--porcelain"]).length > 0;
  } catch {
    return false;
  }
}

/**
 * Build the full snapshot set: every registered worktree UNDER the worktrees dir, plus every on-disk
 * dir absent from the registry (the orphans). Worktrees outside `.claude/worktrees/` (the primary
 * itself, ad-hoc temp checkouts) are ignored — this command only ever touches the managed dir.
 */
export function gatherSnapshots(io: WorktreeIo, ctx: GatherContext): WorktreeSnapshot[] {
  const registered = parseWorktreeList(io.runGit(["worktree", "list", "--porcelain"]));
  const underManaged = (p: string): boolean =>
    normPath(p).startsWith(normPath(ctx.worktreesDir) + path.sep) ||
    normPath(p).startsWith(normPath(ctx.worktreesDir) + "/");

  // One batched merged-branch lookup for the whole registry (branch worktrees); detached HEADs are
  // checked per-dir below. `dirty` is DEFERRED — the confirm-clean pass in pruneWorktrees runs the
  // (expensive) git status only on reap candidates, so the scan itself stays spawn-frugal.
  const mergedBranches = mergedBranchSet(io);

  const snapshots: WorktreeSnapshot[] = [];
  const registeredNames = new Set<string>();

  for (const entry of registered) {
    if (!underManaged(entry.path)) continue;
    const name = path.basename(entry.path);
    registeredNames.add(normPath(entry.path));
    const merged = entry.detached
      ? detachedMerged(io, entry.path)
      : entry.branch !== null && mergedBranches.has(entry.branch);
    snapshots.push({
      path: entry.path,
      name,
      kind: "registered",
      detached: entry.detached,
      branch: entry.branch,
      merged,
      dirty: false, // deferred — confirmed on reap candidates only
      locked: entry.locked,
      lockReason: entry.lockReason,
      mtimeMs: io.statMtimeMs(entry.path),
    });
  }

  for (const child of io.listChildDirs(ctx.worktreesDir)) {
    const full = path.join(ctx.worktreesDir, child);
    if (registeredNames.has(normPath(full))) continue;
    snapshots.push({
      path: full,
      name: child,
      kind: "orphan",
      detached: false,
      branch: null,
      merged: false,
      dirty: false, // deferred (a husk is never dirty — see worktreeDirty)
      locked: false, // git no longer tracks an orphan, so it cannot hold a lock
      lockReason: null,
      mtimeMs: io.statMtimeMs(full),
    });
  }

  return snapshots;
}

// ---------------------------------------------------------------------------
// Execute — remove reap targets, prune dangling admin entries
// ---------------------------------------------------------------------------

export interface RemovalResult {
  readonly verdict: WorktreeVerdict;
  readonly ok: boolean;
  readonly method: "git-remove" | "rm" | "failed";
  readonly error?: string;
}

/**
 * Remove ONE reap target. Registered worktrees go through `git worktree remove --force` (clears the
 * admin entry too, and handles a lock); on failure — or for orphans (git no longer tracks them) —
 * fall back to a robust recursive delete.
 */
export function removeOne(io: WorktreeIo, verdict: WorktreeVerdict): RemovalResult {
  if (verdict.kind === "registered") {
    try {
      io.runGit(["worktree", "remove", "--force", verdict.path]);
      return { verdict, ok: true, method: "git-remove" };
    } catch {
      // Fall through to the raw delete (a wedged admin entry is cleared by the later `worktree prune`).
    }
  }
  try {
    io.removeDir(verdict.path);
    return { verdict, ok: true, method: "rm" };
  } catch (err) {
    return { verdict, ok: false, method: "failed", error: err instanceof Error ? err.message : String(err) };
  }
}

// ---------------------------------------------------------------------------
// The command
// ---------------------------------------------------------------------------

export interface PruneOptions {
  /** Actually remove (vs the default dry run). */
  readonly force: boolean;
  /** Confirmation for --force (there is no interactive prompt on the envelope CLI). */
  readonly yes: boolean;
  /** Hook mode: bounded + always-ok, off the session's hot path. */
  readonly hook: boolean;
  /** Max reaps this run (null = unbounded). The hook caps it small. */
  readonly cap: number | null;
  readonly includeDetached: boolean;
  readonly thresholdMs: number;
  /** Live worktree basenames (--pg, from the claim ledger — ADR-0200 D6); empty offline. */
  readonly liveSessions: ReadonlySet<string>;
}

export interface PruneDeps {
  readonly io?: WorktreeIo;
  readonly now?: () => number;
  /** The drain ledger seam (worktree-reaper-integrity-arc strand 3); defaults to the real fs. */
  readonly drain?: DrainLedgerIo;
  /** The per-signal idle reader (`worktree idle`); defaults to the real fs. */
  readonly idle?: (dir: string) => IdleSignalReading;
}

/**
 * Gather + classify + CONFIRM-CLEAN — the full survey, shared by `prune` and `drain`.
 *
 * The confirm-clean pass runs the (expensive) `git status` dirty probe ONLY on would-be reap targets,
 * so a live edit is never thrown away and the scan never pays status-per-worktree across the whole
 * registry. A husk short-circuits to clean with no spawn at all.
 */
export function surveyWorktrees(
  io: WorktreeIo,
  ctx: GatherContext,
  policy: PrunePolicy,
): WorktreeVerdict[] {
  return gatherSnapshots(io, ctx)
    .map((s) => classifyWorktree(s, policy))
    .map((v) =>
      v.decision === "reap" && worktreeDirty(io, v.path)
        ? {
            ...v,
            decision: "keep" as const,
            reason: "uncommitted changes present",
            hold: "dirty" as const,
          }
        : v,
    );
}

export const DEFAULT_PRUNE_OPTIONS: PruneOptions = {
  force: false,
  yes: false,
  hook: false,
  cap: null,
  includeDetached: false,
  thresholdMs: DEFAULT_THRESHOLD_MS,
  liveSessions: new Set(),
};

function summarise(verdicts: readonly WorktreeVerdict[]): { reg: number; orph: number } {
  return {
    reg: verdicts.filter((v) => v.kind === "registered").length,
    orph: verdicts.filter((v) => v.kind === "orphan").length,
  };
}

/**
 * `storytree worktree prune`. Gathers, classifies, and — only under `--force --yes` (or hook mode) —
 * removes. Everything is fail-soft: a refusal is guidance (ok:true with a next-step), and hook mode
 * always reports ok so a SessionStart hook never breaks the session.
 */
export function pruneWorktrees(options: PruneOptions, deps: PruneDeps = {}): Envelope {
  const io = deps.io ?? defaultWorktreeIo;
  const now = deps.now ? deps.now() : Date.now();

  let ctx: ReturnType<typeof resolveContext>;
  try {
    ctx = resolveContext(io);
  } catch (err) {
    const msg = `could not resolve the git worktree context: ${err instanceof Error ? err.message : String(err)}`;
    // Hook mode swallows every failure; the manual CLI surfaces it as guidance.
    return { ok: options.hook ? true : false, body: options.hook ? `[worktree prune] ${msg}` : msg, next: ["git status"] };
  }

  const policy: PrunePolicy = {
    now,
    thresholdMs: options.thresholdMs,
    primaryRoot: ctx.primaryRoot,
    currentWorktree: ctx.currentWorktree,
    includeDetached: options.includeDetached,
    liveSessions: options.liveSessions,
  };

  const verdicts = surveyWorktrees(io, ctx, policy);
  const reapAll = verdicts.filter((v) => v.decision === "reap");
  const kept = verdicts.filter((v) => v.decision === "keep");

  // Apply the cap (hook / --cap). The order is ALPHABETICAL, not oldest-first — the comment here used
  // to claim the latter, which was never true: `base()` drops `mtimeMs` from the verdict, so age is
  // not available to sort on. It is stated rather than fixed because the consequence is small and
  // knowable: a capped run always defers the same tail of the alphabet, so a worktree late in the
  // sort waits for the backlog ahead of it to clear. Deterministic beats arbitrary; if the cap is
  // ever observed to strand a specific tail indefinitely, carry `mtimeMs` onto the verdict and sort
  // by it rather than reintroducing this comment's claim.
  const ordered = [...reapAll].sort((a, b) => a.name.localeCompare(b.name));
  const targets = options.cap === null ? ordered : ordered.slice(0, Math.max(0, options.cap));
  const capped = reapAll.length - targets.length;

  const execute = options.force && (options.yes || options.hook);
  const counts = summarise(reapAll);
  const ledgerFile = drainLedgerPath(ctx.worktreesDir);
  const ledgerIo = deps.drain ?? defaultDrainLedgerIo;

  if (!execute) {
    const lines: string[] = [];
    lines.push(
      options.force && !options.yes
        ? `WOULD REAP ${reapAll.length} worktree(s) (${counts.reg} registered, ${counts.orph} orphaned) — add --yes to actually remove.`
        : `DRY RUN — would reap ${reapAll.length} worktree(s) (${counts.reg} registered, ${counts.orph} orphaned); keep ${kept.length}.`,
    );
    for (const v of targets) lines.push(`  reap  ${v.name}  [${v.kind}]  — ${v.reason}`);
    if (capped > 0) lines.push(`  … and ${capped} more (capped at ${options.cap}).`);
    // Surface the near-misses so a conservative keep is legible, not silent.
    const keptShown = kept.filter((v) => !isNeverTouch(v.reason)).slice(0, 12);
    if (keptShown.length > 0) {
      lines.push("keep:");
      for (const v of keptShown) lines.push(`  keep  ${v.name}  [${v.kind}]  — ${v.reason}`);
      if (kept.length > keptShown.length) lines.push(`  … and ${kept.length - keptShown.length} more kept.`);
    }
    // The census closes the truncation above: the per-name keep list is capped at 12, so on a large
    // registry it hides exactly the cohort worth seeing. Counts are never truncated. A dry run is NOT
    // recorded on the ledger — it drains nothing by design, and logging it would fake a stall.
    lines.push(
      "",
      ...formatDrainCensus(
        buildDrainRecord(verdicts, { at: now, executed: false, reaped: 0, failed: 0, capped }),
      ),
    );
    return {
      ok: true,
      body: lines.join("\n"),
      next: [
        "storytree worktree prune --force --yes   (execute)",
        "storytree worktree drain   (is the reaper actually draining?)",
      ],
    };
  }

  // Execute.
  const removals = targets.map((v) => removeOne(io, v));
  const reaped = removals.filter((r) => r.ok);
  const failed = removals.filter((r) => !r.ok);
  // Clear any dangling `.git/worktrees/*` admin entries left by a raw delete (best-effort).
  try {
    io.runGit(["worktree", "prune"]);
  } catch {
    // Non-fatal — the summary already reflects what was removed.
  }

  const reapedCounts = summarise(reaped.map((r) => r.verdict));
  const lines: string[] = [];
  lines.push(
    `${options.hook ? "[worktree prune] " : ""}Reaped ${reaped.length} worktree(s) (${reapedCounts.reg} registered, ${reapedCounts.orph} orphaned); kept ${kept.length}.`,
  );
  if (failed.length > 0) {
    lines.push(`Failed to remove ${failed.length}:`);
    for (const f of failed) lines.push(`  FAIL  ${f.verdict.name}  — ${f.error ?? "unknown error"}`);
  }
  if (capped > 0) lines.push(`Capped: ${capped} more reapable worktree(s) left for a later run (cap ${options.cap}).`);
  if (!options.hook) {
    for (const r of reaped) lines.push(`  reaped  ${r.verdict.name}  [${r.verdict.kind}]  (${r.method})`);
  }

  // RECORD THE RUN. This is the whole point of strand 3: an executing run that reaped ZERO now leaves
  // a durable number behind, so "held back N candidates every run for a week" is a readable series
  // rather than an absence. A ledger write that fails is reported, never swallowed — an unobserved
  // drain is the defect, so losing the observation silently would reintroduce it.
  const record = buildDrainRecord(verdicts, {
    at: now,
    executed: true,
    reaped: reaped.length,
    failed: failed.length,
    capped,
  });
  const written = recordDrainRun(ledgerIo, ledgerFile, record);
  if (!options.hook) {
    const health = classifyDrainHealth(readDrainHistory(ledgerIo, ledgerFile), {
      now,
      thresholdMs: options.thresholdMs,
    });
    lines.push("", ...formatDrainCensus(record), "", ...formatDrainHealth(health));
  }
  if (!written.ok) {
    lines.push(
      `${options.hook ? "[worktree prune] " : ""}WARN could not record this run on the drain ledger (${ledgerFile}): ${written.error ?? "unknown error"}`,
    );
  }

  return {
    ok: true,
    body: lines.join("\n"),
    next: options.hook ? [] : ["storytree worktree drain", "storytree worktree prune   (dry-run the remainder)"],
  };
}

/** The two anchors classifyWorktree keeps unconditionally — hidden from the dry-run keep list. */
function isNeverTouch(reason: string): boolean {
  return reason.startsWith("primary checkout") || reason.startsWith("current worktree");
}

// ---------------------------------------------------------------------------
// `storytree worktree drain` — the check that can go red
// ---------------------------------------------------------------------------

export interface DrainStatusOptions {
  readonly thresholdMs: number;
  readonly includeDetached: boolean;
  readonly liveSessions: ReadonlySet<string>;
}

/**
 * `storytree worktree drain` — read-only: is the reaper actually draining?
 *
 * This is strand 3's answer to "a run that reaps nothing is observable". It reads the ledger every
 * executing run appends to, classifies the series, and prints today's population census beside it.
 * It REMOVES NOTHING and needs no DB, so it is safe to run anywhere on demand.
 *
 * A `pnpm gate` rung wiring this in was proposed and REFUSED on measured evidence
 * (`drain-check-needs-a-gate-rung`, closed 2026-08-08): replayed against all 47 recorded runs, the
 * check never once failed, and it fails ADR-0311 D5's production-catch bar — machine-local
 * `.claude/worktrees/` state is the category D2 retired by name. Do not re-derive that proposal; the
 * automatic voice this check needed instead is `worktree-prune-entry.ts`'s SessionStart `--announce`
 * call (`drain-announce-is-muted-at-the-launcher`), which reads this same series without a gate.
 *
 * It returns `ok: false` — exit 1 — when the drain is STALLED, which is what makes it a check rather
 * than a report. `warn` states (unproven, stopped, outpaced) exit 0 and say so, mirroring the house
 * `check:*` idiom where a WARN informs and a FAIL blocks.
 */
export function worktreeDrainStatus(
  options: DrainStatusOptions,
  deps: PruneDeps = {},
): Envelope {
  const io = deps.io ?? defaultWorktreeIo;
  const ledgerIo = deps.drain ?? defaultDrainLedgerIo;
  const now = deps.now ? deps.now() : Date.now();

  let ctx: ReturnType<typeof resolveContext>;
  try {
    ctx = resolveContext(io);
  } catch (err) {
    return {
      ok: false,
      body: `could not resolve the git worktree context: ${err instanceof Error ? err.message : String(err)}`,
      next: ["git status"],
    };
  }

  const ledgerFile = drainLedgerPath(ctx.worktreesDir);
  const history = readDrainHistory(ledgerIo, ledgerFile);
  const health = classifyDrainHealth(history, { now, thresholdMs: options.thresholdMs });

  // Today's live census — the same survey `prune` runs, so the numbers cannot disagree with it.
  const verdicts = surveyWorktrees(io, ctx, {
    now,
    thresholdMs: options.thresholdMs,
    primaryRoot: ctx.primaryRoot,
    currentWorktree: ctx.currentWorktree,
    includeDetached: options.includeDetached,
    liveSessions: options.liveSessions,
  });
  const record = buildDrainRecord(verdicts, {
    at: now,
    executed: false,
    reaped: 0,
    failed: 0,
    capped: 0,
  });

  const executing = history.filter((r) => r.executed);
  const lines = [
    ...formatDrainHealth(health),
    "",
    ...formatDrainCensus(record),
    "",
    `ledger: ${ledgerFile} — ${history.length} record(s), ${executing.length} executing.`,
  ];
  if (executing.length > 0) {
    lines.push("recent executing runs (newest last):");
    for (const r of executing.slice(-8)) {
      lines.push(
        `  ${new Date(r.at).toISOString()}  pop ${String(r.population).padStart(3)}  reapable ${String(r.reapable).padStart(3)}  reaped ${String(r.reaped).padStart(3)}  cooling ${String(r.held.cooling).padStart(3)}`,
      );
    }
  }

  return {
    // FAIL is the only red: a stall is a measured defect, a warn is information.
    ok: health.level !== "fail",
    body: lines.join("\n"),
    next: [
      "storytree worktree prune                  (what would be reaped right now)",
      "storytree worktree prune --force --yes    (drain it)",
    ],
  };
}

// ---------------------------------------------------------------------------
// `storytree worktree idle` — WHY is the clock reading what it reads
// ---------------------------------------------------------------------------

/** A set of worktrees whose idle stamps land on the same second — the bulk-sweep signature. */
export interface IdleStampCluster {
  /** The shared stamp, truncated to the second. */
  readonly atMs: number;
  /** The signal carrying it. */
  readonly signal: string;
  /** The worktrees sharing it, by name. */
  readonly names: readonly string[];
}

/**
 * Find worktrees whose idle clocks were stamped at the same instant.
 *
 * THE POINT. Two unrelated worktrees cannot be USED at the same second; a shared stamp means one
 * pass touched them both, and a pass is not activity. This is the generic detector for the fault
 * class that has now bitten twice — the reflog rewrite (76 worktrees, one `reflog expire --all`) and
 * the empty-`.codex/` scaffold (4 worktrees, a 59 ms window) — each of which took a bespoke
 * investigation to find because the reaper reported only a verdict, never the evidence behind it.
 * A third instance should announce itself here instead.
 *
 * Second granularity, not millisecond: the measured `.codex/` sweep spanned 59 ms across four
 * worktrees, so an exact-equality match would have missed it entirely.
 */
export function detectIdleStampClusters(
  readings: readonly IdleSignalReading[],
  minSize = 3,
): IdleStampCluster[] {
  const groups = new Map<string, { atMs: number; signal: string; names: string[] }>();
  for (const r of readings) {
    if (r.mtimeMs <= 0 || r.binding === null) continue;
    const second = Math.floor(r.mtimeMs / 1000) * 1000;
    const key = `${r.binding}@${second}`;
    const g = groups.get(key) ?? { atMs: second, signal: r.binding, names: [] };
    g.names.push(path.basename(r.dir));
    groups.set(key, g);
  }
  return [...groups.values()]
    .filter((g) => g.names.length >= minSize)
    .sort((a, b) => b.names.length - a.names.length || b.atMs - a.atMs)
    .map((g) => ({ atMs: g.atMs, signal: g.signal, names: g.names }));
}

export interface IdleReportOptions {
  readonly thresholdMs: number;
}

/**
 * `storytree worktree idle` — read-only: WHICH signal is holding each worktree back, and is anything
 * resetting the clock in bulk?
 *
 * `prune` decides and `drain` reports the series; neither could ever answer "why is this worktree
 * not ageing?", which is the question that mattered when 56 of 68 worktrees sat in `cooling` — merged,
 * clean, and disqualified on idleness alone. The verdict said `merged but active < 48h ago` and named
 * no culprit, so finding the writer took a bespoke sweep. This prints the breakdown that made it
 * obvious, and stats only the fixed signal set — no tree walk, no git spawn, no DB.
 */
export function worktreeIdleReport(options: IdleReportOptions, deps: PruneDeps = {}): Envelope {
  const io = deps.io ?? defaultWorktreeIo;
  const readIdle = deps.idle ?? readIdleSignals;
  const now = deps.now ? deps.now() : Date.now();

  let ctx: ReturnType<typeof resolveContext>;
  try {
    ctx = resolveContext(io);
  } catch (err) {
    return {
      ok: false,
      body: `could not resolve the git worktree context: ${err instanceof Error ? err.message : String(err)}`,
      next: ["git status"],
    };
  }

  const names = io.listChildDirs(ctx.worktreesDir);
  if (names.length === 0) {
    return {
      ok: true,
      body: `no worktrees under ${ctx.worktreesDir} — nothing to report.`,
      next: ["storytree worktree drain"],
    };
  }

  const readings = names.map((n) => readIdle(path.join(ctx.worktreesDir, n)));
  const thresholdH = Math.round(options.thresholdMs / 3_600_000);
  const ageH = (r: IdleSignalReading): number =>
    r.mtimeMs > 0 ? (now - r.mtimeMs) / 3_600_000 : Number.POSITIVE_INFINITY;

  const sorted = [...readings].sort((a, b) => ageH(a) - ageH(b));
  const lines: string[] = [
    `IDLE CLOCK — what the reaper reads, per worktree (threshold ${thresholdH}h).`,
    "",
    "  age      binding      worktree",
  ];
  for (const r of sorted) {
    const age = ageH(r);
    const ageStr = Number.isFinite(age) ? `${age.toFixed(1)}h`.padStart(7) : "unknown";
    const binding = `${r.binding ?? "none"}${r.fellBack ? "*" : ""}`.padEnd(11);
    lines.push(`  ${ageStr}  ${binding}  ${path.basename(r.dir)}`);
  }

  const histogram = new Map<string, number>();
  for (const r of readings) {
    const key = `${r.binding ?? "none"}${r.fellBack ? "*" : ""}`;
    histogram.set(key, (histogram.get(key) ?? 0) + 1);
  }
  const idleCount = readings.filter((r) => ageH(r) >= thresholdH).length;
  lines.push(
    "",
    `binding: ${[...histogram].map(([k, v]) => `${k} ${v}`).join(" · ")}`,
    `past the ${thresholdH}h threshold: ${idleCount} of ${readings.length}.`,
    "* = FALLBACK to the worktree's own files (an orphan with no admin dir). A registered worktree is",
    "  judged only by its admin HEAD/index/ORIG_HEAD — those are written by git ops IN it, and nothing",
    "  else. Its directory mtime is NOT read: any pass that creates or deletes a top-level entry bumps",
    "  it, which is how an empty `.codex/` scaffold once erased 25-40 days of idleness on 4 worktrees.",
  );

  const clusters = detectIdleStampClusters(readings);
  if (clusters.length > 0) {
    lines.push("", "⚠ BULK SWEEP SUSPECTED — unrelated worktrees cannot be used at the same second:");
    for (const c of clusters) {
      lines.push(
        `  ${new Date(c.atMs).toISOString()}  [${c.signal}]  ${c.names.length} worktrees: ${c.names.join(", ")}`,
      );
    }
    lines.push(
      "  Something touched them in one pass. Find it before trusting these ages — a shared stamp is",
      "  the fingerprint of an externally reset clock, not of activity.",
    );
  } else {
    lines.push("", "no bulk-sweep signature: no 3+ worktrees share an idle stamp to the second.");
  }

  return {
    ok: true,
    body: lines.join("\n"),
    next: [
      "storytree worktree drain                  (is the reaper actually draining?)",
      "storytree worktree prune                  (what would be reaped right now)",
    ],
  };
}

/** The `storytree worktree` help envelope. */
export function worktreeHelp(): Envelope {
  return {
    ok: true,
    body: [
      "storytree worktree — worktree lifecycle hygiene (ADR-0200 / ADR-0142 / ADR-0033): create and reap are inverse ceremonies.",
      "",
      '  storytree worktree create --node <story>… --intent "<what>" --pg',
      "                                             the claim-gated workspace ceremony (ADR-0200 D3): takes the",
      "                                             exploring claim(s) FIRST (no claim, no workspace), mints the",
      "                                             <arc>-<story>-<suffix> name (basename = your session id),",
      "                                             cuts the worktree off origin/main, installs, and returns the",
      "                                             start payload (claims + board digest + work-from-this-path).",
      "",
      "  storytree worktree prune [--force --yes]   reap DEAD worktrees under .claude/worktrees/:",
      "                                             registered worktrees merged into origin/main, clean,",
      "                                             and idle; plus orphaned dirs git no longer tracks.",
      "",
      "  storytree worktree drain                   IS THE REAPER DRAINING? read-only, offline. Reads the",
      "                                             ledger every executing run appends to and calls it:",
      "                                             OK / WARN / FAIL, exit 1 on a measured STALL. Prints",
      "                                             today's population census (holds bucketed) beside it.",
      "",
      "  storytree worktree idle                    WHY is the clock reading what it reads? read-only,",
      "                                             offline. Per-worktree age + WHICH signal binds, and",
      "                                             a BULK-SWEEP alarm when 3+ unrelated worktrees share",
      "                                             an idle stamp to the second (they cannot all have",
      "                                             been used at once — something swept them).",
      "",
      "prune flags:",
      "  --dry-run            (default) print what WOULD be reaped, remove nothing",
      "  --force --yes        actually remove (both required — there is no interactive prompt)",
      "  --cap <n>            reap at most n this run (the SessionStart hook caps it small)",
      "  --include-detached   also reap idle detached-HEAD worktrees (kept by default — a gate may be intentional)",
      "  --threshold-hours <n>  idle threshold (default 48) — the offline 'no live session' proxy",
      "  --pg                 consult the notice board: a worktree with a live session is kept",
      "",
      "NEVER reaped: the primary checkout, the current worktree, unmerged branches, dirty trees,",
      "worktrees held by `git worktree lock` (release with `git worktree unlock <path>`),",
      "or (without --include-detached) detached-HEAD gate worktrees.",
      "",
      "IDLE SIGNAL: newest mtime across the admin HEAD/index/ORIG_HEAD — the files git writes",
      "only for operations IN this worktree. The worktree's OWN dir and .git file are NOT read",
      "(only as a fallback for an orphan with no admin dir): anything can write into a checkout,",
      "so reading it measures the world, not the worktree. Reflogs are excluded for the same",
      "reason — `git gc` rewrites every worktree's logs/HEAD in one pass. Both exclusions are one",
      "fault class: a signal someone ELSE writes in bulk. `worktree idle` names it when it recurs.",
      "",
      "DRAIN LEDGER: every EXECUTING run appends one line to .claude/worktrees/.prune-history.jsonl",
      "(dry runs do not — they drain nothing by design, and recording them would fake a stall).",
      "`worktree drain` reads that series, so a reaper that has been reaping ZERO is visible without",
      "an owner running a manual stock take — silence is no longer the signal for 'nothing drained'.",
    ].join("\n"),
    next: [
      'storytree worktree create --node <story> --intent "<what>" --pg',
      "storytree worktree prune",
      "storytree worktree drain",
    ],
  };
}
