// Red-green of the claim BANDS (ADR-0535 D1) — the pure layer that decides what a surface says
// about a claim whose holder has gone quiet. Node environment: no jsdom, no fetch, no clock (every
// input is a server-stamped age), so nothing here can pass on Tuesday and fail on Wednesday.
//
// THE LOAD-BEARING ASSERTION IS A REFUSAL, not a happy path: this module must never decide
// staleness. The `live`/`unknown` line is the server's `stale` flag read verbatim, and the test
// below proves the two can be pointed in opposite directions and the flag still wins — because a
// browser that re-derived liveness from an age would be a SECOND read of one table, which is the
// exact fault ADR-0535 was written to repair.

import { describe, it, expect } from 'vitest';
import {
  claimBand,
  formatLastHeard,
  partitionClaimGroups,
  CLAIM_ABANDONED_DISPLAY_MS,
} from './claimBands';
import type { SessionClaimEntry, SessionClaimGroup } from '../types';

const HOUR = 60 * 60 * 1_000;

const entry = (over: Partial<SessionClaimEntry> & { unitId: string }): SessionClaimEntry => ({
  grade: 'work',
  intent: 'orchestrate',
  ageMs: HOUR,
  claimedAt: '2026-09-07T00:00:00.000Z',
  stale: false,
  heartbeatAgeMs: 0,
  ...over,
});

const group = (sessionId: string, ...claims: SessionClaimEntry[]): SessionClaimGroup => ({
  sessionId,
  branch: `claude/${sessionId}`,
  stale: claims.every((c) => c.stale),
  claims,
});

describe('claimBand — three bands, and only ONE of the two lines is drawn here', () => {
  it('reads the SERVER’s `stale` flag for live-versus-unknown, never the age', () => {
    // Point the flag and the age in opposite directions. The flag wins BOTH ways, which is what
    // proves nothing here re-derives staleness: the store enforces one `isReclaimable` predicate in
    // SQL and `groupClaimsBySession` stamps it on the row, and this module reads that verdict.
    // A client with its own copy of the threshold is how the browser and the command line came to
    // give different answers about the same row in the first place.
    expect(claimBand(entry({ unitId: 'a', stale: false, heartbeatAgeMs: 9 * HOUR }))).toBe('live');
    expect(claimBand(entry({ unitId: 'b', stale: true, heartbeatAgeMs: 0 }))).toBe('unknown');
  });

  it('splits unknown from abandoned INSIDE the stale set, at the display-only threshold', () => {
    const at = (heartbeatAgeMs: number) => claimBand(entry({ unitId: 'a', stale: true, heartbeatAgeMs }));
    expect(at(CLAIM_ABANDONED_DISPLAY_MS - 1)).toBe('unknown');
    expect(at(CLAIM_ABANDONED_DISPLAY_MS)).toBe('abandoned');
    expect(at(CLAIM_ABANDONED_DISPLAY_MS * 20)).toBe('abandoned');
  });

  it('the display threshold is far above the reclaim window, and generously so', () => {
    // ⚠ THE TWO MISTAKES THIS LINE CAN MAKE ARE NOT SYMMETRIC. Too low and a live-but-quiet session
    // drops off the arc, the lane reads `quiet`, and we have rebuilt the incident. Too high and a
    // corpse lingers as `unknown`, which is untidy and still honest. So the number is pinned at a
    // value that could not be mistaken for a session's working life — and pinned HERE so that
    // "tighten it a bit" is a deliberate edit against this comment rather than a quiet tune.
    expect(CLAIM_ABANDONED_DISPLAY_MS).toBe(48 * HOUR);
    // …and it is NOT the reclaim window (2 h). This module owns no staleness rule and must not grow
    // one: the takeover rule that lets a live session reclaim a dead holder is untouched by all of
    // this, and widening it to buy display honesty would let three-week-old corpses fence live work.
    expect(CLAIM_ABANDONED_DISPLAY_MS).toBeGreaterThan(2 * HOUR * 10);
  });
});

