/**
 * THE LAND AND THE OBJECTS ON IT READ ONE CAMERA — ADR-0367 D1.
 *
 * Two assertions, and neither was expressible before this increment because only one side of the
 * composition had a constant at all:
 *
 *   1. The land's projection and the sprite registration derive from the SAME declared value, and
 *      moving that value moves BOTH.
 *   2. An object's ground contact point lands on the land cell it is anchored to, across the range
 *      of that value.
 *
 * The second reads the placement out of `organicLayerBox` — the function `SceneView` itself renders
 * from — rather than restating the arithmetic, so a drift in the renderer fails here.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  HEX_R,
  LAND_CAMERA_ELEVATION_DEG,
  PLAN_VIEW_ELEVATION_DEG,
  groundFlattening,
  hexCenter,
  hexCorners,
  spriteUprightScale,
  uprightForeshortening,
  type Axial,
  type Pt,
} from '@storytree/forest-world';
import {
  assertSpriteRenderMatchesLandCamera,
  organicLayerBox,
  organicLayerGroundContact,
  spriteRenderMatchesLandCamera,
  spriteUprightReconciliation,
  type OrganicLayerPlacement,
} from './land-camera.js';
import {
  CHAPTER2_ROUND3_TREE_CANDIDATES,
  chapter2Round3TreeCandidate,
} from './chapter2-round3-tree-candidates.js';

/** The declared value plus a sweep either side — the range the invariants must hold over. */
const SWEEP = [12, 15, 20, 26.565, 30, 45, 60] as const;

