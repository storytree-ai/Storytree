import test from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  buildDrainRecord,
  classifyDrainHealth,
  defaultDrainLedgerIo,
  drainLedgerPath,
  formatDrainCensus,
  parseDrainHistory,
  readDrainHistory,
  recordDrainRun,
  serialiseDrainHistory,
  shouldAnnounceDrain,
  tallyHolds,
  DRAIN_COOLING_FLOOR,
  DRAIN_HISTORY_LIMIT,
  DRAIN_MIN_RUNS,
  type DrainHoldCounts,
  type DrainRecord,
} from "./worktree-drain.js";
import {
  classifyWorktree,
  pruneWorktrees,
  worktreeDrainStatus,
  DEFAULT_THRESHOLD_MS,
  type PrunePolicy,
  type WorktreeIo,
  type WorktreeSnapshot,
  type PruneOptions,
} from "./worktree.js";

/**
 * DRAIN OBSERVABILITY — worktree-reaper-integrity-arc, strand 3.
 *
 * THE PROPERTY UNDER TEST: a run that reaps nothing is observable, and the observation can go red on
 * its own. Before this, the reaper was silent-on-success AND silent-on-nothing-to-do, so a drain that
 * had reaped zero for weeks looked exactly like a healthy one — the blindness that let the poisoned
 * idle clock rot while `.claude/worktrees/` grew to ~93 GB.
 *
 * WHY THE LEDGER IS DRIVEN AGAINST A REAL FILESYSTEM. Strand 1's post-mortem found that the whole
 * pre-existing suite injected a stubbed `statMtimeMs`, which exempted the seam's DEFAULT
 * implementation — the code that actually runs — from every test, and that is exactly where the
 * defect lived (filed as the friction `mocked-seam-exempts-its-default-impl-from-proof`). Repeating
 * that mistake here would be worse than not testing at all: an in-memory ledger stub would prove the
 * classifier while leaving `defaultDrainLedgerIo` — the thing the hook calls — unproven. So every
 * ledger test below writes and reads a REAL file in a temp dir through the REAL default IO. Git
 * remains faked (spinning up real worktrees per case would cost minutes), but the ledger, the JSONL
 * round-trip, the trim, and the unwritable-path failure all run against the real thing.
 */

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const HOUR = 3_600_000;
const NOW = 1_700_000_000_000;

