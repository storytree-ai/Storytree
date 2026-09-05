# One tree per capability, with the ground cover laddered beside it (2026-09-05)

The increment: `restore-the-true-footprint-and-ladder-the-grove-density` on `land-ground-stack-arc`,
whose grove half was overtaken mid-flight by **ADR-0518**. The owner looked at a dressed island and
asked why it carried about a hundred trees when no story has that many capabilities, then ruled:
*"1 tree per a capability it needs to look good not like a forest"*. The grove of dressing pines
(ADR-0507 D2) is retired outright — not tuned — and what carries an island that now stands 3–6 trees
over its true footprint is the **ground cover**: bushes, grass tufts and small white flowers
(ADR-0507 D4, ADR-0518 D2). Its COUNT is laddered here at the size that already shipped, and shown.

> ⚠ Every figure here was taken on this run, on the arc's named box (ADR-0505 D3): **NVIDIA GeForce
> RTX 2060** (ANGLE / OpenGL 4.5), `software=false`, exact-colour mode, lights calibrated by the
> map's own probe. Nothing is inherited from an increment row, an arc intent or an earlier sheet —
> every committed sheet on this arc before this one shows the grove, and `today` is REBUILT here
> from the harness's own copy of the retired placement rather than read off a frame from hours ago.

## What the island looks like now, and how many trees it stands

