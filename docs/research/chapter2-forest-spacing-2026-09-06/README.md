# The forest's spacing as a fraction of island size (2026-09-06)

The increment: `forest-spacing-derived-from-island-size` on `land-ground-stack-arc`, building
**ADR-0521** (owner-directed: *"just go straight to C, this really needs to be procedurally
determined"*). The 2D studio map's row packer held three absolute gaps — `RANK_GAP` 40,
`ISLAND_GAP` 60, `RANK_SWING` 140 units, chosen by eye and halved on the owner's 2026-08-16 call.
They are retired. Every gap is now `ISLAND_SPACING_RATIO × the mean radius of the two islands it
separates`, on both axes, and a lone island swings by its radius plus that gap
(`apps/studio/src/lib/islandSpacing.ts`). The 3D map lays out nothing of its own — it reads the 2D
positions — so it inherits the change with no 3D-side constant.

> ⚠ Every figure here was taken on this run, on the arc's named box (ADR-0505 D3): **NVIDIA GeForce
> RTX 2060** (ANGLE / OpenGL 4.5), `software=false`, exact-colour mode, lights calibrated by the
> map's own probe. Nothing is inherited from an increment row, an arc intent or an earlier sheet.

## The instrument is new, and the difference matters

**Every earlier "fitted forest" on this arc stood on a synthetic crowd.** `crowdLayout` scatters
copies of one fixture island across a grid calibrated to a land share read off the public map's PNG;
it models density and knows nothing of the map's topology. The spacing IS the topology, so this
page renders the **real forest**: the studio's own `buildWorld` output for the live corpus (35
islands, 90 dependency trails), exported per rung through a `?sceneExport=1` bridge on the studio
map (`apps/studio/src/lib/sceneExport.ts`, driven by `apps/studio/scripts/export-spacing-scenes.mjs`),
pruned to what the 3D mapper reads, and committed as `scenes/<arm>.json`. The harness page
`packages/forest-world-r3f/harness/shipped-spacing.html` fetches them and hands each to the SHIPPED
3D pipeline — `worldTo3D` at the shipped land ratio, `dressMapWithCover` with the canvas's own
options, `shippedGroundBuild`, `buildGroundMaterial`. Every arm is the same forest; only where the
islands stand moves. The control (`today`) is the layout as it stood before this landing, composed
through the packer's `legacy` option (the three absolute gaps typed as history) — it cannot be read
off the shipped code any more.

## The ladder — the whole real forest, fitted (`sheet-forest-fit.png`)

| arm | gaps | land, % of the fitted frame | % of the forest's own box | layout area vs today | nearest pair: centres / water (units) | island px | pine px |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `today` — before this landing | 40 / 60 / 140 absolute | 0.67% | 1.6% | 100% | 218 / 173 | 34 | 6.6 |
| `spacing-0.5` | 0.5 × radius | 0.58% | 1.5% | 106% | 180 / 121 | 36 | 6.2 |
| `spacing-0.35` | 0.35 × radius | 0.66% | 1.7% | 95% | 121 / 51 | 38 | 6.5 |
| `spacing-0.2` | 0.2 × radius | 0.76% | 1.9% | 82% | 151 / 110 | 41 | 7.0 |
| `spacing-0.1` | 0.1 × radius | 0.82% | 2.1% | 74% | 152 / 111 | 37 | 7.3 |
| **`spacing-0` — SHIPPED** | **0 × radius (the hex floor)** | **0.89%** | **2.3%** | **68%** | **144 / 65** | **33** | **7.6** |

- **The ladder tightens as it should.** The layout's centre-to-centre area falls monotonically from
  106% of today's at 0.5 (a ratio that gives big islands more room than the old constants did) to
  68% at 0. Land share rises 0.67% → 0.89% of the frame; 1.6% → 2.3% of the forest's own bounding
  box — the second number isolates the spacing from the frame's aspect, since the real DAG is a
  tall column and the frame is a laptop.
- **0 ships, under ADR-0503's bold-and-scale-back.** At 0 the derived gap is nothing and islands
  sit exactly as close as the hex lattice's growth floor allows. The 2D map still reads (below);
  every trail routes. The owner scales back off the sheet by naming a rung.
- **⚠ THE BOUND, WHICH THE LADDER SHOWS RATHER THAN ARGUES.** Even at 0 the forest is dots in a
  field: 0.89% against the 1.9% the compacted model in the settled question rendered. The three
  constants held about a third of the layout's area and removing them recovered exactly that. The
  other two thirds is the **2D tile footprint** — each island is drawn as `capabilities + 2` hexes of
  radius 27, two islands can never overlap, and the 3D mapper shrinks each island IN PLACE to about
  0.38 of that footprint while reading its centre unchanged. No ratio on the gaps can close a slot
  the tile sets. That is option B's lever (the 2D tile following the ratio) or a derived twin of
  option A (3D positions scaled by the same factor as sizes) — escalated on the arc as
  `oq-gaps-derived-forest-still-sparse-tile-or-positions`, not decided here.

