// The bounded wait over a dispatch handle — `the-gate-costs-what-the-change-risks-arc` inc 6.
//
// WHAT THESE PIN, AND WHY THEY ARE SHAPED THIS WAY. The failure this verb removes is not "the wait
// did not wait"; it is a wait that reports something it did not observe. So the assertions are about
// what is REPORTED at each boundary, not about elapsed time:
//
//   - an expired bound is UNVERIFIED, and its exit code is one the gate itself never returns;
//   - a settled sentinel exits with THE RUN'S OWN CODE, including the gate's reserved 3 and 4;
//   - the wait never sleeps past its own deadline (a wait whose return time is unpredictable is
//     the thing the harness's silently-clamped 10-minute ceiling already does to a caller);
//   - `not-dispatched` and `unreadable` KEEP waiting, because both have a legitimate racy cause.
//
// The clock and the sleep are injected, so an eight-minute wait is exercised in microseconds and
// every test here is deterministic. Nothing below spawns a process or touches a filesystem.
//
// Proof: node --import ../../scripts/tsx-cache-off.mjs --import tsx --test src/dispatch-wait.test.ts

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  DEFAULT_POLL_MS,
  DEFAULT_TIMEOUT_MS,
  MAX_TIMEOUT_MS,
  UNVERIFIED_EXIT,
  describeWait,
  parseTimeoutSeconds,
  waitExitCode,
  waitForDispatchHandle,
  type WaitIo,
} from "./dispatch-wait.js";
import { isVerdict } from "./dispatch-handle.js";

/**
 * A fake clock + filesystem. `files` is mutated by `script`, which runs once per poll — so a test
 * says "the sentinel appears on the 4th read" rather than "the sentinel appears after 6 seconds",
 * and the assertion is about the observation rather than about the wall clock.
 */
function fakeIo(files: Map<string, string>, script?: (poll: number, io: Recorder) => void): WaitIo &
  Recorder {
  let clock = 0;
  let polls = 0;
  const sleeps: number[] = [];
  const io: WaitIo & Recorder = {
    files,
    sleeps,
    get clock() {
      return clock;
    },
    exists: (p) => {
      // Count a read of the sentinel as one poll — the loop reads it first each time round.
      if (p.endsWith(".exit")) {
        polls += 1;
        script?.(polls, io);
      }
      return files.has(p);
    },
    readText: (p) => files.get(p) ?? "",
    now: () => clock,
    sleep: async (ms) => {
      sleeps.push(ms);
      clock += ms;
    },
  };
  return io;
}

interface Recorder {
  files: Map<string, string>;
  sleeps: number[];
  readonly clock: number;
}

const HANDLE = "/tmp/run.log";
const EXIT = "/tmp/run.log.exit";

// ---------- a settled sentinel returns the RUN's code, not the waiter's ----------

test("a sentinel already settled returns immediately, with the run's own exit code", async () => {
  const io = fakeIo(new Map([[EXIT, "0\n"]]));
  const outcome = await waitForDispatchHandle(HANDLE, io);
  assert.equal(outcome.timedOut, false);
  assert.equal(outcome.polls, 1, "it did not poll again after a verdict");
  assert.deepEqual(io.sleeps, [], "it did not sleep at all");
  assert.equal(waitExitCode(outcome), 0);
});

test("the gate's RESERVED codes survive the wait — 3 (SKIP) and 4 (PARTIAL) are not collapsed to 1", async () => {
  // This is the reason the exit code is the run's and not the waiter's. CLAUDE.md tells every
  // session to read 3 and 4 as distinct outcomes; a wait that reported a generic 1 would destroy
  // exactly the distinction the caller was waiting to learn.
  for (const code of [1, 3, 4, 42]) {
    const io = fakeIo(new Map([[EXIT, `${String(code)}\n`]]));
    const outcome = await waitForDispatchHandle(HANDLE, io);
    assert.equal(outcome.timedOut, false);
    assert.equal(waitExitCode(outcome), code, `exit code for a run that exited ${String(code)}`);
  }
});

test("it waits until the sentinel appears, then reports the run's verdict", async () => {
  const files = new Map<string, string>([[HANDLE, "gate output so far"]]);
  const io = fakeIo(files, (poll) => {
    if (poll === 4) files.set(EXIT, "1\n");
  });
  const outcome = await waitForDispatchHandle(HANDLE, io);
  assert.equal(outcome.timedOut, false);
  assert.equal(outcome.polls, 4);
  assert.equal(outcome.reading.state, "failed");
  assert.equal(waitExitCode(outcome), 1);
  assert.deepEqual(io.sleeps, [DEFAULT_POLL_MS, DEFAULT_POLL_MS, DEFAULT_POLL_MS]);
});

// ---------- an expired bound is UNVERIFIED, and cannot be read as either verdict ----------

