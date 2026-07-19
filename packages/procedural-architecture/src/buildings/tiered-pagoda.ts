// tiered-pagoda.ts — a stacked temple tower, authored through the factory.
//
// Re-authored from `docs/research/forest-house-art/tiered-pagoda.svg`, one of the
// nineteen hand-drawn houses. Per ADR-0217 decision 2 the reference informs the KIT and
// is never parsed: no path data from that file appears here, and nothing about it was
// measured. What was taken is the shape language — a stone plinth, N narrowing storeys,
// each capped by a roof that overhangs far and sweeps concave, a finial on top.
//
// WHY THIS ONE. Every tier's roof overhangs the storey above it AND the storey below,
// so the model is a stack of deliberate overlaps in depth — the case a centroid sort
// gets wrong and station 3 exists for. It is the hardest occlusion test in the gallery
// and it needed no hand-tuning to come out right, which is the claim being made.
//
// Nothing here types a coordinate. Tier k's width falls out of `taper^k`, every roof
// radius falls out of the wall it caps plus the overhang, and the eave that must clear
// the storey above is DERIVED rather than nudged until it looked right.

import { building, box, flaredRoof, frustum, DEG } from '../procedural-utils.js';
import type { BuildingModel } from '../procedural-utils.js';
import { THEMES } from '../render-svg.js';

const MARGIN = 0.6; // == check()'s default `margin`
const MIN_WIN_W = 0.9;
const MIN_WIN_H = 0.8;
/** A 4-gon's circumradius that puts its FACE midpoint at distance `d` from the centre. */
const radiusForFace = (d: number): number => d / Math.cos(45 * DEG);

const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));

export interface PagodaParams {
  // unified UI parameters
  floors: number;
  width_x: number;
  width_y: number;
  style_theme: string;
  light_angle: number;
  // pagoda parameters
  /** how much narrower each storey is than the one below */
  taper: number;
  storeyHeight: number;
  /** how far each roof reaches past its own wall */
  eaveOverhang: number;
  roofHeight: number;
  /** >1 bows the roof profile inward; 1 is a plain straight hip */
  sweep: number;
  plinthHeight: number;
}

export const DEFAULTS: PagodaParams = {
  // unified UI parameters
  floors: 3,
  width_x: 11,
  width_y: 11,
  style_theme: 'temple',
  light_angle: 135,
  // pagoda parameters
  taper: 0.84,
  storeyHeight: 4.2,
  eaveOverhang: 1.5,
  roofHeight: 1.7,
  sweep: 1.5,
  plinthHeight: 0.3,
};

