---
status: accepted
arc: act2-camera-choreography-arc
---
# ADR-0313: Act 2 camera choreography stays on the regrow cursor and yields cleanly to the viewer

## Status

accepted (2026-08-06, corrected in place after the PR #1175 visual review) — the owner directed the
remaining product choices after reviewing the production measurement, then corrected the opening
framing after seeing the first landed version: open closer than PR #1175 at the BOTTOM of the forest,
pull back from that fixed bottom anchor as the existing Act 2 regrow reveals upward, and finish at the
ordinary fitted whole-forest camera. The scripted camera owns the short regrow and ordinary pan/zoom
controls resume after settle. There is no first-person view, focal-island or growth-frontier tracker,
independently timed pan choreography, or user-takeover state machine.

## Context

The Act 2 regrow already contains the detail the owner asked to see, but the fitted whole-forest
camera makes a 128×128 tree read as a smudge. The intended app feature opens close enough to read an
island at the forest's bottom and pulls back from that foundation to fit the upward reveal as the
existing 40-island run grows.

The architecture has one load-bearing fence: the camera must be a pure projection of the same
normalized cursor that drives pathways, accretion, and vegetation. ADR-0292 removed a second
wall-clock vegetation beat because it could not see ADR-0286's speed dial; a camera tween, CSS
transition, or private rAF clock would recreate that defect at composition scale. Reduced motion
must settle rather than play, the camera must be still at cursor 1, and manual viewer control must
not be overwritten by a later cursor sample.

The performance fork had not been measured. ADR-0272 showed that a static pan is cheap only while an
HTML wrapper moves an already-rasterised SVG layer; committing the SVG `<g>` transform re-rasterises
the full subtree. During a regrow the layer is not static, so neither the SVG camera path nor the
HTML compositor path could be assumed to ride free.

`camera-rasterisation-probe` measured that question on a production build at 1600×1000, Chromium
148.0.7778.96, DPR 1, against the real corpus resolving to exactly 40 mapped islands. Runs
alternated four growth-only controls with two SVG translate+scale and two HTML compositor-translate
variants. Each transform was a pure function of the existing `act2Player.progress`; sampling
observed rAF and never drove it. All 8 runs had both adjacent idle-floor medians at 16.7 ms and all 8
restored the exact fitted camera.

Painting means a live `[data-island-accretion-cell]` count greater than zero, as in ADR-0286; buckets
are total elements then present under `.world-camera`. Pooled painting-frame p50s were:

| map nodes | growth only | SVG camera | delta | HTML compositor | delta |
| --- | ---: | ---: | ---: | ---: | ---: |
| 0–4k | 16.7 ms | 16.7 | 0.0 | 16.7 | 0.0 |
| 4–8k | 216.7 ms | 249.9 | +33.2 | 366.7 | +150.0 |
| 8–12k | 516.7 ms | 533.3 | +16.6 | 766.7 | +250.0 |
| 12–20k | 399.95 ms | 533.35 | **+133.4** | 516.7 | **+116.75** |

The current growth-only absolute floor did **not** reproduce this arc's inherited 122.9/128.3 ms
busiest-bucket pair, despite clean brackets, so this record makes no cross-date regression claim.
The interleaved deltas on one build/browser/box are the comparable evidence. Wall-clock run spans
also moved: controls were 30.1–31.9 s, SVG variants 30.8/33.9 s, and compositor variants 33.6/34.5 s.
The schedule fractions were identical; costly frames interacting with the player's 500 ms backstop
stretched some runs. That violates the arc's unchanged-duration end state if shipped as-is.

## Decision

### D1 — The non-negotiable architecture is one cursor and a still settlement

Any eventual camera state is a pure function of the existing normalized regrow cursor plus immutable
world/frame geometry. It adds no tween, transition, timer, rAF driver, or independently advancing
state. Cursor 1 returns the ordinary fitted camera exactly; nothing camera-related continues to
transform after settle. Changing ADR-0286's speed changes only how quickly the shared cursor is
crossed.

The owner directed this invariant and the product choices below on 2026-08-06.

### D2 — Ship the bounded bottom-anchored cursor-driven zoom-out

The production probe shows that moving the camera while the forest changes is not free. PR #1175
therefore fixed one deliberately small product parameter: an opening scale `2.25` times the ordinary
fitted camera under one centre-anchored framing. The owner's visual review accepted that move
mechanically but rejected its opening composition: the replacement opens closer than `2.25` and
keeps the immutable forest-bottom point at the ordinary fit's lower safe-frame position while the
visible span expands upward on the same cursor. Scale and translation are one projection, not a
separately timed pan. The replacement must re-run the same interleaved 40-island production protocol
against a same-build growth-only control; it may not quote either ADR-0272's static-pan result or PR
#1175's centre-anchored result as evidence that the revised movement is free.

On build `c7eaac1b+act2-regrow-camera-final`, all 8 runs were admitted and none rejected. PR #1175's
centre-anchored path had pooled painting-frame p50 deltas of 0.0, 0.0, -16.5 and 0.0 ms across the
0–4k, 4–8k, 8–12k and 12–20k map-node buckets. Growth-only runs spanned 29.55–29.57 s and that path's
runs 29.55–29.58 s. This records no material frame-cost or duration penalty for the superseded
centre-anchored composition on that build/browser/box; it is calibration context only and supplies
no evidence for the replacement.

The product choreography starts closer at the forest bottom, derives the bottom-anchored visible
span directly from the existing normalized regrow cursor plus immutable frame/world geometry, and
returns the ordinary fitted camera exactly at cursor 1. It changes only what the viewer sees: island
order, accretion timing, vegetation timing, and the regrow schedule stay authoritative.

### D3 — Reduced motion stays fitted without choreography

When `prefers-reduced-motion` is active, the camera remains at the ordinary fitted whole-forest view.
No zoom plays and settlement requires no camera cleanup.

### D4 — The scripted camera owns the short regrow, then ordinary controls resume

Pan and zoom input do not take over during the scripted regrow. At settle the choreography stops
writing camera transforms and the existing pan, wheel, keyboard, and zoom controls resume against the
ordinary fitted camera. There is no cancellation or user-takeover state machine.

### D5 — The choreography is one bottom-anchored zoom-out, not a tracker or pan sequence

The camera follows one cursor-derived zoom from a close bottom frame to the fitted forest. Its
translation is only the geometry required to retain the immutable forest-bottom anchor while the
visible span grows upward; it is not free pan choreography. It does not inspect or track a runtime
growth frontier, select a focal island, pan between islands, enter a first-person mode, or introduce a
second narration/state machine. The opening scale is closer than PR #1175's `2.25` and must be
bounded by the requested tree-detail reveal, the replacement production measurement, and the
operator-attested visual leg. The shipped implementation remains Studio-owned. This decision does not
deliver website integration; if the website intro adopts the move later, that increment must consume
an app-owned shared seam rather than reimplement the choreography.

## Consequences

**Good.** The owner gets one legible bottom opening and one upward-reveal pull-back without another
clock or interaction mode. The repeatable exact-route production instrument remains the evidence
surface, the regrow stays authoritative, reduced motion stays quiet, and the fitted settled camera is
exact.

**Costs.** PR #1160 measured material rasterisation cost for both obvious diagnostic transform paths
during the changing forest. PR #1175's centre-anchored remeasurement found no material frame-cost or
run-span penalty for that bounded path on the measured build, but the replacement still changes a
live transform while the forest paints and has not yet been measured. The prior clean comparison
does not make camera movement generally free or prove the replacement cheap.

**Risk.** The absolute growth-only baseline varied materially from the inherited pair while the idle
brackets were clean. The replacement measurement must continue interleaving controls and the chosen
path on the same build/browser/box; historical absolute numbers and PR #1175's centre-anchored run are
calibration context, not a substitute control. The closer bottom framing and the upward reveal's
appearance and pacing still require the owner's stage-2 visual verdict.

## References

- [ADR-0272](0272-a-forest-map-pan-frame-is-rasterisation-not-density-pan-move.md) — static pan's
  compositor path and the SVG re-rasterisation finding; narrowed here for a changing layer.
- [ADR-0286](0286-the-forest-regrows-on-first-arrival-each-session-paced-by-a.md) — the production
  protocol, speed dial, shared cursor, and inherited growth-only baseline.
- [ADR-0292](0292-every-island-grows-the-owner-s-exp-16-tree-from-one-shared-t.md) — single-cursor
  vegetation and the no-motion-after-settle fence.
- `stories/studio/camera-rasterisation-probe.md` — the evidence-producing capability.
- `apps/studio/src/components/cameraRasterisationProbe.ts` — exact gate, pure diagnostic transform,
  admissibility, bucketing, and report projection.
- `apps/studio/scripts/measure-camera-rasterisation.mjs` — production Chromium collector.
- `docs/research/act2-camera-rasterisation-2026-08-05/` — raw JSON and comparison table for the
  admitted 8-run set.
- `docs/research/act2-regrow-camera-final-2026-08-06/` — raw JSON and comparison table for the final
  product curve's admitted 8-run set.
