# The true footprint at the signed 50°, with the grove density laddered beside it (2026-09-05)

> ⚠⚠ **THE GROVE HALF OF THIS SHEET IS OVERTAKEN (ADR-0518, the same day).** The footprint and the
> elevation landed exactly as recorded below. The grove did not: the owner read the dressing pines as
> capabilities — *"1 tree per a capability it needs to look good not like a forest"* — and the role
> was retired outright rather than tuned, so there is no `GROVE_DENSITY`, no `src/grove-dressing.ts`,
> and no rung to scale along. Every arm below shows a grove the map no longer stands. The picture of
> what ships now, with the ground cover laddered in its place, is
> `docs/research/chapter2-one-tree-per-capability-2026-09-05/`.

The increment: `restore-the-true-footprint-and-ladder-the-grove-density` on `land-ground-stack-arc`,
implementing **ADR-0517**. The owner picked both arms of PR #1820's camera ladder — the island's
true footprint and the owner-signed 50° — and in the same breath asked *"i'm not sure why we placed
so many trees on this island, we have no islands with this many capabilities?"*. Because the grove
scatters by area and the footprint fix triples it, the two are judged here in one picture.

> ⚠ Every figure here was taken on this run, on the arc's named box (ADR-0505 D3): **NVIDIA GeForce
> RTX 2060** (ANGLE / OpenGL 4.5), `software=false`, exact-colour mode, lights calibrated by the
> map's own probe. Nothing is inherited from an increment row, an arc intent or an earlier sheet —
> every sheet before this one was taken at 45° on the squashed plane and is not diffed against.
> The shipped elevation is READ off `frameWorld` through the crowd camera and the driver refuses a
> run where it is not the signed 50°.

## The pick first — the true footprint at 50°, the grove at the recipe's own density

**One island at 8 px/unit** (`sheet-8px.png`; `sheet-reference.png` puts the approved render beside it):

| arm | ground plane | camera | grove rung | capability trees | grove pines | pines per capability | ground cover | island on screen w/h |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| **`before` — as it shipped until today** | squashed 234 × 46 | 45° | x2 | 11 | 77 | 7.0 | 216 | 5.26 |
| **`true-x1` — SHIPPED** | true 234 × 135 | **50°** | **x1 (the recipe's 13 stands)** | 11 | **61** | **5.5** | 216 | **2.13** |
| `true-x2` | true | 50° | x2 | 11 | 133 | 12.1 | 216 | 2.13 |
| `true-x3` | true | 50° | x3 | 11 | 203 | 18.5 | 216 | 2.13 |
| the approved render | true, Cycles | 50° | 13 stands × 4–8 = 52–104 pines | | | | | 1.69 (box includes the trees) |

- **The shape is the approved render's own geometry.** The island's on-screen proportions go from
  5.26 : 1 (a ribbon) to 2.13 : 1, which is what PR #1820 measured for the reference geometry. The
  pines lose 9% of their height to the higher camera (102 → 93 px at 8 px/unit) and gain an island
  to stand on.
- **Rung x1 ships, picked on the look.** On the true footprint a stand is round — the recipe's own
  `gauss(3.6, 3.0)` on the recipe's own aspect — so the recipe's thirteen stands hold the recipe's
  4–8 members: **61 pines**, inside the 52–104 the reference's own numbers assert, with the
  clearings that "groves with bare ground between them" means. x2 (133) closes the canopy over the
  west of the island and x3 (203) closes it everywhere. The owner scales UP along rungs already
  rendered; the constant is `GROVE_DENSITY` in `src/grove-dressing.ts`.
- **The owner's question, in numbers.** The fixture island's eleven capability trees now stand
  among 61 dressing pines — 5.5 per capability — against the 77 (7.0) the map stood before. That
  is the rung, not a redesign of the rule: the grove still scatters by area, a dressing pine is
  still 0.55–0.80 of a capability's height and untinted, and ADR-0507 D2/D5 are untouched. Whether
  a dressing count should key off capability count at all is the owner's fork and is not decided
  here (see "What is open" below).

**Why the counts differ from the canopy sheet at the same rung, and why that is correct.** The
density rule divides by `RECIPE_ISLAND_AREA`, "the ground the recipe's thirteen stands were
scattered over, in this map's placement units". The mapper now delivers the true footprint, so the
same thirteen hexes measure 2.9238× more in that basis: the constant was re-derived from 8,424.6 to
24,631.8 (`harness/true-footprint-routes.test.ts` holds it to the fixture's own area through the
shipped mapper). Left at 8,424.6 it would have grown every island 2.92× the recipe's density under a
rule still claiming to transcribe the recipe — the exact tripling the increment feared. The
denominator moved with the numerator's basis; the rule (thirteen stands per recipe island, times the
rung) did not. The ground cover divides by the same constant, so the true island wears exactly the
recipe's 216 cover props.

