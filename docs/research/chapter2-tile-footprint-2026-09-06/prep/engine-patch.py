#!/usr/bin/env python3
"""ADR-0528 engine patch — packages/forest-world/src. Every replacement asserts its anchor is present
exactly once, so a drifted file fails loudly rather than half-patching."""
import sys

ROOT = '/home/mickh/code/Storytree/.claude/worktrees/tile/packages/forest-world/src/'


def patch(name, pairs):
    p = ROOT + name
    s = open(p).read()
    for old, new in pairs:
        n = s.count(old)
        if n != 1:
            print(f'FAIL {name}: anchor found {n} times:\n{old[:200]}')
            sys.exit(1)
        s = s.replace(old, new)
    open(p, 'w').write(s)
    print(f'patched {name} ({len(pairs)} edits)')


# ---------------------------------------------------------------- hex.ts
patch('hex.ts', [
    (
        """// Hex grid (pointy-top, axial coordinates) — the lattice the forest world's
// territories grow on, plus the small SVG-path helpers the cells/coast render
// from. Pure geometry, browser-safe; the constants here are the studio's
// CANONICAL numbers (the studio wins every divergence from the website seed,
// ADR-0093).
//""",
        """// Hex grid (pointy-top, axial coordinates) — the lattice the forest world's
// territories grow on, plus the small SVG-path helpers the cells/coast render
// from. Pure geometry, browser-safe; the constants here are the studio's
// CANONICAL numbers (the studio wins every divergence from the website seed,
// ADR-0093).
//
// THE TILE IS DERIVED FROM THE LAND RATIO, NOT AUTHORED (ADR-0528 D1). Owner, 2026-09-06, verbatim:
// "option 1, we have time dont take shortcuts." `HEX_R` was 27 by eye and each island was drawn on
// `max(3, capabilities + 2)` of them — a footprint about seven times the island ADR-0520 sizes in
// 3D (`capabilities × 318 units²`), so every island stood in a slot seven times its size and no gap
// ratio (ADR-0521) could close it. Now ONE hex is ONE capability's land: the hex is sized so that
// `HEX_TILES_PER_CAPABILITY` of them cover exactly `LAND_AREA_PER_CAPABILITY`, and an island's quota
// is its capability count (`sizing.ts`'s `tileQuota`). A drawn island IS the island it represents,
// the 2D and 3D maps agree about size for the first time since ADR-0517, and the lattice's growth
// floor — which sets the spacing at gap ratio 0 — shrinks with the islands.
//
// ⚠ EVERY LENGTH THIS ENGINE AUTHORED AGAINST THE OLD TILE IS RE-BASED THROUGH `tileUnits()`. The
// props, keep-outs, offsets and strokes were judged in ground units on a radius-27 tile; a length
// that meant "so much of a tile" keeps meaning that by multiplying by `TILE_SCALE`, and the old
// value stays visible at the call site as `tileUnits(<old>)`. What does NOT re-base is named where
// it stands: a dimensionless ratio, a SCREEN quantity (a hit slop, a padding in CSS px), and the
// trail width the 3D mapper reads directly (`routing.ts`'s one width rule). The memory
// `land-scale-has-three-classes-of-constant` is the same discipline on the 3D side.
//""",
    ),
    (
        """export const HEX_R = 27; // centre → corner, in the GROUND plane
export const HEX_W = Math.sqrt(3) * HEX_R;
""",
        """/**
 * THE LAND-PER-CAPABILITY RATIO, in ground units² — ADR-0520 D2's constant, and the number the whole
 * lattice below derives from, which is why it lives in this root package (`forest-world-r3f`
 * re-exports it; the mapper still sizes every 3D island to exactly `capabilities × this`).
 *
 * Provenance (ADR-0520 D2): PICKED ON THE LOOK from a rendered ladder (2,239 / 318 / 200 / 108) at
 * both zooms on the RTX 2060 (`docs/research/chapter2-land-per-capability-2026-09-05/`). 318 is the
 * density of the picture the owner called nicer on 2026-09-05 — 72 trees on the fixture island, about
 * 318 units² of land per tree — and the approved Cycles render's own density read in the true basis
 * (≈ 316 per pine; `land-per-capability.test.ts` holds the two within a few percent). A constant
 * with no provenance is how the old ratio drifted unchosen; change this one on a rendered ladder,
 * never by hand.
 */
export const LAND_AREA_PER_CAPABILITY = 318;

/**
 * HOW MANY HEXES DRAW ONE CAPABILITY'S LAND — the shape-granularity lever ADR-0528 D1 names beside
 * the radius. Modelled on the live corpus before choosing (README in
 * `docs/research/chapter2-tile-footprint-2026-09-06/`): 1 keeps the map's hex count near what it
 * was (207 hexes for 35 islands against 277) and makes the parcel partition literal — each
 * capability's parcel is its own hex, which is what the `+ 2` quota approximated; 2–4 multiply the
 * relaxed mesh's cells and shrink the hex below the props drawn on it for no reading the map needs.
 * Radius alone could not do this job: one radius for the whole lattice leaves `(caps + 2) / caps`
 * of the footprint authored, so a one-capability island is drawn at twice its land; quota alone
 * cannot either — at radius 27 a capability is 0.17 of a hex and 18 of 31 islands cannot be drawn.
 */
export const HEX_TILES_PER_CAPABILITY = 1;

/** The area of a regular hexagon of circumradius 1: `(3√3 / 2)`. */
export const HEX_UNIT_AREA = (3 * Math.sqrt(3)) / 2;

/**
 * The hex circumradius, centre → corner, in the GROUND plane — DERIVED: the radius at which
 * `HEX_TILES_PER_CAPABILITY` hexes cover exactly `LAND_AREA_PER_CAPABILITY`. ≈ 11.06.
 */
export const HEX_R = Math.sqrt(LAND_AREA_PER_CAPABILITY / HEX_TILES_PER_CAPABILITY / HEX_UNIT_AREA);
export const HEX_W = Math.sqrt(3) * HEX_R;
/** One hex's ground-plane area — `LAND_AREA_PER_CAPABILITY / HEX_TILES_PER_CAPABILITY` by construction. */
export const HEX_AREA = HEX_UNIT_AREA * HEX_R * HEX_R;

/** How an island's tile quota follows its capability count, as prose for a manifest or a caption. */
export const TILE_QUOTA_RULE = `max(1, capabilities) × ${HEX_TILES_PER_CAPABILITY} hexes`;

/**
 * THE TILE THIS ENGINE'S ART WAS AUTHORED ON, TYPED AS HISTORY (ADR-0528). `HEX_R = 27` was the one
 * by-eye number left on the layout path, and every prop, keep-out and offset in `scene.ts`,
 * `coast.ts` and the studio's packer was judged in ground units against it. It is kept here for two
 * readers and nothing on the shipped path draws it: `tileUnits()` re-bases those lengths, and a
 * comparison page's control arm (`shipped-tile-scene.ts`) records which tile the map as it shipped
 * stood on. The quota rule is the old `max(3, capabilities + 2)`.
 */
export const PRE_ADR0528_TILE = Object.freeze({ hexR: 27, quota: 'max(3, capabilities + 2) hexes' });

/**
 * The linear factor from the tile the art was authored on to the derived one — `HEX_R / 27`,
 * ≈ 0.41. Every ground-unit length that meant "so much of a tile" multiplies by it (see
 * {@link tileUnits}); the camera's resting view is pinned to island count (ADR-0471), so a uniformly
 * re-based drawing opens at the same on-screen composition it did — which is the baseline the 2D
 * art pass is judged FROM, never the pass itself.
 */
export const TILE_SCALE = HEX_R / PRE_ADR0528_TILE.hexR;

/**
 * A ground-unit length authored against the pre-ADR-0528 tile, re-based to the derived one. The
 * argument is the historical value, so `tileUnits(7)` reads as "7 on the old tile" at the call site
 * and the classification (this is a tile-relative distance) is visible without a comment.
 */
export function tileUnits(authoredAgainstOldTile: number): number {
  return authoredAgainstOldTile * TILE_SCALE;
}
""",
    ),
    (
        """export const TILE_DEPTH_WORLD = 8;""",
        """export const TILE_DEPTH_WORLD = tileUnits(8);""",
    ),
])

