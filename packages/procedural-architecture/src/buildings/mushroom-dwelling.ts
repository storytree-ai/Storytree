// mushroom-dwelling.ts — a storybook toadstool cottage, grown parametrically.
//
// Nothing here types a position. Every part declares its structural relation
// (`ground` / `on` / `attached`) and every dimension is derived from a named
// parameter or from another part's already-derived dimension — including the
// apertures, which are sized from the ACTUAL facet they are cut into rather
// than from a guessed number.
//
// Structure, bottom to top:
//   stem-0 .. stem-{floors-1}   the dwelling: tapering frustum storeys, each `on`
//                               the last, radii following an organic belly curve
//   collar                      the flared skirt where the stem meets the cap
//   cap                         a broad bulging dome — the whole silhouette
//   gills                       an inverted cone `attached` UNDER the cap
//   spots                       flattened domes `attached` to the cap
//   chimney                     a leaning flue `attached` through the cap shoulder
//   step / lantern              ground stoop and a porch light
//
// Apertures: one door on the camera-facing facet of stem-0 (threshold on grade),
// and one band of windows per storey.

import { building, frustum, dome, DEG } from '../procedural-utils.js';
import type { BuildingModel, Facet } from '../procedural-utils.js';

// The checker's contract constants. Sizes are derived FROM these so the model
// cannot be built into a shape the gate rejects.
export const MARGIN = 0.6; // invariants.check default `margin`

export interface MushroomParams {
  floors: number;
  width_x: number;
  width_y: number;
  style_theme: string;
  light_angle: number;

  // mushroom-specific
  /** cap radius as a multiple of the FOOT radius — the visible overhang */
  capSpread: number;
  /** outward push of the cap profile, as a fraction of cap radius */
  capBulge: number;
  /** cap height as a fraction of cap radius */
  capRise: number;
  storeyHeight: number;
  /** the door sizes its own ground band */
  doorHeight: number;
  /** 0..1 — how much organic wobble the stem carries */
  stemLean: number;
  spotCount: number;
  windowsPerFloor: number;
  seed: number;
  stemSides: number;
  capSides: number;
}

export const DEFAULTS: MushroomParams = {
  floors: 1,
  width_x: 15,
  width_y: 15,
  style_theme: 'mushroom',
  light_angle: 55, // lights the camera-facing facets (the view axis sits at 45)

  // mushroom-specific
  capSpread: 1.65,
  capBulge: 0.2,
  capRise: 0.95,
  storeyHeight: 5,
  doorHeight: 4,
  stemLean: 0.55,
  spotCount: 8,
  windowsPerFloor: 3,
  seed: 7,
  stemSides: 8,
  capSides: 20,
};

/** Deterministic PRNG — jitter must be reproducible from `seed`, never Math.random. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0 || 1;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Widest aperture a (possibly trapezoidal) facet can host between two height
 *  fractions, keeping the checker's edge margin. Derived, never guessed. */
function maxApertureWidth(facet: Facet, t0: number, t1: number): number {
  const widthAt = (t: number): number => facet.wBottom + (facet.wTop - facet.wBottom) * t;
  const half = Math.min(widthAt(t0), widthAt(t1)) / 2;
  return Math.max(0, half - MARGIN) * 2;
}

