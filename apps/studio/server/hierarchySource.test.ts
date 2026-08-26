// THE SOURCE SELECTION (ADR-0445 D1, `map-freshness-arc` inc-03).
//
// What is under test is not "does the fold work" — `hierarchyLiveRead.test.ts` owns that — but the
// far smaller and more dangerous question of WHICH SOURCE ANSWERED, and whether a fallback can
// happen without anyone finding out.
//
// ADR-0302's lesson is precise: a second copy of a canonical thing drifts, and is then read INSTEAD
// of the source by something that reports health while serving the stale copy. Every case here is
// aimed at that shape.

import { describe, it, expect, beforeEach } from 'vitest';

import {
  selectHierarchy,
  announceHierarchyOrigin,
  resetHierarchyAnnouncements,
} from './hierarchySource.js';
import type { WorkHierarchySnapshot } from '@storytree/library';

function snapshot(overrides: Partial<WorkHierarchySnapshot> = {}): WorkHierarchySnapshot {
  return {
    schemaVersion: 1,
    commitSha: 'abc123',
    storiesTreeSha: 'tree456',
    generatedAt: '2026-08-26T00:00:00.000Z',
    generator: 'test',
    stories: [],
    capabilities: [],
    ...overrides,
  };
}

/** A disk walk that records whether it was reached at all. */
function trackedDisk(value = 'from-disk') {
  const state = { calls: 0 };
  return {
    state,
    disk: async (): Promise<string> => {
      state.calls += 1;
      return value;
    },
  };
}

beforeEach(() => {
  resetHierarchyAnnouncements();
});

describe('the map prefers the live hierarchy', () => {
  it('map-live-hierarchy-read-prefers-the-live-store — reads live and never touches disk when the store answers', async () => {
    const { state, disk } = trackedDisk();
    const selection = await selectHierarchy({
      live: async () => snapshot(),
      fold: () => 'from-live',
      disk,
    });

    expect(selection.origin).toBe('live');
    expect(selection.read).toBe('from-live');
    // THE POINT OF THE WHOLE INCREMENT: with a live answer in hand the disk is not consulted, so the
    // app's own commit cannot contribute a single fact to what the map draws.
    expect(state.calls).toBe(0);
  });

  it('map-live-hierarchy-read-prefers-the-live-store — carries the projection stamp, so a reader can say how current the answer is', async () => {
    const selection = await selectHierarchy({
      live: async () => snapshot({ commitSha: 'deadbeef', storiesTreeSha: 'cafef00d' }),
      fold: () => 'x',
      disk: async () => 'y',
    });

    expect(selection.stamp).toEqual({
      commitSha: 'deadbeef',
      storiesTreeSha: 'cafef00d',
      generatedAt: '2026-08-26T00:00:00.000Z',
    });
    expect(selection.fellBackBecause).toBeUndefined();
  });
});

describe('a fallback to disk is reachable but never silent', () => {
  it('map-live-hierarchy-read-falls-back-only-with-a-stated-reason — the store holds no projection', async () => {
    const { state, disk } = trackedDisk();
    const selection = await selectHierarchy({ live: async () => null, fold: () => 'live', disk });

    expect(selection.origin).toBe('disk');
    expect(selection.read).toBe('from-disk');
    expect(state.calls).toBe(1);
    expect(selection.fellBackBecause).toMatch(/holds no work-hierarchy projection/);
  });

  it('map-live-hierarchy-read-falls-back-only-with-a-stated-reason — the backend serves none at all', async () => {
    const selection = await selectHierarchy({
      live: undefined,
      fold: () => 'live',
      disk: async () => 'from-disk',
    });

    expect(selection.origin).toBe('disk');
    // The json backend and a pg store nobody has loaded are DIFFERENT failures with different
    // remedies; collapsing them into one "unavailable" would send an operator to the wrong fix.
    expect(selection.fellBackBecause).toMatch(/serves no work-hierarchy projection/);
  });

  it('map-live-hierarchy-read-falls-back-only-with-a-stated-reason — the advisory read breaks its own contract', async () => {
    const selection = await selectHierarchy({
      live: async () => {
        throw new Error('pool exploded');
      },
      fold: () => 'live',
      disk: async () => 'from-disk',
    });

    // The backend contract says this cannot happen. If it does, drawing the forest from disk and
    // saying so beats taking the whole tree down — but it must still be SAID.
    expect(selection.origin).toBe('disk');
    expect(selection.fellBackBecause).toMatch(/pool exploded/);
  });

  it('map-live-hierarchy-read-falls-back-only-with-a-stated-reason — no unexplained fallback branch exists', async () => {
    const cases = [
      await selectHierarchy({ live: undefined, fold: () => 'l', disk: async () => 'd' }),
      await selectHierarchy({ live: async () => null, fold: () => 'l', disk: async () => 'd' }),
      await selectHierarchy({
        live: async () => {
          throw new Error('boom');
        },
        fold: () => 'l',
        disk: async () => 'd',
      }),
    ];
    // Asserted over the SET rather than case by case: the risk is a future branch added without a
    // reason, and a per-case test cannot fail for a case nobody wrote yet.
    for (const c of cases) {
      expect(c.origin).toBe('disk');
      expect(c.fellBackBecause, 'a disk fallback with no stated reason').toBeTruthy();
    }
  });
});

