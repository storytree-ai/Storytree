# One surface, and a shadow on it

> **⚠ RE-COMPOSED 2026-08-18 — NO picture moved — all 5 are pixel-identical.** The plant positioner's CRC32 affine collapse was
> propagated into `scatter.py` itself by the increment
> `crc32-dispersion-fix-propagated-and-evidence-rerendered`, so every placement on this pass's
> pictures moved. This pass draws no plants, and its provenance sidecars PROVE it rather than asserting it: each changed by exactly one line (the recorded `scatter.py` hash) while every picture stayed byte-identical.  **Nothing was re-RENDERED** — no piece PNG is touched; the fix changes
> where a piece is stamped, never what it looks like. The full delta table, and what did NOT move,
> is in `../chapter2-plant-dispersion-2026-08-17/README.md`. Numbers in the prose below were
> measured on the PRE-FIX placements unless they say otherwise.


**Date:** 2026-08-17 · **Camera:** 50° (a named parameter, inherited) · **Surface:** PR #1382's healthy
island — `context-traversal-capture`, seams already off · **Blender renders:** 0 · **Cost:** $0

The owner, 2026-08-16, verbatim — and the second half is the half this pass is built around:

> *"the green on the land is not consistent either with different mesh trianles rendering different
> colors, and the mess lines as well add to the noise. I think all of this was okay in 2d, but in 3d
> its very noisy and **doesnt make space for shadows which is one of the bigger wins of going 3d**."*

**Two arc increments, delivered as ONE unit, because they are one move.** A shadow is a low-frequency
luminance gradient across a surface. A surface already carrying three hash-picked colour variants plus
a tan wheat subset has no dynamic range left for one to be legible in. Taking the noise out and
putting the light in are the same operation, and delivering them separately would have measured
neither.

**Nothing here is owner-attested.** Whether this reads right is the owner's look and this page has no
standing to make it (ADR-0070 stage 2).

## The headline, in five lines

1. **The green is now one material.** With the hash-picked `variant` rotation and the `wheat` override
   collapsed, the delivered land carries **1 distinct top-face fill, down from 4** — 6 → 3 counted by
   PR #1382's own instrument, which centre-samples and so picks up two wall colours as well.
2. **There is a shadow, and it reaches 31.8% of the island** (9 700 of 30 477 delivered island px).
   Distinct delivered luminance levels across the cell bodies: **7 → 4 → 24**.
3. **A shadow only exists if the palette holds it.** On the shipped palette, composed identically,
   **every one of the three light levels is quantised away** — the land's closed palette clamps each
   shadowed pixel back to a lit token. That is a real answer to the increment's *"if shadow does NOT
   survive quantisation, that finding is worth as much as a picture"*, and it is a picture.
4. **The depth a shadow may reach is BOUNDED by the token table, and the bound is measured — 0.74.**
   Darkened past it, a `healthy` fill reads nearest to another status. The ladder's deepest rung is
   0.80, a margin of 0.06, and `verify.py` re-measures the bound every run.
5. **On a MIXED island that bound is 0.91, not 0.74 — this ladder would not be admissible there.**
   See "What this does not settle".

## The pictures

| file | what it is |
|---|---|
| **`one-surface-and-shadow.png`** | **THE DELIVERABLE.** One island, one material, light on it. |
| **`three-moves.png`** | **THE FORK, ONE VARIABLE AT A TIME.** As shipped → one surface → + shadow. |
| **`shadow-detail-6x.png`** | **JUDGE THE ART HERE.** The same crop at 6×, nearest-neighbour, so every block is one delivered pixel. Panel 1's colour differences are a hash; panel 3's are a light direction. |
| **`shadow-survives-the-snap.png`** | **THE PALETTE QUESTION.** Same light field, shipped palette vs the palette closed over the light ladder. |
| **`confusability-depth.png`** | **THE GUARD, AS A PICTURE.** How deep a shadow may go before it lies about the work. |

## 1. One surface

`shadow-report.json` → `oneSurface`