export function mushroomDwelling(params: Partial<MushroomParams> = {}): BuildingModel {
  const p = { ...DEFAULTS, ...params };

  const floors = Math.max(1, Math.min(3, Math.round(p.floors)));
  const sides = Math.max(6, Math.round(p.stemSides));
  const rnd = mulberry32(p.seed);
  const jitter = (amp: number): number => (rnd() - 0.5) * 2 * amp;

  // --- footprint --------------------------------------------------------
  // The frustum/dome generators are radial, so an anisotropic footprint is
  // averaged into a span; the aspect is carried by the ground stoop instead.
  const span = (p.width_x + p.width_y) / 2;
  const halfFactor = Math.sin(Math.PI / sides); // facet half-width per unit radius

  // The narrowest stem radius that can still host a real window with margin —
  // derived from the CHECKER's margin, so no parameter combination can starve it.
  const minWinHalf = 0.55;
  const minTopRadius = (MARGIN + minWinHalf) / halfFactor;

  // Stem belly profile: foot flare -> waist bulge -> neck, over normalised height.
  const footFlare = 1.45;
  const neck = 0.86;
  const belly = 0.1;
  // capSpread is measured against the FOOT, not the nominal stem radius — the foot
  // is the widest thing the cap has to out-reach, and it is the overhang the eye
  // actually reads. Basing it on stemR let the flare grow out to meet the cap.
  const stemR = Math.max(span / 2 / (p.capSpread * footFlare), minTopRadius / neck);
  const radiusAt = (u: number): number => stemR * (footFlare + (neck - footFlare) * u + belly * Math.sin(Math.PI * u));

  const capR = Math.max(span / 2, stemR * footFlare * p.capSpread);
  const capBulgeAbs = capR * p.capBulge;
  const capH = capR * p.capRise;
  /** the cap's own ring-radius profile, mirrored so parts can ride its surface */
  const capProfile = (t: number): number =>
    capR * Math.cos((t * Math.PI) / 2) + capBulgeAbs * Math.sin(t * Math.PI) * Math.cos((t * Math.PI) / 2);

  /** Inverse of the profile: how high the cap's UPPER surface stands at a given
   *  radius. Walks down from the crown so a bulged (non-monotonic) profile still
   *  resolves to the outer surface rather than the undercut beneath it. */
  const capHeightAtRadius = (rho: number): number => {
    const N = 240;
    for (let i = N; i > 0; i--) {
      const t = i / N;
      const tp = (i - 1) / N;
      const r = capProfile(t);
      const rp = capProfile(tp);
      if ((r >= rho) !== (rp >= rho)) {
        const f = (rho - r) / (rp - r || 1);
        return (t + (tp - t) * f) * capH;
      }
    }
    return 0;
  };

  // A storey must be tall enough for a window plus the checker's head/sill margins.
  const storeyH = Math.max(p.storeyHeight, MARGIN * 2 + 2.4);

  // The DOOR gets its own short ground band rather than sharing a full storey.
  // That is not decoration: an aperture is drawn in front of its wall only if it
  // wins the painter's-algorithm depth race, and depth grows with height. A wall
  // polygon's centroid sits at mid-facet, so a door pinned to the ground loses
  // to a tall facet and is painted over. Sizing the band to the door keeps the
  // two centroids together, and the renderer's outward nudge does the rest.
  const doorH = Math.max(2.2, p.doorHeight);
  const bandH = doorH + MARGIN * 1.15; // a sliver of wall above the head
  const stemH = bandH + floors * storeyH;

  // Spin the polygon so one facet looks straight at the isometric camera (bearing 45).
  const stemRot = 180 / sides;

  const b = building({
    name: 'mushroom dwelling',
    style: p.style_theme,
    lightAngle: p.light_angle,
  });

  /** A built part's facet, by index. `facetAtBearing` only ever returns a live one,
   *  so a miss here is a bug in this file rather than a case to handle. */
  const facetOf = (partId: string, index: number): Facet => {
    const facet = b.part(partId).shape.facets[index];
    if (!facet) throw new Error(`part '${partId}' has no facet ${index}`);
    return facet;
  };

  // --- stem: a threshold band, then one frustum per habitable storey -----
  // The belly curve is parameterised over the WHOLE stem, so the band and the
  // storeys read as one swelling trunk rather than a stack of tins.
  const courses = [{ id: 'threshold', h: bandH }];
  for (let k = 0; k < floors; k++) courses.push({ id: `stem-${k}`, h: storeyH });

  let below: string | null = null;
  let zCursor = 0;
  for (const course of courses) {
    const r0 = radiusAt(zCursor / stemH);
    const r1 = radiusAt((zCursor + course.h) / stemH);
    const shape = frustum({ sides, r0, r1, h: course.h, rot: stemRot });
    if (below === null) {
      b.add(course.id, shape, { ground: true });
    } else {
      // lean is a fraction of the taper this joint affords, so the course above
      // can never wander off the one below — the wobble lives inside the support.
      const room = (b.part(below).shape.radius - r0) * 0.35 * p.stemLean;
      const dir = rnd() * 360 * DEG;
      b.add(course.id, shape, {
        on: below,
        at: { dx: Math.cos(dir) * room, dy: Math.sin(dir) * room },
      });
    }
    below = course.id;
    zCursor += course.h;
  }
  // The loop always runs (`courses` starts with the threshold band), so `below` is
  // the topmost storey by now — naming it keeps the compiler in step with that.
  const topCourse = below ?? 'threshold';

  const topR = radiusAt(1);

  // --- collar: the flared skirt the cap sits on -------------------------
  const collarFlare = 1.3;
  const collarH = storeyH * 0.16;
  b.add('collar', frustum({ sides, r0: topR, r1: topR * collarFlare, h: collarH, rot: stemRot }), {
    on: topCourse,
  });

  // --- cap: the silhouette ---------------------------------------------
  b.add('cap', dome({ r: capR, h: capH, sides: p.capSides, rings: 7, bulge: capBulgeAbs }), {
    on: 'collar',
  });

  // --- gills: an inverted cone hung UNDER the cap, top flush with its base
  const gillH = capH * 0.24;
  b.add(
    'gills',
    frustum({ sides: p.capSides, r0: capR * 0.5, r1: capR * 0.93, h: gillH, rot: stemRot }),
    { attached: 'cap', dz: -gillH, material: 'gill' },
  );

  // --- spots: domes SITTING ON the cap's own surface --------------------
  // A spot is a vertical-axis dome on a SLOPED surface, so seating it at the
  // surface height under its centre buries its uphill half and leaves a sliver.
  // Seat it instead at the height the cap reaches under its UPHILL edge, and
  // the whole disc clears the slope and reads as a round marking.
  const spotCount = Math.max(0, Math.round(p.spotCount));
  const spotR = capR * 0.15;
  const spotH = spotR * 0.34;
  for (let i = 0; i < spotCount; i++) {
    const ang = ((i + 0.5) / spotCount) * 360 + jitter(150 / spotCount);
    // kept to the upper surface: a spot seated near the rim hangs off the
    // silhouette as a lump instead of reading as a marking on the cap.
    const band = 0.34 + 0.42 * (((i * 5) % Math.max(1, spotCount)) / Math.max(1, spotCount));
    const t = Math.min(0.82, Math.max(0.32, band + jitter(0.06)));
    const seat = Math.max(0, capProfile(t) - spotR * 0.15);
    b.add('spot-' + i, dome({ r: spotR, h: spotH, sides: 18, rings: 3 }), {
      attached: 'cap',
      dz: capHeightAtRadius(Math.max(0, seat - spotR * 0.8)) - spotH * 0.3,
      at: { dx: Math.cos(ang * DEG) * seat, dy: Math.sin(ang * DEG) * seat },
      material: 'spot',
    });
  }

  // --- chimney: leaning out of the cap's shoulder -----------------------
  const chimT = 0.44;
  const chimBearing = 128 + jitter(24);
  const chimRing = capProfile(chimT) * 0.7;
  b.add(
    'chimney',
    frustum({ sides: 6, r0: stemR * 0.26, r1: stemR * 0.21, h: capH * 0.42, rot: stemRot }),
    {
      attached: 'cap',
      dz: chimT * capH,
      at: { dx: Math.cos(chimBearing * DEG) * chimRing, dy: Math.sin(chimBearing * DEG) * chimRing },
      rotate: { axis: 'y', deg: jitter(7) },
      material: 'stone',
    },
  );

  // --- door: on the camera-facing facet of the threshold band -----------
  const doorFacetIdx = b.facetAtBearing('threshold', 45);
  const doorFacet = facetOf('threshold', doorFacetIdx);
  const doorW = maxApertureWidth(doorFacet, 0, doorH / bandH) * 0.95;
  b.aperture('door', {
    host: 'threshold',
    facet: doorFacetIdx,
    cu: 0,
    sill: 0,
    w: doorW,
    h: doorH,
    kind: 'door',
  });

  // --- windows: one band per storey, on facets that flank the door ------
  // Each window is CENTRED on its facet: that is what keeps its centroid level
  // with the wall's, so it always paints in front of the wall it is cut into.
  // the door lives on its own band, so the camera-facing facet is free up here
  const windowBearings = [45, 0, 90, 315, 135, 270, 180];
  const perFloor = Math.max(0, Math.min(windowBearings.length, Math.round(p.windowsPerFloor)));
  const usable = storeyH - 2 * MARGIN;
  for (let k = 0; k < floors; k++) {
    const host = `stem-${k}`;
    const h = usable * 0.42;
    const sill = (storeyH - h) / 2;
    windowBearings.slice(0, perFloor).forEach((bearing, i) => {
      const idx = b.facetAtBearing(host, bearing);
      const f = facetOf(host, idx);
      const w = maxApertureWidth(f, sill / storeyH, (sill + h) / storeyH) * 0.82;
      const wh = Math.min(h, w * 1.35);
      b.aperture(`win-${k}-${i}`, {
        host,
        facet: idx,
        cu: 0,
        sill: (storeyH - wh) / 2,
        w,
        h: wh,
      });
    });
  }

  // --- stoop: a ground step abutting the door ---------------------------
  const doorDir = 45 * DEG;
  const stoopR = doorW * 0.95;
  b.add('step', frustum({ sides: 10, r0: stoopR, r1: stoopR * 0.88, h: MARGIN * 0.6 }), {
    ground: true,
    at: {
      dx: Math.cos(doorDir) * radiusAt(0) * 1.05,
      dy: Math.sin(doorDir) * radiusAt(0) * 1.05,
    },
    material: 'stone',
  });

  // --- lantern: a glow bulb fixed to the storey just above the door -----
  const lanternZ = storeyH * 0.16;
  const lanternR = radiusAt((bandH + lanternZ) / stemH) * 0.97;
  b.add('lantern', dome({ r: stemR * 0.14, h: stemR * 0.2, sides: 10, rings: 4 }), {
    attached: 'stem-0',
    dz: lanternZ,
    at: { dx: Math.cos(doorDir) * lanternR, dy: Math.sin(doorDir) * lanternR },
    material: 'glass',
  });

  return b.model();
}

/** How many parts a given parameter set is expected to produce — the test's oracle. */
export function expectedPartCount(params: Partial<MushroomParams> = {}): number {
  const p = { ...DEFAULTS, ...params };
  const floors = Math.max(1, Math.min(3, Math.round(p.floors)));
  // threshold + storeys + collar + cap + gills + chimney + step + lantern + spots
  return floors + 7 + Math.max(0, Math.round(p.spotCount));
}
