/**
 * THE GENERATOR HAS ONE CAMERA, NOT THREE — ADR-0527 D1's precondition, made executable.
 *
 * ADR-0527 D1 moves the 20° projection out of the layout generator and into the painters: the
 * layout emits a TRUE ground surface and each painter projects for itself. The whole decision
 * rests on a fact nothing in this repo asserted before this file — **the layout stack is
 * projection-EQUIVARIANT**: relaxing, routing and laying out in ground space and projecting once
 * at the end gives the same drawing as doing it all in projected space. If that were false, D1
 * could not also satisfy D6 (the map is pixel-identical across the change), because un-baking the
 * projection would move the picture.
 *
 * It is TRUE, and it is measured here rather than argued (see `relaxation` below: 238 cells over
 * 19 tiles, max error 0). `substrate.ts` and `routing.ts` already work this way — both build in
 * ground space and call `projectGround` exactly once on the way out (`substrate.ts:569`,
 * `routing.ts:1378-1385`). That is the shape D1 generalises.
 *
 * ⚠⚠ WHAT WAS NOT TRUE, AND IS WHAT THIS FILE'S RED CAME FROM. `scene.ts` did NOT thread the
 * caller's camera. `SceneInput.cameraElevationDeg` reached only the garden / stone-path / UAT-marker
 * helpers under `buildTerritoryFlora`; three sites computed a coordinate at the HARDWIRED default
 * instead, so a caller asking `buildScene` for a plan-view surface got a scene at TWO cameras at
 * once — territory geometry and substrate at plan view, and these three at 20°:
 *
 *   1. `buildEmpties` — `hexCenter(h)` / `hexPath(...)` with no elevation. The `empty` coast hexes
 *      are LIVE (they are not in `scene-kind-coverage.test.ts`'s `STARVED_KINDS`), so this one is
 *      drawn on the studio map today. Ask for a true surface and the coastline detaches from the
 *      islands it rings.
 *   2. `buildTree`'s ground contact shadow — `groundRadiusToScreenHalfHeight(shadowGroundR)` with
 *      no elevation, i.e. a ground circle flattened at 20° whatever camera the caller asked for.
 *      This is the mark directly beneath the hero tree, the one ADR-0367 D1 derived from the
 *      declared camera precisely so it would stop being hand-set.
 *   3. the classic extruded-hex ground — `hexCenter(h)` / `hexPath(...)` / `TILE_DEPTH`. This
 *      family is STARVED (row 1 of the deletion list in
 *      `docs/research/forest-geometry-inventory-2026-09-06.md`) and is slated for deletion rather
 *      than for rework under ADR-0527 D4. It is threaded anyway, because the invariant this file
 *      states is "the generator has ONE camera" and an exception nobody can see is how a second
 *      copy survives a deletion. Two lines, not a port.
 *
 * A caller could not detect any of this from the outside: it does not throw, it does not warn, and
 * on the shipped path (every surface asks for the declared camera) all three happen to agree. It
 * only surfaces the moment someone asks for a DIFFERENT camera — which is exactly what ADR-0527 D1
 * makes the 3D painter do.
 *
 * The tests below are stated as EQUIVARIANCE rather than as "site N threads its argument", so they
 * keep binding when the sites move: what is pinned is that building at plan view and projecting is
 * the same drawing as building at the declared camera, which is D1's whole claim.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { LAND_CAMERA_ELEVATION_DEG, PLAN_VIEW_ELEVATION_DEG, groundFlattening } from './camera.js';
import { PRE_ADR0528_TILE, type Axial } from './hex.js';
import { buildRelaxedCells, type RelaxedCell } from './substrate.js';
import {
  buildScene,
  type SceneEllipse,
  type SceneG,
  type SceneInput,
  type SceneNode,
  type ScenePath,
  type SceneTerritoryInput,
} from './scene.js';

/** sin 20° = 0.342… — the factor a ground-plane depth loses at the declared camera. */
const SIN = groundFlattening(LAND_CAMERA_ELEVATION_DEG);

