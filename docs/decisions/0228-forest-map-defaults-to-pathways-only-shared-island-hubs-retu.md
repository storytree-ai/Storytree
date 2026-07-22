---
status: accepted
decided: 2026-07-22
amends: [88, 102]
arc: grounded-art-machinery-arc
---
# ADR-0228: Forest map defaults to pathways-only: shared-island hubs return to the map, retire the off-map panel and stamps from the default

## Status

accepted (2026-07-22) — decided/directed by the owner in conversation on 2026-07-22. Design-time
alignment IS the ratification (ADR-0110); no second end-of-flow ask. Amends
[ADR-0088](0088-building-class-stories-surface-in-a-permanent-shared-islands.md) (the permanent off-map
Shared Islands panel) and [ADR-0102](0102-shared-islands-promote-edges-to-per-island-icon-stamps.md)
(per-island icon stamps): both are flipped OFF by default, their machinery kept behind an escape rather
than deleted. The LOOK of the new default map is operator-attested (ADR-0070 stage 2), separate from this
design decision.

## Context

Two owner-directed models de-noise the map's cross-story dependency wiring:

- **ADR-0088** lifts every `render: building` hub (`library`, `cli`, `notice-board`) OFF the laid-out map
  into a permanent left **Shared Islands** panel and SUPPRESSES its edges, because those hubs — `library`
  is depended on by nearly every story — flooded the map with converging roads.
- **ADR-0102** replaces the suppressed edges with per-island icon **STAMPS** ("you carry the icon of what
  you depend on"): a sink hub radiates its glyph onto its consumers, a source hub agglomerates a "city",
  and each island also carries its own identity-key glyph as the legend that decodes the stamps.

Both were the right call **at the time** (2026-06): the road-drawing was primitive, so a heavily-connected
hub genuinely tangled the map. Since then the pathways system has matured decisively
([ADR-0169](0169-pathways-are-procedural-reveal-on-focus-trails-cost-field-ro.md) and its five owner
rounds): trails are always drawn, converging approaches share a single dock, **width encodes usage**
(thin = one dependent, thick = shared), junctions are welded, and meander tapers near junctions. A hub's
many inbound edges now read as a legible fan of merged, weight-graded trails rather than a tangle.

So the problem ADR-0088/0102 solved — hub road-clutter — is now solved by the pathways themselves, and the
panel + stamp model has become a **second, redundant** representation of the same dependencies. The owner,
looking at the live map with the hubs drawn back on it (the built-in `?buildings=off` escape), directed
that this become the default: *lean on the pathways, drop the panel and the stamps.* (Reached while
reframing the grounded-art arc's "more buildings" — the cosy hero **buildings** are a separate, later
decorative concern and can be added back then; this ADR is about the dependency-rendering model, not art.)

The whole panel/stamp/identity-glyph model is **studio chrome** (`apps/studio/src`): the public website's
forest engine (`packages/forest-world`) never rendered it. So changing it is a studio-only default flip —
no `forest-world/src` touch, no web-engine sync.

## Decision

**Flip the studio `?buildings` flag to DEFAULT OFF.** The map now renders pathways-only by default:

1. **Shared-island hubs return to the map.** `render: building` stories are no longer excluded — `library`,
   `cli`, and `notice-board` lay out as ordinary connected islands.
2. **Dependencies are pathways.** Their edges are no longer suppressed/promoted; they route as ordinary
   ADR-0169 trails, width-graded by usage like every other edge.
3. **No stamps, no city, no identity-key glyph.** The distributed icon stamps, the source-hub "city"
   clusters, and the per-nameplate identity-key glyph (ADR-0102) are all gone from the default — clean
   nameplates (the glyph only ever existed to decode the now-absent stamps; owner-directed removal).
4. **The Shared-Islands drawer is hidden when empty.** With no building-class stories held off-map, the
   left panel carries only its Legend section; the empty "Shared Islands" drawer is not rendered.
5. **The old world is an escape, not deleted.** `?buildings=on` restores the full ADR-0088/0102 model —
   panel, stamps, city, identity glyph. The machinery is kept behind the escape (this is an *amend*, not a
   supersede); a later call may delete it entirely if the default proves durable.

Invariants preserved: the public website's forest is byte-for-byte unchanged (it never rendered this
chrome); colour-is-class and one-element-per-signal are untouched (this removes render placements, adds
none).

## Consequences

Good:

- **One representation of dependencies, not two.** Every cross-story edge — including to the hubs — reads
  the same way, as a weight-graded pathway. A viewer learns one visual language for the whole map.
- **The hubs are visible in context.** `library`/`cli`/`notice-board` sit among the stories that use them,
  y-placed by the stress layout, instead of hidden in a side panel — the coupling is more legible, not less
  (honouring ADR-0074 §1's "de-noise, never drop edges" more literally than the stamp model did).
- **Less studio chrome.** The default render skips the stamp/city/glyph overlay entirely.

Trade-offs accepted:

- **No off-map home for a hub's full detail at a glance.** The panel gave `library` a persistent card
  showing its own garden/health without scrolling; now it is an island among islands. Accepted — the owner
  judged the pathways-in-context read the better default; `?buildings=on` restores the panel for anyone who
  wants it.
- **A very heavily-shared hub draws many pathways.** This is the exact density ADR-0088 avoided; the bet is
  that the matured ADR-0169 routing (single dock + usage-width + weld) now carries it. The live default map
  is the evidence; the LOOK is operator-attested (ADR-0070 stage 2).
- **The stamp/panel machinery is now dead in the default path** (kept only for the escape). Retiring it
  fully is a deliberate later call, not taken here.

Landing:

- Studio-only (`apps/studio/src/components/TreeView.tsx` — `readBuildings` default, `StudioWorldChrome`
  identity-glyph gate, `SharedIslandsPanel` empty-drawer hide). No `forest-world/src` change ⇒ no
  `check:web-engine`, no web publish. Reversible as a unit (`?buildings=on`, or flip the default back).

## References

- Amends [ADR-0088](0088-building-class-stories-surface-in-a-permanent-shared-islands.md) (off-map Shared
  Islands panel — now default-off, kept behind `?buildings=on`) and
  [ADR-0102](0102-shared-islands-promote-edges-to-per-island-icon-stamps.md) (per-island icon stamps + the
  identity-key glyph — now default-off).
- Builds on [ADR-0169](0169-pathways-are-procedural-reveal-on-focus-trails-cost-field-ro.md) (the matured
  procedural pathways that now carry the hub density) and
  [ADR-0171](0171-island-placement-is-dependency-aware-stress-majorization-lay.md) (dependency-aware
  placement — the hubs sit in context).
- [ADR-0074](0074-enforce-the-organism-boundary-gate-the-cross-story-dependenc.md) §1 (de-noise, never drop
  edges — pathways honour it directly), [ADR-0070](0070-frontend-as-an-inner-loop-role-the-two-stage-proof-for-visua.md)
  (the new default's LOOK is operator-attested), [ADR-0110](0110-collapse-the-redundant-end-of-flow-adr-ratification.md)
  (owner design-time direction is ratification).
- Arc: grounded-art-machinery-arc.
- Code: `apps/studio/src/components/TreeView.tsx` (`readBuildings`, `StudioWorldChrome`,
  `SharedIslandsPanel`); `apps/studio/src/components/StudioWorldChrome.test.tsx`.