## The forest — the view the map opens on (`sheet-forest-fit.png`)

| arm | capability trees | grove pines (per green island) | ground cover | land share of the fitted frame | triangles |
| --- | --- | --- | --- | --- | --- |
| `before` | 374 | 1,664 (79) | 4,536 | 2.5% | 3,762,088 |
| **`true-x1` — SHIPPED** | 374 | **1,476 (70)** | 4,536 | **5.3%** | **3,569,544** |
| `true-x2` | 374 | 2,946 (140) | 4,536 | 5.3% | 5,082,198 |
| `true-x3` | 374 | 4,464 (213) | 4,536 | 5.3% | 6,634,762 |

The layout holds still: each island is unprojected about its own centre (ADR-0517 D1), so the
islands more than double their share of the opening view without moving. The 21 green islands grow
groves; the 14 others draw exactly what they drew.

## Frame cost — TAKEN, RECORDED, AND NOT A GATE (ADR-0517 D4)

The owner: *"i dont think we should slow down based on worry of the look costing us too much we can
always scale down later"*. `frame-cost.txt`, GPU clock, 4 arms × 2 pictures × 5 interleaved repeats
× 20 frames per query, **two independent runs, every row reproduced within the runs' own noise,
nothing dropped**:

| picture | `before` | **`true-x1` (shipped)** | `true-x2` | `true-x3` |
| --- | --- | --- | --- | --- |
| the whole fitted forest | 1.619 ms (9.7% of 16.67) | **1.744 ms (10.5%), +0.125 ms, 1.08×** | 2.250 ms (13.5%) | 2.766 ms (16.6%) |
| one island at 8 px/unit | 0.841 ms (5.0%) | **1.785 ms (10.7%), +0.944 ms, 2.12×** | 1.785 ms | 1.775 ms |

Read it in two halves. On the fitted forest the shipped pick costs 8% more than the map cost
yesterday — the true island draws fewer grove pines than the squashed one did at x2 — and each rung
up costs about +0.5 ms. On one island at the read zoom the cost doubles and the rung does not move
it at all (x1, x2 and x3 are within 0.01 ms of each other): that is FILL cost, the island covering
2.4× the pixels it did (land 14% → 34% of the frame), not the trees. The GPU's draw cost only; the
shipped canvas also runs React, controls and the compositor.

**Two more costs the footprint carries, stated rather than hidden**, both from tests corrected in
place on this landing: the shadow atlas that allocates land at the authored resolution grew with the
land — 10.4 MB against the clamped field's 2.7 MB (3.85×, was under 2×) for 5.3× the resolution,
still 7.4× under raising the cap (was 19×), order of the arms and decision unchanged; and on a
2048-only device the atlas now delivers 3.05× the clamped resolution rather than over 4×.

## What moved in `src/`, and what every consumer of the elevation now reads

- **`world-to-3d.ts` restores the true footprint at the mapper** (`true-footprint.ts`): every ground
  z stretched by `1 / sin 20°` = 2.9238 about its island's centre; strips blend between their two
  islands' displacements by arc length so both docks land on their stretched coasts with no step;
  cave bearings turn with the stretched rim. Done at the mapper so the canvas, the casters, the
  dressing and every comparison page move together (`comparison-baseline-moves-under-the-page`).
  `worldTo3D(scene, { cameraElevationDeg })` names the elevation the scene was projected at; plan
  view is the identity.
