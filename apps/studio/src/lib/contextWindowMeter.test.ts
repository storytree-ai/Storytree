// Red-green on the context-window meter's arithmetic (ADR-0452 D1/D2, increment
// `make-the-single-window-meter-useful`). GEOMETRY AND BAND LOGIC ONLY — the two-stage frontend
// proof (ADR-0070) puts the appearance verdict with the owner, and nothing here signs it.
//
// The propositions worth pinning are the ones that would draw a lie if they broke: the marks sit
// where ADR-0411 D3 put them, a reading is split at EXACTLY a mark rather than near it, every meter
// shares one ceiling so two can be compared by eye, and no function anywhere adds two windows
// together (ADR-0413 D2 / ADR-0452 D4).

import { describe, it, expect } from 'vitest';
import {
  BASE_SCALE_TOKENS,
  HARD_MARK_TOKENS,
  SOFT_MARK_TOKENS,
  ageLabel,
  bandGuidance,
  bandOf,
  formatTokens,
  meterSegments,
  sharedScaleTokens,
} from './contextWindowMeter';

describe('the marks are ADR-0411 D3’s', () => {
  it('places the soft mark at 400k and the hard mark at 500k', () => {
    expect(SOFT_MARK_TOKENS).toBe(400_000);
    expect(HARD_MARK_TOKENS).toBe(500_000);
  });

  it('bands a reading at exactly a mark as being IN that band, and just below it as out', () => {
    expect(bandOf(399_999)).toBe('calm');
    expect(bandOf(400_000)).toBe('soft');
    expect(bandOf(499_999)).toBe('soft');
    expect(bandOf(500_000)).toBe('hard');
  });

  it('gives each band the decision ADR-0411 D3 attaches to it, not a paraphrase of the number', () => {
    expect(bandGuidance('calm')).toMatch(/room for another increment/);
    expect(bandGuidance('soft')).toMatch(/no new increment/);
    expect(bandGuidance('hard')).toMatch(/hand.?over|fresh session/);
  });
});

describe('the track ceiling', () => {
  it('leaves headroom above the hard mark, so at-the-limit and past-it cannot draw identically', () => {
    // A ceiling equal to the hard mark would fill the track at 500k, and a window PAST 500k would
    // then look the same as one exactly at it — erasing the state the mark exists to show.
    expect(BASE_SCALE_TOKENS).toBeGreaterThan(HARD_MARK_TOKENS);
    const atMark = meterSegments(HARD_MARK_TOKENS, BASE_SCALE_TOKENS);
    const pastMark = meterSegments(HARD_MARK_TOKENS + 60_000, BASE_SCALE_TOKENS);
    expect(atMark.hardFraction).toBe(0);
    expect(pastMark.hardFraction).toBeGreaterThan(0);
  });

  it('is ONE ceiling for every reading, chosen from the fullest, so two meters compare by eye', () => {
    const scale = sharedScaleTokens([120_000, 292_322, 500_250]);
    const small = meterSegments(120_000, scale);
    const large = meterSegments(500_250, scale);
    // The same ceiling for both, so the ratio of the drawn fills is the ratio of the readings.
    const smallFill = small.calmFraction + small.softFraction + small.hardFraction;
    const largeFill = large.calmFraction + large.softFraction + large.hardFraction;
    expect(largeFill / smallFill).toBeCloseTo(500_250 / 120_000, 5);
  });

  it('holds the base ceiling until a reading exceeds it, then steps up to contain it', () => {
    expect(sharedScaleTokens([])).toBe(BASE_SCALE_TOKENS);
    expect(sharedScaleTokens([599_999])).toBe(BASE_SCALE_TOKENS);
    const grown = sharedScaleTokens([640_000]);
    expect(grown).toBeGreaterThanOrEqual(640_000);
    expect(meterSegments(640_000, grown).hardFraction).toBeGreaterThan(0);
  });
});

describe('one reading splits into three coloured portions', () => {
  it('splits at EXACTLY a mark — only the excess above one is ever coloured for it', () => {
    const atSoft = meterSegments(SOFT_MARK_TOKENS, BASE_SCALE_TOKENS);
    expect(atSoft.softFraction).toBe(0);
    expect(atSoft.calmFraction).toBeCloseTo(SOFT_MARK_TOKENS / BASE_SCALE_TOKENS, 10);

    const between = meterSegments(450_000, BASE_SCALE_TOKENS);
    expect(between.calmFraction).toBeCloseTo(SOFT_MARK_TOKENS / BASE_SCALE_TOKENS, 10);
    expect(between.softFraction).toBeCloseTo(50_000 / BASE_SCALE_TOKENS, 10);
    expect(between.hardFraction).toBe(0);

    const over = meterSegments(560_000, BASE_SCALE_TOKENS);
    expect(over.calmFraction).toBeCloseTo(SOFT_MARK_TOKENS / BASE_SCALE_TOKENS, 10);
    expect(over.softFraction).toBeCloseTo(100_000 / BASE_SCALE_TOKENS, 10);
    expect(over.hardFraction).toBeCloseTo(60_000 / BASE_SCALE_TOKENS, 10);
  });

  it('never draws past the track, even when handed a stale ceiling', () => {
    const s = meterSegments(2_000_000, BASE_SCALE_TOKENS);
    expect(s.calmFraction + s.softFraction + s.hardFraction).toBeCloseTo(1, 10);
  });

  it('draws nothing for an empty window and never a negative segment', () => {
    const s = meterSegments(0, BASE_SCALE_TOKENS);
    expect(s.calmFraction).toBe(0);
    expect(s.softFraction).toBe(0);
    expect(s.hardFraction).toBe(0);
    const negative = meterSegments(-5, BASE_SCALE_TOKENS);
    expect(negative.calmFraction).toBe(0);
  });

  it('falls back to the base ceiling rather than dividing by a zero scale', () => {
    expect(meterSegments(300_000, 0).calmFraction).toBeCloseTo(300_000 / BASE_SCALE_TOKENS, 10);
  });
});

describe('readouts', () => {
  it('formats tokens the way the replay panel does — one house format, not a second copy', () => {
    expect(formatTokens(500_250)).toBe('500.3k');
    expect(formatTokens(1_240_000)).toBe('1.24M');
  });

  it('labels an age at the coarsest unit still true, and refuses to invent one for an undated read', () => {
    const now = Date.parse('2026-08-26T12:00:00.000Z');
    expect(ageLabel('2026-08-26T11:56:00.000Z', now)).toBe('4m');
    expect(ageLabel('2026-08-26T09:00:00.000Z', now)).toBe('3h');
    expect(ageLabel('2026-08-23T12:00:00.000Z', now)).toBe('3d');
    expect(ageLabel(null, now)).toBe('undated');
    expect(ageLabel('not-a-date', now)).toBe('undated');
  });
});