function pointInPolygon(p: Pt, poly: readonly Pt[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if (!a || !b) continue;
    const straddles = a.y > p.y !== b.y > p.y;
    if (straddles && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

/** The projected polygon of one land cell, at a given camera. */
function cellPolygon(h: Axial, elevationDeg: number): Pt[] {
  const c = hexCenter(h, { elevationDeg });
  return hexCorners(c.x, c.y, HEX_R, elevationDeg);
}

/**
 * The hero-tree sprite planted on one cell at a given camera. `scale` puts the sprite's registered
 * footprint at roughly a cell's width, which is how it is mounted; the assertion below does not
 * depend on the exact value, only on the anchor landing where the renderer puts it.
 */
function plantedHeroTree(h: Axial, elevationDeg: number): OrganicLayerPlacement {
  const candidate = chapter2Round3TreeCandidate('code-blender');
  return {
    canvas: candidate.canvas,
    assetAnchor: candidate.groundAnchor,
    worldAnchor: hexCenter(h, { elevationDeg }),
    scale: (HEX_R * 2) / candidate.canvas.width,
    projection: spriteUprightReconciliation(candidate.renderedCameraElevationDeg, elevationDeg),
  };
}

describe('the land and its objects read ONE declared camera', () => {
  it('the shipped sprite frames are still rendered at the land’s declared camera', () => {
    // WHAT THIS REPLACED, AND WHY. This assertion used to read
    //     expect(codeBlender.authoredCameraElevationDeg).toBe(LAND_CAMERA_ELEVATION_DEG)
    // while the registration's value WAS `LAND_CAMERA_ELEVATION_DEG` — so it compared the constant
    // to itself and could not fail for any value of it. Bumping the land's camera moved the
    // registration with it, the app went on claiming the sprite had been rendered at the new angle,
    // and the committed PNG frames were still 20 degrees. PR #1344's proof — that the land
    // projection and the sprite registration derive from the SAME constant — kept passing through
    // exactly that mismatch, because nothing compared the constant to the PIXELS.
    //
    // The registration now records the angle its frames were actually rendered at, as a literal, so
    // this is a real comparison of two independent facts.
    const codeBlender = chapter2Round3TreeCandidate('code-blender');
    expect(codeBlender.renderedCameraElevationDeg).toBe(20);
    assertSpriteRenderMatchesLandCamera(
      codeBlender.heroTreeTrackId,
      codeBlender.renderedCameraElevationDeg,
    );
  });

  it('EVERY track’s shipped frames are current against the land camera', () => {
    for (const c of CHAPTER2_ROUND3_TREE_CANDIDATES) {
      expect(
        () => assertSpriteRenderMatchesLandCamera(c.heroTreeTrackId, c.renderedCameraElevationDeg),
        `${c.id} ships frames rendered at a camera the land no longer declares`,
      ).not.toThrow();
    }
  });

  it('a stale render is REFUSED — recording 20 deg against a land declared at 35 is not current', () => {
    // The red half, and the whole point of the field being a record. This is what a constant bump
    // without a re-render looks like from the app's side, and it must be a failure rather than a
    // silently wrong picture.
    expect(spriteRenderMatchesLandCamera(20, 35)).toBe(false);
    expect(() =>
      assertSpriteRenderMatchesLandCamera('chapter2-round3-code-blender-hero-tree-track-v1', 20, 35),
    ).toThrow(/STALE SPRITE RENDER/);
    // and the refusal has to say what clears it, not merely that something is wrong
    expect(() => assertSpriteRenderMatchesLandCamera('t', 20, 35)).toThrow(/re-render/i);
  });

  it('has TEETH: the check compares the RECORDED value, so it cannot pass by self-comparison', () => {
    // Without this control the suite above could be satisfied by a check that read the land's
    // constant on both sides — which is precisely the defect being fixed, and which no behavioural
    // assertion about the CURRENT (agreeing) state can distinguish from a correct one.
    //
    // 1. It is genuinely two-argument: the same recorded value is current at one land camera and
    //    stale at another, and a different recorded value is current at the angle it matches.
    expect(spriteRenderMatchesLandCamera(20, 20)).toBe(true);
    expect(spriteRenderMatchesLandCamera(20, 35)).toBe(false);
    expect(spriteRenderMatchesLandCamera(35, 35)).toBe(true);
    expect(spriteRenderMatchesLandCamera(35, 20)).toBe(false);
    // A track with no camera at all has no render to have gone stale.
    expect(spriteRenderMatchesLandCamera(null, 35)).toBe(true);

    // 2. And the RECORD is a literal in the source, not the constant wearing a new field name. This
    //    is the control that actually prevents regression: re-introducing
    //    `renderedCameraElevationDeg: LAND_CAMERA_ELEVATION_DEG` would restore the tautology while
    //    leaving every assertion above green.
    const source = readFileSync(
      new URL('./chapter2-round3-tree-candidates.ts', import.meta.url),
      'utf8',
    );
    expect(
      /renderedCameraElevationDeg:\s*LAND_CAMERA_ELEVATION_DEG/.test(source),
      'the registration must RECORD its render angle, never restate the land constant',
    ).toBe(false);
    expect(
      /^\s*import\s*\{[^}]*\bLAND_CAMERA_ELEVATION_DEG\b/m.test(source),
      'the registration module must not import the land camera constant at all',
    ).toBe(false);
    expect(
      (source.match(/renderedCameraElevationDeg:\s*-?\d+(?:\.\d+)?\s*,/g) ?? []).length,
    ).toBeGreaterThan(0);
  });

  it('every candidate states a camera or states that it has none', () => {
    for (const c of CHAPTER2_ROUND3_TREE_CANDIDATES) {
      const declared = c.renderedCameraElevationDeg;
      expect(declared === null || (declared > 0 && declared < PLAN_VIEW_ELEVATION_DEG)).toBe(true);
    }
    // Exactly one track is code-generated at a declared camera today; the rest are 2D plates.
    const withCamera = CHAPTER2_ROUND3_TREE_CANDIDATES.filter(
      (c) => c.renderedCameraElevationDeg !== null,
    );
    expect(withCamera.map((c) => c.id)).toEqual(['code-blender']);
  });

  it('moving the declared camera moves BOTH the land projection and the sprite reconciliation', () => {
    // The load-bearing half of assertion 1. Before this increment the land had no constant to move,
    // so this could not be written: the land was fixed in plan view and only the sprite had a dial.
    const landSeen = new Set<number>();
    const spriteSeen = new Set<number>();
    for (const deg of SWEEP) {
      landSeen.add(groundFlattening(deg));
      spriteSeen.add(spriteUprightReconciliation(LAND_CAMERA_ELEVATION_DEG, deg));
    }
    expect(landSeen.size).toBe(SWEEP.length);
    expect(spriteSeen.size).toBe(SWEEP.length);

    // ...and they move as ONE camera, not as two independent knobs: each side is sin/cos of the
    // same angle, so the land's flattening determines the sprite's correction exactly.
    for (const deg of SWEEP) {
      const land = groundFlattening(deg);
      const implied = Math.sqrt(1 - land * land); // cos, from the land's own sin
      expect(spriteUprightReconciliation(LAND_CAMERA_ELEVATION_DEG, deg)).toBeCloseTo(
        implied / uprightForeshortening(LAND_CAMERA_ELEVATION_DEG),
        12,
      );
    }
  });

  it('a sprite authored at the land camera needs NO reconciliation — the dial stops being the mechanism', () => {
    expect(spriteUprightReconciliation(LAND_CAMERA_ELEVATION_DEG)).toBe(1);
    expect(spriteUprightReconciliation(null)).toBe(1);
    // And it is still a live function of the land camera: re-declare the land and the shipped
    // sprites need re-rendering, which this number is the warning for.
    expect(spriteUprightReconciliation(LAND_CAMERA_ELEVATION_DEG, 30)).not.toBe(1);
    expect(spriteUprightReconciliation(LAND_CAMERA_ELEVATION_DEG, 30)).toBeCloseTo(
      spriteUprightScale(LAND_CAMERA_ELEVATION_DEG, 30),
      12,
    );
  });
});

describe('an object’s ground contact lands on the cell it is anchored to', () => {
  it('holds for a patch of cells across the range of the declared camera', () => {
    // Proof assertion 2. The contact point is read back out of the box `SceneView` renders, so this
    // fails if the renderer's placement and the land's mapping ever stop agreeing.
    for (const deg of SWEEP) {
      for (let q = -3; q <= 3; q++) {
        for (let r = -3; r <= 3; r++) {
          const h: Axial = { q, r };
          const contact = organicLayerGroundContact(plantedHeroTree(h, deg));
          expect(
            pointInPolygon(contact, cellPolygon(h, deg)),
            `${deg} deg: the hero tree on cell ${q},${r} is not standing on it`,
          ).toBe(true);
        }
      }
    }
  });

  it('the contact is a FIXED POINT of the reconciliation — the dial never lifts the tree', () => {
    const h: Axial = { q: 1, r: -2 };
    const base = plantedHeroTree(h, LAND_CAMERA_ELEVATION_DEG);
    const anchored = organicLayerGroundContact(base);
    for (const projection of [1, 0.9, 0.82, 0.72]) {
      const contact = organicLayerGroundContact({ ...base, projection });
      expect(contact.x).toBeCloseTo(anchored.x, 12);
      expect(contact.y).toBeCloseTo(anchored.y, 12);
      expect(pointInPolygon(contact, cellPolygon(h, LAND_CAMERA_ELEVATION_DEG))).toBe(true);
    }
  });

  it('has TEETH: an anchor placed by the pre-camera mapping falls OFF the angled cell', () => {
    // Without this control the suite above would pass for any mapping at all. A cell drawn at the
    // declared camera whose object is still anchored in plan view is exactly the state ADR-0367 D1
    // was written to end, and it must be caught rather than absorbed.
    const h: Axial = { q: 0, r: 3 };
    const stale = organicLayerGroundContact({
      ...plantedHeroTree(h, LAND_CAMERA_ELEVATION_DEG),
      worldAnchor: hexCenter(h, { elevationDeg: PLAN_VIEW_ELEVATION_DEG }),
    });
    expect(pointInPolygon(stale, cellPolygon(h, LAND_CAMERA_ELEVATION_DEG))).toBe(false);
  });

  it('the rendered box still spans the sprite canvas at the reconciled scale', () => {
    const h: Axial = { q: 2, r: 0 };
    const layer = plantedHeroTree(h, LAND_CAMERA_ELEVATION_DEG);
    const box = organicLayerBox(layer);
    expect(box.width).toBeCloseTo(layer.canvas.width * layer.scale, 12);
    expect(box.height).toBeCloseTo(layer.canvas.height * layer.scale * (layer.projection ?? 1), 12);
  });
});
