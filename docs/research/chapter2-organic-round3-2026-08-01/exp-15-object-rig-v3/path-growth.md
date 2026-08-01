# exp-15 path-growth treatment — **the footfall path**

> Segments appear as if walked, one step at a time, growing outward from the island that just
> arrived. **It needs zero new assets and zero new engine code — only a prop that is already
> declared and already unit-tested but never passed.**

## 1. The treatment

When a story island is PLACED, its direct incident trails do not fade or slide in. They **walk**:
the first segment leaving the new island draws on from the island end outward, and only when it
finishes does the next segment in the chain begin — one footfall per segment, 350 ms apart, always
travelling away from the arrival. Nothing else on the map redraws; trails elsewhere stay statically
drawn, so the eye is pulled to exactly one thing.

Ordering, for this experiment's variation: **island settles → path walks out → the tree grows on it.**
The island is the ground, the path is the arrival being connected to the forest, and the hero tree is
the story maturing on land that is already reachable. The path beat therefore runs *between* the
island's accretion (experiment 6's control) and frame 00 of `frames/` — it is a separate, sequenced
beat, not a simultaneous one.

Why "footfall" is the right read and not a decorative one: a trail in this app is a **routed shared
segment network**, and the segment boundaries are real — a trunk carried by several edges is one
segment, and `arrivalGrowPlan` folds concurrent reveals so the earliest draw-on wins. Stepping
segment by segment therefore narrates the actual topology, which is the ADR-0169 §5 honesty
invariant: the plan is a subset of REAL edges, never invented.

## 2. The exact existing machinery it rides

Everything below is already built, already shipped and already tested. **The Chapter 2 witness simply
never sets one field.**

| piece | file | what it already does |
|---|---|---|
| the plan | `packages/app-surface/src/trailReveal.ts` → `arrivalGrowPlan(network, arrivalIds)` | roots at the arriving island(s), walks their DIRECT incident edges, emits `RevealSegment { id, delayMs, fromEnd, dir, revealedUsage }`, deterministic order (delay, then id) |
| the footfall cadence | same file → `export const REVEAL_STAGGER_MS = 350` | `delayMs = chainIndex * 350` — the per-segment stagger IS the footfall |
| direction of travel | same file → `fromEnd` | set so growth always runs **away** from the arriving island, even when the stored `from→to` chain is walked backwards |
| the model field | `packages/app-surface/src/WorldSceneView.tsx` (`reveal: TrailRevealPlan \| null` on `WorldPresentationModel`, defaulted at `reveal: input.reveal ?? null`, forwarded at `reveal: model.reveal`) | already carries the plan through the presentation model |
| the DOM hookup | `packages/app-surface/src/SceneView.tsx` (~L807 for `trail-shadow`/`trail-casing`/`trail-fill`/`trail-ghost`, ~L682 for the lit lane) | attaches `mask="url(#trail-m-<segId>)"` and steps `strokeWidth` from `trailFillWidth(seg.revealedUsage)` |
| the mask defs | `apps/studio/src/components/TreeView.tsx` (~L2375 `arrivalGrowPlan(world?.trails ?? null, arrivalIds)`; ~L2676–2698 the `<mask id={\`trail-m-${seg.id}\`}>` block) | one `<mask>` per revealing segment, `pathLength={1}`, `style={{ animationDelay: \`${seg.delayMs}ms\` }}`, oversized `userSpaceOnUse` bounds |
| the animation | `apps/studio/src/index.css` → `.trail-reveal-mask` + `@keyframes trail-reveal-grow` | `stroke-dasharray: 1; stroke-dashoffset: 1 → 0` over **`0.35s ease-out`**; `.from-end` starts at `-1`; a `prefers-reduced-motion` branch pins `stroke-dashoffset: 0` |
| the tests | `packages/app-surface/src/trailReveal.test.ts` | the plan logic is red-green covered already (ADR-0070 stage 1; only the look is owner-attested) |

**The 350 ms stagger and the 0.35 s draw are already equal**, so segment *n+1* starts on the exact
frame segment *n* lands. The footfall cadence is not something to build — it is already the
default and has never been switched on for Chapter 2.

## 3. The one-line gap

`apps/studio/src/components/SemanticGrowthDemo.tsx`, `narrativeModel()`:

