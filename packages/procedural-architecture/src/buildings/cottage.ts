// cottage.ts — the shingled storybook cottage, authored through the factory.
//
// The first of the cosy-island hero pieces (grounded-art inc 10). Authored to MATCH
// docs/research/grounded-art-concept/cosy-island-concept.png — a warm timber-framed
// cottage with a steep shingle roof, a big warm-glow window and a low door — never
// free-styled (ADR-0214 D4 / ADR-0219: match the reference, improving the art is a
// non-goal). Per ADR-0217 D2 the concept image is NOT parsed: no pixel or path from it
// appears here; what is taken is the shape language.
//
// Nothing here types a coordinate. Corner posts stand at the derived corners of the
// body, the roof's rise falls out of a pitch, and every aperture is sized from the
// ACTUAL facet it is cut into so the checker is green across the parameter space rather
// than at one lucky build.
//
// It is a FIXED hero (minimal parameters): the shipped defaults ARE the asset the owner
// eyeballs. The parameters exist so the factory can be exercised across a range, not so
// an island varies it.

import { building, box, gable } from '../procedural-utils.js';
import type { BuildingModel } from '../procedural-utils.js';
import { THEMES } from '../render-svg.js';

const MARGIN = 0.6; // == check()'s default `margin`
const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));

export interface CottageParams {
  /** footprint width (east–west), world units */
  width_x: number;
  /** footprint depth (north–south), world units */
  width_y: number;
  style_theme: string;
  light_angle: number;
  /** wall height from grade to eave */
  wallHeight: number;
  /** roof rise as a fraction of the roof span — >1 is a steep storybook pitch */
  roofPitch: number;
  /** how far the eaves overhang the walls each side */
  eaveOverhang: number;
  /** the square section of a corner timber post */
  postWidth: number;
}

export const DEFAULTS: CottageParams = {
  width_x: 11,
  width_y: 9,
  style_theme: 'cottage',
  light_angle: 135,
  wallHeight: 7,
  roofPitch: 1.05,
  eaveOverhang: 0.9,
  postWidth: 0.8,
};

export function cottage(params: Partial<CottageParams> = {}): BuildingModel {
  const p = { ...DEFAULTS, ...params };

  const style = p.style_theme in THEMES ? p.style_theme : 'cottage';
  const w = Math.max(6, p.width_x);
  const d = Math.max(5, p.width_y);
  const wallH = Math.max(2 * MARGIN + 2.4, p.wallHeight);
  const pitch = clamp(p.roofPitch, 0.5, 1.6);
  const overhang = clamp(p.eaveOverhang, 0, 2);
  const postW = clamp(p.postWidth, 0.4, 1.4);

  const b = building({ name: 'cottage', style, lightAngle: p.light_angle });

  // --- the body. Cream plaster walls between the timber frame.
  b.add('body', box({ w, d, h: wallH }), { ground: true, material: 'wall' });

  // --- corner timber posts. Four square posts standing at the body's corners, each half
  //     buried in the wall so its outer edges read as the exposed frame of a timber house.
  //     Grounded (not attached) — a post carries load, it does not hang off the wall — and
  //     the checker has nothing to say about two grounded parts sharing space.
  const hw = w / 2;
  const hd = d / 2;
  const corners: Array<[number, number]> = [
    [hw, hd],
    [hw, -hd],
    [-hw, hd],
    [-hw, -hd],
  ];
  corners.forEach(([cx, cy], i) => {
    b.add(`post-${i}`, box({ w: postW, d: postW, h: wallH }), {
      ground: true,
      at: { dx: cx, dy: cy },
      material: 'trim',
    });
  });

  // --- the steep shingle roof. A gable prism whose ridge runs along y (north–south), so
  //     the camera (bearing 45) sees one long roof slope on the +x side and the gable end
  //     on the +y side — the storybook 3/4 read. It oversails the walls by `overhang` on
  //     every side, which the checker allows as a deliberate overhang (its centre stays
  //     over the body, so it cannot tip).
  const roofSpan = w + overhang * 2;
  const roofH = roofSpan * 0.5 * pitch;
  b.add('roof', gable({ w: roofSpan, d: d + overhang * 2, h: roofH }), { on: 'body', material: 'roof' });

  // --- openings on the two camera-facing facets. facet-at-bearing keeps this aimed at the
  //     camera whatever the light angle: the door on the +x wall (east), the big glowing
  //     window on the +y wall (south). Both dimensions are DERIVED from what the facet can
  //     legally host, so no parameter combination starves them.
  const eastWall = b.facetAtBearing('body', 0); // +x, spans depth `d`
  const southWall = b.facetAtBearing('body', 90); // +y, spans width `w`

  // The door, centred on the east wall and standing on grade.
  const doorW = clamp(d * 0.26, 1.6, 2.6);
  const doorH = clamp(wallH * 0.62, 2.6, wallH - MARGIN);
  b.aperture('door', { host: 'body', facet: eastWall, cu: 0, sill: 0, w: doorW, h: doorH, kind: 'door' });

  // The window — a big warm-glow casement, centred on the south wall and sat a little
  // above the sill line. Width from the half-facet less the margin; height a generous
  // fraction of the wall that still clears the head margin.
  const winW = clamp(w * 0.4, 2.2, w - 2 * MARGIN - 1);
  const winH = clamp(wallH * 0.5, 2.4, wallH - 2 * MARGIN);
  const winSill = clamp((wallH - winH) * 0.55, MARGIN, wallH - MARGIN - winH);
  b.aperture('window', { host: 'body', facet: southWall, cu: 0, sill: winSill, w: winW, h: winH });

  // --- a flat stone doorstep abutting the door. A shallow slab you step up onto (its top
  //     is a hair above grade), spanning across the doorway rather than reaching away as a
  //     jetty — the same landing shape the pagoda's steps use.
  const stepOut = 1.6;
  b.add('step', box({ w: stepOut, d: doorW * 1.8, h: 0.3 }), {
    ground: true,
    at: { dx: hw + stepOut / 2 - 0.2, dy: 0 },
    material: 'stone',
  });

  return b.model();
}