export function tieredPagoda(params: Partial<PagodaParams> = {}): BuildingModel {
  const p = { ...DEFAULTS, ...params };

  const tiers = Math.round(clamp(p.floors, 2, 5));
  const taper = clamp(p.taper, 0.62, 0.92);
  const style = p.style_theme in THEMES ? p.style_theme : 'timber';
  const base = Math.min(p.width_x, p.width_y);
  const storeyH = Math.max(2 * MARGIN + MIN_WIN_H, p.storeyHeight);
  const roofH = Math.max(0.8, p.roofHeight);

  const b = building({ name: 'tiered pagoda', style, lightAngle: p.light_angle });

  // --- plinth. Deliberately shallow: a door on the ground storey opens onto its top,
  //     and check()'s door-reachable rule wants a threshold you can step up to.
  const plinthH = clamp(p.plinthHeight, 0.15, 0.34);
  const plinthHalf = base * 0.62;
  b.add('plinth', box({ w: plinthHalf * 2, d: plinthHalf * 2, h: plinthH }), { ground: true, material: 'stone' });

  // --- one storey at a time: wall, then the roof that caps it. Each tier stands on the
  //     ROOF below, so its base z is the previous roof's ridge — derived, never typed.
  let widthBelow = 0;
  for (let k = 0; k < tiers; k++) {
    const w = base * Math.pow(taper, k);
    const wallId = `tier-${k}-wall`;
    const roofId = `tier-${k}-roof`;

    b.add(wallId, box({ w, d: w, h: storeyH }), { on: k === 0 ? 'plinth' : `tier-${k - 1}-roof` });

    // The eave reaches `eaveOverhang` past its own wall. On the tiers above the first
    // it may not reach so far that it overhangs the roof BELOW it — that reads as an
    // upside-down stack — so the overhang is clamped by the storey it sits on.
    const room = k === 0 ? p.eaveOverhang : Math.min(p.eaveOverhang, (widthBelow - w) / 2 + p.eaveOverhang * 0.55);
    const overhang = Math.max(0.6, room);
    b.add(
      roofId,
      flaredRoof({
        sides: 4,
        rot: 45,
        r0: radiusForFace(w / 2 + overhang),
        r1: radiusForFace(w * 0.3),
        h: roofH,
        sweep: Math.max(1, p.sweep),
      }),
      { on: wallId },
    );

    // --- openings on the two faces the camera can see. Every dimension is DERIVED from
    //     what the facet can legally host, so the parameter space is green rather than
    //     one lucky build: width from the half-facet less the margin, height from the
    //     storey less two margins, and on the ground storey the door claims the centre
    //     of its facet first — the windows are then placed in what is left beside it.
    const half = w / 2;
    const winH = Math.max(MIN_WIN_H, Math.min(storeyH - 2 * MARGIN, storeyH * 0.46));
    // Sat high in the storey on purpose: the roof below overhangs, and at this camera
    // angle it genuinely occludes the bottom of the wall above it.
    const sill = Math.min(storeyH - MARGIN - winH, MARGIN + (storeyH - 2 * MARGIN - winH) * 0.72);
    const fits = (cu: number, ww: number): boolean =>
      Math.abs(cu) + ww / 2 <= half - MARGIN && sill >= MARGIN && sill + winH <= storeyH - MARGIN;

    const front = b.facetAtBearing(wallId, 0);
    const side = b.facetAtBearing(wallId, 90);

    if (k === 0) {
      // The door, centred on the front facet and standing on the plinth.
      const doorW = Math.min(2.2, w * 0.22);
      const doorH = Math.min(storeyH - MARGIN, 2.9);
      // The step spans ACROSS the doorway rather than reaching away from it — a
      // landing, not a jetty. Its depth is the protrusion, its width follows the door.
      const stepOut = 1.8;
      b.add('steps', box({ w: stepOut, d: doorW * 2.1, h: plinthH }), {
        ground: true,
        at: { dx: plinthHalf + stepOut / 2 - 0.35, dy: 0 },
        material: 'stone',
      });
      b.aperture('door', { host: wallId, facet: front, cu: 0, sill: 0, w: doorW, h: doorH, kind: 'door' });

      // Windows flanking it — offset by half the door plus a clear margin each side,
      // and only cut if the facet genuinely has the room.
      const flankW = Math.max(MIN_WIN_W, Math.min(w * 0.2, 1.8));
      const flankCu = doorW / 2 + MARGIN + flankW / 2;
      if (fits(flankCu, flankW)) {
        b.aperture(`win-${k}-l`, { host: wallId, facet: front, cu: -flankCu, sill, w: flankW, h: winH });
        b.aperture(`win-${k}-r`, { host: wallId, facet: front, cu: flankCu, sill, w: flankW, h: winH });
      }
    } else {
      const winW = Math.max(MIN_WIN_W, Math.min(w * 0.34, (half - MARGIN) * 1.2));
      if (fits(0, winW)) b.aperture(`win-${k}-a`, { host: wallId, facet: front, cu: 0, sill, w: winW, h: winH });
    }

    const sideW = Math.max(MIN_WIN_W, Math.min(w * 0.34, (half - MARGIN) * 1.2));
    if (fits(0, sideW)) b.aperture(`win-${k}-b`, { host: wallId, facet: side, cu: 0, sill, w: sideW, h: winH });

    widthBelow = w;
  }

  // --- finial: the mast and its tip, standing on the topmost ridge.
  const topRoof = `tier-${tiers - 1}-roof`;
  b.add('finial-mast', frustum({ sides: 8, r0: 0.34, r1: 0.16, h: roofH * 1.9 }), { on: topRoof, material: 'trim' });
  b.add('finial-tip', frustum({ sides: 8, r0: 0.42, r1: 0, h: 0.9 }), { on: 'finial-mast', material: 'trim' });

  return b.model();
}
