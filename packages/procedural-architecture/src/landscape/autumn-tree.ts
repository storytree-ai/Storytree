// autumn-tree.ts — the big storybook autumn tree, grown through the factory.
//
// The third cosy-island hero piece (grounded-art inc 10), and the second landscape object
// type after the standing stone (ADR-0217 D1: one factory module per object type). Authored
// to MATCH docs/research/grounded-art-concept/cosy-island-concept.png — a chunky warm trunk
// under a broad, low canopy of soft rounded crowns in autumn browns. Match the reference,
// never free-style (ADR-0214 D4 / ADR-0219); the concept image is not parsed (ADR-0217 D2).
//
// The canopy is a cluster of `dome` blobs. A dome's underside is a `soffit` whose normal
// points straight down, so the backface cull drops it before the ordering pass ever sees it
// — the blobs read as rounded tops with no flat discs hanging beneath them, and each dome's
// many smooth facets spread N·L into a soft gradient rather than two hard tones. That is what
// keeps this from being the over-rendered look the owner rejected on the baked stones (#832):
// soft shaded volumes, not busy faceted solids.
//
// Nothing types a coordinate. The blobs are placed in FRACTIONS of the crown radius against a
// wide `crown-core` they are all attached to (a narrow trunk cannot host a wide canopy —
// attachment asks for contact, and only the core is wide enough to give it), so scaling the
// crown scales the whole canopy coherently.

import { building, frustum, dome } from '../procedural-utils.js';
import type { BuildingModel } from '../procedural-utils.js';
import { THEMES } from '../render-svg.js';

export interface AutumnTreeParams {
  style_theme: string;
  light_angle: number;
  /** height of the trunk from grade, world units */
  trunkHeight: number;
  /** circumradius of the trunk at the foot */
  trunkRadius: number;
  /** circumradius of the canopy core — the canopy scales off this */
  crownRadius: number;
}

export const DEFAULTS: AutumnTreeParams = {
  style_theme: 'autumn',
  light_angle: 135,
  trunkHeight: 9,
  trunkRadius: 3.6,
  crownRadius: 8.5,
};

/**
 * One canopy bump, in FRACTIONS so the whole canopy scales with `crownRadius`:
 *   dx, dy  offset from the core centre, as a fraction of the crown radius
 *   dz      height up the core, as a fraction of the core height
 *   r, h    the bump's own radius and rise, as fractions of the crown radius
 *
 * A fixed table (not seeded jitter) because a hero is one specific silhouette matched to
 * the concept, not a family — and a fixed table is byte-deterministic by construction.
 *
 * The bumps sit HIGH on the core (dz ≈ 0.7–0.85) so they intersect only its upper cap
 * shallowly. That is deliberate cost control: station 3 splits every interpenetrating
 * polygon, so a canopy of deeply-overlapping blobs explodes the node count (an early cut
 * baked to 2,591 nodes / 931 splits). A broad, bulged CORE does the whole silhouette and
 * the skirt; the bumps only stipple the top, so the split count stays a few dozen.
 */
const BUMPS: Array<{ dx: number; dy: number; dz: number; r: number; h: number }> = [
  { dx: -0.32, dy: 0.06, dz: 0.72, r: 0.54, h: 0.56 },
  { dx: 0.3, dy: -0.18, dz: 0.76, r: 0.5, h: 0.52 },
  { dx: 0.04, dy: 0.26, dz: 0.82, r: 0.48, h: 0.5 },
];

export function autumnTree(params: Partial<AutumnTreeParams> = {}): BuildingModel {
  const p = { ...DEFAULTS, ...params };

  const style = p.style_theme in THEMES ? p.style_theme : 'autumn';
  const trunkH = Math.max(5, p.trunkHeight);
  const trunkR = Math.max(1.6, p.trunkRadius);
  const crownR = Math.max(5, p.crownRadius);

  const b = building({ name: 'autumn tree', style, lightAngle: p.light_angle });

  // --- the trunk: a chunky tapering frustum. Seven sides read as an organic bole rather
  //     than a machined post, and it narrows a little toward the canopy.
  b.add('trunk', frustum({ sides: 7, r0: trunkR, r1: trunkR * 0.72, h: trunkH, rot: 12 }), {
    ground: true,
    material: 'wall',
  });

  // --- the canopy core: a broad, bulged dome that carries the whole silhouette AND the
  //     wide skirt (the bulge pushes the profile outward partway up). Attached LOW on the
  //     trunk (not resting on its top) so the canopy envelops the upper bole and only a
  //     chunky base of trunk shows below it — the concept's low, broad read. Coarse on
  //     purpose (12 sides): a dome's facets are smoothed, so N·L still reads a round shell.
  const coreH = crownR * 0.95;
  const coreBaseDz = trunkH * 0.72;
  b.add('crown-core', dome({ r: crownR, h: coreH, sides: 12, rings: 4, bulge: crownR * 0.16 }), {
    attached: 'trunk',
    dz: coreBaseDz,
    material: 'foliage',
  });

  // --- the bumps: a few small domes stippling the top of the core so the crown reads bumpy
  //     rather than as one smooth ball. Each attached to the wide core, sitting high so it
  //     only shallowly intersects it (the cost control described on BUMPS).
  BUMPS.forEach((bump, i) => {
    b.add(
      `crown-${i}`,
      dome({ r: crownR * bump.r, h: crownR * bump.h, sides: 9, rings: 3 }),
      {
        attached: 'crown-core',
        dz: coreH * bump.dz,
        at: { dx: crownR * bump.dx, dy: crownR * bump.dy },
        material: 'foliage',
      },
    );
  });

  return b.model();
}

/** How many parts a given parameter set produces — the test's oracle: trunk + core + bumps. */
export const expectedTreePartCount = (): number => 2 + BUMPS.length;
