import { test } from "node:test";
import assert from "node:assert/strict";

import {
  createBuildProgress,
  PROGRESS_INTERVAL_MS,
  silentBuildProgress,
  type BuildProgress,
  type ProgressDeps,
} from "./build-progress.js";

interface HarnessResult {
  deps: ProgressDeps;
  logs: string[];
  advance: (ms: number) => void;
  tick: () => void;
  intervals: number[];
  cancels: () => number;
  liveTicks: () => number;
}

/**
 * A hand-driven harness: the clock only moves when a test moves it, and the heartbeat only ticks
 * when a test ticks it. No timer, no wall clock — the same reason `ensureDbUp` takes injected
 * effects, since a 30s cadence is not assertable against real time.
 */
function harness(): HarnessResult {
  let t = 0;
  const logs: string[] = [];
  const intervals: number[] = [];
  let live: (() => void) | undefined;
  let cancelled = 0;
  return {
    logs,
    intervals,
    advance: (ms) => void (t += ms),
    tick: () => live?.(),
    cancels: () => cancelled,
    liveTicks: () => (live === undefined ? 0 : 1),
    deps: {
      log: (m) => void logs.push(m),
      now: () => t,
      heartbeat: (intervalMs, fn) => {
        intervals.push(intervalMs);
        live = fn;
        return () => {
          cancelled++;
          live = undefined;
        };
      },
    },
  };
}

test("a stage announces itself on entry and reports what it cost on exit", async () => {
  // The floor the friction asked for: a backgrounded build's log must show a leg beginning and
  // ending, so "nothing has happened yet" and "this leg finished" are different observations.
  const h = harness();
  const progress = createBuildProgress(h.deps);
  const out = await progress.stage("live-store preflight", async () => {
    h.advance(11_000);
    return "ready";
  });
  assert.equal(out, "ready", "the stage returns the work's value unchanged");
  assert.deepEqual(h.logs, ["live-store preflight - started", "live-store preflight - done in 11s"]);
});

test("a stage that outlives the interval heartbeats WITH ITS NAME and elapsed seconds", async () => {
  // The arc's bar: the line must name the leg holding the clock, not merely prove the process
  // breathes. A reader seeing the same leg named at 30s and 60s knows WHERE it is stuck.
  const h = harness();
  const progress = createBuildProgress(h.deps, { intervalMs: 30_000 });
  await progress.stage("live-store preflight", async () => {
    h.advance(30_000);
    h.tick();
    h.advance(30_000);
    h.tick();
  });
  const beats = h.logs.filter((m) => /still running/.test(m));
  assert.equal(beats.length, 2, "the heartbeat repeats — one line would not distinguish slow from wedged");
  assert.equal(beats[0], "live-store preflight - still running, 30s elapsed");
  assert.equal(beats[1], "live-store preflight - still running, 60s elapsed");
});

test("a fast stage emits no heartbeat at all, and cancels its ticker", async () => {
  // Liveness chatter on a 2s leg is noise that trains the reader to skip the channel; and a ticker
  // left running would go on naming a leg the build has left.
  const h = harness();
  const progress = createBuildProgress(h.deps);
  await progress.stage("write claim", async () => void h.advance(200));
  assert.equal(h.logs.filter((m) => /still running/.test(m)).length, 0);
  assert.equal(h.cancels(), 1, "the heartbeat is cancelled when the stage ends");
  assert.equal(h.liveTicks(), 0, "no ticker survives the stage");
});

test("a finished stage's ticker can never fire again — a stale leg name is a false diagnosis", async () => {
  // Belt-and-braces over the cancel: even if a real timer fired once more between `clearInterval`
  // and the event loop settling, the span check keeps the dead leg out of the log. A heartbeat
  // naming a leg that already finished points a reader at the wrong blocker, which is precisely
  // the misdiagnosis this arc exists to close.
  const h = harness();
  let escaped: (() => void) | undefined;
  // A deliberately USELESS canceller, so the tick survives the stage it belonged to.
  const deps: ProgressDeps = {
    ...h.deps,
    heartbeat: (_ms, fn) => {
      escaped = fn;
      return () => {};
    },
  };
  await createBuildProgress(deps).stage("worktree", async () => void 0);
  const before = h.logs.length;
  escaped?.();
  assert.equal(h.logs.length, before, "a tick after the stage closed emits nothing");
});

