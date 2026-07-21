// forest-hut.ts — the cosy woodland hut, authored through the factory.
//
// A fresh cosy-island hero (grounded-art forest-hut increment), authored to MATCH
// docs/research/grounded-art-concept/forest-hut-concept.png — a small timber cabin with
// a steep shingled gable roof, a stone chimney trailing smoke, a round wooden door and
// one warm-lit window. Match the reference, never free-style (ADR-0214 D4 / ADR-0219);
// per ADR-0217 D2 the concept image is NOT parsed — no pixel or path from it appears
// here, only the shape language.
//
// It is the cottage's sibling and shares its bones — a box body under a gable roof — but
// three things distinguish it, and each is a declared relation rather than a decal:
//   * the roof is left materialless so its GABLE END reads as timber boards (the wall
//     family), not shingle — only the two sloping planes are the terracotta `roof`;
//   * a stone CHIMNEY seats into the downhill roof slope and rises clear of the ridge —
//     `attached` to the roof, its base sunk to the slope surface so it never floats;
//   * the door faces the camera on the GABLE END and the glowing window sits on the long
//     eaves side (the cottage puts them the other way round), so the front the eye reads
//     is the tall plank gable the concept leads with.
//
// Nothing here types a coordinate. Corner posts stand at the derived corners of the body,
// the roof's rise falls out of a pitch, the chimney's seat falls out of the roof surface
// height under its own downhill edge, and every aperture is sized from the ACTUAL facet it
// is cut into — so the checker is green across the parameter space, not at one lucky build.
//
// A FIXED hero (minimal parameters): the shipped defaults ARE the asset the owner eyeballs.
// The parameters exist so the factory can be exercised across a range, not so an island
// varies it.

import { building, box, gable } from '../procedural-utils.js';
import type { BuildingModel } from '../procedural-utils.js';
import { THEMES } from '../render-svg.js';

const MARGIN = 0.6; // == check()'s default `margin`
const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));

export interface ForestHutParams {
  /** footprint width of the gable END (the door side, east–west), world units */
  width_x: number;
  /** footprint depth of the long EAVES side (the window side, north–south), world units */
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
  /** the square section of the stone chimney stack */
  chimneyWidth: number;
}

export const DEFAULTS: ForestHutParams = {
  width_x: 9,
  width_y: 9.5,
  style_theme: 'foresthut',
  light_angle: 135,
  wallHeight: 6,
  roofPitch: 1.45, // steep and pointed — the concept leads with a tall gable
  eaveOverhang: 0.8,
  postWidth: 0.7,
  chimneyWidth: 1.7, // stout, not a needle
};