/** A radius-2 hex disc, big enough that the relaxed mesh has interior cells and not just rim. */
const TILES: Axial[] = (() => {
  const out: Axial[] = [];
  for (let q = -2; q <= 2; q += 1) {
    for (let r = -2; r <= 2; r += 1) if (Math.abs(q + r) <= 2) out.push({ q, r });
  }
  return out;
})();

/** The tuned tile — the lattice this package's ground-unit constants were judged on (ADR-0528). */
const TILE = { hexR: PRE_ADR0528_TILE.hexR } as const;

// ---------------------------------------------------------------------------
// 1. THE FACT D1 RESTS ON: the substrate relaxation commutes with the projection.
// ---------------------------------------------------------------------------

test('the relaxed substrate is projection-EQUIVARIANT: relax-then-project == project-then-relax, exactly', () => {
  const draw = TILES.map((h) => ({ h, owner: 0 }));
  const atCamera = buildRelaxedCells(draw, [new Set<string>()], 'mesh', TILE, {
    elevationDeg: LAND_CAMERA_ELEVATION_DEG,
  });
  const atGround = buildRelaxedCells(draw, [new Set<string>()], 'mesh', TILE, {
    elevationDeg: PLAN_VIEW_ELEVATION_DEG,
  });

  assert.equal(atCamera.length, atGround.length, 'the same tiles must decompose into the same number of cells');
  assert.ok(atCamera.length > 50, `expected a substantial mesh, got ${atCamera.length} cells`);

  let maxErr = 0;
  let worst = '';
  for (let i = 0; i < atCamera.length; i += 1) {
    const a = atCamera[i] as RelaxedCell;
    const b = atGround[i] as RelaxedCell;
    assert.equal(a.variant, b.variant, `cell ${i}: the hash-derived variant must not depend on the camera`);
    assert.equal(a.owner, b.owner, `cell ${i}: ownership must not depend on the camera`);
    assert.equal(a.poly.length, b.poly.length, `cell ${i}: the cell must have the same number of vertices`);
    for (let j = 0; j < a.poly.length; j += 1) {
      const p = a.poly[j]!;
      const q = b.poly[j]!;
      const err = Math.max(Math.abs(p.x - q.x), Math.abs(p.y - q.y * SIN));
      if (err > maxErr) {
        maxErr = err;
        worst = `cell ${i} vertex ${j}: built at 20° = (${p.x}, ${p.y}); built on the ground and projected = (${q.x}, ${q.y * SIN})`;
      }
    }
  }
  // EXACT, not approximate: the projection is a scale on y alone and the relaxation's arithmetic is
  // linear in the seeds, so there is no floating-point slack to allow for. A tolerance here would
  // hide precisely the kind of non-linearity (a distance test, a keep-out radius, a hypot) that
  // would make D1 move the picture.
  assert.equal(maxErr, 0, `the relaxation does not commute with the projection — ${worst}`);
});

// ---------------------------------------------------------------------------
// 2. THE GENERATOR HAS ONE CAMERA: `buildScene` honours the camera it is asked for.
// ---------------------------------------------------------------------------

