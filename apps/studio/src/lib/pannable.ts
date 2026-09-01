/**
 * pannable — drag a surface around inside a frame that has no scrollbars.
 *
 * ⚠ WHY THIS EXISTS AS A SHARED THING RATHER THAN FOUR CSS PROPERTIES ON ONE FRAME. The map's own
 * viewport (`.world-viewport` in `index.css`) was given `overflow: hidden` / `touch-action: none` /
 * `cursor: grab` / `user-select: none` on owner feedback — "get rid of the ugly scroll bars and
 * instead have it a pannable surface" — and that treatment was never generalised. So the capability
 * sub-DAG in the story detail panel, which is the surface the owner screenshotted when he asked the
 * same thing a second time (ADR-0502), still had bars. Copying the CSS alone would have been WORSE
 * than the bars: `overflow: hidden` with no gesture behind it strands every node past the frame's
 * edge with no way to reach it. The gesture is the missing half, and it belongs somewhere the next
 * surface can reach it.
 *
 * ⚠ IT PANS, IT DOES NOT ZOOM, AND THAT IS DELIBERATE HERE. The sub-DAG renders at one calm,
 * readable card size no matter how many nodes a story owns (`SUB_RENDER_SCALE`); fitting the whole
 * graph into the frame instead would shrink every card on the widest stories, which is the thing
 * that sizing was chosen to avoid. So this swaps the NAVIGATION — a drag where a scrollbar was —
 * and changes nothing about the picture.
 *
 * ⚠ THE CLAMP IS WHAT MAKES REMOVING THE SCROLLBAR SAFE. A bar carried a promise as well as a
 * position: everything is reachable, and you can see roughly how much more there is. The pan range
 * below is exactly the scroll range that bar described, so the first half of that promise is kept
 * structurally — no drag can put content out of reach, and releasing at the end of a drag leaves
 * the surface somewhere it can always be dragged back from.
 */

import { useEffect, useRef } from 'react';
import type { RefObject } from 'react';

/**
 * Bound one axis of a pan offset to the same range a scrollbar on that axis would have allowed.
 *
 * `value` is the proposed offset (0 = surface flush with the frame's start, negative = dragged
 * back). Content that fits the frame has nowhere to go and is pinned at 0 rather than left to
 * drift, which is what stops a small graph sliding out of its own box.
 */
export function clampPan(value: number, content: number, frame: number): number {
  if (!Number.isFinite(value)) return 0;
  // ⚠ THERE IS NO SEPARATE "IT FITS" BRANCH, AND THAT IS DELIBERATE RATHER THAN AN OMISSION. One was
  // written first and the mutation rung proved it dead: when `content <= frame`, `frame - content` is
  // at least 0, so the `max` is at least 0 and the `min` is exactly 0 for every input — the guard
  // could never change an answer. The BEHAVIOUR it described is still required and still tested
  // ("content that FITS is pinned"); it simply falls out of this expression instead of being
  // restated above it, and a branch no input can reach is a branch no test can defend.
  return Math.min(0, Math.max(frame - content, value));
}

/** Both axes at once — the shape the pointer handler actually wants. */
export interface PanOffset {
  readonly x: number;
  readonly y: number;
}

export interface PanBounds {
  readonly contentW: number;
  readonly contentH: number;
  readonly frameW: number;
  readonly frameH: number;
}

export function clampOffset(offset: PanOffset, bounds: PanBounds): PanOffset {
  return {
    x: clampPan(offset.x, bounds.contentW, bounds.frameW),
    y: clampPan(offset.y, bounds.contentH, bounds.frameH),
  };
}

/** Whether the content overflows its frame on either axis — i.e. whether a drag can do anything at
 *  all. A surface that cannot move should not advertise a grab cursor. */
export function canPan(bounds: PanBounds): boolean {
  return bounds.contentW > bounds.frameW || bounds.contentH > bounds.frameH;
}

