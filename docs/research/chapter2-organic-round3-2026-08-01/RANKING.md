# Round 3 — synthesis and ranking

**Arc:** `chapter2-pixellab-organic-growth-arc` · **Date:** 2026-08-01 · **Author:** round-3 synthesist

The open question this round was called to settle: **does the trunk and canopy read as ONE CONNECTED
ORGANISM while it grows?** Ten prior candidates were judged; nine were rejected. This document ranks
the eight round-3 experiments on that question, recommends three for a hosted comparison lab, names
what to drop, consolidates one shippable path-growth treatment, and states plainly what round 3 did
**not** solve.

Everything below was looked at and re-measured independently. Where the reviewers' text and the
pixels disagreed, the pixels won and the disagreement is recorded in §6.

---

## 0. The measurement that reframes the whole round

Before the ranking, one finding that changes how the scores should be read.

**Seven of the eight round-3 tracks are a single 8-connected component on every frame. The round-1
incumbent the owner already LIKES is not.** I ran an 8-connected flood fill over the incumbent's
alpha masks:

| round-1 tree pose | components | stray sizes |
|---|---|---|
| frame-00 | **2** | 3159 + 50 |
| frame-01 | **2** | 3160 + 67 |
| frame-02 | 1 | — |
| frame-03 | **3** | 4272 + 69 + 4 |
| frame-04 | 1 | — |
| frame-05 | **2** | 6038 + 242 |
| frame-06..08 | 1 | — |

Four of nine incumbent frames ship detached pixels (the grass tuft and the pink flowers) — and the
owner called that track "probably the most" liked.

So: **component count is hygiene, not the answer.** Any experiment whose headline is "every frame is
one component" has proven something necessary and insufficient. What actually reads as one organism
is three different things — branches visibly entering the canopy mass, no silhouette or topology snap
between adjacent frames, and a base that stays planted — and three of this round's experiments won
the component test by *freezing the tree*, which is exactly the technique (exp-3, "slowly revealed
static image") the owner ranked **last**.

The ranking below scores the perceptual question, not the flood fill.

---

## 1. Ranked table

Scores are mine, 0–10, from looking plus re-measurement. **"One organism"** is the open question:
does it read as one connected living thing *while it grows* — not merely per-frame.

| # | experiment | **one organism (while growing)** | style vs SVG island | camera | motion | root stability | verdict |
|---|---|---|---|---|---|---|---|
| **1** | **exp-15 object-rig-v3** | **8** | 3 | 4 | **8** | 6 | **Host.** Best answer to the open question in the round. |
| **2** | **exp-16 leader-repair** | **7** | **8** | 5 | 6 | **8** | **Host.** Best-looking on the island; one fixable cut. |
| **3** | **exp-18 topology-eroded-prior** | **7** | 7 | 5 | 6 | 7 | **Host.** Steadiest silhouette floor; two bad frames. |
| 4 | exp-12 chained-ladder | 6 | 3 | 5 | 6 | 4 | Keep technique. Track not shippable. |
| 5 | exp-17 reverse-ablation | 5 | 6 | 5 | 3 | 9 † | Keep technique. Track is exp-3 in a better mask. |
| 6 | exp-13 crown-inpaint | 4 | 5 | 5 | 2 | 9 † | Keep the junction finding and the path doc. Drop the track. |
| 7 | exp-11 in-context-inpaint | 3 | 2 | **7** | 1 | 8 † | **Drop the track.** Keep the negative finding. |
| 8 | exp-14 pro-reference | 2 | 6 | 4 | 2 | 4 | **Drop the track.** Keep the negative finding + 2 art refs. |

† Root stability of 8–9 here is **tautological**: exp-13, exp-17 and exp-11 do not move the base
because the base is literally the same pixels every frame. Read it as "cannot drift", not "held
steady while growing".

### The supporting measurements (my own, all tracks + the incumbent)

| track | n | min adj-IoU | mean adj-IoU | max area step | lower-trunk axis walk | bottom-3-row anchor swing | components |
|---|---|---|---|---|---|---|---|
| **ROUND-1 incumbent** | 9 | 0.295 | 0.524 | 1.77× | 6.2 px (worst step 5.7) | 0.9 px | 1–3 |
| exp-11 | 5 | 0.080 | 0.336 | **12.56×** | 3.2 px | 1.3 px | 1–2 |
| exp-12 | 12 | 0.296 | 0.546 | 1.59× | 4.2 px | **18.7 px** (16.9 in one step) | 1 |
| exp-13 | 7 | 0.473 | 0.627 | 1.83× | 0.2 px † | 0.0 px † | 1–3 |
| exp-14 | 9 | 0.185 | 0.392 | 1.51× | **16.9 px** (worst step 10.4) | 0.7 px | **1–4** |
| **exp-15** | **16** | 0.232 | **0.666** | 1.88× | 11.9 px (monotone, worst step 2.5) | **0.6 px** | 1 |
| **exp-16** | **19** | 0.279 | 0.592 | **1.27×** | **5.2 px** (worst step 2.1) | 10.6 px | 1 |
| exp-17 | 9 | 0.446 | **0.748** † | 2.04× | 1.8 px † | 0.0 px † | 1 |
| **exp-18** | 9 | **0.552** | 0.655 | 1.59× | 4.5 px | 13.7 px | 1 |

*Adjacent-frame silhouette IoU; "area step" is the largest frame-to-frame alpha-area ratio; the
lower-trunk axis is the silhouette centroid in a canvas-relative band 10–16 % of canvas height above
the contact row; the anchor rule is round-1's own (alpha-weighted x across the bottom three occupied
rows).*

