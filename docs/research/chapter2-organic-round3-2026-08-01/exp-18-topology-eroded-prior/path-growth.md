# exp-18 — path growth: **root-and-path unity**

> The trail is the root system reaching the next island.

The same anisotropic geodesic field that drives this experiment's canopy erosion also drives
the trail's per-segment draw-on. One measured parameter — the **root growth front** — governs
both, so the path does not merely play *near* the tree's growth, it is the *same growth*
continuing past the root socket into the soil.

No generated asset is required. This treatment is a timing law and one missing wire-up.

---

## 1. What the app already has (verified in code, 2026-08-01)

The machinery is built, pure, and unit-tested. It is simply never switched on.

| file | what it already does |
|---|---|
| `packages/app-surface/src/trailReveal.ts` | `arrivalGrowPlan(network, arrivalIds)` — when islands ARRIVE, their **direct incident** trails draw on, growing **outward** from the new island. Emits `RevealSegment { id, delayMs, fromEnd, dir, revealedUsage }`. `REVEAL_STAGGER_MS = 350`; `delayMs = chainIndex * REVEAL_STAGGER_MS`. Deterministic; a segment reached twice keeps the earlier draw-on. |
| `packages/app-surface/src/trailReveal.test.ts` | red/green cover for the selector (delay accumulation, shared-trunk folding, the §5 honesty invariant). |
| `packages/app-surface/src/WorldSceneView.tsx` (20, 41, 70, 110) | `reveal: TrailRevealPlan \| null` already rides `WorldPresentationModel` and is already passed through to the scene. |
| `packages/app-surface/src/SceneView.tsx` (294–296, 682, 805–811) | `revealClass()` stamps `is-growing`; a named segment gets `mask="url(#trail-m-<id>)"` and `strokeWidth = trailFillWidth(seg.revealedUsage) + widen`. |
| `apps/studio/src/components/TreeView.tsx` (2675–2699) | renders one `<mask id="trail-m-<segId>">` per plan segment, `pathLength={1}`, class `trail-reveal-mask` (+ `from-end`), with an **inline `animationDelay: ${seg.delayMs}ms`**. |
| `apps/studio/src/index.css` (1829–1858) | `.trail-fill.is-growing` / `.trail-ghost.is-growing`; `.trail-reveal-mask { stroke-dasharray: 1; stroke-dashoffset: 1; animation: trail-reveal-grow 0.35s ease-out both }`, `.from-end` starting at `-1`, `@keyframes trail-reveal-grow`, and a `prefers-reduced-motion` branch that settles instantly. |

**The gap:** `apps/studio/src/components/SemanticGrowthDemo.tsx` (376–378) sets `neighbours`,
`lanes` and `laneMotion: 'draw'` — the ADR-0242 *lit selection lane* — and **never sets
`reveal`**. So the dirt trail is fully drawn from frame one and `arrivalGrowPlan` never runs.
That is the whole reason path growth is missing from every round-1/2 mock.

---

## 2. The shared parameter

This experiment's erosion field is an **anisotropic** chamfer geodesic seeded at the tree's
root contact:

| | |
|---|---|
| vertical step cost | `CV = 2` |
| horizontal step cost | `CH = 5` |
| **anisotropy** `λ = CH / CV` | **2.5** — the tree pushes upward 2.5x faster than outward |

That is not just a design constant; it **survived the model redraw**. Measured on the nine
shipped frames:

| measured on `frames/` | value |
|---|---|
| mean crown-top advance per stage | **14.4 px** |
| mean half-width advance per stage | **5.6 px** |
| **measured vertical : lateral ratio** | **2.56** (design λ = 2.50) |

So the hero tree's own art carries a legible, measurable **outward growth front of
≈ 5.6 sprite px per stage**. That number — call it `ROOT_FRONT_PX_PER_STAGE` — is the shared
parameter. Everything below is that same front, continued past the root socket.

```
ROOT_FRONT_UNITS_PER_S
  = ROOT_FRONT_PX_PER_STAGE          // 5.6, measured on frames/
  * WORLD_UNITS_PER_SPRITE_PX        // the socket scale the app already applies to the tree
  * 1000 / STAGE_HOLD_MS             // the app's own per-stage hold
  * ROOT_REACH_RATIO                 // the ONE tunable: how much faster roots run through
                                     // soil than wood. Proposed default 12.
```

`ROOT_REACH_RATIO` is the only free number, and it is honest about why it exists: a literal
1:1 speed match is **too slow**. Worked example — a hero tree ~900 world units tall (so
`WORLD_UNITS_PER_SPRITE_PX ≈ 5.3` against its 171 px alpha height) at a 420 ms stage hold
gives a bare front of ≈ 71 world units/s; the live forest's median one-hop route is ~2500
world units (per the `LANE_DRAW_SPEED` comment in `SceneView.tsx`), which would take **35
seconds**. At `ROOT_REACH_RATIO = 12` the front runs ≈ 850 units/s and a median hop draws in
**≈ 2.9 s**, with a short spur genuinely quicker and a long haul genuinely slower. Tune this
one number, not eight.

---

## 3. The change: a length law, not a step law