/** A scene exercising the three sites that used to hardwire the declared camera. */
function sceneAt(elevationDeg: number, opts: { relaxed: boolean }): SceneG {
  const draw = TILES.map((h) => ({ h, owner: 0 }));
  // The territory's own coordinates are the CALLER's, so they are stated in the caller's space —
  // this is the contract `SceneInput.cameraElevationDeg` documents. Only the sites `scene.ts`
  // computes for itself are under test.
  const territory: SceneTerritoryInput = {
    id: 'story',
    status: 'healthy',
    caps: 4,
    centroid: { x: 0, y: 0 },
    groundRadius: 70,
    screenRadius: 70 * groundFlattening(elevationDeg),
    treeSpot: { x: 0, y: 0 },
    labelY: 46,
    coastPaths: [],
    decor: [],
    plants: [],
    treeTitle: 'story',
    wisps: [],
    plate: { w: 120, h: 33, rx: 7, idY: 14, subY: 27, idText: 'story', subText: 'x', title: 'story' },
  };
  const input: SceneInput = {
    offset: { x: 0, y: 0 },
    width: 1200,
    height: 900,
    // the coast ring one step outside the disc — the LIVE `empty` family
    empties: [
      { q: 3, r: -1 },
      { q: -3, r: 1 },
      { q: 0, r: 3 },
    ],
    relaxedCells: opts.relaxed
      ? buildRelaxedCells(draw, [new Set<string>()], 'mesh', TILE, { elevationDeg })
      : null,
    drawTiles: draw,
    wheatSets: [new Set<string>()],
    trails: { segments: [], edges: [], caves: [], dropped: [] },
    territories: [territory],
    tile: TILE,
    cameraElevationDeg: elevationDeg,
  };
  return buildScene(input);
}

/** Every node of `kind`, depth-first. */
function nodesOfKind(root: SceneNode, kind: string): SceneNode[] {
  const out: SceneNode[] = [];
  const walk = (n: SceneNode): void => {
    if ((n as { kind?: string }).kind === kind) out.push(n);
    for (const c of (n as SceneG).children ?? []) walk(c);
  };
  walk(root);
  return out;
}

/**
 * Is `drawn` (built at the declared camera) the projection of `ground` (built in plan view)?
 * Returns null when it is, or a one-line reason when it is not.
 *
 * Both strings are emitted through `toFixed(1)`, so the comparison carries the rounding of BOTH
 * sides and nothing looser: |Δ| ≤ 0.05 from the drawn side plus 0.05·sin from the ground side. A
 * vertex that moved for any reason other than the camera is out by a multiple of its own
 * coordinate — the failures this replaced were 3× out — so the tolerance cannot launder one.
 */
const ROUNDING_SLACK = 0.05 * (1 + SIN);
function geometryThroughProjection(drawn: string, ground: string): string | null {
  const nd = (drawn.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number);
  const ng = (ground.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number);
  if (nd.length !== ng.length) return `${nd.length} numbers vs ${ng.length}`;
  if (nd.length === 0) return drawn === ground ? null : 'differs and carries no coordinates';
  if (nd.length % 2 !== 0) return `an odd number of coordinates (${nd.length}) — not x,y pairs`;
  for (let i = 0; i < nd.length; i += 2) {
    if (Math.abs((nd[i] as number) - (ng[i] as number)) > ROUNDING_SLACK) {
      return `x moved: ${nd[i]} vs ${ng[i]} (the camera flattens y ALONE)`;
    }
    const want = (ng[i + 1] as number) * SIN;
    if (Math.abs((nd[i + 1] as number) - want) > ROUNDING_SLACK) {
      return `y is not the projection: ${nd[i + 1]} vs ${ng[i + 1]}·sin20° = ${want.toFixed(3)}`;
    }
  }
  return null;
}

/**
 * A path's drawn height over its drawn width, WITH the tolerance its own rounding forces.
 *
 * A `d` string is emitted through `toFixed(1)`, so each extent carries ±0.1 and the ratio built
 * from two of them carries `(0.1/h + 0.1/w) · ratio`. Deriving the tolerance from the measured
 * extents rather than picking an epsilon matters here: the two families under test are drawn on
 * DIFFERENT lattices — the empty hexes on the stated tile (radius 27) and the classic ground on the
 * derived `HEX_R` (≈ 11.06) — so one fixed epsilon is either too loose for the first or a false red
 * on the second. Both were measured out by ~0.001 against a real answer of 1.1547.
 */
function aspect(d: string): { ratio: number; tol: number } {
  const n = (d.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number);
  const xs = n.filter((_, i) => i % 2 === 0);
  const ys = n.filter((_, i) => i % 2 === 1);
  const w = Math.max(...xs) - Math.min(...xs);
  const h = Math.max(...ys) - Math.min(...ys);
  const ratio = h / w;
  return { ratio, tol: (0.1 / h + 0.1 / w) * ratio };
}