function withTempRoot(fn: (root: string) => void): void {
  const root = mkdtempSync(path.join(os.tmpdir(), "st-drain-"));
  try {
    fn(root);
  } finally {
    rmSync(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
  }
}

/** A real `.claude/worktrees/` under a temp root — where the real ledger file will live. */
function worktreesDirIn(root: string): string {
  const dir = path.join(root, ".claude", "worktrees");
  mkdirSync(dir, { recursive: true });
  return dir;
}

/** `held` is a PARTIAL here so a case can name only the bucket it cares about; the rest zero-fill. */
type RecordOverrides = Partial<Omit<DrainRecord, "held">> & {
  at: number;
  held?: Partial<DrainHoldCounts>;
};

function record(overrides: RecordOverrides): DrainRecord {
  return {
    executed: true,
    population: 79,
    registered: 42,
    orphan: 37,
    reapable: 0,
    reaped: 0,
    failed: 0,
    capped: 0,
    ...overrides,
    held: {
      cooling: 0,
      unmerged: 0,
      dirty: 0,
      locked: 0,
      detached: 0,
      live: 0,
      anchor: 0,
      ...overrides.held,
    },
  };
}

/**
 * The measured 2026-07-27 shape: a long series of executing runs, a large cooling cohort held back
 * every single run by `merged but active < 48h ago`, and nothing ever reaped.
 */
function stalledSeries(runs = 8, cooling = 59): DrainRecord[] {
  return Array.from({ length: runs }, (_, i) =>
    record({ at: NOW - (runs - 1 - i) * 12 * HOUR, reaped: 0, reapable: 0, held: { cooling } }),
  );
}

// ===========================================================================
// PART A — the LEDGER, against a real filesystem via the real default IO
// ===========================================================================

test("LEDGER (real fs): a recorded run round-trips through the real default IO with its counts intact", () => {
  withTempRoot((root) => {
    const file = drainLedgerPath(worktreesDirIn(root));
    const written = record({ at: NOW, reapable: 3, reaped: 2, failed: 1, capped: 4, held: { cooling: 12, locked: 5 } });

    const res = recordDrainRun(defaultDrainLedgerIo, file, written);
    assert.equal(res.ok, true, res.error);

    // Read it back through the REAL fs read — not a stub that could agree with a broken writer.
    const back = readDrainHistory(defaultDrainLedgerIo, file);
    assert.equal(back.length, 1);
    assert.deepEqual(back[0], written, "every count survives the JSONL round-trip exactly");
    assert.match(readFileSync(file, "utf8"), /^\{.*\}\n$/s, "one JSON object per line, newline-terminated");
  });
});

test("LEDGER (real fs): an absent ledger reads as NO history — never a throw", () => {
  withTempRoot((root) => {
    const file = drainLedgerPath(worktreesDirIn(root));
    assert.deepEqual(readDrainHistory(defaultDrainLedgerIo, file), []);
  });
});

test("LEDGER (real fs): appends accumulate a readable series across runs", () => {
  withTempRoot((root) => {
    const file = drainLedgerPath(worktreesDirIn(root));
    for (let i = 0; i < 5; i += 1) {
      recordDrainRun(defaultDrainLedgerIo, file, record({ at: NOW + i * HOUR, reaped: i }));
    }
    const back = readDrainHistory(defaultDrainLedgerIo, file);
    assert.deepEqual(back.map((r) => r.reaped), [0, 1, 2, 3, 4], "the series is ordered oldest → newest");
  });
});

test("LEDGER (real fs): a half-written line from a killed run is skipped, and the rest of the series survives", () => {
  // A parser that dies on one bad line would blind the whole series — a silent failure of exactly the
  // kind this strand exists to remove.
  withTempRoot((root) => {
    const file = drainLedgerPath(worktreesDirIn(root));
    recordDrainRun(defaultDrainLedgerIo, file, record({ at: NOW - HOUR, reaped: 1 }));
    writeFileSync(file, readFileSync(file, "utf8") + '{"at":170000,"reaped":9,"exec\n', "utf8");
    recordDrainRun(defaultDrainLedgerIo, file, record({ at: NOW, reaped: 2 }));

    const back = readDrainHistory(defaultDrainLedgerIo, file);
    assert.deepEqual(back.map((r) => r.reaped), [1, 2], "the torn line is dropped; both good records remain");
  });
});

test("LEDGER (real fs): the series is trimmed to the newest DRAIN_HISTORY_LIMIT records", () => {
  withTempRoot((root) => {
    const file = drainLedgerPath(worktreesDirIn(root));
    const over = DRAIN_HISTORY_LIMIT + 25;
    const all = Array.from({ length: over }, (_, i) => record({ at: NOW + i * 1000, reaped: i }));
    defaultDrainLedgerIo.write(file, serialiseDrainHistory(all));

    const back = readDrainHistory(defaultDrainLedgerIo, file);
    assert.equal(back.length, DRAIN_HISTORY_LIMIT);
    assert.equal(back[back.length - 1]?.reaped, over - 1, "the NEWEST records are the ones kept");
    assert.equal(back[0]?.reaped, over - DRAIN_HISTORY_LIMIT);
  });
});

test("LEDGER (real fs): an unwritable path is REPORTED, not thrown and not swallowed", () => {
  withTempRoot((root) => {
    // A directory that does not exist — the honest stand-in for a ledger the process cannot write.
    const file = drainLedgerPath(path.join(root, "nope", "missing"));
    const res = recordDrainRun(defaultDrainLedgerIo, file, record({ at: NOW }));
    assert.equal(res.ok, false, "the caller learns the observation was lost");
    assert.ok((res.error ?? "").length > 0, "…and why");
  });
});

test("LEDGER: a record written by an older build (missing hold buckets) zero-fills rather than parsing to NaN", () => {
  const parsed = parseDrainHistory('{"at":1,"executed":true,"population":5,"held":{"cooling":2}}');
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0]?.held.cooling, 2);
  assert.equal(parsed[0]?.held.locked, 0, "absent buckets read as zero, so Math.min across runs is safe");
  assert.equal(parsed[0]?.reaped, 0);
});

// ===========================================================================
// PART B — the HEALTH classifier: the half that can go red
// ===========================================================================

test("REGRESSION (the 2026-07-27 shape): a full idle period of runs reaping ZERO while a large cooling cohort sits is a RED", () => {
  // This is the case that went unnoticed for weeks. 59 merged-clean worktrees were held back every
  // run by the same reason and nothing ever crossed the threshold, while the hook said nothing.
  const v = classifyDrainHealth(stalledSeries(), { now: NOW, thresholdMs: DEFAULT_THRESHOLD_MS });
  assert.equal(v.status, "stalled");
  assert.equal(v.level, "fail", "the observation must be able to go RED on its own");
  assert.match(v.headline, /STALLED/);
  assert.match(v.headline, /59/, "the headline names the cohort size, so the scale is legible");
});

