import test from "node:test";
import assert from "node:assert/strict";

import {
  BACKSTOP_STREAM_LIMIT,
  boundBackstopStream,
  makeBackstopRefusal,
  renderBackstopRefusalObservation,
  renderForensicPreservation,
} from "./backstop-report.js";

test("boundBackstopStream leaves empty, short, and exact-limit streams exact", () => {
  const exact = "x".repeat(4_000);
  const cases = [
    { name: "empty", input: "", expected: "(empty)" },
    { name: "short", input: "short output", expected: "short output" },
    { name: "exact limit", input: exact, expected: exact },
  ];

  for (const entry of cases) {
    assert.equal(boundBackstopStream(entry.input), entry.expected, entry.name);
  }
});

test("boundBackstopStream is exactly 4,000 characters with balanced ends and exact omission", () => {
  const justOver = `${"A".repeat(2_001)}${"B".repeat(2_001)}`;
  const justOverExpected =
    `${"A".repeat(1_982)}\n... [truncated 37 characters] ...\n${"B".repeat(1_983)}`;
  const farOver = `${"H".repeat(2_500)}${"T".repeat(2_500)}`;
  const farOverExpected =
    `${"H".repeat(1_981)}\n... [truncated 1037 characters] ...\n${"T".repeat(1_982)}`;

  assert.equal(boundBackstopStream(justOver), justOverExpected);
  assert.equal(boundBackstopStream(justOver).length, BACKSTOP_STREAM_LIMIT);
  assert.equal(boundBackstopStream(farOver), farOverExpected);
  assert.equal(boundBackstopStream(farOver).length, BACKSTOP_STREAM_LIMIT);
});

test("renderBackstopRefusalObservation renders numeric and null exits exactly", () => {
  assert.equal(
    renderBackstopRefusalObservation({
      kind: "typecheck",
      result: "red",
      originalProcessResult: { stdout: "TYPECHECK-OUT", stderr: "TYPECHECK-ERR", exitCode: 7 },
      timeoutMs: 12_345,
    }),
    "backstop observation (typecheck): exit 7; effective timeout 12345ms\n" +
      "stdout:\nTYPECHECK-OUT\n" +
      "stderr:\nTYPECHECK-ERR",
  );
  assert.equal(
    renderBackstopRefusalObservation({
      kind: "regression",
      result: "red",
      originalProcessResult: { stdout: "", stderr: "", exitCode: null },
      timeoutMs: 600_000,
    }),
    "backstop observation (regression): exit none (killed or timed out after 600000ms); effective timeout 600000ms\n" +
      "stdout:\n(empty)\n" +
      "stderr:\n(empty)",
  );
});

test("makeBackstopRefusal binds each exact headline to its exact structured observation", () => {
  const process = { stdout: "out", stderr: "err", exitCode: 9 };
  const observed = { result: "red" as const, originalProcessResult: process, timeoutMs: 44_000 };

  assert.deepEqual(makeBackstopRefusal("typecheck", observed), {
    observation: {
      kind: "typecheck",
      result: "red",
      originalProcessResult: process,
      timeoutMs: 44_000,
    },
    ok: false,
    reason:
      "the package typecheck is RED in the worktree (the proof run is tsx-driven — types stripped — so only the typecheck sees type-illegal code)\n" +
      "backstop observation (typecheck): exit 9; effective timeout 44000ms\n" +
      "stdout:\nout\n" +
      "stderr:\nerr",
  });
  assert.deepEqual(makeBackstopRefusal("regression", observed), {
    observation: {
      kind: "regression",
      result: "red",
      originalProcessResult: process,
      timeoutMs: 44_000,
    },
    ok: false,
    reason:
      "the package regression suite is RED in the worktree (a green leaf must not break its package)\n" +
      "backstop observation (regression): exit 9; effective timeout 44000ms\n" +
      "stdout:\nout\n" +
      "stderr:\nerr",
  });
});

test("renderForensicPreservation uses the full SHA and exact unsigned warning", () => {
  assert.deepEqual(renderForensicPreservation(undefined), []);
  assert.deepEqual(
    renderForensicPreservation({
      branch: "claude/real-forensics/unit-run-1",
      commitSha: "0123456789abcdef0123456789abcdef01234567",
      pushed: false,
      detail: "push withheld — local branch kept for forensics",
    }),
    [
      "forensics:   UNSIGNED authored commit retained locally at claude/real-forensics/unit-run-1 @ " +
        "0123456789abcdef0123456789abcdef01234567 " +
        "(push withheld — local branch kept for forensics); never pushed, promoted, or landable without a later signed proof",
    ],
  );
});