### Per-experiment, in one paragraph each

**1. exp-15 object-rig-v3 — the best answer to the open question.**
Sixteen frames, every one a single component, and unlike the tracks above it in the IoU column the
connectedness is *not* bought by freezing anything: the whole ladder is a v3 interpolation between
two `create_object_state` variants of one `create_1_direction_object` rig, so there is no crown asset
and no trunk asset to mis-register. Watching the contact sheet, this is the only track in the round
that plays as one plant getting taller and putting out leaves rather than a slideshow of trees. Mean
adjacent IoU 0.666 against the incumbent's 0.524, over nearly twice as many frames, at the same
encoded byte budget. Two real problems. First, the "0 px root drift" headline pins a one-to-two-pixel
root tendril; the tree the eye tracks walks **11.9 px left** across the ladder (I measured the
lower-trunk axis at 96.7 → 85.0, monotone, no single step above 2.5 px), so it ends up hanging left
of its own socket. Second, it is round-1's saturated green-and-brown on a pale, desaturated,
flat-faceted plate — composited at 1:1 it reads as a different game's asset. The `create_map_object`
lever that exists precisely to fix that was not pulled.

**2. exp-16 leader-repair — the one the owner will *like* looking at.**
Nineteen frames, one component each, and by a clear margin the best on the island: the sage-and-tan
crown and warm light-brown bark sit inside the plate's own colour family, where every other track
reads as a sticker. It also owns **the best first frame in the entire round** — a genuine two-leaf
cotyledon seedling on a taproot, which is exactly the "grows from nothing" beat exp-4 was rejected
for missing. Gentlest growth curve too (max area step 1.27×, against the incumbent's 1.77×), and the
lower-trunk axis is steadier than the incumbent's on both range and worst step. One defect will stop
the owner cold: **03 → 04**. A bare whip with three rounded seed-leaves becomes a fourteen-leaf
compound sapling with a splayed root fan and a tuft of grass at its foot; adjacent IoU 0.279, the
worst cut in the track, and it sits in the span the README calls its proudest new beat. It reads as a
different plant, which is the same cut the owner has already rejected, relocated. Fixable by
regenerating one span as a continuous pass.

**3. exp-18 topology-eroded-prior — the steadiest silhouette, two bad frames.**
Highest adjacent-IoU *floor* of any genuinely redrawn track (0.552 — nothing ever half-vanishes), a
welded base, and a flat illustrated idiom whose round leaf blobs and unoutlined masses resonate with
the plate's flat facets better than any pixel-art track except exp-16. Frames 03, 04, 06, 07 and 08
are handsome and unambiguously one organism. Two frames spoil it. **frame-00** is the mature tree's
full splayed adult root flare with a small green tuft on top — it reads "old stump resprouting", not
"seedling" — and **frame-05** is a dark flat green slab with bare outlined branches painted *over* it,
sandwiched between two bright articulated neighbours, so at 300 ms it flickers. And the honesty
problem the README misses: adjacent-frame pixel identity climbs 14 % → 17 % → 20 % → 34 % → **46.8 %**
across the track, so the top third really is drifting back toward a masked reveal of one static plate.

**4. exp-12 chained-ladder.** Twelve rungs of genuine descent-chain img2img, every frame one
component, and in frames 07–11 the trunk visibly runs unbroken into the canopy with inner branches
showing through — a real answer. But 04 → 05 is a **lollipop**: six big leaves vanish and a leaf-ball
rosette appears on a stick, which is the "blob on a pole" already rejected. The base is a thin spidery
claw that touches the contact row in three pixels, and under round-1's own anchor rule the root swings
**18.7 px** with 16.9 px of it in that single step. Palette is far outside the island's family. Keep
the descent chain as a technique; do not ship this track.

**5. exp-17 reverse-ablation.** Perfect per-frame connectivity, zero drift, zero partial alpha — and
it does not grow. I verified the root region (y ≥ 150) is **byte-identical, 1114 px, on frames 1
through 8** — eight of nine frames — and the branch armature is 99 % complete by rung 3. Six of nine
rungs are a canopy wipe over a frozen tree. That is exp-3 wearing a better mask. Frame-00 is a green
sea-urchin on adult root claws; rungs 3–5 wear a flat parasol top the README claims it fixed. The
*technique* deserves the next spend — pointed at art the owner already accepted, at zero generation
cost, as the README itself proposes — but the delivered track is the failure family the owner ranked
last.

**6. exp-13 crown-inpaint.** The best *junction* in the round: because the crown is inpainted into
the trunk's own raster there is only ever one image, and at 5× the trunk outline runs continuously
into the foliage with limbs passing under the canopy edge. Then it fails on everything else.
Frame-00 is **a sawn stump with visible growth rings on the cut face** — the first thing the owner
sees says "felled tree". The trunk never grows: I measured the lower half (y ≥ 120) as **100.0 %
identical** across 03→04 and 04→05 and 99.2 % across 05→06, so girth is one frozen raster being
progressively un-cleared. The canopy shrinks 01→02 and flips from a solid cap to five pompoms.
Drop the track; keep the junction finding, and keep its path-growth doc, which is the best in the
round (§4).

**7. exp-11 in-context-inpaint.** The only track in the round that inherits the plate's actual camera,
because it was drawn *inside* the plate — and it produces the single best hero-tree still anyone has
made here (frame-04). But it is not a track. Five frames are effectively three keys, with a **12.56×**
area step from a twig to a full bushy tree, a trunk that materialises between frames, and buttress
roots that appear only at the last frame. Worse, the technique destroys the map it draws into: from
s04 onward every raw return replaces the island under the tree with a white plate, a bleached oval,
and finally a grey-and-white **tiled floor** that exists nowhere in the plate. The extraction throws
that away, which is why the delivered tree meets the tan with a hard edge and no contact shading at
all, and why the premise cannot be scaled past ~25 % mask fraction. Composited in-plate it is a dark,
dense-stipple dome on a pale watercolour map — the worst style match of the eight.

**8. exp-14 pro-reference.** Nine beautiful trees, and nine *different* trees: the trunk leans right,
straightens, thins by 44 %, thickens, halves again, then becomes a flat umbrella acacia and finally a
stacked-lobe oak, while the lower-trunk axis relocates **16.9 px** with a 10.4 px worst step and a
quarter to two-thirds of the pixels vanish at every beat. And the README's flat claim that every frame
is one drawn object is false: **frame-03 ships four components** — the tree at 2911 px plus three
fully detached green clumps of 126, 75 and 54 px floating in transparent space (my own flood fill).
That is the arc's named "floating canopy" failure, undisclosed. The greens are genuinely calm and
frames 05 and 07 are worth keeping as art references; the negative finding (`reference_images` on
`create_image_pro` is a subject/style *hint*, not geometry to preserve) is the most valuable single
result in the pool. The track is a slideshow.

---

## 2. Top three for a hosted in-app comparison lab

Host **exp-15**, **exp-16** and **exp-18** side by side against the round-1 incumbent, on the real SVG
island, at the real camera, with Next/Back/Replay. They are chosen to be *different answers*, not
three flavours of one.

**Slot 1 — exp-15 object-rig-v3. Earned on motion and on the open question itself.**
It is the only track where connectedness is structural rather than post-processed and where the
sequence still plays as growth: one rig, two authored states, sixteen interpolated frames, one
component each, mean adjacent IoU 0.666. Put it in the lab because it is the strongest available
answer to the question the round was called to settle.

**Slot 2 — exp-16 leader-repair. Earned on style, on the seedling, and on gentleness.**
It is the only candidate that looks like it *belongs* on the pale island, the only one that opens on a
true two-leaf seedling, and it has the smallest maximum growth step in the round. Put it in the lab
because it tests whether the owner's stated objections ("fades in rather than grows from nothing",
"the island must be reworked") are answered by palette and pacing rather than by rig topology.

