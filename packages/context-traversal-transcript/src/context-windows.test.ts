/**
 * The context-window fold, and the session-scoped read on top of it (`linked-session-context-arc`,
 * increments `make-the-single-window-meter-useful` / `hand-a-running-session-its-own-occupancy`).
 *
 * Every fixture writes real JSONL into a fresh temporary transcript root — never `~/.claude/projects`
 * — and reads it back through a brand-new call. The `cwd` strings are DATA standing in for a
 * host-recorded working directory: they are never resolved against the real filesystem, so a fixture
 * may mix `/` and `\` regardless of the platform the suite runs on.
 *
 * THE CASES THAT ARE NOT DECORATION, each one a measured failure this fold exists to avoid:
 *   • a `<synthetic>` tail must not read as an EMPTY window (2 of 125 windows on this machine end on
 *     one, at 437k and 429k);
 *   • an absence must never render as a ZERO — a session told "0" takes on new work;
 *   • a helper's tokens must never enter the parent's figure (ADR-0413 D2);
 *   • a window in a SIBLING worktree must never be handed back as this session's, however fresh;
 *   • and when one worktree slot has carried several windows — the ordinary case, since slots are
 *     reused — the harness's own id must pick among them rather than "newest wins".
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";

import { readContextWindows, readOwnContextWindow } from "./context-windows.js";

interface LineSpec {
  readonly requestId: string;
  readonly cwd: string;
  readonly windowId: string;
  readonly at: string;
  readonly tokens: number;
  /** Required, because `<synthetic>` versus a real model id is the distinction half these cases turn on. */
  readonly model: string;
  readonly sidechain?: boolean;
}

function assistantLine(spec: LineSpec): string {
  // Split across two of the three resident axes so the fixture exercises the sum rather than a
  // single passthrough field.
  const half = Math.floor(spec.tokens / 2);
  const line = {
    type: "assistant",
    sessionId: spec.windowId,
    cwd: spec.cwd,
    timestamp: spec.at,
    message: {
      id: spec.requestId,
      model: spec.model,
      usage: { input_tokens: spec.tokens - half, cache_read_input_tokens: half },
    },
  };
  // A parent line OMITS `isSidechain` in a real transcript rather than carrying `false`, and the
  // fixture keeps that: the reader tests `=== true`, so writing the key either way would pass while
  // describing bytes the harness never writes.
  return JSON.stringify(spec.sidechain === true ? { ...line, isSidechain: true } : line);
}

/** A fresh transcript root, removed when the process exits. Never the real one. */
function freshRoot(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "storytree-context-windows-"));
}

/** Write one window transcript at `<root>/<project>/<windowId>.jsonl`, newest-written last. */
function writeWindow(root: string, project: string, windowId: string, lines: readonly LineSpec[]): string {
  const dir = path.join(root, project);
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${windowId}.jsonl`);
  fs.writeFileSync(file, lines.map(assistantLine).join("\n") + "\n", "utf8");
  return file;
}

/** Write one helper transcript under `<root>/<project>/<windowId>/subagents/<name>.jsonl`. */
function writeHelper(root: string, project: string, windowId: string, name: string, lines: readonly LineSpec[]): string {
  const dir = path.join(root, project, windowId, "subagents");
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${name}.jsonl`);
  fs.writeFileSync(file, lines.map(assistantLine).join("\n") + "\n", "utf8");
  return file;
}

/** Force an mtime ordering the test controls, since two files written in one tick can tie. */
function touch(file: string, msAgo: number): void {
  const when = new Date(Date.now() - msAgo);
  fs.utimesSync(file, when, when);
}

const MINE = "angry-hopper-092898";
const MY_CWD = "C:/code/storytree/.claude/worktrees/angry-hopper-092898";

test("a synthetic tail does not read as an empty window, and the exclusion is reported", () => {
  const root = freshRoot();
  const win = "11111111-1111-4111-8111-111111111111";
  writeWindow(root, "proj", win, [
    { requestId: "r1", cwd: MY_CWD, windowId: win, at: "2026-08-26T01:00:00Z", tokens: 120_000, model: "claude-opus-5" },
    { requestId: "r2", cwd: MY_CWD, windowId: win, at: "2026-08-26T02:00:00Z", tokens: 437_477, model: "claude-opus-5" },
    // The harness's own line: an all-zero usage block that ENDS the file. Taking the last
    // observation verbatim reports 0 for a window that reached 437,477.
    { requestId: "r3", cwd: MY_CWD, windowId: win, at: "2026-08-26T02:00:05Z", tokens: 0, model: "<synthetic>" },
  ]);

  const read = readOwnContextWindow({ sessionId: MINE, root });

  assert.equal(read.absence, null);
  assert.equal(read.window?.residentTokens, 437_477, "the synthetic zero was taken as the window's fullness");
  assert.equal(read.window?.peakTokens, 437_477);
  assert.equal(read.window?.observationCount, 2);
  assert.equal(read.window?.syntheticObservations, 1, "the exclusion must be visible, not silent");
  assert.equal(read.band, "soft", "437k sits between ADR-0411 D3's two marks");
});

