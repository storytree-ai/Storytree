/**
 * The join between a storytree session id and the host transcript windows written inside its
 * worktree (ADR-0235 clause 6), story `context-traversal-transcript`, capability
 * `transcript-session-correlation`.
 *
 * Every fixture writes JSONL transcripts into a unique temporary directory (never the real
 * `~/.claude/projects`) and reads it back through a brand-new call to `correlateTranscripts`. The
 * `cwd` values recorded on fixture lines are arbitrary strings standing in for a host-recorded
 * working directory — they are asserted on as DATA, never resolved against the real filesystem, so
 * a fixture may (and deliberately does) mix `/`- and `\`-separated paths regardless of the platform
 * the suite itself runs on.
 *
 * Covers the four contracts declared in the node spec, in this order:
 *   1. correlation-is-the-exact-worktree-final-segment
 *   2. a-prefix-or-a-parent-checkout-never-correlates
 *   3. an-uncorrelated-session-is-empty-and-says-so
 *   4. every-correlated-window-is-named-and-ordered-separately
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";

import { correlateTranscripts } from "./correlate-transcripts.js";

function freshDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), `correlate-transcripts-${prefix}-`));
}

interface FixtureLine {
  readonly cwd?: string;
  readonly sessionId?: string;
  readonly timestamp: string;
  /** Present on lines a SUBAGENT wrote; those record the PARENT window's `sessionId`, never their own. */
  readonly isSidechain?: boolean;
}

function transcriptLine(fields: FixtureLine): string {
  return JSON.stringify(fields);
}