test("COUNTERWEIGHT: the same long series is NOT red once anything was actually reaped", () => {
  // The fix must not simply red on every quiet week: a single real reap proves the clock advances.
  const series = stalledSeries();
  series[3] = record({ at: series[3]!.at, reaped: 1, held: { cooling: 59 } });
  const v = classifyDrainHealth(series, { now: NOW, thresholdMs: DEFAULT_THRESHOLD_MS });
  assert.notEqual(v.status, "stalled");
  assert.equal(v.level, "ok");
});

test("COUNTERWEIGHT: reaping zero with only a HANDFUL cooling is ordinary, not a stall", () => {
  // A few near-misses can legitimately all be touched again. Reding here would cry wolf.
  const v = classifyDrainHealth(stalledSeries(8, DRAIN_COOLING_FLOOR - 1), {
    now: NOW,
    thresholdMs: DEFAULT_THRESHOLD_MS,
  });
  assert.equal(v.status, "ok");
});

test("COUNTERWEIGHT: a window SHORTER than one idle period cannot call a stall — it reports unproven", () => {
  // A worktree entering the cooling cohort at age 0 needs a full threshold period to become
  // reapable, so reding before then would be a guess dressed as a measurement.
  const runs = Array.from({ length: 8 }, (_, i) =>
    record({ at: NOW - (7 - i) * HOUR, held: { cooling: 59 } }),
  );
  const v = classifyDrainHealth(runs, { now: NOW, thresholdMs: DEFAULT_THRESHOLD_MS });
  assert.equal(v.status, "unproven");
  assert.equal(v.level, "warn");
});

test("COUNTERWEIGHT: too FEW runs cannot call a stall even across a long span", () => {
  const runs = Array.from({ length: DRAIN_MIN_RUNS - 1 }, (_, i) =>
    record({ at: NOW - (DRAIN_MIN_RUNS - 2 - i) * 40 * HOUR, held: { cooling: 59 } }),
  );
  const v = classifyDrainHealth(runs, { now: NOW, thresholdMs: DEFAULT_THRESHOLD_MS });
  assert.equal(v.status, "unproven");
});

test("DRY RUNS never prove a stall: a week of them is still 'unproven', not 'stalled'", () => {
  // A dry run drains nothing BY DESIGN. Counting it would manufacture a stall that never happened.
  const dry = stalledSeries().map((r) => ({ ...r, executed: false }));
  const v = classifyDrainHealth(dry, { now: NOW, thresholdMs: DEFAULT_THRESHOLD_MS });
  assert.equal(v.status, "unproven");
});

test("DRY RUNS cannot hide a real stall either — the executing runs among them still red", () => {
  const mixed = [
    ...stalledSeries().map((r) => ({ ...r, executed: false })),
    ...stalledSeries(),
  ];
  assert.equal(
    classifyDrainHealth(mixed, { now: NOW, thresholdMs: DEFAULT_THRESHOLD_MS }).status,
    "stalled",
  );
});

test("EMPTY history warns — silence is no longer the signal for a healthy drain", () => {
  const v = classifyDrainHealth([], { now: NOW, thresholdMs: DEFAULT_THRESHOLD_MS });
  assert.equal(v.status, "unproven");
  assert.equal(v.level, "warn");
  assert.notEqual(v.level, "ok", "an unobserved drain must never read as proven-healthy");
});

test("STOPPED: a ledger whose newest run is ancient says the reaper itself is not running", () => {
  const v = classifyDrainHealth([record({ at: NOW - 10 * 24 * HOUR, reaped: 3 })], {
    now: NOW,
    thresholdMs: DEFAULT_THRESHOLD_MS,
  });
  assert.equal(v.status, "stopped");
  assert.equal(v.level, "warn");
  assert.match(v.headline, /has not executed/);
});

