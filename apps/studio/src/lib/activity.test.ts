// The recently-landed bloom helper (ADR-0045): a transient announcement off
// `verdict.at`. These pin the window edges, the pass-only v1 scope, the
// ageRatio ramp that drives opacity, and the legend's recentLandings rule.

import { describe, it, expect } from 'vitest';
import { anyInFlight, anyRecentLanding, BLOOM_WINDOW_HOURS, isBuildInFlight, verdictBloom } from './activity';
import { BUILD_IN_FLIGHT_TTL_MS, type BuildActivity, type TreeVerdict } from '../types';

const NOW = new Date('2026-06-14T12:00:00.000Z');
/** A verdict `hoursAgo` before NOW. */
const at = (hoursAgo: number): string =>
  new Date(NOW.getTime() - hoursAgo * 3_600_000).toISOString();
const pass = (hoursAgo: number): TreeVerdict => ({ outcome: 'pass', at: at(hoursAgo) });
const fail = (hoursAgo: number): TreeVerdict => ({ outcome: 'fail', at: at(hoursAgo) });

describe('verdictBloom', () => {
  it('returns null when there is no verdict', () => {
    expect(verdictBloom(undefined, NOW)).toBeNull();
  });

  it('blooms a pass inside the window, with the pass outcome', () => {
    const b = verdictBloom(pass(1), NOW);
    expect(b).not.toBeNull();
    expect(b?.outcome).toBe('pass');
  });

  it('does NOT bloom a fail in v1 (a fail withers the plant already, ADR-0045 §3)', () => {
    expect(verdictBloom(fail(1), NOW)).toBeNull();
  });

  it('window edge: just inside blooms, exactly-at and just outside do not', () => {
    expect(verdictBloom(pass(BLOOM_WINDOW_HOURS - 0.001), NOW)).not.toBeNull();
    // the edge is exclusive — a verdict exactly the window-age old no longer announces
    expect(verdictBloom(pass(BLOOM_WINDOW_HOURS), NOW)).toBeNull();
    expect(verdictBloom(pass(BLOOM_WINDOW_HOURS + 0.001), NOW)).toBeNull();
  });

  it('ageRatio ramps 1 → 0 across the window (drives opacity)', () => {
    // brand-new ≈ full brightness
    expect(verdictBloom(pass(0), NOW)?.ageRatio).toBeCloseTo(1, 5);
    // half-way through the window ≈ half brightness
    expect(verdictBloom(pass(BLOOM_WINDOW_HOURS / 2), NOW)?.ageRatio).toBeCloseTo(0.5, 5);
    // monotonic: an older bloom is dimmer than a newer one
    const young = verdictBloom(pass(1), NOW)?.ageRatio ?? 0;
    const old = verdictBloom(pass(4), NOW)?.ageRatio ?? 0;
    expect(young).toBeGreaterThan(old);
  });

  it('a future-dated verdict clamps to full brightness rather than overshooting', () => {
    expect(verdictBloom(pass(-2), NOW)?.ageRatio).toBe(1);
  });

  it('an unparseable `at` never blooms', () => {
    expect(verdictBloom({ outcome: 'pass', at: 'not-a-date' }, NOW)).toBeNull();
  });

  it('respects a custom window', () => {
    expect(verdictBloom(pass(5), NOW, 4)).toBeNull(); // outside a tighter 4 h window
    expect(verdictBloom(pass(5), NOW, 8)).not.toBeNull(); // inside a wider one
  });
});

describe('anyRecentLanding', () => {
  const unit = (verdict?: TreeVerdict): { verdict?: TreeVerdict } =>
    verdict ? { verdict } : {};

  it('true when any story OR capability carries a live bloom', () => {
    expect(anyRecentLanding([{ ...unit(pass(1)), capabilities: [] }], NOW)).toBe(true);
    expect(anyRecentLanding([{ ...unit(), capabilities: [unit(pass(2))] }], NOW)).toBe(true);
  });

  it('false when every verdict is absent, aged out, or a fail', () => {
    expect(anyRecentLanding([{ ...unit(), capabilities: [] }], NOW)).toBe(false);
    expect(
      anyRecentLanding([{ ...unit(pass(99)), capabilities: [unit(fail(1))] }], NOW),
    ).toBe(false);
  });
});

// ---------- in-flight build activity (ADR-0048) ----------

const TTL_MIN = BUILD_IN_FLIGHT_TTL_MS / 60_000;
/** A build whose `building` event landed `minsAgo` before NOW. */
const buildAt = (minsAgo: number): string =>
  new Date(NOW.getTime() - minsAgo * 60_000).toISOString();
const build = (minsAgo: number): BuildActivity => ({
  unitId: 'studio',
  tier: 'capability',
  runId: `run-${minsAgo}`,
  at: buildAt(minsAgo),
});

describe('isBuildInFlight', () => {
  it('a fresh build is in flight', () => {
    expect(isBuildInFlight(buildAt(1), NOW)).toBe(true);
  });

  it('TTL edge: just inside is in flight, exactly-at and beyond are not', () => {
    expect(isBuildInFlight(buildAt(TTL_MIN - 0.01), NOW)).toBe(true);
    expect(isBuildInFlight(buildAt(TTL_MIN), NOW)).toBe(false); // edge is exclusive
    expect(isBuildInFlight(buildAt(TTL_MIN + 0.01), NOW)).toBe(false);
  });

  it('a future-dated build (just-started clock skew) still reads as in flight', () => {
    expect(isBuildInFlight(buildAt(-1), NOW)).toBe(true);
  });

  it('an unparseable `at` is never in flight', () => {
    expect(isBuildInFlight('not-a-date', NOW)).toBe(false);
  });

  it('respects a custom TTL', () => {
    expect(isBuildInFlight(buildAt(10), NOW, 5 * 60_000)).toBe(false);
    expect(isBuildInFlight(buildAt(10), NOW, 15 * 60_000)).toBe(true);
  });
});

describe('anyInFlight', () => {
  it('true when any build is in flight, false when all are aged out', () => {
    expect(anyInFlight([build(1), build(TTL_MIN + 5)], NOW)).toBe(true);
    expect(anyInFlight([build(TTL_MIN + 1), build(TTL_MIN + 5)], NOW)).toBe(false);
    expect(anyInFlight([], NOW)).toBe(false);
  });
});
