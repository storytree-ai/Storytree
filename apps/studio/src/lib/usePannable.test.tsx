// @vitest-environment jsdom
// The React binding for drag-to-pan (ADR-0502). The clamp arithmetic is pinned in
// `pannable.test.ts`; this pins the WIRING, which is the half that cannot be checked by eye in a
// headless pane — the studio's tree world is laid out by `requestAnimationFrame`, which a
// non-painting browser context suspends, so the sub-DAG never reaches the screen there at all.
//
// ⚠ WHAT MAKES THIS WORTH A TEST RATHER THAN A LOOK: removing `overflow: auto` from the frame is
// only safe BECAUSE a gesture replaces it. If the listeners silently fail to attach — a ref on the
// wrong element, an effect that returns early — the panel does not look broken. It looks like a
// graph with its edges cut off and no way to reach them, which is strictly worse than the
// scrollbar it replaced.
//
// ⚠⚠ THE ASSERTIONS BELOW ARE SHAPED BY WHAT `check:mutation-diff` COULD STILL BREAK. A first pass
// read as a thorough suite and left 22 mutants alive, because almost every "it does not move"
// assertion was satisfied by the CLAMP rather than by the guard it meant to test: a stray drag
// towards positive coordinates clamps to zero anyway, so deleting the guard changed nothing
// observable. Every such case now drags NEGATIVE, where a missing guard produces a real offset, and
// the pointer-capture calls are spied rather than stubbed silently. Read that as the rule for
// editing this file: assert on the thing that would differ, not on the thing that looks stable.

import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, cleanup, fireEvent } from '@testing-library/react';

import { usePannable } from './pannable';

afterEach(cleanup);

const AT_REST = 'translate(0.0px, 0.0px)';

