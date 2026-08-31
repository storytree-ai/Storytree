# The coast clip — the shipped map's ground gets its own coastline

2026-09-01 · `adopt-the-land-into-the-shipped-map-arc` · the **fifth** of the approved treatment's
six components to cross onto the shipped map, and the first whose subject is the island's
**outline** rather than its surface.

Instrument: `packages/forest-world-r3f/harness/shipped-coast.html` +
`pnpm --filter @storytree/forest-world-r3f measure-shipped-coast`.
Every figure below is off the Mint box (RTX 2060, ANGLE/OpenGL), two runs.

---

## The one-sentence result

The shipped island stopped ending in 120° hex corners and started ending on the story-seeded,
Chaikin-rounded coast **the studio's 2D map has drawn all along** — the same `smoothCoast`
machinery, imported rather than transcribed. Look at
`coast-one-2px-none.png` against `coast-one-2px-subdivide.png`.

---

## The premise, checked at source before anything was built

Two greps, and both halves held:

- `packages/forest-world/src/substrate.ts:344` says in terms that the relaxed mesh keeps
  *"the existing hex-silhouette one (outer vertices pinned)"*. So the shipped 3D ground's outline
  **is** the raw hex-union silhouette. Measured: one rim loop, **52 vertices**, over 164 parcels /
  191 distinct vertices / 354 edges (302 interior, 52 boundary, 0 used more than twice).
- `smoothCoast()` in `packages/forest-world/src/coast.ts` already chains that boundary into loops,
  outsets each vertex by a story-seeded wave and Chaikin-rounds it — and its **only** caller is
  `apps/studio/src/components/TreeView.tsx:846`, which draws the result as a separate overlay
  polygon *over* the same hex-outlined ground. `forest-world-r3f` imported it nowhere.

**The component was never missing. It was unimported.** So this increment is an import plus the one
question the import does not answer.

---

## ⚠⚠ The finding nobody was looking for: the coast we already ship SELF-INTERSECTS

`coast.ts` states, in its own comment, that because only the outset *magnitude* is perturbed and it
is applied along the normal, *"the offset can never self-intersect"*.

That is false for a polygon offset in general — a convex corner sharper than the offset is wide
turns its two neighbouring edges past each other — and **it is false on the island the studio
ships**: the outset coast loop crosses itself **twice**.

Nobody could see it, and that is the interesting half. The studio draws that loop as an **SVG
fill**, and the nonzero fill rule paints a doubled-back region exactly like a single one. A
**triangulated ground** has no such mercy: the two boundary parcels at a crossing overlap, so one
capability's status colour is drawn over ground belonging to another. That is a **misreport**
(ADR-0392 D5 / ADR-0398 D7) — the one way this component could do real harm.

So every clip is **capped**: a fixed-point loop demotes a folded parcel's rim vertices down an
eleven-rung ladder until the ring is simple, and the bottom rung is *no displacement at all*, which
is where the mesh already was — so it terminates by construction rather than by a give-up branch.
The cap **reports itself** (`coastCapping`) instead of clamping silently, and the driver **refuses
any run in which a single parcel folds**.

| arm | rim vertices capped (one island) | worst kept | forest |
|---|---|---|---|
| `outset` | 4 / 52 (7.7%) | 0.70 of its beach | 124 / 1820 (6.8%) |
| `project` | 4 / 52 (7.7%) | 0.90 | 72 / 1820 (4.0%) |
| `subdivide` | 6 / 52 (11.5%) | 0.70 | 109 / 1820 (6.0%) |

> ⚠ `packages/forest-world-r3f/harness/shipped-coast-scene.test.ts` pins **different** numbers
> (4 / 2 / 3) and the two do not disagree. The test drives `shippedParcels()`, whose island id is
> `context-traversal-capture`; the driver drives `crowdCells('one')`, which **re-stamps** the id per
> copy. The coast wave is seeded on that id, so a different id is a different coast is a different
> set of tight corners. Same code, two seeds.

---

## The fork: three honest shapes, because the curve is not 1:1 with the rim

`smoothCoast` returns **four times** the vertices it is handed — this island's 52 rim vertices
become a 208-point curve — so there is no 1:1 displacement of the mesh's existing boundary to reach
for. Three answers, each giving up something different:

