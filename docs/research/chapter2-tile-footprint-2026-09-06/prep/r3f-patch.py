#!/usr/bin/env python3
"""ADR-0528 r3f patch — packages/forest-world-r3f/src/land-per-capability.ts (+ its test): the tuned
basis is FROZEN on the pre-ADR-0528 tile so LAND_SCALE — and with it every band, lattice and relief
on the shipped island — does not move when the engine's HEX_R does."""
import sys

ROOT = '/home/mickh/code/Storytree/.claude/worktrees/tile/packages/forest-world-r3f/src/'


def patch(name, pairs):
    p = ROOT + name
    s = open(p).read()
    for old, new in pairs:
        n = s.count(old)
        if n != 1:
            print(f'FAIL {name}: anchor found {n} times:\n{old[:220]}')
            sys.exit(1)
        s = s.replace(old, new)
    open(p, 'w').write(s)
    print(f'patched {name} ({len(pairs)} edits)')


patch('land-per-capability.ts', [
    (
        """// under it: the island the 2D layout draws is `max(3, capabilities + 2)` hex tiles of `HEX_R = 27`
// (`apps/studio/src/components/TreeView.tsx`, `packages/forest-world/src/sizing.ts`), so island area
// already scales with capability count — through a constant nobody chose. On the fixture island it
// comes to ~2,240 units² of land per capability, and one tree standing on 2,240 units² is a tree
// adrift on a field. The picture he called nicer stood a tree on roughly 320.""",
        """// under it: the island the 2D layout drew was `max(3, capabilities + 2)` hex tiles of `HEX_R = 27`
// (`apps/studio/src/components/TreeView.tsx`, `packages/forest-world/src/sizing.ts`), so island area
// already scaled with capability count — through a constant nobody chose. On the fixture island it
// came to ~2,240 units² of land per capability, and one tree standing on 2,240 units² is a tree
// adrift on a field. The picture he called nicer stood a tree on roughly 320.
//
// ⚠ CORRECTED IN PLACE 2026-09-06 (ADR-0528): the 2D tile now FOLLOWS the ratio — one hex per
// capability, the hex sized so a drawn island is exactly `capabilities × LAND_AREA_PER_CAPABILITY`
// — and the ratio itself moved DOWN to the engine (`packages/forest-world/src/hex.ts`), which this
// module re-exports. The mapper below is unchanged in effect: it still sizes every island to exactly
// the ratio about its own centre, and on a correctly-drawn island that factor is close to 1. What
// this module now guards is the TUNED BASIS: every band and lattice constant in this package was
// judged on the pre-ADR-0528 tile, so `HEX_TILE_AREA` is frozen on that tile (`PRE_ADR0528_TILE`)
// rather than read off the engine's live `HEX_R` — otherwise `LAND_SCALE` would have jumped from
// 0.377 to 0.925 and every feature on the shipped island would have grown 2.4× overnight.""",
    ),
    (
        """import { HEX_R } from '@storytree/forest-world';
""",
        """import { LAND_AREA_PER_CAPABILITY, PRE_ADR0528_TILE } from '@storytree/forest-world';
""",
    ),
    (
        """/** One hex tile's ground-plane area in the TRUE basis — a regular hexagon of circumradius `HEX_R`,
 *  `(3√3 / 2) · R²`. The unit every 2D island is built from, so the unit the old ratio hid in. */
export const HEX_TILE_AREA = ((3 * Math.sqrt(3)) / 2) * HEX_R * HEX_R;""",
        """/** One hex tile's ground-plane area in the TRUE basis ON THE TUNED TILE — a regular hexagon of the
 *  pre-ADR-0528 circumradius 27, `(3√3 / 2) · R²` ≈ 1,894. The unit every 2D island WAS built from,
 *  so the unit the old ratio hid in — and the basis every constant here was judged against. ⚠ It
 *  reads `PRE_ADR0528_TILE`, never the engine's live `HEX_R`, on purpose: the tile is derived now
 *  (≈ 11.06) and this basis must not follow it, or `LAND_SCALE` moves and so does every band. */
export const HEX_TILE_AREA = ((3 * Math.sqrt(3)) / 2) * PRE_ADR0528_TILE.hexR * PRE_ADR0528_TILE.hexR;""",
    ),
    (
        """/**
 * ⚠⚠ THE SHIPPED RATIO — the rung the map draws. PICKED ON THE LOOK (ADR-0489 D3, ADR-0503 D1),
 * from the ladder above rendered at both zooms on the RTX 2060
 * (`docs/research/chapter2-land-per-capability-2026-09-05/`). Its provenance is the ladder's: the
 * density of the picture the owner called nicer, which the approved render's own density agrees
 * with in the true basis. A constant with no provenance is how the old ratio drifted unchosen for
 * as long as it did; change this one on a rendered ladder, never by hand.
 */
export const LAND_AREA_PER_CAPABILITY = 318;""",
        """/**
 * ⚠⚠ THE SHIPPED RATIO — the rung the map draws. PICKED ON THE LOOK (ADR-0489 D3, ADR-0503 D1),
 * from the ladder above rendered at both zooms on the RTX 2060
 * (`docs/research/chapter2-land-per-capability-2026-09-05/`). Its provenance is the ladder's: the
 * density of the picture the owner called nicer, which the approved render's own density agrees
 * with in the true basis. A constant with no provenance is how the old ratio drifted unchosen for
 * as long as it did; change this one on a rendered ladder, never by hand.
 *
 * ⚠ DECLARED IN THE ENGINE since ADR-0528 (`packages/forest-world/src/hex.ts`), because the 2D
 * lattice derives from it and that package is the root; re-exported here so every reader in this
 * package keeps its import. The value and its provenance are unchanged — 318.
 */
export { LAND_AREA_PER_CAPABILITY };""",
    ),
])

patch('land-per-capability.test.ts', [
    (
        """import { HEX_R } from '@storytree/forest-world';
""",
        """import { HEX_R, LAND_AREA_PER_CAPABILITY as ENGINE_RATIO, PRE_ADR0528_TILE } from '@storytree/forest-world';
""",
    ),
    (
        """test('the tuned reference is the fixture island: thirteen regular hexes of HEX_R over eleven capabilities, ≈ 2,238.4 units² each — and LAND_SCALE is the edge-to-edge factor to the shipped rung', () => {
  assert.equal(HEX_R, 27);""",
        """test('the tuned reference is the fixture island: thirteen regular hexes of the PRE-ADR-0528 tile over eleven capabilities, ≈ 2,238.4 units² each — and LAND_SCALE is the edge-to-edge factor to the shipped rung', () => {
  // ⚠ The basis is FROZEN on the tile the constants were tuned on, not the engine's live tile: the
  // engine's HEX_R follows the ratio since ADR-0528 (≈ 11.06), and had this read it, LAND_SCALE
  // would have jumped to ~0.93 and every band on the shipped island with it.
  assert.equal(PRE_ADR0528_TILE.hexR, 27);
  assert.ok(HEX_R < PRE_ADR0528_TILE.hexR, `the engine's tile (${HEX_R}) is derived and smaller than the tuned one`);
  assert.equal(LAND_AREA_PER_CAPABILITY, ENGINE_RATIO, 'one ratio, declared in the engine and re-exported here');""",
    ),
])
print('R3F PATCH APPLIED')
