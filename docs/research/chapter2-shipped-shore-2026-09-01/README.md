# The landform falls to the shore — and the mesh cannot read the band

2026-09-01 · `adopt-the-land-into-the-shipped-map-arc` · the **second** of the approved treatment's
six components to cross onto the shipped map, and the one the arc's own start-order note had lost
track of.

Instrument: `packages/forest-world-r3f/harness/shipped-shore.html` +
`pnpm --filter @storytree/forest-world-r3f measure-shipped-shore`.
Every figure below is off the Mint box (RTX 2060, ANGLE/OpenGL), two runs.

---

## The one-sentence result

The shipped island's land now **falls to the coastline** the clip gave it instead of ending at a
vertical cut — 255 of 394 ground vertices drop to the waterline and 211 of them change shade rung,
for **no triangle, no vertex and no byte**. But the band's *width* turned out to be a knob this mesh
cannot read: **the reference's authored 3.1 units and our own 7 render byte-identically.**

Look at `shore-one-8px-none.png` against `shore-one-8px-beach.png`. Then look at
`shore-one-8px-authored.png` against `shore-one-8px-beach.png` — those two are the same picture, and
that is the finding.

---

## The premise, checked at source before anything was built — and it is the coast's inverted

The coast clip's premise check found the component **built and merely unimported**; two greps turned
that increment from "write a coast" into "import one". This one is the opposite:

- A repo-wide grep for a shore falloff, a shore height term or a beach dip returns **exactly one
  hit**, and it is the sentence in the reference README naming the component as *wanted*.
- `src/land-relief.ts` is an unbounded sum of three sine waves and a function of **position only** —
  no shore term of any kind. PR #1776's own README says so in terms: *"the relief still does not fall
  to the shore… the new beach stands at whatever height the field gives it."*

**The component was genuinely absent.** And it could not have been written earlier: a landform that
falls to the shore needs a shore to fall to, and until #1776 the shipped mesh ended in raw 120°
corners. The coast is what unblocked it; the order was not a preference.

---

## The numbers are the approved render's own, not this session's

`docs/research/chapter2-land-idiom-2026-08-27/build_land.py` is the script that produced
`land-combined-1948px.png`, the picture the owner stamped. Its landform is four lines:

```python
BEACH = 3.1                                # shore band width, ground units
fall  = np.clip(shore / BEACH, 0.0, 1.0)
fall  = fall * fall * (3 - 2 * fall)       # smoothstep
z     = (...relief...) * fall
z    -= 0.62 * (1.0 - fall)                # the beach dips below the grass line
```

with the comment: *"THE LANDFORM. Broad relief that FALLS TO THE COAST — an island whose ground is
flat right up to a vertical cut has no shore, and a shore is most of what makes a coast read."*

**The two scales agree**, which is why both constants transfer as authored rather than being
re-tuned: the generator sizes its island from `ASPECT = 233.8 / 135.1`, *"the real island's ground
footprint"*, and the shipped island measures 234 units across.

The one place they differ is the arm variable. The reference's band is 3.1 units; the beach **this**
map draws is `COAST_OUTSET` = **7** units, more than twice that. Three arms, and only the width moves.

---

## ⚠⚠ The finding: below 8.66 ground units the band width is not a knob

Measured on the shipped island, not reasoned about:

| | |
|---|---|
| distinct ground vertices | **394** |
| lying **exactly** on the coast | **255** (64.7%) |
| nearest interior vertex to the coast | **8.66 ground units** |
| vertices at any distance in between | **zero** |

So a band narrower than 8.66 acts on the rim **alone**, and every width in that range delivers the
identical land. The smoothstep never gets a sample to curve through — only its endpoint value at
distance 0 is ever read.

The instrument says so at every level it can:

| | `authored` (3.1) | `beach` (7) |
|---|---|---|
| vertices moved | 255 / 394 | 255 / 394 |
| max drop | 4.076 | 4.076 |
| mean drop | 0.665 | 0.665 |
| rung flips | 211 | 211 |
| **pixels differing, one @ 2 / 8 / fit** | — | **0 / 0 / 0** |

### ⚠ Why it is structural, not a property of this island

The reference generator displaces a **0.55-unit grid** (`GRID = 0.55`), so its 3.1-unit band spans
about six samples. This ground is **parcels ~16.5 units across whose only vertices are their
corners**, and 8.66 is the lattice's own half-pitch. **The mesh is roughly thirty times coarser than
the surface the component was authored on.**

**The arc already made this call once, for a different field.** For the shadow it considered a
per-vertex attribute and rejected it — *"the mean cell pitch is ~16.5 ground units, coarser than the
features it had to represent, so a vertex attribute smears"* — and used a ground-space **texture**
sampled in the fragment stage instead. The shore fall inherits that constraint and **cannot inherit
its remedy**: a texture can shade a surface, it cannot move one, and this component's whole subject
is where the ground *sits*.