test("note() names the live sub-step and the heartbeat then reports the phase, not just the leg", async () => {
  // The gate is the longest leg by far, so "still in the gate" is barely more useful than silence.
  // The phase walk rides through note() so a stall reports the PHASE it stalled in.
  const h = harness();
  const progress = createBuildProgress(h.deps, { intervalMs: 30_000 });
  await progress.stage("gate", async () => {
    h.advance(12_000);
    progress.note("AUTHOR_TEST");
    h.advance(18_000);
    h.tick();
  });
  assert.ok(h.logs.includes("gate / AUTHOR_TEST (12s in)"), `phase line missing: ${h.logs.join(" | ")}`);
  assert.ok(
    h.logs.includes("gate / AUTHOR_TEST - still running, 30s elapsed"),
    `the heartbeat must carry the phase: ${h.logs.join(" | ")}`,
  );
});

test("note() does NOT restart the stage clock — elapsed keeps climbing across phases", async () => {
  // If a phase transition reset the clock, a build wedged in phase 3 would report a small elapsed
  // forever and read as healthy. The elapsed must measure the LEG, so a stuck phase grows visibly.
  const h = harness();
  const progress = createBuildProgress(h.deps, { intervalMs: 30_000 });
  await progress.stage("gate", async () => {
    h.advance(40_000);
    progress.note("OBSERVE_RED");
    h.advance(50_000);
    h.tick();
  });
  assert.ok(h.logs.includes("gate / OBSERVE_RED - still running, 90s elapsed"), h.logs.join(" | "));
  assert.match(h.logs.at(-1) ?? "", /gate \/ OBSERVE_RED - done in 90s/);
});

test("note() outside any stage is a silent no-op", () => {
  const h = harness();
  createBuildProgress(h.deps).note("AUTHOR_TEST");
  assert.deepEqual(h.logs, []);
});

test("a throwing stage is announced as FAILED with its cause, and the throw is rethrown unchanged", async () => {
  // Wrapping a leg must not change the build's outcome — and a leg that died must not look like a
  // leg still running, or the reader waits out a build that is already over.
  const h = harness();
  const progress = createBuildProgress(h.deps);
  await assert.rejects(
    progress.stage("worktree", async () => {
      h.advance(3_000);
      throw new Error("git worktree add refused");
    }),
    /git worktree add refused/,
  );
  assert.equal(h.logs.at(-1), "worktree - FAILED after 3s: git worktree add refused");
  assert.equal(h.cancels(), 1, "a failed stage still stops its heartbeat");
});

test("sequential stages each own their own clock and name", async () => {
  const h = harness();
  const progress = createBuildProgress(h.deps, { intervalMs: 30_000 });
  await progress.stage("library agent prompts", async () => void h.advance(9_000));
  await progress.stage("verdict store", async () => {
    h.advance(30_000);
    h.tick();
  });
  assert.deepEqual(h.logs, [
    "library agent prompts - started",
    "library agent prompts - done in 9s",
    "verdict store - started",
    "verdict store - still running, 30s elapsed",
    "verdict store - done in 30s",
  ]);
});

test("the default cadence is the 30s the preflight's own cold-start banner already uses", async () => {
  const h = harness();
  await createBuildProgress(h.deps).stage("gate", async () => void 0);
  assert.equal(PROGRESS_INTERVAL_MS, 30_000);
  assert.deepEqual(h.intervals, [30_000], "the heartbeat is requested at the shared cadence");
});

test("every emitted line is ASCII — a mojibaked liveness signal is one nobody reads", async () => {
  // These land in Windows PowerShell consoles and redirected logs that are not reliably UTF-8.
  const h = harness();
  const progress = createBuildProgress(h.deps, { intervalMs: 30_000 });
  await progress.stage("gate", async () => {
    progress.note("IMPLEMENT");
    h.advance(30_000);
    h.tick();
  });
  await assert.rejects(
    progress.stage("worktree", async () => {
      throw new Error("boom");
    }),
  );
  for (const line of h.logs) {
    // eslint-disable-next-line no-control-regex
    assert.match(line, /^[\x20-\x7e]*$/, `non-ASCII in progress line: ${JSON.stringify(line)}`);
  }
});

test("silentBuildProgress runs the work, emits nothing, and starts no timer", async () => {
  // The offline/dry-run default and the suite injection point. It must still RUN the work, or the
  // wiring would diverge between the silent and live paths and only the live one would be exercised.
  let ran = false;
  const progress: BuildProgress = silentBuildProgress();
  const out = await progress.stage("gate", async () => {
    ran = true;
    return 42;
  });
  progress.note("AUTHOR_TEST");
  assert.equal(ran, true);
  assert.equal(out, 42);
});
