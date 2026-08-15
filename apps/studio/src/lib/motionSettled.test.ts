import { describe, expect, it } from 'vitest';
import {
  countActiveStructuralAnimations,
  isAnimationInFlight,
  isMotionSettled,
  isStructuralAnimation,
  motionSettledReasons,
  motionSettledSnapshot,
  readStructuralAnimations,
  type StructuralAnimationLike,
} from './motionSettled.js';

const running = (iterations: number): StructuralAnimationLike => ({
  playState: 'running',
  effect: { getTiming: () => ({ iterations }) },
});
const finished = (iterations: number): StructuralAnimationLike => ({
  playState: 'finished',
  effect: { getTiming: () => ({ iterations }) },
});
const pending = (iterations: number): StructuralAnimationLike => ({
  playState: 'pending',
  effect: { getTiming: () => ({ iterations }) },
});

describe('isStructuralAnimation', () => {
  it('is true for a finite-duration animation (a draw-on, a reveal, a pulse)', () => {
    expect(isStructuralAnimation(running(1))).toBe(true);
  });

  it('is false for a decorative infinite loop — marching-ants lanes, wisp glow, spinner, caret', () => {
    expect(isStructuralAnimation(running(Number.POSITIVE_INFINITY))).toBe(false);
  });

  it('treats a missing effect as finite (fails toward counting it, never toward ignoring it)', () => {
    expect(isStructuralAnimation({ playState: 'running', effect: null })).toBe(true);
  });
});

describe('isAnimationInFlight', () => {
  it('running and pending both count as in flight', () => {
    expect(isAnimationInFlight(running(1))).toBe(true);
    expect(isAnimationInFlight(pending(1))).toBe(true);
  });

  it('finished and idle do not', () => {
    expect(isAnimationInFlight(finished(1))).toBe(false);
    expect(isAnimationInFlight({ playState: 'idle', effect: null })).toBe(false);
  });
});

describe('countActiveStructuralAnimations', () => {
  it('is 0 with no animations at all — the settled map carries none', () => {
    expect(countActiveStructuralAnimations([])).toBe(0);
  });

  it('counts a running finite animation (a lane mid draw-on)', () => {
    expect(countActiveStructuralAnimations([running(1)])).toBe(1);
  });

  it('never counts a decorative infinite loop, however many are running', () => {
    // THE TRAP THIS GUARDS: a settle predicate built on "any animation is running" would never
    // resolve on a map carrying a marching lane, a live build wisp, or the load spinner — every one
    // of those is a genuine, permanently-running CSS animation by design.
    expect(
      countActiveStructuralAnimations([
        running(Number.POSITIVE_INFINITY),
        running(Number.POSITIVE_INFINITY),
        pending(Number.POSITIVE_INFINITY),
      ]),
    ).toBe(0);
  });

  it('does not count a finite animation that has already finished', () => {
    expect(countActiveStructuralAnimations([finished(1)])).toBe(0);
  });

  it('mixes correctly: only the running/pending finite ones are counted', () => {
    const animations = [
      running(1), // counts
      finished(1), // does not
      running(Number.POSITIVE_INFINITY), // does not (decorative)
      pending(1), // counts
    ];
    expect(countActiveStructuralAnimations(animations)).toBe(2);
  });
});

describe('readStructuralAnimations', () => {
  it('calls getAnimations({ subtree: true }) and returns its result', () => {
    let calledWith: unknown;
    const list = [running(1)];
    const root = {
      getAnimations: (opts: { subtree: boolean }) => {
        calledWith = opts;
        return list;
      },
    };
    expect(readStructuralAnimations(root)).toBe(list);
    expect(calledWith).toEqual({ subtree: true });
  });

  it('returns [] rather than throwing when the API is unavailable (jsdom, an old engine)', () => {
    expect(readStructuralAnimations(null)).toEqual([]);
    expect(readStructuralAnimations({})).toEqual([]);
  });

  it('returns [] rather than throwing when getAnimations itself throws (a detached root)', () => {
    const root = {
      getAnimations: () => {
        throw new Error('cannot read animations of a detached element');
      },
    };
    expect(readStructuralAnimations(root)).toEqual([]);
  });
});

describe('motionSettledReasons / isMotionSettled', () => {
  it('is settled — no reasons — when nothing is regrowing and no structural animation runs', () => {
    const input = { act2Regrowing: false, activeStructuralAnimations: 0 };
    expect(motionSettledReasons(input)).toEqual([]);
    expect(isMotionSettled(input)).toBe(true);
  });

  it('names act2-regrow while the Act 2 arrival regrow / vegetation growth cursor is < 1', () => {
    const input = { act2Regrowing: true, activeStructuralAnimations: 0 };
    expect(motionSettledReasons(input)).toEqual(['act2-regrow']);
    expect(isMotionSettled(input)).toBe(false);
  });

  it('names structural-animation while a lane draw-on / trail reveal / shore pulse is in flight', () => {
    const input = { act2Regrowing: false, activeStructuralAnimations: 2 };
    expect(motionSettledReasons(input)).toEqual(['structural-animation']);
    expect(isMotionSettled(input)).toBe(false);
  });

  it('names both when both are true at once', () => {
    const input = { act2Regrowing: true, activeStructuralAnimations: 1 };
    expect(motionSettledReasons(input)).toEqual(['act2-regrow', 'structural-animation']);
    expect(isMotionSettled(input)).toBe(false);
  });
});

describe('motionSettledSnapshot — the shape stamped onto a capture', () => {
  it('carries the verdict plus every raw fact it was computed from', () => {
    expect(motionSettledSnapshot({ act2Regrowing: false, activeStructuralAnimations: 0 })).toEqual({
      settled: true,
      reasons: [],
      activeStructuralAnimations: 0,
      act2Regrowing: false,
    });
    expect(motionSettledSnapshot({ act2Regrowing: true, activeStructuralAnimations: 3 })).toEqual({
      settled: false,
      reasons: ['act2-regrow', 'structural-animation'],
      activeStructuralAnimations: 3,
      act2Regrowing: true,
    });
  });
});
