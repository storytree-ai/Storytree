// Stage-1 red-green of the in-flight-build ROW MAPPING (ADR-0048 §3 v2): the pure
// rows → BuildActivity[] fold the pg backend's inFlightBuilds() applies after its
// `WITH latest_building … DISTINCT ON (unit_id) … ORDER BY seq DESC` query. The
// LIVE SQL needs a DB (covered by the activityApi integration test + the operator-
// attested deep-link); the TTL filter + the phase surfacing are pure and pinned
// here. The phase is the LATEST `building` row's phase (the query already takes the
// newest per unit), so the wisp colours by the live red→green phase.

import { describe, it, expect } from 'vitest';
import { rowsToBuildActivity } from './inFlightBuilds';
import { BUILD_IN_FLIGHT_TTL_MS } from '../src/types';

const NOW = new Date('2026-06-27T12:00:00.000Z');
const fresh = new Date(NOW.getTime() - 60_000).toISOString(); // 1 min ago — in TTL

describe('rowsToBuildActivity — the in-flight-build row fold', () => {
  it('surfaces the live red-green phase from the latest building row (ADR-0048 §3 v2)', () => {
    const out = rowsToBuildActivity(
      [{ unit_id: 'studio', tier: 'capability', run_id: 'real-abc', at: fresh, phase: 'CONFIRM_RED' }],
      NOW,
    );
    expect(out).toEqual([
      { unitId: 'studio', tier: 'capability', runId: 'real-abc', at: fresh, phase: 'CONFIRM_RED' },
    ]);
  });

  it('omits phase when the latest building row carries none (back-compat with pre-ADR-0048 marks)', () => {
    const out = rowsToBuildActivity(
      [{ unit_id: 'lib', tier: 'story', run_id: 'r1', at: fresh, phase: null }],
      NOW,
    );
    expect(out).toEqual([{ unitId: 'lib', tier: 'story', runId: 'r1', at: fresh }]);
    expect('phase' in (out[0] ?? {})).toBe(false);
  });

  it('TTL-filters a dangling building row (a hard-killed run clears in minutes)', () => {
    const stale = new Date(NOW.getTime() - BUILD_IN_FLIGHT_TTL_MS - 1).toISOString();
    const out = rowsToBuildActivity(
      [
        { unit_id: 'a', tier: 'story', run_id: 'r-fresh', at: fresh, phase: 'GATE' },
        { unit_id: 'b', tier: 'story', run_id: 'r-stale', at: stale, phase: 'IMPLEMENT' },
      ],
      NOW,
    );
    expect(out.map((b) => b.unitId)).toEqual(['a']);
  });

  it('normalises a Date `at` to ISO and only surfaces a recognised gate phase', () => {
    const out = rowsToBuildActivity(
      [{ unit_id: 'c', tier: 'contract', run_id: 'r', at: new Date(fresh), phase: 'CONFIRM_GREEN' }],
      NOW,
    );
    expect(out[0]?.at).toBe(fresh);
    expect(out[0]?.phase).toBe('CONFIRM_GREEN');
  });
});
