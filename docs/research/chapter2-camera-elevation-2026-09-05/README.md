# The camera's elevation — the shipped 45° against the signed 50°, and the squashed footprint (2026-09-05)

The increment: `camera-elevation-45-against-the-signed-50-and-the-squashed-footprint` on
`land-ground-stack-arc`. The owner, 2026-09-03, on the canopy sheets beside the render he stamped:
*"Also i wonder if your camera angle is too low, should be higher i think."* He asked for an
increment, not a change — so this is a ladder for his pick, and **nothing here is decided**. The
elevation is an owner look on a whole island at delivered size (ADR-0392 D1), and it lands as an
ADR when he picks.

> ⚠ Every figure here was taken on this run, on the arc's named box (ADR-0505 D3): **NVIDIA GeForce
> RTX 2060** (ANGLE / OpenGL 4.5), `--use-gl=angle`, `software=false`, exact-colour mode, lights
> calibrated by the map's own probe (a lit white face delivered 0.3176 at the authored intensities;
> scale 3.1481; ladder floor 0.80). Nothing is inherited from an increment row, an arc intent or an
> earlier sheet — the island's 234 × 46 and the recipe's 234 × 135 are both re-derived by the page's
> own test, and the shipped 45° is READ off `frameWorld` rather than typed. The whole shipped stack
> is on every arm: layers 1–4 and 6, the groves, the ground cover, the skirt.

## The finding first — he is reacting to the footprint, not to the five degrees

Two causes were in play before anyone measured:

1. **The shipped view is a 45° elevation; every render he approved was taken at the owner-signed
   50°** (`build_land.py`'s `RENDER_ELEV_DEG`, mirrored in `src/kit-vocabulary.ts`). Five degrees,
   in the direction he named.
2. **The shipped ground plane is the 2D map's already-foreshortened shape.** `worldTo3D` maps the
   drawing's (x, y) straight to (x, 0, z), and the drawing is projected at the declared land camera,
   20°, so the island the canvas draws is **233.8 × 46.2** ground units where the hex cluster the
   recipe renders is **233.8 × 135.1**. The 3D camera then foreshortens that squashed plane again.

The page renders both as one ladder — four elevations (45 / 50 / 55 / 60) on two ground planes
(the footprint that ships, and the island's true footprint) — over the same dressed island, and
reads one number that tells the two apart: the island's on-screen width-to-height ratio. Five
degrees moves it by `sin 50° / sin 45°`; the footprint moves it by `1 / sin 20°`.

**One island at 8 px/unit, groves and cover on** (`sheet-8px.png`):

| arm | ground plane | camera | island on screen | w/h | taller than today | pine height | land share of frame |
| --- | --- | --- | --- | --- | --- | --- | --- |
| **`map-45` — TODAY** | shipped (234 × 46) | 45° | 1980 × 377 px | 5.26 | — | 102 px | 14.3% |
| `map-50` | shipped | **50° (signed)** | 1980 × 405 px | 4.89 | **+7.5%** | 93 px | 15.3% |
| `map-55` | shipped | 55° | 1980 × 431 px | 4.60 | +14.3% | 83 px | 16.1% |
| `map-60` | shipped | 60° | 1980 × 453 px | 4.38 | +20.1% | 72 px | 16.8% |
| `true-45` | **true (234 × 135)** | 45° | 1984 × 864 px | 2.30 | **+129%** | 102 px | 33.2% |
| **`true-50` — the reference's geometry** | true | **50° (signed)** | 1984 × 933 px | 2.13 | **+148%** | 93 px | 35.8% |
| `true-55` | true | 55° | 1984 × 995 px | 1.99 | +164% | 83 px | 38.1% |
| `true-60` | true | 60° | 1984 × 1050 px | 1.89 | +179% | 72 px | 40.1% |
| the approved render | true, Cycles | 50° | 1936 × 1144 px box | 1.69 (box includes the trees) | | | |

- **The five degrees alone makes the island 7.5% taller on screen.** The whole ladder to 60° makes
  it 20% taller — and costs every pine 30% of its height (102 → 72 px), because an upright
  foreshortens by `cos` as the ground opens by `sin`. On the squashed plane the island stays a
  ribbon at every rung: w/h 5.26 → 4.38.
- **The footprint alone makes it 129% taller.** At the shipped 45°, on the true footprint, the
  island's w/h is 2.30 — already within a fifth of the approved render's, with the trees at their
  full 102 px. Adding the signed 50° on top brings it to 2.13 and +148%, which is the approved
  render's own geometry (`true-50`), and the pictures in `sheet-reference.png` say the same thing the
  numbers do: the top row of `sheet-8px.png` is four ribbons, the bottom row is four islands.
- So the evidence says **the double squash is what reads as "too low"**, by a factor of about
  seventeen over the five degrees. A higher camera on the squashed plane does what the increment
  predicted: it makes a thin ribbon thinner from above, not rounder.

The elevation is still his to pick — the footprint fix and the angle are independent axes, and
both rows of the sheet carry all four rungs so a pick on either axis is a rung already rendered.

## What the true footprint costs, named rather than inferred

Unsquashing the island is not free, and the numbers below are its price on THIS map, not a
verdict on whether to pay it:

| | shipped footprint | true footprint | factor |
| --- | --- | --- | --- |
| triangles drawn, one island (ground + props) | 172,500 | 608,676 | 3.5× |
| props standing, one island | 318 | 1,037 | 3.3× |
| props standing, the forest | 6,815 | 22,029 | 3.2× |
| triangles, the forest | 3,805,446 | 13,088,316 | 3.4× |
| land share of the fitted forest | 2.5% | 5.7% | 2.3× |

The dressing scatters by AREA (`dressMapWithCover`), so an island with 2.9× the ground grows about
3.3× the props — that is the shipped rule applied to a bigger island, not a change to the rule.
**Frame cost is deliberately not measured here**: the increment says the angle is not a layer, and
the footprint's cost would be measured by `land-cost-instrument-arc`'s instrument on a decided
footprint, not guessed from a triangle ratio. What CAN be said is that the forest at the true
footprint draws 3.4× the triangles of today's, and that the cover landing measured today's forest
at 1.16 ms/frame on this box.

**The forest's layout holds still on the true-footprint arms** — each island is unsquashed in
place about its own centre (`sheet-forest-fit.png`), so the islands more than double their share
of the opening view (2.5% → 5.7%) without moving. The first version of the arm stretched the whole
map about the origin instead, which also unprojects the SPACING: the 35-island crowd became 10,235
units deep and the shipped shore-field grid refused the extent outright (478,401 buckets against
its 262,144 cap). That is a true fact about what re-laying the real map out would cost the
machinery, recorded in `shipped-camera-scene.ts`'s `unprojectDescriptors`; it is not this page's
question.

**A higher camera costs the opening view too.** At the fitted forest the land share falls with
every rung on both footprints (2.5% → 2.0% shipped; 5.7% → 4.6% true), because the layout is
deeper than it is wide and a higher camera opens the ground vertically. `sheet-forest-fit.png`
carries all eight.

## What separates the two causes, in one line each (`report.txt`)

```
today (map-45):                         w/h 5.26  — island 1980×377 px
the five degrees alone (map-50):        w/h 4.89  — 7.5% taller on screen
the whole ladder on the map (map-60):   w/h 4.38  — 20.1% taller on screen, pine 72 px against 102
the footprint alone (true-45):          w/h 2.30  — 129.4% taller on screen
both, the reference geometry (true-50): w/h 2.13  — 147.7% taller on screen
the approved render:                    w/h 1.69  (its box includes the trees)
```

## How the page keeps itself honest

- **Every arm is the shipped composition root.** `shippedGroundBuild` (the function `CellGround`
  calls) over each footprint's cells, casters and strips; `dressMapWithCover` with the same options
  object the canvas passes; `buildGroundMaterial` with the shipped constants. The control is
  today's map because there is one construction of it, not because a checklist was kept true
  (`comparison-baseline-moves-under-the-page`).
- **The control's camera is measured against the crowd page's shipped camera** and the driver
  refuses a run where the two directions differ. The shipped 45° is read off `frameWorld`; a `45`
  typed on the page would have stayed 45 after the canvas moved.
- **Within a footprint the four rungs share one ground build and one placement list** — the
  driver refuses on any of five counts differing — so a difference between rungs is the camera's.
- **The true footprint is the same island, reached two independent ways** that the test holds
  equal to the drawing's own 0.1-unit path rounding (worst vertex 0.18 units on 164 matched cells):
  the fixture island built at plan view through the scene's own `cameraElevationDeg` seam (a new
  option on `IslandOptions`, threaded to every consumer that takes one), and the shipped descriptor
  stream with every ground z stretched by `1 / sin 20°` about its island's centre. The driver
  checks the stretch exactly on the centre island of every frame.
- **Pixels moved >20/255 are reported (ADR-0490 D6) and say only how different the picture is.**
  The five degrees moves 181,401 pixels on one island; the footprint moves 1,132,204. A camera is
  not a layer, and the number carries no verdict here.

## What did NOT move

Nothing in `src/`. `camera-framing.ts` still frames at 45°, the crowd camera still reads it, and
the canvas is byte-identical to yesterday's. When the owner picks, `camera-framing.ts` and the crowd
camera move together in one landing, with every consumer of the elevation re-derived rather than
inherited (`deliveredHeightPx`, the crowd layout's `ELEV_RAD`, the object floor the prop sizes were
chosen against, every committed picture on this arc). ADR-0380 D6 fence 4 stands: the canvas is
orthographic and the viewer cannot rotate it; a fixed authored elevation is not a rotation control.

## Files

32 frames `<footprint>-<elev>-<one|forest>-<8|fit>.png` (2560×1600) · `sheet-8px.png` (the ladder,
one island, cropped to the island) · `sheet-reference.png` (the approved render beside `true-50` and
today) · `sheet-forest-fit.png` (the opening view, eight arms) · `measurements.json` · `reference.json`
· `report.txt`.

Page: `packages/forest-world-r3f/harness/shipped-camera.html` / `shipped-camera-scene.ts`; driver:
`shipped-camera-measure.mjs` (`pnpm --filter @storytree/forest-world-r3f measure-shipped-camera`,
with `DISPLAY=:0` in the environment on this box so headless chromium reaches the GPU); tests:
`shipped-camera-scene.test.ts`. Sheets: `harness/crop-sheet.mjs --smooth 1` / `harness/contact-sheet.mjs`.
