# Layer 1 — the grass base, crossed onto the shipped ground and measured

**Date:** 2026-09-01 · **Increment:** `layer-1-grass-base-and-hue-drift` on `land-ground-stack-arc`
**Source of the recipe:** `docs/research/chapter2-land-idiom-2026-08-27/build_land.py:836-868`, `mat_attribute()`
**Instrument:** `packages/forest-world-r3f/harness/shipped-grass.html` + `shipped-grass-measure.mjs`
**Reader model:** `packages/forest-world-r3f/harness/grass-status-reading.ts`

---

## The headline

**The approved grass cannot enter the shipped ground through the mix seam at any strength that is
both VISIBLE and HONEST. The two requirements miss each other by a factor of about seventy.**

The layer itself is built, transcribed constant-for-constant, tested and green. What it cannot do
is cross at a strength a viewer can see without a shadowed *building* parcel reading as *healthy*.
That is a decision about how much reporting fidelity the look is worth, and it is not one this
session may take (ADR-0489 D5: the standing colour flexibility "is not permission to REMOVE a
report from a surface that carries one").

**Nothing was adopted.** `ForestWorldCanvas.tsx` draws the same ground it drew before this branch;
the layer is available behind an opt-in material option and is switched on by no caller.

---

## What the numbers say

Measured on one island at 8 delivered px per ground unit — the zoom the ground's own texture is
read at. Full table in `report.txt`, per-row data in `measurements.json`.

| arm | mix | colour families | largest family | px moved >20/255 | px touched | MICRO | STRUCT |
|---|---|---|---|---|---|---|---|
| `flat` (CONTROL — the map today) | — | 12 | 27.7% | 0 | 0 | 1.02 | 20.38 |
| `admissible` | 0.005 | 12 | 27.7% | **0** | 0 | 1.02 | 20.38 |
| `ladder-limit` | 0.20 | 18 | 25.9% | **0** | 575,962 | 0.86 | 16.58 |
| `visible` | 0.35 | 22 | 19.4% | **84,121** | 575,962 | 0.75 | 14.26 |
| *the approved render* | *(all 7 layers)* | *36* | *5.2%* | *n/a* | *n/a* | *2.54* | *30.05* |

And what each mix costs the map's ability to report, walked exhaustively over every colour the
layer can deliver, against all six ground tokens on all ten ladder rungs:

| mix | every status still reads as itself? | ladder that survives |
|---|---|---|
| 0.005 | yes | 0.77 – 1.08 (the shipped ladder, intact) |
| 0.05 | no | 0.79 – 1.09 (loses the shadow rung) |
| 0.10 | no — 4 of 30 patches break | 0.82 – 1.08 |
| 0.20 | no — 8 of 30 break | 0.88 – 1.08 (five of ten rungs gone) |
| 0.35 | no — 23 of 30 break | **none** |

**The two tables do not overlap.** 0.005 is honest and moved zero pixels visibly. 0.35 is the first
mix a viewer can see and leaves no admissible ladder at all. 0.20 is the worst of both: it touches
575,962 pixels, moves *none* of them by more than 20/255 on one island, and still breaks eight
readings.

---

## The break, named

At mix 0.10 the first patches to fail are the ladder's two darkest rungs:

```
building@0.77   #a69451  ->  #9c8f4f   nearest family: healthy   (own 31.50, foreign 24.21)
proposed@0.77   #a69451  ->  #9c8f4f   nearest family: healthy
```

A shadowed *in progress* parcel reads as *signed off*. That is an ADR-0392 D5 / ADR-0398 D7 failure
rather than a matter of taste, and it is the same wall, at the same rung, that the grain's colour
half met (`grain-status-reading.ts`, which measured its ceiling at 0.006).

**What binds is the LADDER, not the palette.** The reader holds one reference per status — what lit
flat ground looks like, rung 0.90 — so a rung's margin is spent by its distance from 0.90 in both
directions. The shipped ladder reaches down to 0.77 for the shadow rung, and at 0.77 the
`proposed`/`building` yellow already sits **0.93 weighted channel units** from reading as green
before any grass exists. On the lit ladder alone the admissible mix is 0.075 — fifteen times
larger, produced by removing exactly one rung. *Moving the yellow does not help*: the 2026-08-30
sweep over 5,000 candidate palettes found none that admits a comparable tint, because the
constraint is how far the ladder reaches rather than how far apart the colours sit.

---

## Two findings that were not the question

**1. The shipped baseline has MOVED, and this run re-measured it.** ADR-0490's context table records
the shipped ground at **9** colour families; through this page's own census it is **12**. The
approved render measures **36**, matching the table exactly — so the census agrees with the one that
produced those figures and the difference is the map, not the instrument. That is the arc's first
named hazard arriving on schedule: *a cost sentence in a parked row is a cost as at the day it was
parked*. Every figure above was taken on this run and none inherited.

**2. The mix seam REDUCES contrast, which is the opposite of what the approved render has.** MICRO
falls 1.02 → 0.75 and STRUCT falls 20.38 → 14.26 as the mix grows, while the approved render sits at
2.54 / 30.05. Mixing every pixel a fixed fraction of the way toward a common green pulls the ladder's
own rungs together; the approved render is contrasty *because the grass IS its base and spends its
full range*, not because some grass was blended into something else. So the seam is not merely
under-powered at admissible strengths — at any strength it trades the contrast the picture is
supposed to gain. This bears on the fork below: it suggests the limit is the mechanism ADR-0490 D5
names, not only the amount.

---

## What is NOT measured here, and why

**The frame cost.** This layer evaluates **23 lattice-noise octaves per ground fragment** (8 broad +
8 mid + 4 fine + 3 drift), against the two the shipped grain already evaluates. ADR-0490's stated
cost is that nothing argues the full stack is affordable, and the arc's end state asks for each
layer's frame delta on the RTX 2060 box. It is deliberately not measured yet: **the layer is not
crossing, so this would price something nobody is paying for, and the mechanism the fork settles may
change the octave count entirely.** It is a NAMED GAP under the arc's end-state item 1 and must be
measured before any adoption.

**A second machine.** Every figure here comes off this box's Adreno X1-85 under ANGLE/D3D11
(`software=false` — not SwiftShader). No frame timing is claimed, so the RTX 2060 rule does not
bite. The grain this ground already wears *is* renderer-specific — 24.5% of grained pixels land on a
different ladder rung between SwiftShader and an RTX 2060 — so the exact pixel counts would move on
other hardware. The finding does not: it rests on 0 versus 84,121, and on margins computed with no
GPU at all.

⚠ **Two runs were taken and are byte-identical.** On this arc identical numbers are normally a
warning sign — the control arm going stale under a sibling merge produces exactly that symptom. Here
it means determinism on one renderer between two runs minutes apart, and the staleness failure is
structurally impossible on this page: every arm, control included, is built by
`shippedGroundBuild()` — the same function `CellGround` itself calls — rather than by a scene the
page assembles. `shipped-grass-scene.test.ts` holds that as a property of the source.

---

## The fork this puts to the owner

Recorded as an `open-question` on `land-ground-stack-arc`. In short: the approved ground's first
layer repaints **every** reporting pixel, and the map's shading depth and the layer's visibility are
competing for the same margin. The options are to spend shadow depth, to spend reporting fidelity in
shadow, to change the seam so the grass modulates within each status's own hue instead of mixing
toward an absolute green, or to accept layer 1 as unshippable and re-scope the arc around the four
**masked** layers.

⚠ **Layer 1 is the only UNMASKED layer, and that is why it is the hard one.** Sand, path and rock
(layers 2–4) are confined to the coast band, the dependency trail and steep faces; a parcel's
interior keeps its status colour, so ADR-0489's grant covers them comfortably. Layer 1 covers the
whole ground. The arc's forced order (ADR-0490 D3) puts the hardest layer first — correctly, since
nothing above it can be judged until it lands, but it means the arc's whole colour question arrives
at layer 1 rather than being spread across five.

---

## Reproduce

```
pnpm --filter @storytree/forest-world-r3f exec vite harness --port 5316 --strictPort
ST_GRASS_URL=http://localhost:5316/shipped-grass.html \
  pnpm --filter @storytree/forest-world-r3f measure-shipped-grass
```

The driver refuses a software rasterizer unless `ST_GRASS_ALLOW_SOFTWARE=1`, refuses a control arm
that differs from itself, refuses any arm whose triangle count differs from the control's (layer 1
adds no geometry, so its correct geometry delta is zero), and refuses the two claims this README
rests on if the frames disagree with them — the `visible` arm moving nothing visibly, or the
`admissible` arm moving a tenth of what it does.