### ⚠ And the forest caught the claim being too strong — by the instrument's own refusal

The coast wave is seeded per island, so 35 copies of one fixture wear 35 different coasts and each
samples the rim-to-interior gap differently. Across all of them **exactly one vertex in 8884** falls
between 3.1 and 7 units of its shore (8883 vs 8884 moved; 59 and 31 differing pixels at the two
coarse zooms, 0 at 8 px/unit).

So the void is **exact on the shipped island and overwhelming rather than absolute across seeds**.
That is the stronger statement, not the weaker one: moving the band from the reference's width to
ours changes **0.011%** of the ground. The driver now refuses on exact identity for one island and a
fixed handful for the forest — a count rather than a percentage, so a number that has to move later
is a finding rather than a retune.

---

## What it costs: nothing, in every column

| size | arm | band | triangles | ring verts | vertex KB | sq units | draws |
|---|---|---|---|---|---|---|---|
| one | `none` | 0 | 2,264 | 864 | 238.8 | 11,935 | 1 |
| one | `authored` | 3.1 | 2,264 | 864 | 238.8 | 11,935 | 1 |
| one | `beach` | 7 | 2,264 | 864 | 238.8 | 11,935 | 1 |
| one | `shelf` | 16.5 | 2,264 | 864 | 238.8 | 11,935 | 1 |
| forest | *all four* | — | 79,240 | 30,240 | 8,357.3 | 421,369 | **1** |

**The point of this table is that it does not vary.** A vertical fall moves vertices in Y and
creates none, so a moving column would be a *bug* rather than a cost — and "it is free" is exactly
the class of claim that gets believed rather than checked. The driver refuses any run in which one
of them differs between arms. `the forest's ground is ONE draw call` survives this crossing too.

---

## What it moves: the land, and the delivered colour

| size | arm | moved / verts | max drop | mean drop | height range | **rung flips** |
|---|---|---|---|---|---|---|
| one | `none` | 0 / 394 | 0.000 | 0.000 | −3.91…4.03 | 0 |
| one | `authored` | 255 / 394 (64.7%) | 4.076 | 0.665 | −3.91…4.03 | **211** |
| one | `beach` | 255 / 394 (64.7%) | 4.076 | 0.665 | −3.91…4.03 | **211** |
| one | `shelf` | 318 / 394 (80.7%) | 4.076 | 0.550 | −3.91…**3.65** | **244** |
| forest | `authored` | 8,883 / 13,748 | 4.839 | 0.671 | −4.21…4.21 | 7,027 |
| forest | `beach` | 8,884 / 13,748 | 4.839 | 0.671 | −4.21…4.21 | 7,029 |
| forest | `shelf` | 10,979 / 13,748 | 4.839 | 0.562 | −4.21…4.21 | 8,122 |

**`rung flips` is the only column a viewer can actually see.** The banded material quantises
`dot(n, L)` onto the authored ladder, so a moved normal is a moved rung is a different delivered
colour — and a band that moved a lot of ground but flipped no rung would be *invisible* on the
shipped material however deep its drop. It is a **lower bound**: taken per vertex, while the shader
quantises per fragment.

On screen, against the arm's own footprint rather than the frame:

| size / zoom | shore's own pixels | % of frame | beach px |
|---|---|---|---|
| one @ 2 | 13,921 | 0.34% | 14 |
| one @ 8 | 221,906 | 5.42% | 56 |
| forest @ 8 | 234,470 | 5.72% | 56 |

---

## Frame cost — and there is no mechanism for one

Read this table knowing the geometry is **byte-identical across arms**: same buffer, same material,
same one draw call. There is no route by which an arm can cost more GPU time, so any difference is
noise, and the question is only whether the instrument agrees with that.

**The one group where all four arms reproduce with low spread in both runs — `forest @ 8 px/unit`:**

| arm | run 1 | run 2 |
|---|---|---|
| `none` | 0.3535 ms | 0.3580 ms |
| `authored` | 0.3547 | 0.3579 |
| `beach` | 0.3550 | 0.3572 |
| `shelf` | 0.3547 | 0.3575 |

**All four within 0.4% of each other. The shore fall costs 0.000 ms**, which is what identical
geometry predicts.

**Rows dropped, and the spread column predicted every one of them.** `one/8/none` reproduces to four
decimals at 1.226 ms against ~0.54 for the three arms — the same unexplained anomaly #1776 recorded
in this exact cell, so no claim rests on it. `forest/2/authored` (0.954 → 0.611, spread 0.61/0.62),
`forest/fit/shelf` (1.168 → 1.197 against ~0.45 for the other three, spread 0.73/0.04) and the four
`one/fit` rows (~3.7% apart) are all dropped. Reproducible is not the same as explained.

---

## What ships, and why

`SHIPPED_SHORE = 'beach'` (`packages/forest-world-r3f/src/shore-fall.ts`).