```ts
normalizeWorldPresentationModel({
  scene: narrativeScene(story, claims),
  neighbours: neighbourPlan,
  lanes: primaryLanes,
  laneMotion: 'draw',
})
```

`neighbours` + `laneMotion: 'draw'` are the **ADR-0242 lit selection lane** — the narrow highlight
stroke painted over an already-drawn road. They are not trail growth. `reveal` is never set, so
`ctx.reveal` is null, so `SceneView` attaches no mask, so `TreeView` renders no `<mask>` defs, and the
underlying dirt trail is fully painted from the first frame of the Chapter 2 witness.

The change is to pass a plan on the stage where the island arrives:

```ts
reveal: arrivalGrowPlan(world?.trails ?? null, new Set([DEMO_STORY_ID])),
```

…on the `land → proposed` step only, and `null` on every other step, so the walk plays once, at the
placement, and the trails stay statically drawn afterwards (which is exactly what the existing
comment in `index.css` says the retirement of reveal-on-click was for).

**Integration is a later phase — nothing in `packages/`, `apps/`, `stories/` or `docs/decisions/` was
touched by this experiment.** The snippet above is a proposal, not a diff.

## 4. Generated assets this treatment needs

**None. Zero bytes.**

That is the honest and slightly deflating answer, and I tested the alternative rather than asserting
it.

### The dirt-scuff decal: measured, and it does not earn its bytes

I authored three candidates at 40×32 (`create_image_pixflux`, 1 generation each, seeds 31502/31503/31504,
job ids in `README.md` §1e, images in `raw/scuff*-00.png`, side-by-side in `path-scuff-candidates.png`).

| | bytes | opaque px | what it actually looks like |
|---|---|---|---|
| seed 31502 | 813 | 579 | a hard-outlined brown disc — a cookie, not a scuff |
| seed 31503 | 460 | 126 | the only near-usable one: sparse specks, but with two pebble blobs |
| seed 31504 | 588 | 303 | **two brown shoes** seen from above, not prints pressed into dirt |

Rejecting it is not about the 460 bytes. Four reasons, in descending weight:

1. **It fights a decision the owner already made.** `apps/studio/src/index.css` records it plainly:
   the cased trail ribbon was collapsed to a single quiet line on owner feedback (2026-07-06) —
   `.trail-shadow`/`.trail-casing` are `display: none`, and `.trail-fill` is one faded-brown stroke at
   `opacity: 0.62`. Stamping an opaque 40×32 decal at every segment join re-ornaments precisely what
   was deliberately stripped.
2. **Segment joins are frequent, and a decal at each one is noise, not texture.** A single edge is a
   chain of segments; the stagger already fires once per join. The decal would land at the same rate
   as the cadence, so it adds density exactly where the beat is already carried.
3. **It needs machinery that does not exist.** The trail is an SVG stroke with a per-segment mask, not
   a sprite layer. A decal needs its own painter slot, a per-join anchor, and a map-scale rule — new
   engine surface for an ornament, against ADR-0274 D4's "declared depth slot" discipline.
4. **3 of 3 drafts read as stickers.** At 40×32 with a hard outline the model produces objects, not
   ground disturbance. Getting a true scuff would likely need `inpaint_image` against the real plate
   (20–40 generations a go), which is a large spend for an ornament.

**If the owner does want the path to carry texture, the honest lever is not a stamped decal** — it is
`create_path_tiles` (PixelLab's connectable 18-config PATH/ROAD tile set, never used on this arc)
replacing the SVG stroke wholesale. That is a genuinely different treatment with a genuinely different
cost: the routed shared-segment network and its per-segment masks would have to be reconciled with a
tile grid. I am naming it as a fork, not recommending it.

## 5. What the owner would be judging

- Does one-segment-at-a-time read as *walking out from the new island*, or as a loading bar?
- Is 350 ms per segment the right pace on a real forest? `arrivalGrowPlan` sets `delayMs` and the CSS
  sets the 0.35 s draw independently — the pace is a two-number tune, both app-owned (constraint 3),
  and neither requires regenerating anything.
- Does the ordering land? This experiment proposes **island → path → tree**. The alternative (path and
  tree together, so the story "arrives connected") is a one-line reordering, not a re-author.
