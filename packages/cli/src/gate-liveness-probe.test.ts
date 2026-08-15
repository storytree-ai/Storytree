import test from "node:test";
import assert from "node:assert/strict";

import {
  type ProcessRow,
  collectTreeCpu,
  parsePosixCpuTime,
  parsePosixProcessRows,
  parseWindowsProcessRows,
  sampleTreeCpu,
} from "./gate-liveness-probe.js";

/** Total CPU across a collected tree — the classifier works per-pid, but a sum is easier to assert. */
const total = (tree: ReadonlyMap<number, number>): number =>
  [...tree.values()].reduce((a, b) => a + b, 0);

// ── the tree walk: the sum must be the STEP's subtree, nothing else ──────────

const rows: ProcessRow[] = [
  { pid: 1, ppid: 0, cpuSeconds: 100 }, // init — outside the step entirely
  { pid: 10, ppid: 1, cpuSeconds: 5 }, // the gate itself
  { pid: 20, ppid: 10, cpuSeconds: 1 }, // the step's shell (the root we sample)
  { pid: 21, ppid: 20, cpuSeconds: 30 }, // pnpm
  { pid: 22, ppid: 21, cpuSeconds: 60 }, // node
  { pid: 30, ppid: 10, cpuSeconds: 900 }, // the probe's own powershell — a SIBLING of the step
];

test("the tree covers the root and every descendant, keyed by pid, and stops there", () => {
  assert.deepEqual(
    collectTreeCpu(rows, 20),
    new Map([
      [20, 1],
      [21, 30],
      [22, 60],
    ]),
  );
});

test("a SIBLING of the step is never collected — including the probe's own process", () => {
  // This is why `gate-run.ts` roots the sample at the step's child pid rather than at the gate. A tree
  // rooted at the gate would swallow pid 30 — the probe's own PowerShell — and report ~1s of CPU every
  // window, a permanent false PROGRESSING in the one module whose job is telling working from stopped.
  assert.equal(collectTreeCpu(rows, 20).has(30), false);
  assert.equal(total(collectTreeCpu(rows, 20)), 91);
  assert.equal(
    collectTreeCpu(rows, 10).get(30),
    900,
    "rooted at the gate, the probe's own 900s is inside the tree",
  );
});

test("an unknown root collects nothing rather than throwing", () => {
  assert.equal(collectTreeCpu(rows, 4242).size, 0);
});

test("a self-referential or cyclic process table terminates", () => {
  // The table is a snapshot of a moving target: a reaped parent can leave rows whose ppids point at
  // each other. Hanging the gate inside its own liveness instrument would be a far worse defect than
  // the blindness it was added to fix, so the walk is guarded rather than trusting the OS.
  const cyclic: ProcessRow[] = [
    { pid: 5, ppid: 5, cpuSeconds: 1 },
    { pid: 6, ppid: 7, cpuSeconds: 2 },
    { pid: 7, ppid: 6, cpuSeconds: 3 },
    { pid: 8, ppid: 5, cpuSeconds: 0 },
  ];
  assert.deepEqual(collectTreeCpu(cyclic, 5), new Map([[5, 1], [8, 0]]));
  assert.deepEqual(collectTreeCpu(cyclic, 6), new Map([[6, 2], [7, 3]]));
});

// ── the OS formats ──────────────────────────────────────────────────────────

test("Windows ticks are 100ns, so ten million make a second", () => {
  const parsed = parseWindowsProcessRows("20,10,10000000\r\n21,20,25000000\r\n");
  assert.deepEqual(parsed, [
    { pid: 20, ppid: 10, cpuSeconds: 1 },
    { pid: 21, ppid: 20, cpuSeconds: 2.5 },
  ]);
});

test("Windows rows that are not three numbers are dropped, never guessed at", () => {
  const parsed = parseWindowsProcessRows(
    ["", "header,junk", "20,10,10000000", "nope,10,5", "21,20"].join("\n"),
  );
  assert.deepEqual(parsed, [{ pid: 20, ppid: 10, cpuSeconds: 1 }]);
});

