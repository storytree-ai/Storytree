// gazebo.ts — the open garden pavilion, authored through the factory.
//
// The second cosy-island hero piece (grounded-art inc 10), authored to MATCH
// docs/research/grounded-art-concept/cosy-island-concept.png — a small square timber
// pavilion, open on every side, with a hipped shingle roof and a bench tucked under it.
// Match the reference, never free-style (ADR-0214 D4 / ADR-0219); the concept image is
// not parsed (ADR-0217 D2).
//
// The interesting part-tree problem here is that a roof rests on FOUR posts and the
// builder gives a part exactly one parent. The resolution is a top plate: the four posts
// stand ON the floor, a `plate` is ATTACHED across their tops (attachment only asks for
// contact, which the wide plate has with the corner post it names), and the roof stands
// ON the plate. Every relation is declared, nothing floats, nothing is typed as a
// coordinate.

import { building, box, flaredRoof, frustum, DEG } from '../procedural-utils.js';
import type { BuildingModel } from '../procedural-utils.js';
import { THEMES } from '../render-svg.js';

const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));
/** A 4-gon's circumradius that puts its FACE midpoint at distance `d` from the centre. */
const radiusForFace = (dist: number): number => dist / Math.cos(45 * DEG);

export interface GazeboParams {
  /** footprint width of the square deck, world units */
  width: number;
  style_theme: string;
  light_angle: number;
  /** clear height under the eaves */
  postHeight: number;
  /** the square section of a corner post */
  postWidth: number;
  /** roof rise as a fraction of the eave span */
  roofPitch: number;
  /** how far the eaves oversail the posts */
  eaveOverhang: number;
}

export const DEFAULTS: GazeboParams = {
  width: 8,
  style_theme: 'gazebo',
  light_angle: 135,
  postHeight: 7,
  postWidth: 0.7,
  roofPitch: 0.62,
  eaveOverhang: 0.85,
};

export function gazebo(params: Partial<GazeboParams> = {}): BuildingModel {
  const p = { ...DEFAULTS, ...params };

  const style = p.style_theme in THEMES ? p.style_theme : 'gazebo';
  const width = Math.max(5, p.width);
  const postH = Math.max(3, p.postHeight);
  const postW = clamp(p.postWidth, 0.4, 1.2);
  const overhang = clamp(p.eaveOverhang, 0.4, 2.2);
  const pitch = clamp(p.roofPitch, 0.35, 1.1);

  const b = building({ name: 'gazebo', style, lightAngle: p.light_angle });

  // --- the deck: a low timber platform the whole pavilion stands on.
  const deckH = 0.5;
  b.add('deck', box({ w: width, d: width, h: deckH }), { ground: true, material: 'wall' });

  // --- four corner posts, standing ON the deck. Set in from the edge so they tuck UNDER the
  //     roof canopy (the eave line reads cleanly above their caps, no peeking post-tops). Each
  //     footprint is fully carried by the deck.
  const inset = width / 2 - postW * 2.0;
  const corners: Array<[number, number]> = [
    [inset, inset],
    [inset, -inset],
    [-inset, inset],
    [-inset, -inset],
  ];
  corners.forEach(([cx, cy], i) => {
    b.add(`post-${i}`, box({ w: postW, d: postW, h: postH }), {
      on: 'deck',
      at: { dx: cx, dy: cy },
      material: 'trim',
    });
  });

  // --- the top plate: a square beam ring fixed ACROSS the tops of the posts. It is attached
  //     to one post (attachment asks only for contact, which a plate spanning the whole
  //     footprint plainly has) and sits exactly at post height, so it caps all four. A little
  //     depth lifts the eave line a clear margin above the post caps.
  const plateH = 0.8;
  const plateW = inset * 2 + postW;
  b.add('plate', box({ w: plateW, d: plateW, h: plateH }), {
    attached: 'post-0',
    dz: postH,
    material: 'trim',
  });

  // --- the hipped shingle roof, standing ON the plate and oversailing it. A 4-gon flared
  //     roof spun corner-to-camera. It tapers nearly to a POINT (a tiny top face) so the apex
  //     reads as a peak, not a dark recessed socket. Its eaves sit a clear margin above the
  //     inset post caps and oversail them, so the canopy encloses the posts with no peeking
  //     tops. Its footprint is wider than the plate, so the checker treats the eaves as a
  //     deliberate overhang and only asks that its centre stays over the plate — it does.
  const eaveReach = width / 2 + overhang;
  const roofH = width * pitch;
  b.add(
    'roof',
    flaredRoof({
      sides: 4,
      rot: 45,
      r0: radiusForFace(eaveReach),
      r1: radiusForFace(width * 0.05),
      h: roofH,
      sweep: 1.1,
    }),
    { on: 'plate', material: 'roof' },
  );

  // --- a small finial capping the peak: a low, blunt knob, not a needle in a socket.
  b.add('finial', frustum({ sides: 8, r0: 0.32, r1: 0.14, h: 0.65 }), { on: 'roof', material: 'trim' });

  // --- the bench, tucked under the roof: a seat plank and a low back, both ON the deck and
  //     set toward the far side so the open near side reads into the interior.
  const benchDepth = 1.2;
  const benchLen = width * 0.5;
  const benchY = -width * 0.22;
  b.add('bench-seat', box({ w: benchLen, d: benchDepth, h: 1.4 }), {
    on: 'deck',
    at: { dx: 0, dy: benchY },
    material: 'cushion',
  });
  // `at` on a part is relative to its PARENT's centre — the seat is already at benchY, so
  // the back only needs the offset to the seat's far edge, not benchY again.
  b.add('bench-back', box({ w: benchLen, d: 0.35, h: 1.4 }), {
    on: 'bench-seat',
    at: { dx: 0, dy: -benchDepth / 2 + 0.18 },
    material: 'trim',
  });

  return b.model();
}
