// The recently-landed bloom helper (ADR-0045): a transient announcement off
// `verdict.at`. These pin the window edges, the pass-only v1 scope, the
// ageRatio ramp that drives opacity, and the legend's recentLandings rule.

import { describe, it, expect } from 'vitest';
import { anyRecentLanding, BLOOM_WINDOW_HOURS, verdictBloom } from './activity';
import type { TreeVerdict } from '../types';

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
