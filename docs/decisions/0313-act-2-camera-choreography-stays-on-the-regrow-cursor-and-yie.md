---
status: proposed
arc: act2-camera-choreography-arc
---
# ADR-0313: Act 2 camera choreography stays on the regrow cursor and yields cleanly to the viewer

## Status

proposed (2026-08-05) — the owner has directed the invariants (one existing run cursor, no second
clock, reduced-motion support, no fight with manual pan/zoom, and a still fitted camera at settle),
but has not chosen the framing, curve, base-node focus, or manual-input takeover policy. The
production measurement below rules out treating either tested camera path as free; it narrows the
fork without ratifying a choreography.

## Context

The Act 2 regrow already contains the detail the owner asked to see, but the fitted whole-forest
camera makes a 128×128 tree read as a smudge. The intended app feature opens close enough to read an
island and pulls back to the fitted forest as the existing 40-island run grows.

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

This is already owner-directed, but the ADR remains proposed because the product choices below are
not separable implementation details: they determine what the camera shows and how it yields.

### D2 — No production choreography ships on the measured paths yet

Both tested paths add material cost in the heavy painting buckets, and both can stretch wall-clock
duration under the existing player. The measurement increment therefore ships the reproducible
diagnostic and evidence, not a camera move. A later proposal must either reduce that cost, reduce how
often/where the camera changes, or explicitly present a measured trade to the owner. It may not quote
ADR-0272's static-pan result as evidence that translate during a changing regrow is free.

### D3 — Reduced motion is narrowed, not yet ratified

The proposed reduced-motion behavior is the fitted whole-forest camera with no choreography. It is
consistent with the existing regrow settlement and guarantees no camera motion is playing, but it
remains part of the owner's unratified product choice while this ADR is proposed.

### D4 — Manual input must own the camera; the takeover shape remains open

The eventual implementation must never reapply choreography after the viewer pans or zooms. The
recommended policy is that the first wheel, drag, or keyboard camera input cancels choreography and
leaves the viewer holding the camera they created; disabling input for the run is the alternative
the arc explicitly permits. This ADR chooses neither while proposed.

### D5 — The remaining visual forks stay explicit

Still open for owner/design resolution: fixed curve versus growth-frontier tracking; one base island
versus the four graph roots; the amount of close framing; and whether the website consumes exactly
the app choreography or only the app-owned camera primitive. None is encoded in the diagnostic
motion shape, whose only purpose is to exercise real browser transform paths.

## Consequences

**Good.** The first increment settles the performance premise before spending on choreography. It
leaves a repeatable exact-route production instrument, raw frame/cursor/node/transform evidence, and
a comparison table. The clean app route is unchanged, the regrow remains authoritative, and the
diagnostic cleanup proves the settled camera is exact.

**Costs.** The arc is not visually complete and has no operator-attested leg yet. The measurement
shows that the obvious SVG and compositor mechanisms both miss the present duration/cost fence in
the heavy forest, so the next increment needs an evidence-backed mechanism or an owner-approved
trade rather than a straightforward tween.

**Risk.** The absolute growth-only baseline varied materially from the inherited pair while the
idle brackets were clean. Future work must continue interleaving controls and variants on the same
build/browser/box; historical absolute numbers are calibration context, not a substitute control.

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
