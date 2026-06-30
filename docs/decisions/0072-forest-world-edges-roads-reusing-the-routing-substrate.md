---
status: accepted
decided: 2026-06-18
amends: [62]
---
# ADR-0072: Forest-world edges: roads, reusing the routing substrate

## Status

accepted (flipped from proposed 2026-06-21 under [ADR-0084](0084-agents-may-flip-an-adr-green.md); owner appearance nod given 2026-06-21 per ADR-0070) — owner steer 2026-06-18, following six rounds of river/pond iteration
(PRs [#204](https://github.com/HuaMick/storytree/pull/204),
[#207](https://github.com/HuaMick/storytree/pull/207),
[#209](https://github.com/HuaMick/storytree/pull/209),
[#211](https://github.com/HuaMick/storytree/pull/211),
[#214](https://github.com/HuaMick/storytree/pull/214) — the `?weld` water world is now the bare
`#/tree` default). The owner's exact direction: *"build a flag to turn it [rivers/ponds] off and
replace it with roads instead, then we can reuse all the routing machinery, and shelf for later all
the pond machinery."* This **amends [ADR-0062](0062-the-forest-world-is-the-observability-layer-rendered-one-art.md)**
(the dependency-edge signal keeps its meaning; only its *art element* changes from water to road) and
is the styling counterpart to [ADR-0069](0069-parameterise-the-forest-world-geometry-as-a-procedural-pipel.md)
(the geometry is a parameterised substrate; the look layered on top is swappable). The appearance is
**owner-attested** under [ADR-0070](0070-frontend-as-an-inner-loop-role-the-two-stage-proof-for-visua.md) —
this ADR records the *direction*; the visual verdict is the owner's screenshot nod, after which a
one-line default flip makes roads the bare `#/tree` world.

**Correction ([ADR-0073](0073-go-all-in-on-roads-retire-rivers-ponds.md), per
[ADR-0139](0139-the-accepted-adr-set-carries-no-stale-prose-correct-in-place.md)):** rollout
decisions 3–4 below were overtaken — the pond machinery is **removed entirely** (not shelved-but-kept),
and roads is **THE only world with no `?world=` selector** (not a default-OFF flag). The §3, §4, and
Consequences references to the shelved-ponds / coexisting-skins model are corrected accordingly. The
core — decisions 1–2 (pivot the edge art element from water to roads; the routing/geometry layer is the
durable restyleable substrate) — stands.

## Context

The forest map draws story **islands** connected by their dependency edges. Those edges have been
styled as **rivers** (sand-banked water channels) and each island grew a **pond** the rivers dock
into. The water look took ~6 polish rounds to get right (welded segments, ponds above the crown,
de-spiked pools — `?weld`, now default-on per PR #214).

Two facts make a restyle cheap rather than a rewrite:

1. **The network was road-like infrastructure first, reskinned as water.** The SVG classes are still
   literally `roadClass(e)` / `world-trail-*`; the per-edge render passes were trails before they
   were rivers. Roads is *partly a re-skin* of the existing edge render passes.
2. **The routing/geometry layer is signal-bearing and look-agnostic.** Where an edge goes
   (`euclideanMST`, `treeDrainage`, `confluenceTree`, `distributaryChains`, `edgePathBundle`,
   `bearingClusters`, `routeAround`, `coastDock`, `offsetCurve`, `smoothOpenPath` in
   [`riverGeometry.ts`](../../apps/studio/src/lib/riverGeometry.ts), driven by `buildBundle`/`buildBasin`
   in [`TreeView.tsx`](../../apps/studio/src/components/TreeView.tsx)) is deterministic, pure, and
   carries the dependency topology. The water-vs-road choice is **only** the per-edge styling on top
   of `world.edges`.

The owner has decided rivers + ponds is not the right direction. The machinery is good; the skin
should change. The open question this ADR settles: do we *delete* the water/pond code or *keep* it?

## Decision

1. **Pivot the forest-world edge styling from water to roads.** Dependency edges render as roads
   (roadbed/shoulder, paved surface, dashed centre-line) instead of sand-banked rivers. The
   per-edge geometry (`world.edges`, each a polyline `d`-string with `flow`/`kind`) is reused
   unchanged; only the styling stack swaps. Roads may use **less meander** (straighter paths) than
   rivers — a gated geometry tweak, not a new topology.

2. **The routing/geometry layer is the durable, RESTYLEABLE substrate** — *one element per signal*
   ([ADR-0062](0062-the-forest-world-is-the-observability-layer-rendered-one-art.md)): the
   dependency-edge signal owns one swappable art element, and we are swapping it. The topology
   helpers are not touched.

3. **Shelf the pond machinery — keep it, do not delete it.** *(Reversed by
   [ADR-0073](0073-go-all-in-on-roads-retire-rivers-ponds.md), per
   [ADR-0139](0139-the-accepted-adr-set-carries-no-stale-prose-correct-in-place.md): the pond
   machinery was **removed entirely**, not shelved — git history is the archive.)* `placePond` /
   `placePondAt` / `placeWeldPond` / `seatCrescentPond` / `pondRing` / `fusedPondShape` /
   `weldPondShape` / `carvePondInlets` / `loopGapArcs` / `crownDisk` / `mergeInletBearings` /
   `pondRadiusForDegree` / `embayCoast` / `crescentApplies` / `nearestRimDock` / `fusedMouthPath` /
   `extendEndpoint` / `weldBothEnds`, the `inland-water` + `weld-pond-above` render groups, the
   `.inland-pond-*` CSS, and the `weld` / `fusedPondMouth` / `coast=crescent` flags were originally
   to stay defined and tested, simply **not invoked** in roads mode (the seam:
   `inland = { ponds: [], channels: [] }`).

4. **Ship behind a new flag, default OFF, owner-attested.** *(Reversed by
   [ADR-0073](0073-go-all-in-on-roads-retire-rivers-ponds.md), per
   [ADR-0139](0139-the-accepted-adr-set-carries-no-stale-prose-correct-in-place.md): roads became
   **THE only world** — no `?world=` selector and no water path.)* As originally shipped, a new world
   selector (`?world=roads`) turned roads on; the water world stayed byte-identical when off and
   remained the bare `#/tree` default until the owner attested the roads look. The geometry of any new
   road-specific pure helper is proven red→green ([ADR-0020](0020-red-green-on-the-owned-loop.md) /
   spine-observed); the *appearance* is owner-attested ([ADR-0070](0070-frontend-as-an-inner-loop-role-the-two-stage-proof-for-visua.md)) —
   no self-signed visual verdict.

## Consequences

  *(The shelve/flag/coexist model in the three bullets below was reversed by
  [ADR-0073](0073-go-all-in-on-roads-retire-rivers-ponds.md), per
  [ADR-0139](0139-the-accepted-adr-set-carries-no-stale-prose-correct-in-place.md): the two skins do
  NOT coexist — the water/pond stack was removed — and reverting is git-history recovery, not a flag
  flip.)*
- **Good.** Cheap pivot — the topology substrate and the render-pass scaffolding are reused, so roads
  is mostly a styling swap plus an `inland`-gating seam. The water/pond work is preserved, not lost:
  if ponds (or a water world) are wanted again, the machinery is one flag away. Default-off + flag
  means the PR lands safely on green CI without changing what anyone sees today.
- **Cost.** Two edge skins now coexist in the codebase (water + road) behind a selector, with the
  water stack kept warm but unused in roads mode — a deliberate carrying cost for optionality, to be
  revisited if roads becomes the settled default and water is retired.
- **Reversible.** The decision is encoded as a flag and a styling seam, not a deletion; reverting to
  water is flipping the default back. The direction (water → roads) is the owner's; this ADR is
  `proposed` until the owner attests the look, at which point the default flips and the status moves
  to `accepted`.

## References

- [ADR-0062](0062-the-forest-world-is-the-observability-layer-rendered-one-art.md) — one element per
  signal; this amends it (the edge signal's art element changes, its meaning does not).
- [ADR-0069](0069-parameterise-the-forest-world-geometry-as-a-procedural-pipel.md) — the geometry is
  a parameterised substrate; the styling on top is swappable.
- [ADR-0070](0070-frontend-as-an-inner-loop-role-the-two-stage-proof-for-visua.md) — two-stage proof:
  red-green geometry + owner-attested appearance.
- [`apps/studio/src/components/TreeView.tsx`](../../apps/studio/src/components/TreeView.tsx) —
  `buildWorld` / `buildBundle` / `buildBasin`, the edge render passes, the scene className.
- [`apps/studio/src/lib/riverGeometry.ts`](../../apps/studio/src/lib/riverGeometry.ts) — the pure
  routing/geometry helpers (reused) and the pond helpers (removed by
  [ADR-0073](0073-go-all-in-on-roads-retire-rivers-ponds.md), per ADR-0139 — not shelved).
