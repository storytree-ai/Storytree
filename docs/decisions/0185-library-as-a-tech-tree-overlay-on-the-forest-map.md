---
status: accepted
decided: 2026-07-11
---
# ADR-0185: Library as a tech-tree overlay on the forest map

## Status

accepted (2026-07-11) — decided/directed by the owner in conversation on 2026-07-11 (proposal +
mockups iterated to alignment in-session). Design-time alignment IS the ratification (ADR-0110); no
second end-of-flow ask. The look legs remain operator-attested at build time (ADR-0070 stage 2).

**Amended in part by ADR-0187 (2026-07-12):** after the owner attested the increment-5 overview, the
drawer state machine of **dec 1** (closed → peek → dive) is retired for a **permanent lens + an "Open"
full-detail document overlay** (renamed from "Dive"), and **dec 4**'s overview look bar is raised to the
mockup's information design (drawn edges, size + depth-of-colour = load-bearing, sidebar/legend chrome,
hover cards, fit-to-view framing) — in the polished forest-cozy LIGHT of dec 5, which stands. dec 2/3/6
are unchanged. This ADR otherwise stays accepted; read dec 1 and dec 4 through ADR-0187.

## Context

The studio's Library surface is a separate page (`#/library`, a searchable list/grid) — a route
*away* from the forest map, which is the studio's home surface. The owner dislikes this: the
knowledge corpus is a DAG (`references` edges today; the ADR-0161 node-keyed context DAG as it
populates), and the natural way to *see* a DAG of knowledge over a living world is the city-builder
tech tree — a lens pulled down over the map, not a different room. Research across shipped tech-tree
UIs (Civilization VI, Factorio, Frostpunk, AoE2, Anno 1800; Stellaris/Old World as deliberate
counter-examples) plus large-graph LOD precedents (Path of Exile's ~1300-node passive tree,
sigma.js/Cytoscape label thresholds, Google Maps rank-then-cull, Supreme Commander icon-swap)
grounded the design. The corpus is already too large for browse-everything rendering (161 artifacts
+ 184 ADRs and growing — arcs/plans are new kinds, ADR-0183), which forces the interaction model
choices below.

## Decision

1. **The Library is a drawer over the map, never a route away.** It slides down over the forest
   world inside the map view. **Peek**: drawer down, the map stays fully live below it. **Dive**:
   opening an artifact renders its full body over the rest of the map while the drawer collapses to
   a bar; Esc unwinds dive → peek → map. You only lose the map when you deliberately dive.
2. **Navigation is search-first.** A search-only finder (no kind filter chips) drives a focus
   subgraph: the selected artifact centred, upstream ("stands on") fanned left, downstream ("stood
   on by") fanned right; clicking a neighbour re-focuses (graph walking, breadcrumb back);
   fan-out is depth-limited with expandable "+N more" clusters. This is the Factorio
   focus-on-selection model, and it makes the drawer the visual twin of the ADR-0023 pull-based /
   just-in-time CLI — same doctrine, second surface.
3. **Kind is text, colour is state.** A node renders two lines — title and kind — because the kind
   taxonomy (12 kinds + ADRs, growing) is past what a colour legend can carry. Colour is reserved
   for state: the selected node and its transitive chain light up (the map's trail-reveal idiom,
   ADR-0169), ephemeral kinds render dashed. One channel per meaning. ADRs are searchable and appear
   as neighbourhood nodes (bodies fetched on demand); all 184 are never rendered at once.
4. **The empty state is the whole corpus as a dot constellation** — the tech-tree overview — under a
   level-of-detail ladder: far zoom renders one dot per node (circle = artifact, square = ADR),
   sized by importance (degree + load-bearing); labels appear per screen-space grid for the top tier
   at mid zoom; nodes swap to the two-line plaques at close zoom; hover names anything; search makes
   matches pulse independent of zoom. **Paper-slice card nodes were considered and rejected**: no
   verified product ships card-shaped nodes at 300+ nodes, the per-node element multiplier spends
   the SVG budget on chrome, and a truncated title edge carries no information.
5. **The visual language follows the map's forest-cozy theme** (the drawer is part of the world, not
   an admin panel laid over it). The black-terminal aesthetic is reserved exclusively for the
   session-orchestrator terminal surface (ADR-0174/0175) — no other studio surface adopts it.
6. **v1 is read/explore with zero backend change**, built on the client-side `references[]` graph
   already on the wire. Richer typed edges (`stepRefs` / `branchEdges` / `arcRef`) arrive by
   extending the wire type as a later increment; populating them stays librarian work (ADR-0161).
   `#/asset/<id>` deep links and the existing editor keep working throughout; the standalone
   `#/library` page retires only after the owner attests the drawer.

## Consequences

- The Library and the map stop competing for "where you are" — knowledge becomes a lens over the
  work. The drawer and the CLI now express the same pull-based model in two mediums.
- The corpus's `references` hygiene becomes user-visible (edges ARE the tree); pressure lands where
  it belongs — on curation (ADR-0161 edge population), not on the UI faking structure.
- The build is owned by the `library-tech-tree-overlay-arc` arc with anchored, disposable plans
  (ADR-0183); increments route through the frontend-builder two-stage (red-green geometry,
  operator-attested look). Implementation surface (files, increment order, budgets, traps) lives in
  the plan, not here.
- The overview must hold to the LOD discipline (one SVG element per node at far zoom) to stay smooth
  as the corpus grows toward 2000 nodes; the ladder is the contract.
- The hosted members studio (ADR-0042) inherits the drawer when it lands (same studio bundle); the
  `#/library` retirement call is re-checked against members at that leg.

## References

- Live artifacts: `library-tech-tree-overlay-arc` (arc) — its increment log points at the current
  build plan (plans are disposable and supersede per ADR-0183; plan-1 has been superseded by plan-2).
  Postgres-only: `storytree arc show library-tech-tree-overlay-arc --pg`.
- ADR-0023 (pull-based library / choose-your-own-adventure), ADR-0161 (node-keyed context DAG),
  ADR-0169 (trail reveal), ADR-0171 (stress layout), ADR-0183 (arc/plan kinds), ADR-0110 (born
  accepted), ADR-0042 (hosted studio), ADR-0174/0175 (terminal surface).
- Precedents verified in research: Civ VI / Factorio / Frostpunk / AoE2 / Anno 1800 tech trees;
  Path of Exile passive tree, sigma.js `labelGridCellSize`/`labelDensity`, Cytoscape LOD thresholds,
  Google Maps collision-priority labels, Supreme Commander `IconFadeInZoom`.