- **`camera-framing.ts` looks down at `RENDER_ELEV_DEG` (50°) by import**, at the retired camera's
  distance (`back · √2`) so the clip range still holds. `shippedElevationDeg()` reads it back off
  `frameWorld` and `camera-framing.test.ts` holds the two equal. **Every consumer of the elevation
  was grepped, not listed** (ADR-0517 D3): the crowd layout's `ELEV_RAD`, `deliveredHeightPx`, the
  prop-size object floor (`MIN_PROP_HEIGHT` 7.8 = 10 px / cos 50° / 2 px-per-unit), `hardware-floor`,
  `frame-cost-scene`, `pine-asset` — all already read `RENDER_ELEV_DEG`, and until today reported
  against a camera five degrees higher than the canvas looked from. `orientedCamera` and the land
  page's camera derive from `frameWorld` and moved with it. ADR-0380 D6 fence 4 stands: orthographic,
  no rotation control.
- **`RECIPE_ISLAND_AREA` 8,424.6 → 24,631.8** and **`GROVE_DENSITY` 2 → 1**, both with their reasons
  in `grove-dressing.ts`. A `recipeIslandArea` option is threaded through `dressMapWithCover` to the
  grove and the cover for ONE caller — this page's control arm, reproducing the map as it shipped
  (the runaway guard rightly refuses the alternative of a 5.85 "rung").
- **Retired:** `harness/shipped-camera-*` (its question is decided; its evidence dir stays).
  **Corrected in place** because they pinned facts about the squashed island: the coast page's
  fold-cap premise (the outset coast folded twice on the ribbon and binds on 4/2/3 rim vertices;
  on the true footprint it is simple and binds on none — the drawn island now carries the premise),
  the shore page's reach tell (the swell's peak and trough sit on the rim of the true island, so
  reach is read as moved vertices on one mesh), the shadow atlas's margins above.

## How the page keeps itself honest

- Every arm is the shipped composition root: `shippedGroundBuild`, `dressMapWithCover` with the
  canvas's own options plus the rung, `buildGroundMaterial` with the shipped constants.
- The three true arms share one ground MESH and one vocabulary; the driver refuses a run where
  triangles, capability trees or blooms differ between rungs, or the ladder does not rise.
- The control is the true stream re-projected by exactly `sin 20°` about each island's centre — the
  exact inverse of the mapper's stretch, checked against the drawing the mapper emits at plan view —
  at 45° and rung x2 in the basis it shipped in, so it stands yesterday's 26 stands (77 pines; the
  canopy landing counted 81 on the same island, the difference being placement off a re-projected
  stream rather than the drawing itself) and yesterday's 216 cover.
- Pixels moved > 20/255 are reported (ADR-0490 D6): the footprint moves ~1.11 M of 4.1 M pixels on
  one island; the rung moves ~0.1 M between neighbours.

## What is open, and where it lives

The rule that a dressing count scales by AREA — so an island with more ground grows more dressing
whatever its capability count — is the owner's fork (the increment names it; ADR-0507 D2/D5 stand).
The ladder shows a rung that reads honestly (x1), so no `open-question` is authored here; the
observation that 5.5 dressing pines per capability is still not "one tree per capability" is
recorded on the increment's closure for the owner to pick up if he wants the rule re-keyed.

## Files

16 frames `<arm>-<size>-<zoom>.png` (2560×1600) · `sheet-8px.png` (one island, the four arms, cropped)
· `sheet-reference.png` (the approved render beside the shipped pick and `before`) ·
`sheet-forest-fit.png` (the opening view, four arms) · `measurements.json` (16 rows) · `reference.json`
· `report.txt` · `frame-cost.txt` / `frame-cost.json`.

Page: `packages/forest-world-r3f/harness/shipped-footprint.html` / `shipped-footprint-scene.ts`;
drivers: `shipped-footprint-measure.mjs` (`pnpm --filter @storytree/forest-world-r3f
measure-shipped-footprint`) and `shipped-footprint-cost.mjs` (`measure-footprint-cost`), both with
`DISPLAY=:0` on this box so headless chromium reaches the GPU; tests: `shipped-footprint-scene.test.ts`,
`src/true-footprint.test.ts`, `harness/true-footprint-routes.test.ts`. Sheets: `harness/crop-sheet.mjs
--smooth 1` / `harness/contact-sheet.mjs`.
