# Path growth — dirt first, relationship one beat behind

**Treatment for exp-14:** the trail grows **outward from the arriving island, after the land has
settled**, and the lit selection lane (`laneMotion: 'draw'`) **chases the base trail one beat
behind** — so the path reads as *dirt* first and *relationship* second.

Everything below rides machinery that is already built, unit-tested and shipped. **No new asset is
required.** No PixelLab call is needed for the treatment as specified; the optional texture variant
at the end is the only place a generated asset would enter, and it is explicitly not part of this
proposal.

## The finding this rests on

`arrivalGrowPlan` already does the hard half. The Chapter 2 witness simply never sets `reveal`, so
the underlying dirt trail is fully drawn from the first frame and the beat never plays. This is a
**wiring gap, not an engine gap**.

## The two layers

### Layer 1 — the dirt trail draws on (currently unwired)

| piece | where it lives | what it already does |
|---|---|---|
| `arrivalGrowPlan(network, arrivalIds)` | `packages/app-surface/src/trailReveal.ts` | Roots at the arriving island(s), takes their **direct incident** edges only, walks each edge's segment chain **outward from the new island** (`fromEnd` flips when the stored `from→to` chain must be walked backwards), folds shared segments to the earliest draw-on, and stamps `delayMs = chainIndex × REVEAL_STAGGER_MS` (350 ms). Pure, deterministic, covered by `trailReveal.test.ts`. |
| `reveal: TrailRevealPlan \| null` | `packages/app-surface/src/WorldSceneView.tsx` (`WorldPresentationModel`, normalized by `normalizeWorldPresentationModel`) | The transport for the plan into the renderer. Defaults `null`. |
| mask hookup | `packages/app-surface/src/SceneView.tsx` (~L790–L813) | For every `trail-fill` / `trail-ghost` node whose id is in `reveal.byId`: stamps `mask="url(#trail-m-<segId>)"`, adds the `is-growing` class, and steps `strokeWidth` from `trailFillWidth(seg.revealedUsage)`. |
| mask emission | `apps/studio/src/components/TreeView.tsx` (~L2676–L2699) | One `<mask id="trail-m-<segId>">` per plan segment in `<defs>`, holding the segment's own `d` at `pathLength={1}`, class `trail-reveal-mask` (`+ from-end`), with `animationDelay: <delayMs>ms` and `strokeWidth: trailFillWidth(...) + 8`. `userSpaceOnUse` + oversized bounds so a thin diagonal's mask never clips the wide stroke. |
| the animation | `apps/studio/src/index.css` (~L1838–L1858) | `.trail-reveal-mask` — white stroke, `stroke-dasharray: 1`, `stroke-dashoffset: 1` (`-1` when `.from-end`), `animation: trail-reveal-grow 0.35s ease-out both`; `@keyframes trail-reveal-grow { to { stroke-dashoffset: 0 } }`. `prefers-reduced-motion` sets `animation: none; stroke-dashoffset: 0` — settled, not animated. |

**What is missing is exactly one line of fixture wiring.** `apps/studio/src/components/SemanticGrowthDemo.tsx`
builds its presentation models through `normalizeWorldPresentationModel({ scene, neighbours, lanes,
laneMotion: 'draw' })` and never passes `reveal`.

### Layer 2 — the lit selection lane chases one beat behind (already on, needs a delay)

| piece | where it lives | what it already does |
|---|---|---|
| `lanes: LaneLayout` + `laneMotion: 'draw'` | set in `SemanticGrowthDemo.tsx` `narrativeModel(...)`, consumed by `litRouteLanes` in `SceneView.tsx` (~L702–L745) | One `trail-lane` path per route, island to island, class `is-drawing`, with a per-lane `--lane-draw` duration derived from the route's own length so every lane travels at one speed. |
| `.trail-lane.is-drawing` | `apps/studio/src/index.css` (~L1770–L1779) | `stroke-dasharray: 1; stroke-dashoffset: 1; animation: lane-draw var(--lane-draw, 0.6s) ease-out both`. Growth runs start→end and the path is built in dependency order, so the light moves the way the dependency points. |
| shore pulse | `.world-scene.lane-motion-draw .coast-fill-group.is-upstream/.is-downstream .coast-fill` (~L1795) | A one-shot `shore-pulse` on the neighbour's own coast that rides with the draw-on, at no extra element. |

