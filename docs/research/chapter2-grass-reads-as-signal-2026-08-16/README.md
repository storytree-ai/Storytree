# Does the grass read as SIGNAL? — the vegetation vocabulary, measured at delivered scale

> **⚠ RE-RENDERED 2026-08-17 ON THE FIXED COMPOSITOR.** Two defects in this directory's own
> `compose_core.py` were fixed on 2026-08-17 — the decor painter order (a placement in the back half
> of its own cell was overpainted by that cell) and `compose_land`'s `caps` argument not reaching the
> walls. Both change numbers on this page, so all six pictures and `grass-report.json` were
> re-rendered here and `verify.py` / `verify_refusal.py` re-run (**19/19**, **7/7**). Every delivered
> vegetation count is now roughly 1.7–1.8× what it was, and the health read moved from 60.2% to
> **78.6%**. No verdict on this page flips. The two sections that carry the moved numbers — the
> test-count ladder (b) and the health read (c) — are corrected in place with the pre-fix figures
> kept alongside. Full write-up: `../chapter2-compositor-order-and-caps-2026-08-17/`.

**Date:** 2026-08-16 · **Blender:** 5.2.0 LTS, headless, CPU Cycles, adaptive sampling OFF, seed
20260816 · **Camera:** 50° (a named parameter, not a literal) · **Land:** the interior fork's settled
`b++`, ONE land for every panel · **Cost:** $0 · **Vendor calls:** 0

The owner looked at the island-place-dressing pass and said the grass **"looks rather ugly"**, then
proposed doing *"something basic (maybe even just a flat green) and then use the ^ for grass that
represents test density or other signals"*, offering an anime-grass Blender tutorial as a technique
reference.

**Nothing here is owner-attested.** Whether the grass stops reading as ugly is the owner's look and
this page has no standing to make it (ADR-0070 stage 2). What it can do is say, in pixels, which
levers are capable of changing anything at all — and one of the two prime candidates turns out not
to be.

## The thing that reframes the brief: grass-as-signal is already DECIDED

The second half of the owner's proposal re-derives a decision the owner already made.
**ADR-0226 (accepted 2026-07-21, owner-directed)** fixed the vegetation language:

| the art | what it MEANS | ADR-0226 |
|---|---|---|
| grass | a capability's **tests**, `grassCount = 2 + tests·1.9` | D2 |
| dead grass | that capability's **proof state** — status-driven, explicitly NOT per-test | D3 |
| a flower | the story's **UAT**, one per criterion exactly 1:1, verdict read from **FORM** | D4 |

Getting there **retired** the decorative wildflower so a flower means UAT and only UAT. So this pass
adds no member to the vocabulary, proposes no new mapping, and restores no decorative species.
**What is genuinely open is the LOOK, plus the BASE treatment, which is new.**

## The headline, in one line

**The grass is seven pixels.**

A `tuft-3a` — the ordinary three-blade tuft — is **61 opaque pixels in the Blender render** and
**7 pixels after the closed-palette snap and the majority downsample**. That one number decides
which of the offered techniques can possibly help, and it is why the answer to the prime suspect is
*no*.

## THE FENCE — what this pass did not touch

**`LAND_CAMERA_ELEVATION_DEG` in `packages/forest-world/src/camera.ts` is still 20 and was not
touched.** The app-side constant is the live dogfood fixture for `frontend-visual-judgment-arc`
(owner, 2026-08-15 — *"i dont want this fixed by any session"*). **The broken map on `main` is a
deliberate fixture and this pass did not fix it.**

The whole diff is `docs/research/chapter2-grass-reads-as-signal-2026-08-16/**`. Asserted
mechanically, not promised: `verify.py` check 9 runs `git diff` + `git ls-files --others` and fails
if anything outside `docs/research/` moved, and separately re-reads `camera.ts` to confirm the
constant is still 20.

**The angle is a NAMED PARAMETER.** It enters once (`grass.PASS_ELEVATION_DEG`) and flows outward
through `island.json`; no file downstream declares an angle of its own, and each asserts the angle it
was handed matches what its inputs were rendered at. `python render_all.py --elev 45` rebuilds the
entire pass at another angle with no source edit.

