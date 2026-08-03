// gate:bg — a backgrounded gate exits with THE GATE'S OWN STATUS (scripts/gate-bg.sh).
//
// THE FAILURE THIS FENCES. A backgrounded command's completion notification reports the OUTER
// SHELL's exit code, not the wrapped command's. Measured: `pnpm gate` was backgrounded as
// `{ pnpm gate; echo "GATE_EXIT=$?"; } > gate3.log 2>&1`; the gate FAILED (the log's last line read
// `GATE_EXIT=1`) while the notification read `completed (exit code 0)`. The session reported the
// gate GREEN TO THE OWNER and had to correct it a turn later — the worst-shaped consequence
// available, a false statement to the human rather than a cost in time.
//
// The first test below is the RED ANCHOR: it pins the four capture shapes that force a zero, so
// the rest of the file is demonstrably testing something real and not a tautology. The fourth
// (`cmd 2>&1 | tee log`) is the trap inside the fix itself — a pipeline exits with its RIGHTMOST
// command, so piping the gate into `tee` hands you tee's success. `${PIPESTATUS[0]}` is what makes
// the script correct, and `preserves the load-bearing PIPESTATUS line` below reds if it is removed.
//
// Proof: node --import tsx --test packages/cli/src/gate-bg.test.ts

import assert from "node:assert/strict";
import { test } from "node:test";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { resolveRepoBash } from "../../../scripts/resolve-bash.mjs";

const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));
const script = path.join(repoRoot, "scripts", "gate-bg.sh");

// The SAME bash the product uses (pnpm gate:bg -> scripts/gate-bg.mjs). Resolving it here rather
// than spawning bare "bash" is load-bearing, not tidiness: on Windows with WSL installed, PATH
// resolves bash to the WSL launcher, which cannot open an absolute Windows path and exits 127 —
// redding this whole file, and with it "pnpm -r test", for reasons that name neither WSL nor PATH.
const bash = resolveRepoBash();

/**
 * Run the wrapper around `inner`, returning its own exit status and stdout.
 *
 * GATE_BG_LOG is STRIPPED from the inherited environment before `env` is layered on. That is not
 * hygiene, it is a fix: the variable is a documented override of the very thing
 * "the default log path is worktree-anchored and unique per run" exists to assert, so a session
 * that backgrounds its own gate with `GATE_BG_LOG=… pnpm gate:bg` leaks that path into `pnpm -r
 * test` and the default-path test then measures the OVERRIDE. Measured 2026-08-04: both runs came
 * back with the caller's scratchpad path, so the uniqueness assertion compared a value to itself
 * and the "in the worktree's .gate-logs" assertion failed against a path outside the worktree.
 * A test that silently inherits an override of its own subject proves nothing — the same shape as
 * the WSL/PATH defect this file's `bash` resolution now fences.
 */
function runWrapper(
  inner: string,
  env: Record<string, string> = {},
): { status: number; stdout: string } {
  const hermetic = { ...process.env };
  delete hermetic["GATE_BG_LOG"];
  const res = spawnSync(bash, [script, "sh", "-c", inner], {
    encoding: "utf8",
    env: { ...hermetic, ...env },
  });
  assert.equal(res.error, undefined, `spawning bash failed: ${String(res.error)}`);
  return { status: res.status ?? -1, stdout: `${res.stdout}${res.stderr}` };
}

/** Run a raw shell snippet and report the status the CALLING shell would observe. */
function rawShellStatus(snippet: string): number {
  const res = spawnSync(bash, ["-c", snippet], { encoding: "utf8" });
  assert.equal(res.error, undefined, `spawning bash failed: ${String(res.error)}`);
  return res.status ?? -1;
}