test("all three `ps` time layouts parse — a parser that knew only MM:SS under-reads every long step", () => {
  assert.equal(parsePosixCpuTime("00:03"), 3);
  assert.equal(parsePosixCpuTime("12:34"), 12 * 60 + 34);
  assert.equal(parsePosixCpuTime("01:02:03"), 3_600 + 2 * 60 + 3);
  assert.equal(parsePosixCpuTime("2-03:04:05"), 2 * 86_400 + 3 * 3_600 + 4 * 60 + 5);
});

test("macOS fractional seconds survive", () => {
  assert.equal(parsePosixCpuTime("0:03.45"), 3.45);
});

test("a `ps` time field that is not a time is null, never zero", () => {
  // Zero would be indistinguishable from a genuinely idle process, which is the exact judgement this
  // probe feeds — so an unparseable field must drop its row rather than fake a reading.
  assert.equal(parsePosixCpuTime("TIME"), null);
  assert.equal(parsePosixCpuTime(""), null);
  assert.equal(parsePosixCpuTime("03"), null);
  assert.equal(parsePosixCpuTime("1:2:3:4"), null);
});

test("`ps` output parses, header and blank lines included", () => {
  const parsed = parsePosixProcessRows(
    ["  PID  PPID     TIME", "   20    10  00:01:00", "   21    20  10:00", "", "  junk"].join("\n"),
  );
  assert.deepEqual(parsed, [
    { pid: 20, ppid: 10, cpuSeconds: 60 },
    { pid: 21, ppid: 20, cpuSeconds: 600 },
  ]);
});

// ── fail-soft: this instrument may never hurt the gate it observes ───────────

test("a sample of a pid that does not exist answers, and never rejects", async () => {
  // The real OS probe, against a root nothing descends from. It must return a SAMPLE — an instrument
  // bolted to a gate CI runs may not throw into it under any input.
  const taken = await sampleTreeCpu(0x7ff_ffff);
  assert.equal(typeof taken.at, "number");
  assert.equal(taken.processes?.size ?? 0, 0);
});

test("the real OS read yields EITHER a sane reading OR a null carrying why — never a third thing", async () => {
  // A live read of this test runner's own process tree, so the OS path is exercised rather than
  // stubbed. It asserts the module's actual contract — fail SOFT — rather than "the probe answered",
  // because the probe genuinely may not: a full 12-step gate pushed `Get-CimInstance` past 15s twice
  // in one run, and this very assertion was the step that went red for it. A suite rung whose verdict
  // depends on how loaded the box is manufactures false reds, which is this repo's own recorded trap.
  //
  // IT IS NOT VACUOUS. Two outcomes are allowed and a third is forbidden: a null reading with NO note
  // (a probe that failed silently) fails here, as does any throw. The generous budget makes the
  // measuring branch the one that normally runs; the note is printed either way so a reader can see
  // which branch a green came from.
  const taken = await sampleTreeCpu(process.pid, { timeoutMs: 90_000 });

  assert.equal(typeof taken.at, "number");
  if (taken.processes === null) {
    assert.ok(
      taken.note !== undefined && taken.note !== "",
      "a probe that could not answer must say why — a silent null is indistinguishable from idle",
    );
    console.log(`      (the process table could not be read on ${process.platform}: ${taken.note})`);
    return;
  }
  assert.ok(taken.processes.has(process.pid), "the root is found in its own tree");
  // NOT `> 0`. `ps -o time=` reports WHOLE SECONDS, so a young process on POSIX legitimately reads
  // `00:00:00` — measured, by this assertion going red on Linux CI while passing on Windows, where
  // 100-nanosecond ticks make it always positive. An assertion may only claim what the instrument
  // guarantees on every platform it runs on; the rest is the parsers' job, which is exercised above
  // against captured output from both.
  assert.ok(
    total(taken.processes) >= 0 && Number.isFinite(total(taken.processes)),
    "every collected value parsed into a real number of seconds",
  );
});