The mechanism was diagnosed by PR #1382 and is exactly one line —
`packages/forest-world/src/substrate.ts:237`:

```ts
quads.push({ owner, ids, variant: hash(`cell:${key}:${i}`) % 3, wheat: cellWheat });
```

**That file is read and not edited.** The owner fenced this work out of the app on 2026-08-16
(*"isolate this away from the main app until we ready"*), so the app-side implication is written down
below rather than made. `verify.py` asserts both halves: the line is still there, and it did not move.

The collapse here is **DATA, not code** — every cell drawn at variant 0 with wheat off, through the
same compositor, the same tokens and the same palette:

| | as shipped (PR #1382) | one surface |
|---|---:|---:|
| cells at `variant-0` / `-1` / `-2` | 44 / 48 / 49 | 162 / 0 / 0 |
| **`wheat` cells** (TAN, on a green island) | **21 (13.0%)** | **0** |
| distinct delivered cell fills *(PR #1382's instrument)* | 6 | **3** |
| **distinct delivered TOP-FACE fills** | **4** | **1** |
| cell fills moved | — | 117 of 162 |

**Why two fill counts.** `cell_modal_fill` centre-samples a 5×5 at each cell's projected centroid, and
on a terraced island some centroids fall on the WALL of the cell in front. Two of the six colours it
reports are side-token pixels, not top faces. Both numbers are given: 6 → 3 so the two passes are
comparable, and 4 → 1 because *"the land reads as one surface"* is a claim about fills.

## 2. The light rig — read from the delivered art, not restated

`shadow.py` §1 · report → `lightRig`

The increment asked for the rig to be *"stated once as a named parameter, exactly as the camera now
is"*, and warned that *"the land must agree with [the tree] or the two will read as separate scenes"*.

**That agreement already exists at the generator, and this pass's job was not to break it.**
`blender_land.py:88` and `blender_tree.py:1958` set the SAME key sun,
`rotation_euler = (radians(48), 0, radians(34))` — re-read from both files by `verify.py` rather than
quoted here.

**The azimuth is MEASURED off the delivered pixels, by two independent instruments:**

| instrument | what it reads | answer |
|---|---|---|
| the land pieces' `wall_lit` / `wall_dark` bands | a wall is a vertical face, so which band it takes is decided by azimuth alone | `wall_lit` cx **81.1**, `wall_dark` cx **113.0**, silhouette 95.5 → the **left**-facing walls are lit |
| the hero tree's crown | least-squares luminance gradient over 4 804 crown px | brightens toward **(−0.857, −0.516)** — up-left |

Two generators, two shading models, one answer; and `blender_tree.py:180` says the same thing in
words — *"concentric rings around an upper-left highlight"*.

So: **light from up-left; shadows fall down-right**, toward the viewer. Elevation 42° (the authored
euler, 90 − 48). In ground coordinates the shadow falls toward (+0.786, +0.618).

**The canopy uses a different sun, and that is inherited rather than invented.** The mature tree stands
126 delivered px above its ground socket = **197.6 world units, 26× the island's tallest terrace step
(7.6)**. Cast at the key's 42° its shadow would reach 218 ground units across a 246-unit island — off
the land entirely. `blender_tree.py:1950` already hit this and says so: *"The key sun sits at 48 deg
and throws a shadow several tree-lengths long, which walks off the canvas and reads as a smear."* Its
own answer was a near-overhead shadow sun at 75°, and that is the one used here. **Two suns is an
authored inconsistency and it is the tree track's**, adopted rather than introduced.

## 3. What the shadow actually buys — measured, not asserted

`shadow-survives-the-snap.png` · report → `whatTheShadowBuys`

Three terms, each answering one clause of the increment, each sized to land on its own rung of the
ladder (the boundaries sit at 0.97 / 0.90 / 0.83, which is why they are not round numbers):

| term | what it is | strength | rung |
|---|---|---:|---:|
| terrain cast | a height-field march along the key sun, from the b++ elevation field | 0.12 | 0.867 |
| canopy cast | the hero tree's OWN delivered silhouette, sheared onto the ground | 0.19 | 0.80 |
| join AO | local height EXCESS within 3 ground units | 0.07 | 0.933 |

Measured over the cell bodies, tree-less:

| | luma p2–p98 | std dev | **distinct luma levels** |
|---|---:|---:|---:|
| as shipped (3 variants + wheat) | 78.9 | 19.58 | 7 |
| one surface, no shadow | 58.2 | 14.47 | **4** |
| one surface + shadow, shipped palette | 58.2 | 16.99 | 16 |
| **one surface + shadow, closed palette** | **61.6** | **17.21** | **24** |

**Read the rows together, because one of them is not flattering.** Collapsing the variants NARROWS the
luminance range from 78.9 to 58.2 — the range it removes was hash-picked noise. The shadow re-spends
some of that (to 61.6) on a low-frequency gradient, and multiplies the *structure* six-fold (4 → 24
levels). **It does not restore the raw range the variants had, and nothing here claims it should.**
Whether a narrower range carrying form beats a wider one carrying a hash is the owner's look.

**The AO term is driven by height EXCESS, and that is a decision.** Ambient occlusion applied at every
cell-to-cell join would redraw — as a shade band — exactly the interior mesh seam the owner removed the
day before at a cost of 1 892 delivered px. So it is identically zero across a join between two cells
at one height. `verify.py` §5 proves it mechanically: rebuild the field over a FLATTENED copy of this
island and the terrain+AO multiplier is **1.0000 everywhere, over 170 552 land px**. `verify_refusal.py`
§5 proves the same term is not merely dead: on the real terraced island it reaches **0.8100** and
darkens 51.0% of land px.

## 4. A shadow only exists if the palette holds it

`shadow-survives-the-snap.png` · report → `survivesTheSnap`

The land's palette is CLOSED — every colour it may emit is an authored token times an authored shade
level — and `snap()` clamps everything else to the nearest entry it **holds**. So a shadow is not free.

| | shipped palette | closed over the light ladder |
|---|---:|---:|
| palette entries | 132 | 506 |
| light-0.933 px delivered | 0 | 822 |
| light-0.867 px delivered | 0 | 158 |
| light-0.800 px delivered | 0 | 747 |

**On the shipped palette, every rung is quantised away.** The shadow composes and then does not exist.

The closure is taken as a cross product against the **DELIVERED palette**, never against the token
tables — one line, and it is what makes the coast sand come along too. `build_palette`'s own docstring
records what a partial closure costs: *"the nearest surviving entry belonged to a DIFFERENT STATUS
FAMILY, so an `unknown` island's rim came out `healthy` green, over 2564 pixels, and nothing failed."*
`verify.py` §4 asserts the result is a strict SUPERSET **and an identity** — every shipped-palette
colour still snaps to itself — so the fork stays one variable.

## 5. THE CENTRAL RISK: does the shadow lie about the work?

`confusability-depth.png` · report → `statusIsNotCorrupted`, `howDeepBeforeItLies`

Land cells ARE the capability and each cell's FILL carries its status tint, so a darkening pass is
precisely the operation that can make a `healthy` cell read as a different status — the art asserting
something false, which ADR-0367 D5 forbids outright.

**The guard is a REFUSAL, not a report line.** `compose_shadow.py` declines to write any picture if it
fires. That follows PR #1382's own call on its central claim: *"a report explaining afterwards that
the island was fabricated is not the same object as a composer that declines to draw one."*

**Delivered: 0 of 12 457.** Not one pixel that delivered the healthy top FILL unshadowed reads as a
different status once the shadow is applied.

**AND THE GUARD FIRES.** `verify_refusal.py` §1 drives the real composer, in its real directory,
with the floor pushed past the measured ceiling, and the composer refuses a REAL picture naming
**1 332 of 12 457** corrupted pixels. The harness requires more than a handful, so a threshold-only
guard could not pass it.

### Getting the instrument right cost three attempts, and each failure is a live trap

**1. The obvious test condemns the shipped art.** Asked absolutely — *does any cell-body pixel read as
non-`healthy`?* — the answer is 13.6% **on the unshadowed baseline**. Over the closed set of colours the
land may already emit, **21 of 78 (26.9%) read nearest to a status other than the one that authored
them, at full light, with no shadow anywhere near it**: `healthy`'s dark wall band reads `unhealthy`,
and `unknown`'s entire side family reads `healthy`. A test that fails on the baseline cannot price a
change to it. So the guard is a **DELTA**: the shadow must not change what any pixel SAYS.

**2. The reader table has to be the FILL's.** Including the `side` tokens makes almost any shaded
green nearest to `unknown`'s muted olive wall colour. But a wall is the same cell's side face, not a
second assertion. ADR-0367 D5 is stated about the fill, so the guard's table is the `top` shades only.
The wider `faces=all` table is reported and never asserted on — that is where the 21/78 above comes
from.

**3. A geometric mask alone still over-reports, and the residue had to be DUMPED to find out why.**
Two mechanisms put pixels in the count that never changed what they say: `mode_down` is a MAJORITY vote
over each supersample block, so a block straddling a cell and a wall can tip from one to the other when
the shadow moves the vote; and the compositor stamps WALL sprites painter-ordered AFTER the cell behind
them, so a wall legitimately covers part of a farther cell's projected top face. Both change which
SURFACE won the block, not what a fill says. The strict guard therefore runs over pixels whose whole
supersample block is the top fill **in the unshadowed canvas, before the snap** — the baseline is the
reference and only the shadowed side is under test, so it is not circular. 27 pixels remain in the
loose count and every one of them starts or ends on a side-token colour.

## Proof — `verify.py` (42/42) and `verify_refusal.py` (13/13)

```text
verify.py
 == 1. the fence ==            diff confined to docs/research/**; LAND_CAMERA_ELEVATION_DEG still 20;
                               substrate.ts still carries the diagnosed line, UNEDITED
 == 2. the light rig ==        re-measured from the pieces AND the tree, independently; both
                               generators re-read for the same key sun
 == 3. the ladder ==           ceiling RE-MEASURED (0.74); deepest rung clears it by the declared
                               margin; ladder DERIVED from the floor; every rung reached the raster
 == 4. the palette ==          strict superset AND identity on all 132 shipped entries; coast covered
 == 5. the AO ==               a FLAT island produces multiplier 1.0000 over 170 552 px
 == 6. no fourth compositor == compose_healthy imported whole; no compositor function restated
 == 7. the pictures ==         sidecars, ONE code state, 0 Blender frames, 1 top-face fill,
                               0 of 12 457 fill pixels changed what they say
 == 8. determinism ==          all five pictures re-compose PIXEL-IDENTICALLY, on the DECODED raster

verify_refusal.py
 PASS  an over-strong gradient is REFUSED, with pixel evidence, and NO picture is written
 PASS  the refusal names 1332 corrupted pixels, so it is not a threshold artefact
 PASS  the ceiling clause is armed on its own, with a CLEAN surface
 PASS  a rig pointing the WRONG WAY across the land pieces is REFUSED before a pixel
 PASS  an INVENTED status is still REFUSED **through this pass**
 PASS  a `healthy` cell with NO signed pass is still REFUSED here (ADR-0040's wall)
 PASS  `safe_depth` finds a depth at which the healthy fill DOES lie — the ceiling is not vacuous
 PASS  the SAME terrain+AO term DOES fire on the real terraced island
 PASS  on the SHIPPED palette every rung is quantised away; on the CLOSED one every rung arrives
 PASS  a ONE-PIXEL drift is caught by the raster comparison
```

**Determinism is asserted on the DECODED raster, never a file hash** — the house rule. Across two
pixel-identical runs on this track, 0 of 22 files had identical bytes.

**The harness's own first version failed the way the prior pass's did**, and it is recorded because it
is the trap: it `exec`'d the composer's source, which left `__file__` undefined, so the composer died
on its own second line and all five composer guards reported "did not fire" having never reached the
thing under test. `run_path` fixes it, and `fires()` distinguishes DID NOT FIRE from PROBE BROKE so the
two can never look alike again.

## No fourth compositor

The track has three copies of a ~700-line compositor and nothing detects the fork (recorded in the
healthy-island README). **This pass adds none.** It IMPORTS `compose_healthy.py` whole, run in its own
directory with `STORYTREE_HEALTHY_OUT` pointed at a scratch dir so that pass's delivered pictures are
never touched — which also means **its refusals bind here**, proved by `verify_refusal.py` §4 rather
than claimed. The land is `compose_core.compose_land`; the palette snap is `compose.back_half`; the
seam control is the hex-lines pass's.

What is genuinely new is `shadow.py` and a ~20-line `panel()`, and the second exists for one reason:
the shadow has to be applied **between** `compose_land` and `back_half`, and no existing function
offers that seam. A shadow composited after the snap is a raw gradient shipped as land — the ADR-0145
failure at island scale.

## What this does not settle

1. **There is no owner LOOK.** Whether this reads right is exactly the judgment this page must not
   make. `shadow-detail-6x.png` is where to make it.
2. **THE CEILING IS PER-STATUS AND THIS ISLAND EXERCISES ONE.** Every capability here is `healthy`, so
   0.74 is `healthy`'s bound. Measured for the other rendered tokens:
   `mapped` **0.76**, `proposed` **0.88**, **`unknown` 0.91**. On a mixed island the admissible depth
   is the minimum over the tokens present, so **this ladder (deepest 0.80) would NOT be admissible
   there** — an `unknown` cell darkened past 0.91 reads `healthy`, which is the worst direction for it
   to fail. A mixed-island shadow needs either a shallower ladder, or per-status ladders, or a token
   table with more separation. **Not decided here.**
3. **The euler and the delivered pixels disagree about the azimuth's sign.** Working
   `rotation_euler = (48, 0, 34)` by hand puts the light on the RIGHT; the land pieces and the hero
   tree both put it on the left. One of the two is wrong about a convention (Blender's euler order, its
   sun default axis, or the compositor's ground-y flip relative to the render camera). The delivered
   pixels win because they are what the owner looked at, and the disagreement is recorded rather than
   resolved.
4. **The hero tree sprite carries its own contact shadow (767 px) and this pass did not reconcile it.**
   Measured, its centroid sits 21 px LEFT and 25 px ABOVE the ground socket — the opposite side from
   where the land now casts. Rendering a matching sprite means re-running `blender_tree.py`, which
   moves committed provenance across sibling passes.
5. **The terrain cast is small in absolute terms.** The tallest terrace step is 7.6 world units, so a
   terrain shadow is at most ~8 ground units long. Most of the low-frequency gradient in the delivered
   picture is the canopy.
6. **Only TOP FACES are guarded.** Walls are shaded too and their reads do move; they are excluded from
   the assertion because a wall is not a status assertion, which is a position rather than a proof.
7. **`wheat` is removed entirely, and whether it should exist is not an art question.** Three status
   pairs share the identical wheat hex (#1372), so a wheat cell reports no status by colour at all.
   Whether wheat should override status is a story-author question — surfaced, not decided.
8. **One island, one seed, one camera, one zoom.** The pixel shares are this island's; the direction of
   each finding is structural.
9. **Nothing here proposes an app change**, including the two findings that most obviously imply one —
   the `substrate.ts:237` variant/wheat rotation, and the 21-of-78 cross-reading colour table. Both are
   findings because the fence says so.

## Reproduce

```text
python compose_shadow.py           # 5 pictures + shadow-report.json + 5 sidecars   (~3.5 min)
python verify.py [--fast]          # 42 checks; --fast skips the determinism re-compose
python verify_refusal.py           # 13 guards, four of which drive the real composer (~8 min)
```

Needs system Python with numpy + Pillow. **No Blender**, and that is a proved property: the committed
piece set covers this island's six kite shapes, which the imported pass checks before a pixel is drawn.