export function forestHut(params: Partial<ForestHutParams> = {}): BuildingModel {
  const p = { ...DEFAULTS, ...params };

  const style = p.style_theme in THEMES ? p.style_theme : 'foresthut';
  const w = Math.max(6, p.width_x);
  const d = Math.max(6, p.width_y);
  const wallH = Math.max(2 * MARGIN + 2.4, p.wallHeight);
  const pitch = clamp(p.roofPitch, 0.6, 1.7);
  const overhang = clamp(p.eaveOverhang, 0, 2);
  const postW = clamp(p.postWidth, 0.4, 1.2);
  const chimW = clamp(p.chimneyWidth, 1, 2.4);

  const b = building({ name: 'forest hut', style, lightAngle: p.light_angle });

  // --- the body. Warm timber-plank walls (a single flat facet each — the plank seams
  //     the concept draws are a texture the flat-vector renderer does not carry; the
  //     exposed frame below is what gives the timber read at map scale).
  b.add('body', box({ w, d, h: wallH }), { ground: true, material: 'wall' });

  // --- corner timber posts. Four square posts standing at the body's corners, each half
  //     buried in the wall so its outer edges read as the exposed frame of a timber cabin.
  //     Grounded (not attached) — a post carries load, it does not hang off the wall.
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
  //     the gable TRIANGLES cap the ±y ends and the two long slopes face ±x. Added with NO
  //     material override, so each face takes its own kind: the sloping planes are
  //     terracotta `roof`, and the gable-end triangles are `gable` — which this theme paints
  //     the SAME warm timber as the walls, so the front reads as a plank gable, not tile.
  //     It oversails the walls by `overhang` every side; the checker allows that as a
  //     deliberate overhang because the roof's centre stays over the body.
  const roofSpanX = w + overhang * 2;
  const roofH = roofSpanX * 0.5 * pitch;
  b.add('roof', gable({ w: roofSpanX, d: d + overhang * 2, h: roofH }), { on: 'body' });

  // --- the stone chimney. It seats into the +x (downhill, camera-right) roof slope near
  //     the ridge and rises clear of it. `attached` to the roof at a derived z: its base is
  //     dropped to the roof-surface height under its OWN downhill edge, so the uphill half
  //     buries into the slope and nothing floats. The stack then rises a fixed clearance
  //     above the ridge — the part of a chimney the eye actually reads.
  const ridgeZ = wallH + roofH;
  const chimX = w * 0.12; // just right of the ridge, high on the long +x slope
  const chimY = -d * 0.08; // eased back off the front gable, as the concept sets it
  const xOuter = chimX + chimW / 2; // the downhill edge, where the seat is taken
  // the gable's +x slope descends linearly from the ridge (x=0) to the eave; its surface
  // z under xOuter is the base the chimney sits its downhill edge on.
  const seatZ = wallH + roofH * (1 - xOuter / (roofSpanX / 2));
  const chimClearance = 1.3; // a short stack that just clears the ridge, as the concept
  const chimH = ridgeZ - seatZ + chimClearance;
  b.add('chimney', box({ w: chimW, d: chimW, h: chimH }), {
    attached: 'roof',
    dz: seatZ - wallH, // roof.baseZ == wallH, so this lands the base at seatZ
    at: { dx: chimX, dy: chimY },
    material: 'stone',
  });

  // --- the chimney cap: a low stone slab a touch wider than the stack, capping its crown.
  //     Wider than its support, so the checker treats it as a deliberate overhang (centre
  //     over the stack) rather than a piece that could tip.
  b.add('chimney-cap', box({ w: chimW + 0.5, d: chimW + 0.5, h: 0.5 }), {
    on: 'chimney',
    material: 'stone',
  });

  // --- openings. facet-at-bearing aims each at the camera whatever the light angle: the
  //     door on the +y gable end (south, camera-left), the glowing window on the +x long
  //     side (east, camera-right). Both are DERIVED from what the facet can legally host.
  const southWall = b.facetAtBearing('body', 90); // +y gable end, spans width `w`
  const eastWall = b.facetAtBearing('body', 0); // +x long side, spans depth `d`

  // The door, centred on the gable-end wall and standing on grade. The concept's door is
  // round-topped; a rectangular aperture is the closest the cutter offers (openings are
  // rectangles), so the arch is a look gap the render carries, not a shape we fake.
  const doorW = clamp(w * 0.3, 1.8, 2.9);
  const doorH = clamp(wallH * 0.68, 2.6, wallH - MARGIN);
  b.aperture('door', { host: 'body', facet: southWall, cu: 0, sill: 0, w: doorW, h: doorH, kind: 'door' });

  // The window — a single warm-glow casement on the shaded long side, sat above the sill
  // line. The concept's four-pane muntin grid is not a shape the cutter draws (one pane per
  // opening), so it stays one glowing pane, framed by the reveal.
  const winW = clamp(d * 0.34, 2.0, d - 2 * MARGIN - 1);
  const winH = clamp(wallH * 0.42, 2.2, wallH - 2 * MARGIN);
  const winSill = clamp((wallH - winH) * 0.5, MARGIN, wallH - MARGIN - winH);
  b.aperture('window', { host: 'body', facet: eastWall, cu: 0, sill: winSill, w: winW, h: winH });

  // --- a flat stone doorstep abutting the door on the +y side. A shallow slab you step up
  //     onto (its top a hair above grade), spanning across the doorway.
  const stepOut = 1.6;
  b.add('step', box({ w: doorW * 1.8, d: stepOut, h: 0.3 }), {
    ground: true,
    at: { dx: 0, dy: hd + stepOut / 2 - 0.2 },
    material: 'stone',
  });

  return b.model();
}
