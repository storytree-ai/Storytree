---
status: accepted
decided: 2026-08-02
arc: act2-intro-forest-regrow-arc
---
# ADR-0282: The Act 2 intro regrows the whole forest app-native; one focused tree earns authored frames

## Status

accepted (2026-08-02) — decided/directed by the owner in conversation on 2026-08-02.
Design-time alignment IS the ratification (ADR-0110); no second end-of-flow ask.

## Context

Chapter 2's organic-growth arc spent thirteen experiments on a single island and a single hero tree.
That question — which hero-tree treatment reads as one connected organism — is still open and stays
with `chapter2-pixellab-organic-growth-arc`. This decision is about a different question the owner
raised on 2026-08-02: what the Act 2 **introduction** actually is, and where it gets built.

The owner's framing: a control they can click that regrows the whole forest from the base nodes, built
into the app first, iterated there until it looks right, and ported to the website only afterwards.
They also declined to buy more PixelLab credits, which makes "what art does this need?" a gating
question rather than an afterthought.

Three facts settle it, all verified rather than assumed.

**The corpus holds 45 stories.** Every experiment to date composed one island and one tree. Mounting
the 23-frame authored raster track on 45 territories is a decode and memory non-starter, while the map
already draws every territory's tree as a procedural SVG `story-tree` group that costs the same at 45
as at 5.

**Round 4 measured where each technique wins**
(`docs/research/chapter2-code-only-art-2026-08-01/VERDICT.md`). Four model-free generators matched the
authored track on the mature frame and lost badly on the growth stages — none produced anything a
person would call a sapling. But every mechanical property came free: byte-identical determinism,
perfect anchoring, and unlimited in-betweens. The decisive number is that repairing the authored
track's worst cut cost 6 irreplaceable PixelLab generations to reach 0.457 against a hard floor, while
subdividing a code track's worst cut went 0.676 → 0.953 in 0.8 seconds for nothing. Authored frames
draw the pictures; code owns the motion and the scale.

**The desktop app has no renderer of its own.** `apps/desktop/src/` is `apply`/`backend`/`credential`/
`keychain`/`oauth` and contains no reference to `forest-world` or `app-surface`; the Electron window
serves the studio's built dist and proxies `/api/*` to its own backend
(`apps/desktop/electron/backend-entry.ts`, `static-server.ts`). So there is no desktop port to do —
only a coupling to respect.

## Decision

### D1 — The forest at large grows app-native, at any story count

The Act 2 intro composes growth from machinery that already exists and already scales: Experiment 6's
connected SVG island accretion (`packages/app-surface/src/svg-island-accretion.ts`, the owner's
recorded island lead), the existing procedural `story-tree` renderer, the arrival trail draw-on
(`arrivalGrowPlan` plus the per-segment masks), and the shared semantic player's clock.

No per-territory raster track. No generated land, coast or composite — ADR-0274 D1 continues to hold.
Nothing here is rewritten that already exists and is tested; this increment composes.

### D2 — Exactly one focused tree earns authored frames

The authored raster track is mounted on one focused hero tree, not on the forest. Which treatment that
tree uses is NOT decided here — it remains the open question of
`chapter2-pixellab-organic-growth-arc`, and this ADR must not be read as selecting exp-16 or any
sibling. The seam is the count, not the candidate: one authored track at a time, the rest procedural.

### D3 — The order is the story graph's own dependency order

The regrow walks the real DAG outward from the base nodes — the stories with no `depends_on` — with
each island's incident trails drawing on as it lands. The sequence is derived from the corpus, never
scripted or hand-authored, so the forest grows in the order the project was actually built. A
different graph regrows differently, and the same graph regrows identically every time.

### D4 — This increment requires no new artwork and spends no generations

Island growth, path growth, the small-plant tracks, the procedural trees and the authored hero track
all exist. The Act 2 intro is a composition problem, not an art problem. No PixelLab generation is
spent; the remaining pool is preserved for the hero-tree question that still needs it.

