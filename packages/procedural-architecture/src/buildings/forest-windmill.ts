// forest-windmill.ts — one procedural building: an octagonal smock windmill.
//
// Nothing here types a position. Every part declares a STRUCTURAL RELATION
// (`ground` / `on` / `attached`) and every dimension falls out of a named
// parameter or another dimension. The two numbers that would normally be
// hand-fudged — how tall the tower must be so a downward sail never touches the
// ground, and how wide a window may be on a tapering facet — are DERIVED here,
// which is why the whole parameter space is green rather than one lucky build.

import { building, box, frustum, dome, DEG } from '../procedural-utils.js';
import type { BuildingModel, Facet, Rotation } from '../procedural-utils.js';
import { THEMES } from '../render-svg.js';

// ---------------------------------------------------------------------------
// Constants that mirror the frozen checker. If check()'s defaults move, these
// move with them — they are the same physics, restated so it can be derived
// FORWARD instead of discovered as a violation.
// ---------------------------------------------------------------------------

const MARGIN = 0.6; // == check()'s default `margin`
const GROUND_CLEARANCE = 1.5; // world units a swept sail keeps above z=0
const MIN_WIN_HALF = 0.35; // narrowest half-window we are willing to cut
const MIN_WIN_H = 0.7; // shortest window worth cutting
const MIN_STOREY_H = 2 * MARGIN + MIN_WIN_H; // a storey that can legally hold one
const SIDES = 8; // an octagonal smock — 8 facets read as round, and are wide
const HUB_FRAC = 0.55; // where up the cap the sail axle sits

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

export interface WindmillParams {
  // unified UI parameters
  floors: number;
  width_x: number;
  width_y: number;
  style_theme: string;
  light_angle: number;
  // windmill parameters
  bladeCount: number;
  bladeLength: number;
  sailAngle: number;
  taper: number;
  seed: number;
  slatsPerBlade: number;
  /** degrees from vertical — past 90 the tail slopes DOWN and back */
  tailAngle: number;
  jitter: number;
}

export const DEFAULTS: WindmillParams = {
  // unified UI parameters
  floors: 2,
  width_x: 12,
  width_y: 12,
  style_theme: 'brick',
  light_angle: 135,
  // windmill parameters
  bladeCount: 4,
  bladeLength: 11,
  sailAngle: 22,
  taper: 0.6,
  seed: 7,
  slatsPerBlade: 4,
  tailAngle: 118,
  jitter: 0.07,
};

/**
 * A rigid-body offset expressed in the ROTATED frame of a sail part.
 * `along` runs out the blade axis, `across` runs sideways within the sail wheel.
 * Both directions come from the blade's own rotation angle, so this is the
 * relation restated — not a coordinate typed by hand.
 */
function inBladeFrame(thetaRad: number, along: number, across: number): { at: { dx: number; dy: number }; dz: number } {
  const s = Math.sin(thetaRad);
  const c = Math.cos(thetaRad);
  return {
    at: { dx: s * along + c * across, dy: 0 },
    dz: c * along - s * across,
  };
}

/** Farthest reach of a rotating box from the hub axis, over ALL sail angles. */
const sweepRadius = (along: number, across: number): number => Math.hypot(along, across);

