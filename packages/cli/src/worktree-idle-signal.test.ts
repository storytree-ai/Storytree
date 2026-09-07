import test from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { planActivitySweep } from "@storytree/drive";

import {
  activityDisplayName,
  activitySessionIds,
  classifyWorktree,
  defaultWorktreeIo,
  detectIdleStampClusters,
  gatherWorktreeActivity,
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

/** `git worktree list --porcelain` for a temp-root fixture, as `gatherWorktreeActivity` parses it. */
function porcelain(root: string, names: readonly string[]): string {
  return names
    .flatMap((n) => [
      `worktree ${path.join(root, ".claude", "worktrees", n)}`,
      "HEAD 0000000000000000000000000000000000000000",
      `branch refs/heads/claude/${n}`,
      "",
    ])
    .join("\n");
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
  // The READINGS come back too, and they are the very objects passed in — that identity is what
  // lets the activity sweep ask "was THIS reading swept?" without re-deriving the second-granularity
  // key, and without keying on names, which collide 16-way across the real git registry.
  assert.deepEqual(clusters[0]?.readings, swept, "the cluster carries the readings that formed it");
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

// ---------------------------------------------------------------------------
// THE LEDGER'S VIEW OF THE SAME SIGNAL (ADR-0535 D2) — proven on the REAL filesystem
// ---------------------------------------------------------------------------
//
// These belong in THIS file rather than beside the sweep's pure fold, for the reason the header
// gives: a mocked idle reader cannot show that the guard is actually wired to the real thing.
// `heartbeat_at` decides reclaim AND (through `worktree prune --pg`'s live set) whether a directory
// may be deleted, so a bulk stamp reaching the ledger would not merely lie on a board — it would
// fence a node nobody could reclaim and keep a dead worktree alive forever.

test("activitySessionIds: BOTH identity rules, on both path separators", () => {
  // Mirrors `deriveIdentity`. Rule 1 keys on the `.claude/worktrees/<name>` path basename; Rule 2
  // — `--real` replicas and Codex trees, which do not live there — keys on the git ADMIN basename.
  assert.deepEqual(
    activitySessionIds("C:/code/storytree/.claude/worktrees/wt-a", "C:/code/storytree/.git/worktrees/wt-a"),
    ["wt-a"],
    "the usual case: the two coincide and are not emitted twice",
  );
  assert.deepEqual(
    activitySessionIds("C:\\code\\storytree\\.claude\\worktrees\\wt-b", null),
    ["wt-b"],
    "backslashes resolve the same way",
  );
  assert.deepEqual(
    activitySessionIds("C:/code/replica", "C:/code/storytree/.git/worktrees/replica-2"),
    ["replica-2"],
    "Rule 2 alone for a worktree outside .claude/worktrees — the identity git actually registered",
  );
  assert.deepEqual(
    activitySessionIds("C:/code/storytree/.claude/worktrees/wt-c", "C:/code/storytree/.git/worktrees/wt-c-1"),
    ["wt-c", "wt-c-1"],
    "when git de-duplicated the admin name, BOTH keys are offered — a Rule-1-only sweep would " +
      "vouch for an id nothing holds while the real holder aged out",
  );
  assert.deepEqual(activitySessionIds("C:/code/storytree", null), [], "the primary checkout claims nothing");
  // The `$` anchor is the whole difference between "this worktree" and "some worktree under it":
  // without it a nested path would claim `wt-a`, which is a DIFFERENT session's identity.
  assert.deepEqual(
    activitySessionIds("C:/code/storytree/.claude/worktrees/wt-a/nested", null),
    [],
    "a path BELOW a worktree is not that worktree",
  );
  // `resolveAdminDir` returns the TRIMMED text after `gitdir:`, so a malformed gitfile
  // (`gitdir:` with nothing after it) yields "". An empty session id keys nothing and would make
  // the sweep's `unnest` batch carry a row that can match no claim, so it is dropped here.
  assert.deepEqual(activitySessionIds("C:/code/replica", ""), []);
});

test("activityDisplayName: a trailing or doubled separator must not name a worktree the empty string", () => {
  assert.equal(activityDisplayName("C:/code/storytree/.claude/worktrees/wt-a/"), "wt-a");
  assert.equal(activityDisplayName("C:/tmp//storytree-real-XX//wt/"), "storytree-real-XX/wt");
  assert.equal(activityDisplayName("wt"), "wt", "a single segment has no parent to qualify it");
  // A path BELOW a session worktree is not that worktree, so it gets the qualified two-segment form
  // rather than borrowing the session's bare name.
  assert.equal(activityDisplayName("C:/code/storytree/.claude/worktrees/wt-a/nested"), "wt-a/nested");
  // BOTH segments must match, and these are the two real shapes that prove it — each would be
  // mis-named as a bare basename if either half of the test were dropped. `.codex/worktrees/<n>`
  // is where every Codex tree on this box actually lives, and `.claude/agents/` is a real sibling
  // directory; neither is a session worktree, and neither may borrow the unqualified form.
  assert.equal(activityDisplayName("C:/Users/m/.codex/worktrees/907b"), "worktrees/907b");
  assert.equal(activityDisplayName("C:/code/storytree/.claude/agents/thing"), "agents/thing");
});

test("liveness-is-observed-not-self-reported: the sweep VOUCHES for a genuinely-used worktree and refuses a husk — against real mtimes", () => {
  withTempRoot((root) => {
    makeWorktree(root, "in-use", { dir: IDLE, admin: FRESH, reflog: IDLE });
    makeOrphan(root, "husk", NOW - 30_000);

    const observation = gatherWorktreeActivity(
      { ...defaultWorktreeIo, runGit: () => porcelain(root, ["in-use", "husk"]) },
      readIdleSignals,
    );
    const plan = planActivitySweep(observation, new Date(NOW));

    assert.deepEqual(plan.stamps.map((s) => s.sessionId), ["in-use"]);
    assert.equal(
      Math.abs(new Date(plan.stamps[0]!.observedAt).getTime() - FRESH) < 1_500,
      true,
      "the stamp carries the OBSERVED admin mtime, not `now`",
    );
    // The husk was touched 30 SECONDS ago and is still refused: its reading fell back to the
    // worktree's own files, which measure the world rather than the worktree. Freshness is not
    // the test — provenance is.
    assert.deepEqual(plan.refused, [{ name: "husk", reason: "fell-back" }]);
  });
});

test("liveness-is-observed-not-self-reported: A BULK STAMP NEVER REACHES THE LEDGER — the third instance of the fault class is refused, not written", () => {
  withTempRoot((root) => {
    // The measured `.codex/` shape (2026-08-19): one pass touched four unrelated worktrees inside a
    // 59 ms window. Reproduced here on the ADMIN signals, which is what would happen if some future
    // repo-wide git housekeeping rewrote them the way `reflog expire --all` once rewrote the logs.
    // Pinned to a whole second, and that is load-bearing rather than tidiness: the detector groups
    // at SECOND granularity, so an unpinned base lands within 60 ms of a boundary about 6% of the
    // time, splits the four across two seconds, and leaves the stragglers unflagged. That flake red
    // this suite once already — under `bun test` in the full run, while passing in isolation.
    const at = Math.floor((NOW - 5 * 60_000) / 1000) * 1000;
    const names = ["swept-a", "swept-b", "swept-c", "swept-d"];
    names.forEach((n, i) => makeWorktree(root, n, { dir: IDLE, admin: at + i * 20, reflog: IDLE }));

    const observation = gatherWorktreeActivity(
      { ...defaultWorktreeIo, runGit: () => porcelain(root, names) },
      readIdleSignals,
    );
    assert.deepEqual(
      observation.filter((r) => r.bulkStamped).map((r) => r.name).sort(),
      names,
      "the detector is actually WIRED — not merely available",
    );

    const plan = planActivitySweep(observation, new Date(NOW));
    assert.deepEqual(plan.stamps, [], "not one of the four vouches for anything");
    assert.deepEqual(
      plan.refused.map((r) => r.reason),
      ["bulk-stamp", "bulk-stamp", "bulk-stamp", "bulk-stamp"],
      "and the sweep SAYS why, so a third instance announces itself instead of being investigated",
    );
  });
});

test("gatherWorktreeActivity: an unreadable git registry yields an empty observation, never a throw", () => {
  const observation = gatherWorktreeActivity(
    {
      ...defaultWorktreeIo,
      runGit: () => {
        throw new Error("git exploded");
      },
    },
    readIdleSignals,
  );
  assert.deepEqual(observation, []);
});

test("gatherWorktreeActivity asks git for the WHOLE registry in porcelain — not the worktrees directory", () => {
  // Two properties in one call, both of which a looser assertion would miss. `--porcelain` is what
  // makes the output parseable at all (the human form is not), and `worktree list` is what reaches
  // the Rule-2 identities — `--real` replicas and Codex trees — that never appear under
  // `.claude/worktrees/` and are therefore invisible to the directory scan `worktree idle` uses.
  const calls: string[][] = [];
  gatherWorktreeActivity(
    {
      ...defaultWorktreeIo,
      runGit: (args) => {
        calls.push([...args]);
        return "";
      },
    },
    readIdleSignals,
  );
  assert.deepEqual(calls, [["worktree", "list", "--porcelain"]]);
});

test("activityDisplayName disambiguates outside .claude/worktrees — sixteen replicas are not all `wt`", () => {
  // Measured on the real registry: 16 `--real` promotion replicas are `<tmp>/storytree-real-*/wt`
  // and every Codex tree is `<hash>/storytree`, so a bare basename made a refusal list read
  // `wt, wt, wt, …` with nothing an operator could act on. Session trees keep their plain name.
  assert.equal(activityDisplayName("C:/code/storytree/.claude/worktrees/eager-shaw-9c3500"), "eager-shaw-9c3500");
  assert.equal(activityDisplayName("C:/Users/m/AppData/Local/Temp/storytree-real-0vLC8B/wt"), "storytree-real-0vLC8B/wt");
  assert.equal(activityDisplayName("C:/Users/m/.codex/worktrees/907b/storytree"), "907b/storytree");
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
