import test from "node:test";
import assert from "node:assert/strict";

import {
  CPU_PROGRESS_THRESHOLD_SECONDS,
  type CpuSample,
  MIN_IDLE_WINDOW_MS,
  classifyLiveness,
  renderLivenessLine,
} from "./gate-liveness.js";

/**
 * A tree of `count` processes with consecutive pids from `firstPid`, sharing `cpuSeconds` between
 * them — enough to express the three things the classifier cares about: how much CPU the SAME pids
 * accrued, whether the pid SET moved, and how wide the window was.
 */
const tree = (count: number, cpuSeconds: number, firstPid = 100): Map<number, number> => {
  const map = new Map<number, number>();
  for (let i = 0; i < count; i += 1) map.set(firstPid + i, count === 0 ? 0 : cpuSeconds / count);
  return map;
};

const sample = (at: number, processes: Map<number, number> | null, note?: string): CpuSample => ({
  at,
  processes,
  ...(note !== undefined ? { note } : {}),
});

const MINUTE = 60_000;

// ── the defect this exists to close ──────────────────────────────────────────

test("a quiet step burning CPU is PROGRESSING — the measured `pnpm -r` case", () => {
  // 2026-08-14: the `pnpm -r --no-bail test` leg went ~10 minutes with NO new output while workspaces
  // were genuinely running, because `pnpm -r` buffers a workspace's output until it finishes. Under a
  // timer that reads identically to a wedge; under CPU it is unambiguous.
  const verdict = classifyLiveness(
    sample(0, tree(12, 120)),
    sample(MINUTE, tree(12, 167.3)),
  );

  assert.equal(verdict.kind, "progressing");
  assert.equal(verdict.kind === "progressing" ? verdict.evidence : null, "cpu");
});

test("a tree burning nothing, whose membership did not move, is IDLE", () => {
  const verdict = classifyLiveness(sample(0, tree(3, 88.1)), sample(MINUTE, tree(3, 88.1)));

  assert.equal(verdict.kind, "idle");
  assert.equal(verdict.kind === "idle" ? verdict.processCount : null, 3);
});

test("IDLE never claims the step is wedged — it names both readings and neither", () => {
  // The measurement supports "no work is being done"; it does not support "this will never finish".
  // A line that said `wedged` would license killing a step blocked on a DB that is merely cold.
  const line = renderLivenessLine(
    classifyLiveness(sample(0, tree(2, 5)), sample(MINUTE, tree(2, 5))),
    8 * MINUTE,
  );

  assert.match(line, /BLOCKED/);
  assert.match(line, /WEDGED/);
  assert.match(line, /cannot tell which/);
  assert.match(line, /neither stopped nor judged the step/);
});

// ── membership is a SET, not a count — the measured false alarm ──────────────

test("a tree that TURNED OVER at the same count is PROGRESSING, not idle", () => {
  // THE measured defect, 2026-08-16. On a live `pnpm -r --no-bail test` the tree went 16 processes →
  // 7 → 16 while the suite was demonstrably working, and a count-based version of this function
  // printed `NO CPU PROGRESS` twice over exactly that stretch: seven workers had been swapped for
  // seven others, so the COUNT never moved even though nothing in the tree was the same process.
  const verdict = classifyLiveness(
    sample(0, tree(7, 40, 100)),
    sample(MINUTE, tree(7, 40, 900)), // same count, entirely different pids
  );

  assert.equal(verdict.kind, "progressing");
  assert.equal(verdict.kind === "progressing" ? verdict.evidence : null, "tree-changed");
});

test("CPU counts only across SURVIVORS — an arriving process's history is not this window's work", () => {
  // Each per-pid value is cumulative since that process STARTED. A long-lived process joining the tree
  // would otherwise dump its whole history into the delta and read as a burst of work that never
  // happened; a departing one would subtract its history and read as a stall.
  const prev = new Map([[100, 10]]);
  const curr = new Map([
    [100, 10.1], // the survivor did almost nothing
    [200, 5_000], // and a process with a huge history joined
  ]);
  const verdict = classifyLiveness(sample(0, prev), sample(MINUTE, curr));

  assert.equal(verdict.kind, "progressing", "the membership moved, which is real progress");
  assert.equal(
    verdict.kind === "progressing" ? verdict.evidence : null,
    "tree-changed",
    "…but it is attributed to the tree changing, NOT to 5000s of CPU that was never burned here",
  );
  assert.ok(
    verdict.kind === "progressing" && verdict.cpuDeltaSeconds < 1,
    `the joiner's history stayed out of the delta (got ${verdict.kind === "progressing" ? verdict.cpuDeltaSeconds : "n/a"})`,
  );
});

test("a SHRINKING tree is progress, not a stall — a reaped process takes its CPU with it", () => {
  const verdict = classifyLiveness(sample(0, tree(9, 300)), sample(MINUTE, tree(7, 210)));

  assert.equal(verdict.kind, "progressing");
  assert.equal(verdict.kind === "progressing" ? verdict.evidence : null, "tree-changed");
});

test("a tree that GREW with no measurable CPU yet is progressing", () => {
  const prev = new Map([[100, 10]]);
  const curr = new Map([
    [100, 10.05],
    [101, 0],
    [102, 0],
  ]);
  assert.equal(classifyLiveness(sample(0, prev), sample(MINUTE, curr)).kind, "progressing");
});

