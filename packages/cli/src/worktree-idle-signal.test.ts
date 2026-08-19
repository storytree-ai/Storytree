import test from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  classifyWorktree,
  defaultWorktreeIo,
  detectIdleStampClusters,
  readIdleSignals,
  DEFAULT_THRESHOLD_MS,
  type IdleSignalReading,
  type PrunePolicy,
  type WorktreeSnapshot,
} from "./worktree.js";

/**
 * The IDLE SIGNAL — proven against a REAL filesystem, not a mock (worktree-reaper-integrity-arc).
 *
 * WHY THIS FILE EXISTS. `worktree.test.ts` proves the safety policy with fixtures and injects a
 * stubbed `statMtimeMs` throughout — so the production idle proxy (`defaultWorktreeIo.statMtimeMs`)
 * had NO test of its own, and a defect inside it was invisible to a fully green suite. That is
 * exactly what happened: the proxy read the admin `logs/HEAD` (a REFLOG) as an activity signal, and
 * git's auto-gc (`gc.auto` at the default 6700 on a busy repo) runs `reflog expire --all`, which
 * rewrites EVERY worktree's reflog in one pass. Measured 2026-07-27: all 76 worktrees carried an
 * identical `logs/HEAD` mtime, the 48 h idle clock was reset on all of them simultaneously, and
 * 59 merged-clean worktrees (~74 GB) were held back every run by `merged but active < 48h ago`.
 *
 * So these tests build REAL worktree admin layouts in a temp dir, stamp REAL mtimes, and drive the
 * REAL `defaultWorktreeIo.statMtimeMs` — the only way to catch a bug that lives in the IO the rest
 * of the suite mocks away.
 */

// ---------------------------------------------------------------------------
// Real-filesystem fixture — a faithful `.claude/worktrees/<name>` + `.git/worktrees/<name>` pair
// ---------------------------------------------------------------------------

/** The activity signals a worktree layout can carry, and when each was last written. */
interface Stamps {
  /** The worktree dir itself, and its `.git` gitfile. */
  readonly dir: number;
  /** Admin `HEAD` / `index` / `ORIG_HEAD` — written only by git ops IN this worktree. */
  readonly admin: number;
  /** Admin `logs/HEAD` — the REFLOG, rewritten wholesale by repo-wide `reflog expire --all`. */
  readonly reflog: number;
}

const secs = (ms: number): number => ms / 1000;

/**
 * Build one real worktree layout under `root` and stamp every signal.
 *
 * Order matters: creating a child updates its parent's mtime, so all files are created FIRST and
 * the directory mtimes are stamped LAST — otherwise the fixture's own writes would poison the very
 * signal under test.
 */
function makeWorktree(root: string, name: string, stamps: Stamps): string {
  const dir = path.join(root, ".claude", "worktrees", name);
  const admin = path.join(root, ".git", "worktrees", name);
  mkdirSync(dir, { recursive: true });
  mkdirSync(path.join(admin, "logs"), { recursive: true });

  // A worktree's `.git` is a FILE pointing at its admin dir — the link the proxy follows.
  writeFileSync(path.join(dir, ".git"), `gitdir: ${admin}\n`, "utf8");
  for (const f of ["HEAD", "index", "ORIG_HEAD"]) {
    writeFileSync(path.join(admin, f), `${f}\n`, "utf8");
  }
  writeFileSync(path.join(admin, "logs", "HEAD"), "reflog\n", "utf8");

  // Files first…
  utimesSync(path.join(dir, ".git"), secs(stamps.dir), secs(stamps.dir));
  for (const f of ["HEAD", "index", "ORIG_HEAD"]) {
    utimesSync(path.join(admin, f), secs(stamps.admin), secs(stamps.admin));
  }
  utimesSync(path.join(admin, "logs", "HEAD"), secs(stamps.reflog), secs(stamps.reflog));
  // …directories last, so the writes above cannot bump them.
  utimesSync(path.join(admin, "logs"), secs(stamps.reflog), secs(stamps.reflog));
  utimesSync(admin, secs(stamps.admin), secs(stamps.admin));
  utimesSync(dir, secs(stamps.dir), secs(stamps.dir));
  return dir;
}

/**
 * A HUSK — an on-disk worktree dir with no `.git` gitfile, which is what a half-completed
 * `git worktree remove` leaves behind. It has no admin dir, so its own mtime is all there is.
 */
function makeOrphan(root: string, name: string, at: number): string {
  const dir = path.join(root, ".claude", "worktrees", name);
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, "README.md"), "husk\n", "utf8");
  utimesSync(path.join(dir, "README.md"), secs(at), secs(at));
  utimesSync(dir, secs(at), secs(at));
  return dir;
}

