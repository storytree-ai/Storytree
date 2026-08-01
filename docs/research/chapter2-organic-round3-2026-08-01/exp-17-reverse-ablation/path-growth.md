# exp-17 — path growth: grow the trail in the DEPENDENCY direction

**Treatment.** When a story island is placed, its incident trails draw on **from the far end
inward** — starting at the story the newcomer depends on and arriving at the newcomer — instead of
radiating outward from the newcomer. Everything else (the 350 ms per-segment stagger, the mask,
the width step, the reduced-motion settlement) is the machinery that already exists.

**Generated assets required: none.** This is a wiring change plus a one-line root selection. I did
not spend a single PixelLab generation on it, and §5 says why I think a `create_path_tiles` set is
the wrong lever for the beat that is actually missing.

---

## 1. The gap, verified in code

The Chapter 2 witness never turns trail growth on. It is not missing from the engine.

* `packages/app-surface/src/WorldSceneView.tsx:20` — `WorldPresentationModel` carries
  `readonly reveal: TrailRevealPlan | null`. It is an optional input (`:41`) that defaults to `null`
  (`:70`) and is handed straight to the scene (`:110`).
* `apps/studio/src/components/SemanticGrowthDemo.tsx:376-378` — the Chapter 2 demo sets
  `neighbours`, `lanes` and `laneMotion: 'draw'`. Those are the **lit one-hop selection lane**
  highlight, a different thing. `grep -n reveal` over that file returns **nothing**, so `reveal`
  stays `null`, no `trail-m-*` mask is ever emitted, and the dirt trail is fully drawn on frame 1.
* By contrast `apps/studio/src/components/TreeView.tsx:2374` — the real map — does wire it:
  `const growPlan = useMemo(() => arrivalGrowPlan(world?.trails ?? null, arrivalIds), …)`, passed as
  `reveal: growPlan` at `:2449`.

So the beat exists, is unit-tested (`packages/app-surface/src/trailReveal.test.ts`), and is simply
not connected in Chapter 2.

## 2. The machinery this treatment rides, named exactly

| piece | where | what it gives me |
|---|---|---|
| `arrivalGrowPlan(network, arrivalIds)` | `packages/app-surface/src/trailReveal.ts:150-179` | the plan: which segments draw on, in what order, from which geometric end |
| `REVEAL_STAGGER_MS = 350` | `trailReveal.ts:24` | `delayMs = chainIndex * 350` (`:168`) — the per-segment stagger, already the owner-approved timing from ADR-0169 §3 |
| `RevealSegment.fromEnd` | `trailReveal.ts:40-42`, set at `:167` | which end of the segment path the mask grows from |
| `RevealSegment.revealedUsage` | `trailReveal.ts:44-45`, set at `:172` | the width step-up for a shared trunk |
| mask attachment + width step | `SceneView.tsx:805-811` (and `:682` for children) | `mask="url(#trail-m-<id>)"`, `strokeWidth = trailFillWidth(seg.revealedUsage) + widen` (shadow +5, casing +2.5, fill/ghost +0) |
| `is-growing` class | `SceneView.tsx:294-296` | kills the base transition so the mask owns the motion |
| the mask elements | `TreeView.tsx:2676-2699` | one `<mask id="trail-m-<id>">` per plan segment, `pathLength={1}`, `maskUnits="userSpaceOnUse"` with oversized bounds, `animationDelay: ${seg.delayMs}ms` |
| the draw-on animation | `apps/studio/src/index.css:1833-1859` | `.trail-reveal-mask { stroke-dasharray:1; stroke-dashoffset:1; animation: trail-reveal-grow .35s ease-out both }`, `.from-end { stroke-dashoffset:-1 }`, and a reduced-motion rule that lands on `stroke-dashoffset: 0` — a fully drawn trail |

## 3. The change

`arrivalGrowPlan` currently roots every incident chain **at the arriving island**
(`trailReveal.ts:164`):

```ts
const rootAtTo = toNew;                                   // root at the arriving end
const chain = rootAtTo ? [...edge.segments].reverse() : edge.segments;
const fromEnd = rootAtTo ? !ref.reversed : ref.reversed;
```

The dependency-direction treatment roots at the **other** end. Add an option — default unchanged so
the main map is untouched — and change one expression:

```ts
export type GrowRoot = 'arrival' | 'dependency';
// 'arrival'    (default, today): the trail radiates OUT of the new island
// 'dependency' (this treatment): the trail is extended TOWARD the new island by the world
const rootAtTo = root === 'arrival'
  ? toNew
  : (toNew && fromNew ? toNew : fromNew);   // root at the non-arriving end; same tie-break
```

Then in `SemanticGrowthDemo.tsx`, add `reveal: arrivalGrowPlan(world.trails, arrivalIds, 'dependency')`
to the presentation model it already builds.