The lit lane already draws on. What it does **not** do is wait for the dirt. Both layers currently
fire together the moment a frame with `lanes` mounts, so if `reveal` were simply switched on the two
would race and the trail would read as one glowing gesture rather than two.

## The exact sequencing

The witness stage's six frames are `empty → land → proposed → claimed → signed-proof → healthy`
(`SemanticGrowthDemo.tsx` header). The land settles at `land`; the primary island first carries an
identity at `proposed`, which is also the first frame that carries `neighbours`/`lanes` at all —
`empty` and `land` leave them `null` by design.

So the beat lands cleanly on the **`land` → `proposed`** transition:

1. **`land`** — the plot is claimed. `reveal` stays `null`; the trail network for the arriving island
   is not drawn yet. The coast and ground finish settling first. *Land before path.*
2. **`proposed`, t = 0** — pass `reveal: arrivalGrowPlan(network, new Set([DEMO_STORY_ID]))`. Every
   direct incident segment wears its mask and grows **away from the new island**, staggered
   350 ms per chain position, 350 ms per segment. Dirt only: `.trail-fill` / `.trail-ghost` — the
   worn track, no light.
3. **`proposed`, t = +350 ms (one `REVEAL_STAGGER_MS`)** — the lit lane starts. The relationship
   arrives on a road that already exists. The shore pulse rides with it, as it does today.

The one-beat chase is a **`animation-delay`, not new machinery**: give `.trail-lane.is-drawing` an
`animation-delay: var(--lane-chase, 0ms)` and have the mapper set `--lane-chase: 350ms` on the frame
that carries a `reveal`, `0ms` otherwise. That mirrors exactly how `trail-reveal-mask` already takes
its per-segment `animationDelay` inline, so it is the same idiom, not a second one.

**Reduced motion:** already handled at both layers and needs nothing new — `.trail-reveal-mask` drops
to `stroke-dashoffset: 0` with `animation: none`, and `prefers-reduced-motion` overrides all three
lane motions. Under reduced motion the frame simply arrives settled: full dirt, lit lane in place.

## Why this ordering, and not the alternatives

- **Dirt before light** is the semantically honest order. The trail is the *dependency*; the lit lane
  is the *current selection's route through it*. A lane that arrives before its road implies the
  relationship created the ground, which is backwards.
- **After the land settles**, not during. The island is the subject of the `land` frame; a path
  growing while the coast is still resolving competes with it and reads as two things happening at
  once. Round 2's rejected staggered-socket "planting wave" (#5) failed for that shape of reason.
- **Outward from the arriving island**, which is what `arrivalGrowPlan` already encodes and what the
  owner's 2026-07-07 call chose: growth should start where the news is.
- **Direct-incident only**, not the transitive chain. It is the *new connections* that draw in. The
  transitive selector (`trailRevealPlan`) is retained in the same module but deliberately not used
  here.

## Assets

**None.** This treatment is pure wiring plus one `animation-delay` variable.

Recorded but **not proposed for this round**: PixelLab's `create_path_tiles` (connectable path/road
tile set, 18 configs) has never been used on this arc and could author a worn dirt texture to ride
the existing `trail-m-<id>` mask instead of a flat stroke fill. It is out of scope here for two
reasons — the mask machinery is stroke-based and a tiled texture would need a fill-based rewrite of
the reveal, and the shared round-3 generation pool was down to 73 generations when this experiment
finished. If it is tried later, the honest test is whether a textured trail still reads at the map's
default zoom, where a segment is a few pixels wide.

## What a reviewer should check

1. `land` shows **no** incident trail for the arriving island.
2. `proposed` grows those trails outward from the island, nearest segment first, ~350 ms apart.
3. The lit lane starts one stagger later, on ground that is already drawn.
4. Trails elsewhere in the world stay statically drawn throughout (the plan is a subset of real
   incident edges — the ADR-0169 §5 honesty invariant holds by construction).
5. With `prefers-reduced-motion: reduce`, `proposed` arrives fully settled with no growth at all.
