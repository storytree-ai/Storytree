// The picker's incremental trace index (`traversal-panel-arc`, increment
// `traversal-panel-index-read`, server/traversalIndexMemo.ts).
//
// TWO THINGS HAVE TO BE TRUE AT ONCE, and the second is the one a cache usually gets wrong:
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
//
// Reads are COUNTED through the injected `summarize`, which is the only way to prove the point of
// the module: an unchanged file must not be re-read, and a changed one must be.

import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  appendTraversalEvents,
  listTraversalSessions,
  readTraversalSession,
  type TraversalSessionSummary,
} from '@storytree/context-traversal-capture';

import {
  listTraversalSessionsIncremental,
  resetTraversalIndexMemo,
  type SummarizeTraversalSession,
} from './traversalIndexMemo';

const dirs: string[] = [];

function freshDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'studio-traversal-index-'));
  dirs.push(dir);
  return dir;
}

/** The route's own per-file summary — the body of `listTraversalSessions`, which parity holds it to. */
const summarizeThroughSink: SummarizeTraversalSession = (dir, sessionId) => {
  const { replay, identity, slots } = readTraversalSession({ dir, sessionId });
  if (replay.events.length === 0) return null;
  const lastEvent = replay.events[replay.events.length - 1];
  // Every field the sink's summary carries is MIRRORED here, including the identity classification
  // and slots (`linked-session-context-arc-inc-30`) — the deep-equality assertions below are what
  // make a forgotten field a red rather than a panel that quietly disagrees with `traversal list`.
  return { sessionId, eventCount: replay.events.length, lastObservedAt: lastEvent?.at, identity, slots };
};

/** Wraps the real summarizer and records which sessions it actually read. */
interface CountingResult {
  summarize: SummarizeTraversalSession;
  reads: string[];
}

function counting(): CountingResult {
  const reads: string[] = [];
  return {
    reads,
    summarize: (dir, sessionId): TraversalSessionSummary | null => {
      reads.push(sessionId);
      return summarizeThroughSink(dir, sessionId);
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
        kind: 'front_matter_read',
        eventId: `event:visit-${visit}`,
        sessionId,
        visitId: `visit-${visit}`,
        nodeId: 'node-a',
        surfaceId: 'tree',
        at,
      },
    ],
    { dir, sessionId },
  );
  expect(ok).toBe(true);
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

afterAll(() => {
  for (const dir of dirs) fs.rmSync(dir, { recursive: true, force: true });
});

describe('the incremental trace index answers exactly what the sink answers', () => {
  it('deep-equals listTraversalSessions on a populated dir, cold and warm', () => {
    const dir = freshDir();
    appendVisit(dir, 'session-a', '2026-08-12T10:00:00.000Z');
    appendVisit(dir, 'session-a', '2026-08-12T10:00:05.000Z');
    appendVisit(dir, 'session-b', '2026-08-12T11:00:00.000Z');

    const expected = listTraversalSessions({ dir });
    expect(expected.length).toBe(2);

    // COLD (nothing cached) and WARM (everything cached) must both equal the sink — a cache that is
    // only right on its first answer is the failure mode this pairing exists to catch.
    expect(listTraversalSessionsIncremental(dir, summarizeThroughSink)).toEqual(expected);
    expect(listTraversalSessionsIncremental(dir, summarizeThroughSink)).toEqual(expected);
  });

  it('omits a session that replays to zero usable events, and does not re-read it either', () => {
    const dir = freshDir();
    appendVisit(dir, 'session-real', '2026-08-12T10:00:00.000Z');
    // Every line garbage: the tolerant reader skips all of them, so the sink omits the session.
    fs.writeFileSync(path.join(dir, 'session-garbage.jsonl'), 'not json at all\n', 'utf8');

    const expected = listTraversalSessions({ dir });
    expect(expected.map((s) => s.sessionId)).toEqual(['session-real']);

    const { summarize, reads } = counting();
    expect(listTraversalSessionsIncremental(dir, summarize)).toEqual(expected);
    expect(reads).toEqual(['session-garbage', 'session-real'].sort((a, b) => (a < b ? -1 : 1)));

    reads.length = 0;
    expect(listTraversalSessionsIncremental(dir, summarize)).toEqual(expected);
    // The dead file is cached as dead, so a directory full of unreadable traces stops costing
    // anything on the second request too.
    expect(reads).toEqual([]);
  });

  it('answers an absent directory as an empty list, like the sink', () => {
    const missing = path.join(os.tmpdir(), 'studio-traversal-index-does-not-exist-12345');
    expect(listTraversalSessionsIncremental(missing, summarizeThroughSink)).toEqual([]);
    expect(listTraversalSessions({ dir: missing })).toEqual([]);
  });

  it('ignores non-.jsonl entries', () => {
    const dir = freshDir();
    appendVisit(dir, 'session-a', '2026-08-12T10:00:00.000Z');
    fs.writeFileSync(path.join(dir, 'README.txt'), 'not a trace', 'utf8');
    fs.mkdirSync(path.join(dir, 'nested'));

    expect(listTraversalSessionsIncremental(dir, summarizeThroughSink)).toEqual(
      listTraversalSessions({ dir }),
    );
  });
});