export function forestWindmill(params: Partial<WindmillParams> = {}): BuildingModel {
  const p = { ...DEFAULTS, ...params };

  const floors = Math.round(clamp(p.floors, 2, 5));
  const bladeCount = Math.round(clamp(p.bladeCount, 3, 8));
  const slats = Math.max(0, Math.round(p.slatsPerBlade));
  const taper = clamp(p.taper, 0.42, 0.8);
  const style = p.style_theme in THEMES ? p.style_theme : 'timber';
  const rnd = mulberry32(Math.round(p.seed) || 1);
  const jitAmp = clamp(p.jitter, 0, 0.18);
  const jit = (): number => 1 + (rnd() * 2 - 1) * jitAmp;

  // --- tower radius ------------------------------------------------------
  // A regular n-gon facet is only `chord` wide, and it NARROWS with the taper.
  // The checker demands MARGIN clear on each side of an aperture, so a tower
  // can be too thin to legally host a window. Rather than shrink windows until
  // they vanish, derive the smallest radius that still affords one at the top,
  // where the taper has taken the most away.
  const halfChord = Math.sin(Math.PI / SIDES); // (facet width / 2) per unit radius
  const rForWindows = (MARGIN + MIN_WIN_HALF) / (halfChord * taper);
  const towerR0 = Math.max((Math.min(p.width_x, p.width_y) / 2) * 0.86, rForWindows);
  const towerR1 = towerR0 * taper;

  // --- cap ---------------------------------------------------------------
  // The cap must not overhang the tower's footprint or `support-overlap` bites.
  const capR = Math.min(towerR1 * 1.24, towerR0 * 0.98);
  const capH = capR * 1.02;

  // --- sails, sized before the tower because the tower height depends on them
  // `bladeLength` is a floor, not the whole story: a five-storey mill with the
  // default sails would look like a lighthouse, so the storey-driven height
  // (which does NOT depend on the sails) also sets a minimum. No cycle.
  const hFromFloors = towerR0 * 1.32 * floors;
  const L = Math.max(towerR0 * 0.8, p.bladeLength, hFromFloors * 0.55);
  const sparW = L * 0.055;
  const sparD = L * 0.045;
  const sailBaseW = L * 0.185;
  const sailLen = L * 0.74;
  const sailStart = L * 0.2;
  const sailD = L * 0.02;
  const slatH = L * 0.015;
  const slatD = sparD * 1.4;

  // Draw every blade's cosmetic jitter UP FRONT so the load-bearing hub height
  // below is derived from the dimensions that will actually be built. Each blade
  // carries its own width and offset, so no index can reach past the wheel.
  const blades = Array.from({ length: bladeCount }, () => {
    const w = sailBaseW * jit();
    return { w, across: ((sparW + w) / 2) * 0.92 };
  });

  // --- THE derivation that keeps `below-grade` unreachable -----------------
  // A sail pointing straight down puts its far corner `reach` below the axle.
  // Compute that corner exactly (spar, sail panel, outermost slat) and let it
  // set the minimum axle height. No sailAngle can then drive anything under z=0.
  let reach = sweepRadius(L, sparW / 2);
  for (const blade of blades) {
    const across = blade.across + (blade.w * 1.05) / 2;
    reach = Math.max(reach, sweepRadius(sailStart + sailLen + slatH, across));
  }

  // --- the stone base course ---------------------------------------------
  // Its height is DERIVED from the door it has to carry: a door cannot be
  // centred in its facet (its sill is pinned to the ground), so it needs a
  // facet barely taller than itself, or the painter's algorithm sorts the wall
  // in front of it. `MARGIN` is exactly the clearance the checker demands.
  const doorH = Math.max(towerR0 * 0.52, 1.8);
  const baseH = doorH + MARGIN;

  // --- tower height -------------------------------------------------------
  const hFromStoreys = MIN_STOREY_H * floors;
  const hFromSails = reach + GROUND_CLEARANCE - capH * HUB_FRAC - baseH;
  const shaftH = Math.max(hFromFloors, hFromStoreys, hFromSails, towerR0 * 2.2);
  const totalH = baseH + shaftH;

  // Each floor is its OWN stacked frustum segment rather than one tall shaft.
  // Structurally identical; visually it is what lets a window low on the tower
  // sort in front of the wall it is cut into, since the painter's algorithm
  // orders whole faces by their centroid — and a window centred in its own
  // storey shares that centroid exactly.
  const storeyH = shaftH / floors;
  const winH = clamp(storeyH * 0.3, MIN_WIN_H, storeyH - 2 * MARGIN);
  const winSill = (storeyH - winH) / 2;

  // ---------------------------------------------------------------------
  const b = building({ name: 'forest windmill', style, lightAngle: p.light_angle });

  /** A built part's facet, by index. Every index below comes from the part's own
   *  facet count, so a miss is a bug in this file rather than a case to handle. */
  const facetOf = (partId: string, index: number): Facet => {
    const facet = b.part(partId).shape.facets[index];
    if (!facet) throw new Error(`part '${partId}' has no facet ${index}`);
    return facet;
  };

  const towerRot = rnd() * (360 / SIDES);
  const rAt = (z: number): number => towerR0 + (towerR1 - towerR0) * (z / totalH);

  b.add(
    'base',
    frustum({ sides: SIDES, r0: rAt(0), r1: rAt(baseH), h: baseH, rot: towerRot }),
    { ground: true, material: 'stone' },
  );

  // The stack. Every segment derives its base from the top of the one below, so
  // the shaft cannot develop a gap or an overlap.
  for (let i = 0; i < floors; i++) {
    b.add(
      `tower-${i}`,
      frustum({
        sides: SIDES,
        r0: rAt(baseH + i * storeyH),
        r1: rAt(baseH + (i + 1) * storeyH),
        h: storeyH,
        rot: towerRot,
      }),
      { on: i === 0 ? 'base' : `tower-${i - 1}` },
    );
  }
  const topSeg = `tower-${floors - 1}`;

  // a low footing ring collared onto the base course
  b.add(
    'footing',
    frustum({
      sides: SIDES,
      r0: towerR0 * 1.13 * jit(),
      r1: towerR0 * 1.07,
      h: towerR0 * 0.1,
      rot: towerRot,
    }),
    { attached: 'base', dz: 0, material: 'stone' },
  );

  // the reefing stage, tucked under the cap — offset within the TOP segment, so
  // its height is derived from that segment rather than measured off the ground.
  const deckH = towerR0 * 0.09;
  const railH = towerR0 * 0.15;
  const galleryUp = Math.min(storeyH * 0.9, storeyH - deckH - railH - 0.05);
  const galleryZ = baseH + (floors - 1) * storeyH + galleryUp;
  const galleryR = rAt(galleryZ) * 1.44;
  b.add('gallery', frustum({ sides: SIDES, r0: galleryR, r1: galleryR, h: deckH, rot: towerRot }), {
    attached: topSeg,
    dz: galleryUp,
    material: 'trim',
  });
  b.add(
    'gallery-rail',
    frustum({ sides: SIDES, r0: galleryR * 0.985, r1: galleryR * 0.96, h: railH, rot: towerRot }),
    { on: 'gallery', material: 'trim' },
  );

  b.add('cap', dome({ r: capR, h: capH, sides: 14, rings: 4, bulge: capR * 0.07 }), { on: topSeg });
  b.add('finial', frustum({ sides: 6, r0: capR * 0.13, r1: 0, h: capR * 0.34 }), {
    on: 'cap',
    sink: capH * 0.2,
    material: 'trim',
  });

  // --- the sail assembly --------------------------------------------------
  // The hub is a real part with real thickness so the blades have something to
  // touch: `attachment-contact` is satisfied structurally, not by fudging.
  const hubR = capR * 0.24;
  const hubLen = capR * 0.9;
  b.add(
    'hub',
    frustum({ sides: 10, r0: hubR, r1: hubR * 0.86, h: hubLen }),
    { attached: 'cap', dz: capH * HUB_FRAC, at: { dx: 0, dy: capR * 0.5 }, rotate: { axis: 'x', deg: -90 }, material: 'trim' },
  );
  b.add('hub-nose', frustum({ sides: 10, r0: hubR * 0.86, r1: 0, h: hubR * 1.1 }), {
    attached: 'hub',
    dz: 0,
    at: { dx: 0, dy: hubLen * 0.95 },
    rotate: { axis: 'x', deg: -90 },
    material: 'trim',
  });

  blades.forEach((blade, i) => {
    const deg = (i * 360) / bladeCount + p.sailAngle;
    const th = deg * DEG;
    const spin: Rotation = { axis: 'y', deg };
    const w = blade.w;
    const across = blade.across;

    b.add(`sail-spar-${i}`, box({ w: sparW, d: sparD, h: L }), {
      attached: 'hub',
      dz: 0,
      at: { dx: 0, dy: hubLen * 0.9 },
      rotate: spin,
      material: 'trim',
    });

    b.add(`sail-cloth-${i}`, box({ w, d: sailD, h: sailLen }), {
      attached: `sail-spar-${i}`,
      ...inBladeFrame(th, sailStart, across),
      rotate: spin,
      material: 'stone', // pale sailcloth against the dark spar
    });

    for (let k = 0; k < slats; k++) {
      b.add(`sail-slat-${i}-${k}`, box({ w: w * 1.05, d: slatD, h: slatH }), {
        attached: `sail-cloth-${i}`,
        ...inBladeFrame(th, (sailLen * (k + 0.5)) / slats, 0),
        rotate: spin,
        material: 'trim',
      });
    }
  });

  // --- tail pole + fantail vane, raked DOWN and back, away from the sails ---
  // Past 90 degrees the pole descends, so it has the same below-grade problem the
  // sails do — and the same shape of fix: the drop is derived, and the pole is
  // shortened to fit the height it is actually mounted at.
  const tailDeg = clamp(p.tailAngle, 95, 150);
  const tailSin = Math.abs(Math.sin(tailDeg * DEG));
  const dropRate = Math.max(0, -Math.cos(tailDeg * DEG)); // vertical fall per unit of pole
  const tailRootZ = totalH + capH * 0.35;
  const poleD = capR * 0.1;
  const vaneH = capR * 0.62;
  const vaneD = capR * 0.09;
  const tailBudget = tailRootZ - GROUND_CLEARANCE - (vaneD / 2) * tailSin - vaneH * dropRate;
  const tailWant = capR * 2.3 * jit();
  const tailLen =
    dropRate > 1e-9 ? Math.max(capR * 0.4, Math.min(tailWant, tailBudget / (0.94 * dropRate))) : tailWant;
  const tailSpin: Rotation = { axis: 'x', deg: tailDeg };
  b.add('tail-pole', box({ w: poleD, d: poleD, h: tailLen }), {
    attached: 'cap',
    dz: capH * 0.35,
    at: { dx: 0, dy: -capR * 0.45 },
    rotate: tailSpin,
    material: 'trim',
  });
  b.add('tail-vane', box({ w: capR * 0.55, d: vaneD, h: vaneH }), {
    attached: 'tail-pole',
    dz: tailLen * 0.94 * Math.cos(tailDeg * DEG),
    at: { dx: 0, dy: -tailLen * 0.94 * Math.sin(tailDeg * DEG) },
    rotate: tailSpin,
    material: 'stone',
  });

  // --- apertures ----------------------------------------------------------
  // Facet width is read back off the built part, so the widths here and the
  // widths the checker measures can never disagree.
  /** Half the facet width at height `z` up part `id`, read off the built part. */
  const halfAt = (id: string, z: number): number => {
    const f = facetOf(id, 0);
    return (f.wBottom + (f.wTop - f.wBottom) * (z / f.height)) / 2;
  };

  const doorFacet = b.facetAtBearing('base', 45);
  const doorW = Math.min((halfAt('base', doorH) - MARGIN) * 2 * 0.8, doorH * 0.62);
  b.aperture('door', { host: 'base', facet: doorFacet, cu: 0, sill: 0, w: doorW, h: doorH, kind: 'door' });

  // Windows go on the facets the camera can actually see, ranked by how squarely
  // they face it (the same `n · (1,1,1)` the renderer culls on) — two columns, so
  // the bands stack into clean verticals instead of scattering around the back.
  const facing = (i: number): number => {
    const n = facetOf('tower-0', i).normal;
    return n.x + n.y + n.z;
  };
  const columns = [...Array(SIDES).keys()]
    .filter((i) => i !== doorFacet)
    .sort((a, c) => facing(c) - facing(a))
    .slice(0, 2);

  for (let i = 0; i < floors; i++) {
    const w = Math.min((halfAt(`tower-${i}`, winSill + winH) - MARGIN) * 2 * 0.8, winH * 0.8);
    columns.forEach((facet, k) => {
      b.aperture(`win-${i}-${k}`, { host: `tower-${i}`, facet, cu: 0, sill: winSill, w, h: winH });
    });
  }

  return b.model();
}