test("a window in a SIBLING worktree is never returned, however recently it was written", () => {
  const root = freshRoot();
  const mine = "22222222-2222-4222-8222-222222222222";
  const theirs = "33333333-3333-4333-8333-333333333333";
  const mineFile = writeWindow(root, "proj", mine, [
    { requestId: "a", cwd: MY_CWD, windowId: mine, at: "2026-08-26T01:00:00Z", tokens: 90_000, model: "claude-opus-5" },
  ]);
  const theirsFile = writeWindow(root, "other", theirs, [
    {
      requestId: "b",
      cwd: "C:/code/storytree/.claude/worktrees/somebody-else-11111",
      windowId: theirs,
      at: "2026-08-26T09:00:00Z",
      tokens: 480_000,
      model: "claude-opus-5",
    },
  ]);
  // The sibling's is the FRESHEST file, so an mtime-only reader would hand back its 480k.
  touch(mineFile, 60_000);
  touch(theirsFile, 1_000);

  const read = readOwnContextWindow({ sessionId: MINE, root });

  assert.equal(read.window?.windowId, mine);
  assert.equal(read.window?.residentTokens, 90_000);
  assert.equal(read.scan.correlatedWindows, 1, "only the window written inside this worktree correlates");
});

test("no correlated window is an ABSENCE naming the bound — never a zero reading", () => {
  const root = freshRoot();
  const theirs = "44444444-4444-4444-8444-444444444444";
  writeWindow(root, "other", theirs, [
    {
      requestId: "b",
      cwd: "C:/code/storytree/.claude/worktrees/somebody-else-11111",
      windowId: theirs,
      at: "2026-08-26T09:00:00Z",
      tokens: 300_000,
      model: "claude-opus-5",
    },
  ]);

  const read = readOwnContextWindow({ sessionId: MINE, root });

  assert.equal(read.window, null);
  assert.equal(read.band, null, "a band read off an absent figure would be a claim about a session");
  assert.equal(read.absence, "no-correlated-window");
  assert.equal(read.selectedBy, null);
  assert.equal(read.scan.windowFilesFound, 1);
  assert.equal(read.scan.correlatedWindows, 0);
  assert.ok(read.scan.candidateLimit > 0, "the bound must be reportable so an absence can say how far it looked");
  assert.equal(read.scan.root, root);
});

test("an empty transcript root is its OWN absence, distinct from 'none of them was yours'", () => {
  const read = readOwnContextWindow({ sessionId: MINE, root: freshRoot() });

  assert.equal(read.window, null);
  assert.equal(read.absence, "no-transcript-root");
  assert.equal(read.scan.windowFilesFound, 0);
});

test("a correlated window whose only readings are synthetic reports no-readable-occupancy, not 0", () => {
  const root = freshRoot();
  const win = "55555555-5555-4555-8555-555555555555";
  writeWindow(root, "proj", win, [
    { requestId: "r1", cwd: MY_CWD, windowId: win, at: "2026-08-26T01:00:00Z", tokens: 0, model: "<synthetic>" },
  ]);

  const read = readOwnContextWindow({ sessionId: MINE, root });

  assert.equal(read.window, null, "a zero here would tell a session it has a whole window free");
  assert.equal(read.absence, "no-readable-occupancy");
  assert.equal(read.scan.correlatedWindows, 1, "it WAS reached — that is what makes this a different absence");
});

test("the harness's window id picks among the windows a REUSED worktree slot has carried", () => {
  const root = freshRoot();
  const older = "66666666-6666-4666-8666-666666666666";
  const newer = "77777777-7777-4777-8777-777777777777";
  writeWindow(root, "proj", older, [
    { requestId: "a", cwd: MY_CWD, windowId: older, at: "2026-08-26T01:00:00Z", tokens: 410_000, model: "claude-opus-5" },
  ]);
  writeWindow(root, "proj", newer, [
    { requestId: "b", cwd: MY_CWD, windowId: newer, at: "2026-08-26T09:00:00Z", tokens: 120_000, model: "claude-opus-5" },
  ]);

  // Both correlate by cwd — the slot held both — so the cwd rule alone cannot single one out.
  const hinted = readOwnContextWindow({ sessionId: MINE, root, harnessWindowId: older });
  assert.equal(hinted.window?.windowId, older);
  assert.equal(hinted.selectedBy, "harness-window-id");
  assert.equal(hinted.harnessWindowUnmatched, false);
  assert.equal(hinted.band, "soft");

  // Without the hint the most recently ACTIVE correlated window is taken, and the result says so
  // rather than presenting the pick as confirmed.
  const unhinted = readOwnContextWindow({ sessionId: MINE, root });
  assert.equal(unhinted.window?.windowId, newer);
  assert.equal(unhinted.selectedBy, "latest-activity");
  assert.equal(unhinted.band, "calm");
});