describe('partitionClaimGroups — what a reader is shown, and what is filed under tidy-up', () => {
  it('splits at CLAIM grain and regroups — a live row is never buried under a session’s corpse', () => {
    // One session, two rows: one it is actively working, one it took days ago and forgot. Bucketing
    // the whole GROUP by its worst row would hide a live claim; by its best row would promote a
    // corpse onto the board. Both directions are the same over-claim the bands exist to remove.
    const mixed = group(
      's1',
      entry({ unitId: 'live-one' }),
      entry({ unitId: 'corpse', stale: true, heartbeatAgeMs: CLAIM_ABANDONED_DISPLAY_MS + HOUR }),
    );
    const { board, tidyUp } = partitionClaimGroups([mixed]);
    expect(board?.map((g) => g.claims.map((c) => c.unitId))).toEqual([['live-one']]);
    expect(tidyUp?.map((g) => g.claims.map((c) => c.unitId))).toEqual([['corpse']]);
    // The session identity rides into both halves — a tidy-up row still says whose it was.
    expect(tidyUp?.[0]?.sessionId).toBe('s1');
    expect(tidyUp?.[0]?.branch).toBe('claude/s1');
  });

  it('keeps `unknown` ON the board — it is the state the whole decision exists to show', () => {
    // The tempting shortcut ADR-0535 D4 names by name is "hide the old rows", which makes the
    // picture tidy without making it truer. Only the plainly-abandoned band folds away; a claim we
    // simply have not heard from stays in front of the reader.
    const dark = group('s1', entry({ unitId: 'dark', stale: true, heartbeatAgeMs: 9 * HOUR }));
    const { board, tidyUp } = partitionClaimGroups([dark]);
    expect(board?.[0]?.claims.map((c) => c.unitId)).toEqual(['dark']);
    expect(tidyUp).toEqual([]);
  });

  it('drops groups left empty rather than rendering a session with no rows', () => {
    const corpse = group('dead', entry({ unitId: 'x', stale: true, heartbeatAgeMs: 400 * HOUR }));
    const { board, tidyUp } = partitionClaimGroups([corpse, group('alive', entry({ unitId: 'y' }))]);
    expect(board?.map((g) => g.sessionId)).toEqual(['alive']);
    expect(tidyUp?.map((g) => g.sessionId)).toEqual(['dead']);
  });

  it('a null ledger stays NULL in both halves — "no ledger here" is not "nobody working"', () => {
    // Collapsing the advisory absence to `[]` would make a down database look like an idle factory,
    // which is the same class of lie as the dropped rows: a surface asserting an answer it does not
    // have. The dock renders two different sentences off exactly this distinction.
    expect(partitionClaimGroups(null)).toEqual({ board: null, tidyUp: null });
    expect(partitionClaimGroups([])).toEqual({ board: [], tidyUp: [] });
  });
});

describe('formatLastHeard — the age an `unknown` is required to carry', () => {
  it('reads in minutes, then hours, then days', () => {
    expect(formatLastHeard(0)).toBe('0m');
    expect(formatLastHeard(59 * 60_000)).toBe('59m');
    // Exactly on the hour crosses — `60m` and `1h` are the same fact, and printing the first would
    // mean the minute branch runs one tick past where the hour branch is meant to take over.
    expect(formatLastHeard(HOUR)).toBe('1h');
    expect(formatLastHeard(3 * HOUR)).toBe('3h');
    expect(formatLastHeard(47 * HOUR)).toBe('47h');
    // Days start where the tidy-up band does, so the fold never prints `1219h` at a reader.
    expect(formatLastHeard(48 * HOUR)).toBe('2d');
    expect(formatLastHeard(306 * HOUR)).toBe('12d');
  });

  it('clamps nonsense to `0m` rather than rendering NaN on the honesty surface', () => {
    // The age is stamped by the server and read by a browser whose clock may disagree. A negative
    // skew must not print `NaNm` on the one surface whose job is to be straight about what it does
    // not know — that reads as a bug, and a reader who distrusts the panel is back where we started.
    expect(formatLastHeard(-5_000)).toBe('0m');
    expect(formatLastHeard(Number.NaN)).toBe('0m');
    expect(formatLastHeard(Number.POSITIVE_INFINITY)).toBe('0m');
  });
});