**Nothing else moves.** `chain`, `fromEnd`, `delayMs`, the mask, the CSS and the reduced-motion rule
are all downstream of `rootAtTo` and already handle both cases — the `else` branch of every one of
those three lines is the branch this treatment selects. That is the proof that this is a root
choice, not a new animation: the code was written to grow a chain from either end, and only ever
gets asked for one of them.

The seam is pure and already has a test file (`trailReveal.test.ts`), so the change is red-green
testable without touching the DOM.

## 4. Why the dependency direction is the one that reads as "connected"

### 4.1 The code's own vocabulary already says so

`trailReveal.ts:28-32` defines the direction tint, for edge `from → to` meaning "`to` depends on
`from`":

> `out` — a dependency edge (`to === F`): what F stands on. Warm earth.
> `in` — a dependent edge (`from === F`): who stands on F. Cooler tint.

A newly planted story is a leaf of the DAG: it depends on things, and nothing yet depends on it. So
every one of its incident edges is an `out` edge from its own point of view — *what it stands on*.
The module's own palette note calls that direction "warm earth". A dirt path growing along the
ground direction, from the ground that already exists, is the metaphor the taxonomy was written
around.

### 4.2 The stagger puts the moment of connection in the wrong place today

`delayMs = i * REVEAL_STAGGER_MS` accumulates from the ROOT outward (`trailReveal.ts:168`). With the
current `'arrival'` root:

* t=0 the trail starts at the new island;
* t=(n−1)·350 ms it finally touches the old story — off to the side, where the eye is not.

The *arrival* — the frame where the two things become one network — happens last, at the least
salient point on screen. With the `'dependency'` root the beat inverts:

* t=0 the world's existing story extends a path;
* t=(n−1)·350 ms the path reaches the newcomer, under the eye that is already on it.

The last beat is the connection, and it lands on the subject. That is the whole semantic difference,
and it comes free from a timing rule that is already there.

### 4.3 Causality

The dependency existed before the newcomer. A trail that starts at the newcomer and reaches for its
foundations animates the effect creating its cause. Growing from the foundation is what actually
happened.

### 4.4 The honest counter-argument

`'arrival'` has a real virtue this treatment gives up. Rooted at the new island, *all* incident
trails start at the same instant from the same point — a radial burst that unmistakably belongs to
the newcomer. Rooted at the dependencies, N trails start at N different places and converge, and
during the first ~350 ms the animation is not obviously *about* the new island at all.

The choice is therefore beat-dependent, and it is an owner call:

* **"look at this island"** → radiate (`'arrival'`, today's behaviour, unchanged on the main map);
* **"this new thing joined the forest"** → converge (`'dependency'`, this treatment).

Chapter 2's beat is a story being planted and joining the forest, so I propose `'dependency'` there
and no change anywhere else. I am not claiming the existing choice is wrong on the map it ships on.

## 5. Sequencing against this experiment's tree track

The hero tree is nine rungs of reverse ablation. The path beat should finish **before** the tree
leaves out, because a story cannot mature before it is connected:

```
island settles (exp-6 SVG accretion)
  → trails converge, dependency-rooted, 350 ms/segment      ← this treatment
    → hero tree rungs 0 → 8                                  ← exp-17
```

Two extensions the existing hooks already support, listed so nobody builds them twice:

* **Full width only when the destination story is healthy.** `SceneView.tsx:810` derives the stroke
  width from `seg.revealedUsage`, and `trailRevealPlan` already sets that field to the count of
  *revealed* edges rather than global usage (`trailReveal.ts:107-120`) — `arrivalGrowPlan` currently
  copies the global usage instead (`:172`). A health-gated width can therefore be expressed entirely
  as a `revealedUsage` value, with no CSS and no new attribute.
* **Reduced motion is already correct.** `index.css` lands the mask on `stroke-dashoffset: 0` — a
  fully drawn trail — so the settled state is the connected state and nothing needs to be added.

## 6. Why not `create_path_tiles`

PixelLab's connectable 18-config path/road tile set is the obvious "generate the trail" lever, and I
deliberately did not pull it.

The trail today is an SVG stroke over a routed path, with a per-segment mask driving the growth
(`SceneView.tsx:790-811`, `TreeView.tsx:2676`). Replacing the stroke with a tile set means replacing
the renderer: tiles have to be laid along a routed polyline, corner configs chosen, junctions and
the ADR-0169 cave portals re-solved, and the draw-on mask re-expressed as per-tile reveal. That is a
large change to a part of the app that is not broken.

**The missing beat is a wiring gap, not an art gap.** One `reveal:` field and one root choice put
path growth on screen with the timing, easing, width step and reduced-motion behaviour the owner has
already seen and approved. A worn dirt-path texture riding the existing mask stays available later,
as a texture on the existing stroke, if the look ever needs it — and that is a much smaller ask than
a tile renderer.