describe('the index re-reads only what changed', () => {
  it('re-reads nothing when no trace moved', () => {
    const dir = freshDir();
    appendVisit(dir, 'session-a', '2026-08-12T10:00:00.000Z');
    appendVisit(dir, 'session-b', '2026-08-12T10:00:01.000Z');

    const { summarize, reads } = counting();
    listTraversalSessionsIncremental(dir, summarize);
    expect(reads.sort()).toEqual(['session-a', 'session-b']);

    reads.length = 0;
    listTraversalSessionsIncremental(dir, summarize);
    expect(reads).toEqual([]);
  });

  it('re-reads ONLY the appended trace, and reports its new content', () => {
    const dir = freshDir();
    appendVisit(dir, 'session-quiet', '2026-08-12T10:00:00.000Z');
    appendVisit(dir, 'session-live', '2026-08-12T10:00:01.000Z');

    const { summarize, reads } = counting();
    const before = listTraversalSessionsIncremental(dir, summarize);
    expect(before.find((s) => s.sessionId === 'session-live')?.eventCount).toBe(1);

    // THE STALENESS CASE: a live session appends while the index is already built.
    appendVisit(dir, 'session-live', '2026-08-12T12:00:00.000Z');

    reads.length = 0;
    const after = listTraversalSessionsIncremental(dir, summarize);

    expect(reads).toEqual(['session-live']);
    const live = after.find((s) => s.sessionId === 'session-live');
    expect(live?.eventCount).toBe(2);
    expect(live?.lastObservedAt).toBe('2026-08-12T12:00:00.000Z');
    // …and it still equals the sink's own answer after the append.
    expect(after).toEqual(listTraversalSessions({ dir }));
  });

  it('re-reads a trace whose mtime moved even when its size did not', () => {
    const dir = freshDir();
    appendVisit(dir, 'session-a', '2026-08-12T10:00:00.000Z');

    const { summarize, reads } = counting();
    listTraversalSessionsIncremental(dir, summarize);
    reads.length = 0;

    bumpMtime(dir, 'session-a');
    listTraversalSessionsIncremental(dir, summarize);
    expect(reads).toEqual(['session-a']);
  });

  it('picks up a trace file that appears after the index was built', () => {
    const dir = freshDir();
    appendVisit(dir, 'session-a', '2026-08-12T10:00:00.000Z');

    const { summarize, reads } = counting();
    listTraversalSessionsIncremental(dir, summarize);

    appendVisit(dir, 'session-new', '2026-08-12T10:30:00.000Z');

    reads.length = 0;
    const after = listTraversalSessionsIncremental(dir, summarize);
    expect(reads).toEqual(['session-new']);
    expect(after.map((s) => s.sessionId).sort()).toEqual(['session-a', 'session-new']);
    expect(after).toEqual(listTraversalSessions({ dir }));
  });

  it('drops a trace file that was removed, without an eviction pass', () => {
    const dir = freshDir();
    appendVisit(dir, 'session-a', '2026-08-12T10:00:00.000Z');
    appendVisit(dir, 'session-gone', '2026-08-12T10:00:01.000Z');
    listTraversalSessionsIncremental(dir, summarizeThroughSink);

    fs.rmSync(path.join(dir, 'session-gone.jsonl'));

    const after = listTraversalSessionsIncremental(dir, summarizeThroughSink);
    expect(after.map((s) => s.sessionId)).toEqual(['session-a']);
    expect(after).toEqual(listTraversalSessions({ dir }));
  });

  it('keeps one index per directory — two trace dirs never serve each other’s answer', () => {
    const a = freshDir();
    const b = freshDir();
    appendVisit(a, 'session-in-a', '2026-08-12T10:00:00.000Z');
    appendVisit(b, 'session-in-b', '2026-08-12T10:00:00.000Z');

    expect(listTraversalSessionsIncremental(a, summarizeThroughSink).map((s) => s.sessionId)).toEqual([
      'session-in-a',
    ]);
    expect(listTraversalSessionsIncremental(b, summarizeThroughSink).map((s) => s.sessionId)).toEqual([
      'session-in-b',
    ]);
    // …and back again, from cache this time.
    expect(listTraversalSessionsIncremental(a, summarizeThroughSink).map((s) => s.sessionId)).toEqual([
      'session-in-a',
    ]);
  });

  it('forgets a directory that has become unreadable, and rebuilds when it returns', () => {
    const dir = freshDir();
    appendVisit(dir, 'session-a', '2026-08-12T10:00:00.000Z');

    const { summarize, reads } = counting();
    listTraversalSessionsIncremental(dir, summarize);

    fs.rmSync(dir, { recursive: true, force: true });
    expect(listTraversalSessionsIncremental(dir, summarize)).toEqual([]);

    fs.mkdirSync(dir, { recursive: true });
    appendVisit(dir, 'session-a', '2026-08-12T10:00:00.000Z');
    reads.length = 0;
    // Nothing may be reused across the gap: the file that came back is a different file.
    expect(listTraversalSessionsIncremental(dir, summarize)).toEqual(listTraversalSessions({ dir }));
    expect(reads).toEqual(['session-a']);
  });
});
