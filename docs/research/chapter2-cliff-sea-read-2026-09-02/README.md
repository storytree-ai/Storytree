# The cliff's dark base reads against the sea

`adopt-the-land-into-the-shipped-map-arc` · increment `the-cliffs-dark-base-must-read-against-the-sea` ·
2026-09-02 · `packages/forest-world-r3f`

PR #1792 gave the cliff a second, shaded rock and the island got **thinner**. The owner saw it by
looking; this landing is the fence that would have caught it, the instrument that measures what he
saw, and the shaded rock re-picked against the scene's own sea — judged on a rendered ladder per
ADR-0503 D3.

Reproduce (the driver refuses a software rasteriser and the shared vite port):

```bash
pnpm --filter @storytree/forest-world-r3f exec vite harness --port 5347 --strictPort --host 127.0.0.1
```

```bash
ST_SKIRT_URL=http://127.0.0.1:5347/shipped-skirt.html pnpm --filter @storytree/forest-world-r3f measure-shipped-skirt
```

Renderer for every number here: **ANGLE / Qualcomm Adreno X1-85, D3D11** — a real GPU, not
SwiftShader. `skirt-measurements.txt` is the run verbatim; `skirt-measurements.json` the same data.

**The ground under every arm is the map as it ships after PR #1802** — the whole approved stack
(layer 1 grass, 2 shore sand, 3 the worn path, 4 rock on slope, 6 the cliff normal as detail
relief), through the shipped builder and at the shipped strengths. The unit was first built and
dry-run on the pre-#1802 ground (grass alone); the numbers here are the re-run on the stacked
ground, and the look was re-applied on it (§4). ⚠ The stack changes what the cliff stands NEXT TO,
not the colours the cliff can deliver: layers 2/3/4 ride `grassGate`, which the skirt's rock rows
never open, and layer 6 only moves a fragment between authored rungs of its own token's ramp — so
the cliff's anchor and apparent height are the same on both grounds, to the pixel, and the fence
still covers every pixel the cliff can deliver.

---

## 1. The regression, and why nothing caught it

The shaded rock that shipped on 2026-09-01 was the approved render's own skirt mask at its lower
quartile, `rgb(29, 32, 37)`. That transcription is sound about the RENDER and unsound about OUR
SCENE: `land-combined-1948px.png` is RGBA and **53.8% transparent**, so its dark values sit against
whatever composites them — never against this map's sea, `#101418`, luma 19.4. Delivered at the
ladder's floor the token is `rgb(23, 26, 30)`: a largest-channel move of **7** from the water,
against ADR-0490 D6's visibility bar of **20**. Twelve of the cliff's eighteen pixels merged into the
sea.

**And the instrument rewarded it.** `imageStats`'s dark anchor is the 2nd percentile of luma over the
island's OWN pixels, with the background excluded by colour. It scores the island in isolation and
never asks whether those pixels separate from the water behind them — so the darker the base was
painted, the better it scored, right up to invisibility. The landing reported the anchor error
against the approved render as halved. Both halves of the owner's sentence were literally true:
*"looks thinner, but if i look closer you have colored the bottom half a blackish color."*

## 2. The fence — against the sea, not against the statuses