test("the progress threshold is small but non-zero — a hair of CPU is not progress", () => {
  const barely = classifyLiveness(
    sample(0, tree(4, 10)),
    sample(MINUTE, tree(4, 10 + CPU_PROGRESS_THRESHOLD_SECONDS / 10)),
  );
  assert.equal(barely.kind, "idle");

  const over = classifyLiveness(
    sample(0, tree(4, 10)),
    sample(MINUTE, tree(4, 10 + CPU_PROGRESS_THRESHOLD_SECONDS)),
  );
  assert.equal(over.kind, "progressing");
});

// ── UNKNOWN is a first-class outcome, never quietly a pass ───────────────────

test("an unmeasurable sample is UNKNOWN, carrying why — never PROGRESSING", () => {
  const verdict = classifyLiveness(sample(0, tree(4, 10)), sample(MINUTE, null, "ps exited 1"));

  assert.equal(verdict.kind, "unknown");
  assert.match(verdict.kind === "unknown" ? verdict.reason : "", /ps exited 1/);
  assert.notEqual(verdict.kind, "progressing", "a probe that could not answer never acquits a step");
});

test("an unmeasurable BASELINE is UNKNOWN too — one good sample proves nothing on its own", () => {
  const verdict = classifyLiveness(
    sample(0, null, "powershell.exe could not be started"),
    sample(MINUTE, tree(4, 10)),
  );
  assert.equal(verdict.kind, "unknown");
});

test("an empty process tree is UNKNOWN, not IDLE — a step at its tail is not a stall", () => {
  const verdict = classifyLiveness(sample(0, new Map()), sample(MINUTE, new Map()));
  assert.equal(verdict.kind, "unknown");
});

test("a SHORT window cannot call an absence of CPU idle — the measured false alarm", () => {
  // Proving the heartbeat against a real `pnpm -r typecheck` at a 5s debug interval produced two
  // `NO CPU PROGRESS` lines on a step that was demonstrably healthy: a working tree genuinely idles
  // for a few seconds between spawns while pnpm walks the workspace graph. Over a short window a lull
  // and a stall are the same reading, and a line that cried wolf would train readers to ignore it.
  const short = classifyLiveness(
    sample(0, tree(4, 40)),
    sample(MIN_IDLE_WINDOW_MS - 1, tree(4, 40)),
  );
  assert.equal(short.kind, "unknown");
  assert.match(short.kind === "unknown" ? short.reason : "", /too short to tell a lull from a stall/);

  const long = classifyLiveness(sample(0, tree(4, 40)), sample(MIN_IDLE_WINDOW_MS, tree(4, 40)));
  assert.equal(long.kind, "idle", "at the runner's default interval the signal is unaffected");
});

test("a short window still reports PROGRESSING — the rule narrows only the idle claim", () => {
  // Positive evidence of work needs no minimum window; it is only the ABSENCE of work that a short
  // window cannot distinguish from a pause.
  const verdict = classifyLiveness(sample(0, tree(4, 40)), sample(5_000, tree(4, 46)));
  assert.equal(verdict.kind, "progressing");
});

test("samples that did not span a positive window are UNKNOWN", () => {
  const verdict = classifyLiveness(sample(MINUTE, tree(2, 1)), sample(MINUTE, tree(2, 9)));
  assert.equal(verdict.kind, "unknown");
});

test("the UNKNOWN line says it is no signal rather than a healthy one", () => {
  const line = renderLivenessLine({ kind: "unknown", reason: "ps returned no rows" }, 3 * MINUTE);
  assert.match(line, /LIVENESS UNKNOWN/);
  assert.match(line, /ps returned no rows/);
  assert.match(line, /no signal rather than as a healthy one/);
});

// ── the line a session actually reads ────────────────────────────────────────

test("the PROGRESSING line explains the silence, so a reader stops hunting for its cause", () => {
  const line = renderLivenessLine(
    classifyLiveness(sample(0, tree(12, 0)), sample(MINUTE, tree(12, 47.3))),
    6 * MINUTE + 12_000,
  );

  assert.match(line, /PROGRESSING/);
  assert.match(line, /47\.3s of CPU/);
  assert.match(line, /12 processes/);
  assert.match(line, /6m12s in/);
  assert.match(line, /buffers a workspace's output/);
});

test("every verdict renders exactly one line — it interleaves with the step's own output", () => {
  const lines = [
    renderLivenessLine(
      { kind: "progressing", evidence: "cpu", cpuDeltaSeconds: 3, windowMs: MINUTE, processCount: 2 },
      MINUTE,
    ),
    renderLivenessLine(
      { kind: "progressing", evidence: "tree-changed", cpuDeltaSeconds: 0, windowMs: MINUTE, processCount: 2 },
      MINUTE,
    ),
    renderLivenessLine({ kind: "idle", cpuDeltaSeconds: 0, windowMs: MINUTE, processCount: 2 }, MINUTE),
    renderLivenessLine({ kind: "unknown", reason: "no rows" }, MINUTE),
  ];
  for (const line of lines) assert.doesNotMatch(line, /\n/, line);
});

test("one process reads as `process`, not `1 processes`", () => {
  const line = renderLivenessLine(
    { kind: "idle", cpuDeltaSeconds: 0, windowMs: MINUTE, processCount: 1 },
    MINUTE,
  );
  assert.match(line, /the same 1 process as/);
});
