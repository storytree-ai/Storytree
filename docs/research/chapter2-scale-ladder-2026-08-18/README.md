# The scale ladder — which land elements actually need a live renderer

`chapter2-code-generated-organic-art-arc` · increment
`scale-ladder-answers-which-elements-need-a-live-renderer` · 2026-08-18

**This pass takes NO appearance verdict.** The look call is the owner's (ADR-0070 stage 2) and
nothing in this directory has standing to sign one. What is delivered is the ladder, the numbers, and
a per-element recommendation that is explicitly non-binding.

---

## Why this instrument, and why its question changed

ADR-0380 (accepted 2026-08-18, owner-directed) retired ADR-0069's no-GPU constraint, named the
Snapdragon X Elite / Adreno X1-85 at 2880×1920 as the acceptance **floor** (D2), recorded
wire-delivery as a standing constraint that binds **raster** specifically (D4), and reopened runtime
3D for the land and its vegetation (D6). It closes by naming this instrument and re-pointing it:

> The scale ladder already recommended on this arc keeps its value and CHANGES ITS QUESTION: it no
> longer asks whether live rendering is permitted, but WHICH ELEMENTS ACTUALLY NEED IT — if 2x
> sprites read well enough for an element, D4 says that is the cheaper answer and D6 obliges no one
> to spend the GPU.

So a single verdict for "the land" would answer the wrong question. Seven elements are measured
separately, and each gets its own rung and its own recommendation.

---

## The answer, in one table

| element | first rung it **reads** | first rung it can **carry an outline** | recommended path |
|---|---|---|---|
| **cell fill** | x1 | x1 | **live / vector** — but see below: not a size argument |
| **rim wall** | x1 | x1 | **sprite** |
| **terrace** | x1 | **x2** | **sprite** |
| **coast** | x1 | x1 | **sprite** |
| **vegetation mark** | x1 | **x2** | **sprite** |
| **flower** | **x2** | **x2** | **sprite** |
| **hero tree** | x1 | x1 | **sprite** (already signed) |

**Nothing in the land needs the GPU on the evidence of this ladder.** Six of the seven elements read
and carry an outline at **x2 or below** — which is exactly the "one more doubling" ADR-0380 D4 says
the sprite path affords. D6 reopened the live path; it obliges no one to spend it, and on these
numbers there is no element whose reading requires it.

**The seventh, the cell fill, is the interesting row, and it is not a size argument at all.** The
settled `b++` land draws a cell interior as one flat status-tinted polygon — that is what "flat green"
means, and it is what the owner cleared on 2026-08-16. Measured here, it delivers **exactly one
colour at every rung, x1 through x8**. So no rung adds interior detail to a cell: its interior is
**resolution-independent**, and everything a rung buys it is boundary, at the square law. That is
precisely the shape a vector or a live path draws for free — and ADR-0380's own Context records that
the shipped map **already renders ground / parcel / territory / tile as SVG**, substituting a raster
only where a sprite sheet covers a node key. So this is less "move the cell fill to the GPU" than
"there is no reason to move it onto raster in the first place."

**The deciding rung for the land as a whole is x2.** Flowers arrive there (they are 2 delivered
pixels across at x1 — below the width the 3×3 majority downsample can be relied on to carry), and
terraces and vegetation marks become able to carry an outline there rather than being *consumed* by
one.

---

## 1. The ladder — `scale-ladder.png`, `scale-ladder-detail.png`