## The pictures

| file | what it is |
|---|---|
| **`grass-normals-sweep.png`** | **THE HEADLINE.** One tuft at seven normal mixes. TOP row = the Blender render; BOTTOM row = what ships. The top row changes dramatically; the bottom row does not change at all. *(The top row is red/green/blue because the render emits BAND KEYS, never colour — the token is looked up per placement at paint time, which is how the status stays out of the renderer under ADR-0367 D5. Watch which key each pixel takes, not the hue.)* |
| **`grass-geometry-fork.png`** | blade vs clump, raw and delivered. 7 px against 18 px. |
| **`grass-on-island.png`** | today / normals at full / clump — three islands at 1:1, one land, one code state. |
| **`grass-detail-6x.png`** | **JUDGE THE ART HERE.** The same crop of the same island at 6×. |
| **`base-treatment-fork.png`** | flat / mottle / carpet at 6×, with what each costs the signal. |
| **`signal-legibility.png`** | **THE VETO.** The test-density ladder and the health read, at delivered scale. |

## 1. Custom normals were NOT the cause — measured, and refused with numbers

`grass-normals-sweep.png`

The hypothesis was strong and the arc's own record made it. Triage item 1 shipped for the hero tree at
v7 / PR #1108, and the defect it fixed reads as a description of this tuft with one word swapped —
*"our crown is a pile of ~20 closed ellipsoids, so EVERY lobe presents every facing angle and carries
its own full light-to-dark ramp."* `build_tuft` emits N independent twisting ribbons, each its own
object, each sweeping N·L across a three-band ramp. The grass never got the treatment the crown did.

So it was built: the same mechanism, one scale down. A **shared analytic dome** fitted to the blade
set the tuft itself emitted, centred at its ground contact, blended into every blade's normals across
**all** the tuft's objects — sharing being the whole point, since normals that stop at one blade's
boundary cannot make a clump shade as one mass. No sculpted proxy (ADR-0280 D1), no Data-Transfer
mapping heuristic. **`--normals 0.0` is pixel-identical to the vendored pass across all 11 pieces**,
so the fork moves exactly one variable.

| mix | raw px repainted vs 0.00 | delivered px | delivered colours | lit px | lit caps | island decor px |
|---:|---:|---:|---:|---:|---:|---:|
| 0.00 | 0.0% | 7 | 2 | 3 | 1 | 301 |
| 0.15 | 55.7% | 7 | 2 | 5 | 1 | 305 |
| 0.30 | 78.7% | 7 | 2 | 4 | 1 | 307 |
| 0.45 | 85.2% | 7 | 2 | 3 | 1 | 303 |
| 0.60 | 85.2% | 7 | 3 | 3 | 1 | 305 |
| 0.80 | 86.9% | 7 | 2 | 3 | 1 | 301 |
| 1.00 | 90.2% | 7 | 2 | 4 | 1 | 297 |

**Read the second column against the third.** The lever is wired and working: at mix 1.00 it repaints
**90% of the tuft's raw pixels**. The delivered tuft is **7 pixels at every mix**, 2 colours at almost
every mix, and its lit band is **one connected cap at 100% from 0.00 to 1.00**.

**THERE IS NO OPTIMUM FOR GRASS.** Not 0.22, and not any other number: the pick rule
(*maximise the largest connected lit cap subject to ≥ 2 delivered colours*) returns 0.00 for both
geometries **because every row is already a single lit cap at 100%**. That is the rule reporting its
instrument is DEGENERATE at this scale, not the rule preferring the baseline.

**The reason is scale, and the comparison to the crown is exact.** The crown carried ~4200 delivered
pixels and its highlight fragmented into 11–13 connected caps — a shading structure large enough to
have a shape, and therefore large enough to unify; that is what 0.22 was picked against. A tuft's lit
band is already one cap before anything is applied. **There is no fragmentation for the technique to
remove**, and the majority downsample destroys the entire effect on its way to the delivered raster.

**Re-measuring rather than inheriting was the right call, for a reason the sweep only makes visible
in hindsight:** the number does not transfer because *no* number transfers. Had this pass adopted
0.22 by analogy it would have shipped a ~90%-raw-repaint treatment, paid its render cost forever, and
been unable to say that it bought nothing.