test("an expired bound is not a verdict, and its exit code is one the gate never returns", async () => {
  const io = fakeIo(new Map([[HANDLE, "still going"]]));
  const outcome = await waitForDispatchHandle(HANDLE, io, { timeoutMs: 10_000, pollMs: 2000 });
  assert.equal(outcome.timedOut, true);
  assert.equal(outcome.reading.state, "running");
  assert.equal(isVerdict(outcome.reading), false, "a timed-out wait may never be cited as a result");
  assert.equal(waitExitCode(outcome), UNVERIFIED_EXIT);
  // The reserved code must not collide with anything the gate itself can exit with — 0/1/3/4 are
  // the gate's, and a collision would let "the wait expired" read as a verdict the job gave.
  assert.ok(![0, 1, 3, 4].includes(UNVERIFIED_EXIT));
  assert.match(describeWait(outcome), /the bound expired, the job did not/);
});

test("the wait never sleeps past its own deadline", async () => {
  // A wait whose return time is unpredictable is the defect the harness's silently-clamped ceiling
  // already inflicts on a caller; this verb must not add a second one. The final sleep is trimmed.
  const io = fakeIo(new Map([[HANDLE, "still going"]]));
  const outcome = await waitForDispatchHandle(HANDLE, io, { timeoutMs: 5000, pollMs: 2000 });
  assert.equal(outcome.timedOut, true);
  assert.deepEqual(io.sleeps, [2000, 2000, 1000], "the last sleep is trimmed to the remaining bound");
  assert.equal(outcome.waitedMs, 5000, "it returned at the deadline, not past it");
});

// ---------- the two racy non-answers keep waiting rather than answering wrongly ----------

test("`not-dispatched` keeps waiting — a caller that waits in the next breath races the log", async () => {
  // `pnpm gate:bg` prints the handle before the child has created the log. Answering that race with
  // "nothing was dispatched here" would be a false negative about somebody else's job.
  const files = new Map<string, string>();
  const io = fakeIo(files, (poll) => {
    if (poll === 2) files.set(HANDLE, "the gate finally started");
    if (poll === 3) files.set(EXIT, "0\n");
  });
  const outcome = await waitForDispatchHandle(HANDLE, io);
  assert.equal(outcome.polls, 3);
  assert.equal(outcome.reading.state, "passed");
  assert.equal(waitExitCode(outcome), 0);
});

test("an unreadable sentinel keeps waiting — a half-written file settles, a wrong answer does not", async () => {
  const files = new Map<string, string>([
    [HANDLE, "output"],
    [EXIT, ""],
  ]);
  const io = fakeIo(files, (poll) => {
    if (poll === 3) files.set(EXIT, "4\n");
  });
  const outcome = await waitForDispatchHandle(HANDLE, io);
  assert.equal(outcome.polls, 3);
  assert.equal(waitExitCode(outcome), 4);
});

test("a sentinel that never becomes parseable expires as UNVERIFIED, never as a failure", async () => {
  const io = fakeIo(
    new Map([
      [HANDLE, "output"],
      [EXIT, "not a number"],
    ]),
  );
  const outcome = await waitForDispatchHandle(HANDLE, io, { timeoutMs: 6000, pollMs: 2000 });
  assert.equal(outcome.timedOut, true);
  assert.equal(outcome.reading.state, "unreadable");
  assert.equal(waitExitCode(outcome), UNVERIFIED_EXIT);
});

// ---------- the bound is REFUSED rather than silently clamped ----------

test("--timeout is refused when it is not whole seconds, and defaults when absent", () => {
  assert.deepEqual(parseTimeoutSeconds(undefined), { ms: DEFAULT_TIMEOUT_MS });
  assert.deepEqual(parseTimeoutSeconds("30"), { ms: 30_000 });
  for (const bad of ["", "abc", "1.5", "-5", "30s"]) {
    const parsed = parseTimeoutSeconds(bad);
    assert.ok("error" in parsed, `expected a refusal for ${JSON.stringify(bad)}`);
  }
});

test("a bound past the ceiling is REFUSED, not silently clamped", () => {
  // ADR-0328 measured the harness accepting a 27-hour `timeout` and clamping it to ten minutes with
  // nothing refusing — an agent believing it holds a long wait and being cut short. This verb must
  // not reproduce that: over the ceiling it says so and takes no wait at all.
  const parsed = parseTimeoutSeconds(String(MAX_TIMEOUT_MS / 1000 + 1));
  assert.ok("error" in parsed);
  assert.match(parsed.error, /ceiling/);
  assert.ok("ms" in parseTimeoutSeconds(String(MAX_TIMEOUT_MS / 1000)), "the ceiling itself is fine");
  assert.ok(
    MAX_TIMEOUT_MS < 10 * 60 * 1000 && DEFAULT_TIMEOUT_MS < MAX_TIMEOUT_MS,
    "both bounds sit under the measured 10-minute foreground ceiling, never at it",
  );
});