test("OUTPACED: draining, but the population still grew across the window — a warn, not a red", () => {
  const runs = [
    record({ at: NOW - 84 * HOUR, population: 40, reaped: 1, held: { cooling: 5 } }),
    record({ at: NOW - 56 * HOUR, population: 55, reaped: 2, held: { cooling: 5 } }),
    record({ at: NOW - 28 * HOUR, population: 65, reaped: 1, held: { cooling: 5 } }),
    record({ at: NOW, population: 78, reaped: 1, held: { cooling: 5 } }),
  ];
  const v = classifyDrainHealth(runs, { now: NOW, thresholdMs: DEFAULT_THRESHOLD_MS });
  assert.equal(v.status, "outpaced");
  assert.equal(v.level, "warn", "losing ground is information for the owner, not a broken reaper");
});

test("OK: a draining reaper holding its population steady is green", () => {
  const runs = [
    record({ at: NOW - 84 * HOUR, population: 60, reaped: 4, held: { cooling: 5 } }),
    record({ at: NOW - 56 * HOUR, population: 58, reaped: 3, held: { cooling: 5 } }),
    record({ at: NOW - 28 * HOUR, population: 59, reaped: 5, held: { cooling: 5 } }),
    record({ at: NOW, population: 57, reaped: 2, held: { cooling: 5 } }),
  ];
  const v = classifyDrainHealth(runs, { now: NOW, thresholdMs: DEFAULT_THRESHOLD_MS });
  assert.equal(v.status, "ok");
  assert.equal(v.level, "ok");
});

test("HOOK CONTRACT: the reaper breaks silence for every ACTIONABLE state, and only those", () => {
  // The arc's requirement in one assertion: the hook's silence must no longer mean "nothing drained".
  assert.equal(shouldAnnounceDrain("stalled"), true, "a measured stall must never pass in silence");
  assert.equal(shouldAnnounceDrain("outpaced"), true);
  assert.equal(shouldAnnounceDrain("stopped"), true);
  // …and the two states with nothing for a reader to do stay quiet, so the channel keeps its meaning.
  assert.equal(shouldAnnounceDrain("ok"), false);
  assert.equal(
    shouldAnnounceDrain("unproven"),
    false,
    "a fresh ledger must not nag at every session start for two days — that is how the channel gets filtered out",
  );
});

// ===========================================================================
// PART C — the hold census: exact buckets from the REAL classifier
// ===========================================================================

function policy(overrides: Partial<PrunePolicy> = {}): PrunePolicy {
  return {
    now: NOW,
    thresholdMs: DEFAULT_THRESHOLD_MS,
    primaryRoot: path.join(os.tmpdir(), "st-drain-primary"),
    currentWorktree: null,
    includeDetached: false,
    liveSessions: new Set<string>(),
    ...overrides,
  };
}

function snap(o: Partial<WorktreeSnapshot> & { name: string }): WorktreeSnapshot {
  return {
    path: path.join(os.tmpdir(), "st-drain-primary", ".claude", "worktrees", o.name),
    kind: "registered",
    detached: false,
    branch: `claude/${o.name}`,
    merged: true,
    dirty: false,
    locked: false,
    lockReason: null,
    mtimeMs: NOW - 100 * HOUR,
    ...o,
  };
}

test("CENSUS: every keep branch of the real classifier lands in its own bucket", () => {
  // The census must be driven by a structured field, not by matching the prose reason — a reworded
  // message must never silently empty a bucket and turn a stall green.
  const cases: ReadonlyArray<readonly [string, WorktreeSnapshot, PrunePolicy]> = [
    ["anchor", snap({ name: "self" }), policy({ currentWorktree: snap({ name: "self" }).path })],
    ["live", snap({ name: "busy" }), policy({ liveSessions: new Set(["busy"]) })],
    ["locked", snap({ name: "parked", locked: true }), policy()],
    ["dirty", snap({ name: "wip", dirty: true }), policy()],
    ["unmerged", snap({ name: "live-work", merged: false }), policy()],
    ["detached", snap({ name: "gate", detached: true, branch: null }), policy()],
    ["cooling", snap({ name: "fresh", mtimeMs: NOW - HOUR }), policy()],
  ];
  for (const [expected, s, p] of cases) {
    const v = classifyWorktree(s, p);
    assert.equal(v.decision, "keep", `${expected}: expected a keep`);
    assert.equal(v.hold, expected, `${expected}: wrong bucket (reason was "${v.reason}")`);
  }
});