**This is not a claim that the grass looks fine.** It is a claim that **custom normals are not what is
wrong with it** — backed by the only measurement that matters, the delivered pixel.

**A guard, not an assumption:** `verify.py` check 2 makes the lever FIRE (90% / 66% of raw pixels
repainted at mix 1.00 for blade / clump). A lever only ever observed doing nothing is
indistinguishable from one that was never connected, and that is the difference between this pass's
finding and a bug wearing its clothes.

## 2. The geometry fork is the one that moves the picture

`grass-geometry-fork.png` · `grass-on-island.png` · `grass-detail-6x.png`

The arc's one transferable strategic takeaway is *"rely ~80% on the terrain treatment, sparse clump
meshes rather than individual blades"*. The second half was made geometry: `--geometry clump` welds
the same N ribbons — same angles, heights, widths, twist, deterministic addresses — into **one mesh
standing on a low base mound** sized from the blades' own spread and height. The mound carries **no
new token**: same three-band blade material, so a clump is still one token family.

| at mix 0.00 | raw opaque px | delivered px | island decor px | share of delivered land |
|---|---:|---:|---:|---:|
| **blade** (today) | 61 | **7** | 301 | 0.86% |
| **clump** | 128 | **18** | 522 | 1.49% |

**2.6× the delivered pixels, and it comes from silhouette rather than from shading.** The weld and
the mound are body, and body is the only thing that survives a majority downsample at this size. That
is the takeaway arriving as a measurement instead of as advice — and it is the direct complement of
finding 1: at seven pixels you cannot shade your way out, you can only occupy more of them.

**Two costs to weigh, and neither is this pass's to settle:**

- A clump is a bigger object, and the 2026-07-23 owner verdict on baked sprite art was that it read
  **"way too big"**. Bigger delivered pixels is exactly what that verdict refused.
