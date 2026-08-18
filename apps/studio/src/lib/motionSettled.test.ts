import { describe, expect, it } from 'vitest';
import {
  countActiveStructuralAnimations,
  isAnimationInFlight,
  isMotionSettled,
  isStructuralAnimation,
  motionSettledPhase,
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
  it('is settled — no reasons — when the world has arrived, nothing is regrowing and no structural animation runs', () => {
    const input = { worldArrived: true, act2Regrowing: false, activeStructuralAnimations: 0 };
    expect(motionSettledReasons(input)).toEqual([]);
    expect(isMotionSettled(input)).toBe(true);
  });

  it('names act2-regrow while the Act 2 arrival regrow / vegetation growth cursor is < 1', () => {
    const input = { worldArrived: true, act2Regrowing: true, activeStructuralAnimations: 0 };
    expect(motionSettledReasons(input)).toEqual(['act2-regrow']);
    expect(isMotionSettled(input)).toBe(false);
  });

  it('names structural-animation while a lane draw-on / trail reveal / shore pulse is in flight', () => {
    const input = { worldArrived: true, act2Regrowing: false, activeStructuralAnimations: 2 };
    expect(motionSettledReasons(input)).toEqual(['structural-animation']);
    expect(isMotionSettled(input)).toBe(false);
  });

  it('names both when both are true at once', () => {
    const input = { worldArrived: true, act2Regrowing: true, activeStructuralAnimations: 1 };
    expect(motionSettledReasons(input)).toEqual(['act2-regrow', 'structural-animation']);
    expect(isMotionSettled(input)).toBe(false);
  });

  // THE DEFECT THIS GUARDS (settle-bridge-reports-settled-before-the-world-arrives,
  // frontend-appearance-repair-arc): before the world has arrived, `act2Regrowing` is false and
  // `activeStructuralAnimations` is 0 not because motion has FINISHED but because it hasn't
  // STARTED — every existing input is an absence, so "nothing in flight" was vacuously true during
  // the ~8s "Growing the world…" placeholder window. `worldArrived` is the positive arrival
  // assertion that closes the gap: it must win over both absences, unconditionally.
  it('names world-not-arrived — and ONLY world-not-arrived — before the world has arrived, regardless of the other two absences', () => {
    const input = { worldArrived: false, act2Regrowing: false, activeStructuralAnimations: 0 };
    expect(motionSettledReasons(input)).toEqual(['world-not-arrived']);
    expect(isMotionSettled(input)).toBe(false);
  });

  it('a not-yet-arrived world is never settled even if act2Regrowing/activeStructuralAnimations would themselves read as settled', () => {
    // Same absent-motion facts as the very first (settled) case above — only worldArrived flips.
    const notArrived = { worldArrived: false, act2Regrowing: false, activeStructuralAnimations: 0 };
    const arrived = { worldArrived: true, act2Regrowing: false, activeStructuralAnimations: 0 };
    expect(isMotionSettled(notArrived)).toBe(false);
    expect(isMotionSettled(arrived)).toBe(true);
  });
});

describe('motionSettledPhase — three states, so "too early" reads differently from "done"', () => {
  it('is not-started before the world has arrived', () => {
    expect(
      motionSettledPhase({ worldArrived: false, act2Regrowing: false, activeStructuralAnimations: 0 }),
    ).toBe('not-started');
    // Even a stray truthy regrow/animation reading (shouldn't happen pre-arrival, but the phase
    // must not depend on it) still reads not-started, never in-flight.
    expect(
      motionSettledPhase({ worldArrived: false, act2Regrowing: true, activeStructuralAnimations: 2 }),
    ).toBe('not-started');
  });

  it('is in-flight once arrived but something is still moving', () => {
    expect(
      motionSettledPhase({ worldArrived: true, act2Regrowing: true, activeStructuralAnimations: 0 }),
    ).toBe('in-flight');
    expect(
      motionSettledPhase({ worldArrived: true, act2Regrowing: false, activeStructuralAnimations: 1 }),
    ).toBe('in-flight');
  });

  it('is settled once arrived and nothing is moving', () => {
    expect(
      motionSettledPhase({ worldArrived: true, act2Regrowing: false, activeStructuralAnimations: 0 }),
    ).toBe('settled');
  });
});

describe('motionSettledSnapshot — the shape stamped onto a capture', () => {
  it('carries the verdict plus every raw fact it was computed from, including the new arrival gate', () => {
    expect(
      motionSettledSnapshot({ worldArrived: true, act2Regrowing: false, activeStructuralAnimations: 0 }),
    ).toEqual({
      settled: true,
      phase: 'settled',
      reasons: [],
      worldArrived: true,
      activeStructuralAnimations: 0,
      act2Regrowing: false,
    });
    expect(
      motionSettledSnapshot({ worldArrived: true, act2Regrowing: true, activeStructuralAnimations: 3 }),
    ).toEqual({
      settled: false,
      phase: 'in-flight',
      reasons: ['act2-regrow', 'structural-animation'],
      worldArrived: true,
      activeStructuralAnimations: 3,
      act2Regrowing: true,
    });
  });

  it('reports settled: false, phase: not-started, and no reason but world-not-arrived pre-arrival — THE FALSE POSITIVE THIS FIXES', () => {
    // Reproduces the exact measured defect: the ~8s "Growing the world…" placeholder window
    // reported `settled: true` under the old predicate because act2Regrowing and
    // activeStructuralAnimations were both absent (not yet started, not finished).
    expect(
      motionSettledSnapshot({ worldArrived: false, act2Regrowing: false, activeStructuralAnimations: 0 }),
    ).toEqual({
      settled: false,
      phase: 'not-started',
      reasons: ['world-not-arrived'],
      worldArrived: false,
      activeStructuralAnimations: 0,
      act2Regrowing: false,
    });
  });
});
