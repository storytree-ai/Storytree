// The pan clamp behind the scrollbar-free surfaces (ADR-0502). Pure arithmetic only — the React
// binding beside it is DOM wiring with no decision in it, and the decision is all here.

import { describe, it, expect } from 'vitest';

import { canPan, clampOffset, clampPan } from './pannable';

describe('pannable', () => {
  // ── the promise a scrollbar made, kept without the bar ────────────────────

  it('THE LOAD-BEARING RULE: no drag can put content out of reach', () => {
    // This is the whole reason `overflow: hidden` is safe here. A scrollbar promised two things —
    // that there is more, and that all of it is reachable. Pan replaces the first with a gesture,
    // and must keep the second STRUCTURALLY, because there is no bar left to drag back with.
    const content = 1200;
    const frame = 300;
    expect(clampPan(-99999, content, frame)).toBe(frame - content);
    expect(clampPan(99999, content, frame)).toBe(0);
    // And every stopping point is one the surface can be dragged back from.
    for (const at of [0, -100, -450, -900, frame - content]) {
      expect(clampPan(at, content, frame)).toBe(at);
    }
  });

  it('content that FITS is pinned, not left to drift', () => {
    // A small graph in a big frame has nowhere to go. Letting a drag move it anyway would slide it
    // out of its own box for no reason — the one way a pannable surface can lose content that a
    // scrollbar never could.
    expect(clampPan(250, 100, 300)).toBe(0);
    expect(clampPan(-250, 100, 300)).toBe(0);
    expect(clampPan(0, 300, 300)).toBe(0);
  });

  it('both axes clamp independently — a graph may overflow one and fit the other', () => {
    // The common shape: `studio` is 12 components across and only 3 deep, so it overflows sideways
    // and fits vertically. Clamping them together would either strand the wide axis or jitter the
    // tall one.
    const bounds = { contentW: 900, contentH: 200, frameW: 300, frameH: 400 };
    expect(clampOffset({ x: -1000, y: -1000 }, bounds)).toEqual({ x: -600, y: 0 });
    expect(clampOffset({ x: 50, y: 50 }, bounds)).toEqual({ x: 0, y: 0 });
  });

  it('a surface that cannot move does not claim it can', () => {
    // `canPan` gates the grab cursor and the drag. Advertising a grab on something immovable is a
    // small lie the reader finds out by trying.
    expect(canPan({ contentW: 100, contentH: 100, frameW: 300, frameH: 300 })).toBe(false);
    expect(canPan({ contentW: 900, contentH: 100, frameW: 300, frameH: 300 })).toBe(true);
    expect(canPan({ contentW: 100, contentH: 900, frameW: 300, frameH: 300 })).toBe(true);
  });

  it('content EXACTLY the size of its frame cannot pan — the boundary, on both axes', () => {
    // ⚠ THE `>` IS NOT A `>=`, AND ONLY THIS CASE CAN TELL. Content flush with its frame has zero
    // range: a grab cursor there promises a movement that clamps straight back to zero. Both mutants
    // of that comparison survived until this case existed, on each axis independently.
    expect(canPan({ contentW: 300, contentH: 300, frameW: 300, frameH: 300 })).toBe(false);
    expect(canPan({ contentW: 301, contentH: 300, frameW: 300, frameH: 300 })).toBe(true);
    expect(canPan({ contentW: 300, contentH: 301, frameW: 300, frameH: 300 })).toBe(true);
  });

  it('TEETH: a non-finite offset resolves to the origin rather than poisoning the transform', () => {
    // `NaN` reaches here if a frame is measured mid-layout at zero and a ratio is taken. Written
    // into a CSS transform it makes the whole surface vanish, with no error anywhere.
    expect(clampPan(Number.NaN, 900, 300)).toBe(0);
    expect(clampPan(Number.POSITIVE_INFINITY, 900, 300)).toBe(0);
    expect(
      clampOffset({ x: Number.NaN, y: -100 }, { contentW: 900, contentH: 900, frameW: 300, frameH: 300 }),
    ).toEqual({ x: 0, y: -100 });
  });
});
