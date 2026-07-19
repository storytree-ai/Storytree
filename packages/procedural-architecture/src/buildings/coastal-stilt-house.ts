// coastal-stilt-house.ts — a cabin held above the tideline on timber legs.
//
// Re-authored from `docs/research/forest-house-art/coastal-stilt-house.svg`, one of the
// nineteen hand-drawn houses. Per ADR-0217 decision 2 the reference informs the KIT and
// is never parsed: no path data from that file appears here. What was taken is the
// structure — a mast standing in the water, a deck it carries, crossed braces beneath,
// a steep-roofed cabin on top, and a ladder down.
//
// WHY THIS ONE. Two reasons, both about the machinery rather than the picture.
//
// It is a genuine INTERPENETRATION test: the braces cross each other and the mast under
// the deck, and the chimney is driven up through the roof. Those are the cases where no
// ordering of whole polygons is correct and station 3 has to split them.
//
// It is also the model that found a real hole in station 2. A door onto a raised deck
// opens metres above the ground, and `door-reachable` used to check only its height —
// so every stilt house, veranda and jetty was a violation. The rule now looks for
// something to STAND ON at the threshold, which is what it always meant.
//
// The load path is declared, not decorative: the mast is the part that reaches the
// ground, the deck rests on it, and everything else hangs off the deck. That is why
// `check()` can tell the difference between this and a cabin floating in mid-air.

import { building, box, frustum, gable } from '../procedural-utils.js';
import type { BuildingModel } from '../procedural-utils.js';
import { THEMES } from '../render-svg.js';

const MARGIN = 0.6; // == check()'s default `margin`
const MIN_WIN = 0.9;
const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));

/** Deterministic PRNG — jitter must be reproducible from `seed`, never Math.random. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function next(): number {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface StiltHouseParams {
  // unified UI parameters
  floors: number;
  width_x: number;
  width_y: number;
  style_theme: string;
  light_angle: number;
  // stilt-house parameters
  /** how far the deck stands above the waterline */
  stiltHeight: number;
  /** deck overhang past the cabin on every side */
  deckMargin: number;
  roofPitch: number;
  railHeight: number;
  seed: number;
  jitter: number;
}

export const DEFAULTS: StiltHouseParams = {
  // unified UI parameters
  floors: 1,
  width_x: 11,
  width_y: 10,
  style_theme: 'timber',
  light_angle: 135,
  // stilt-house parameters
  stiltHeight: 6.4,
  deckMargin: 1.9,
  roofPitch: 0.62,
  railHeight: 1.15,
  seed: 5,
  jitter: 0.05,
};