**One island at 8 px/unit** (`sheet-8px.png`; `sheet-reference.png` puts the approved render, this
morning's map and the shipped map side by side):

| arm | trees | dressing pines | blooms | ground cover (bushes / tufts / flowers) | MICRO | px moved >20/255 vs today |
| --- | --- | --- | --- | --- | --- | --- |
| **`today` — as it shipped until this landing** | 11 (one per capability) | **61** | 10 | 216 (70 / 120 / 26) | 2.21 | — |
| `cover-x1` — the grove removed, nothing else | 11 | **0** | 10 | 216 (70 / 120 / 26) | 1.88 | 118,797 |
| `cover-x2` | 11 | 0 | 10 | 432 (140 / 240 / 52) | 2.72 | 172,509 |
| **`cover-x3` — SHIPPED** | **11** | **0** | 10 | **648 (210 / 360 / 78)** | 3.44 | 218,930 |
| `cover-x4` — the boldest rung rendered | 11 | 0 | 10 | 864 (280 / 480 / 104) | 4.12 | 250,956 |
| the approved render | 13 stands × 4–8 pines | | | 70 / 120 / 26 | 2.54 | never differenced |

- **The tree count is the capability count, on every arm the map can now draw.** Eleven capabilities,
  eleven trees. This morning the same island stood 72 tree-shaped objects, 61 of them dressing; the
  driver refuses a run in which any ladder arm stands a single one (ADR-0518 D4 — the count may not
  be padded back through the instrument).
- **Rung x1 shows what removing the grove alone does, and it is not enough.** The island is a green
  expanse with eleven trees and a thin scatter — the recipe's 216 props were proportioned for an
  island that also stood 52–104 pines. That is ADR-0518 D2's premise in a picture.
- **Rung x3 ships, picked on the look (ADR-0489 D3, ADR-0503).** At x2 there are still bare stretches
  between the trees; at x3 the cover carries the island evenly while the ground's own colour — the
  story's state, which is what the land IS for (ADR-0475 D2) — still reads through it, with clearings;
  at x4 the island starts to read as a uniform speckle and the state colour begins to disappear under
  it. x3 is the boldest rung I can defend; the owner scales along rungs already rendered, and the
  constant is `COVER_DENSITY` in `src/cover-dressing.ts` (`SHIPPED_ARM` on the page moves with it).
- **The red criterion marker stays the only red flower and the only flower at its size** (ADR-0507
  D4): the count ladder multiplies the recipe's scatter and moves no width; the size rung is the
  settled 4.5, and `kit-vocabulary.test.ts` still holds the flower-patch bound at that rung.

## The forest — the view the map opens on (`sheet-forest-fit.png`)

| arm | trees | dressing pines (per green island) | ground cover (per green island) | triangles |
| --- | --- | --- | --- | --- |
| `today` | 374 | 1,476 (70) | 4,536 (216) | 3,569,544 |
| `cover-x1` | 374 | 0 | 4,536 (216) | 2,057,150 |
| `cover-x2` | 374 | 0 | 9,072 (432) | 3,421,490 |
| **`cover-x3` — SHIPPED** | **374** | **0** | **13,608 (648)** | 4,786,284 |
| `cover-x4` | 374 | 0 | 18,144 (864) | 6,149,976 |

At the opening view every green island stays a clean block of its own colour at every rung (the
fitted frames differ from `today` by ~10 k pixels of 4.1 M); the cover is an 8 px/unit reading, and
what the forest view shows is that nothing about it smudges the state blocks.

## Frame cost — TAKEN, RECORDED, AND NOT A GATE (ADR-0517 D4)

`frame-cost.txt`, GPU clock, 5 arms × 2 pictures × 5 interleaved repeats × 20 frames per query,
**two independent runs, every row reproduced within the runs' own noise, nothing dropped**:

| picture | `today` | `cover-x1` | `cover-x2` | **`cover-x3` (shipped)** | `cover-x4` |
| --- | --- | --- | --- | --- | --- |
| the whole fitted forest | 1.751 ms (10.5% of 16.67) | 1.244 ms (7.5%) | 1.712 ms (10.3%) | **2.187 ms (13.1%), +0.436 ms, 1.25×** | 2.657 ms (15.9%) |
| one island at 8 px/unit | 1.785 ms (10.7%) | 1.795 ms (10.8%) | 1.811 ms (10.9%) | **1.846 ms (11.1%), +0.061 ms** | 1.872 ms (11.2%) |

Read it honestly: removing the grove is worth −0.51 ms on the fitted forest (x1), and the cover rung
that carries the look costs that back and more — the shipped picture is 25% dearer than this
morning's on the forest, because 648 cover props per island are more triangles than 61 pines were.
On one island at the read zoom the rung barely moves the number (fill cost dominates). This is a
report beside the sheet, not the reason for any of it: the grove went because the owner read it as
capabilities, and the rung was picked on the look.

## What moved in `src/`

- **`grove-dressing.ts` is DELETED.** Its ground helpers (the recipe's island area, the shoelace and
  the bounding box, the ray cast, the beach-and-path exclusion, the healthy-only gate) survive as
  `dressing-ground.ts`, named for what they do; the ground cover reads them by import as it always
  did. `map-dressing.ts` has two entry points now — the vocabulary, and the vocabulary plus cover —
  and no layer in `src/` places a `tree`.
- **`kit-vocabulary.ts` carries no grove:** the `'grove'` capId, the 0.45 relaxed clearance and the
  grove key in the census are gone, and `kit-vocabulary.test.ts` holds ADR-0518 D3 as a property of
  the tables — no dressing role is served by a tree assembly, no dressing object is a pine part by
  the kit's own name, and the signal prose admits no tree.
- **`cover-dressing.ts` gains the count ladder** `COVER_DENSITY_RUNGS = [1, 2, 3, 4]` and the shipped
  pick `COVER_DENSITY = 3`; `dressMapWithCover` takes `coverDensity` beside `coverSize`. The
  `recipeIslandArea` pass-through (one caller, the retired footprint page's squashed control) went.
- **Retired with their question:** `harness/shipped-canopy.html` and its two drivers (the grove
  ladder), `harness/shipped-footprint-*` (the footprint and elevation are landed; its grove ladder is
  answered "none" — its evidence dir is annotated as overtaken and stays). `shipped-canopy-scene.ts`
  survives as the shared builder the cover, detail and shadow pages compose from, with two arms.
- **`harness/grove-history.ts`** is the deleted placement, verbatim, harness-only, called by exactly
  one thing: this page's control arm. `scope-fence` keeps it out of `src/`.

## How the page keeps itself honest

- Every ladder arm is the shipped composition root: `shippedGroundBuild`, `dressMapWithCover` with the
  canvas's own options plus the rung, `buildGroundMaterial` with the shipped constants. The four ladder
  arms share ONE ground build and one caster set (cover casts nothing); the control's ground is its own,
  because the grove cast. The driver refuses a run where the meshes, the vocabulary or the casters
  differ between ladder arms, where the ladder does not rise, where a rung is byte-identical to its
  neighbour, or where the control stands no grove.
- Pixels moved > 20/255 are reported (ADR-0490 D6) against `today`, and against the rung one leaner.

## Files

20 frames `<arm>-<size>-<zoom>.png` (2560×1600) · `sheet-8px.png` (one island, the five arms,
cropped) · `sheet-reference.png` (the approved render, this morning's map, the shipped map) ·
`sheet-forest-fit.png` (the opening view, five arms) · `measurements.json` (20 rows) · `reference.json`
· `report.txt` · `frame-cost.txt` / `frame-cost.json`.

Page: `packages/forest-world-r3f/harness/shipped-per-capability.html` /
`shipped-per-capability-scene.ts`; drivers: `shipped-per-capability-measure.mjs`
(`pnpm --filter @storytree/forest-world-r3f measure-shipped-per-capability`) and
`shipped-per-capability-cost.mjs` (`measure-per-capability-cost`), both with `DISPLAY=:0` on this box
so headless chromium reaches the GPU; tests: `shipped-per-capability-scene.test.ts`,
`src/dressing-ground.test.ts`, `src/cover-dressing.test.ts`, `src/map-dressing.test.ts`,
`src/kit-vocabulary.test.ts`. Sheets: `harness/crop-sheet.mjs --smooth 1` / `harness/contact-sheet.mjs`.