| arm | what it is | what it drops |
|---|---|---|
| `outset` | the outset only | the **rounding** — every hex corner survives |
| `project` | each rim vertex moved *onto* the curve | the fine curve — a corner is **cut**, not curved |
| `subdivide` | `project` + the curve's own points along each rim edge | nothing — the boundary **is** the curve |

### What each costs

| size | arm | triangles | ring verts | vertex KB | land (sq units) | draws |
|---|---|---|---|---|---|---|
| one | `none` | 1,640 | 656 | 173.0 | 8,425 | 1 |
| one | `outset` | 1,640 | 656 | 173.0 | 12,009 | 1 |
| one | `project` | 1,640 | 656 | 173.0 | 11,827 | 1 |
| one | `subdivide` | **2,264** | **864** | **238.8** | 11,935 | 1 |
| forest | `none` | 57,400 | 22,960 | 6,053.9 | 294,860 | 1 |
| forest | `outset` | 57,400 | 22,960 | 6,053.9 | 423,752 | 1 |
| forest | `project` | 57,400 | 22,960 | 6,053.9 | 416,933 | 1 |
| forest | `subdivide` | **79,240** | **30,240** | **8,357.3** | 421,401 | 1 |

- Two of the three arms are **exactly free**: no triangle, no ring vertex, no byte.
- `subdivide` spends the curve **once** — 52 rim vertices × 4 curve points = 208 new ring vertices
  per island, three triangles each, so +624 triangles (+38%). At forest scale +21,840 (+38%).
- **The ground is still ONE draw call on every arm**, at every size and zoom. A coast changes where
  the ground *ends*, never how many meshes carry it, so `the forest's ground is ONE draw call`
  survives this crossing untouched.
- The beach adds **~43% more land area**. That is not a cost — it is the beach — but it is a real
  change to how much of the map is land, and it shows: the island gets visibly rounder, and it
  gets proportionally rounder in *depth* than in *width*, because the beach is isotropic in a
  ground plane that is already squashed 5:1 by the drawing basis.

### Are the three shapes actually three shapes?

Yes, and by a wide margin. Read the differences **against the coast's own footprint**, not against
the frame:

| size / zoom | `outset` vs `project` | `project` vs `subdivide` |
|---|---|---|
| one @ 2 px/unit | 2,778 px = **17.9%** of the coast | 4,252 px = **28.6%** |
| one @ 8 px/unit | 45,156 px = **18.2%** | 67,760 px = **28.4%** |
| forest @ fit | 7,605 px = **17.0%** | 12,471 px = **28.9%** |

Strikingly consistent across sizes and zooms: **~18% of the coast separates `outset` from
`project`, and ~28% separates `project` from `subdivide`.** The step to the full curve is the
*larger* of the two, which is not what "just add a few more vertices" would predict.

### ⚠ Why the per-object denominator is quoted at all

A coast is a thin annulus, so a percentage of the whole frame is the wrong denominator for a
per-object claim — the trap this arc paid for on the shadow increment. Here the *control* and the
*reference* happen to be the same arm, so an arm-vs-control figure already **is** the coast's own
footprint. Where the denominator earns its keep is the arm-vs-arm table above: 45,156 changed pixels
reads as nothing beside a 4,096,000-pixel frame (1.1%) and reads correctly as **18% of the
coastline** beside the coast.

---

## Frame cost — read per row, not per table

Two runs, diffed row by row. **18 of 24 rows agree; 6 do not and are dropped.** The dropped rows are
exactly the rows whose in-run `spread` column was already large, so the spread column is a usable
in-run predictor of a row you should not quote.

Dropped: `one/fit/project`, `one/fit/subdivide`, `forest/2/project`, `forest/2/subdivide`,
`forest/8/none`, `forest/8/subdivide`.

**The one group where all four arms reproduce *and* the whole forest is on screen** — `forest @ fit`:

| arm | run 1 | run 2 | over `none` |
|---|---|---|---|
| `none` | 0.3293 ms | 0.3280 ms | — |
| `outset` | 0.3769 | 0.3743 | +0.047 ms |
| `project` | 0.3721 | 0.3703 | +0.043 ms |
| `subdivide` | 0.4572 | 0.4559 | **+0.128 ms** |

