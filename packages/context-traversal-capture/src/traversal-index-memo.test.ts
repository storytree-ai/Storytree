// The trace index, answered incrementally (`traversal-panel-arc`, increment
// `traversal-panel-index-read`; MOVED here from `apps/studio/server/traversalIndexMemo.test.ts` with
// its subject by increment `desktop-serves-the-traversal-routes`, and ported from vitest to this
// package's `node:test` idiom).
//
// THREE THINGS HAVE TO BE TRUE AT ONCE, and the third is new with the move:
//
//   1. PARITY — the incremental answer is the sink's `listTraversalSessions` answer, exactly. That
//      is asserted by deep-comparing against the REAL function over the SAME directory rather than
//      against a re-derived expectation, so if the sink's shape, ordering or zero-event omission
//      ever changes, this reds instead of the panel and `storytree traversal list` quietly
//      disagreeing.
//   2. FRESHNESS — a trace appended to AFTER the index was built is still seen. Every fixture is
//      written through the sink's own `appendTraversalEvents`, which is how a real trace grows, so
//      the staleness case under test is the one that actually happens on this machine (a live
//      session appending while the operator has the panel open).
//   3. THE DEFAULT PATH IS THE ONE THE ROUTES USE. Both surfaces call
//      `listTraversalSessionsIncremental(dir)` with NO summarizer, so a suite that only ever injects
//      one would prove the shipped call path is correct by assumption. The parity cases below drive
//      the default; only the read-COUNTING cases inject, because counting reads is the one thing the
//      default cannot report on.
//
// ⚠ The old copy of this file supplied a HAND-MIRRORED summarizer — a second transcription of
// `listTraversalSessions`'s per-file fold, held to it only by these deep-equality assertions. That
// mirror is gone: the fold is `summarizeTraversalSession` in `sink.ts`, called by BOTH the sink's
// own list and this index, so a field added to `TraversalSessionSummary` can no longer reach one
// answer and miss the other. The parity assertions stay as a fence over the ORDERING and the
// zero-event omission, which structure does not give for free.

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, test } from "node:test";

import {
  appendTraversalEvents,
  listTraversalSessions,
  summarizeTraversalSession,
  type TraversalSessionSummary,
} from "./sink.js";
import {
  listTraversalSessionsIncremental,
  resetTraversalIndexMemo,
  type SummarizeTraversalSession,
} from "./traversal-index-memo.js";

const dirs: string[] = [];

function freshDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "traversal-index-"));
  dirs.push(dir);
  return dir;
}

interface CountingResult {
  summarize: SummarizeTraversalSession;
  reads: string[];
}

/** Wraps the sink's REAL summarizer and records which sessions it actually read. */
function counting(): CountingResult {
  const reads: string[] = [];
  return {
    reads,
    summarize: (dir, sessionId): TraversalSessionSummary | null => {
      reads.push(sessionId);
      return summarizeTraversalSession(dir, sessionId);
    },
  };
}

let visit = 0;
/** Append one real visit event through the sink — how a trace genuinely grows. */
function appendVisit(dir: string, sessionId: string, at: string): void {
  visit += 1;
  const ok = appendTraversalEvents(
    [
      {
        kind: "front_matter_read",
        eventId: `event:visit-${visit}`,
        sessionId,
        visitId: `visit-${visit}`,
        nodeId: "node-a",
        surfaceId: "tree",
        at,
      },
    ],
    { dir, sessionId },
  );
  assert.equal(ok, true);
}

/**
 * Force the file's mtime to differ from whatever the index recorded. Appending already changes the
 * SIZE, which is the signal that carries an append-only trace — this exists only so a test can prove
 * the mtime half independently, on a rewrite that happens to land the same byte count.
 */
function bumpMtime(dir: string, sessionId: string): void {
  const file = path.join(dir, `${sessionId}.jsonl`);
  const later = new Date(Date.now() + 60_000);
  fs.utimesSync(file, later, later);
}

