---
status: accepted
decided: 2026-07-26
arc: map-connection-legibility-arc
---
# ADR-0242: Selecting a story lights its immediate neighbours: a lit lane on the incident trail segments

## Status

accepted (2026-07-26) — decided/directed by the owner in conversation on 2026-07-26. Design-time alignment IS the ratification (ADR-0110); no second end-of-flow ask.

## Context

ADR-0169 replaced the docked lines with procedural trails routed over one shared cost field, and
deliberately made routes MERGE: a reuse discount pulls later routes onto existing trails, shared
docks fold a fan of approaches into one thicker road, and the output is a shared-SEGMENT network
where a trunk is drawn once at a width set by how many edges run through it. That is what makes the
map read as a country road network rather than a hairball, and the owner has attested it twice.

The cost is that a single story's own connections stopped being readable. Once your edge has merged
onto a trunk shared with three strangers, there is no way to tell by eye which of the roads leaving
an island are yours, or where they end up. The map answers "how is this forest wired" well and
"what connects to THIS node" not at all.

The obvious repair — recolouring ancestors and descendants — was already tried and pulled: the
per-hex repaint on hover was the reported lag, and since 2026-07-06 the only focus affordance left
is a shore border on the selected island (`.is-selected`). Any new affordance has to stay off the
hex substrate.

Five treatments were mocked against a faithful slice of the routed network — shared segments, the
`trailFillWidth` usage ladder, merged docks — and walked with the owner
(claude.ai/code/artifact/6e57dedb-b7c2-4f97-8368-90c9826e7a37): shore rings only; a lit lane on the
incident segments; the same lane split by direction; quieting every non-incident trail; and a
neutral lane with dashes marching the dependency direction.

Two properties of the merge decided it. First, an incident trunk is partly a stranger's road —
selecting `library` in the mock lights 8 segments, 5 of them shared — so any treatment that paints
the whole road implies exclusive ownership it does not have. Second, one trunk can carry both
directions at once (an upstream and a downstream edge of the same node), which a two-hue directional
scheme has to special-case and a neutral one does not.

## Decision

On selection, light the selected story's IMMEDIATE neighbours — one hop, both directions — as:

1. **A lit lane on every incident trail segment.** The lane is drawn as a separate, narrower stroke
   ON TOP of the existing trail fill, and is **one edge wide**: `min(trailFillWidth(1),
   trailFillWidth(usage) × 0.8)`. The cap is the load-bearing half. Trunks on the real forest run to
   ~11 units wide, so a constant inset leaves a hairline rim and the lane degrades into a recolour;
   capping it at the width of a single-edge road makes it read as exactly what it is — one edge's
   worth of traffic inside a road that carries many — while a usage-1 spur, a road that really is
   the selection's alone, is lit nearly edge to edge. The lane is NEUTRAL: one ink stroke, no
   direction hue. Width, not colour, keeps carrying the merge.
2. **A shore ring on each immediate neighbour island**, tinted by direction: upstream (stories this
   one stands on) and downstream (stories that stand on this one) get distinct rings, alongside the
   ring on the selection itself. The selected island's own ring moves off `--accent` to a warm ink,
   because `--accent` is the downstream hue — leaving it would make the selection and its dependents
   the same colour.

Scope is exactly one hop. Transitive ancestors and descendants stay unlit — the V1 full-closure
highlight is not being restored.

Three constraints hold the shape:

- **The scene graph stays focus-agnostic.** Selection is a SURFACE concern (`packages/app-surface`),
  as `reveal`/`arrivalIds` already are. `packages/forest-world` is not touched, so no web-engine
  sync/pin lineage is dragged along by a studio affordance.
- **The substrate is never repainted.** The affordance touches trail paths and coast strokes only —
  the class of change that was already proven cheap, not the per-hex recolour that was pulled.
- **The selector is pure and tested.** Which segments are incident, and which islands are upstream
  vs downstream, is a pure function of `(TrailNetwork, selectedId)` with its own red→green unit —
  including the merge crux: a trunk shared with a non-incident edge is lit once, and a segment
  reachable only by a non-incident edge is not lit at all.

The *appearance* of the lane and rings is Stage-2, owner-attested (ADR-0070) — never self-signed.

## Consequences

- Selecting a story answers "what connects to this?" in one look, on the map, without a panel.
- A lit trunk stays visibly a trunk: the reader can see that the road carries more than the lit lane.
- Direction is carried by the neighbour rings rather than by the lane, so a trunk carrying both an
  upstream and a downstream edge needs no special case. The cost is that direction is readable at the
  ISLAND, not along the road — an acceptable trade the owner took over the two-hue variant.
- One more presentation-model field and one more render pass in `SceneView`; the model stays a plain
  normalized value, so the memoised bail-out that keeps panning cheap is unaffected.
- The rejected treatments stay recorded above rather than re-litigated: quieting the rest of the map
  reads strongest but overstates ownership of shared trunks, and the directional and flowing variants
  remain available follow-ons if one hop of neutral lane proves not to be enough.
- Two-hop and hover-preview readings are deliberately out of scope; they belong to later increments
  of `map-connection-legibility-arc` if the owner wants them.

## References

- ADR-0169 — pathways are procedural trails: cost-field routing, trail merging, and caves.
- ADR-0070 — the two-stage proof: red→green on geometry/behaviour, operator-attested on appearance.
- ADR-0110 — an owner-directed decision is scaffolded `accepted`.
- ADR-0183 — arcs and plans; this ADR's `arc:` stamp is the containment edge.
- `packages/forest-world/src/routing.ts` — `routeTrails`, the shared-segment network + `trailFillWidth`.
- `packages/app-surface/src/SceneView.tsx`, `WorldSceneView.tsx` — the surface that applies selection.
- Treatment mocks: https://claude.ai/code/artifact/6e57dedb-b7c2-4f97-8368-90c9826e7a37