// ── the React binding ───────────────────────────────────────────────────────

/** The surface may be an `<svg>` as easily as a `<div>`, so it is constrained by what this actually
 *  touches — a box to measure and an inline style to write — rather than by being HTML. */
type Surface = Element & ElementCSSInlineStyle;

export interface PannableRefs<F extends HTMLElement, S extends Surface> {
  /** The clipping box. Carries the gesture and the grab cursor. */
  readonly frameRef: RefObject<F | null>;
  /** The thing that moves inside it. */
  readonly surfaceRef: RefObject<S | null>;
}

/**
 * Wire a frame/surface pair for drag-to-pan.
 *
 * ⚠ THE OFFSET IS WRITTEN STRAIGHT TO THE DOM, NOT HELD IN STATE. A `useState` here would re-render
 * the whole detail panel on every `pointermove` — the sub-DAG it is wrapping is a few hundred SVG
 * nodes, and React would be reconciling all of them at pointer frequency for a change only one
 * `transform` needs. The offset is presentation, never data, so nothing else has a reason to read it.
 *
 * `resetKey` returns the surface to its origin when the thing being shown changes — otherwise
 * selecting a small story after a large one would leave its graph parked off-frame at the previous
 * story's offset, which is the stranding the clamp exists to prevent.
 */
export function usePannable<F extends HTMLElement, S extends Surface>(
  resetKey: string,
): PannableRefs<F, S> {
  const frameRef = useRef<F | null>(null);
  const surfaceRef = useRef<S | null>(null);

  useEffect(() => {
    const frame = frameRef.current;
    const surface = surfaceRef.current;
    if (!frame || !surface) return;

    let dragging = false;
    let lastX = 0;
    let lastY = 0;

    const bounds = (): PanBounds => ({
      contentW: surface.getBoundingClientRect().width,
      contentH: surface.getBoundingClientRect().height,
      frameW: frame.clientWidth,
      frameH: frame.clientHeight,
    });
    const write = (): void => {
      surface.style.transform = `translate(${offset.x.toFixed(1)}px, ${offset.y.toFixed(1)}px)`;
    };
    // A new story: straight back to the origin. No clamp — the origin is inside every legal range by
    // construction (the range is `[frame - content, 0]`, which always contains 0), so clamping it
    // could only ever return it unchanged. Declared HERE rather than above `write`, so the origin is
    // written down once: a separate initialiser was dead the moment this line ran, and a value no
    // input can observe is a value no test can defend.
    let offset: PanOffset = { x: 0, y: 0 };
    write();

    const onDown = (ev: PointerEvent): void => {
      if (!canPan(bounds())) return;
      dragging = true;
      lastX = ev.clientX;
      lastY = ev.clientY;
      frame.setPointerCapture(ev.pointerId);
      frame.classList.add('is-grabbing');
    };
    const onMove = (ev: PointerEvent): void => {
      if (!dragging) return;
      offset = clampOffset(
        { x: offset.x + (ev.clientX - lastX), y: offset.y + (ev.clientY - lastY) },
        bounds(),
      );
      lastX = ev.clientX;
      lastY = ev.clientY;
      write();
    };
    const onUp = (ev: PointerEvent): void => {
      if (!dragging) return;
      dragging = false;
      if (frame.hasPointerCapture(ev.pointerId)) frame.releasePointerCapture(ev.pointerId);
      frame.classList.remove('is-grabbing');
    };

    frame.addEventListener('pointerdown', onDown);
    frame.addEventListener('pointermove', onMove);
    frame.addEventListener('pointerup', onUp);
    frame.addEventListener('pointercancel', onUp);
    return () => {
      frame.removeEventListener('pointerdown', onDown);
      frame.removeEventListener('pointermove', onMove);
      frame.removeEventListener('pointerup', onUp);
      frame.removeEventListener('pointercancel', onUp);
    };
  }, [resetKey]);

  return { frameRef, surfaceRef };
}