**Slot 3 — exp-18 topology-eroded-prior. Earned on silhouette steadiness and on being a third idiom.**
Nothing half-vanishes between its frames (IoU floor 0.552, the best of any redrawn track) and its flat
vector-ish leaf blobs are a genuinely different art language from the other two. Put it in the lab as
the control for "does flat, low-detail art read as more connected than high-detail art?" — a question
none of the other seven isolate.

### Do any of them beat the round-1 provisional leader?

**Yes — but on different axes, and none of them sweeps.**

| axis | winner | margin |
|---|---|---|
| **Motion smoothness** | **exp-15** | mean adjacent IoU **0.666 vs 0.524**, over 16 frames instead of 9 |
| **Gentlest growth step** | **exp-16** | max area step **1.27× vs 1.77×** |
| **Silhouette floor (no half-vanishing)** | **exp-18** | min adjacent IoU **0.552 vs 0.295** |
| **Style match to the SVG island** | **exp-16** | the only track whose crown highlights and bark sit inside the plate's own warm-neutral family; drops the incumbent's grass-and-flowers base clutter |
| **First frame reads as a seedling** | **exp-16** | true two-leaf cotyledon vs the incumbent's already-leafed sapling — the exact exp-4 complaint |
| **Trunk-axis steadiness** | **exp-16** | 5.2 px range / 2.1 px worst step vs **6.2 px / 5.7 px** |
| **Per-frame connectedness** | exp-15 / exp-16 / exp-18 | 1 component always, vs the incumbent's 2–3 on four frames — *but see §0: this is not the axis the owner is judging* |
| **Camera** | **nobody** | all four are front elevation; the plate is low top-down |
| **Worst single cut** | **incumbent** still loses to exp-15 | exp-16's 03→04 (IoU 0.279) is marginally *worse* than the incumbent's worst (0.295); exp-15's worst after the opening step is 0.46 |

The honest summary for the owner: **exp-15 beats the incumbent on how it moves; exp-16 beats it on how
it looks and where it starts; neither beats it on both, and exp-16 introduces one cut slightly worse
than anything in the incumbent.** That is precisely why this belongs in a lab rather than in a
recommendation to replace the leader today.

---

## 3. Drop outright