test("CENSUS: a reap carries no hold bucket, and the tally counts only the keeps", () => {
  const reaped = classifyWorktree(snap({ name: "dead" }), policy());
  assert.equal(reaped.decision, "reap");
  assert.equal(reaped.hold, null);

  const verdicts = [
    reaped,
    classifyWorktree(snap({ name: "a", mtimeMs: NOW - HOUR }), policy()),
    classifyWorktree(snap({ name: "b", mtimeMs: NOW - HOUR }), policy()),
    classifyWorktree(snap({ name: "c", merged: false }), policy()),
  ];
  const held = tallyHolds(verdicts);
  assert.equal(held.cooling, 2);
  assert.equal(held.unmerged, 1);
  assert.equal(held.locked, 0);

  const rec = buildDrainRecord(verdicts, { at: NOW, executed: true, reaped: 1, failed: 0, capped: 0 });
  assert.equal(rec.population, 4);
  assert.equal(rec.reapable, 1);
  assert.equal(rec.held.cooling, 2);
  assert.match(formatDrainCensus(rec).join("\n"), /cooling 2 · unmerged 1/, "cooling leads the census");
});

// ===========================================================================
// PART D — end to end: a real prune run, a real ledger file
// ===========================================================================

interface FakeGit {
  readonly io: WorktreeIo;
  readonly removed: string[];
}

/**
 * A fake git surface over a REAL temp root. Git is faked (real worktrees would cost minutes per
 * case); the ledger underneath is the genuine article — real dir, real file, real default IO.
 */
function fakeGit(root: string, names: readonly string[], merged: ReadonlySet<string>): FakeGit {
  const wtDir = path.join(root, ".claude", "worktrees");
  const removed: string[] = [];
  const io: WorktreeIo = {
    runGit(args) {
      if (args[0] === "rev-parse" && args.includes("--git-common-dir")) return path.join(root, ".git");
      if (args[0] === "rev-parse" && args.includes("--show-toplevel")) return path.join(root, "elsewhere");
      if (args[0] === "worktree" && args[1] === "list") {
        return names
          .map((n) => `worktree ${path.join(wtDir, n)}\nbranch refs/heads/claude/${n}\n`)
          .join("\n");
      }
      if (args[0] === "branch") return [...merged].map((n) => `claude/${n}`).join("\n");
      if (args[0] === "worktree" && args[1] === "remove") {
        removed.push(String(args[3]));
        return "";
      }
      if (args[0] === "-C" && args[2] === "status") return ""; // clean
      if (args[0] === "-C" && args[2] === "rev-parse") return String(args[1]);
      return "";
    },
    listChildDirs: (dir) => (dir === wtDir ? [...names] : []),
    statMtimeMs: () => NOW - 100 * HOUR, // idle
    hasOwnGit: () => true,
    removeDir(dir) {
      removed.push(dir);
    },
  };
  return { io, removed };
}

const baseOpts: PruneOptions = {
  force: false,
  yes: false,
  hook: false,
  cap: null,
  includeDetached: false,
  thresholdMs: DEFAULT_THRESHOLD_MS,
  liveSessions: new Set(),
};

test("END TO END: an executing run that reaps NOTHING still leaves a record on the real ledger", () => {
  // THE STRAND IN ONE TEST. Before this, such a run wrote nothing anywhere and printed nothing —
  // indistinguishable from a healthy one. Now it leaves a number behind, including the zero.
  withTempRoot((root) => {
    const wtDir = worktreesDirIn(root);
    // Nothing is merged, so every worktree is held back and the run reaps zero.
    const { io, removed } = fakeGit(root, ["a", "b", "c"], new Set());

    const env = pruneWorktrees({ ...baseOpts, force: true, yes: true }, { io, now: () => NOW });
    assert.equal(env.ok, true);
    assert.match(env.body, /Reaped 0/);
    assert.deepEqual(removed, [], "nothing was reapable");

    const history = readDrainHistory(defaultDrainLedgerIo, drainLedgerPath(wtDir));
    assert.equal(history.length, 1, "the zero-reap run is ON the ledger — this is the whole point");
    assert.equal(history[0]?.executed, true);
    assert.equal(history[0]?.reaped, 0);
    assert.equal(history[0]?.population, 3);
    assert.equal(history[0]?.held.unmerged, 3, "and it records WHY nothing drained");
  });
});

test("END TO END: a DRY run records nothing — it drains nothing by design and must not fake a stall", () => {
  withTempRoot((root) => {
    const wtDir = worktreesDirIn(root);
    const { io } = fakeGit(root, ["a", "b"], new Set());
    const env = pruneWorktrees(baseOpts, { io, now: () => NOW });

    assert.match(env.body, /DRY RUN/);
    assert.deepEqual(readDrainHistory(defaultDrainLedgerIo, drainLedgerPath(wtDir)), []);
    assert.match(env.body, /POPULATION 2/, "…but the census still prints, so the look is never wasted");
    assert.match(env.body, /unmerged 2/);
  });
});