# ---------------------------------------------------------------- sizing.ts
patch('sizing.ts', [
    (
        """import { HEX_R, HEX_W } from './hex.js';
import { LAND_CAMERA_ELEVATION_DEG, uprightForeshortening } from './camera.js';
""",
        """import { HEX_R, HEX_TILES_PER_CAPABILITY, HEX_W, TILE_SCALE } from './hex.js';
import { LAND_CAMERA_ELEVATION_DEG, uprightForeshortening } from './camera.js';

/**
 * THE TILE QUOTA — how many hexes an island is drawn on (ADR-0528 D1): one tile per capability, so a
 * drawn island's footprint is exactly `capabilities × LAND_AREA_PER_CAPABILITY`. The retired
 * `max(3, capabilities + 2)` gave "a tile per capability plus breathing room" for the story tree's
 * own tile and the coast's lobing; the 3D map retired the story tree (ADR-0508) and sizes the island
 * from the ratio alone (ADR-0520), and the 2D map now draws the same island. The FLOOR of one tile is
 * structural, not by eye: a lattice island cannot be drawn on none, and a story with no capabilities
 * yet has no land to read — it stands on the smallest tile the lattice has, and the 3D mapper leaves
 * an island with no capability parcels as drawn (ADR-0520 D1).
 */
export function tileQuota(capabilities: number): number {
  return Math.max(1, capabilities) * HEX_TILES_PER_CAPABILITY;
}

/**
 * THE STORY TREE'S DRAWING SCALE — the 2D art pass's rung for the central tree (ADR-0528 D2).
 * `crownRadius` is the tree's radius in its OWN drawing frame (the curve the tree sprite was
 * authored against); this factor is what the frame is scaled by onto the derived tile. At
 * `TILE_SCALE` the tree keeps the exact on-screen size it had at the designed resting view (the view
 * is pinned to island count), which is the baseline every other rung is judged against on the
 * increment's 2D sheet. Above it the tree grows relative to its island; the island shrank harder than
 * the lattice on small stories (one hex where there were three), so the tree already reads larger on
 * those without any help.
 */
export const TREE_SCALE = TILE_SCALE;
""",
    ),
    (
        """/** Crown radius of the central story tree — grows with capability count. */
export function crownRadius(capCount: number): number {
  return Math.min(32, 18 + 2.2 * capCount);
}
""",
        """/** Crown radius of the central story tree in the tree's OWN drawing frame — grows with capability
 *  count. Multiply by {@link TREE_SCALE} for the ground-unit size ({@link crownRadiusWorld}); the
 *  builders that draw the tree inside a `scale(TREE_SCALE)` wrapper read this one. */
export function crownRadius(capCount: number): number {
  return Math.min(32, 18 + 2.2 * capCount);
}

/** The story tree's crown radius in GROUND units — what a keep-out, a ring radius or a fit measures
 *  against once the tree is drawn at {@link TREE_SCALE}. */
export function crownRadiusWorld(capCount: number): number {
  return crownRadius(capCount) * TREE_SCALE;
}
""",
    ),
    (
        """  return (2.72 * crownRadius(capCount) + 18) * uprightForeshortening(elevationDeg);""",
        """  return (2.72 * crownRadius(capCount) + 18) * TREE_SCALE * uprightForeshortening(elevationDeg);""",
    ),
])