beforeEach(() => {
  resetTraversalIndexMemo();
});

afterEach(() => {
  for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

// ---------- 1. the incremental index answers exactly what the sink answers ----------

test("traversal index: deep-equals listTraversalSessions on a populated dir, cold and warm", () => {
  const dir = freshDir();
  appendVisit(dir, "session-a", "2026-08-12T10:00:00.000Z");
  appendVisit(dir, "session-a", "2026-08-12T10:00:05.000Z");
  appendVisit(dir, "session-b", "2026-08-12T11:00:00.000Z");

  const expected = listTraversalSessions({ dir });
  assert.equal(expected.length, 2);

  // COLD (nothing cached) and WARM (everything cached) must both equal the sink — a cache that is
  // only right on its first answer is the failure mode this pairing exists to catch. Driven through
  // the DEFAULT summarizer, which is the call both routes make.
  assert.deepEqual(listTraversalSessionsIncremental(dir), expected);
  assert.deepEqual(listTraversalSessionsIncremental(dir), expected);
});

test("traversal index: omits a session that replays to zero usable events, and does not re-read it either", () => {
  const dir = freshDir();
  appendVisit(dir, "session-real", "2026-08-12T10:00:00.000Z");
  // Every line garbage: the tolerant reader skips all of them, so the sink omits the session.
  fs.writeFileSync(path.join(dir, "session-garbage.jsonl"), "not json at all\n", "utf8");

  const expected = listTraversalSessions({ dir });
  assert.deepEqual(
    expected.map((s) => s.sessionId),
    ["session-real"],
  );

  const { summarize, reads } = counting();
  assert.deepEqual(listTraversalSessionsIncremental(dir, summarize), expected);
  assert.deepEqual([...reads].sort(), ["session-garbage", "session-real"]);

  reads.length = 0;
  assert.deepEqual(listTraversalSessionsIncremental(dir, summarize), expected);
  // The dead file is cached as dead, so a directory full of unreadable traces stops costing
  // anything on the second request too.
  assert.deepEqual(reads, []);
});

test("traversal index: answers an absent directory as an empty list, like the sink", () => {
  const missing = path.join(os.tmpdir(), "traversal-index-does-not-exist-12345");
  assert.deepEqual(listTraversalSessionsIncremental(missing), []);
  assert.deepEqual(listTraversalSessions({ dir: missing }), []);
});

test("traversal index: ignores non-.jsonl entries", () => {
  const dir = freshDir();
  appendVisit(dir, "session-a", "2026-08-12T10:00:00.000Z");
  fs.writeFileSync(path.join(dir, "README.txt"), "not a trace", "utf8");
  fs.mkdirSync(path.join(dir, "nested"));

  assert.deepEqual(listTraversalSessionsIncremental(dir), listTraversalSessions({ dir }));
});

// ---------- 2. the index re-reads only what changed ----------

test("traversal index: re-reads nothing when no trace moved", () => {
  const dir = freshDir();
  appendVisit(dir, "session-a", "2026-08-12T10:00:00.000Z");
  appendVisit(dir, "session-b", "2026-08-12T10:00:01.000Z");

  const { summarize, reads } = counting();
  listTraversalSessionsIncremental(dir, summarize);
  assert.deepEqual([...reads].sort(), ["session-a", "session-b"]);

  reads.length = 0;
  listTraversalSessionsIncremental(dir, summarize);
  assert.deepEqual(reads, []);
});

test("traversal index: re-reads ONLY the appended trace, and reports its new content", () => {
  const dir = freshDir();
  appendVisit(dir, "session-quiet", "2026-08-12T10:00:00.000Z");
  appendVisit(dir, "session-live", "2026-08-12T10:00:01.000Z");

  const { summarize, reads } = counting();
  const before = listTraversalSessionsIncremental(dir, summarize);
  assert.equal(before.find((s) => s.sessionId === "session-live")?.eventCount, 1);

  // THE STALENESS CASE: a live session appends while the index is already built.
  appendVisit(dir, "session-live", "2026-08-12T12:00:00.000Z");

  reads.length = 0;
  const after = listTraversalSessionsIncremental(dir, summarize);

  assert.deepEqual(reads, ["session-live"]);
  const live = after.find((s) => s.sessionId === "session-live");
  assert.equal(live?.eventCount, 2);
  assert.equal(live?.lastObservedAt, "2026-08-12T12:00:00.000Z");
  // …and it still equals the sink's own answer after the append.
  assert.deepEqual(after, listTraversalSessions({ dir }));
});

test("traversal index: re-reads a trace whose mtime moved even when its size did not", () => {
  const dir = freshDir();
  appendVisit(dir, "session-a", "2026-08-12T10:00:00.000Z");

  const { summarize, reads } = counting();
  listTraversalSessionsIncremental(dir, summarize);
  reads.length = 0;

  bumpMtime(dir, "session-a");
  listTraversalSessionsIncremental(dir, summarize);
  assert.deepEqual(reads, ["session-a"]);
});

test("traversal index: picks up a trace file that appears after the index was built", () => {
  const dir = freshDir();
  appendVisit(dir, "session-a", "2026-08-12T10:00:00.000Z");

  const { summarize, reads } = counting();
  listTraversalSessionsIncremental(dir, summarize);

  appendVisit(dir, "session-new", "2026-08-12T10:30:00.000Z");

  reads.length = 0;
  const after = listTraversalSessionsIncremental(dir, summarize);
  assert.deepEqual(reads, ["session-new"]);
  assert.deepEqual(
    after.map((s) => s.sessionId).sort(),
    ["session-a", "session-new"],
  );
  assert.deepEqual(after, listTraversalSessions({ dir }));
});

test("traversal index: drops a trace file that was removed, without an eviction pass", () => {
  const dir = freshDir();
  appendVisit(dir, "session-a", "2026-08-12T10:00:00.000Z");
  appendVisit(dir, "session-gone", "2026-08-12T10:00:01.000Z");
  listTraversalSessionsIncremental(dir);

  fs.rmSync(path.join(dir, "session-gone.jsonl"));

  const after = listTraversalSessionsIncremental(dir);
  assert.deepEqual(
    after.map((s) => s.sessionId),
    ["session-a"],
  );
  assert.deepEqual(after, listTraversalSessions({ dir }));
});

test("traversal index: keeps one index per directory — two trace dirs never serve each other's answer", () => {
  const a = freshDir();
  const b = freshDir();
  appendVisit(a, "session-in-a", "2026-08-12T10:00:00.000Z");
  appendVisit(b, "session-in-b", "2026-08-12T10:00:00.000Z");

  assert.deepEqual(
    listTraversalSessionsIncremental(a).map((s) => s.sessionId),
    ["session-in-a"],
  );
  assert.deepEqual(
    listTraversalSessionsIncremental(b).map((s) => s.sessionId),
    ["session-in-b"],
  );
  // …and back again, from cache this time.
  assert.deepEqual(
    listTraversalSessionsIncremental(a).map((s) => s.sessionId),
    ["session-in-a"],
  );
});

test("traversal index: forgets a directory that has become unreadable, and rebuilds when it returns", () => {
  const dir = freshDir();
  appendVisit(dir, "session-a", "2026-08-12T10:00:00.000Z");

  const { summarize, reads } = counting();
  listTraversalSessionsIncremental(dir, summarize);

  fs.rmSync(dir, { recursive: true, force: true });
  assert.deepEqual(listTraversalSessionsIncremental(dir, summarize), []);

  fs.mkdirSync(dir, { recursive: true });
  appendVisit(dir, "session-a", "2026-08-12T10:00:00.000Z");
  reads.length = 0;
  // Nothing may be reused across the gap: the file that came back is a different file.
  assert.deepEqual(listTraversalSessionsIncremental(dir, summarize), listTraversalSessions({ dir }));
  assert.deepEqual(reads, ["session-a"]);
});

// ---------- 3. the memo's own machinery, driven rather than assumed ----------

test("traversal index: resetTraversalIndexMemo actually forces a re-read", () => {
  // The reset exists so a suite sharing module state can start clean. Nothing asserted that it did
  // anything — a no-op reset would leave every later case reading a previous case's index, which is
  // a suite that agrees with itself rather than with the sink.
  const dir = freshDir();
  appendVisit(dir, "session-a", "2026-08-12T10:00:00.000Z");

  const { summarize, reads } = counting();
  listTraversalSessionsIncremental(dir, summarize);
  assert.deepEqual(reads, ["session-a"]);

  reads.length = 0;
  listTraversalSessionsIncremental(dir, summarize);
  assert.deepEqual(reads, [], "warm: nothing re-read");

  resetTraversalIndexMemo();
  reads.length = 0;
  listTraversalSessionsIncremental(dir, summarize);
  assert.deepEqual(reads, ["session-a"], "after a reset the index is cold again");
});

test("traversal index: a non-.jsonl entry is never summarized, not merely omitted from the answer", () => {
  // Omitting it from the ANSWER and never READING it are different properties, and only the second
  // is what keeps a directory of unrelated files free.
  const dir = freshDir();
  appendVisit(dir, "session-a", "2026-08-12T10:00:00.000Z");
  fs.writeFileSync(path.join(dir, "notes.md"), "not a trace", "utf8");
  fs.writeFileSync(path.join(dir, "session-b.jsonl.bak"), "not a trace", "utf8");

  const { summarize, reads } = counting();
  listTraversalSessionsIncremental(dir, summarize);
  assert.deepEqual(reads, ["session-a"]);
});

test("traversal index: a trace whose SIZE moved is re-read even at an unchanged mtime", () => {
  // The pair is (mtime, size) and both halves must be live. Appending changes both, so a suite that
  // only ever appends proves the mtime half and leaves the size half unexercised.
  const dir = freshDir();
  appendVisit(dir, "session-a", "2026-08-12T10:00:00.000Z");

  const { summarize, reads } = counting();
  listTraversalSessionsIncremental(dir, summarize);

  const file = path.join(dir, "session-a.jsonl");
  const before = fs.statSync(file);
  appendVisit(dir, "session-a", "2026-08-12T10:00:01.000Z");
  // Put the mtime back exactly where it was, so ONLY the size differs. Restored from `mtimeMs`
  // rather than from the `Date`, because the index compares `mtimeMs` and a Date round-trip can lose
  // the sub-millisecond part — which would leave the mtime differing too and let this case pass
  // without ever exercising the size half.
  fs.utimesSync(file, before.atimeMs / 1000, before.mtimeMs / 1000);
  const restored = fs.statSync(file);
  assert.equal(restored.mtimeMs, before.mtimeMs, "the mtime must be identical for this to be a SIZE test");
  assert.notEqual(restored.size, before.size);

  reads.length = 0;
  const after = listTraversalSessionsIncremental(dir, summarize);
  assert.deepEqual(reads, ["session-a"], "a size change alone must invalidate the entry");
  assert.equal(after.find((s) => s.sessionId === "session-a")?.eventCount, 2);
});

test("traversal index: a CACHED entry is served verbatim, not re-derived", () => {
  const dir = freshDir();
  appendVisit(dir, "session-a", "2026-08-12T10:00:00.000Z");
  const first = listTraversalSessionsIncremental(dir);
  const second = listTraversalSessionsIncremental(dir);
  assert.deepEqual(second, first);
  assert.deepEqual(second, listTraversalSessions({ dir }));
});