test("END TO END: successive executing runs build the series the health verdict reads", () => {
  withTempRoot((root) => {
    const wtDir = worktreesDirIn(root);
    const { io } = fakeGit(root, ["a", "b", "c"], new Set());
    for (let i = 0; i < 5; i += 1) {
      pruneWorktrees({ ...baseOpts, force: true, yes: true }, { io, now: () => NOW + i * 20 * HOUR });
    }
    const history = readDrainHistory(defaultDrainLedgerIo, drainLedgerPath(wtDir));
    assert.equal(history.length, 5, "one line per executing run, appended not overwritten");
    assert.deepEqual(history.map((r) => r.reaped), [0, 0, 0, 0, 0]);
  });
});

test("END TO END: a ledger that cannot be written does not fail the prune, and says so out loud", () => {
  withTempRoot((root) => {
    // No `.claude/worktrees/` on disk → the real write fails. The prune must still succeed (removing
    // worktrees is the job; observing it is not allowed to break it) but must not go quiet about it.
    const { io } = fakeGit(root, ["a"], new Set());
    const env = pruneWorktrees({ ...baseOpts, force: true, yes: true }, { io, now: () => NOW });
    assert.equal(env.ok, true);
    assert.match(env.body, /WARN could not record this run on the drain ledger/);
  });
});

// ===========================================================================
// PART E — `storytree worktree drain`: the verb that exits non-zero
// ===========================================================================

test("VERB: `worktree drain` exits NON-ZERO on a measured stall", () => {
  withTempRoot((root) => {
    const wtDir = worktreesDirIn(root);
    const file = drainLedgerPath(wtDir);
    for (const r of stalledSeries()) recordDrainRun(defaultDrainLedgerIo, file, r);

    const { io } = fakeGit(root, ["a", "b"], new Set());
    const env = worktreeDrainStatus(
      { thresholdMs: DEFAULT_THRESHOLD_MS, includeDetached: false, liveSessions: new Set() },
      { io, now: () => NOW },
    );
    assert.equal(env.ok, false, "ok:false is exit 1 — this is a check, not a report");
    assert.match(env.body, /DRAIN FAIL/);
    assert.match(env.body, /POPULATION 2/, "the live census prints beside the verdict");
    assert.match(env.body, /recent executing runs/);
  });
});

test("VERB: `worktree drain` exits zero and reports OK on a healthy series", () => {
  withTempRoot((root) => {
    const wtDir = worktreesDirIn(root);
    const file = drainLedgerPath(wtDir);
    for (let i = 0; i < 5; i += 1) {
      recordDrainRun(
        defaultDrainLedgerIo,
        file,
        record({ at: NOW - (4 - i) * 24 * HOUR, population: 50, reaped: 3, held: { cooling: 4 } }),
      );
    }
    const { io } = fakeGit(root, ["a"], new Set());
    const env = worktreeDrainStatus(
      { thresholdMs: DEFAULT_THRESHOLD_MS, includeDetached: false, liveSessions: new Set() },
      { io, now: () => NOW },
    );
    assert.equal(env.ok, true);
    assert.match(env.body, /DRAIN OK/);
  });
});

test("VERB: `worktree drain` WARNS (exit 0) rather than reding when the drain is merely unproven", () => {
  withTempRoot((root) => {
    const { io } = fakeGit(root, ["a"], new Set());
    worktreesDirIn(root);
    const env = worktreeDrainStatus(
      { thresholdMs: DEFAULT_THRESHOLD_MS, includeDetached: false, liveSessions: new Set() },
      { io, now: () => NOW },
    );
    assert.equal(env.ok, true, "an empty ledger is not a proven defect");
    assert.match(env.body, /DRAIN WARN/, "…but it is never reported as healthy");
    assert.match(env.body, /0 record\(s\)/);
  });
});

test("VERB: `worktree drain` removes NOTHING", () => {
  withTempRoot((root) => {
    worktreesDirIn(root);
    const { io, removed } = fakeGit(root, ["a", "b"], new Set(["a", "b"]));
    worktreeDrainStatus(
      { thresholdMs: DEFAULT_THRESHOLD_MS, includeDetached: false, liveSessions: new Set() },
      { io, now: () => NOW },
    );
    assert.deepEqual(removed, [], "the observability verb is strictly read-only");
  });
});
