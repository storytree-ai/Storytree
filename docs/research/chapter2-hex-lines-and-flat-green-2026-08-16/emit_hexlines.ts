/**
 * The HEX LATTICE, in the same ground space the island's cells live in.
 *
 * The owner's phrase "the hex lines" does not distinguish the island's two grids, so this pass has
 * to be able to point at each one separately. `island.json` already carries variantB's 214 relaxed
 * mesh cells as ground polygons. It carries the 17 hex TILES only as axial `{q,r}` pairs — the
 * lattice's geometry is never written down, because nothing downstream draws it.
 *
 * This file writes that missing half, and it does so by INVOKING the app's own geometry rather than
 * re-deriving it (`hexCenter` / `hexCorners` / `HEX_R` / `unprojectGround`, exactly the calls
 * `substrate.ts` makes when it builds the mesh from the same lattice). A hand-rolled hex formula
 * here would be a second copy able to disagree with the one the mesh was actually built from, and
 * the whole question this pass answers is whether the mesh still traces the lattice — a question a
 * drifted copy would answer wrongly and confidently.
 *
 * The transform matches `emit_island.ts` line-for-line: corners come back in SCREEN space (the
 * substrate works there) and are unprojected to the ground plane with the declared camera's own
 * inverse, so the emitted polygons are directly comparable to `island.json`'s `variantB.cells`.
 *
 * Run:  npx tsx docs/research/chapter2-hex-lines-and-flat-green-2026-08-16/emit_hexlines.ts
 * Out:  hex-lattice.json
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  LAND_CAMERA_ELEVATION_DEG,
  unprojectGround,
} from '../../../packages/forest-world/src/camera.js';
import {
  HEX_R,
  axialKey,
  hexCenter,
  hexCorners,
  type Axial,
} from '../../../packages/forest-world/src/hex.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const ISLAND_PATH = join(
  HERE,
  '..',
  'chapter2-grass-reads-as-signal-2026-08-16',
  'island.json',
);

interface Island {
  hexR: number;
  tiles: Axial[];
  camera: { elevationDeg: number };
}

const island = JSON.parse(readFileSync(ISLAND_PATH, 'utf8')) as Island;

/**
 * THE ISLAND IS READ, NEVER RESTATED. This pass composes the SAME island the prior pass delivered,
 * so its tiles are taken from that file rather than re-scattered from the seed. If the two ever
 * disagreed about the lattice radius the comparison below would be measuring two different
 * islands, so that is asserted rather than assumed.
 */
if (island.hexR !== HEX_R) {
  throw new Error(
    `island.json hexR=${island.hexR} but the app's HEX_R=${HEX_R} — the mesh in that file was ` +
      `built from a different lattice than the one this file is about to emit.`,
  );
}

const tiles = island.tiles.map((h) => {
  const c = hexCenter(h);
  return {
    q: h.q,
    r: h.r,
    key: axialKey(h),
    centreGround: (({ x, y }) => [x, y])(unprojectGround(c)),
    /** The six corners, ground space, in ring order — the polygon a hex seam WOULD be stroked on. */
    poly: hexCorners(c.x, c.y, HEX_R).map((p) => {
      const g = unprojectGround(p);
      return [g.x, g.y];
    }),
  };
});

const out = {
  source:
    'packages/forest-world/src/hex.ts — hexCenter/hexCorners at HEX_R, unprojected with ' +
    'camera.ts unprojectGround. INVOKED, not re-derived.',
  note:
    'The lattice the 214-cell mesh was BUILT from (substrate.ts buildMeshCells interns these same ' +
    'corners). Nothing in the compositor draws these polygons; they are emitted here only so the ' +
    'pass can measure how much of the lattice survives as cell edges.',
  elevationDeg: LAND_CAMERA_ELEVATION_DEG,
  hexR: HEX_R,
  tiles,
};

const OUT_PATH = join(HERE, 'hex-lattice.json');
writeFileSync(OUT_PATH, `${JSON.stringify(out, null, 1)}\n`);
console.log(
  `${OUT_PATH}  tiles=${tiles.length}  hexR=${HEX_R}  ` +
    `elevation=${LAND_CAMERA_ELEVATION_DEG} (LAND_CAMERA_ELEVATION_DEG, read not restated)`,
);
