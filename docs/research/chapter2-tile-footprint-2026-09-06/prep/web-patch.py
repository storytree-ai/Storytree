#!/usr/bin/env python3
"""ADR-0528 web-side re-basing — web/src/scripts/forest-snapshot-map.ts (the public forest page's own
packer). The engine sync brings the derived tile; this packer's absolute constants were authored on
the radius-27 tile, so they re-base through the engine's own `tileUnits()` and the quota takes the
engine's `tileQuota`. A uniform re-basing: the public picture keeps its composition at its fit."""
import sys

P = '/home/mickh/code/Storytree/.claude/worktrees/tile/web/src/scripts/forest-snapshot-map.ts'
s = open(P).read()


def rep(old, new):
    global s
    n = s.count(old)
    if n != 1:
        print(f'FAIL: anchor found {n} times:\n{old[:220]}')
        sys.exit(1)
    s = s.replace(old, new)


rep("""  HEX_R,
""", """  HEX_R,
  tileQuota,
  tileUnits,
""")
rep("""const MARGIN_TOP = 150;
const MARGIN_BOTTOM = 130;
const MARGIN_SIDE = 90;
/** Gap between rank rows and between islands within a row (scene units). */
const RANK_GAP = 40;
const ISLAND_GAP = 190;
/** A lone island in a row swings off the column so its roads sweep as diagonals. */
const RANK_SWING = 300;
/** Nameplate baseline, below the island's centre. */
const PLATE_Y = 62;

/** Tile quota for a story — the studio's own curve: capability count plus headroom. */
function quotaOf(story: SnapshotStory): number {
  return Math.max(3, story.capabilities.length + 2);
}""",
    """// ⚠ Every length below is authored on the pre-ADR-0528 tile (hex radius 27) and RE-BASED through the
// engine's `tileUnits()`: the engine's tile is now derived from the land ratio (one hex per
// capability, radius ≈ 11.06 — `packages/forest-world/src/hex.ts`), and this page's gaps and
// margins keep meaning "so much of a tile". A uniform re-basing keeps the composition this page
// had at its fit; the numbers stay this repo's own look decision.
const MARGIN_TOP = tileUnits(150);
const MARGIN_BOTTOM = tileUnits(130);
const MARGIN_SIDE = tileUnits(90);
/** Gap between rank rows and between islands within a row (scene units). */
const RANK_GAP = tileUnits(40);
const ISLAND_GAP = tileUnits(190);
/** A lone island in a row swings off the column so its roads sweep as diagonals. */
const RANK_SWING = tileUnits(300);
/** Nameplate baseline, below the island's centre. */
const PLATE_Y = tileUnits(62);

/** Tile quota for a story — the engine's rule since ADR-0528: one tile per capability. */
function quotaOf(story: SnapshotStory): number {
  return tileQuota(story.capabilities.length);
}""")
rep("""        x: cursor + w + (rand01(seed) - 0.5) * 40,
        y: (rowY[r] ?? 0) + (rand01(seed + 1) - 0.5) * 26,""",
    """        x: cursor + w + (rand01(seed) - 0.5) * tileUnits(40),
        y: (rowY[r] ?? 0) + (rand01(seed + 1) - 0.5) * tileUnits(26),""")
open(P, 'w').write(s)
print('WEB PATCH APPLIED')
