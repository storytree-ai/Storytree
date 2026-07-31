---
status: accepted
decided: 2026-07-31
amends: [240, 69]
arc: studio-map-responsiveness-arc
---
# ADR-0272: A forest-map pan frame is rasterisation, not density — pan moves off the SVG transform

## Status

accepted (2026-07-31) — decided/directed by the owner in conversation on 2026-07-31, on the strength
of the measurement below. Design-time alignment IS the ratification (ADR-0110); no second
end-of-flow ask.

**Amends [ADR-0240](0240-studio-map-responsiveness-cache-and-defer-before-cutting-den.md)** in two
places, and overturns neither the arc nor the four stages that landed under it. ADR-0240 decision 1
("the felt cost is re-computation and re-mounting, **not rendering**") is TRUE OF THE COSTS IT
MEASURED — boot, re-entry, and DOM mount — and stages 1–4 removed exactly those. It is NOT true of a
pan frame, which ADR-0240 never measured and which is ~99.8% rendering. And ADR-0240 decision 2's
closing clause ("only then bound the density") named the density budget as the stage that would
finally make the map feel immediate; measured, the density lever cannot reach 60 fps even if every
flower and every ground cell is deleted. Decisions 3 (cached paint is never cached truth) and 4 (the
density budget is sequenced, not designed, there) stand untouched.

**Also amends [ADR-0069](0069-parameterise-the-forest-world-geometry-as-a-procedural-pipel.md)**,
whose decision 3 keeps a renderer swap named-deferred behind explicit triggers — one of which,
trigger (b), is *"node count grows past ~3,000–5,000 (≈ 3–5× today) and static pan/zoom degrades on
members' devices"*. **Both halves of that trigger are now measurably met**: the map is 18,793
elements (~19× the ~1,000 of June 2026, and ~4× the top of the stated range) and pan degrades to
3.6 fps. Read literally, ADR-0069 would now sanction executing the swap. It should not, and decision
5 below narrows it: the trigger silently assumes the degradation is inherent to the substrate, and it
is not — it is one avoidable per-frame invalidation. Trigger (b) therefore gains a precondition.

## Context