Today the two fronts obey **different kinds** of law, and that is what stops them reading as
one organism:

- the **canopy** advances a constant `Δcut` per stage — a *speed* along its geodesic;
- the **trail** advances a constant `350 ms` per chain **position** — a *step count*.

Trail segments differ in length by an order of magnitude, so the trail front visibly stalls
on short segments and races on long ones. The tree never does that.

**The repo already contains the correct precedent, one file away.** `SceneView.tsx` defines
`LANE_DRAW_SPEED = 3400` (world units per second) for the ADR-0242 lit lane, with a comment
that states the principle outright: a fixed speed exists *"so a short spur really is quicker
than a long haul instead of every route taking the same time"*. The arrival grow-on simply
never got the same treatment.

### Exactly what changes

1. **`packages/app-surface/src/trailReveal.ts`** — `RevealSegment` gains `durationMs`.
   Inside `arrivalGrowPlan`'s `chain.forEach`, replace

   ```ts
   const delayMs = i * REVEAL_STAGGER_MS;
   ```

   with an accumulated-length geodesic from the arriving island:

   ```ts
   const delayMs    = accLengthBefore / ROOT_FRONT_UNITS_PER_S * 1000;
   const durationMs = ref.lengthUnits  / ROOT_FRONT_UNITS_PER_S * 1000;
   ```

   That is literally the canopy's construction restricted to the trail graph: a geodesic
   distance from the **same seed** (the tree's root socket on the arriving island), thresholded
   by a front that moves at constant speed. `REVEAL_STAGGER_MS` is retired, or kept only as the
   reduced-motion fallback. Pure, deterministic, and covered by the existing
   `trailReveal.test.ts` — this is ADR-0070 stage-1 red/green work, no look verdict needed for
   the logic.

2. **`apps/studio/src/components/TreeView.tsx` (2691–2695)** — the mask already carries an
   inline `animationDelay`; add `animationDuration: ${seg.durationMs}ms` beside it.

3. **`apps/studio/src/index.css` (1838)** — `.trail-reveal-mask`'s hard-coded `0.35s` becomes a
   custom-property default (`animation: trail-reveal-grow var(--trail-grow-dur, 0.35s) ease-out both`)
   so the per-segment inline duration wins. The `from-end` and `prefers-reduced-motion`
   branches are unchanged — reduced motion still settles instantly with `animation: none`.

4. **`apps/studio/src/components/SemanticGrowthDemo.tsx` (376–378)** — the actual missing wire:

   ```ts
   reveal: arrivalGrowPlan(trailNetwork, arrivingIslandIds),
   ```

   alongside the existing `neighbours` / `lanes` / `laneMotion`.

5. **`packages/app-surface/src/WorldSceneView.tsx`** — no change. `reveal` is already on the
   presentation model and already forwarded.

---

## 4. The beat, in order

This experiment's variant is deliberately **trail-before-settle**, driven off the tree rather
than off the island:

| t | what plays |
|---|---|
| 0 | the destination island's ground is placed (Experiment 6's connected SVG accretion — unchanged, and the island question is closed) |
| 0 | the hero tree begins its erosion track at `frame-00`; the root front starts at the root contact band, exactly where the geodesic seed is |
| 0 | **at the same instant** the incident trails begin drawing on, from the arriving island outward (`fromEnd` already handles the direction) |
| 0 → `n * STAGE_HOLD_MS` | canopy front and trail front advance at the same speed, scaled by `ROOT_REACH_RATIO`. Because both are speed laws, a long trail and a wide canopy finish together; a short spur finishes early, like a low branch |
| on arrival at the far island | the segment's stroke reaches `trailFillWidth(seg.revealedUsage)` — the existing multi-reveal width step-up. **Full width only once the destination story is healthy**: the width step already keys off revealed edge count, and the status classes already exist, so "the trail thickens as the story gets healthy" costs one more term, not new machinery |
| after | masks drop; every trail stays statically drawn, as it does today |

Starting the trail *with* the tree rather than *after* the island settles is the whole point of
the treatment: a root does not wait for the ground to finish.

---

## 5. Generated assets

**None required, and that is deliberate.** The trail is an app-native SVG stroke and stays one;
ADR-0274 §3 keeps timing, easing, holds and reduced-motion settlement app-owned, and this
treatment adds no asset-owned clock, no vendor call and no new decode budget.

A PixelLab `create_path_tiles` worn-dirt-path texture riding the same per-segment mask is a
live option for a later look pass and would not change any of the above — the mask is already
length-agnostic (`pathLength={1}`). It was **not** generated here: the treatment does not need
it, and the shared round-3 generation pool was down to 73 remaining when this was written.

---

## 6. What is still an owner call

The *logic* above is red/green testable (`trailReveal.test.ts`) and needs no attestation. Two
things do:

1. **`ROOT_REACH_RATIO`'s value** — 12 is derived from matching today's felt timing, not from
   the tree. It is a look verdict.
2. **Trail-before-settle vs trail-after-settle** — this experiment argues for *before*, on the
   "roots reach first" reading. Other round-3 experiments should vary it, and the owner should
   see both against the same island.