export function coastalStiltHouse(params: Partial<StiltHouseParams> = {}): BuildingModel {
  const p = { ...DEFAULTS, ...params };

  const style = p.style_theme in THEMES ? p.style_theme : 'timber';
  const cabinW = Math.max(5, p.width_x);
  const cabinD = Math.max(5, p.width_y);
  const stilt = clamp(p.stiltHeight, 2.5, 9);
  const margin = clamp(p.deckMargin, 0.8, 5);
  const deckW = cabinW + margin * 2;
  const deckD = cabinD + margin * 2;
  const deckThick = 0.55;
  const rnd = mulberry32(Math.round(p.seed) || 1);
  const jit = (amp: number): number => (rnd() * 2 - 1) * clamp(p.jitter, 0, 0.2) * amp;

  const b = building({ name: 'coastal stilt house', style, lightAngle: p.light_angle });

  // --- the load path. ONE part reaches the ground, and the deck rests on it: that is
  //     what makes the support chain checkable. The perimeter legs below are declared
  //     `attached` because that is what they are — stabilisers hanging off the deck,
  //     not four independent columns the single-parent relation cannot express anyway.
  b.add('mast', frustum({ sides: 6, r0: 1.05, r1: 0.85, h: stilt }), { ground: true, material: 'trim' });
  b.add('deck', box({ w: deckW, d: deckD, h: deckThick }), { on: 'mast' });

  // --- legs and braces, hung off the deck and reaching back down to the waterline.
  const legInset = 0.9;
  const legX = deckW / 2 - legInset;
  const legY = deckD / 2 - legInset;
  const corners: [number, number][] = [
    [legX, legY],
    [-legX, legY],
    [legX, -legY],
    [-legX, -legY],
  ];
  corners.forEach(([dx, dy], i) => {
    b.add(`leg-${i}`, box({ w: 0.62, d: 0.62, h: stilt }), {
      attached: 'deck',
      dz: -stilt,
      at: { dx: dx + jit(0.3), dy: dy + jit(0.3) },
      material: 'trim',
    });
  });

  // Knee braces from the mast out to the deck. Deliberately SHORT: a strut spanning the
  // full width would be almost horizontal — the deck is far wider than it is high — and
  // would read as a flat cross rather than as bracing. These pass through the mast,
  // which is the interpenetration station 3 has to split rather than sort.
  const braceRise = stilt * 0.42;
  const braceRun = legX * 0.62;
  const braceLen = Math.hypot(braceRun, braceRise);
  const braceTilt = (Math.atan2(braceRun, braceRise) * 180) / Math.PI;
  for (const [i, sign] of [1, -1].entries()) {
    b.add(`brace-x-${i}`, box({ w: 0.4, d: 0.4, h: braceLen }), {
      attached: 'deck',
      dz: -braceRise - 0.1,
      at: { dx: (-braceRun / 2) * sign, dy: 0 },
      rotate: { axis: 'y', deg: braceTilt * sign },
      material: 'trim',
    });
    b.add(`brace-y-${i}`, box({ w: 0.4, d: 0.4, h: braceLen }), {
      attached: 'deck',
      dz: -braceRise - 0.1,
      at: { dx: 0, dy: (braceRun / 2) * sign },
      rotate: { axis: 'x', deg: braceTilt * sign },
      material: 'trim',
    });
  }

  // --- the cabin and its roof.
  b.add('cabin', box({ w: cabinW, d: cabinD, h: 4.4 }), { on: 'deck' });
  const ridge = Math.max(2.2, cabinW * clamp(p.roofPitch, 0.4, 1.1));
  b.add('roof', gable({ w: cabinW * 1.12, d: cabinD * 1.06, h: ridge }), { on: 'cabin' });

  // The chimney starts at the cabin's head and rises PAST the ridge, so it genuinely
  // passes through the roof rather than being perched on it.
  b.add('chimney', box({ w: 1.1, d: 1.1, h: ridge * 0.8 + 1.4 }), {
    on: 'cabin',
    at: { dx: -cabinW * 0.3, dy: cabinD * 0.28 },
    material: 'stone',
  });

  // --- deck railing: corner posts plus the rails between them, on the two open sides.
  const railH = clamp(p.railHeight, 0.7, 1.8);
  corners.forEach(([dx, dy], i) => {
    b.add(`rail-post-${i}`, box({ w: 0.34, d: 0.34, h: railH }), {
      on: 'deck',
      at: { dx, dy },
      material: 'trim',
    });
  });
  // A rail joins the POSTS it runs between, so it is declared attached to one of them.
  // Hanging it off the deck instead put it 0.83 clear of anything it touched, and
  // `attachment-contact` said so.
  b.add('rail-x', box({ w: legX * 2, d: 0.2, h: 0.18 }), {
    attached: 'rail-post-2',
    dz: railH - 0.18,
    at: { dx: -legX, dy: 0 },
    material: 'trim',
  });
  b.add('rail-y', box({ w: 0.2, d: legY * 2, h: 0.18 }), {
    attached: 'rail-post-0',
    dz: railH - 0.18,
    at: { dx: 0, dy: -legY },
    material: 'trim',
  });

  // --- the ladder down, leaning off the deck edge. It is lifted clear of z=0 by more
  //     than the tilt swings its bottom corner, or it digs into the ground.
  const ladderTilt = 9;
  const ladderLift = 1.05 * Math.sin((ladderTilt * Math.PI) / 180) + 0.05;
  b.add('ladder', box({ w: 1.05, d: 0.22, h: stilt - ladderLift }), {
    attached: 'deck',
    dz: -(stilt - ladderLift),
    at: { dx: -deckW / 2 + 0.7, dy: -deckD * 0.3 },
    rotate: { axis: 'y', deg: -ladderTilt },
    material: 'trim',
  });

  // --- openings. Widths come from the FACET the aperture is cut into, not from the
  //     cabin's plan: the facet at bearing 0 spans the depth, the one at 90 spans the
  //     width, and reading the wrong one is how a window ends up past the corner.
  const front = b.facetAtBearing('cabin', 0);
  const side = b.facetAtBearing('cabin', 90);
  const facetHalf = (i: number): number => {
    const f = b.part('cabin').shape.facets[i];
    if (!f) throw new Error(`cabin has no facet ${i}`);
    return Math.min(f.wBottom, f.wTop) / 2;
  };
  const frontHalf = facetHalf(front);
  const sideHalf = facetHalf(side);

  const doorW = Math.min(2.2, frontHalf * 0.45);
  b.aperture('door', { host: 'cabin', facet: front, cu: frontHalf * 0.3, sill: 0, w: doorW, h: 3.1, kind: 'door' });

  const winH = 1.9;
  const sill = 1.5;
  const winW = Math.max(MIN_WIN, Math.min(2.3, frontHalf * 0.45));
  const frontCu = -(doorW / 2 + MARGIN + winW / 2);
  if (Math.abs(frontCu) + winW / 2 <= frontHalf - MARGIN) {
    b.aperture('win-front', { host: 'cabin', facet: front, cu: frontCu, sill, w: winW, h: winH });
  }

  const sideW = Math.max(MIN_WIN, Math.min(2.3, sideHalf * 0.4));
  const sideCu = Math.min(sideHalf * 0.4, sideHalf - MARGIN - sideW / 2);
  if (sideCu > sideW / 2 + MARGIN / 2) {
    b.aperture('win-side-a', { host: 'cabin', facet: side, cu: -sideCu, sill, w: sideW, h: winH });
    b.aperture('win-side-b', { host: 'cabin', facet: side, cu: sideCu, sill, w: sideW, h: winH });
  }

  return b.model();
}
