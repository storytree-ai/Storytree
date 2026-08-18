# The 46% is a PAINTER-ORDER BUG — the grass was painted, and then its own cell painted over it

> **⚠ RE-COMPOSED 2026-08-18 — its one picture moved.** The plant positioner's CRC32 affine collapse was
> propagated into `scatter.py` itself by the increment
> `crc32-dispersion-fix-propagated-and-evidence-rerendered`, so every placement on this pass's
> pictures moved.  **Nothing was re-RENDERED** — no piece PNG is touched; the fix changes
> where a piece is stamped, never what it looks like. The full delta table, and what did NOT move,
> is in `../chapter2-plant-dispersion-2026-08-17/README.md`. Numbers in the prose below were
> measured on the PRE-FIX placements unless they say otherwise.


> **⚠ THE FIX HAS LANDED (2026-08-17), so read the columns in this file by their labels and not by
> their position.** `compose_core.py` now sorts a placement on `max(own ground y, its cell's centroid
> y)`, so every "before" number below is the DEFECT DELIBERATELY REINSTATED for the duration of one
> composite (`delivery.centroid_key`, over the compositor's own `DECOR_SORTS_AFTER_ITS_CELL` switch)
> and every "repaired" number is what the compositor now produces. `delivery-report.json` and
> `where-the-46-percent-went.png` were re-rendered on that basis and every number in this file still
> reproduces. The two sections that were written as *unmade* — "Where the fix goes" and its guard —
> are corrected in place below. Full write-up, the real-corpus island's own rate, and the `caps`
> defect that landed with it: `../chapter2-compositor-order-and-caps-2026-08-17/`.

**Date:** 2026-08-17 · **Camera:** 50° (the research track's named parameter) · **Delivered raster:**
258 × 353 px for the whole island, supersample 3 · **Piece set:** `pieces-m00-blade` — the declined
grass exactly · **Cost:** $0 · **Vendor calls:** 0 · **Blender renders:** 0 (this pass renders
nothing; it re-composes the committed pieces and measures the result)

PR #1381 found that of **112 placements, 51 (46%) deliver ZERO pixels**, and routed it without
diagnosing it — correctly, because a zero is not a diagnosis. The increment asks one question first:
are those placements **CULLED** (a keep-out test drops them before rendering) or **QUANTISED AWAY**
(they render, then die in the palette snap and the majority downsample)?

**Neither.** The dominant mechanism is a third one that the binary fork does not name.

## The answer, in one table

| | fixture island | all-`healthy` island |
|---|---:|---:|
| placements the count rules author | 115 | 148 |
| **CULLED** before the compositor (the 11-unit grass well) | **3 (2.6%)** | **3 (2.0%)** |
| placements handed to the compositor | 112 | 145 |
| delivering at least one pixel | 61 | 78 |
| delivering nothing | 51 (45.5%) | 67 (46.2%) |
| — of those, **OCCLUDED**: painted, then overpainted before the downsample ever ran | **36 (71%)** | **45 (67%)** |
| — of those, **OUT-VOTED**: survived to the snapped canvas, lost the 3×3 majority | 13 (25%) | 20 (30%) |
| — of those, **CO-CREDITED**: delivered pixels the instrument credits to a same-colour neighbour | 2 (4%) | 2 (3%) |

**Roughly seven of every ten lost placements were painted onto the canvas and then erased by another
drawable.** That is not the raster's floor and it is not the placer giving up. It is a defect in the
draw order, and it has a one-line fix.

## What overpaints them — and the prediction that carries the diagnosis

Of the 36 occluded placements on the fixture island, **31 (86%) have their footprint owned by the
fill of the very cell they stand on** (41 of 45, 91%, on the healthy island). The rest are a
neighbouring cell (1), a wall (1) and another placement (3) — all of which are *correct* occlusion.

The mechanism is exact. `compose_core.compose_land` paints from one list sorted on `(y, class)`:

```text
compose_core.py:319-326      wall placements   class 0    y = the wall's own ground y
                             boundary walls    class 1    y = the wall midpoint's ground y
                             cells             class 2    y = the cell's CENTROID
                             decor             class 3    y = the placement's OWN ground point
                             draw.sort(key=lambda t: (t[0], t[1]))
```

A cell's depth key is its **centroid**; a placement's is **its own point**. So a placement scattered
anywhere in the **back half of its own cell polygon** sorts *before* that cell — and `fill_polygon`
is a hard write (`sub_c[bm] = rgb`, never a blend), so the cell fill erases it completely.

That is a prediction with a **sign**, not a story, and it is the reason this diagnosis is not another
of the arc's confidently-wrong site attributions: it says the loss must split almost exactly on
`placement.groundY < cell.centroidY`, and on nothing else.

| | placements | deliver nothing | occluded |
|---|---:|---:|---:|
| **above** the centroid — painted BEFORE its own cell | 60 | **47 (78.3%)** | 34 (56.7%) |
| **below** the centroid — painted AFTER its own cell | 52 | **2 (3.8%)** | 2 (3.8%) |

(all-`healthy`: 74 above → 60 (81.1%); 71 below → 5 (7.0%))

**A twentyfold difference across one comparison that contains no pixel quantity at all.** The loss is
otherwise flat: the true-zero rate by quartile of screen y is 45.9 / 41.7 / 44.4 / 47.2 %, i.e. no
dependence on distance from the camera; by quartile of piece footprint it is 48.6 / 46.3 / 42.9 /
38.5 %, a weak size effect and nothing more. It is not concentrated on a status, a heading, a cell or
a corner of the island. It is concentrated on **one half of every cell**.

### Where the defect came from

The interior fork's `compose.py:355-368` documents that sort as a land design — *"a cell in front is
drawn later and its top face covers the wall of the cell behind it"* — and it has **no decor class**.
Class 3 was grafted on when the grass pass added a drawable that STANDS ON a cell rather than being
one, and a standing thing needs a key relative to its surface, not to the island. The comment is
still true of the land; it was never true of the decor.

## The repair, and what it recovers

`delivery.repair_depth_keys` gives every placement the key `max(its own ground y, its cell's
centroid y)` — never earlier than the surface it stands on, otherwise unchanged.

| | fixture | fixture **repaired** | healthy | healthy **repaired** |
|---|---:|---:|---:|---:|
| **placements delivering NOTHING** | **51 (45.5%)** | **8 (7.1%)** | **67 (46.2%)** | **12 (8.3%)** |
| …excluding the co-credited instrument artefact | 49 (43.8%) | 7 (6.2%) | 65 (44.8%) | 11 (7.6%) |
| occluded | 36 | 6 | 45 | 5 |
| out-voted (the quantisation floor) | 13 | 1 | 20 | 6 |
| median % of a footprint overpainted | 64.7% | **0.0%** | 65.4% | **0.0%** |
| delivered vegetation px | 292 | **510 (+75%)** | 384 | **676 (+76%)** |
| delivered island px (total) | 34 968 | 34 968 | 34 968 | 34 968 |
| tufts delivering nothing | 43 / 95 (45.3%) | **7 / 95 (7.4%)** | 55 / 119 (46.2%) | **11 / 119 (9.2%)** |
| shrubs delivering nothing | 5 / 10 (50%) | **0** | 10 / 20 (50%) | **0** |
| flowers delivering nothing | 0 / 6 | 0 / 6 | 0 / 6 | 0 / 6 |

`where-the-46-percent-went.png` is that table as a picture: the same crop at 6×, as shipped and
repaired, each with the measured attribution painted over it.

**Nothing was re-rendered, re-scaled, re-coloured or moved.** The repair is applied as DATA rather
than as a second compositor: the projection is `(gx + Ox, gy·SIN + Oy − h·COS)`, so moving a
placement down-field by *d* while raising its world height by *d·SIN/COS* lands it on the identical
canvas pixel and sorts it *d* later. `assert_projection_unchanged` holds every placement to the same
**integer supersampled blit origin** — so every recovered pixel is a pixel that was already being
painted, one drawable before the cell that erased it. That is also why the delivered island total is
byte-stable at 34 968 px across all four runs: the repair does not add pixels to the island, it
decides which drawable keeps the ones already there.

### Why the flowers never lost one

A flower delivers a median of 23–24 px against a tuft's 3, because it is TALL: its upper half
projects above its own cell polygon and so lies outside the region the cell fill can reach. Only the
part of a placement that is inside its own cell is at risk — which is all of a tuft and none of a
flower's crown. Height, not size, is what protected them.

## The residue after the repair — and this part IS the raster's floor

6–8% of placements still deliver nothing, and that residue is the honest answer to the increment's
original fork:

- **1–6 are OUT-VOTED.** The median placement paints 34 supersampled pixels — 3.8 delivered pixels'
  worth — and `mode_down` awards a delivered pixel to the **plurality colour of a 3×3 block**, so a
  placement needs 5 of 9 subpixels in some single block to be seen at all. After the repair the
  histogram of *most subpixels owned in any one block* is bimodal and healthy (69 of 112 own a full
  9/9), but a few placements are spread thinly across four blocks and win none.
- **5–6 are still OCCLUDED**, and correctly so: by a neighbouring cell in front, a wall, or another
  placement.

**The median surviving placement still delivers THREE pixels, before and after.** The repair changes
*how many* placements are in the picture; it changes nothing about *how big* one is. The arc's
"a tuft is seven pixels / a placement delivers three" finding is untouched.

## The scale this number belongs to — and the app's is not it

Everything above is one delivered raster: **258 × 353 px for the whole island**, supersample 3
(774 × 1059 before the downsample), **1 ground unit = 1 delivered pixel**, camera **50°**.

**The dominant term is scale-invariant.** The predicate that decides it —
`placement.groundY < cell.centroidY` — is a ground-space comparison containing no pixel quantity.
Render the same island at any zoom and the same 51–54% of placements still sort before their own
cell and are still hard-written over; only *how many pixels each one loses* changes. The 46% is
therefore **not** an artefact of having measured at one scale, which is what the increment
(reasonably) suspected of it. The residual 6–8% out-vote term **is** scale-dependent, and the
per-kind ladder is the measurement of that dependence: flower (23 px, 0% lost) → shrub (11 px, 0%
after repair) → tuft (3 px, 7–9% after repair).

**The app's actual render is not this raster, and the app does not have this defect.** `scene.ts`
emits SVG vector nodes at `LAND_CAMERA_ELEVATION_DEG = 20`, with no supersample, no closed-palette
snap and no majority downsample — and its layer list (`scene.ts:3322-3347`) paints
`buildGround(input, surfaces)` as one layer and then **every** territory's flora in a later
`flora-layer` group. Ground is structurally incapable of overpainting flora there; the y-sort inside
the flora layer is flora-against-flora, which is the small and correct `anotherPlacement` term
measured above.

So the increment's premise needs one correction, and it is the arc's own lesson applied to itself:
**it is the research raster that under-reports proof state, not today's shipped app.** That still
matters, because this raster pipeline is the medium chapter 2 is trying to move the map INTO — the
defect is in the thing being built, not in the thing being replaced. But "the app places a count and
half of it never appears" is not true of `scene.ts` as it stands today, and should not be repeated.

## Where the fix went — MADE on 2026-08-17

This section was written as *"WRITTEN DOWN, NOT MADE"*: the owner's 2026-08-16 directive
(*"this should just be a research pass on a single island … isolate this away from the main app
until we ready"*) is a fence around `packages/**` and `apps/**`, not around `docs/research/**`, and
the lane holding `compose_core.py` landed as PR #1385. All three sites now carry it:

| file | line | now | status |
|---|---|---|---|
| `docs/research/chapter2-grass-reads-as-signal-2026-08-16/compose_core.py` | **325** | `draw.append((decor_depth_key(d, cells), 3, ("decor", d)))` | **applied** — `decor_depth_key` is the one implementation |
| `docs/research/chapter2-grass-defects-2026-08-16/attribute.py` | **130** | `draw.append((D.decor_depth_key(d, cells), 3, ("decor", d, i)))` | **applied** — it CALLS the rule, so `assert_mirror` cannot drift |
| `docs/research/chapter2-healthy-island-2026-08-16/compose_healthy.py` | — | delegates to `compose_core.compose_land` | **inherits it**; its `island-detail-6x.png` was re-rendered |

**A fourth copy of the compositor was still not created.** The rule lives in exactly one function,
`attribute.py` calls it, and the pre-fix key is reachable only through a switch
(`compose_core.DECOR_SORTS_AFTER_ITS_CELL`) that exists so a guard can reintroduce the defect and
prove it is caught.

⚠ One site is still un-fixed and it is named here so it is not mistaken for done:
`chapter2-island-place-dressing-2026-08-16/compose_dressed.py:253` has its OWN copy of the draw-list
assembly, does not import `compose_core`, and still sorts decor on `d["g"][1]` alone.

**Nothing in `packages/**` or `apps/**` needs this fix today** (see the scale section). When the
raster pipeline is promoted into app code, the rule it must carry is: *a drawable that STANDS ON a
surface sorts after that surface, never on its own ground point alone.*

### The guard that catches a regression — and it is NOT wired to a gate rung

`delivery.py` is it, and the assertion is one line of arithmetic on its own output: on the shipped
piece set, **at most 10% of placements may deliver zero pixels**, and **no more than 8 of them may be
`OCCLUDED` by the fill of their own cell**. Both are measured today at 7.1% / 6 (fixture) and 8.3% /
5 (healthy); with the centroid key reinstated they are 45.5% / 36 and 46.2% / 45. Any reintroduction
of that key moves the second number by an order of magnitude on the first run.

**It is described-but-unwired, deliberately.** Wiring it to a `check:*` rung means editing
`package.json` and `packages/cli/src/gate-order.ts`, which is outside `docs/research/**` and so
outside the owner's fence for this track; and it costs minutes of numpy compositing on a root path
that fails the affected-scope classifier WIDE, so every branch would pay it. The wiring, and the
exact assertion it would carry, are written down in
`../chapter2-compositor-order-and-caps-2026-08-17/README.md` §6.

## What this does and does not hand the vocabulary question

`adr0226-vocabulary-re-examined-for-3d` was going to be handed *"ADR-0226 D2's `grassCount =
2 + tests·1.9` loses 46% of its count on delivery"*. It should be handed this instead:

- **The count largely survives delivery.** 93% of placements reach the picture once the draw order
  is right. `grassCount` is not asserting a density the medium cannot carry.
- **The per-placement SIZE question is untouched and is still open.** Median 3 delivered pixels per
  placement, before and after. Whether a three-pixel mark can carry a semantic reading is the
  vocabulary question, and it is now the ONLY one this measurement leaves.
- **No ADR change is required by this finding**, which is what the increment was sequenced ahead of
  the vocabulary re-examination to establish. Nothing is routed to story-author.

## Proof — every guard, made to FIRE

Both headline numbers are a DECOMPOSITION, and a decomposition that cannot be wrong is arithmetic
rather than a measurement. So each class is made to appear on demand.

```text
== inherited, armed on every run ==
   assert_mirror                       compose_attributed's canvas + alpha are BYTE-IDENTICAL to
                                       compose_core.compose_land's
   assert_attribution_consistent       every owned pixel's colour is one its OWNING record could
                                       have painted   (the guard the 71%-bleed false finding needed)
   back_half_attributed                its output equals the shipped C.back_half's

== this pass's own ==
   assert_footprint_contains_owned     every supersampled px a placement owns in the real composite
                                       lies inside the footprint measured in isolation
   assert_projection_unchanged         the repair reorders and never moves: identical integer blit
                                       origin, float drift < 1e-6

== the refusals ==
   FIRED  a footprint blit displaced by 7 px is caught
   FIRED  a 60-unit grass well is counted as a cull                              (36 culled)
   FIRED  sinking every placement 40 units below its cell buries it              (94 of 112 OCCLUDED)
   FIRED  a lone placement still competes with the land it stands on   (delivers 2 px, owns 9/9)
```

Two of those are worth naming. `assert_projection_unchanged` **first fired on the honest run**,
refusing at 1e-13 of float reassociation; demanding bit-identity where the compositor consumes
`int(round(c·SS − size/2))` would have made the repair unmeasurable for a reason that has nothing to
do with the picture, so it now asserts the integer blit origin plus a 1e-6 float bound. And the
**CO-CREDITED** class exists because `attribute.attribute` resolves a block to `np.argmax(is_decor)`:
two tufts on one capability paint literally the same colours, so a placement can lose the tiebreak
and read as delivering zero while its pixels are on the island. 2 of the 51 are that, on both
islands — small, but reporting them as loss would have overstated the defect, and they are subtracted
from every "TRULY delivering nothing" figure above.

## Reproduce

```text
python delivery.py           # both islands, before and after + delivery-report.json   (~4 min)
python delivery.py --fire    # and every guard in this file made to fail               (~9 min)
python picture.py            # where-the-46-percent-went.png + provenance sidecar
```

System Python with numpy + Pillow. **No Blender run and no re-render**, so no committed provenance
sidecar anywhere on this track is invalidated.

## THE FENCE — what this pass did not touch

- **The whole diff is `docs/research/chapter2-grass-delivery-loss-2026-08-17/**`.** No `packages/**`,
  no `apps/**`, no web submodule bump.
- **`LAND_CAMERA_ELEVATION_DEG` is still 20** and was read only to state that the app's camera is not
  this pass's. The research track authors at 50° as a named parameter.
- **No sibling research file was edited** — not `compose_core.py`, not `provenance.py`, not
  `attribute.py`, not `diagnose.py`. The instrument is imported and its guards run on every island.
- **No fourth compositor.** The draw list is not restated anywhere in this directory.

## Honest gaps

1. **The fix is not made anywhere.** Three sites are named to the line; none is edited. Nothing on
   this track composes correctly until one of them is.
2. **The guard is described, not wired.** No `check:*` rung runs `delivery.py`; it is a research
   script, and the thresholds in "the guard that would catch a regression" are asserted by a human
   reading the report, not by the gate.
3. **One island, one seed, one camera, one zoom, one piece set.** Inherited and unclosed. The
   scale-invariance of the dominant term is argued from the predicate's form and corroborated by the
   flat screen-y quartiles — it is **not** measured at a second render scale, which would need
   re-rendered land and decor pieces.
4. **The all-`healthy` island is the fixture GEOMETRY with its statuses driven**, not PR #1382's real
   corpus island. ✅ **CLOSED 2026-08-17** — the real island was measured on its own geometry:
   **52.2% → 17.2%** over 180 placements. Note the residual is more than twice the fixture's, so
   7.1% is not the track's delivery rate; see
   `../chapter2-compositor-order-and-caps-2026-08-17/README.md` §7.
5. **`packages/forest-world-r3f` was not examined.** ✅ **CLOSED 2026-08-17** — it is checked now,
   in `../chapter2-compositor-order-and-caps-2026-08-17/verify.py`: it is a react-three-fiber
   `<Canvas>`, i.e. depth-buffered, with no `renderOrder` / `depthWrite` / `depthTest` /
   `sortObjects` anywhere in it and no flora layer yet. There is no draw-list sort to get wrong.
6. **The 3 culled placements are the research harness's own grass well**, not the app's — `scene.ts`'s
   meadow has no explicit grass keep-out (`scatter.py:28-34` says so). So the cull term is not an app
   number and should not be carried into one.
7. **Nothing here is owner-attested.** Whether the repaired grass looks good enough is the owner's
   look (ADR-0070 stage 2) and this page has no standing to make it. What it establishes is only that
   the picture the owner declined was missing 46% of the art it was supposed to be showing.