One island (`context-traversal-capture`, the real-corpus healthy island of PR #1382), one code state,
at 1 / 2 / 4 / 8 delivered pixels per ground unit. Every rung is a **fresh Blender render at that
density** — the land's six tile kites and sixteen wall headings, the decor set, the four-species
silhouette set, and the hero tree, all re-rendered — because the increment's own fence says so:
*"Author at each rung rather than upscaling a 1x raster — an upscale measures the upscaler, not the
ladder."*

| rung | authored piece canvas (land / species / tree) | delivered canvas | delivered island px |
|---|---|---|---|
| x1 | 192 / 84 / 128 px | 282 × 347 | 30,477 |
| x2 | 384 / 168 / 256 px | 564 × 694 | 121,218 |
| x4 | 768 / 336 / 512 px | 1128 × 1388 | 483,438 |
| x8 | 1536 / 672 / 1024 px | 2256 × 2776 | 1,931,564 |

Rung 1's **30,477 delivered island pixels** is exactly the figure ADR-0380 states for this island,
reproduced from a raster rendered today — an external agreement check, since that number came from a
different pass. The delivered pixel count then follows the square law to three figures
(×3.98, ×3.99, ×4.00 per rung).

**How a rung is authored rather than upscaled.** `ladder.piece_supersample(k)` renders every Blender
piece at `3k` pixels per ground unit; the compositor reads that back out of each piece set's own
`render-meta.json`, so the supersampled canvas is at `3k` too; and the majority downsample then
divides by **3** rather than by `3k`. Nothing is resampled anywhere, and the 3×3 majority vote that
produces one delivered pixel is the same vote at every rung — which is what makes the four rungs one
pipeline rather than four. `assert_rung_is_authored()` refuses a composite whose piece sets disagree
with the rung it is captioned as; `verify_refusal.py` P1 makes it fire.

---

## 2. The outline probe — `outline-probe.png`

**The land has never had an outline pass.** The hero tree has one — "selective, material-tinted
outline: silhouette rim only, never black" — and every element in the owner's own reference image is
outlined. This adds one to the land, built to the tree's rule: the local colour darkened to 0.72 and
**re-snapped into the closed palette**, never a uniform key-line. (A black outline would also be a
colour the palette does not hold, so the snap would reassign it — the failure that once repainted
2,564 `unknown` rim pixels `healthy` green.)

**Where it is drawn, and the one place it is deliberately not.** An outline pixel sits on a boundary
between two *different drawables* and carries on the one drawn later — the one in front: a plant over
the ground it stands on, a wall against a cell top face, the land against the coast. A **cell top
face against another cell top face is excluded by name**: those two faces are one continuous surface,
and a line between them **is the interior mesh seam the owner removed on 2026-08-16** ("the mess
lines as well add to the noise"). The high-frequency pass reached the same conclusion from the other
direction — a terrace lip at every cell join is that seam wearing a shading model — so reinstating it
under the word "outline" would be the same mistake with better manners.

| rung | outline px | share of the island | of a vegetation mark | of a terrace | of a cell |
|---|---|---|---|---|---|
| x1 | 6,765 | **22.2 %** | **77.8 %** (consumes it) | **55.0 %** (consumes it) | 9.0 % |
| x2 | 15,424 | 12.7 % | 47.2 % | 30.9 % | 5.0 % |
| x4 | 33,190 | 6.9 % | 26.1 % | 16.6 % | 2.7 % |
| x8 | 68,675 | 3.6 % | 13.6 % | 8.6 % | 1.4 % |

**The rung at which the outline first reads as an outline is x2.** At x1 it does not read as an
outline at all: a vegetation mark is 3 delivered pixels across, so 78 % of it lies on its own
boundary and "outline it" and "recolour it" are the same operation. That is the sense in which the
land could not have had an outline before — not that nobody drew one, but that at the shipped density
there is nothing left inside the mark to outline.

`verify_refusal.py` P2 reinstates the cell-to-cell join and measures what the exclusion keeps out, so
it is shown to be load-bearing rather than described as such: outlining every join too takes rung 1
from **6,765 to 8,170 outline pixels, +1,405 px (+20.8 %)**. For scale, the healthy-island pass
measured the interior mesh seams the owner removed at **1,892 px** on this same island — the same
order, and lower here because an outline is drawn on ONE side of a boundary (the drawable in front)
where the seam stroke was drawn on the join itself.

---

## 3. The byte price, against ADR-0380 D4's curve

D4 states: *"The engine's whole committed sprite payload is 805 KB today; roughly 3 MB at 2×, 13 MB
at 4×, 50 MB at 8×"*, under the rule that **raster bytes scale with the square of linear resolution**.
This pass measures **one island's delivered raster** — a strict subset of that payload — so the two
are compared on their **ratios**, which is what the square law actually predicts, and never by
pretending one island's PNG is the whole budget.

| rung | island raster (RGBA PNG) | measured ratio to x1 | square law | D4's stated whole payload |
|---|---|---|---|---|
| x1 | 14,432 B — **14.1 KB** | 1.00× | 1× | 805 KB |
| x2 | 34,184 B — **33.4 KB** | **2.37×** | 4× | ~3 MB |
| x4 | 77,530 B — **75.7 KB** | **5.37×** | 16× | ~13 MB |
| x8 | 177,490 B — **173.3 KB** | **12.30×** | 64× | ~50 MB |

### ⚠ The measured byte price is far below the square law, and this is the pass's biggest surprise

The **pixel count** follows the square law exactly (×4.00 per rung). The **committed bytes** do not:
they grow as roughly **n^1.21**, so x8 costs 12.3× rather than 64×.

The reason is the encoder, not the geometry, and it is worth stating precisely because it does *not*
generalise for free. This is a **closed-palette, flat-tinted** image: PNG's entropy coding gets
cheaper per pixel as the pixels get more locally uniform, and raising the rung is exactly the
operation that makes a flat-tinted land more locally uniform. Two consequences:

* **For this art on the wire, one more doubling is not the ceiling — it is barely a cost.** The whole
  island at **x8 is 173 KB**, which is ~27 % of the *entire* current engine sprite payload, not 64×
  of it. If the rest of the payload behaved like this island, D4's "~50 MB at 8×" would be nearer
  10 MB.
* **The square law is still the right figure for an uncompressed budget** — a GPU texture, a decoded
  frame in memory, or art with more local variety than this island has. Nothing here falsifies D4's
  *rule*; it measures how much slack PNG puts between the rule and the wire for this particular kind
  of art.

### ⚠ D4's 805 KB anchor, re-measured

`packages/app-surface/src/assets` today holds **80 raster files totalling 645.6 KB** — **19.8 % below**
the 805 KB D4 states. Reported, not corrected: the figure may have been taken over a different set
(the studio's `public/art-sheets/` alone hold a further ~3.4 MB, but those are the PixelLab sheets,
not the engine) or on a different day. A reader is owed both numbers rather than the tidier one.
`verify.py` check 14 re-measures it on every run, so it cannot go stale silently.

---

## 4. The per-element answer, with the numbers behind it

### The rule, stated once and applied to all seven

An element **reads** at the smallest rung where its **median instance**:

1. is at least **3 delivered pixels across its minor axis**. Justified by the pipeline, not by taste:
   a delivered pixel is a **3×3 majority vote**, which needs 5 of 9 to carry a value, so structure
   thinner than 3 delivered px is not guaranteed to survive its own downsample. The arc measured
   exactly this as `survival%` in the greenery survey — every *mass* sits at 94–116 %, and only
   structure finer than the vote falls below;
2. delivers at least **2 distinct colours** — one colour is a silhouette with no interior (the arc's
   normals sweep found a tuft's lit band was already one cap at every setting, which is why no
   shading lever could act on it). **This criterion does not apply to an element that is flat by
   construction**, and "flat by construction" is derived from the delivered raster (its class emits
   exactly one authored colour), never declared;
3. and can therefore **carry the outline probe** — one outline pixel, at least one interior pixel,
   one outline pixel.

It **carries an outline** when the outline does not consume it: at most half its delivered pixels lie
on its own boundary.

`verify.py` check 18 **re-applies this rule to the raw numbers** rather than reading it back out of
its own verdict, so the table cannot become a claim about itself.

### The measurements

*median instance px · minor axis px · distinct colours · share of instances delivering nothing*

| element | x1 | x2 | x4 | x8 |
|---|---|---|---|---|
| cell fill (162) | 84 px · 11 · **1** · 0 % | 334 px · 23 · **1** · 0 % | 1,340 px · 45 · **1** · 0 % | 5,340 px · 92 · **1** · 0 % |
| rim wall (35) | 75 px · 9 · 2 · 0 % | 300 px · 19 · 2 · 0 % | 1,204 px · 37 · 2 · 0 % | 4,828 px · 75 · 2 · 0 % |
| terrace (338) | 13 px · **4** · 2 · 2.7 % | 51 px · 9 · 2 · 1.5 % | 203 px · 18 · 2 · 0.9 % | 813 px · 37 · 2 · 0.9 % |
| coast (1, band width) | 5,176 px · **6** · 2 | 21,490 px · 11 · 2 | 87,839 px · 20 · 2 | 354,523 px · 37 · 2 |
| vegetation mark (171) | **11 px · 3** · 2 · 2.3 % | 42 px · 5 · 2 · 1.8 % | 169 px · 11 · 3 · 1.8 % | 675 px · 21 · 3 · 1.2 % |
| flower (10) | **7 px · 2** · 2 · 0 % | 30 px · 5 · 2 · 0 % | 121 px · 11 · 4 · 0 % | 488 px · 21 · 3 · 0 % |
| hero tree (1) | 9,198 px · 117 · 9 | 36,720 px · 234 · 9 | 146,762 px · 468 · 9 | 586,887 px · 936 · 9 |

Two of these agree with figures the arc already holds, which is worth saying because they were
measured by different passes on a different instrument: a **vegetation mark delivers 11 px at x1**
(the arc's "a shrub delivers 11–12 px in a 6×3 box"), and the whole island is 30,477 px.

### How each element is attributed

Every per-element number comes from an **attribution pass**: `compose_land` is run a second time with
its three drawing primitives writing a unique **id colour** instead of an authored one — same
geometry, same painter order, same functions — and the id canvas is majority-downsampled alongside the
colour canvas. So the **colour** says what a pixel is and the **id** says which instance put it there,
and the two are cross-checked rather than assumed: they agree on **97.9 % / 98.9 % / 99.5 % / 99.7 %**
of land pixels across the four rungs, leaving 11–21 delivered pixels unclassified per rung out of
30 k–1.9 M. The rim-wall / terrace split is a **partition asserted at composite time** — every wall
placement must match exactly one of the island's own rim placements or `boundary_walls`' output, and
the composer refuses if any does not.

---

## What this pass deliberately does NOT do

* It **takes no appearance verdict**. That is the owner's (ADR-0070 stage 2).
* It does **not** move `LAND_CAMERA_ELEVATION_DEG`, which is still **20** in
  `packages/forest-world/src/camera.ts` and is checked to be, in `verify.py` check 1. This track
  authors at **50°** as a **named parameter** (owner look verdict, 2026-08-16).
* It touches **no app code**. The whole diff is `docs/research/**` — owner-directed 2026-08-16, and
  not lifted by ADR-0380.
* It does **not** decide whether the SVG map migrates onto a live path, and it re-opens **none** of
  ADR-0380's four fences on D6 (accessibility, determinism-moves-to-the-graph, app-owns-semantics,
  the projection stays 2.5D isometric).
* It adds **no fourth compositor and no second scatterer**. `compose_healthy.py` is imported whole
  with its writes sent to scratch, so its refusals are this pass's refusals; the land comes from
  `compose_core.compose_land`, the palette snap from `compose.back_half`, and the placements from the
  **fixed** positioner (`chapter2-plant-dispersion-2026-08-17`, imported never vendored, with the
  test-count patch landing on `X.S` and not on the alias). `verify.py` check 5 asserts this
  directory defines none of them.

---

## Traps this pass inherited, and what happened to each

* **Determinism is asserted on the DECODED raster.** Rung 1's hero tree is re-rendered here, today, in
  this worktree, and must land pixel-identical on the committed `tree-50` frame the owner looked at
  when they signed the angle. It does: **0 decoded pixels differ**. Reported beside it, and never
  asserted: the file **bytes** were identical too on this run — which is a property of `pixelise.py`'s
  PIL encoder path, *not* a licence to hash-compare, since the arc confirmed live that 0 of 22
  Blender-written land pieces were byte-identical across two pixel-identical runs.
* **The sample count is pinned and stated: 48**, on every rung's land and decor, recorded in each
  piece set's own `render-meta.json` and re-checked by `verify.py` check 25. Never compare a land
  pixel count here against a lane at another value.
* **Footprints are matched.** Every rung composes the *same* island geometry with the *same*
  placements — 717 drawables and 181 placements at every rung, checked — so nothing here is a bigger
  object delivering more pixels.
* **The hero tree occludes cells**, so every per-cell measurement is taken on the composite *before*
  the tree is pasted, and the tree is composited onto a copy afterwards.
* **Body statistics are cut plant-lessly.** The attribution pass answers this exactly rather than
  approximately — a body pixel is one whose *owner* is a cell — and a genuinely plant-less canvas is
  composed anyway at rung 1 as a cross-check: it comes out **larger by 1,819 px** (15,805 vs 13,986),
  which is precisely the footprint the plants later stand on, and the composer **refuses** if the
  difference ever goes the other way. Body luma is cut with the quantiser's `C.W_LUMA` (160.9), never
  Rec.709.
* **A harness that cannot parse its own evidence looks exactly like a guard that did not fire.** Every
  check in `verify.py` runs inside a wrapper that turns *any* exception — a missing file, a renamed
  field, a bad float — into a loud FAIL naming the exception, and the run is refused outright if the
  report will not load.
* **A branch-diff fence tests the branch, not the promise.** The fence check and the no-fourth-copy
  check are written as properties of this directory's *contents*, not as a diff.

---

## Findings that CORRECT or refine what the arc already holds

1. **Byte growth for this art is ~n^1.21, not n².** The square law holds exactly for delivered
   *pixels* and not at all for committed *bytes* on a closed-palette flat land. See §3 — including
   the caveat that the square law remains right for an uncompressed budget.
2. **ADR-0380 D4's 805 KB payload figure measures 645.6 KB today** (80 files under
   `packages/app-surface/src/assets`), −19.8 %.
3. **The cell fill is flat by construction** — one authored colour at *every* rung. No prior pass had
   stated this as a scale property, and it is what turns the cell-fill row from a size question into
   a path question.
4. **Vegetation zero-delivery is 2.3 % at x1**, not the 17.2 % the arc says to quote as the track's
   real-corpus rate. That earlier figure was measured on the *withdrawn* long-grass blade before the
   painter-order fix; this composite uses the four-species silhouette set through the fixed
   positioner, with the painter-order fix in place. Both numbers are true of what they measured — do
   not carry either across.
5. **The land's outline could not have existed before x2**, and the reason is arithmetic rather than
   authorship: at x1 the outline consumes 78 % of a vegetation mark and 55 % of a terrace.

---

## Rebuild / verify

```
python render_all.py          # every piece set + the hero tree, at all four rungs, then compose (~25 min)
python render_all.py --only 2 # one rung
python compose_ladder.py      # compose only, against piece sets already on disk (~30 min at four rungs)
python verify.py              # 29 checks against the committed artefacts — currently 29/29
python verify_refusal.py      # make both guards fire on the real composer — currently 2/2
```

Neither harness is wired to a `pnpm gate` rung, and deliberately: wiring one needs `package.json` and
`gate-order.ts`, both outside this pass's `docs/research/**` fence. They are run by hand, and their
results are quoted above so a reader can tell a green run from an unrun one.

Blender is **5.2.0 LTS** at `C:\Program Files\Blender Foundation\Blender 5.2\`, CPU Cycles, fixed
seed, script-is-truth. `bpy` from PyPI is dead on this machine — use the app's bundled interpreter,
which is what `render_all.py` does.

**The piece rasters are gitignored** (~16 MB across four rungs) and rebuilt by `render_all.py`. Each
set's own `render-meta.json` **is** committed, along with the hero tree's `registration.json` and its
delivered sprite, so the authored density, the sample count and the code state of every rung are
auditable without re-rendering anything — which is what checks 7, 8, 11 and 25 read.

---

## Gaps, stated rather than hidden

* **One island, one seed, one camera (50°), one sample count (48), one status.** Every capability on
  this island is `healthy`, so the per-element numbers are for a single-status surface. The arc
  already knows the confusability ceiling is per-status and that the shadow ladder is *not* admissible
  on a mixed island; nothing here re-opens that.
* **The vegetation is the high-frequency pass's four-species silhouette set (`pieces-species`, #1389),
  which the owner has not yet looked at.** It was chosen over the shipped `pieces-m00-blade` because
  the blade is the *withdrawn* long grass — measuring it would have priced dead art — but that means
  the vegetation rows describe a set still awaiting an owner look. **And a sibling lane landed
  `docs/research/chapter2-shrub-species-2026-08-18/` while this ladder was rendering**, which puts
  two small plants into the shrub slots on top of that same four-species set. This ladder therefore
  measures the set as it stood at #1389, not that newer one; the rungs and the reading rule are
  unaffected, but a re-run against the newer set would move the vegetation row's absolute pixel
  counts.
* **No shadow and no micro-relief in the composite.** Both are separate parked increments with their
  own palette costs; adding either would have varied two things at once.
* **The byte price is PNG-specific.** It is the right measure for what ships over the wire today and
  the wrong one for a GPU texture budget.
* **The outline is a probe, not a proposal.** Its depth (0.72), its one-pixel width and its
  front-object rule are one plausible reading of the hero tree's rule; none of them is swept.
* **Rung 8 is measured but not recommended.** It is on the ladder so the curve has a fourth point,
  not because anything here suggests reaching for it.