If art is wanted later, the Nano Banana route is available and its known defect is ours, not the
model's: the 2026-07-30 spike's `process-assets.py` removes only background reachable by an
edge-seeded flood fill, so sky enclosed by branches stays opaque — 3,691 px across that sheet, zero in
the three sprout cells and 1,496 / 1,136 in the mature ones. A global colour key removes them, proven
on the shipped asset with no regeneration. The durable fix is to request a chroma background that
cannot occur in the art and key globally rather than flooding from the edges.

### D5 — Build into the shared app surface; the desktop inherits it

The intro is built into the shared app surface that Studio and the desktop both consume. Because the
desktop serves the studio's dist, no separate desktop renderer, port or duplicate implementation is
created.

The one real coupling: the desktop backend RE-COMPOSES the studio's read endpoints and must never
import `apps/studio/server` (ADR-0100). A new API endpoint would therefore 404 in the desktop until it
is re-composed. This increment prefers to need none; if one becomes unavoidable it is re-composed in
`apps/desktop/electron/backend-entry.ts` in the same increment, never left for later.

### D6 — The app owns behaviour, as it always has

Semantic state, normalized progress, ordering, timing, easing, holds, the control, Back, Replay,
reduced-motion settlement, sockets, painter order and the retained final scene are the app's. Reduced
motion settles on the fully grown forest. The clean route stays unchanged. No asset-owned clock, no
second renderer, no remount key standing in for a cursor.

### D7 — The website port is a later initiative

Act 2 ships to the website only after the owner is satisfied with it in the app. Nothing in this
decision authorises a website-local reimplementation of product UI, art or animation, which ADR-0237
already forbids.

### D8 — Explicitly rejected

- A per-territory authored raster track, or any art budget that scales with story count.
- A generated island, coast or scene composite (ADR-0274 D1).
- A scripted or hand-authored growth order that is not derived from the real dependency graph.
- A separate desktop renderer, or a studio-server import from the desktop backend.
- Reading D2 as a hero-tree selection, or this ADR as closure of the organic-growth arc.
- Spending PixelLab generations in this increment.

## Consequences

**Good.**

- The intro costs no art and no vendor spend, which is what the owner asked for.
- It scales to any story count, so the corpus can grow without re-authoring the opening.
- It reuses four tested subsystems instead of building a fifth.
- The desktop gets the intro with no port, and the website port stays a deliberate later step.
- The growth order carries real meaning: the forest grows the way the project was built.

**Costs and risks.**

- Frame cost at 45 territories is unproven. ADR-0272 established that a forest-map frame's cost is
  rasterisation, so this must be measured on the real corpus, not assumed, and reported honestly.
- Procedural trees at scale beside one authored hero tree may read as a style seam; that is an owner
  LOOK call and it may reject the composition.
- The hero-tree question remains open, so the focused tree is provisional until that arc resolves.
- A later art need re-opens the extraction-quality question D4 documents.

## References

- [ADR-0274](0274-pixellab-animates-organic-growth-over-the-app-owned-svg-isla.md) — app-owned SVG
  island as the sole land substrate; organic tracks are author-time only.
- [ADR-0277](0277-occlusion-registered-cutouts-are-plant-only.md) — retained plant tracks.
- [ADR-0264](0264-chapter-2-tree-growth-uses-one-deterministic-topology-rig-wi.md) — superseded
  topology rig; its 2026-08-02 evidence note records what round 4 measured about that reversal.
- [ADR-0237](0237-chapter-2-is-a-scripted-mode-of-the-real-app-share-product-u.md) — Chapter 2 is a
  scripted mode of the real shared app; no website-local reimplementation.
- [ADR-0272](0272-a-forest-map-pan-frame-is-rasterisation-not-density-pan-move.md) — a forest-map
  frame's cost is rasterisation; measure it.
- [ADR-0070](0070-frontend-as-an-inner-loop-role-the-two-stage-proof-for-visua.md) — the owner holds
  the LOOK verdict.
- `docs/research/chapter2-code-only-art-2026-08-01/VERDICT.md` — round 4's measured division of labour.
- `docs/research/chapter2-organic-round3-2026-08-01/RANKING.md` — round 3's hero-tree comparison.
- Arc `act2-intro-forest-regrow-arc` — this initiative.