The owner's reported symptom throughout this arc has been one thing: **choppy pan when zoomed out,
in the desktop app.** Stages 1–4 (#951, #954, #979, #989, #1000) each removed real repeated work —
return, reload, repeat, boot — and none of them touched that symptom, because none of them was about
it. ADR-0240 measured boot cost, rebuild cost, and DOM mount cost (~70 ms to clone and insert the
whole 16.6k-node `.world-camera` subtree) and generalised from the mount number to a claim about
rendering in general. **The cost of a single pan frame had never been measured.**

Measured 2026-07-30/31 in the REAL desktop app (Electron via `_electron`, not plain Chrome — this
surface has produced false passes in a browser tab), at the app's own default 1280×860 window, DPR 1,
against the real corpus (45 stories / 222 capabilities / 956 declared contracts):

- The map is **18,793 elements** under `.world-camera` — 13,823 `<path>` carrying 1.11 MB of `d`
  geometry, 2,453 `<g>`, 1,002 `<ellipse>`, 554 `<polygon>`, 382 `<circle>`, 40 `<image>`.
- At the settled `fit:'contain'` camera (scale 0.218) **18,060 of those are in the viewport and zero
  are off it** — there is nothing for the browser to cull. That is the zoomed-out symptom condition.

**Where one shipped pan frame goes** (median of 3 interleaved reps; frames driven from an in-page
`requestAnimationFrame` loop):

| phase | cost |
| --- | --- |
| script — the JS that sets the transform attribute | **0.1 ms** |
| style recalc + layout (forced flush, timed separately) | **0.3 ms** |
| paint + rasterise + composite | **~274 ms** |
| **total** | **275 ms → 3.6 fps** (idle floor 16.7 ms) |

A separate CDP trace corroborates the attribution: the renderer main thread is dominated by
`PaintArtifactCompositor::Update`, the GPU process by `RasterDecoderImpl::DoEndRasterCHROMIUM::Flush`;
`Layout` (60 ms), `Document::recalcStyle` (33 ms) and JS `FunctionCall` (129 ms) are noise beside them.

The mechanism: writing `transform` on an SVG `<g>` (`TreeView.tsx`, the `.world-camera` group)
invalidates the paint artifact for the entire subtree. An SVG child element gets no composited layer
of its own, so there is no layer to slide — all ~14k paths are re-recorded and re-rastered every
frame.

**Candidate deltas** (p50 ms per frame; three viewing conditions):

| | @ fit (the symptom) | @ zoom ×4 | 640×430 (¼ the pixels) |
| --- | --- | --- | --- |
| idle control | 16.7 | 16.7 | 16.7 |
| **A. shipped `<g transform>`** | **275** | 99.9 | 316.8 |
| A + `will-change` on `.world-camera` | 133 (2.1×) | 150 | 166.7 |
| A + `will-change` on the `<svg>` root | 333 (**worse**) | 99 | 316.8 |
| A + `contain: paint` on island groups | 292 (**no help**) | 99.9 | 349.9 |
| A + ALL flora hidden (−63% of the DOM) | 133 | 33.4 | 166.6 |
| A + flora AND ground cells hidden (−82%) | 33.3 | 16.7 | 49.8 |
| **B. CSS transform on an HTML wrapper** | **16.7 (16.5×)** | **16.7** | **16.7** |
| C. real gesture — React commit + hit-test | 283 | — | 316.6 |

Two controls identify the cause. **Quartering the viewport pixels changed nothing** (316.8 ms with
the same 18,060 elements in view) — so it is not pixel- or fill-rate-bound. **Holding pixels constant
while cutting in-view elements to 4,399 (zoom ×4) cost 99.9 ms** — so it is bound by the number of
distinct path geometries in view. That is also precisely why the symptom is zoom-dependent: zoomed
in, the browser already culls; at the fit there is nothing to cull.

React is not implicated: the real gesture (283 ms) costs ~8 ms more than setting the attribute alone
(275 ms), about 3%. The `SceneView` memo and the stage-1 coalescer are doing their jobs.

`contain` / `content-visibility` fail twice over: measured no help, and per CSS Containment they do
not apply to non-root SVG elements at all — a category error, not a tuning failure.

## Decision

1. **A pan frame's cost is RASTERISATION of the elements in view — not script, not style, not
   layout, not React, and not the viewport's pixel count.** This is the measured finding above and it
   is what any future work on this surface calibrates to. ADR-0240 decision 1 is narrowed
   accordingly: its "not rendering" holds for boot / re-entry / mount, and not for the per-frame path.
2. **The camera stops being an SVG `<g transform>` for the duration of a gesture.** Pan is applied as
   a compositor-only CSS transform on an HTML wrapper around the `<svg>`, and committed back into the
   `<g>` when the gesture ends. Measured: 16.7 ms per frame — the idle floor — with all 18,793
   elements present and **no visual change whatsoever**.
3. **Density / LOD is NOT the remedy for pan, and stops being this arc's next stage.** Flora is
   11,796 of 18,793 elements (62.8%); deleting all of it reaches only 133 ms (7.6 fps), and deleting
   flora *and* every ground cell — 82% of the map — reaches only 33 ms. Fitting those points, a
   16.7 ms budget affords ~2,800 elements: **~85% of the map would have to disappear** to fix pan by
   density alone. A density budget is not retired as an idea, but it is de-sequenced here: it may
   only return against its own fresh evidence, for a cost it can actually pay down (mount, not pan).
4. **[ADR-0238](0238-forest-flora-remains-an-algorithmically-compressed-proof-den.md) decision 2 is
   untouched.** This decision proposes no change to flora quantity, so monotonicity in `testCount`
   for a fixed surface/seed is preserved by construction. Nothing here is routed to the owner as a
   monotonicity trade — and decision 3 is precisely what removes the pressure that would have
   produced one.
5. **The map remains SVG, and ADR-0069's swap trigger (b) gains a precondition.** ADR-0240's
   "the map remains SVG" stands, now on stronger evidence than the mount number that originally
   carried it: SVG at this element count is fine, provided it is not re-rasterised every frame.
   ADR-0069 trigger (b) — past ~3,000–5,000 nodes *and* pan/zoom degrades — is met on both halves
   today and **still does not fire**, because it was written on the assumption that degradation at
   scale indicts the substrate. It does not here: the same 18,793 SVG elements pan at the 60 fps
   vsync floor once the transform moves off the `<g>`. **Trigger (b) is therefore read as: node
   count past the range, and pan/zoom degrades *with the per-frame path already compositor-only*.**
   Decision 2 SHIPPED on 2026-07-31 (capability `compositor-pan-transform`), so the precondition is
   satisfied and trigger (b) is evaluable — and evaluated against the compositor-only path it does
   **not** fire. No renderer swap may be argued from it. These numbers do not reopen the renderer
   question; they close it more firmly than the mount measurement did.
6. **"CPU/DOM-bound, not GPU-bound" is retired as a blanket claim about this surface.** That finding
   (ADR-0069's scoping memo, restated in ADR-0240's Context and in the `SceneView` memo comment) is
   right about mount and rebuild, which is what it measured. On a pan frame the single largest item
   in the trace is GPU-process rasterisation (`RasterDecoderImpl::DoEndRasterCHROMIUM::Flush`). The
   correction is not "the GPU is too weak" — it is that we currently ask it to re-rasterise the whole
   forest 60 times a second, which is a pipeline mistake rather than a hardware limit. Anyone citing
   the CPU/DOM framing must say which cost they mean.

## Consequences

**Good.**

- The owner gives up nothing. Full flora density, every ground cell, the whole proof-density signal,
  at 60 fps.
- The change is studio-local — `apps/studio/src`, not `packages/forest-world/src` — so it drags no
  web-engine sync-and-pin dance, and no owner attestation of the look, because the look does not
  change. That is the opposite of what ADR-0240 predicted the responsiveness endgame would cost.
- It regresses none of the prior work: the `SceneView` memo, `sameRows` poll identity, the
  `nextSceneNow` idle freeze, stage 1's coalescer, stage 2's three cache guards, stage 3's memo and
  validators, and stage 4's boot independence are all untouched and still load-bearing.
- Click selection is unaffected: `sceneTapSelect` hit-tests via `document.elementFromPoint` in client
  coordinates, which respects CSS transforms. Verified by reading the code, not assumed.

**Limits, named rather than buried.**

- **A compositor-only pan still pays one full raster when the layer is built.** Measured warm-up
  frames of 100–380 ms. The honest shape is *60 fps during the drag, one expensive frame at each
  end* — which is the felt symptom, but it is not "the cost is gone".
- **Zoom is not fixed by this.** Scaling a rasterised layer is blurry, so a wheel gesture still wants
  a re-raster. The same commit-on-settle trick applies but was not measured.
- **The `<svg>` is viewport-sized** (`width/height: 100%`), so translating a wrapper slides real
  content off one edge and blank in at the other. Of the two options named here — commit back to the
  `<g>` on release, or render the SVG oversized — the build session took the first (recommended, and
  cheapest): `commitPendingPan` in `apps/studio/src/components/TreeView.tsx` folds the wrapper's
  accumulated offset into the `<g class="world-camera">` transform when the gesture ends. Settled;
  no longer open.
- **The arc's end-state clause "when the map's render cost is bounded rather than linear in
  capability count" is NOT satisfied by this decision** and should not be read as if it were. The
  first raster stays O(elements); what changes is that a pan no longer pays it. Whether that clause
  should be reworded, or kept as a separate unmet goal, is the owner's call and is deliberately left
  open here rather than quietly edited away.

**The pattern, for the fourth time.**

ADR-0240's Status block already names this arc's recurring failure — "prescribing a mechanism without
first asking what it can SEE or what it is FOR" — across three prescriptions. This is the fourth
instance and it is the same root wearing a different coat: decision 1 generalised a MOUNT measurement
(~70 ms to insert 16.6k nodes) into a claim about rendering *in general*, and that claim then
sequenced four stages of work away from the owner's actual symptom. Two of the three earlier failures
were mechanisms that could not observe what they gated — the third mis-prescribed a TREATMENT for a
payload whose role was never asked about, which is the "or what it is FOR" half of ADR-0240's root
and a different failure; this one is a **measurement of one thing quoted as evidence about another**.
Worth carrying forward: on this surface, a number is evidence only for the thing it actually
measured.

*(It WAS carried forward, and the fence came off — recorded in place 2026-08-01 per ADR-0139. On
2026-07-31 the rule graduated to `asset:an-observable-is-evidence-only-for-what-it-observes`, which
holds both faces as one — design-time, a check must key on something that can SEE the property it
gates; inference-time, a number is evidence only for what it actually measured — with no
"on this surface" restriction and a discriminating test to apply at both. The words above are
deliberately left exactly as written rather than widened: the Library artifact quotes this sentence
AS the tell that the corpus had re-derived the shape locally, once too often, without ever
generalising it — so rewriting it here would falsify the evidence the principle rests on. Only the
REACH changes: "on this surface" was honest when written and is no longer a fence.)*

**Measurement traps this arc should not re-pay.** All three silently corrupt rather than fail:

- An **occluded or backgrounded window throttles `requestAnimationFrame` to 1 Hz**, which reports as
  a perfectly plausible ~1008 ms per frame. It replaced three samples before three *different*
  variants reading the identical 1008.3 ms gave it away. Defeat it with
  `--disable-backgrounding-occluded-windows --disable-renderer-backgrounding
  --disable-background-timer-throttling --disable-features=CalculateNativeWinOcclusion`, and do not
  trust a sample you cannot prove was unthrottled — run a short idle probe before each measurement
  and discard anything whose floor is not ~16.7 ms. With that guard, 0 of 27 samples were discarded
  and reps reproduced to ±3%.
- **CDP tracing perturbs the renderer to ~1 fps**, so a traced run is valid for ATTRIBUTION (which
  events dominate) and worthless for LATENCY. Measure cadence untraced; attribute separately.
- **`Playwright mouse.move` costs a ~350 ms round-trip**, so input-driven panning cannot measure
  frame cadence at all. Drive frames from an in-page rAF loop.

**Two stale claims that were left in CODE COMMENTS.** This ADR landed no code; the build session
that shipped decision 2 corrected the first in passing, and the second is a standing note rather
than a defect:

- ~~`packages/app-surface/src/SceneView.tsx` (the `React.memo` doc comment) and its twin in
  `apps/studio/src/components/TreeView.tsx` each call the O(nodes) React walk **"the felt pan
  lag"**~~ — **CORRECTED 2026-07-31** with decision 2. Both comments now attribute the felt cost to
  rasterisation; the phrase "felt pan lag" no longer appears in either file. The rule they carried
  is unchanged and still binding: keep the memo wrapped — it is real work and still required — but
  the *attribution* was wrong, because the React walk is ~3% of a gesture frame (283 ms with React
  vs 275 ms for the bare attribute write). What the owner feels is the rasterisation this ADR
  measures, not the walk.
- The camera's `transition: transform .35s ease` branch is dead: `animate` is `useState(false)` and
  `setAnimate(true)` appears zero times, confirmed live (computed transition is `none 0s`). Noted so
  the build session does not mistake it for a live easing path it must preserve.

## References

- Arc: `studio-map-responsiveness-arc` (`storytree arc show studio-map-responsiveness-arc --pg`) —
  the increment log carries what landed and when.
- [ADR-0240](0240-studio-map-responsiveness-cache-and-defer-before-cutting-den.md) — the arc's
  sequencing decision, amended here in decisions 1 and 3.
- [ADR-0238](0238-forest-flora-remains-an-algorithmically-compressed-proof-den.md) — flora
  monotonicity in `testCount`, untouched by this decision.
- [ADR-0069](0069-parameterise-the-forest-world-geometry-as-a-procedural-pipel.md) — stay on SVG
  with the renderer swap named-deferred behind explicit triggers; trigger (b) is amended here, and
  the CPU/DOM-bound framing its scoping memo established is narrowed by decision 6. The `SceneView`
  memo it produced is intact and still required.
- `asset:an-observable-is-evidence-only-for-what-it-observes` — the corpus rule that graduated
  (2026-07-31) from this ADR's closing paragraph and ADR-0240's Status block, stated there without
  the "on this surface" fence. The measurements above are its inference-time instance: ADR-0240's
  ~70 ms mount figure quoted as evidence about rendering, against the 275 ms pan frame that is ~99.8%
  rendering. Pull it before quoting any number in this arc as evidence about a cost it did not
  measure — this ADR's own Limits already fence one such gap by hand ("Zoom is not fixed by this…
  the same commit-on-settle trick applies but was not measured"), which is the rule applied rather
  than a separate caveat.
- `apps/studio/src/components/TreeView.tsx` — the `.world-camera` group, which carried the
  per-frame camera when this ADR was measured; since decision 2 shipped (2026-07-31) the per-frame
  write lands on the `.world-pan-layer` wrapper's CSS transform and `commitPendingPan` folds it back
  into the `<g>` on release. Also the `queuePan` coalescer and `sceneTapSelect`.
- `packages/app-surface/src/SceneView.tsx` — the memoized mapper; the `React.memo` doc comment above
  the export (not the file header) documents that a pan skips the O(nodes) React walk so that "only
  the parent `.world-camera` <g> transform attribute updates", which this ADR confirms and re-costs.
  Both that comment and its `TreeView.tsx` twin USED TO call the React walk "the felt pan lag" and
  were corrected when decision 2 shipped; measured, the walk is ~8 ms of a 283 ms gesture frame
  (~3%). The memo is still load-bearing and
  must stay wrapped — but it is not what the owner feels.
- `packages/forest-world/src/scene.ts` — `grassCount = round(2 + tests * 1.9)`, the per-capability
  flora budget whose ceiling decision 3 measures.