Every test on the rocks asked whether a rock could be mistaken for a STATUS. None asked whether it
could be told from the WATER. `harness/skirt-rock-separation.test.ts` now holds every pixel a
shipping rock can deliver — the nine authored rungs AND the shadow rung — to ADR-0490 D6's own bar:
a largest-channel move of more than 20/255 from the sea. Asserted on the pair that ships; reported
for the median rock (the page's control, which the map does not draw); and proved **non-vacuous**
by asserting that the withdrawn rock FAILS it on every rung (moves 6–13), which is exactly what it
shipped as.

## 3. The instrument — the owner's look, made a number

`harness/cliff-readability.ts` asks the question the three statistics cannot: of the pixels an arm's
cliff occupies (every pixel differing from the `flat` control — the whole edge, lit half and shaded
half), how many sit more than the bar from the sea, and — per column — how tall does the cliff READ.
The apparent height is the per-column median of readable cliff pixels: the measurement the owner
took by hand.

It reproduces his finding exactly, at one island and 8 px per unit:

| arm | band px | readable | readable % | **apparent height** |
|---|---|---|---|---|
| `rock` (single median rock) | 18 | 35514 | 99.9% | **18 px** |
| `two-token-sunk` (shipped 09-01, WITHDRAWN) | 18 | 12557 | 35.3% | **6 px** |
| `two-token-deep` (SHIPS — the re-pick) | 18 | 35514 | 99.9% | **18 px** |

The driver refuses three ways on it: the instrument must SEE the sunk pair as shorter than the single
rock (or it would have passed PR #1792 too); the shipped pair must read no shorter than the single
rock ("looks thinner", as a number); and it must keep more of its cliff readable than the sunk pair
lost. It is held under node with hostile synthetic frames (`cliff-readability.test.ts`: a column
mixing readable and sunk pixels, band heights whose median is not their mean, untouched columns that
must not widen the cliff, the bar exclusive at exactly 20).

## 4. The re-pick — a ladder against the sea, judged by the look

The shaded rock keeps the measured quartile's chroma and is scaled so its darkest delivered pixel
sits a stated luma above the sea (`shadedRockAboveSea`). Four rungs were rendered beside the
withdrawn rock and the single rock, on the same instrument, at one island and 8 px per unit —
`ladder-crop.png` is the cliff band at 3x, `ladder.png` the whole island. ⚠ Crop BEFORE you
compose: on a whole-island sheet the 18-px band is ~5 px and every rung looks identical, which is
what `harness/crop-sheet.mjs` (beside `contact-sheet.mjs`) exists for —

```bash
node harness/crop-sheet.mjs --out ladder-crop.png --x 800 --y 905 --w 700 --h 100 --scale 3 --cols 1 "rock=rock-one-8.png" "two-token-deep=two-token-deep-one-8.png"
```

| arm | luma above the sea | anchor | STRUCT | apparent height |
|---|---|---|---|---|
| `two-token-sunk` (withdrawn) | 6 | 29.7 | 24.94 | 6 px |
| **`two-token-deep` — the fence's floor, SHIPS** | **21** | 46.7 | 22.19 | 18 px |
| `two-token-mapped` — the quartile re-based onto the headroom | 28.5 | 55.6 | 20.88 | 18 px |
| `two-token-sea36` | 36 | 64.2 | 19.60 | 18 px |
| `two-token-sea44` | 44 | 73.3 | 18.34 | 18 px |
| approved render (reference arm) | — | 42.65 | 30.05 | — |

**The pick is the fence's own floor: 21 luma above the sea, `#2e333b`, found by search
(`darkestShadedRock`) rather than authored** — the darkest base whose every delivered pixel still
clears the bar on some channel (20 delivers moves OF 20 at the ladder floor — on the bar, not over
it). By the look — applied twice, on the grass-only ground and again on the stacked ground, with
`ladder-crop.png` the second — it is the deepest two-tone cliff that is still plainly a cliff and
not the sea; the withdrawn pair's base is the water, and every lighter rung compresses the pair
toward the single grey rock. The stack did not move the choice. It is also the rung whose dark
anchor lands nearest the approved render's (about 4.1 luma off, against the mapped quartile's
12.9). The owner directed bold, judged by a picture per step, with "scale it back" as his
lever (ADR-0503): the ladder is rendered, and scaling back is one constant moved to a rung already
pictured — `mappedShadedRock` stays on the page as `two-token-mapped` for exactly that reason.

**What the pair can no longer do, stated so nobody re-derives it.** The pair no longer reaches the
approved 5.7x range; against this sea no pair can, because the range now starts above the water
rather than at the render's transparent p2. The reachable span is the lit rock's full light over the
sea floor, **2.90x**, and the shipped pair delivers **2.82x** of it. The withdrawn pair "reached"
4.46x by spending pixels below that floor. `stepped-skirt.test.ts` now asserts the ordering (the
pair outranges one token, and the re-pick cannot outrange the sunk pair); the harness test asserts
the pair against the span the sea permits.

**It still buys separation from the statuses rather than spending it.** The re-picked rock's whole
ramp sits below `unhealthy`'s (delivered 40.6–50.7 against 67.1–83.9), it stays the island's darkest
value, and it clears its nearest status pixel by 28.8 in RGB against the single median rock's
9.0 — all three re-derived on every run.

## 5. The page itself moved onto the shipped builder

Every arm on the skirt page is now built from `shippedGroundBuild` — the map's one construction of
its ground input — memoised **once per crowd size** and shared by every arm, with `skirt` as the only
key an arm overrides. Two things follow: the control can no longer be a different scene from the map
(`comparison-baseline-moves-under-the-page`'s hazard, closed structurally), and a ten-arm ladder is
affordable — the occlusion field is the expensive half of the build and it does not depend on the
arm, so building it per arm had pushed the mount past the driver's five-minute wait. The material is
composed on the page (its token table carries rows the map does not draw) by mirroring
`buildGroundMaterial` key for key — layer 1 and, since PR #1802, layers 2/3/4/6 through the build's
own packed carriers (`build.shore()` / `build.wear()`, with the crowd's strips handed in so the
path has docks) at the shipped strengths. The comment that promised the mirror is now a test:
`harness/shipped-skirt-scene.test.ts` reads `buildGroundMaterial` and `buildSkirtScene` and fails
when either sets a material option the other does not — the landing this README documents was
itself cut on a branch before #1802, and would have compared cliffs on a ground that no longer
ships had the page not been brought across in the same landing.

## 6. ⚠ The owner's test — applied, not deferred

> **LOOK AT THE FINAL RENDER AND ASK: CAN I TELL WHAT STATE THIS ISLAND IS IN?**

**YES — and now also: can I tell the island from the sea? YES.** At the forest overview the cliff
is sub-pixel and the arms are indistinguishable; every island reads by its top face. At the read
zoom the top face is untouched by one bit, and the cliff is a two-tone band — a pale course over a
dark base — that stands clear of the water on every rung it can be delivered at. No rock ledge can
deliver a status colour, and the pair clears the statuses by more than the single rock did.

## 7. ⚠ The mutation rung cannot reach the page, so the instrument was seeded by hand

`check:mutation-diff` mutates `src/` only, so every line under `harness/` is explicitly unproven by
it. `cliff-readability.ts` was seeded with eight faults by hand — the bar made inclusive, untouched
pixels counted as cliff, empty columns kept in the medians, the lower median made upper, the
fraction's denominator swapped, a channel dropped from the sea distance, the band median reading the
readable list, the size refusal removed — each restored before the next: **7 of 8 killed on the
first sweep, 8 of 8 on the second.** The survivor was a real defect in the TEST, not the module: a
four-bytes-short buffer was still refused with the size check deleted — by the width check behind
it, whose message also says "bytes" — so the fixture now hands the instrument a buffer one whole
ROW short, which only the size refusal can catch, and asserts its own message.

## 8. Files

| | |
|---|---|
| `src/stepped-skirt.ts` | `SKIRT_ROCK_SHADED` re-picked; `SKIRT_ROCK_SHADED_SUNK` kept for the page; `shadedRockAboveSea` / `mappedShadedRock` / `darkestShadedRock` |
| `harness/skirt-rock-separation.test.ts` | the sea fence on every rung, its non-vacuity, the pin of the shipped hex to the search, the span the sea permits |
| `harness/cliff-readability.ts` + `.test.ts` | the apparent-height instrument and its hostile fixtures |
| `harness/shipped-skirt-scene.ts` | the shipped builder memoised per size; the whole ground stack mirrored onto the page's own token table; the withdrawn rock and the ladder as arms; `readability` on the runner |
| `harness/shipped-skirt-scene.test.ts` | the page's material mirrors the canvas's key for key, reads the shipped strengths, and hands the builder the crowd's strips |
| `harness/shipped-skirt-measure.mjs` | the three sea refusals and the readability report |
| `harness/crop-sheet.mjs` | the same rectangle cropped out of several frames at 3x, as one captioned sheet — how `ladder-crop.png` was made |
| `src/stepped-skirt.test.ts` | the span premise re-derived against the sea |
| `ladder.png` / `ladder-crop.png` | the owner's look: the ladder beside the withdrawn rock and the single rock |
| `*-one-8.png` / `*-forest-fit.png` | the frames, one per arm per size |