## One island at 8 px/unit — unaffected (`sheet-one-island.png`)

`context-traversal-capture` (the real story the harness fixture is shaped after) on every arm:
**7 capabilities, 2,226 units² of land, 318.0 per capability, 7 trees, cover at the shipped rung.**
The driver refuses any arm on which any island's land per capability is not exactly 318, or on which
the read island's capability count or land changes. Its ring's SHAPE varies rung to rung (59×78 →
51×63 units): the 2D territory grows its tiles from a seed the spacing moved, and the growth jitter
hashes the absolute hex key — so pixels move, and the ground noise is world-anchored. Its LAND cannot.

## The 2D studio map itself (`sheet-2d-studio.png`) — ADR-0520's consequence list, answered

1. **Every island moves; the trails survive — verified, not assumed.** At every rung the router
   draws **90 edges, 0 dropped** (read off the same `HexWorld` the scene was folded from, refused
   otherwise by both the export and the 3D driver).
2. **The 2D map changes for everyone, and it still reads.** Nameplates clear, trails routed, islands
   separated by their coast rings at every rung including 0 (`2d-<arm>-fit.png`,
   `2d-<arm>-resting.png`, at the fitted and the designed resting views). Option B's "own art pass"
   cost did NOT transfer to C. The resting zoom (ADR-0471) is bound by island diameter and does not
   move; the fitted zoom moves from scale 0.297 to 0.279 as the world's bounds move (`2d-metrics.json`).
3. **Nothing caches a 2D island position.** The studio's payload cache persists the STORIES, never
   the built world (`apps/studio/src/lib/payloadCache.ts`); the desktop app reads no territories;
   the website's forest page owns its own packer and is untouched (see below).
4. **Every earlier sheet on this arc is stale as a LAYOUT reference and valid as a GROUND one.** The
   ground material, the land-per-capability ratio, the trees and the cover are untouched by this
   landing; `docs/research/chapter2-land-per-capability-2026-09-05/README.md` carries the note.

⚠ **Two other row packers exist and were NOT changed:** the public website's forest page
(`web/src/scripts/forest-snapshot-map.ts`, gaps 40 / 190 / 300) and its demo map
(`web/src/lib/world.ts`, 30 / 52 / 210). Both are the web repo's own look decisions, stated as
such in their headers; ADR-0521 and the increment name the STUDIO packer. The synthetic crowd's
`REAL_FOREST` calibration reads the public page's PNG, so it is unchanged by this landing too.

## Frame cost — TAKEN, RECORDED, AND NOT A GATE (ADR-0517 D4 / ADR-0520 D6)

See `frame-cost.txt` / `frame-cost.json` (GPU clock, 6 arms × 2 pictures × 5 interleaved repeats ×
20 frames per query, two independent runs, `run-agreement.ts` row by row). Every number moves
because the forest's extent moves; it is a report, not an argument.

| picture | `today` | `spacing-0.5` | `spacing-0.35` | `spacing-0.2` | `spacing-0.1` | **`spacing-0` (shipped)** |
| --- | --- | --- | --- | --- | --- | --- |
| the whole real forest, fitted | 0.3446 ms (2.1% of 16.67) | 0.3346 ms | 0.3395 ms | 0.3570 ms | 0.3535 ms | **0.3743 ms (2.2%), +0.0298 ms, 1.09×** |
| one island at 8 px/unit | 0.4124 ms (2.5%) | 0.4082 ms | 0.4107 ms | 0.4207 ms | 0.4019 ms | **0.4085 ms (2.5%), −0.0039 ms** |

Every row reproduced across the two runs within the runs' own noise; nothing dropped. Read it as a
report: a tighter forest at the fit is a slightly larger picture on screen (more land pixels), and
the one-island read is unchanged within noise. 5 draw calls and ~720k triangles on every arm — the
ground is one mesh and the kit is merged, so the layout moves no call count.

## Files

12 frames `<arm>-<picture>-<zoom>.png` (2560×1600) · 12 studio captures `2d-<arm>-<view>.png`
(1600×1000) · `sheet-forest-fit.png` · `sheet-one-island.png` · `sheet-2d-studio.png` ·
`scenes/manifest.json` + six `scenes/<arm>.json` (the real layout per rung, pruned to the mapper's
kinds) · `measurements.json` (12 rows) · `2d-metrics.json` · `report.txt` · `frame-cost.txt` /
`frame-cost.json`.

Reproduce: run the studio on a port of your own (`STORYTREE_STUDIO_STORE=pg`, the live store), then
`ST_STUDIO_URL=http://127.0.0.1:<port> node scripts/export-spacing-scenes.mjs` from `apps/studio`;
serve the harness (`vite harness --port <n> --strictPort --host 127.0.0.1`) and run
`measure-shipped-spacing` and `measure-spacing-cost` with `ST_SPACING_URL` and `DISPLAY=:0`.