**exp-14 pro-reference — drop the track.** It fails the open question harder than anything else in the
pool (nine species, 24–64 % of pixels vanishing per beat, the trunk relocating 16.9 px) *and* it ships
the arc's named floating-canopy defect while denying it: frame-03 carries three fully detached foliage
clumps of 126, 75 and 54 px, which I confirmed with my own 8-connected flood fill and which appear
nowhere in its README. Do not host it; a reviewer or the owner finding an undisclosed floating crown
would rightly discount everything else in the folder.
*Keep:* the negative finding that `create_image_pro`'s `reference_images` is a subject/style hint and
not geometry to preserve — it is the reason the chained-ladder recipe the brief prescribed cannot work
through that tool, and it was paid for. Keep frames 05 and 07 as art references only.

**exp-11 in-context-inpaint — drop the track.** Five frames that are three keys, a 12.56× single step,
a trunk that materialises and roots that appear at the last frame. It is not a growth track and its
own README says so. More decisively, the technique **destroys the map it draws into**: above roughly
25 % mask fraction `create_map_object` stops inpainting an object and starts continuing terrain,
returning white plates, bleached ovals and a grey-and-white tiled floor that exists nowhere in the
island. The extraction gate discards 34–45 % of the model's changed pixels to survive that, which is
also why the delivered tree meets the ground with no contact darkening at all.
*Keep:* frame-04 as the best single hero-tree still the arc has produced; the finding that
`create_map_object` collapses into terrain-continuation when handed a custom mask but works from the
built-in oval fraction; and the observation that it is the **only** route so far that inherits the
plate's camera and light.

**exp-13 crown-inpaint — drop the track, keep two things.** A sawn stump for a first frame and a trunk
that is 100 % pixel-identical from frame 03 onward is not a growth track. But its crown-into-trunk
junction is the cleanest in the round, and its `path-growth.md` is the document §4 is built on.

Nothing else should be dropped: exp-12 and exp-17 both bought real, reusable technique findings and
should be carried forward as methods even though neither track ships.

---

## 4. Consolidated path-growth recommendation

All eight proposals name the same machinery. Six of them get at least one load-bearing thing wrong.
This is the one treatment the lab should actually ship, assembled from the parts that survive
verification. **Every file, symbol and line number below I opened and confirmed in the main checkout.**

### The beat

**The trail draws on first, growing outward from the arriving island along its real `depends_on`
edges; the coast, ground and tree then arrive into a path that is already there.** (exp-13's ordering
variant — the causal arrow the right way round for a dependency graph, and the only variant that
tests ordering alone with no new art to confound the verdict.) It costs **zero generations**, which
matters: the round-3 pool is exhausted.

### The machinery it rides — verified

- `packages/app-surface/src/trailReveal.ts:150` — `arrivalGrowPlan(network, arrivalIds)`; pure,
  deterministic, unit-tested in `trailReveal.test.ts`.
- `packages/app-surface/src/trailReveal.ts:24` — `REVEAL_STAGGER_MS = 350`.
- `packages/app-surface/src/WorldSceneView.tsx:20` — `WorldPresentationModel.reveal: TrailRevealPlan | null`;
  optional input at `:41`; `reveal: input.reveal ?? null` at `:70`; handed to the scene context at `:110`.
- `packages/app-surface/src/SceneView.tsx:294-296` — `revealClass()` stamps ` is-growing`;
  `:682` masks the selection lane; `:805-811` sets `props.mask = url(#trail-m-<id>)` and
  `props.strokeWidth = trailFillWidth(seg.revealedUsage) + widen`.
- `packages/forest-world/src/routing.ts:103` — `trailFillWidth(usage) = 1.2 + 1.8 * Math.sqrt(usage)`.
- `apps/studio/src/index.css:1829-1858` — `.trail-fill.is-growing` / `.trail-ghost.is-growing`,
  `.trail-reveal-mask` (`stroke-dasharray: 1; stroke-dashoffset: 1;
  animation: trail-reveal-grow 0.35s ease-out both`), `.from-end` at `-1`, and the
  `prefers-reduced-motion` branch that lands the trail already drawn.

### The gap — it is NOT one line

**The `<mask id="trail-m-…">` elements are emitted in exactly one place in the repo:**
`apps/studio/src/components/TreeView.tsx:2682`, inside TreeView's own `<defs>`.
`SceneView.tsx` only ever *references* those ids, and its own docblock (~`:968`) states the contract:
*the caller supplies the `<svg>` shell + `<defs>`*. The Chapter 2 witness renders through
`SemanticGrowthWorldView.tsx:369`, which emits a bare `<svg viewBox={viewBox}>` with **no `<defs>`**.
Setting `reveal` alone would attach `mask="url(#trail-m-…)"` to paths whose mask element does not
exist in that DOM — SVG renders an unresolved mask reference unmasked, so the trail would appear
fully drawn from frame one: the exact bug, now with dead wiring behind it and nothing red to show
for it.

### Ship this — two changes plus a fixture line

**A. Port the defs (~25 lines, the red→green unit).**
In `packages/app-surface/src/SemanticGrowthWorldView.tsx`, inside the `<svg>` at `:369`, emit a
`<defs>` when `model.reveal` is non-null, containing one mask per plan segment, composed **verbatim**
from `TreeView.tsx:2675-2698`:

```tsx
<mask id={`trail-m-${seg.id}`} maskUnits="userSpaceOnUse"
      x={-100000} y={-100000} width={200000} height={200000}>
  <path d={d} pathLength={1}
        className={`trail-reveal-mask${seg.fromEnd ? ' from-end' : ''}`}
        style={{ animationDelay: `${seg.delayMs}ms`,
                 strokeWidth: trailFillWidth(seg.revealedUsage) + 8 }} />
</mask>
```

`RevealSegment` carries `{ id, delayMs, fromEnd, dir, revealedUsage }` — **not** `d`. TreeView
resolves `d` through a `trailSegById` map built from `world.trails.segments`. The witness should
resolve it off the scene instead of taking a new prop: `SceneView.tsx:682` already reads `id` and `d`
off the trail children, so the scene carries both. **Red test today:** a witness frame with a non-null
`reveal` renders zero `<mask>` elements.

**B. Set the plan on the arrival frame only (the fixture line).**
In `apps/studio/src/components/SemanticGrowthDemo.tsx`, `baseWorld.trails` is already in scope — it is
used at `:282` for `neighbourHighlightPlan(baseWorld.trails, DEMO_STORY_ID)`. Add:

```ts
const growPlan = arrivalGrowPlan(baseWorld.trails, new Set([DEMO_STORY_ID]));
```

and pass `reveal: growPlan` on the **`proposed` frame's model only**.

> **Correct exp-13 here.** Its doc places the beat on the continuous `organicPlayback.progress` axis
> at `[0.04, 0.18)` and wires it through `narrativeModel()`. That is a category error: `reveal` is a
> per-frame field on the **discrete** six-key cursor (`assertFrames` in
> `SemanticGrowthWorldView.tsx:75` requires empty/land/proposed/claimed/signed-proof/healthy), while
> `narrativeModel()` serves `proposed` onward — the `empty` and `land` frames, the ones that would
> correspond to progress < 0.18, are built by bare
> `normalizeWorldPresentationModel({ scene: emptyScene() })` at `:383-390` and would never receive the
> plan. The mask animation fires on **mount**, so putting the plan on `proposed` alone plays the beat
> exactly once, at the arrival, and every later frame (`reveal: null` ⇒ no mask) simply paints the
> trail fully drawn. That is both correct and simpler than a progress window.

**C. No CSS change and no constant change.** The animation, the `from-end` variant and the
reduced-motion settlement already exist. **Do not touch `REVEAL_STAGGER_MS`** — it is shared with the
live studio map and `trailReveal.test.ts:63/159/168/169/241` hard-asserts the current law. If the
witness sweep needs a faster beat, scale `delayMs` on the way in as a pure transform of the plan
object and rebuild `byId`; no engine change.

### Explicitly rejected from the pool

