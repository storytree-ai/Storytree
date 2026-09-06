// The in-flight BUILD helper (ADR-0048): is this build still live at `now`, and is any?
//
// The recently-landed verdict bloom that used to be tested here went with ADR-0529 — it had not
// been drawn on any surface since 2026-07-23 and the owner retired it. What it announced is
// unchanged and is not tested here: the durable record is the plant's verdict-derived HUE
// (ADR-0040), which `worldStatus.ts` owns.

import { describe, it, expect } from 'vitest';
import { anyInFlight, isBuildInFlight } from './activity';
import { BUILD_IN_FLIGHT_TTL_MS, type BuildActivity } from '../types';

const NOW = new Date('2026-06-14T12:00:00.000Z');

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
