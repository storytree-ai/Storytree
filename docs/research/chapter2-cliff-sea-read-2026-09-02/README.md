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
| `rock` (single median rock) | «rock.band» | «rock.readable» | «rock.pct» | **«rock.h» px** |
| `two-token-sunk` (shipped 09-01, WITHDRAWN) | «sunk.band» | «sunk.readable» | «sunk.pct» | **«sunk.h» px** |
| `two-token-deep` (SHIPS — the re-pick) | «deep.band» | «deep.readable» | «deep.pct» | **«deep.h» px** |

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
`ladder-crop.png` is the cliff band at 3x, `ladder.png` the whole island:

| arm | luma above the sea | anchor | STRUCT | apparent height |
|---|---|---|---|---|
| `two-token-sunk` (withdrawn) | 6 | «sunk.anchor» | «sunk.struct» | «sunk.h» px |
| **`two-token-deep` — the fence's floor, SHIPS** | **21** | «deep.anchor» | «deep.struct» | «deep.h» px |
| `two-token-mapped` — the quartile re-based onto the headroom | 28.5 | «mapped.anchor» | «mapped.struct» | «mapped.h» px |
| `two-token-sea36` | 36 | «sea36.anchor» | «sea36.struct» | «sea36.h» px |
| `two-token-sea44` | 44 | «sea44.anchor» | «sea44.struct» | «sea44.h» px |
| approved render (reference arm) | — | 42.65 | 30.05 | — |

**The pick is the fence's own floor: 21 luma above the sea, `#2e333b`, found by search
(`darkestShadedRock`) rather than authored** — the darkest base whose every delivered pixel still
clears the bar on some channel (20 delivers moves OF 20 at the ladder floor — on the bar, not over
it). By the look it is the deepest two-tone cliff that is still plainly a cliff and not the sea;
every lighter rung compresses the pair toward the single grey rock. It is also the rung whose dark
anchor lands nearest the approved render's (about «deep.err» luma off, against the mapped quartile's
«mapped.err»). The owner directed bold, judged by a picture per step, with "scale it back" as his
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
value, and it clears its nearest status pixel by «deep.clear» in RGB against the single median rock's
9.0 — all three re-derived on every run.

## 5. The page itself moved onto the shipped builder

Every arm on the skirt page is now built from `shippedGroundBuild` — the map's one construction of
its ground input — memoised **once per crowd size** and shared by every arm, with `skirt` as the only
key an arm overrides. Two things follow: the control can no longer be a different scene from the map
(`comparison-baseline-moves-under-the-page`'s hazard, closed structurally), and a ten-arm ladder is
affordable — the occlusion field is the expensive half of the build and it does not depend on the
arm, so building it per arm had pushed the mount past the driver's five-minute wait. The material is
composed on the page (its token table carries rows the map does not draw) by mirroring
`buildGroundMaterial`, and says so.

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
| `harness/shipped-skirt-scene.ts` | the shipped builder memoised per size; the withdrawn rock and the ladder as arms; `readability` on the runner |
| `harness/shipped-skirt-measure.mjs` | the three sea refusals and the readability report |
| `src/stepped-skirt.test.ts` | the span premise re-derived against the sea |
| `ladder.png` / `ladder-crop.png` | the owner's look: the ladder beside the withdrawn rock and the single rock |
| `*-one-8.png` / `*-forest-fit.png` | the frames, one per arm per size |