/** Sizes come from layout, which jsdom does not do — so they are stubbed per element. */
function sizeAs(el: Element, width: number, height: number): void {
  el.getBoundingClientRect = () =>
    ({ width, height, top: 0, left: 0, right: width, bottom: height, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect;
  Object.defineProperty(el, 'clientWidth', { value: width, configurable: true });
  Object.defineProperty(el, 'clientHeight', { value: height, configurable: true });
}

function Harness({
  resetKey = 'a',
  withSurface = true,
}: {
  resetKey?: string;
  withSurface?: boolean;
}): React.ReactElement {
  const { frameRef, surfaceRef } = usePannable<HTMLDivElement, SVGSVGElement>(resetKey);
  return (
    <div data-testid="frame" ref={frameRef}>
      {withSurface ? <svg data-testid="surface" ref={surfaceRef} /> : null}
    </div>
  );
}

interface Capture {
  readonly set: ReturnType<typeof vi.fn>;
  readonly release: ReturnType<typeof vi.fn>;
}

/**
 * jsdom implements no pointer capture at all, so these have to be supplied. SPIES rather than empty
 * stubs: whether capture is taken and released is behaviour this suite has to be able to see, and a
 * silent no-op made deleting the calls entirely invisible to it.
 */
function spyCapture(el: Element, captured = true): Capture {
  const target = el as Element & Record<string, unknown>;
  const set = vi.fn();
  const release = vi.fn();
  target.setPointerCapture = set;
  target.releasePointerCapture = release;
  target.hasPointerCapture = () => captured;
  return { set, release };
}

/**
 * ⚠ POINTER EVENTS ARE DISPATCHED AS `MouseEvent`, AND THAT IS NOT A SHORTCUT — IT IS THE ONLY WAY
 * THE COORDINATES SURVIVE. jsdom does not implement `PointerEvent`, so Testing Library's
 * `fireEvent.pointerMove` falls back to a plain `Event`, which silently drops `clientX`/`clientY`.
 * The handler then reads `undefined`, the arithmetic yields `NaN`, and the hook's own non-finite
 * guard resolves it to a zero offset — so the surface does not move and NOTHING reports an error.
 *
 * That nearly shipped three vacuous green tests: the assertions that the surface does NOT move all
 * passed under the broken harness, for entirely the wrong reason. `MouseEvent` carries the
 * coordinates and jsdom implements it fully; the listeners are registered by event NAME, so they
 * receive it exactly as they would a real pointer event.
 */
const pointer = (el: Element, type: string, x: number, y: number): void => {
  fireEvent(el, new MouseEvent(type, { clientX: x, clientY: y, bubbles: true, cancelable: true }));
};

function mount(frame: [number, number], surface: [number, number]) {
  const view = render(<Harness />);
  const frameEl = view.getByTestId('frame');
  const surfaceEl = view.getByTestId('surface');
  sizeAs(frameEl, frame[0], frame[1]);
  sizeAs(surfaceEl, surface[0], surface[1]);
  const capture = spyCapture(frameEl);
  return { frameEl, surfaceEl, capture, view };
}

const drag = (el: Element, from: [number, number], to: [number, number]): void => {
  pointer(el, 'pointerdown', from[0], from[1]);
  pointer(el, 'pointermove', to[0], to[1]);
  pointer(el, 'pointerup', to[0], to[1]);
};

describe('usePannable', () => {
  it('THE WIRING: dragging an overflowing surface moves it', () => {
    const { frameEl, surfaceEl } = mount([300, 200], [900, 600]);
    drag(frameEl, [200, 150], [120, 90]);
    // Dragged 80px left and 60px up, and the content has room to give in both directions.
    expect(surfaceEl.style.transform).toBe('translate(-80.0px, -60.0px)');
  });

  it('a drag cannot push content out of reach', () => {
    const { frameEl, surfaceEl } = mount([300, 200], [900, 600]);
    drag(frameEl, [500, 500], [-5000, -5000]);
    // The far edge, and no further: 300 - 900 and 200 - 600.
    expect(surfaceEl.style.transform).toBe('translate(-600.0px, -400.0px)');
  });

  // ── the guards, each asserted on the thing that would actually differ ──────

  it('a surface that FITS refuses the grab outright', () => {
    // ⚠ ASSERTED ON THE CURSOR AND THE CAPTURE, NOT ON THE TRANSFORM. A fitting surface clamps to
    // zero however far it is dragged, so "it did not move" is true whether the guard exists or not
    // — which is exactly how a deleted guard survived here once.
    const { frameEl, surfaceEl, capture } = mount([300, 200], [100, 100]);
    pointer(frameEl, 'pointerdown', 150, 100);
    expect(frameEl.classList.contains('is-grabbing')).toBe(false);
    expect(capture.set).not.toHaveBeenCalled();
    pointer(frameEl, 'pointermove', 10, 10);
    expect(surfaceEl.style.transform).toBe(AT_REST);
  });

  it('a pointermove with no button down is ignored', () => {
    // ⚠ DRAGS NEGATIVE ON PURPOSE. Towards positive coordinates an ungated move clamps to zero and
    // looks identical to being ignored; towards negative ones it would leave a real offset.
    const { frameEl, surfaceEl } = mount([300, 200], [900, 600]);
    pointer(frameEl, 'pointermove', -80, -60);
    expect(surfaceEl.style.transform).toBe(AT_REST);
  });

  it('a drag that has ENDED does not keep panning', () => {
    // Pins the reset of the drag flag on release: without it every later move is still a drag.
    const { frameEl, surfaceEl } = mount([300, 200], [900, 600]);
    drag(frameEl, [200, 150], [120, 90]);
    pointer(frameEl, 'pointermove', -500, -500);
    expect(surfaceEl.style.transform).toBe('translate(-80.0px, -60.0px)');
  });

  it('a CANCELLED drag stops panning too', () => {
    // `pointercancel` is the branch a touch device actually takes when the browser takes the gesture
    // over. Without its listener the surface keeps following the finger afterwards.
    const { frameEl, surfaceEl } = mount([300, 200], [900, 600]);
    pointer(frameEl, 'pointerdown', 200, 150);
    pointer(frameEl, 'pointermove', 180, 130);
    pointer(frameEl, 'pointercancel', 180, 130);
    const parked = surfaceEl.style.transform;
    expect(parked).not.toBe(AT_REST);
    pointer(frameEl, 'pointermove', -500, -500);
    expect(surfaceEl.style.transform).toBe(parked);
  });

  it('the grab cursor is only worn while a drag is live', () => {
    const { frameEl } = mount([300, 200], [900, 600]);
    expect(frameEl.classList.contains('is-grabbing')).toBe(false);
    pointer(frameEl, 'pointerdown', 100, 100);
    expect(frameEl.classList.contains('is-grabbing')).toBe(true);
    pointer(frameEl, 'pointerup', 100, 100);
    expect(frameEl.classList.contains('is-grabbing')).toBe(false);
  });

  // ── pointer capture, which is what keeps a drag alive off the frame ────────

  it('capture is TAKEN on a real drag and RELEASED when it ends', () => {
    const { frameEl, capture } = mount([300, 200], [900, 600]);
    pointer(frameEl, 'pointerdown', 200, 150);
    expect(capture.set).toHaveBeenCalledTimes(1);
    expect(capture.release).not.toHaveBeenCalled();
    pointer(frameEl, 'pointerup', 200, 150);
    expect(capture.release).toHaveBeenCalledTimes(1);
  });

  it('capture is not released when it was never held', () => {
    // Releasing a capture nobody took throws in some engines, so the check around it is a real one.
    const view = render(<Harness />);
    const frameEl = view.getByTestId('frame');
    sizeAs(frameEl, 300, 200);
    sizeAs(view.getByTestId('surface'), 900, 600);
    const capture = spyCapture(frameEl, false);
    pointer(frameEl, 'pointerdown', 200, 150);
    pointer(frameEl, 'pointerup', 200, 150);
    expect(capture.release).not.toHaveBeenCalled();
  });

  it('a pointerup with no drag in flight releases nothing', () => {
    const { frameEl, capture } = mount([300, 200], [900, 600]);
    pointer(frameEl, 'pointerup', 200, 150);
    expect(capture.release).not.toHaveBeenCalled();
    expect(frameEl.classList.contains('is-grabbing')).toBe(false);
  });

  // ── lifecycle ─────────────────────────────────────────────────────────────

  it('switching to another story returns the surface to its origin', () => {
    // Without this, selecting a small story after a large one leaves its graph parked at the
    // previous story's offset — off-frame, with a clamp that now says it is already at rest.
    const view = render(<Harness resetKey="story-a" />);
    const frameEl = view.getByTestId('frame');
    const surfaceEl = view.getByTestId('surface');
    sizeAs(frameEl, 300, 200);
    sizeAs(surfaceEl, 900, 600);
    spyCapture(frameEl);
    drag(frameEl, [200, 150], [100, 80]);
    expect(surfaceEl.style.transform).not.toBe(AT_REST);

    view.rerender(<Harness resetKey="story-b" />);
    expect(surfaceEl.style.transform).toBe(AT_REST);
  });

  it('the listeners are TORN DOWN on unmount', () => {
    // A frame that outlives its effect would otherwise accumulate a second live handler set and pan
    // at double speed.
    const { frameEl, surfaceEl, view } = mount([300, 200], [900, 600]);
    view.unmount();
    surfaceEl.style.transform = AT_REST;
    pointer(frameEl, 'pointerdown', 200, 150);
    pointer(frameEl, 'pointermove', 100, 50);
    expect(surfaceEl.style.transform).toBe(AT_REST);
    expect(frameEl.classList.contains('is-grabbing')).toBe(false);
  });

  it('a drag LIVE at unmount is torn down too — every listener, not just the first', () => {
    // ⚠ THE ONLY SHAPE THAT CAN SEE THREE OF THE FOUR TEARDOWNS, and the reason the test above is
    // not enough. Unmounting with no drag in flight leaves the stale closure's `dragging` false, so
    // a surviving `pointermove` / `pointerup` / `pointercancel` listener does nothing observable and
    // removing it changes nothing. Starting a drag FIRST arms that closure: each listener left
    // behind now has visible work to do, and failing to remove it shows up here.
    const { frameEl, surfaceEl, capture, view } = mount([300, 200], [900, 600]);
    pointer(frameEl, 'pointerdown', 200, 150);
    expect(frameEl.classList.contains('is-grabbing')).toBe(true);

    view.unmount();
    surfaceEl.style.transform = AT_REST;
    capture.release.mockClear();

    pointer(frameEl, 'pointermove', 100, 50);
    expect(surfaceEl.style.transform).toBe(AT_REST);

    pointer(frameEl, 'pointerup', 100, 50);
    expect(capture.release).not.toHaveBeenCalled();
  });

  it('a CANCEL after unmount is torn down as well', () => {
    // `pointercancel` shares the handler with `pointerup` but is registered separately, so it needs
    // its own case — removing one line and not the other is a single-character mistake.
    const { frameEl, capture, view } = mount([300, 200], [900, 600]);
    pointer(frameEl, 'pointerdown', 200, 150);
    view.unmount();
    capture.release.mockClear();
    pointer(frameEl, 'pointercancel', 100, 50);
    expect(capture.release).not.toHaveBeenCalled();
  });

  it('a frame with no surface wires nothing rather than throwing', () => {
    // Both refs are required. The early return is the difference between a no-op and a crash on the
    // first pointer event.
    const view = render(<Harness withSurface={false} />);
    const frameEl = view.getByTestId('frame');
    sizeAs(frameEl, 300, 200);
    const capture = spyCapture(frameEl);
    expect(() => {
      pointer(frameEl, 'pointerdown', 200, 150);
      pointer(frameEl, 'pointermove', 100, 50);
    }).not.toThrow();
    expect(capture.set).not.toHaveBeenCalled();
    expect(frameEl.classList.contains('is-grabbing')).toBe(false);
  });
});