test("a harness id the scan did not reach falls back, and SAYS the identity is unconfirmed", () => {
  const root = freshRoot();
  const win = "88888888-8888-4888-8888-888888888888";
  writeWindow(root, "proj", win, [
    { requestId: "a", cwd: MY_CWD, windowId: win, at: "2026-08-26T01:00:00Z", tokens: 90_000, model: "claude-opus-5" },
  ]);

  const read = readOwnContextWindow({ sessionId: MINE, root, harnessWindowId: "not-a-window-this-scan-saw" });

  assert.equal(read.window?.windowId, win, "a correlated window is still the best available answer");
  assert.equal(read.selectedBy, "latest-activity");
  assert.equal(read.harnessWindowUnmatched, true, "the one shape that could hand back a sibling's number is reported");
});

test("helper tokens never enter the session's own figure (ADR-0413 D2)", () => {
  const root = freshRoot();
  const win = "99999999-9999-4999-8999-999999999999";
  writeWindow(root, "proj", win, [
    { requestId: "a", cwd: MY_CWD, windowId: win, at: "2026-08-26T01:00:00Z", tokens: 100_000, model: "claude-opus-5" },
    // A helper's line inside the parent's own file: sidechain, and stamped with the PARENT's id.
    {
      requestId: "h",
      cwd: MY_CWD,
      windowId: win,
      at: "2026-08-26T01:30:00Z",
      tokens: 350_000,
      model: "claude-opus-5",
      sidechain: true,
    },
  ]);
  writeHelper(root, "proj", win, "helper-1", [
    {
      requestId: "h2",
      cwd: MY_CWD,
      windowId: win,
      at: "2026-08-26T01:40:00Z",
      tokens: 300_000,
      model: "claude-opus-5",
      sidechain: true,
    },
  ]);

  const read = readOwnContextWindow({ sessionId: MINE, root });

  assert.equal(read.window?.residentTokens, 100_000, "a helper's 350k was summed into the session's own window");
  assert.equal(read.window?.peakTokens, 100_000);
  assert.equal(read.window?.observationCount, 1);
  assert.equal(read.band, "calm", "the whole point: a fan-out session's own number stays small, and that is correct");
});

test("the candidate bound is honoured and reported, so an unreached window is an absence not a lie", () => {
  const root = freshRoot();
  const mine = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const mineFile = writeWindow(root, "proj", mine, [
    { requestId: "a", cwd: MY_CWD, windowId: mine, at: "2026-08-26T01:00:00Z", tokens: 90_000, model: "claude-opus-5" },
  ]);
  const decoy = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
  const decoyFile = writeWindow(root, "other", decoy, [
    {
      requestId: "b",
      cwd: "C:/code/storytree/.claude/worktrees/somebody-else-11111",
      windowId: decoy,
      at: "2026-08-26T09:00:00Z",
      tokens: 10_000,
      model: "claude-opus-5",
    },
  ]);
  touch(mineFile, 60_000);
  touch(decoyFile, 1_000);

  const read = readOwnContextWindow({ sessionId: MINE, root, candidateLimit: 1 });

  assert.equal(read.window, null);
  assert.equal(read.absence, "no-correlated-window");
  assert.equal(read.scan.windowFilesRead, 1);
  assert.equal(read.scan.windowFilesFound, 2);
  assert.equal(read.scan.candidateLimit, 1);
});

test("readContextWindows still folds the machine-wide list, helpers beside the parent and never inside", () => {
  const root = freshRoot();
  const win = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
  writeWindow(root, "proj", win, [
    { requestId: "a", cwd: MY_CWD, windowId: win, at: "2026-08-26T01:00:00Z", tokens: 200_000, model: "claude-opus-5" },
    { requestId: "z", cwd: MY_CWD, windowId: win, at: "2026-08-26T01:00:09Z", tokens: 0, model: "<synthetic>" },
  ]);
  writeHelper(root, "proj", win, "helper-1", [
    {
      requestId: "h",
      cwd: MY_CWD,
      windowId: win,
      at: "2026-08-26T01:20:00Z",
      tokens: 300_000,
      model: "claude-opus-5",
      sidechain: true,
    },
  ]);

  const wire = readContextWindows(root);

  assert.equal(wire.windows.length, 1);
  const only = wire.windows[0];
  assert.equal(only?.residentTokens, 200_000);
  assert.equal(only?.syntheticObservations, 1);
  assert.equal(only?.helpersJoined, true);
  assert.deepEqual(
    only?.helpers.map((helper) => helper.peakTokens),
    [300_000],
    "a helper's own reading rides beside the parent",
  );
  assert.equal(wire.scan.root, root);
  assert.equal(wire.scan.windowFilesFound, 1, "the helper file is not counted as a session window");
  assert.equal(wire.scan.helperFilesOnMachine, 1);
});