`beach` and `authored` deliver the same land, so choosing between them is free; `beach` is chosen for
saying what it means — its width is this map's own `COAST_OUTSET`, so if the mesh ever gains vertices
inside the band the fall will cover exactly the land the coast added and stop.

**`shelf` is refused for a measured reason and not a look.** It lowers ground *inland* of the
pre-coast boundary — its highest vertex comes back at **3.65** against the control's **4.03** — and
that ground carries **props**. `dressMapFromKit` still reads the mapper's own descriptors (the coast
clip's deliberate scoping, inherited here), so a tree stands where its parcel put it while the ground
beneath it moves. `beach` cannot do that: at `COAST_OUTSET` the fall reaches exactly the pre-coast
boundary, where the falloff is 1 and the ground has not moved at all.

There is **no flag** — end-state item 6 — and the before/after is `shoreRelief` called with `none`,
the same function one argument apart.

**Semantics do not move.** The field is a function of position and of the island's own outline; it
names no status, no capability and no colour. Every parcel keeps its capability's status token, and
the shade floor is unchanged.

---

## Two bugs caught before they reached a picture

**⚠ The tidier algebra is not the same function.** `H·f − D·(1−f)` is algebraically `(H + D)·f − D`,
and the second form reads better. In floating point it is not the same: at `f = 1` it computes
`H + 0.62 − 0.62`, which round-trips a double through a magnitude it does not have and comes back
**one ulp off** — `0.5928485904943256` where the land field says `…55`. The first form computes
`H·1 − D·0`, both operations exact. That single ulp is the difference between *"inland of the band
this field **is** `landRelief`"* being a property and being nearly a property, and the suite asserts
it with `assert.equal`.

**⚠ The normal has to carry the product rule.** Scaling the height by a falloff without
differentiating the falloff gives a surface lit for the shape it had **before** the shore was cut —
and on a banded material a slightly-wrong normal is not a slightly-wrong colour, it is a different
rung. The mistake is invisible in the bounds, the silhouette and the picture. The suite holds the
analytic normal to a **central difference of the height the same object returns**: two routes sharing
no arithmetic, so dropping the second term fails there and nowhere else.

---

## Known and measured, not swept up

- **The falloff's *shape* is not delivered.** The fall is linear across the first triangle, because
  there is nothing between the rim and 8.66 units to curve through. The smoothstep is doing no work
  on this mesh.
- **The remedy is the next increment, and it costs triangles.** An inset ring of vertices inside the
  band — exactly the move the coast clip's `subdivide` arm made for the island's *outline*, one
  dimension over.
- **The band does not move props.** Deliberately, and inherited from the coast: `dressMapFromKit`
  still reads the mapper's descriptors. The shipped arm is the one for which that stays honest.
- **The island's floor never deepens.** The fall pulls ground *toward* the waterline, so where a
  wide band reaches a trough deeper than −0.62 it *raises* it (`shelf`, one island: −3.91 unchanged
  at the minimum but the maximum pulled from 4.03 to 3.65). No camera framing constant and no shadow
  reach moves in this increment.
- **Two 1-vertex "rim loops" appear after the subdivide clip.** They are #1776's six zero-length ring
  edges, seen from the boundary-chaining side: single coincident points of zero area, sitting *on*
  the coastline, so they can never win a distance query. Harmless, and named here so the next reader
  does not re-investigate.
- **Counts differ between the suite and the driver, and do not disagree.** The suite drives
  `shippedParcels()` (253/392); the driver drives `crowdCells('one')`, which re-stamps the island id
  per copy. The coast wave is seeded on that id, so a different id is a different coast is a
  different rim (255/394). Same code, two seeds.

---

## Files

| picture | what it shows |
|---|---|
| `shore-one-2px-*.png` | one island at the overview zoom |
| `shore-one-8px-*.png` | one island zoomed in — **the read**, the shore at 56 delivered px |
| `shore-forest-2px-*.png` | the forest at the overview zoom |
| `shore-forest-8px-*.png` | the forest zoomed in |
| `shore-forest-fitpx-*.png` | the whole forest fitted — 35 islands |

`shore-measurements.md` / `.json` — run 1, the committed numbers.
`shore-measurements-run2.md` — run 2, for the row-by-row diff above.

> ⚠ **`shore-one-8px-authored.png` and `shore-one-8px-beach.png` are the same image.** That is not a
> failed capture — it is the increment's finding, committed as two files a reader can diff.

## Reproduce

```
pnpm --filter @storytree/forest-world-r3f exec vite harness --port 5300 --strictPort
DISPLAY=:0 ST_SHORE_URL=http://localhost:5300/shipped-shore.html \
  pnpm --filter @storytree/forest-world-r3f measure-shipped-shore
```

⚠ Needs a real GPU. Every committed frame figure here is off the Mint box (RTX 2060);
`ST_SHORE_ALLOW_SOFTWARE=1` develops the page but stamps the run as uncommittable.
