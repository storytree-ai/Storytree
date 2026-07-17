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
 * SAFETY (this is destructive — every rule errs toward KEEP):
 *   - the primary checkout and the CURRENT worktree are NEVER reaped (force cannot override);
 *   - a worktree whose session holds a live claim on the ledger (--pg, ADR-0200 D6) is kept — its
 *     basename is the session id (ADR-0033);
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

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type WorktreeKind = "registered" | "orphan";
export type Decision = "reap" | "keep";

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
  const keep = (reason: string): WorktreeVerdict => ({ ...base(s), decision: "keep", reason });
  const reap = (reason: string): WorktreeVerdict => ({ ...base(s), decision: "reap", reason });

  // Absolute keeps — --force NEVER overrides these two (deleting your own cwd or the primary is
  // catastrophic; the task's hard invariant).
  if (samePath(s.path, policy.primaryRoot)) return keep("primary checkout — never reaped");
  if (samePath(s.path, policy.currentWorktree)) return keep("current worktree (this session)");

  // A live session is authoritative (--pg): its session id IS this worktree's basename (ADR-0033).
  if (policy.liveSessions.has(s.name)) return keep("live session on the notice board (--pg)");

  // Uncommitted work is never thrown away.
  if (s.dirty) return keep("uncommitted changes present");

  const ageMs = s.mtimeMs > 0 ? policy.now - s.mtimeMs : Number.POSITIVE_INFINITY;
  const idle = ageMs >= policy.thresholdMs;
  const idleFor = Number.isFinite(ageMs) ? `${Math.floor(ageMs / 3_600_000)}h` : "unknown age";
  const thresholdH = Math.round(policy.thresholdMs / 3_600_000);

  if (s.kind === "orphan") {
    if (!idle) return keep(`orphaned but active < ${thresholdH}h ago`);
    return reap(`orphaned (absent from git worktree list), idle ${idleFor}`);
  }

  // Registered from here.
  if (s.detached) {
    if (!policy.includeDetached) {
      return keep("detached HEAD (may be an intentional gate) — pass --include-detached to reap");
    }
    if (!idle) return keep(`detached HEAD, active < ${thresholdH}h ago`);
    return reap(`detached HEAD, idle ${idleFor} (--include-detached)`);
  }
  if (!s.merged) return keep("branch not merged into origin/main (live work)");
  // merged + clean + not-current + no live row:
  if (!idle) return keep(`merged but active < ${thresholdH}h ago (a session may be mid branch-next)`);
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

/** Read the newest mtime among a small FIXED set of activity signals — never a tree walk. */
function defaultStatMtimeMs(dir: string): number {
  const mtimeOr0 = (p: string): number => {
    try {
      return statSync(p).mtimeMs;
    } catch {
      return 0;
    }
  };
  let newest = Math.max(mtimeOr0(dir), mtimeOr0(path.join(dir, ".git")));
  // A worktree's `.git` is a FILE ("gitdir: <admin>"); the admin dir's HEAD/index/logs track git ops
  // (commit, checkout, fetch) — a precise "recently used" signal with no node_modules walk.
  try {
    const gitfile = readFileSync(path.join(dir, ".git"), "utf8");
    const m = /^gitdir:\s*(.+)$/m.exec(gitfile);
    if (m && m[1] !== undefined) {
      const admin = m[1].trim();
      for (const f of ["HEAD", "index", "ORIG_HEAD", path.join("logs", "HEAD")]) {
        newest = Math.max(newest, mtimeOr0(path.join(admin, f)));
      }
    }
  } catch {
    // No gitfile (orphan / plain dir) — the dir mtime above stands.
  }
  return newest;
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
}

/** Parse `git worktree list --porcelain` into per-worktree records. */
export function parseWorktreeList(porcelain: string): RegisteredEntry[] {
  const out: RegisteredEntry[] = [];
  let cur: { path?: string; branch: string | null; detached: boolean } | null = null;
  const flush = (): void => {
    if (cur?.path !== undefined) out.push({ path: cur.path, branch: cur.branch, detached: cur.detached });
    cur = null;
  };
  for (const raw of porcelain.split(/\r?\n/)) {
    const line = raw.trimEnd();
    if (line.startsWith("worktree ")) {
      flush();
      cur = { path: line.slice("worktree ".length), branch: null, detached: false };
    } else if (cur !== null && line.startsWith("branch ")) {
      // e.g. "branch refs/heads/claude/foo" → "claude/foo".
      cur.branch = line.slice("branch ".length).replace(/^refs\/heads\//, "");
    } else if (cur !== null && line === "detached") {
      cur.detached = true;
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
 */
export function worktreeDirty(io: WorktreeIo, dir: string): boolean {
  if (!io.hasOwnGit(dir)) return false;
  try {
    const top = io.runGit(["-C", dir, "rev-parse", "--show-toplevel"]);
    if (normPath(top) !== normPath(dir)) return false;
    return io.runGit(["-C", dir, "status", "--porcelain"]).length > 0;
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

  const snapshots = gatherSnapshots(io, ctx);
  // Cheap classification first (dirty deferred), then a CONFIRM-CLEAN pass: the git-status dirty probe
  // runs ONLY on would-be reap targets (a husk short-circuits to clean with no spawn), so a live edit
  // is never thrown away and the scan never pays status-per-worktree across the whole registry.
  const verdicts = snapshots
    .map((s) => classifyWorktree(s, policy))
    .map((v) =>
      v.decision === "reap" && worktreeDirty(io, v.path)
        ? { ...v, decision: "keep" as const, reason: "uncommitted changes present" }
        : v,
    );
  const reapAll = verdicts.filter((v) => v.decision === "reap");
  const kept = verdicts.filter((v) => v.decision === "keep");

  // Apply the cap (hook / --cap): the OLDEST-first, so a bounded run drains the deadest husks first.
  const ordered = [...reapAll].sort((a, b) => a.name.localeCompare(b.name));
  const targets = options.cap === null ? ordered : ordered.slice(0, Math.max(0, options.cap));
  const capped = reapAll.length - targets.length;

  const execute = options.force && (options.yes || options.hook);
  const counts = summarise(reapAll);

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
    return {
      ok: true,
      body: lines.join("\n"),
      next: ["storytree worktree prune --force --yes   (execute)", "git worktree list"],
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

  return {
    ok: true,
    body: lines.join("\n"),
    next: options.hook ? [] : ["git worktree list", "storytree worktree prune   (dry-run the remainder)"],
  };
}

/** The two anchors classifyWorktree keeps unconditionally — hidden from the dry-run keep list. */
function isNeverTouch(reason: string): boolean {
  return reason.startsWith("primary checkout") || reason.startsWith("current worktree");
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
      "prune flags:",
      "  --dry-run            (default) print what WOULD be reaped, remove nothing",
      "  --force --yes        actually remove (both required — there is no interactive prompt)",
      "  --cap <n>            reap at most n this run (the SessionStart hook caps it small)",
      "  --include-detached   also reap idle detached-HEAD worktrees (kept by default — a gate may be intentional)",
      "  --threshold-hours <n>  idle threshold (default 48) — the offline 'no live session' proxy",
      "  --pg                 consult the notice board: a worktree with a live session is kept",
      "",
      "NEVER reaped: the primary checkout, the current worktree, unmerged branches, dirty trees,",
      "or (without --include-detached) detached-HEAD gate worktrees.",
    ].join("\n"),
    next: [
      'storytree worktree create --node <story> --intent "<what>" --pg',
      "storytree worktree prune",
      "storytree worktree prune --force --yes",
    ],
  };
}
