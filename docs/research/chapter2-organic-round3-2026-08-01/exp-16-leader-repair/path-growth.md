# Path growth — "the trail widens as the story matures"

**Treatment in one line.** The trail *draws on* at arrival at **spur width**, and then **steps up
through the existing `revealedUsage` stroke-width ladder** as dependents land — so a path is not just
present or absent, it is *young* or *established*, the same way the tree beside it is.

**Generated assets required: none.** Every part of this rides machinery that is already built, already
pure, and already unit-tested. The reason the beat has never played is a single missing assignment.

---

## 1. What is already built (verified in code, 2026-08-01)

| piece | file | what it already does |
|---|---|---|
| `arrivalGrowPlan(network, arrivalIds)` | `packages/app-surface/src/trailReveal.ts:150` | Roots at the ARRIVING island(s) and returns the direct incident segments, each with `delayMs = chainIndex * REVEAL_STAGGER_MS`, a `fromEnd` flag so growth always runs *away* from the new island, and `revealedUsage`. Pure, deterministic, folds shared trunks by earliest-wins. |
| `REVEAL_STAGGER_MS = 350` | `trailReveal.ts:24` | The per-chain-position stagger (ADR-0169 §3, "~350 ms/segment, ease-out"). |
| `reveal: TrailRevealPlan \| null` | `WorldSceneView.tsx` (on `WorldPresentationModel`) | The transport slot. Already normalised, already threaded to the renderer. |
| mask + width hookup | `packages/app-surface/src/SceneView.tsx:805-811` | When the plan names a segment: `props.mask = url(#trail-m-<id>)` **and** `props.strokeWidth = trailFillWidth(seg.revealedUsage) + widen`. |
| `trailFillWidth(usage)` | `packages/forest-world/src/routing.ts:103` | `1.2 + 1.8 * sqrt(usage)` — the one shared width rule. usage 1 → **3.0**, 2 → **3.75**, 3 → **4.32**, 4 → **4.80**. |
| the draw-on animation | `apps/studio/src/index.css:1829` + `.trail-reveal-mask` | Per-segment white stroke at `pathLength=1`, `stroke-dashoffset` 1→0 over `0.35s ease-out`, `.from-end` flips to −1. A dashed spur fill grows correctly *under* the mask. |

## 2. The one thing that is missing

`apps/studio/src/components/SemanticGrowthDemo.tsx:371-378` builds its presentation model with

```ts
normalizeWorldPresentationModel({
  scene: narrativeScene(story, claims),
  neighbours: neighbourPlan,
  lanes: primaryLanes,
  laneMotion: 'draw',
})
```

`grep -c reveal` on that file returns **0**. `neighbours` / `lanes` / `laneMotion: 'draw'` are the *lit
selection lane* highlight — a different thing. Because `reveal` is never set, `SceneView`'s
`ctx.reveal?.byId.get(node.id)` is always `undefined`, so no segment ever gets a mask and no segment
ever gets the stepped width. The dirt trail is fully drawn from frame one.

**That is the whole answer to "why wasn't path growth in the mock outputs": it was never wired, not
missing from the engine.**

## 3. This experiment's variation — the width ladder carries maturity

Other experiments in this round vary *when* the trail grows. This one varies *how much of it grows*,
by using the width ladder that `SceneView` already reads but nothing currently drives:

**Beat 1 — arrival (t = 0 → ~0.35 s per segment).** The story island is PLACED. `arrivalGrowPlan` is
called with that island's id; its direct incident segments draw on outward from the new island at
`REVEAL_STAGGER_MS`. Crucially the plan is built against a network whose `usage` counts **only the
dependents that exist at this moment** — so a brand-new leaf story's trail draws on at
`trailFillWidth(1) = 3.0`, a thin spur.

**Beat 2 — maturation (each later dependent landing).** When a further story is placed that routes over
the same trunk, that trunk's `usage` rises and `arrivalGrowPlan` reports `revealedUsage = 2, 3, 4…`.
`SceneView` already turns that into `strokeWidth = trailFillWidth(revealedUsage)`, i.e. **3.0 → 3.75 →
4.32 → 4.80**. The path visibly *thickens* — a footpath worn into a road. Because `trailFillWidth` is
`sqrt`-shaped the first dependent is the biggest visual jump (+25%) and later ones taper, which is the
right emphasis: the moment a story stops being a dead end is the moment that matters.

**Beat 3 — the tie to the tree.** Trail growth and tree growth are driven by the **same** normalised
progress the app already owns. The tree's frame index and the trail's `revealedUsage` are both
functions of story state, so they move together without either asset knowing about the other. Nothing
in `frames/` encodes timing (ADR-0274 §3: the app owns semantic state, deterministic frame selection,
timing, easing, holds).

**Sequencing choice.** The trail draws on **as the island settles**, not before and not after: the
seedling frame (`frames/frame-00.png`, 858 alpha px) appears at the same instant the first incident
segment starts drawing. The path and the tree are two views of one event — a story arriving — so
splitting them into "first the land, then the path, then the tree" would narrate three events where
there is one.

## 4. The change, concretely

One assignment plus one piece of state, both in the studio demo — no engine change, no new asset, no
new ADR:

```ts
// SemanticGrowthDemo.tsx — arrivingIds is the set of island ids placed by THIS step
normalizeWorldPresentationModel({
  scene: narrativeScene(story, claims),
  neighbours: neighbourPlan,
  lanes: primaryLanes,
  laneMotion: 'draw',
  reveal: arrivalGrowPlan(trailNetwork, arrivingIds),   // <- the missing line
})
```

The width step-up then needs `trailNetwork` to be rebuilt (or its `segment.usage` recomputed) as each
dependent lands, so `revealedUsage` actually climbs — that is the only piece with any real work in it,
and it is data, not rendering.

## 5. Why no PixelLab asset here

`create_path_tiles` ("connectable PATH/ROAD tile set, 18 configs") was live and unused, and a worn dirt
texture riding the existing mask is a real option. This experiment deliberately does not take it:

- The trail is currently one stroked SVG path per segment with a shared width rule. A tile set replaces
  a **1-line-of-code** change with a routing/atlas/seam problem, and would hard-code a width — killing
  the `revealedUsage` ladder that is the whole point of this treatment.
- ADR-0274 D1/D6 forbid generating land for this round; a path texture sits close enough to that line
  that it should be an owner call, not a side effect of a tree experiment.
- It would also reintroduce exactly the fault this experiment spent its budget removing from the tree:
  a raster ground fragment pasted onto a vector world.

If the owner does want a textured path later, the honest sequence is: land the one-line reveal wiring
first, confirm the *motion* reads, and only then ask whether the stroke needs a texture.

## 6. Verification if this is built

The animation logic is already red-green testable (`trailReveal.test.ts`), so the new coverage is small
and real:

1. `arrivalGrowPlan` returns only segments incident to the arriving island — already tested.
2. **New:** a segment's `revealedUsage` rises 1 → 2 → 3 as dependents are added, and
   `trailFillWidth(revealedUsage)` yields 3.0 → 3.75 → 4.32. Pure, no DOM.
3. **New:** the demo's presentation model carries a non-null `reveal` on an arrival step and `null`
   otherwise. A one-assertion regression test against the exact bug found here.
4. The *look* — stagger feel, whether 3.0 → 4.8 reads as "widening" at map scale — is an
   operator-attested leg (ADR-0070 stage 2), not something a test can sign.
