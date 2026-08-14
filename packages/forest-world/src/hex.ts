// Hex grid (pointy-top, axial coordinates) — the lattice the forest world's
// territories grow on, plus the small SVG-path helpers the cells/coast render
// from. Pure geometry, browser-safe; the constants here are the studio's
// CANONICAL numbers (the studio wins every divergence from the website seed,
// ADR-0093).
//
// THE LATTICE IS A GROUND PLANE, AND IT IS SEEN THROUGH THE DECLARED CAMERA (ADR-0367 D1).
// `HEX_R` / `HEX_W` and the corner offsets are GROUND-plane quantities; every function here that
// hands back SCREEN coordinates projects them through `./camera.js` — the lattice pitch and the
// corner offsets by `groundFlattening` (sin θ), the tile extrusion by `uprightForeshortening`
// (cos θ), because an extrusion is a world height and not a ground distance. Pass an explicit
// `elevationDeg` to ask what the land looks like at another camera; `PLAN_VIEW_ELEVATION_DEG`
// recovers the pre-camera mapping exactly.

import {
  LAND_CAMERA_ELEVATION_DEG,
  groundFlattening,
  uprightForeshortening,
} from './camera.js';

export interface Pt {
  x: number;
  y: number;
}

export interface Axial {
  q: number;
  r: number;
}

export const HEX_R = 27; // centre → corner, in the GROUND plane
export const HEX_W = Math.sqrt(3) * HEX_R;

/**
 * The extrusion below a claimed tile, as a world HEIGHT. Named separately from the projected
 * offset so the two paint sites keep reading one already-projected number, and so the depth stops
 * being a bare screen constant the moment the land has a camera.
 */
export const TILE_DEPTH_WORLD = 8;

/**
 * The tile extrusion ON SCREEN — an upright world height through the declared camera, so it carries
 * cos θ where the lattice carries sin θ. Read by the two `tile-side` / `hex-side` paint sites, and
 * (as a layout term) by the studio's nameplate baseline and scene bounds.
 */
export const TILE_DEPTH = TILE_DEPTH_WORLD * uprightForeshortening();

export const axialKey = (h: Axial): string => `${h.q},${h.r}`;

/** Neighbour directions, indexed so AXIAL_DIRS[i] faces the edge corner i → i+1. */
export const AXIAL_DIRS: Axial[] = [
  { q: 1, r: -1 }, // NE  (edge between corners 0 and 1)
  { q: 1, r: 0 }, //  E  (1 → 2)
  { q: 0, r: 1 }, //  SE (2 → 3)
  { q: -1, r: 1 }, // SW (3 → 4)
  { q: -1, r: 0 }, // W  (4 → 5)
  { q: 0, r: -1 }, // NW (5 → 0)
];

/**
 * Axial coordinates → SCREEN pixels, through the declared land camera. The `r` axis runs into the
 * ground plane so its pitch foreshortens; the `q` axis runs across the screen so it does not.
 */
export function hexCenter(h: Axial, elevationDeg: number = LAND_CAMERA_ELEVATION_DEG): Pt {
  return {
    x: HEX_W * (h.q + h.r / 2),
    y: 1.5 * HEX_R * h.r * groundFlattening(elevationDeg),
  };
}

/**
 * The inverse of {@link hexCenter} — the map's hit test. It MUST read the same camera: an inverse
 * still dividing by a plan-view pitch would mis-key every click on an angled map.
 */
export function pixelToHex(p: Pt, elevationDeg: number = LAND_CAMERA_ELEVATION_DEG): Axial {
  const rf = p.y / (1.5 * HEX_R * groundFlattening(elevationDeg));
  const qf = p.x / HEX_W - rf / 2;
  const sf = -qf - rf;
  let q = Math.round(qf);
  let r = Math.round(rf);
  const s = Math.round(sf);
  const dq = Math.abs(q - qf);
  const dr = Math.abs(r - rf);
  const ds = Math.abs(s - sf);
  if (dq > dr && dq > ds) q = -r - s;
  else if (dr > ds) r = -q - s;
  // Normalise negative zero. Projecting the pitch and dividing it back out leaves a coordinate that
  // should be 0 sitting a few ulps below it, so `Math.round` hands back -0 — indistinguishable in
  // arithmetic but NOT under `assert.deepEqual`/`Object.is`, and this key is compared and interned.
  return { q: q + 0, r: r + 0 };
}

export function hexDist(a: Axial, b: Axial): number {
  return (Math.abs(a.q - b.q) + Math.abs(a.q + a.r - b.q - b.r) + Math.abs(a.r - b.r)) / 2;
}

/**
 * The six corners around the SCREEN point (cx, cy), corner 0 at the top, clockwise.
 *
 * `R` is a GROUND radius, so the corner offsets are ground-plane displacements and their y carries
 * the camera's flattening: the corners land on an ellipse of semi-axes (R, R·sin θ), not a circle.
 * Applying the same affine map to the pitch (in {@link hexCenter}) and to these offsets is what
 * keeps every shared edge shared — a projected lattice still CLOSES, where an arbitrary squash of
 * one but not the other would tear the substrate mesh open along its seams.
 */
export function hexCorners(
  cx: number,
  cy: number,
  R: number,
  elevationDeg: number = LAND_CAMERA_ELEVATION_DEG,
): Pt[] {
  const f = groundFlattening(elevationDeg);
  const pts: Pt[] = [];
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 180) * (60 * i - 90);
    pts.push({ x: cx + R * Math.cos(a), y: cy + R * Math.sin(a) * f });
  }
  return pts;
}

export function hexPath(
  cx: number,
  cy: number,
  R: number,
  elevationDeg: number = LAND_CAMERA_ELEVATION_DEG,
): string {
  return (
    hexCorners(cx, cy, R, elevationDeg)
      .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
      .join(' ') + ' Z'
  );
}

/** A closed polygon `d` string. */
export function polyPath(pts: Pt[]): string {
  if (pts.length === 0) return '';
  return (
    pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ') + ' Z'
  );
}