function writeFile(filePath: string, lines: readonly string[]): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${lines.join("\n")}\n`);
}

test("correlation-is-the-exact-worktree-final-segment: a cwd that IS the worktree directory, or is nested inside it, correlates — with / and \\ separators accepted interchangeably and a trailing separator tolerated", () => {
  const dir = freshDir("exact");
  const filePath = path.join(dir, "project-x", "window.jsonl");
  const hostSessionId = "8f3ee1a2-host-window";

  const earliestUnrelated = transcriptLine({
    cwd: "/home/dev/some-other-checkout",
    sessionId: "unrelated-host",
    timestamp: "2026-01-01T00:00:00.000Z",
  });
  // Exact match: cwd IS the worktree directory (posix separators).
  const exactMatch = transcriptLine({
    cwd: "/home/dev/code/storytree/.claude/worktrees/story-alpha",
    sessionId: hostSessionId,
    timestamp: "2026-02-02T00:00:00.000Z",
  });
  // Nested match: cwd is a directory INSIDE the worktree (Windows-style backslashes).
  const nestedMatch = transcriptLine({
    cwd: "C:\\Users\\dev\\storytree\\.claude\\worktrees\\story-alpha\\packages\\foo",
    sessionId: hostSessionId,
    timestamp: "2026-02-03T00:00:00.000Z",
  });
  // Trailing-separator match: this is the EARLIEST correlating line, so it must set firstObservedAt
  // even though the truly-earliest line in the file (earliestUnrelated) never correlates at all.
  const trailingSeparatorMatch = transcriptLine({
    cwd: "/home/dev/code/storytree/.claude/worktrees/story-alpha/",
    sessionId: hostSessionId,
    timestamp: "2026-02-01T00:00:00.000Z",
  });

  writeFile(filePath, [earliestUnrelated, exactMatch, nestedMatch, trailingSeparatorMatch]);

  const result = correlateTranscripts("story-alpha", { dir });

  assert.equal(result.sessionId, "story-alpha");
  assert.equal(result.scannedFiles, 1);
  assert.equal(result.windows.length, 1);
  const [window] = result.windows;
  assert.equal(window?.windowId, hostSessionId);
  assert.equal(window?.file, filePath);
  // The earliest CORRELATING line's timestamp, not the earlier-but-unrelated line's.
  assert.equal(window?.firstObservedAt, "2026-02-01T00:00:00.000Z");
});

test("a-prefix-or-a-parent-checkout-never-correlates: a longer or shorter worktree-segment name, a broken .claude/worktrees/<id> triplet, and a main-checkout cwd all fail to correlate", () => {
  const dir = freshDir("prefix");
  const filePath = path.join(dir, "window.jsonl");

  const longerSibling = transcriptLine({
    // "foo-bar-extra" is not equal to "foo-bar" even though it starts with it.
    cwd: "/home/dev/.claude/worktrees/foo-bar-extra",
    sessionId: "host-longer",
    timestamp: "2026-03-01T00:00:00.000Z",
  });
  const shorterSibling = transcriptLine({
    // "foo" is not equal to "foo-bar" even though "foo-bar" starts with it.
    cwd: "/home/dev/.claude/worktrees/foo",
    sessionId: "host-shorter",
    timestamp: "2026-03-01T00:00:01.000Z",
  });
  const brokenTriplet = transcriptLine({
    // The three segments are all present but not consecutive/in order: not a correlating path.
    cwd: "/home/dev/worktrees/.claude/foo-bar",
    sessionId: "host-broken",
    timestamp: "2026-03-01T00:00:02.000Z",
  });
  const mainCheckout = transcriptLine({
    // A parent/main checkout: no .claude/worktrees/<id> suffix at all.
    cwd: "/home/dev/code/storytree",
    sessionId: "host-main",
    timestamp: "2026-03-01T00:00:03.000Z",
  });

  writeFile(filePath, [longerSibling, shorterSibling, brokenTriplet, mainCheckout]);

  const result = correlateTranscripts("foo-bar", { dir });

  assert.equal(result.sessionId, "foo-bar");
  assert.equal(result.scannedFiles, 1);
  assert.deepEqual(result.windows, []);
});

test("an-uncorrelated-session-is-empty-and-says-so: no correlating line anywhere yields an empty windows list alongside the honest count of every *.jsonl file considered at every depth the host writes, and the walk never throws", () => {
  const dir = freshDir("empty");

  // A file directly in the root: unrelated cwd, plus lines that can never correlate to anything
  // (no cwd at all, and a line that is not even valid JSON).
  const directPath = path.join(dir, "direct.jsonl");
  writeFile(directPath, [
    transcriptLine({ cwd: "/home/dev/other-checkout", sessionId: "host-a", timestamp: "2026-04-01T00:00:00.000Z" }),
    JSON.stringify({ sessionId: "host-b", timestamp: "2026-04-01T00:00:01.000Z" }), // no cwd
    "not even json",
  ]);

  // A file one level down, in an immediate sub-directory: the parent-window shape.
  const subPath = path.join(dir, "sub-a", "in-sub.jsonl");
  writeFile(subPath, [
    transcriptLine({ cwd: "/home/dev/other-checkout-2", sessionId: "host-c", timestamp: "2026-04-01T00:00:02.000Z" }),
  ]);

  // The deepest shape the host actually writes — `<project>/<window>/subagents/workflows/<wf>/`, five
  // directory levels below the root. It is SCANNED (a bound that stopped shallower reported a
  // denominator that silently excluded it), and it still fails to correlate here because its cwd
  // names a different worktree: reaching a file and correlating to it are separate questions.
  const deepPath = path.join(dir, "sub-a", "window-1", "subagents", "workflows", "wf-1", "deep.jsonl");
  writeFile(deepPath, [
    transcriptLine({
      cwd: "/home/dev/code/storytree/.claude/worktrees/a-different-session",
      sessionId: "host-deep",
      timestamp: "2026-04-01T00:00:03.000Z",
    }),
  ]);

  // A directory that merely LOOKS like a transcript file by name: never a regular file, must be
  // skipped rather than followed or read, and must never crash the walk.
  fs.mkdirSync(path.join(dir, "phantom.jsonl"));

  const result = correlateTranscripts("ghost-session", { dir });

  assert.equal(result.sessionId, "ghost-session");
  assert.deepEqual(result.windows, []);
  // All three real files count toward the honest denominator regardless of depth; the phantom
  // directory is not a file and never does.
  assert.equal(result.scannedFiles, 3);
  // Nothing correlated at all, so nothing was reached-but-omitted either — the two ways of finding
  // no window stay distinguishable.
  assert.equal(result.sidechainFiles, 0);
});

test("every-correlated-window-is-named-and-ordered-separately: several distinct host windows that ran inside the same worktree are each reported once, oldest first, and a window whose own lines disagree about their identity is excluded rather than guessed at", () => {
  const dir = freshDir("windows");
  const worktreeCwd = "/home/dev/code/storytree/.claude/worktrees/multi-session";

  // Named so that plain filename ordering would put "w1" before "w2" — the result must instead be
  // ordered by firstObservedAt, proving the sort is not an accident of scan order.
  const w1Path = path.join(dir, "sub", "w1-later.jsonl");
  writeFile(w1Path, [
    transcriptLine({ cwd: worktreeCwd, sessionId: "host-later", timestamp: "2026-05-02T00:00:00.000Z" }),
    transcriptLine({
      cwd: `${worktreeCwd}/packages/bar`,
      sessionId: "host-later",
      timestamp: "2026-05-02T01:00:00.000Z",
    }),
  ]);

  const w2Path = path.join(dir, "sub", "w2-earlier.jsonl");
  writeFile(w2Path, [
    transcriptLine({ cwd: worktreeCwd, sessionId: "host-earlier", timestamp: "2026-05-01T00:00:00.000Z" }),
  ]);

  // Ambiguous window: both lines have a cwd inside the target worktree, but they recorded two
  // DIFFERENT host session ids for it — refused rather than guessed at, per the same rule
  // `transcript-occupancy-extraction` applies to an ambiguous parent window.
  const ambiguousPath = path.join(dir, "ambiguous.jsonl");
  writeFile(ambiguousPath, [
    transcriptLine({ cwd: worktreeCwd, sessionId: "host-x", timestamp: "2026-05-01T12:00:00.000Z" }),
    transcriptLine({ cwd: worktreeCwd, sessionId: "host-y", timestamp: "2026-05-01T12:00:01.000Z" }),
  ]);

  // A SUBAGENT transcript, at the real on-disk depth (`<project>/<window>/subagents/`) and inside
  // the same worktree. Every line is a sidechain line stamped with the PARENT's session id —
  // exactly what the host writes — so admitting it as a window would mint a second entry bearing
  // "host-later", an id w1-later.jsonl already claims, and turn one window into two.
  const subagentPath = path.join(dir, "sub", "host-later", "subagents", "agent-a1.jsonl");
  writeFile(subagentPath, [
    transcriptLine({
      cwd: `${worktreeCwd}/packages/baz`,
      sessionId: "host-later",
      timestamp: "2026-05-02T02:00:00.000Z",
      isSidechain: true,
    }),
    transcriptLine({
      cwd: worktreeCwd,
      sessionId: "host-later",
      timestamp: "2026-05-02T02:00:01.000Z",
      isSidechain: true,
    }),
  ]);

  const result = correlateTranscripts("multi-session", { dir });

  assert.equal(result.sessionId, "multi-session");
  // All four files were considered — the ambiguous one and the subagent one contribute no window,
  // but both are reached and both count toward the denominator.
  assert.equal(result.scannedFiles, 4);
  assert.equal(result.windows.length, 2);

  // The subagent transcript is reached and counted, never promoted to a window of its own.
  assert.equal(result.sidechainFiles, 1);
  assert.equal(
    result.windows.filter((w) => w.windowId === "host-later").length,
    1,
    "a subagent transcript must not mint a second window bearing its parent's id",
  );
  assert.ok(
    result.windows.every((w) => w.file !== subagentPath),
    "a subagent transcript must never surface as a window",
  );

  const [first, second] = result.windows;
  assert.equal(first?.windowId, "host-earlier");
  assert.equal(first?.file, w2Path);
  assert.equal(first?.firstObservedAt, "2026-05-01T00:00:00.000Z");

  assert.equal(second?.windowId, "host-later");
  assert.equal(second?.file, w1Path);
  assert.equal(second?.firstObservedAt, "2026-05-02T00:00:00.000Z");

  assert.ok(
    result.windows.every((w) => w.windowId !== "host-x" && w.windowId !== "host-y"),
    "a window whose lines disagree about their own identity must never surface",
  );
});
