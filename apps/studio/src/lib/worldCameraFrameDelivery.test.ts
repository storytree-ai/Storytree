import { describe, expect, it } from 'vitest';
import { act2RegrowCamera, type Camera } from './worldCamera.js';
import {
  deliverWorldCameraFrame,
  projectDeliveredWorldPoint,
  sameWorldCameraVisualIdentity,
} from './worldCameraFrameDelivery.js';

describe('world camera hybrid frame delivery', () => {
  it('compares the complete visual identity element-by-element with Object.is semantics', () => {
    const layer = { kind: 'regrow-layer' };
    expect(sameWorldCameraVisualIdentity([layer, NaN, -0], [layer, NaN, -0])).toBe(true);
    expect(sameWorldCameraVisualIdentity([layer, NaN, -0], [layer, NaN, 0])).toBe(false);
    expect(sameWorldCameraVisualIdentity([layer], [layer, undefined])).toBe(false);
    expect(sameWorldCameraVisualIdentity([layer], [{ kind: 'regrow-layer' }])).toBe(false);
  });

  it('freezes the SVG base while the complete visual-model identity is unchanged', () => {
    const fitted: Camera = { tx: 130, ty: 84, scale: 0.72, groundWorldY: 1260 };
    const frame = { width: 1600, height: 1000 };
    const picture = [{ kind: 'regrow-layer' }, { kind: 'vegetation-layer' }, { kind: 'trail-plan' }];
    const points = [
      { x: 0, y: 0 },
      { x: 817.25, y: 609.5 },
      { x: 1590, y: 1259 },
    ];

    let delivery = deliverWorldCameraFrame(
      null,
      act2RegrowCamera(fitted, frame, 0),
      picture,
    );
    const base = delivery.svgCamera;

    for (const cursor of [0.07, 0.23, 0.5, 0.81, 0.97, 1]) {
      const desired = act2RegrowCamera(fitted, frame, cursor);
      delivery = deliverWorldCameraFrame(delivery, desired, picture);

      expect(delivery.svgCamera).toBe(base);
      expect(delivery.compositor.scale).toBeCloseTo(desired.scale / base.scale, 15);
      expect(delivery.compositor.tx).toBeCloseTo(
        desired.tx - (desired.scale / base.scale) * base.tx,
        12,
      );
      expect(delivery.compositor.ty).toBeCloseTo(
        desired.ty - (desired.scale / base.scale) * base.ty,
        12,
      );
      expect(delivery.transformOrigin).toBe('0 0');

      for (const point of points) {
        const projected = projectDeliveredWorldPoint(delivery, point.x, point.y);
        expect(projected.x).toBeCloseTo(desired.tx + desired.scale * point.x, 9);
        expect(projected.y).toBeCloseTo(desired.ty + desired.scale * point.y, 9);
      }
    }
  });

  it('folds the exact desired camera into SVG when any rendered-picture identity changes', () => {
    const firstPicture = [{ layer: 'a' }, { vegetation: 'a' }, { trails: 'a' }];
    const changedPicture = [firstPicture[0], { vegetation: 'b' }, firstPicture[2]];
    const opening = { tx: -700, ty: -1200, scale: 2.5 };
    const desired = { tx: -240, ty: -430, scale: 1.4 };
    const prior = deliverWorldCameraFrame(null, opening, firstPicture);

    const folded = deliverWorldCameraFrame(prior, desired, changedPicture);

    expect(folded.svgCamera).toBe(desired);
    expect(folded.compositor).toEqual({ tx: 0, ty: 0, scale: 1 });
    expect(projectDeliveredWorldPoint(folded, 423, 911)).toEqual({
      x: desired.tx + desired.scale * 423,
      y: desired.ty + desired.scale * 911,
    });
  });
});