- **"One line of fixture wiring"** (exp-14, exp-15, exp-17, and exp-16's headline). False — see the
  gap above. exp-13 and exp-18's reviewer caught it; the rest did not.
- **exp-18's length-proportional delay law.** It reads `ref.lengthUnits`, which does not exist:
  `TrailEdgeOut.segments` is `readonly { id: string; reversed: boolean }[]`
  (`routing.ts:81`) and `TrailSegment` is `{ id, d, points, usage, hidden }` (`routing.ts:60-66`); a
  length must be summed from the segment polyline. It also claims to be "covered by the existing
  `trailReveal.test.ts`" when `:241` hard-asserts the very law it replaces, and its worked example
  (~2.9 s per hop) is 2.4× outside the clamp in `laneDrawSeconds` — `Math.max(0.28, Math.min(1.2, …))`
  at `SceneView.tsx:697-698`.
- **exp-12's `create_path_tiles` junction/fork decals.** The proposed placeable tiles are largely
  opaque generated ground with a chopped border; stamping one drops exactly the "ground plate" the
  owner rejects onto the map. Its diagnosed "dark seam" is also mis-stated — the 160 px band per tile
  is **alpha 0**, so the tiled artefact is a transparent gap, not a dark grid line. The
  `tile_depth_ratio 0` remedy is right; the asset is not needed for increment A and the generation
  budget to retry it no longer exists (that call hard-failed mid-flight with "run out of generations").
- **"The machinery is never switched on."** Overstated in several docs. `TreeView.tsx:2374-2375`
  already calls `arrivalGrowPlan` and `:2449` already passes `reveal: growPlan` — the live studio map
  **has** this beat. Only the Chapter 2 witness is unwired, which is what the brief actually said.

---

## 5. What round 3 did not solve

The owner has rejected nine of ten prior candidates. Here is what is still broken.

**1. The camera. Nobody met constraint 5, and nobody flagged it as a blocker.**
The reference plate is a low top-down / 2.5D isometric with visible top faces and side depth. All
eight tracks are front elevation with roots splayed flat left-to-right in the picture plane. exp-15
literally sent `view: "top-down"` to `create_1_direction_object` and got side elevation back; the CLI
plainly accepts `"low top-down"` (the scuff probes used it) and it was not tried on the tree. On the
island every one of these reads as a cardboard standee on a tabletop map. The only track that
inherits the plate's camera is exp-11 — because it was drawn *inside* the plate — and that is the
track whose technique destroys the plate.

**2. The style problem is one experiment deep, not eight.**
Only exp-16 lands convincingly inside the island's colour family; exp-14 and exp-18 are close. The
plate is pale, ~0.10 saturation, flat-faceted, with a cream halo and no pixel darker than about 110
luminance. Most tracks answer with saturated pixel art and hard dark outlines. `create_map_object` —
the single lever the brief identified as strongest for exactly this — was pulled by exactly one
experiment, where it collapsed into terrain continuation. `edit_image` (one consistent palette edit
across a whole track, cost per call not per frame) was **never used by anyone**. The cheapest untried
fix in the whole arc is still untried.

**3. Nobody generated a continuous seedling→sapling span.**
exp-16 spliced one and produced its worst cut. exp-11 jumped 12.56×. exp-13, exp-17 and exp-18 all
begin from an adult root system with a tuft on top, which is why their first frames read "stump",
"urchin" and "resprouting stump" rather than "seedling". The one genuinely good seedling in the round
(exp-16 frame-00) is not continuous with the tree it becomes.

**4. Three of the eight won connectedness by freezing the tree.**
exp-13's trunk is 100 % pixel-identical from frame 03; exp-17's root system is byte-identical across
eight of nine frames and its branch armature is 99 % complete by rung 3; exp-18's adjacent-frame
identity climbs to 46.8 % by the end. That is exp-3 — "slowly revealed static image", "cheap" — the
technique the owner ranked **last**, rediscovered three times with better masking. Round 3 did not
establish that connectedness and growth can be had together; it established that each is easy alone.

**5. The open question is not actually settled, because the metric everyone optimised is the wrong
one.** See §0: the incumbent the owner likes ships detached pixels on four of nine frames. "One
connected component" is not what he is judging. No experiment measured the thing he *does* respond to
— branches visibly entering the canopy mass, and no topology snap between adjacent frames — and the
two experiments that score best on component purity score worst on motion.

**6. No planting cue survived.** The incumbent's grass tuft and pink flowers were doing real work:
they read as *planted*. Round 3 mostly deleted them (correctly, per ADR-0274's no-ground rule) and put
nothing in their place. No track darkens the ground where it meets it. Several now read as standing on
stilts (exp-12's spidery claw touches the contact row in three pixels) or as hovering (exp-11's
declared socket at y=100 is hit by no frame; every frame contacts at y=96 or 98).

**7. Root "stability" is being measured under rules chosen to make it look stable.** Three tracks
report 0 px because their base is the same raster every frame. exp-16 reports 0.494 px from a band
explicitly placed above the root spread — under round-1's own bottom-three-row rule it is 10.6 px.
exp-15 reports 0 px while its trunk axis walks 11.9 px left. A single agreed anchor rule for the arc
would be worth more than another round of art.

**8. Nothing here is attested.** This is a LOOK verdict and no owner has looked. Every score in §1 is
mine.

**9. The budget is gone.** The pool ran from ~1771 to **31 of 2000** remaining. exp-12's second
`create_path_tiles` call hard-failed in flight with "You have run out of generations and credits", and
exp-16 stopped work at 31 remaining. The obvious next moves — `edit_image` palette-matching a whole
track in one call, a `create_map_object` retry at a low mask fraction, regenerating exp-16's 03→04
span — all need a top-up before round 4 can start.

---

## 6. Discrepancies found — reviewer, README and my own

Nothing smoothed over. Items marked **[mine]** are ones I measured myself this pass.

### README claims that are false

1. **[mine] exp-14 — "every frame is one drawn object / floating crown absent" is FALSE.**
   `frames/frame-03.png` ships **four** 8-connected components: 2911 px (the tree) plus **126, 75 and
   54 px fully detached green clumps**. Confirmed by my own flood fill. This is the arc's named
   floating-canopy defect, undisclosed. Every other exp-14 frame is genuinely 1 component.
2. **[mine] exp-13 — the trunk does not grow.** Lower half (y ≥ 120) union-identity: 94.4 % at 02→03,
   **100.0 %** at 03→04, **100.0 %** at 04→05, 99.2 % at 05→06. The trunk is one frozen raster being
   progressively un-cleared, and the README sells that freeze as a strength without naming the risk.
3. **[mine] exp-13 — "one image" is not literally true.** frames 04 and 05 carry stray components
   (`[9382, 5, 1]` and `[12031, 5, 1]`). Invisible at 1:1, but it is 6 px the README does not mention.
4. **[mine] exp-17 — the root system never changes.** y ≥ 150 is **byte-identical at 1114 px on frames
   1 through 8**. Eight of nine frames. Not disclosed anywhere in the README, which reports ablation
   purity as its headline instead.
5. **[mine] exp-16 — "no grass, soil, pebbles or flowers in any delivered frame" is FALSE.** Green
   pixels in the root zone of the *delivered* frames: 21 px (frame-04), 17 (05), 9 (06), 7 (07), plus
   speckles in 01, 03, 09, 10, 11 and 14. The de-ground call only touched three source poses.
6. **exp-13 — "style pop: fixed" is FALSE.** Max frame-to-frame foliage luminance jump went 40.6 → 38.3,
   a 5.7 % improvement; the round-1 track the owner likes sits at 14.5. It pulses 2.6× worse.
7. **exp-12 — the headline finding is refuted by its own unreported returns.** `probe-gp260-34bf37a2`
   and `probe-gp200-b6a2eac6` sit in `raw/`, appear in no table, and grew the seedling +25.2 % and
   +27.0 % in area at strengths 260 and 200 — inside the band the README says only repaints in place.
8. **exp-14 — "no vendor call, credential, hostname or asset-owned clock is anywhere in this
   directory" is FALSE in part.** `api.pixellab.ai` is committed in 13 `work/log-*.txt` download URLs
   and `manifest.json` carries a `pixellab.ai` terms URL. The *credential* half is true — no token
   anywhere. (No runtime vendor call exists in any experiment; ADR-0274 D1/D6 compliance is otherwise
   clean across all eight.)
9. **exp-15 — "height is monotone 82 → 165 px" is FALSE.** Height peaks at 169 px on frame 10 and then
   drops 4 px and oscillates for the last five frames. Width and area are monotone.
10. **exp-15 — "same byte budget" hides a 1.78× decode jump.** 143,706 encoded (true, vs round-1's
    144,006) but 2,359,296 decoded vs 1,327,104. ADR-0274 D4 asks for a byte/decode budget; the
    shipped `registration.json` omits `decodedRgbaBytes` entirely.
11. **exp-16 — "the one remaining cut is 14→15" is wrong.** Measured, 14→15 is IoU 0.717, one of the
    better transitions. The worst cut in the track is **03→04 at 0.279** — the beat the README presents
    as its proudest new work.
12. **exp-17 — "the guillotine is gone" is FALSE.** 32.8 % / 48.9 % / 43.4 % of crown columns on rungs
    3/4/5 top out within ±2 px of one height, against 9.2 % for the natural mature crown. Reduced,
    not eliminated, and plainly visible at 5×.
13. **exp-18 — "topology mutation absent by construction … literally the same pixels at every age" is
    FALSE for the shipped frames.** 6.6–25.9 % of each frame's wood pixels are absent from the next;
    whole 611 px and 703 px lower-canopy lobes vanish at 05→06 and 06→07.
14. **exp-18 — "the direct rebuttal to exp-3" is measured against the wrong baseline.** Against the
    static source plate, frames 06/07/08 are 41.8 % / 55.4 % / 70.8 % pixel-identical. The top third
    of the track *is* substantially a masked reveal. **[mine]** adjacent-frame identity independently
    confirms the trend: 14 % → 17 % → 17 % → 15 % → 16 % → 21 % → 34 % → **46.8 %**.

### Metrics that are true but chosen to flatter

15. **[mine] exp-16's 0.494 px root drift is band-defined.** The anchor band sits 22–32 px above the
    ground row, explicitly so a changing root spread cannot move it. Under round-1's own
    bottom-three-row rule the anchor swings **10.6 px**, all of it in the 03→04 step, and the visible
    root footprint goes 51 → 75 px wide in that one frame.
16. **[mine] exp-15's "0 px root drift" pins a two-pixel tendril.** I confirm the bottom-3 anchor at
    0.6 px — and I also measure the lower-trunk axis walking **96.7 → 85.0 px, 11.9 px monotone left**,
    with the canopy centroid following it. The tree ends up hanging left of its own socket.
17. **exp-14's "0 px on every frame" is real and reproducible but rule-dependent** — the visible
    contact column still moves 10 px and the root fan is redrawn every beat. **[mine]** the lower-trunk
    axis relocates 16.9 px with a 10.4 px worst step, the largest in the round.
18. **exp-17's "0 px drift" and exp-13's "0.0000 px" are tautological** — the base is the same pixels.
19. **exp-12's, exp-14's and exp-18's monotonic-area proofs cannot detect the failure they rule out.**
    Area grows while pixels vanish elsewhere; exp-14 loses 24–64 % of each frame at the next beat while
    reporting monotone foliage growth.

### Where I disagree with a reviewer

20. **[mine] exp-18's root drift does not reproduce at 0.95 px.** The reviewer reports the
    alpha-weighted contact centroid spanning 95.53–96.49. Alpha is strictly binary in these frames, so
    weighting cannot change the result, and I measure the bottom-three-row anchor spanning
    **87.6 → 101.3 (13.7 px, worst step 9.9)** and the bottom contact *row* centroid spanning
    **72.5 → 114.0 (41.5 px)**. In fairness to the track: the contact row holds only 2–14 pixels so the
    centroid is noisy, the bottom row is y=188 on every frame (zero vertical drift), and the root mass
    overlaps heavily — the base *looks* planted. But 0.95 px is not a number I can reproduce, and the
    lower-trunk axis (4.5 px) is the honest figure to quote.
21. **[mine] exp-11's canopy overhang is real but smaller than reported.** The reviewer reports 14 % of
    frame-03 and 18 % of frame-04 off the island. Compositing at the declared origin (52,50) and
    classifying land + coast, I measure **3 % and 2 %**. Looking at the 4× in-plate composite, the
    crown's right lobe *is* visibly out over the pale hex field on both frames — the defect is real and
    the owner would see it; the magnitude is disputed. What is not disputed and matters more: the trunk
    meets the tan with a hard edge and **zero contact shading**, because the palette gate discards the
    34–45 % of returned pixels that were the model's invented floor.
22. **[mine] exp-11's style match should be scored lower than 6.** Composited at 1:1 it is the darkest,
    densest, highest-frequency object in the pool on the palest plate — a stipple dome with no
    luminance overlap with the land it stands on. I score it 2. Conversely **exp-16 deserves better
    than 5** (I score 8) and **exp-14 better than 5** (I score 6): both are visibly calmer against the
    plate than the incumbent.
23. **[mine] exp-17's "24 of 25 colours shared with the round-1 track" is a match to the round-1
    *tree*, not to the island.** Those are different questions, and the island is the one the brief
    asked about. On the plate exp-17 reads roughly at incumbent parity, not at 7/10.

### Path-growth documentation errors

24. **"One line of fixture wiring"** — asserted by exp-14, exp-15, exp-17 and in exp-16's headline.
    **[mine]** false: `grep -rn "id={\`trail-m-"` across `apps/` and `packages/` returns exactly one
    hit, `apps/studio/src/components/TreeView.tsx:2682`, and `SemanticGrowthWorldView.tsx:369` emits a
    bare `<svg>` with no `<defs>`. It is ~25 lines of ported JSX plus the fixture line.
25. **exp-13's progress-window wiring targets the wrong seam.** `reveal` is a per-frame field on the
    discrete six-key cursor; the `empty` and `land` frames use bare `normalizeWorldPresentationModel`
    and would never receive it. Its snippet also references an undefined free variable `growing`.
26. **exp-18 invents `ref.lengthUnits`. [mine]** confirmed absent: `TrailEdgeOut.segments` is
    `{ id, reversed }[]` and `TrailSegment` is `{ id, d, points, usage, hidden }`.
27. **exp-18's "covered by the existing `trailReveal.test.ts`" is backwards. [mine]** `:241` hard-asserts
    `delayMs === REVEAL_STAGGER_MS`; the proposed law turns it red. Its LANE_DRAW_SPEED precedent also
    omits that `laneDrawSeconds` is clamped to `[0.28, 1.2]` (`SceneView.tsx:697-698`).
28. **exp-12's path-tile "dark seam" is a transparent gap.** The 160 px band per tile is alpha 0; the
    black bars in its own evidence image are the demo's `#000000` backdrop showing through. And its
    recommended junction/fork decals would stamp opaque generated ground plates onto the map.
29. **"The machinery is never switched on" is overstated. [mine]** `TreeView.tsx:2374-2375` calls
    `arrivalGrowPlan` and `:2449` passes `reveal: growPlan`; the live studio map has the beat. Only the
    Chapter 2 witness is unwired.
30. **Line-reference rot, minor:** exp-12 cites `WorldPresentationModel.reveal` at
    `WorldSceneView.tsx:61` (it is `:20`); exp-13 cites `neighbourHighlightPlan` at `:283` (it is
    `:282`); exp-18 cites the hard-coded 0.35s at `index.css:1838` (the declaration is at `:1844`).
    Every other citation I spot-checked across the eight docs was exact — the code grounding in this
    round is unusually good.

### Provenance gaps

31. **exp-11** records no cost, only a 2×-wide guess (~420–840); "model" is recorded as a tool name
    with no model id; 8 of 21 calls carry no seed because `create_map_object` exposes none.
32. **exp-14's** "18 calls × 25 generations = 450" is arithmetic, not a receipt; no log line carries a
    cost or balance. The brief's own range gives 360–720.
33. **exp-15** records cost for 5 of 10 calls and no model identifier anywhere, though its sibling
    `manifest.json` format expects one; and its frame-00 is a locally downscaled pose echoed back by
    `keep_first_frame:true`, listed in the per-frame table as if it were a model return.
34. **exp-12** leaves `create_path_tiles` unpriced ("20–40, the API does not itemise").
35. **exp-17** honestly records ~60 generations wasted on duplicate submissions whose job ids a shell
    pipeline swallowed — the best-disclosed provenance failure in the round.

---

## 7. Recommended next actions

1. **Stand up the comparison lab** with exp-15, exp-16, exp-18 and the round-1 incumbent, on the real
   plate, at the real camera, with Next/Back/Replay. This is an operator-attested leg — hand the owner
   a working URL, not a command.
2. **Ship the path-growth beat from §4** alongside it. Zero generations, real red→green unit, and it
   is the missing beat the brief called out.
3. **Top up the generation pool** (31 of 2000 remain). Then, in priority order:
   **(a)** one `edit_image` call to palette-match exp-15's whole track to the plate — untried by anyone,
   cost per call not per frame, and the single cheapest test of whether style is separable from rig;
   **(b)** regenerate exp-16's 03→04 span as one continuous pass and re-run its de-ground call over
   frames 04–07;
   **(c)** re-test `create_map_object` at a mask fraction under 25 %, where exp-11 showed it still
   inpaints an object instead of continuing terrain — it remains the only route that inherits the
   plate's camera.
4. **Fix the arc's anchor rule** before round 4. Three different definitions produced 0 px, 0.494 px
   and 13.7 px on the same kind of artefact. Adopt round-1's bottom-three-row alpha-weighted rule as
   the single reported number, and report the lower-trunk axis walk beside it.
5. **Stop reporting component count as the headline** (§0). Report instead: branches-entering-canopy
   adjacency, worst adjacent-frame silhouette IoU, and the lower-trunk axis walk.