# ---------------------------------------------------------------- coast.ts
patch('coast.ts', [
    (
        """export const COAST_OUTSET = 7;""",
        """export const COAST_OUTSET = tileUnits(7); // a beach width, authored as 7 on the radius-27 tile (ADR-0528)""",
    ),
])
patch('coast.ts', [
    ("import type { Pt } from './hex.js';", "import { tileUnits, type Pt } from './hex.js';"),
])

# ---------------------------------------------------------------- scene.ts
patch('scene.ts', [
    # imports
    (
        """import { crownRadius } from './sizing.js';""",
        """import { TREE_SCALE, crownRadius, crownRadiusWorld } from './sizing.js';""",
    ),
    # the tree: drawn in its own frame, scaled onto the tile
    (
        """  return g(children, {
    kind: 'tree',
    status: st,
    title: t.treeTitle,
    transform: `translate(${f(t.treeSpot.x)} ${f(t.treeSpot.y)})`,
  });""",
        """  // The tree is authored in its own frame (`crownRadius`) and scaled onto the tile here (ADR-0528
  // D2, `TREE_SCALE`) — the trunk, litter, signpost and bloom inside scale with it.
  return g(children, {
    kind: 'tree',
    status: st,
    title: t.treeTitle,
    transform: `translate(${f(t.treeSpot.x)} ${f(t.treeSpot.y)}) scale(${f(TREE_SCALE)})`,
  });""",
    ),
    # UAT marker keep-outs: ground distances authored on the old tile
    (
        """const MARKER_GROUND_SPACING = 15;""",
        """const MARKER_GROUND_SPACING = tileUnits(15);""",
    ),
    (
        """const MARKER_GROUND_TREE_WELL = 36;""",
        """const MARKER_GROUND_TREE_WELL = tileUnits(36);""",
    ),
    (
        """      const clearsPlate = y < t.labelY - 14;
      if (clearsTree && clearsPlate && clearsSpacing(placed, x, y) && onLand(x, y)) {""",
        """      const clearsPlate = y < t.labelY - tileUnits(14);
      if (clearsTree && clearsPlate && clearsSpacing(placed, x, y) && onLand(x, y)) {""",
    ),
    (
        """        transform: `translate(${f(x)} ${f(y)}) scale(${f(small ? MARKER_SCALE_SMALL : MARKER_SCALE)})`,""",
        """        // the flower's own drawing scale, re-based onto the derived tile (ADR-0528)
        transform: `translate(${f(x)} ${f(y)}) scale(${f((small ? MARKER_SCALE_SMALL : MARKER_SCALE) * TILE_SCALE)})`,""",
    ),
    # capability plants
    (
        """  return g(children, {
    kind: 'flora',
    status: p.status,
    // The capability id — the data hook each mapper keys interactivity on (the studio
    // wires onSelectCap from it; the website uses it as data-id for delegation).
    id: p.id,
    title: p.title,
    transform: `translate(${f(p.x)} ${f(p.y)})`,
  });""",
        """  return g(children, {
    kind: 'flora',
    status: p.status,
    // The capability id — the data hook each mapper keys interactivity on (the studio
    // wires onSelectCap from it; the website uses it as data-id for delegation).
    id: p.id,
    title: p.title,
    // drawn in its own frame, scaled onto the derived tile (ADR-0528)
    transform: `translate(${f(p.x)} ${f(p.y)}) scale(${f(TILE_SCALE)})`,
  });""",
    ),
    # conifers
    (
        """    { kind: 'conifer', transform: `translate(${f(x)} ${f(y)})` },""",
        """    // drawn at its authored height, scaled onto the derived tile (ADR-0528)
    { kind: 'conifer', transform: `translate(${f(x)} ${f(y)}) scale(${f(TILE_SCALE)})` },""",
    ),
    (
        """          const y = d.y + Math.sin(a) * rr * 0.8 + 4;
          drawables.push({ y, node: buildConifer(x, y, 7 + rand01(d.seed + i) * 4, d.seed + i) });""",
        """          const y = d.y + Math.sin(a) * rr * 0.8 + tileUnits(4);
          drawables.push({ y, node: buildConifer(x, y, 7 + rand01(d.seed + i) * 4, d.seed + i) });""",
    ),
    # build wisps
    (
        """  const orbitR = t.screenRadius * 0.72 + 10;
  const wisps = t.wisps.map((w) => {""",
        """  const orbitR = t.screenRadius * 0.72 + tileUnits(10);
  const wisps = t.wisps.map((w) => {""",
    ),
    (
        """            circle(0, 0, 12, { kind: 'wisp-hit' }),
            circle(0, 0, 6.5, { kind: 'wisp-glow' }),
            circle(0, 0, 2.8, { kind: 'wisp-dot' }),
          ],
          { transform: `translate(${f(orbitR)} 0)` },""",
        """            circle(0, 0, 12, { kind: 'wisp-hit' }),
            circle(0, 0, 6.5, { kind: 'wisp-glow' }),
            circle(0, 0, 2.8, { kind: 'wisp-dot' }),
          ],
          { transform: `translate(${f(orbitR)} 0) scale(${f(TILE_SCALE)})` },""",
    ),
    # hover orbit
    (
        """const HOVER_ORBIT_R = 9;""",
        """const HOVER_ORBIT_R = tileUnits(9);""",
    ),
    # claim wisps
    (
        """  if (!claims.length) return null;
  const orbitR = t.screenRadius * 0.72 + 22;""",
        """  if (!claims.length) return null;
  const orbitR = t.screenRadius * 0.72 + tileUnits(22);""",
    ),
    (
        """      const hx = treeDx + (rand01(k + 1) - 0.5) * 18;
      const hy = treeDy - (orbitR + 12) + (rand01(k + 2) - 0.5) * 10;
      const phase = rand01(k) * 360;""",
        """      const hx = treeDx + (rand01(k + 1) - 0.5) * tileUnits(18);
      const hy = treeDy - (orbitR + tileUnits(12)) + (rand01(k + 2) - 0.5) * tileUnits(10);
      const phase = rand01(k) * 360;""",
    ),
    (
        """                  circle(0, 0, 12, { kind: 'hover-wisp-hit' }),
                  circle(0, 0, 6.5, { kind: 'hover-wisp-glow' }),
                  circle(0, 0, 2.8, { kind: 'hover-wisp-dot' }),
                ],
                { transform: `translate(${f(HOVER_ORBIT_R)} 0)` },""",
        """                  circle(0, 0, 12, { kind: 'hover-wisp-hit' }),
                  circle(0, 0, 6.5, { kind: 'hover-wisp-glow' }),
                  circle(0, 0, 2.8, { kind: 'hover-wisp-dot' }),
                ],
                { transform: `translate(${f(HOVER_ORBIT_R)} 0) scale(${f(TILE_SCALE)})` },""",
    ),
    (
        """      const qx = orbitR + 14 + queueIndex * 16;
      queueIndex += 1;
      return g(
        [
          g(
            [
              circle(0, 0, 12, { kind: 'queue-wisp-hit' }),
              circle(0, 0, 6.5, { kind: 'queue-wisp-glow' }),
              circle(0, 0, 2.8, { kind: 'queue-wisp-dot' }),
            ],
            { transform: `translate(${f(qx)} 0)` },""",
        """      const qx = orbitR + tileUnits(14) + queueIndex * tileUnits(16);
      queueIndex += 1;
      return g(
        [
          g(
            [
              circle(0, 0, 12, { kind: 'queue-wisp-hit' }),
              circle(0, 0, 6.5, { kind: 'queue-wisp-glow' }),
              circle(0, 0, 2.8, { kind: 'queue-wisp-dot' }),
            ],
            { transform: `translate(${f(qx)} 0) scale(${f(TILE_SCALE)})` },""",
    ),
    (
        """            circle(0, 0, 12, { kind: 'claim-wisp-hit' }),
            circle(0, 0, 6.5, { kind: 'claim-wisp-glow' }),
            circle(0, 0, 2.8, { kind: 'claim-wisp-dot' }),
          ],
          { transform: `translate(${f(orbitR)} 0)` },""",
        """            circle(0, 0, 12, { kind: 'claim-wisp-hit' }),
            circle(0, 0, 6.5, { kind: 'claim-wisp-glow' }),
            circle(0, 0, 2.8, { kind: 'claim-wisp-dot' }),
          ],
          { transform: `translate(${f(orbitR)} 0) scale(${f(TILE_SCALE)})` },""",
    ),
    # departing wisps
    (
        """  if (!departures.length) return null;
  const orbitR = t.screenRadius * 0.72 + 22;
  const treeDx = t.treeSpot.x - t.centroid.x;
  const treeDy = t.treeSpot.y - t.centroid.y;
  const wisps = departures.map((d) => {
    const k = hash(d.key);
    const x = treeDx + (rand01(k + 1) - 0.5) * 18;
    const y = treeDy - (orbitR + 12) - d.ageRatio * 24;""",
        """  if (!departures.length) return null;
  const orbitR = t.screenRadius * 0.72 + tileUnits(22);
  const treeDx = t.treeSpot.x - t.centroid.x;
  const treeDy = t.treeSpot.y - t.centroid.y;
  const wisps = departures.map((d) => {
    const k = hash(d.key);
    const x = treeDx + (rand01(k + 1) - 0.5) * tileUnits(18);
    const y = treeDy - (orbitR + tileUnits(12)) - d.ageRatio * tileUnits(24);""",
    ),
    (
        """            circle(0, 0, 12, { kind: 'departing-wisp-hit' }),
            circle(0, 0, 6.5, { kind: 'departing-wisp-glow' }),
            circle(0, 0, 2.8, { kind: 'departing-wisp-dot' }),
          ],
          { transform: `translate(${f(x)} ${f(y)})` },""",
        """            circle(0, 0, 12, { kind: 'departing-wisp-hit' }),
            circle(0, 0, 6.5, { kind: 'departing-wisp-glow' }),
            circle(0, 0, 2.8, { kind: 'departing-wisp-dot' }),
          ],
          { transform: `translate(${f(x)} ${f(y)}) scale(${f(TILE_SCALE)})` },""",
    ),
    # the nameplate
    (
        """function buildPlate(t: SceneTerritoryInput): SceneG {
  const p = t.plate;
  return g(
    [
      rect(0, 0, p.w, p.h, p.rx, { kind: 'plate-bg' }),
      text(p.w / 2, p.idY, p.idText, 'middle', { kind: 'plate-id' }),
      text(p.w / 2, p.subY, p.subText, 'middle', { kind: 'plate-sub' }),
    ],
    {
      kind: 'plate',
      title: p.title,
      transform: `translate(${f(t.centroid.x - p.w / 2)} ${f(t.labelY)})`,
    },
  );
}""",
        """/**
 * THE NAMEPLATE'S DRAWING SCALE — the 2D art pass's rung for the plate (ADR-0528 D2). The plate box
 * (`nameplateLayout`, studio-side) and its CSS text sizes are authored in the plate's own frame; this
 * scales that frame onto the derived tile. At `TILE_SCALE` the plate keeps the exact on-screen size it
 * had at the designed resting view. ⚠ The 2D map is a WORKING tool — the plate is what an operator
 * reads a story's id and state off — so this is the rung the increment's sheet judges hardest, at the
 * working zoom rather than the fitted one.
 */
export const PLATE_SCALE = TILE_SCALE;

function buildPlate(t: SceneTerritoryInput): SceneG {
  const p = t.plate;
  return g(
    [
      rect(0, 0, p.w, p.h, p.rx, { kind: 'plate-bg' }),
      text(p.w / 2, p.idY, p.idText, 'middle', { kind: 'plate-id' }),
      text(p.w / 2, p.subY, p.subText, 'middle', { kind: 'plate-sub' }),
    ],
    {
      kind: 'plate',
      title: p.title,
      // centred on the island in ground units, then the plate's own frame scaled onto the tile
      transform: `translate(${f(t.centroid.x - (p.w * PLATE_SCALE) / 2)} ${f(t.labelY)}) scale(${f(PLATE_SCALE)})`,
    },
  );
}""",
    ),
    # parcel flora items: scaled about their own spot
    (
        """function parcelFloraItem(
  theme: SurfaceTheme,
  status: SceneStatus,
  y: number,
  marks: SceneNode[],
  opacity?: number,
): ParcelFloraMark {
  // ANNOTATED local, then one guarded assignment — the shape
  // `anti-slop/no-conditional-empty-object-spread` requires. The annotation is load-bearing: without
  // it the inferred type has no `opacity` and the write below stops compiling.
  const attrs: SceneNodeBase = { kind: 'parcel-flora', theme, status };
  if (opacity != null) attrs.opacity = opacity;
  return { y, node: g(marks, attrs) };
}""",
        """/**
 * THE PARCEL FLORA'S DRAWING SCALE (ADR-0528 D2) — the designer surfaces (`meadow.js` / `woodland.js`
 * / `heath.js`) draw their marks in ABSOLUTE coordinates around each drift-bed spot, at sizes judged
 * against the radius-27 tile; the marks are ported verbatim and are not re-authored. Each item is
 * therefore scaled ABOUT ITS OWN SPOT: `translate(p) scale(s) translate(-p)` leaves the spot where the
 * drift placed it (so containment and painter order are untouched) and shrinks the mark around it.
 */
export const FLORA_SCALE = TILE_SCALE;

function parcelFloraItem(
  theme: SurfaceTheme,
  status: SceneStatus,
  y: number,
  marks: SceneNode[],
  /** The drift-bed spot the marks were drawn around — the pivot the item scales about. */
  pivot: Pt,
  opacity?: number,
): ParcelFloraMark {
  // ANNOTATED local, then one guarded assignment — the shape
  // `anti-slop/no-conditional-empty-object-spread` requires. The annotation is load-bearing: without
  // it the inferred type has no `opacity` and the write below stops compiling.
  const attrs: SceneNodeBase = {
    kind: 'parcel-flora',
    theme,
    status,
    transform: `translate(${f(pivot.x)} ${f(pivot.y)}) scale(${f(FLORA_SCALE)}) translate(${f(-pivot.x)} ${f(-pivot.y)})`,
  };
  if (opacity != null) attrs.opacity = opacity;
  return { y, node: g(marks, attrs) };
}""",
    ),
    (
        """  const spread = 7 + Math.max(0, tests) * 0.55;""",
        """  const spread = tileUnits(7 + Math.max(0, tests) * 0.55); // a bed's radius, authored on the old tile""",
    ),
    # meadow item + call sites
    (
        """  const item = (y: number, marks: SceneNode[]): ParcelFloraMark =>
    parcelFloraItem('meadow', status, y, marks);""",
        """  const item = (y: number, marks: SceneNode[], pivot: Pt): ParcelFloraMark =>
    parcelFloraItem('meadow', status, y, marks, pivot);""",
    ),
    (
        """    flora.push(item(ps.y + 1, shrub(ps.x, ps.y)));""",
        """    flora.push(item(ps.y + tileUnits(1), shrub(ps.x, ps.y), ps));""",
    ),
    (
        """    if (status === 'unhealthy' && rand() < 0.4) marks.push(...wilt(pg.x + 3, pg.y));
    flora.push(item(pg.y, marks));""",
        """    if (status === 'unhealthy' && rand() < 0.4) marks.push(...wilt(pg.x + 3, pg.y));
    flora.push(item(pg.y, marks, pg));""",
    ),
    (
        """      flora.push(item(pf.y, flower(pf.x, pf.y)));""",
        """      flora.push(item(pf.y, flower(pf.x, pf.y), pf));""",
    ),
    (
        """      flora.push(item(psp.y, sprout(psp.x, psp.y)));""",
        """      flora.push(item(psp.y, sprout(psp.x, psp.y), psp));""",
    ),
    (
        """      flora.push(item(pw.y, wilt(pw.x, pw.y)));""",
        """      flora.push(item(pw.y, wilt(pw.x, pw.y), pw));""",
    ),
    # woodland
    (
        """  const item = (y: number, marks: SceneNode[]): ParcelFloraMark =>
    parcelFloraItem('woodland', status, y, marks);""",
        """  const item = (y: number, marks: SceneNode[], pivot: Pt): ParcelFloraMark =>
    parcelFloraItem('woodland', status, y, marks, pivot);""",
    ),
    (
        """  for (let i = 0; i < nFerns; i++) {
    const p = spot();
    const m = fern(p.x, p.y);
    flora.push(item(m.y, m.marks));
  }
  for (let i = 0; i < nShrubs; i++) {
    const p = spot();
    const m = shrub(p.x, p.y);
    flora.push(item(m.y, m.marks));
  }
  for (let i = 0; i < nFlowers; i++) {
    const p = spot();
    const m = flower(p.x, p.y);
    if (m) flora.push(item(m.y, m.marks));
  }
  for (let i = 0; i < nSaplings; i++) {
    const p = spot();
    const m = sapling(p.x, p.y);
    flora.push(item(m.y, m.marks));
  }""",
        """  for (let i = 0; i < nFerns; i++) {
    const p = spot();
    const m = fern(p.x, p.y);
    flora.push(item(m.y, m.marks, p));
  }
  for (let i = 0; i < nShrubs; i++) {
    const p = spot();
    const m = shrub(p.x, p.y);
    flora.push(item(m.y, m.marks, p));
  }
  for (let i = 0; i < nFlowers; i++) {
    const p = spot();
    const m = flower(p.x, p.y);
    if (m) flora.push(item(m.y, m.marks, p));
  }
  for (let i = 0; i < nSaplings; i++) {
    const p = spot();
    const m = sapling(p.x, p.y);
    flora.push(item(m.y, m.marks, p));
  }""",
    ),
    # heath
    (
        """  const item = (y: number, marks: SceneNode[]): ParcelFloraMark =>
    parcelFloraItem('heath', status, y, marks, conf.opacity < 1 ? conf.opacity : undefined);""",
        """  const item = (y: number, marks: SceneNode[], pivot: Pt): ParcelFloraMark =>
    parcelFloraItem('heath', status, y, marks, pivot, conf.opacity < 1 ? conf.opacity : undefined);""",
    ),
    (
        """  for (let i = 0; i < grassCount; i++) {
    const p = next();
    const m = grassTuft(p.x, p.y);
    flora.push(item(m.y, m.marks));
  }
  for (let i = 0; i < shrubCount; i++) {
    const p = next();
    const m = shrub(p.x, p.y, i < 2);
    flora.push(item(m.y, m.marks));
  }
  for (let i = 0; i < flowerClusters; i++) {
    const p = next();
    const m = bellCluster(p.x, p.y);
    flora.push(item(m.y, m.marks));
  }""",
        """  for (let i = 0; i < grassCount; i++) {
    const p = next();
    const m = grassTuft(p.x, p.y);
    flora.push(item(m.y, m.marks, p));
  }
  for (let i = 0; i < shrubCount; i++) {
    const p = next();
    const m = shrub(p.x, p.y, i < 2);
    flora.push(item(m.y, m.marks, p));
  }
  for (let i = 0; i < flowerClusters; i++) {
    const p = next();
    const m = bellCluster(p.x, p.y);
    flora.push(item(m.y, m.marks, p));
  }""",
    ),
    # garden heroes: the fit reads the tree's ground size
    (
        """  const sTarget = (crownRadius(t.caps) * GARDEN_HERO_TARGET[id]) / hero.height;""",
        """  const sTarget = (crownRadiusWorld(t.caps) * GARDEN_HERO_TARGET[id]) / hero.height;""",
    ),
    (
        """      const clearsPlate = y < t.labelY - 18;
      const clearsOthers = placed.every((p) => groundGap({ x, y }, p, elevationDeg) > t.groundRadius * 0.55);""",
        """      const clearsPlate = y < t.labelY - tileUnits(18);
      const clearsOthers = placed.every((p) => groundGap({ x, y }, p, elevationDeg) > t.groundRadius * 0.55);""",
    ),
    (
        """  const land = ownerCells && ownerCells.length ? ownerCells : null;
  const crownR = crownRadius(t.caps);
  const out: Array<{ y: number; node: SceneNode }> = [];

  // the autumn-tree hero AS the central tree (ADR-0221)""",
        """  const land = ownerCells && ownerCells.length ? ownerCells : null;
  const crownR = crownRadiusWorld(t.caps);
  const out: Array<{ y: number; node: SceneNode }> = [];

  // the autumn-tree hero AS the central tree (ADR-0221)""",
    ),
    # empties: the coast hex inset
    (
        """      return path(hexPath(c.x, c.y, HEX_R - 0.6), id === undefined ? { kind: 'empty' } : { kind: 'empty', id });""",
        """      return path(hexPath(c.x, c.y, HEX_R - tileUnits(0.6)), id === undefined ? { kind: 'empty' } : { kind: 'empty', id });""",
    ),
    # trails: the 2D stroke
    (
        """  const attrs: SceneNodeBase = {
    kind,
    id: s.id,
    usage: s.usage,
    edges: edgesOf(s.id),
    strokeWidth: trailFillWidth(s.usage) + widen,
  };""",
        """  const attrs: SceneNodeBase = {
    kind,
    id: s.id,
    usage: s.usage,
    edges: edgesOf(s.id),
    strokeWidth: trailFillWidth(s.usage) * TRAIL_STROKE_SCALE + tileUnits(widen),
  };""",
    ),
    (
        """/** One trail-segment path node — the segment id + `data-usage`/`data-edges` hooks, and
 *  the per-pass stroke width derived from the ONE width rule (`trailFillWidth`). */""",
        """/**
 * THE 2D TRAIL'S STROKE SCALE — the 2D art pass's rung for the trails (ADR-0528 D2). `trailFillWidth`
 * is the ONE width rule every surface shares, in ground units, and the 3D mapper reads it DIRECTLY
 * (`world-to-3d.ts`) for its ribbon — so it must not move, or the 3D island's own trails would.
 * What the 2D drawing strokes is that width times this factor: at `TILE_SCALE` the trail keeps the
 * exact on-screen width it had at the designed resting view; at 1 the 2D trail is as wide relative
 * to its island as the 3D ribbon is. The cave portal (`buildCave`) is NOT scaled: the mapper recovers
 * its mouth width from the drawn arch, so its geometry is the 3D contract.
 */
export const TRAIL_STROKE_SCALE = TILE_SCALE;

/** One trail-segment path node — the segment id + `data-usage`/`data-edges` hooks, and
 *  the per-pass stroke width derived from the ONE width rule (`trailFillWidth`). */""",
    ),
    # hits: the delegation rect
    (
        """      const crownR = crownRadius(t.caps);
      const top = t.treeSpot.y - (2.7 * crownR + 16);
      const hgt = t.labelY + t.plate.h - top;
      return rect(t.centroid.x - t.screenRadius, top, t.screenRadius * 2, hgt, 14, {""",
        """      const crownR = crownRadius(t.caps);
      const top = t.treeSpot.y - (2.7 * crownR + 16) * TREE_SCALE;
      const hgt = t.labelY + t.plate.h * PLATE_SCALE - top;
      return rect(t.centroid.x - t.screenRadius, top, t.screenRadius * 2, hgt, tileUnits(14), {""",
    ),
])