/** A pointy-top hex is 2R tall and √3·R wide on the GROUND: this is its plan-view aspect. */
const PLAN_HEX_ASPECT = 2 / Math.sqrt(3);

/**
 * A hex outline is a circle of radius R in the GROUND plane; seen at elevation θ it is an ellipse of
 * semi-axes (R, R·sin θ). So the ratio of a drawn hex's height to its width IS the camera it was
 * drawn under, readable straight off the emitted `d` without knowing where on the map it sits.
 */
function assertHexFollowsTheCamera(kind: string, relaxed: boolean, why: string): void {
  const shapeAt = (elevationDeg: number): { ratio: number; tol: number } => {
    const found = nodesOfKind(sceneAt(elevationDeg, { relaxed }), kind);
    assert.ok(found.length > 0, `the fixture must emit at least one \`${kind}\``);
    return aspect((found[0] as ScenePath).d);
  };
  const plan = shapeAt(PLAN_VIEW_ELEVATION_DEG);
  const camera = shapeAt(LAND_CAMERA_ELEVATION_DEG);
  assert.ok(
    Math.abs(plan.ratio - PLAN_HEX_ASPECT) <= plan.tol,
    `asked for a PLAN-VIEW scene, a \`${kind}\` must be 2/√3 = ${PLAN_HEX_ASPECT.toFixed(4)} times as tall as it is ` +
      `wide (±${plan.tol.toFixed(4)} for the 1-dp rounding); got ${plan.ratio.toFixed(4)} — ${why}`,
  );
  const flattening = camera.ratio / plan.ratio;
  const tol = camera.tol / plan.ratio + (camera.ratio * plan.tol) / (plan.ratio * plan.ratio);
  assert.ok(
    Math.abs(flattening - SIN) <= tol,
    `the declared camera must flatten the same \`${kind}\` by sin 20° = ${SIN.toFixed(4)} (±${tol.toFixed(4)}), ` +
      `got ${flattening.toFixed(4)}`,
  );
}

test('an EMPTY coast hex is drawn at the camera the caller asked for, not at the hardwired default', () => {
  // `empty` is LIVE — it is not in `scene-kind-coverage.test.ts`'s `STARVED_KINDS`, so these are the
  // coast hexes on the studio map today. Ask `buildScene` for a true surface with this unthreaded
  // and the coastline stays flattened around islands that are not.
  assertHexFollowsTheCamera('empty', true, '`buildEmpties` is still flattening at the hardwired declared camera (ADR-0527 D1)');
});

test("the story tree's ground contact shadow follows the camera it is drawn under (ADR-0367 D1)", () => {
  const ratioAt = (elevationDeg: number): number => {
    const shadows = nodesOfKind(sceneAt(elevationDeg, { relaxed: true }), 'shadow');
    assert.ok(shadows.length > 0, 'the fixture must draw a story tree with its contact shadow');
    const e = shadows[0] as SceneEllipse;
    return e.ry / e.rx;
  };
  // The shadow is a ground CIRCLE of radius 0.78R seen through the camera — so its semi-minor over
  // its semi-major IS sin θ. At plan view it is a circle; at the declared camera, sin 20°.
  assert.ok(
    Math.abs(ratioAt(PLAN_VIEW_ELEVATION_DEG) - 1) < 1e-9,
    `a ground circle seen from straight down is a CIRCLE — got an axis ratio of ${ratioAt(PLAN_VIEW_ELEVATION_DEG)}. ` +
      "`buildTree` is still flattening the contact shadow at the hardwired declared camera.",
  );
  assert.ok(Math.abs(ratioAt(LAND_CAMERA_ELEVATION_DEG) - SIN) < 1e-9, 'at the declared camera the ratio must be sin 20°');
});