function withTempRoot(fn: (root: string) => void): void {
  const root = mkdtempSync(path.join(os.tmpdir(), "st-idle-signal-"));
  try {
    fn(root);
  } finally {
    rmSync(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
  }
}

const NOW = Date.now();
const IDLE = NOW - 100 * 3_600_000; // 100 h ago — comfortably past the 48 h threshold
const FRESH = NOW - 60_000; // one minute ago — "active" by any reading

function policy(overrides: Partial<PrunePolicy> = {}): PrunePolicy {
  return {
    now: NOW,
    thresholdMs: DEFAULT_THRESHOLD_MS,
    primaryRoot: path.join(os.tmpdir(), "st-idle-signal-primary"),
    currentWorktree: null,
    includeDetached: false,
    liveSessions: new Set<string>(),
    ...overrides,
  };
}

/** A merged + clean registered worktree — the shape the reaper is supposed to drain. */
function snapshotOf(dir: string, mtimeMs: number): WorktreeSnapshot {
  return {
    path: dir,
    name: path.basename(dir),
    kind: "registered",
    detached: false,
    branch: `claude/${path.basename(dir)}`,
    merged: true,
    dirty: false,
    locked: false,
    lockReason: null,
    mtimeMs,
  };
}

// ---------------------------------------------------------------------------
// THE REGRESSION — a repo-wide reflog rewrite must not revive an untouched worktree
// ---------------------------------------------------------------------------

test("REGRESSION: an untouched worktree whose reflog was just rewritten still reads IDLE and is reaped", () => {
  withTempRoot((root) => {
    // The exact production condition: nothing has happened in this worktree for 100 h, but git's
    // auto-gc rewrote its `logs/HEAD` a minute ago.
    const dir = makeWorktree(root, "merged-idle", { dir: IDLE, admin: IDLE, reflog: FRESH });

    const mtimeMs = defaultWorktreeIo.statMtimeMs(dir);

    assert.ok(
      mtimeMs <= IDLE + 60_000,
      `the idle proxy must ignore the rewritten reflog, but it reported ${new Date(mtimeMs).toISOString()} ` +
        `(reflog ${new Date(FRESH).toISOString()}, real activity ${new Date(IDLE).toISOString()})`,
    );

    const verdict = classifyWorktree(snapshotOf(dir, mtimeMs), policy());
    assert.equal(
      verdict.decision,
      "reap",
      `a merged, clean, 100 h-idle worktree must be reaped; got keep — ${verdict.reason}`,
    );
  });
});

test("REGRESSION at scale: one `reflog expire --all` pass must not hold back the whole registry", () => {
  withTempRoot((root) => {
    // The measured shape: every worktree's reflog carries the SAME fresh stamp from one gc pass.
    const names = ["alpha", "bravo", "charlie", "delta", "echo"];
    const verdicts = names.map((name) => {
      const dir = makeWorktree(root, name, { dir: IDLE, admin: IDLE, reflog: FRESH });
      return classifyWorktree(snapshotOf(dir, defaultWorktreeIo.statMtimeMs(dir)), policy());
    });

    const kept = verdicts.filter((v) => v.decision === "keep");
    assert.deepEqual(
      kept.map((v) => `${v.name}: ${v.reason}`),
      [],
      "a single repo-wide reflog rewrite must not hold back any idle worktree",
    );
  });
});

// ---------------------------------------------------------------------------
// THE COUNTERWEIGHT — the fix must not simply blind the clock
// ---------------------------------------------------------------------------

/**
 * The trap this arc exists to avoid is a vacuous proof: deleting every signal would pass the two
 * regressions above while making the reaper delete LIVE worktrees. So each honest signal is stamped
 * fresh IN TURN and must, on its own, keep the worktree alive.
 */
test("ACTIVE: a fresh `admin` signal alone keeps an otherwise-idle worktree (the clock still sees real use)", () => {
  withTempRoot((root) => {
    const dir = makeWorktree(root, "active-admin", { dir: IDLE, admin: FRESH, reflog: IDLE });

    const mtimeMs = defaultWorktreeIo.statMtimeMs(dir);
    assert.ok(
      mtimeMs >= FRESH - 5_000,
      `a fresh admin signal must be seen; proxy reported ${new Date(mtimeMs).toISOString()}`,
    );

    const verdict = classifyWorktree(snapshotOf(dir, mtimeMs), policy());
    assert.equal(verdict.decision, "keep", "fresh admin activity must keep the worktree");
    assert.match(verdict.reason, /active </);
  });
});

/**
 * The ORPHAN counterweight. Dropping the worktree's own files from the honest set must not blind the
 * clock on a husk, which has no admin dir at all — there, the dir mtime is the only evidence there
 * is, and a fresh one must still keep it. (Erring toward KEEP is the safe direction: the failure
 * mode of an over-eager idle reading is deleting someone's work.)
 */
test("ACTIVE: an ORPHAN with no admin dir still falls back to its own mtime, and a fresh one keeps it", () => {
  withTempRoot((root) => {
    const dir = makeOrphan(root, "husk-fresh", FRESH);

    const reading = readIdleSignals(dir);
    assert.equal(reading.admin, null, "a husk has no admin dir");
    assert.equal(reading.fellBack, true, "with no admin dir the reading must fall back");
    assert.ok(
      reading.mtimeMs >= FRESH - 5_000,
      `the fallback must see the husk's own mtime; got ${new Date(reading.mtimeMs).toISOString()}`,
    );

    const snap = { ...snapshotOf(dir, reading.mtimeMs), kind: "orphan" as const, merged: false };
    assert.equal(classifyWorktree(snap, policy()).decision, "keep");
  });
});

test("an idle ORPHAN is still reaped — the fallback ages, it does not pin", () => {
  withTempRoot((root) => {
    const dir = makeOrphan(root, "husk-idle", IDLE);
    const snap = {
      ...snapshotOf(dir, defaultWorktreeIo.statMtimeMs(dir)),
      kind: "orphan" as const,
      merged: false,
    };
    assert.equal(classifyWorktree(snap, policy()).decision, "reap");
  });
});

// ---------------------------------------------------------------------------
// THE REGRESSION THIS ARC EXISTS FOR — an HONEST clock reset from OUTSIDE
// ---------------------------------------------------------------------------

/**
 * The reflog bug was an INTERNALLY WRONG signal: git housekeeping owned `logs/HEAD`, so the reaper
 * was reading the repo's last maintenance. This is the opposite shape and the same fault class — the
 * worktree's own directory mtime is an honest file, reset from OUTSIDE by anything that creates or
 * deletes a top-level entry.
 *
 * Measured 2026-08-19: four unrelated worktrees carried a `dir` mtime inside a 59 ms window while
 * their admin signals sat frozen 25-40 days in the past. Each had gained an EMPTY `.codex/`
 * directory; creating a child stamps the parent, so a directory containing nothing erased more than
 * a month of accumulated idleness. 56 of 68 worktrees were held in `cooling` — merged, clean, and
 * disqualified on idleness alone.
 */
test("REGRESSION: an empty directory created inside an untouched worktree does not revive it", () => {
  withTempRoot((root) => {
    const dir = makeWorktree(root, "swept", { dir: IDLE, admin: IDLE, reflog: IDLE });

    // The exact production event: a pass scaffolds an empty `.codex/`, stamping the parent NOW.
    mkdirSync(path.join(dir, ".codex"));

    const mtimeMs = defaultWorktreeIo.statMtimeMs(dir);
    assert.ok(
      mtimeMs <= IDLE + 60_000,
      `a directory created by an external pass is not this worktree being used, but the clock read ` +
        `${new Date(mtimeMs).toISOString()} (real activity ${new Date(IDLE).toISOString()})`,
    );

    const verdict = classifyWorktree(snapshotOf(dir, mtimeMs), policy());
    assert.equal(
      verdict.decision,
      "reap",
      `a merged, clean, 100 h-idle worktree must be reaped; got keep — ${verdict.reason}`,
    );
  });
});

test("REGRESSION: a DELETION inside the worktree root does not revive it either (it leaves no other trace)", () => {
  withTempRoot((root) => {
    const dir = makeWorktree(root, "swept-delete", { dir: IDLE, admin: IDLE, reflog: IDLE });
    // Created before the dir is re-stamped idle, so only the DELETE below is under test.
    writeFileSync(path.join(dir, "CLAUDE.local.md"), "x\n", "utf8");
    utimesSync(dir, secs(IDLE), secs(IDLE));

    rmSync(path.join(dir, "CLAUDE.local.md"));

    assert.ok(
      defaultWorktreeIo.statMtimeMs(dir) <= IDLE + 60_000,
      "a file removed by an external sweep must not read as activity",
    );
  });
});

test("REGRESSION at scale: one bulk sweep must not hold back the whole registry", () => {
  withTempRoot((root) => {
    // The measured shape: four unrelated worktrees, admin signals frozen, all swept at once.
    const names = ["gemini-subagents", "dreamy-colden", "admiring-bose", "adr0178-gate"];
    const verdicts = names.map((name) => {
      const dir = makeWorktree(root, name, { dir: IDLE, admin: IDLE, reflog: IDLE });
      mkdirSync(path.join(dir, ".codex"));
      return classifyWorktree(snapshotOf(dir, defaultWorktreeIo.statMtimeMs(dir)), policy());
    });

    assert.deepEqual(
      verdicts.filter((v) => v.decision === "keep").map((v) => `${v.name}: ${v.reason}`),
      [],
      "a single bulk sweep must not hold back any idle worktree",
    );
  });
});

test("a registered worktree is judged ONLY by its admin signals — the worktree tree is not read", () => {
  withTempRoot((root) => {
    const dir = makeWorktree(root, "admin-only", { dir: FRESH, admin: IDLE, reflog: FRESH });

    const reading = readIdleSignals(dir);
    assert.equal(reading.fellBack, false, "an admin dir was resolvable, so nothing should fall back");
    assert.deepEqual(
      [...reading.signals.keys()].sort(),
      ["HEAD", "ORIG_HEAD", "index"],
      "only the admin triple may be consulted when an admin dir exists",
    );
    assert.ok(
      reading.mtimeMs <= IDLE + 60_000,
      "a fresh worktree dir must not be visible to the idle clock at all",
    );
  });
});

// ---------------------------------------------------------------------------
// THE DETECTOR — a third instance of this fault class should announce itself
// ---------------------------------------------------------------------------

test("detectIdleStampClusters names worktrees swept in one pass, and stays quiet on genuine activity", () => {
  const at = Date.parse("2026-08-18T12:24:25.807Z");
  const reading = (name: string, mtimeMs: number): IdleSignalReading => ({
    dir: path.join("C:", "wt", name),
    admin: null,
    signals: new Map([["HEAD", mtimeMs]]),
    binding: "HEAD",
    mtimeMs,
    fellBack: false,
  });

  // The measured 59 ms spread — an exact-equality match would miss this entirely.
  const swept = [
    reading("gemini-subagents", at),
    reading("dreamy-colden", at),
    reading("admiring-bose", at + 49),
    reading("adr0178-gate", at + 59),
  ];
  const clusters = detectIdleStampClusters(swept);
  assert.equal(clusters.length, 1, "the four sweep victims are one cluster");
  assert.equal(clusters[0]?.names.length, 4);
  assert.deepEqual(clusters[0]?.names.slice().sort(), [
    "admiring-bose",
    "adr0178-gate",
    "dreamy-colden",
    "gemini-subagents",
  ]);

  // Real use is spread across seconds — no alarm.
  assert.deepEqual(
    detectIdleStampClusters([
      reading("a", at),
      reading("b", at + 4_000),
      reading("c", at + 9_000),
    ]),
    [],
    "worktrees used at different times must not read as a sweep",
  );

  // Two is a coincidence; the alarm needs a crowd.
  assert.deepEqual(detectIdleStampClusters([reading("a", at), reading("b", at + 10)]), []);
});

test("ACTIVE: a worktree used minutes ago is kept even though its reflog is ancient", () => {
  withTempRoot((root) => {
    // The inverse poison: dropping the reflog must not cost us a genuinely-active worktree.
    const dir = makeWorktree(root, "in-use", { dir: FRESH, admin: FRESH, reflog: IDLE });
    const verdict = classifyWorktree(snapshotOf(dir, defaultWorktreeIo.statMtimeMs(dir)), policy());
    assert.equal(verdict.decision, "keep");
  });
});

test("the proxy stats a fixed signal set — a huge node_modules tree is never walked", () => {
  withTempRoot((root) => {
    const dir = makeWorktree(root, "with-deps", { dir: IDLE, admin: IDLE, reflog: IDLE });
    // The nested dirs are created BEFORE the worktree dir is re-stamped idle, because creating a
    // child bumps its parent's mtime — only the deep WRITE below is meant to be under test.
    const deep = path.join(dir, "node_modules", ".pnpm", "pkg", "dist");
    mkdirSync(deep, { recursive: true });
    utimesSync(dir, secs(IDLE), secs(IDLE));

    // A freshly-written file DEEP inside the worktree must not register as activity: the proxy reads
    // a small fixed set, never a tree walk (the property that keeps the SessionStart scan bounded).
    writeFileSync(path.join(deep, "index.js"), "// fresh\n", "utf8");

    assert.ok(
      defaultWorktreeIo.statMtimeMs(dir) <= IDLE + 60_000,
      "the idle proxy must not walk the worktree tree",
    );
  });
});