**The full coast costs 0.128 ms per frame on the whole forest — 0.77% of a 60 Hz budget.** The
cheaper shapes save about 0.08 ms of that, which is 0.5% of a frame.

> ⚠ `one @ 8 px/unit` reproduces to four decimals across both runs and is **anomalous anyway**: the
> `none` control comes back at 0.946 ms against 0.50–0.52 ms for all three clipped arms — the map
> with *less* geometry timing nearly twice as slow. Reproducible is not the same as explained, so no
> claim rests on that group. Every other group has `none` fastest, as it should be.

---

## What ships, and what would change it

`SHIPPED_COAST = 'subdivide'` (`packages/forest-world-r3f/src/coast-clip.ts`).

The other two are honest **partial** deliveries and they name what they drop, so shipping one of
them under the name "the coast clip" would be the quiet omission the arc's end-state item 1 forbids.
There is **no flag** — end-state item 6 — and the before/after is `clipToCoast` called with `none`,
the same function one argument apart. If the owner prefers a cheaper shape, that constant is the
whole change.

**Semantics do not move.** Every parcel keeps its capability, its island and its status colour; only
the outermost ones end somewhere else. That is what the fold cap is protecting.

---

## A second bug, caught before it reached a test

Matching the 52 rim vertices to the 208-point curve by **nearest-point search** is the obvious
answer and it is wrong. It agrees with the right answer for 50 of 52 vertices and, at the other two,
lands a vertex **one segment behind its predecessor** — so the arc between them runs 207 segments the
long way round instead of 1, and two boundary parcels swallow the entire coastline.

The failure is invisible from every summary a reader would reach for first: right bounds, right
parcel count, right ring count, right winding, and a picture that is recognisably an island. The
only thing that said so was the island's **summed parcel area**, at **3.0× its true value**.

`coastArcs` uses Chaikin's own arithmetic instead — `B[2i] = ¾A_i + ¼A_{i+1}` composed with itself
puts vertex `i`'s corner chord at curve indices `(4i-2, 4i-1)` — so the arcs partition the curve
exactly once by construction, and there is no search to be non-monotonic.

---

## Known and measured, not swept up

- **`subdivide` emits 6 zero-length ring edges** out of 864 ring vertices on the shipped island —
  inserted curve points that coincide where the outset loop had a very short edge. They triangulate
  to zero-area triangles, which rasterise nothing; they cost 6 triangles and nothing else.
- **The clip is not idempotent and is not meant to be.** Feeding clipped ground back in would find a
  rim made of coast points and outset it a second time. The canvas calls it once, on the mapper's
  own output.
- **The relief still does not fall to the shore.** `landRelief` is an unbounded sum of sines, so the
  new beach stands at whatever height the field gives it. "A landform falling to the shore" is a
  separate component of the treatment and is not this increment.

---

## Files

| picture | what it shows |
|---|---|
| `coast-one-2px-*.png` | one island at the overview zoom — the silhouette read |
| `coast-one-8px-*.png` | one island zoomed in — the shore at 56 delivered px |
| `coast-forest-2px-*.png` | the forest at the overview zoom |
| `coast-forest-8px-*.png` | the forest zoomed in |
| `coast-forest-fitpx-*.png` | the whole forest fitted — **35 islands, 35 different coasts** |

`coast-measurements.md` / `.json` — run 1, the committed numbers.
`coast-measurements-run2.md` — run 2, for the row-by-row diff above.

> The forest pictures carry a finding of their own: the coast wave is seeded on the island id, so
> thirty-five copies of **one** fixture island wear thirty-five **different** coasts. Before the clip
> the forest is one silhouette translated thirty-five times; after it, none of them match. The
> harness test asserts exactly that (`1` distinct shape before, `35` after).

## Reproduce

```
pnpm --filter @storytree/forest-world-r3f exec vite harness --port 5298 --strictPort
DISPLAY=:0 ST_COAST_URL=http://localhost:5298/shipped-coast.html \
  pnpm --filter @storytree/forest-world-r3f measure-shipped-coast
```

⚠ Needs a real GPU — the driver refuses a software rasteriser unless
`ST_COAST_ALLOW_SOFTWARE=1`, and a run that sets it stamps itself in the report.