- **At 18 delivered pixels the clump reads as a MOUND, not as grass** — look at
  `grass-geometry-fork.png`'s bottom-right panel. Rocks and boulders were rejected **twice** as
  *"noisy/colliding"* (#832) and *"messy and noisy rather than cosy"* (owner, 2026-07-20). A grass
  clump that reads as a stone would collect that verdict by accident.

**And a scope point that outranks both:** the base mound is a shape the app's own `meadowSurface` does
not draw. `--geometry blade` is a faithful 3D render of the app's existing vector body; **`--geometry
clump` is a proposal to change what the art IS**, which is a story-author / ADR question and not an
art one.

## 3. The base treatment — and the one option that has to be refused with a number

`base-treatment-fork.png`

The owner's *"maybe even just a flat green"* is taken seriously rather than as a throwaway, and our
constraint makes the 80%-terrain takeaway **stronger** than it is for the game it comes from — in the
opposite direction to its obvious reading. Delivered land is quantised at small pixel scale, so
detail below the quantisation threshold does not become subtle, **it becomes noise**. That argues for
the terrain carrying the look. It argues *against* the terrain carrying it as GRASS.

| base | ground-treatment px | share of land | signal px | signal as % of non-flat-ground px |
|---|---:|---:|---:|---:|
| **`flat`** — the owner's proposal, the ground exactly as delivered | 0 | 0% | 519 | **100%** |
| **`mottle`** — a deterministic two-shade split per cell | 9 266 | 26.5% | 516 | 5.3% |
| **`carpet`** — grass used AS the ground treatment | 1 681 | 4.81% | 439 | **20.7%** |

*(Re-measured 2026-08-17 on the fixed compositor; before it, 301 / 298 / 275 signal px and
`carpet` at 897 px / 2.6%. Both `carpet` columns roughly doubled because carpet tufts were being
overpainted by their own cells too. Every conclusion below is unchanged.)*

**`flat` costs nothing and is the only option under which every non-ground pixel means something.**

**`mottle` buys a lot of ground for free, and claims nothing.** It moves 26.5% of the island using
`(token × shade)` pairs the closed palette **already holds** (`C.SEAM_LEVEL`, which the land's own
seams emit) — `verify.py` check 6 asserts it widens the palette by nothing. Its 5.3% signal fraction
is **not** the same kind of cost as `carpet`'s: those 9 266 pixels are the capability's own status
colour at a second shade, so they compete for ATTENTION but never for MEANING. Whether that reads as
"ground with life in it" or "a busy mess" is a look.

**`carpet` is the option to refuse, and here is the number that refuses it.** 897 px of grass that
tracks no test count against 275 px that does: **roughly 3 in every 4 grass-shaped pixels on the
island would be asserting tests that do not exist.** Under ADR-0226 grass MEANS a capability's tests,
so that is art asserting something the meaning layer does not authorise — the ADR-0367 D5 failure,
one level up from the palette bug the interior fork caught. It also **eats 9% of the real signal**
(301 → 275 delivered px): the honest tufts stop being distinguishable against the dishonest ones.
It was rendered at its most *favourable* — status-tinted, so not a straw man — and it still loses.

## 4. Does the signal still read? — the measurement that outranks the look

`signal-legibility.png`

**A prettier grass that no longer distinguishes 3 tests from 30 has broken the instrument rather than
improved the art.** ADR-0226 D2 puts the test count in the grass's COUNT and D3 puts the proof state
in its HEALTH; ADR-0367 D5 and the `meaning-outranks-appearance` principle both put the signal above
the appearance.

### (a) The density read is SAFE UNDER NORMALS BY CONSTRUCTION — the cheapest good news in the pass

`verify.py` check 4, the check that carries the thesis: **the tuft occupies the same pixels at every
mix from 0.00 to 1.00** — supersampled and delivered, identical at all seven mixes, for both
geometries. Normals decide which BAND a pixel takes and never whether a pixel is grass. Same property
the arc measured on the hero tree, where bark held flat at 629–631 px across the entire crown fork.

So **however much of this treatment is applied, the density signal cannot be spent by it.** The
island column moves within a 3.4% band (297–307 px) for a different, stated reason: a band change can
make a tuft pixel snap to the same palette entry as the ground beneath it, so the pixel stops being
*visible* without ever stopping being *grass*.

### (b) The test-count ladder — strictly monotonic, both geometries

Every capability driven to one test count in turn; same island, same piece set, same code state.

| tests | 0 | 1 | 2 | 3 | 5 | 8 | 13 | 21 | 30 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| placements | 21 | 37 | 61 | 81 | 121 | 173 | 276 | 434 | 613 |
| **blade** delivered px | 210 | 255 | 366 | **418** | 560 | 731 | 1073 | 1476 | **1809** |
| **clump** delivered px | 284 | 404 | 585 | **693** | 973 | 1425 | 2115 | 2838 | **3275** |

**Strictly monotonic across all nine counts, for both geometries.** 3 tests → 30 tests is
**4.33× (1.20% → 5.17% of land)** for blade and **9.37%** of land for clump. The density signal
survives everything this pass did to the look.

*(Re-measured 2026-08-17 on the fixed compositor. Before the painter-order fix the same ladder read
161 / 189 / 219 / **241** / 327 / 417 / 622 / 852 / **1035** for blade and 197 … **1804** for clump,
i.e. 4.29× and 0.69% → 2.96%. The ratio barely moved — which is the point: the loss was roughly
proportional, so the MONOTONICITY finding never depended on the defect. The absolute shares did move,
and it is the shares the vocabulary question is argued from.)*

### (c) The health read (D3)

Blade tokens stay **61.7 apart in RGB after the closed-palette snap** and do **not** collapse to the
same entry (`healthy` → `(113,161,84)`, `unhealthy` → `(171,140,84)`). Driving the whole island to
each status changes **27 475 delivered px = 78.6%** of it.

⚠ **This figure was 21 066 px = 60.2% and it was an UNDER-count**, for a reason found by PR #1381
and fixed on 2026-08-17: the read drives the island through `compose_land(caps=…)`, and that argument
used to recolour the CELLS while the walls kept reading the module global. So the "before" and
"after" islands shared their walls and the diff could never include them. With `caps` authoritative
the read moved by **6 409 px / 18.4 percentage points**. See
`../chapter2-compositor-order-and-caps-2026-08-17/`.

**But read the 78.6% precisely, because it flatters the grass.** It is carried mostly by the GROUND
tint and now by the WALLS, not by the vegetation — which is the base fork's finding arriving from the
other direction: at 1–5% ground cover the grass cannot be the thing that changes an island's colour.

### (d) The weak spot, stated plainly: two capabilities SIDE BY SIDE on one island

3 of the island's 10, each costing a full composite:

| capability | status | tests | cells | placements | delivered px | **px per cell** |
|---|---|---:|---:|---:|---:|---:|
| cap 2 | building | 2 | 18 | 6 | 31 | **1.72** |
| cap 8 | building | 8 | 36 | 20 | 89 | **2.47** |
| cap 6 | unhealthy | 2 | 37 | 7 | 12 | **0.32** |

*(Re-measured 2026-08-17 on the fixed compositor. Before it: 14 px / **0.78**, 40 px / **1.11**,
3 px / **0.08**.)*

**This is the honest limit of the whole vocabulary at delivered scale, and it is not something any
treatment in this pass fixes — the painter-order fix moved the quantities and left the SHAPE of the
limit exactly where it was.** The ladder's 4.3× is a comparison between whole islands. The read a
viewer actually makes — *is that parcel busier than the one next to it?* — is **1.72 vs 2.47 px per
cell, a 1.4× difference on a couple of pixels per cell.** Four times the tests still buys about forty
percent more grass per unit of ground.

**And an unhealthy capability's ground cover is still very nearly nothing: 7 placements deliver 12
pixels across 37 cells.** That is D3's wilt swap working as designed in one sense (a dying parcel
reads as *thinning*, not merely recoloured) and a warning in another — at delivered scale the
unhealthy read is carried almost entirely by the ground tint, with the vegetation contributing
nearly nothing.

## Proof — the machine-checkable half (`verify.py`, 19/19 green)

The look is an owner attestation. These are the claims a session may assert for itself.

```text
== 1. determinism ==       the placement pass is identical when re-run (112 placements)
                           every piece re-renders raster-identical UNDER CONCURRENT LOAD
== 2. both levers WIRED == --normals repaints the raw blade tuft 90% / clump 66% (0.00 -> 1.00)
                           --geometry clump is a DIFFERENT tuft (61 vs 128 raw opaque px)
== 3. provenance ==        all 14 grass directories declare ONE generator state
                           every mix present exactly once per geometry
== 4. THE THESIS ==        (blade) the tuft occupies the SAME pixels at every mix 0.00..1.00
                           (clump) same — normals pick a BAND, never whether a pixel is grass
== 5. ADR-0367 D5 ==       no rendered piece contains ANY island token colour (154 renders)
                           all six statuses render from ONE grass piece set
== 6. palette closure ==   every (decor token x authored shade) pair is IN the closed palette
                           the `mottle` base widens the palette by NOTHING
== 7. the land ==          compose_core's land pass is byte-identical to the shipped compose.py
== 8. the vocabulary ==    exactly one flower per UAT criterion (ADR-0226 D4)
                           no decorative species was added back; no decor in the water
== 9. the fence ==         changes confined to docs/research/**
                           LAND_CAMERA_ELEVATION_DEG is still 20
```

**Determinism is asserted on the DECODED RASTER, never the file.** Blender stamps its own PNG
container, so all files differ byte-for-byte on every re-render while the images are identical — a
naive file hash reports a non-determinism that does not exist. And the re-render runs **under three
concurrent CPU loads on purpose**: Cycles adaptive sampling makes a render a function of system load,
so a determinism check on an idle box is the one that proves nothing.

## Every guard made to FIRE (`verify_refusal.py`)

A guard only ever observed passing is indistinguishable from one that cannot fail. With fourteen
directories differing by two characters in the name, a fork picture composed from the wrong one is
always one typo away and would look completely plausible.

```text
PASS  mounting a mix-1.00 directory AS mix 0.00 is REFUSED
PASS  mounting a CLUMP directory AS blade is REFUSED
PASS  and the CORRECT mount still succeeds
PASS  two directories from ONE generator at TWO code states are REFUSED
PASS  two DIFFERENT generators at their own states compose fine
PASS  assert_land_unchanged CATCHES a one-pixel drift in the land pass
PASS  and the land pass is clean again once the perturbation is removed
```

The land-drift test perturbs **only the copy**, never the shipped side. The vendored pass recorded
getting this wrong: patching `C.fill_polygon` outright moved both canvases together, so they still
matched and the guard "passed" a compositor drawing the wrong thing.

## Reproduce

```text
python render_all.py                 # land + all 14 grass configurations + compose
python render_all.py --skip-land     # grass + compose only
python render_all.py --skip-render   # compose only, against the piece sets on disk
python render_all.py --elev 45       # the whole pass at another angle, no source edit

python verify.py                     # 19 checks; --fast skips the Blender re-render
python verify_refusal.py             # make every guard fire
```

`blender_grass.py` runs under Blender's bundled Python; the composers need system Python with numpy +
Pillow. **`bpy` from PyPI is not a route on this machine.** The 14-configuration grass sweep is 154
images in about a minute; the ~50 island composites are what cost the wall clock.

## What the code owns (ADR-0280 D1 / ADR-0367 D2–D3, unchanged)

- **The script is the source of truth.** No `.blend`, no sculpted mesh, no imported asset, no vendor
  call. `island.json` is generated by a committed script and never hand-edited.
- **The geometry and the land renderer are the sibling spike's, INVOKED not copied** —
  `emit_island.ts` imports the shipped `buildRelaxedCells` / `smoothCoast`.
- **The camera is read, never restated**, and every consumer asserts the angle it was handed.
- **The light is the hero tree's own key direction, reused verbatim.**
- **Randomness is identity-keyed** — never a draw counter, never Python's salted `hash()`.
- **The render delivers PIECES, never a baked island.** Nothing runtime is introduced.

## Honest gaps

1. **There is no owner LOOK.** Nothing here is attested, and no treatment is chosen.
2. **`--geometry clump` changes what the art IS**, not just how it is rendered: the base mound is a
   shape the app's `meadowSurface` does not draw. Adopting it is a story-author / ADR question. Only
   `--geometry blade` is a faithful render of the app's existing vector body.
3. **At 18 delivered px the clump may read as a stone**, and stones were rejected twice. This page
   states that risk; it cannot settle it.
4. **The normals finding is about OUR back half.** It says the treatment does not survive quantise +
   majority downsample at `SS=3`. A different downsample rule could preserve more of it — that is a
   back-half question, not a grass one, and it was not explored.
5. **`mottle` is composer-side, not a Blender render.** To ship, the app's own land layer would have
   to be able to express it; this pass does not check that it can.
6. **`carpet` reuses the tuft pieces rather than a purpose-built ground-cover mesh.** The measurement
   BOUNDS the option rather than optimising it — a denser purpose-built mat would change the pixel
   counts but not the semantic objection, which is the load-bearing half.
7. **The test counts and the UAT criteria are INVENTED.** `island.json` carries geometry and status,
   not proof state. The distribution exercises every branch of the app's count rules rather than
   flattering them, but real tests would redistribute the meadow.
8. **The per-capability read (d) is 3 of 10 capabilities**, because each row costs a full composite.
   It is a probe, not a census.
9. **One island, one seed, one camera, one zoom level.** 17 hexes, 10 capabilities, 214 cells,
   34 968 delivered land px. The pixel shares are this island's; the direction of every finding is
   structural. The app may render the map at more than one scale and that was not measured.
10. **Scale against the app's wrapper transforms is not reconciled** (inherited, unclosed, from the
    vendored pass) — nothing here verifies the delivered ground size matches the vector body it would
    replace, which is precisely what the 2026-07-23 "way too big" verdict is about.
11. **No cast shadows.** Decor casts nothing onto the land and the land casts nothing onto decor.
12. **The prior pass was VENDORED, not imported.** `compose_core.py`, `scatter.py` and the
    non-grass half of `blender_grass.py` are copies of the island-place-dressing pass's files,
    because that pass was staged and never committed and there is no committed sibling to import.
    If it later lands, the two copies can drift and nothing detects it.