# ---------------------------------------------------------------- index.ts
patch('index.ts', [
    (
        """  HEX_R,
  HEX_W,
  TILE_DEPTH,
  TILE_DEPTH_WORLD,
  axialKey,""",
        """  HEX_R,
  HEX_W,
  HEX_AREA,
  HEX_UNIT_AREA,
  HEX_TILES_PER_CAPABILITY,
  LAND_AREA_PER_CAPABILITY,
  PRE_ADR0528_TILE,
  TILE_QUOTA_RULE,
  TILE_SCALE,
  tileUnits,
  TILE_DEPTH,
  TILE_DEPTH_WORLD,
  axialKey,""",
    ),
    (
        """export { ringsOf, estRadius, crownRadius, storyTreeReach } from './sizing.js';""",
        """export { ringsOf, estRadius, tileQuota, TREE_SCALE, crownRadius, crownRadiusWorld, storyTreeReach } from './sizing.js';""",
    ),
])

# scene.ts imports from hex.js: add TILE_SCALE + tileUnits
s = open(ROOT + 'scene.ts').read()
import re
m = re.search(r"import \{([^}]*)\} from './hex.js';", s)
assert m, 'no hex import in scene.ts'
names = m.group(1)
if 'tileUnits' not in names:
    new_names = names.rstrip() + ('' if names.rstrip().endswith(',') else ',') + '\n  TILE_SCALE,\n  tileUnits,\n'
    s = s.replace(m.group(0), 'import {' + new_names + "} from './hex.js';")
    open(ROOT + 'scene.ts', 'w').write(s)
    print('scene.ts: hex imports extended')
print('ENGINE PATCH APPLIED')
