// The poll-payload equality helper (studio-map idle-rebuild fix, ADR-0069 / memory
// `studio-map-svg-scaling-wall`): `sameRows` lets useBuildActivity / useClaimActivity keep their
// previous array identity across a byte-identical poll, so an idle /api/activity cycle doesn't hand
// every downstream `…ByStory` memo (→ the scene) a fresh reference and force a needless rebuild.
// The equality must be EXACT (never a false "unchanged") or it would swallow a real update.

import { describe, it, expect } from 'vitest';
import { sameRows } from './buildActivity';
import type { BuildActivity, ClaimActivity, DepartedClaim } from '../types';

const build = (over: Partial<BuildActivity> = {}): BuildActivity => ({
  unitId: 'a',
  tier: 'capability',
  runId: 'r1',
  at: '2026-07-22T00:00:00.000Z',
  ...over,
});

const claim = (over: Partial<ClaimActivity> = {}): ClaimActivity => ({
  unitId: 'a',
  kind: 'claim',
  sessionId: 's1',
  branch: 'claude/x',
  intent: 'edit',
  at: '2026-07-22T00:00:00.000Z',
  ...over,
});

const departed = (over: Partial<DepartedClaim> = {}): DepartedClaim => ({
  unitId: 'a',
  sessionId: 's1',
  grade: 'work',
  ageMs: 1000,
  at: '2026-07-22T00:00:00.000Z',
  ...over,
});

describe('sameRows — byte-identical activity payloads keep their array identity', () => {
  it('the SAME reference is trivially equal (the fast path)', () => {
    const rows = [build()];
    expect(sameRows(rows, rows)).toBe(true);
  });

  it('two empty payloads are equal — the idle steady state', () => {
    expect(sameRows([], [])).toBe(true);
  });

  it('field-for-field identical rows (fresh objects) are equal — a steady in-flight build across polls', () => {
    expect(sameRows([build()], [build()])).toBe(true);
    expect(sameRows([build(), build({ runId: 'r2' })], [build(), build({ runId: 'r2' })])).toBe(true);
  });

  it('a differing length is NOT equal — a build appeared or cleared', () => {
    expect(sameRows([build()], [])).toBe(false);
    expect(sameRows([], [build()])).toBe(false);
    expect(sameRows([build()], [build(), build({ runId: 'r2' })])).toBe(false);
  });

  it('a changed field is NOT equal — the phase advanced, so the wisp band must repaint', () => {
    expect(sameRows([build({ phase: 'IMPLEMENT' })], [build({ phase: 'GATE' })])).toBe(false);
    expect(sameRows([build({ at: '2026-07-22T00:00:00.000Z' })], [build({ at: '2026-07-22T00:05:00.000Z' })])).toBe(
      false,
    );
  });

  it("a differing key SET is NOT equal — an added/removed optional field (e.g. a build's phase)", () => {
    // { …, phase } vs { … } — same length, but one carries an extra key. Exactness requires this to differ.
    expect(sameRows([build({ phase: 'GATE' })], [build()])).toBe(false);
    expect(sameRows([build()], [build({ phase: 'GATE' })])).toBe(false);
  });

  it('works across the claim wire — a steady claim set matches; a changed intent does not', () => {
    expect(sameRows([claim()], [claim()])).toBe(true);
    expect(sameRows([claim({ intent: 'edit' })], [claim({ intent: 'orchestrate' })])).toBe(false);
    // grade is optional on the wire — present-vs-absent must read as changed.
    expect(sameRows([claim({ grade: 'work' })], [claim()])).toBe(false);
  });

  it("a departure's growing ageMs never matches across polls — it correctly keeps fading", () => {
    // This is why the equality is per-field and not just length: a live departure's server-read ageMs
    // grows every poll, so the scene must keep rebuilding it (a discrete-step fade) — sameRows must
    // NOT report it unchanged.
    expect(sameRows([departed({ ageMs: 1000 })], [departed({ ageMs: 4000 })])).toBe(false);
    // …but two truly-identical departure snapshots (same ageMs) do match.
    expect(sameRows([departed({ ageMs: 1000 })], [departed({ ageMs: 1000 })])).toBe(true);
  });
});