describe('a failed read and an absent projection are never reported as one', () => {
  it('map-live-hierarchy-read-falls-back-only-with-a-stated-reason — a failed read never claims the store is empty', async () => {
    const failed = await selectHierarchy({
      live: async () => {
        throw new Error('work-hierarchy read did not complete within 12s');
      },
      fold: () => 'l',
      disk: async () => 'd',
    });
    const empty = await selectHierarchy({
      live: async () => null,
      fold: () => 'l',
      disk: async () => 'd',
    });

    // THE REGRESSION THIS PINS, found by running the real studio on 2026-08-26: the backend nulled on
    // a read that had merely lost a race with its own pool build, and the studio announced "the live
    // store holds no work-hierarchy projection yet" against a store holding 46 stories. The remedies
    // are opposite — one says run the loader, the other says look at the store — so a confident wrong
    // reason sends the reader to fix something that was never broken.
    expect(failed.fellBackBecause).not.toMatch(/holds no work-hierarchy projection/);
    expect(failed.fellBackBecause).toMatch(/did not complete within/);
    expect(empty.fellBackBecause).toMatch(/holds no work-hierarchy projection/);
    expect(failed.fellBackBecause).not.toEqual(empty.fellBackBecause);
  });

  it('map-live-hierarchy-read-announces-a-disk-fallback-once-per-reason — the two causes announce separately', async () => {
    const lines: string[] = [];
    announceHierarchyOrigin(
      await selectHierarchy({
        live: async () => {
          throw new Error('pool down');
        },
        fold: () => 'l',
        disk: async () => 'd',
      }),
      (m) => lines.push(m),
    );
    announceHierarchyOrigin(
      await selectHierarchy({ live: async () => null, fold: () => 'l', disk: async () => 'd' }),
      (m) => lines.push(m),
    );
    // Two distinct reasons, so the once-per-reason limit must NOT swallow the second.
    expect(lines).toHaveLength(2);
  });
});

describe('the fallback announcement', () => {
  it('map-live-hierarchy-read-announces-a-disk-fallback-once-per-reason — it says which way the map is now wrong', async () => {
    const lines: string[] = [];
    const selection = await selectHierarchy({
      live: async () => null,
      fold: () => 'l',
      disk: async () => 'd',
    });
    announceHierarchyOrigin(selection, (m) => lines.push(m));

    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatch(/from DISK/);
    // The consequence, in the operator's terms — an unproven-looking island is the symptom they will
    // actually see, and a line that only says "fallback" leaves them to rediscover the mechanism.
    expect(lines[0]).toMatch(/will show as unproven/);
    expect(lines[0]).toMatch(/ADR-0445/);
  });

  it('map-live-hierarchy-read-announces-a-disk-fallback-once-per-reason — silent on a live read', async () => {
    const lines: string[] = [];
    const selection = await selectHierarchy({
      live: async () => snapshot(),
      fold: () => 'l',
      disk: async () => 'd',
    });
    announceHierarchyOrigin(selection, (m) => lines.push(m));
    expect(lines).toEqual([]);
  });

  it('map-live-hierarchy-read-announces-a-disk-fallback-once-per-reason — polling cannot turn it into noise', async () => {
    const lines: string[] = [];
    const nulled = await selectHierarchy({
      live: async () => null,
      fold: () => 'l',
      disk: async () => 'd',
    });
    // `/api/tree` is polled. A line on every poll is one an operator filters out, which is how a loud
    // signal becomes a silent one — the exact failure this whole module exists to avoid.
    announceHierarchyOrigin(nulled, (m) => lines.push(m));
    announceHierarchyOrigin(nulled, (m) => lines.push(m));
    announceHierarchyOrigin(nulled, (m) => lines.push(m));
    expect(lines).toHaveLength(1);

    // A DIFFERENT reason is new information and always prints.
    const absent = await selectHierarchy({
      live: undefined,
      fold: () => 'l',
      disk: async () => 'd',
    });
    announceHierarchyOrigin(absent, (m) => lines.push(m));
    expect(lines).toHaveLength(2);
  });
});