test('the classic extruded-hex ground follows the camera too — a starved family carries no second copy of it', () => {
  // Row 1 of the deletion list (`docs/research/forest-geometry-inventory-2026-09-06.md`): this
  // family is STARVED and will be deleted rather than reworked (ADR-0527 D4). It is held to the
  // invariant anyway, because "the generator has ONE camera" with an exception nobody can see is
  // how a second copy outlives the deletion that was supposed to take it.
  assertHexFollowsTheCamera('tile-top', false, 'the classic ground still reads the module-level `TILE_DEPTH` and the default lattice');
});

// ---------------------------------------------------------------------------
// 3. THE WHOLE DRAWING, NOT THE THREE SITES: build on the ground, project, and get today's map.
// ---------------------------------------------------------------------------

test('buildScene is EQUIVARIANT end to end: the ground-built scene projected IS the camera-built scene', () => {
  // This is ADR-0527 D1 and D6 stated together and checked in one assertion — the layout may be
  // handed a true surface, and the picture does not move. It compares STRUCTURE as well as
  // coordinates: a different child count or a different node type would mean some choice inside
  // the builder read a projected coordinate (a distance test, a keep-out, a hash of a position),
  // and that is the one way D1 could silently change the map.
  const camera = sceneAt(LAND_CAMERA_ELEVATION_DEG, { relaxed: true });
  const ground = sceneAt(PLAN_VIEW_ELEVATION_DEG, { relaxed: true });

  const problems: string[] = [];
  const walk = (a: SceneNode, b: SceneNode, path: string): void => {
    const ka = Object.keys(a as object).sort();
    const kb = Object.keys(b as object).sort();
    if (ka.join(',') !== kb.join(',')) {
      problems.push(`${path}: field sets differ — ${ka.join('|')} vs ${kb.join('|')}`);
      return;
    }
    for (const k of ka) {
      if (k === 'children') continue;
      const x = (a as unknown as Record<string, unknown>)[k];
      const y = (b as unknown as Record<string, unknown>)[k];
      if (typeof x === 'string' && typeof y === 'string' && x !== y) {
        // A geometry string (`d`, `points`, a `transform`) is compared COORDINATE-WISE through the
        // projection rather than byte-wise: every number is an alternating x, y pair, so the x's
        // must match and each y must be its ground y times sin. This is the strong half of the
        // assertion — it is what would catch a vertex that moved for a reason other than the camera.
        const cmp = geometryThroughProjection(x, y);
        if (cmp !== null) problems.push(`${path}.${k}: ${cmp} — "${x}" vs "${y}"`);
      } else if (typeof x === 'number' && typeof y === 'number') {
        // A scalar carries no axis in its type, and this walker cannot tell an x-ish field from a
        // y-ish one by name (`hit`'s `x`/`width` derive from the territory's own `screenRadius`,
        // which the CALLER states per camera, so they scale where the names suggest they should
        // not). So a scalar is accepted if it is unchanged OR projected, and rejected if it is
        // neither — which is still the signal that matters: a value that is some THIRD number came
        // from a choice that read a projected coordinate.
        if (x !== y && Math.abs(x - y * SIN) > 1e-9) problems.push(`${path}.${k}: ${x} is neither ${y} nor ${y}·sin20°`);
      } else if (typeof x !== 'object' && x !== y) {
        problems.push(`${path}.${k}: ${JSON.stringify(x)} vs ${JSON.stringify(y)}`);
      }
    }
    const ca = (a as SceneG).children ?? [];
    const cb = (b as SceneG).children ?? [];
    if (ca.length !== cb.length) {
      problems.push(`${path}: ${ca.length} children vs ${cb.length} — a choice inside the builder read a PROJECTED coordinate`);
      return;
    }
    for (let i = 0; i < ca.length; i += 1) walk(ca[i] as SceneNode, cb[i] as SceneNode, `${path}/${(ca[i] as { kind?: string }).kind ?? i}`);
  };
  walk(camera, ground, 'scene');

  assert.deepEqual(problems.slice(0, 12), [], `buildScene is not equivariant (${problems.length} findings; first 12 shown)`);
});
