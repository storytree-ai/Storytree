// stepping-stone.ts — one flat garden stepping stone, through the factory.
//
// The fourth cosy-island hero piece (grounded-art inc 10). Authored to MATCH
// docs/research/grounded-art-concept/cosy-island-concept.png — the pale, flat, rounded
// stones that thread a path from the cottage. Match the reference, never free-style
// (ADR-0214 D4 / ADR-0219); the concept image is not parsed (ADR-0217 D2).
//
// This is deliberately the LEAST rendered hero. The owner rejected the tall baked
// standing-stones (#832) as "messy and noisy rather than cosy," so a stepping stone is a
// LOW, rounded, many-sided slab wearing ONE warm stone colour: mostly a pale lit top with
// a rim that barely shades. One def; the composition (increment 11) scatters it along the
// path, so its own node cost is what matters and it stays a handful.

import { building, frustum } from '../procedural-utils.js';
import type { BuildingModel } from '../procedural-utils.js';
import { THEMES } from '../render-svg.js';

const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));

export interface SteppingStoneParams {
  style_theme: string;
  light_angle: number;
  /** circumradius of the slab at the foot */
  radius: number;
  /** the slab's rise — kept low on purpose, so it reads as a flag underfoot */
  height: number;
  /** top radius as a fraction of the base — a slight taper rounds the edge */
  topScale: number;
  /** more sides rounds the flag; the concept stones are pebble-round */
  sides: number;
}

export const DEFAULTS: SteppingStoneParams = {
  style_theme: 'pathstone',
  light_angle: 135,
  radius: 4.2,
  height: 0.8,
  topScale: 0.86,
  sides: 14,
};

export function steppingStone(params: Partial<SteppingStoneParams> = {}): BuildingModel {
  const p = { ...DEFAULTS, ...params };

  const style = p.style_theme in THEMES ? p.style_theme : 'pathstone';
  const sides = Math.max(6, Math.round(p.sides));
  const r0 = Math.max(1.5, p.radius);
  const r1 = Math.max(1, r0 * clamp(p.topScale, 0.6, 1));
  const h = clamp(p.height, 0.6, 3);

  const b = building({ name: 'stepping stone', style, lightAngle: p.light_angle });

  // One tapered slab, wearing ONE stone colour across every face so the only variation is
  // the soft N·L gradient — a pale lit top, a rim that barely darkens. Spun a little so a
  // vertex, not a flat face, meets the camera and the round edge reads.
  b.add('slab', frustum({ sides, r0, r1, h, rot: 180 / sides }), { ground: true, material: 'stone' });

  return b.model();
}