function withTempLog<T>(fn: (logPath: string) => T): T {
  const dir = mkdtempSync(path.join(os.tmpdir(), "st-gate-bg-"));
  try {
    return fn(path.join(dir, "run.log"));
  } finally {
    rmSync(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
  }
}

// ---------- the red anchor: every ad-hoc capture shape destroys the status ----------

test("RED ANCHOR: the shapes sessions reach for all force a zero status", () => {
  // Each wraps a command that exited 1. Each reports 0. These are the measured failures.
  assert.equal(rawShellStatus('{ sh -c "exit 1"; echo "GATE_EXIT=$?"; }'), 0, "{ cmd; echo $?; }");
  assert.equal(rawShellStatus('sh -c "exit 1" | tail -1'), 0, "cmd | tail");
  assert.equal(rawShellStatus('( sh -c "exit 1" ; echo "EXIT=$?" )'), 0, "cmd ; echo EXIT=$?");
  // The trap inside the fix: tee is the RIGHTMOST command, so the pipeline reports tee.
  assert.equal(rawShellStatus('sh -c "exit 1" 2>&1 | tee /dev/null'), 0, "cmd 2>&1 | tee log");
});

// ---------- the property: the wrapper exits with the wrapped command's status ----------

test("the wrapper exits 1 when the wrapped command exits 1", () => {
  withTempLog((logPath) => {
    const { status } = runWrapper('echo "some gate output"; exit 1', { GATE_BG_LOG: logPath });
    assert.equal(status, 1);
  });
});

test("the wrapper exits 0 when the wrapped command passes", () => {
  withTempLog((logPath) => {
    const { status } = runWrapper('echo "all green"; exit 0', { GATE_BG_LOG: logPath });
    assert.equal(status, 0);
  });
});

test("the wrapper propagates an arbitrary non-zero status, not just 1", () => {
  withTempLog((logPath) => {
    const { status } = runWrapper("exit 42", { GATE_BG_LOG: logPath });
    assert.equal(status, 42);
  });
});

// ---------- the .exit file cannot disagree with the wrapper ----------

test("the .exit file carries the same status the wrapper exited with", () => {
  for (const expected of [0, 1, 42]) {
    withTempLog((logPath) => {
      const { status } = runWrapper(`exit ${expected}`, { GATE_BG_LOG: logPath });
      const recorded = readFileSync(`${logPath}.exit`, "utf8").trim();
      assert.equal(status, expected, `wrapper status for exit ${expected}`);
      assert.equal(recorded, String(expected), `.exit file for exit ${expected}`);
      // The two ways of reading the result must never disagree — that disagreement IS the bug.
      assert.equal(String(status), recorded);
    });
  }
});

// ---------- the log is a faithful transcript ----------

test("the log tees both stdout and stderr, and records the verdict", () => {
  withTempLog((logPath) => {
    const { status } = runWrapper('echo "to stdout"; echo "to stderr" >&2; exit 1', {
      GATE_BG_LOG: logPath,
    });
    const log = readFileSync(logPath, "utf8");
    assert.equal(status, 1);
    assert.match(log, /to stdout/);
    assert.match(log, /to stderr/, "stderr is folded into the log (2>&1), not lost");
    assert.match(log, /exit\s+:\s+1 \(FAIL\)/, "the log alone tells you the verdict");
  });
});

// ---------- the log path is session-unique, never a fixed shared path ----------

test("the default log path is worktree-anchored and unique per run", () => {
  const logLine = /gate:bg log:\s+(\S+)/;
  const first = runWrapper("exit 0");
  const second = runWrapper("exit 0");

  const a = logLine.exec(first.stdout)?.[1];
  const b = logLine.exec(second.stdout)?.[1];
  assert.ok(a, "the script prints its log path so a session never has to guess it");
  assert.ok(b);

  // Git Bash's /tmp is SHARED across worktrees: a sibling's log has already been read as this
  // session's result. Anchoring to this worktree makes that collision impossible by construction.
  assert.ok(a.includes(".gate-logs"), `default log is in the worktree's .gate-logs: ${a}`);
  assert.ok(
    a.includes(path.basename(repoRoot)),
    `default log is anchored to THIS worktree (${path.basename(repoRoot)}): ${a}`,
  );
  // ...and two runs in the same worktree — even within the same second — never collide either.
  assert.notEqual(a, b, "each run gets its own log path");
});

// ---------- the regression fence on the one line that makes this work ----------
//
// Both fences below were written weaker first and the mutation escaped them, so they are shaped by
// that miss rather than by intent: (a) a source grep for `PIPESTATUS[0]` PASSED against a script
// whose code line had been swapped to `$?`, because the surviving header comments matched — a fence
// that reads comments fences nothing; (b) every behavioural test above ALSO passed under that swap,
// because `set -o pipefail` independently rescues `$?`. So the swap was invisible twice over, and
// the guarantee was resting on a line nothing was checking.

/** The script's executable lines only — comments describe the fix, they do not implement it. */
function scriptCode(src: string): string {
  return src
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("#"))
    .join("\n");
}

test("the status assignment reads PIPESTATUS[0] in CODE, not merely in a comment", () => {
  const code = scriptCode(readFileSync(script, "utf8"));
  assert.match(
    code,
    /status="\$\{PIPESTATUS\[0\]\}"/,
    "the wrapped command's status must come from PIPESTATUS[0]; `$?` after the tee pipeline reads the PIPELINE's status and silently reports a red gate as green",
  );
});

test("propagation survives losing pipefail — PIPESTATUS is doing the work, not pipefail", () => {
  // The dangerous refactor is `${PIPESTATUS[0]}` -> `$?`, which LOOKS equivalent while `pipefail`
  // is set and stops being equivalent the moment it isn't. Run a copy of the real script with
  // pipefail stripped: PIPESTATUS[0] is positional and still reports 1; `$?` would report tee's 0.
  const src = readFileSync(script, "utf8");
  const stripped = src.replace(/^set -uo pipefail$/m, "set -u");
  assert.notEqual(stripped, src, "expected a `set -uo pipefail` line to strip");

  const dir = mkdtempSync(path.join(os.tmpdir(), "st-gate-bg-nopipefail-"));
  try {
    const copy = path.join(dir, "gate-bg-nopipefail.sh");
    writeFileSync(copy, stripped);
    const res = spawnSync(bash, [copy, "sh", "-c", "exit 1"], {
      encoding: "utf8",
      env: { ...process.env, GATE_BG_LOG: path.join(dir, "run.log") },
    });
    assert.equal(res.error, undefined, `spawning bash failed: ${String(res.error)}`);
    assert.equal(
      res.status,
      1,
      "without pipefail the wrapper still reports the wrapped command's status — if this is 0, the status is being read from the pipeline (`$?`) rather than PIPESTATUS[0]",
    );
  } finally {
    rmSync(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
  }
});
