---
status: accepted
decided: 2026-07-06
amends: [76]
---
# ADR-0169: Pathways are procedural reveal-on-focus trails: cost-field routing, trail merging, and caves (docked-line roads superseded)

## Status

accepted (2026-07-06) — decided/directed by the owner in conversation on 2026-07-06. Design-time
alignment IS the ratification (ADR-0110); no second end-of-flow ask. The owner's steer, verbatim:
*"by default pathways are not visible, they only grow when you click on a story node island …
pathways avoid the islands if possible, they curve and wind like a proper pathway as needed, they
can also merge as needed to get to their destination … if a pathway must go through an island it
goes under it and the map renders a cave on the island for the pathway to disappear into. … all
the systems we implement here are procedural, the system must be able to honestly show a
brownfield system as it is."* Amends
[ADR-0076](0076-forest-tree-docked-line-connections-river-trail-roads-retire.md) the same way 0076
amended 0073: roads stay the one world, but §1's docked-line rendering stops being the road
rendering (corrected in place there per ADR-0139); everything else in 0076 — the building model,
`render: building`, the icon stamps — stands. The LOOK still lands under the ADR-0070 two-stage
proof: geometry red-green machine-side, appearance owner-attested.

## Context

The map's `depends_on` roads are thin perimeter-docked quadratic bows (`dockedRoads` /
`dockedEdgePath`, ADR-0076 §1) — always visible, obstacle-blind, one line per edge. The owner's
diagnosis (2026-07-06): the map is inherently noisy and restyling the lines cannot fix it, because
the noise is structural — pathways overlay the islands and everything on them, they cross each
other so start/end can't be matched, and they beeline straight to their destination.

We have been near here before: ADR-0073 drew every edge as a routed island-skirting trail
(`riverGeometry.ts`, ~1.3k lines + 110 tests — MST/basin, bundling, meander, island routing), and
ADR-0076 retired it for the docked lines ("flip + retire", owner-attested). This decision is not
its revival: the noise problem that system could not solve (every edge visible at once, routed or
not) is solved here by reveal-on-focus, and the machinery lives in the shared render core so all
three surfaces inherit it, where the trail system was studio-side. The retired implementation
remains reference-only prior art (`git show 7dcf297^:apps/studio/src/lib/riverGeometry.ts`).

Since ADR-0093 the render core (`@storytree/forest-world`) owns geometry + scene-graph and each
surface keeps a thin mapper (studio React-SVG, website string-SVG via the synced engine, desktop
R3F). Road *routing*, however, still lives surface-side (`apps/studio/src/lib/solarLayout.ts`).
Two research passes (2026-07-06 — one on routing algorithms, one on trail rendering/cartography)
ground the design below; the consistent industry pattern is that organic road networks come from
cost-function shaping plus reuse of prior routes (Civ VI trader roads, RimWorld's ancient-road
simulation, Riders Republic's constrained trail pathfinder, Helbing's active-walker trail model) —
not from exotic geometry.

## Decision

**1. Routing moves into the shared core as one deterministic cost-grid engine.**
A new `packages/forest-world/src/routing.ts` routes every story edge over ONE shared scalar cost
field on a coarse world grid:

- **Grid + field:** cell size derived from `HEX_R` (about half a hex); base cost 1; island
  interiors hard-blocked, inflated by a clearance margin; a soft falloff penalty beyond the margin
  (paths keep a natural distance and round past islands instead of clipping tangents); a small
  seeded value-noise cost term (organic wander); a small turn penalty (no staircase zigzag).
- **Search:** 8-connected A* with stable tie-breaking (f, then g, then cell index).
- **Canonical order + merging:** edges route longest-chord-first (tie-break lexicographic
  `from→to` ids). After each route, traversed cells (+ a 1-cell halo) get a reuse discount
  (~×0.4, clamped floor) so later routes snap onto existing trails and peel off near their
  destination — trunk trails emerge procedurally, the way footpaths form in a field. Per-cell
  usage counts accumulate.
- **Cave fallback:** an edge routes first with islands hard-blocked; only if unroutable does it
  re-route with island interiors passable at very high cost. Where the resulting path crosses an
  island rim, the crossing (position + bearing) is emitted as a **cave portal**; the under-island
  run is a distinct hidden segment. Caves happen only when forced — never as a shortcut.
- **Smoothing:** collinear decimation → seeded perpendicular meander displacement (amplitude
  below the clearance margin, so meander can never push a path into an island) → centripetal
  Catmull-Rom, emitted as cubic Bézier `d` for SVG and as the dense polyline for R3F.
- **Determinism:** a pure function of (islands, edges, seed) — all noise hashed from ids via the
  core's FNV-1a/mulberry32 conventions (`rng.ts`); no `Math.random`, no clock. Same input →
  byte-identical output, pinned by test.

**2. The scene-graph renders SEGMENTS, cased, with caves as props.**
The routing output is a shared-segment network: a trunk is ONE segment rendered once; each
dependency edge keeps its ordered chain of segment refs. `buildScene` grows accordingly:

- Road layers stay above ground / below flora, drawn as full passes in order — contact-shadow
  (all), casing (all), fill (all) — never interleaved per path, so merges read as one trail (the
  cartographic casing rule).
- Width from usage: fill ≈ `2 + 2.5·√n` (n = edges through the segment), casing +2.5; a spur
  (n=1) draws a dashed fill over a solid casing (a footpath), a trunk (n≥2) draws solid (a road).
  Trunk-vs-footpath is computed from usage, never authored.
- Cave portals render in the prop layer (occluding the trail): inset + dark arch in the island's
  shadow hue + lit rim arc + trampled apron, sized from trail width, placed from the crossing
  bearing. The under-island run is a fine dashed **ghost** segment (the OSM tunnel convention) on
  its own layer, visible only while revealed.
- Every segment carries the edge ids that use it plus per-edge `data-from`/`data-to`, so surfaces
  reveal by selection without re-walking the graph.

**3. Pathways are hidden by default and grow on island focus.**
The default map draws NO visible road strokes. Focusing an island reveals the union of segments
its incident edges route through, growing outward from the island segment-by-segment in
topological order (spur first, the trunk continues from the junction — tributaries joining a
river). SVG mechanism: per-segment solid mask stroke animated via `pathLength="1"` + CSS
`stroke-dashoffset` 1→0 (~350ms/segment, ease-out) masking the real cased/dashed strokes; the
unselected world dims. Incoming vs outgoing edges take two selection tints. A segment shared by
k≥2 revealed edges steps its width up, so merging stays legible under multi-reveal. Clearing
focus retracts the reveal.

**4. All three surfaces inherit through the one scene-graph.**
Studio: React mapper + CSS animation + the existing focus/hit-test state. Website: the synced
string mapper renders the same scene (default-hidden degrades gracefully where there is no focus
interaction — the public map shows clean islands). Desktop R3F: segments become ground-plane
ribbon strips (width by the same rule), caves an arch + unlit dark disc at the rim bearing;
reveal may land as show/hide-by-focus first (shader-cutoff growth is polish, not gate).

**5. The honesty invariant.**
Everything above is procedural and seeded from ids, with no per-map hand-tuning surface: a messy
dependency graph routes messy (more forced caves, thicker tangles, more crossings) and a clean one
routes clean. The reveal shows ALL of a focused island's edges — never a curated subset. Reveal-
on-focus organizes complexity; it must never hide an edge that exists or draw one that doesn't.
Our own system is the baseline and is expected to render clean — if it doesn't, the finding is
about the system, not the renderer.

**6. Retirement.** `dockedRoads` and the road use of `dockedEdgePath` retire with the flip
(ADR-0073's remove-don't-shelve discipline); `dockedEdgePath` itself stays for the solar
`consumed_by` spokes, which are out of scope here and unchanged.

## Consequences

- **Good.** Each named noise source is answered structurally, not cosmetically: overlay noise →
  hidden-by-default + island-avoiding routes; crossing confusion → reveal-on-focus + trunk merging
  + direction tints; beeline sterility → cost-field wander + clearance falloff + spline smoothing.
  Routing joins the render core, so the studio, website, and desktop can never drift apart on it.
  The engine is a pure function — red-green testable invariants (determinism, avoidance,
  merge-emergence, cave-only-when-forced, meander-bounded-by-clearance).
- **Cost / risk.** ~600 lines of new core machinery + tests — the class of subsystem ADR-0076
  deleted; the differences are stated in Context (reveal-on-focus default + shared-core ownership)
  and the honesty invariant plus owner attestation gate the look. Layout-time routing cost is
  bounded (one grid, tens of islands, ~10² edges — sub-100ms budget). A `forest-world/src` change
  trips the web-engine drift gate: landing requires `sync:web-engine` + web publish + pin bump
  (the publish is outward-facing — owner approves that leg).
- **Reversibility.** The flip is one PR over the shared core + mappers; the docked-line helper
  survives in git and in the solar spokes. The reveal default, width curve, discount, and cave
  thresholds are named constants in one module — tunable without re-deciding this ADR.

## References

- Owner direction 2026-07-06 (this session) — the three noise sources, the three remedies, and the procedural-honesty bar.
- [ADR-0076](0076-forest-tree-docked-line-connections-river-trail-roads-retire.md) — docked lines (§1 road rendering superseded here; amended, building model stands); [ADR-0073](0073-go-all-in-on-roads-retire-rivers-ponds.md) — roads are the one world (stands); prior art: the retired trail system (`git show 7dcf297^:apps/studio/src/lib/riverGeometry.ts`).
- [ADR-0093](0093-shared-forest-world-render-core-for-studio-and-the-public-we.md) — the shared render core + thin mappers this routing engine joins; [ADR-0070](0070-frontend-as-an-inner-loop-role-the-two-stage-proof-for-visua.md) — two-stage visual proof; [ADR-0062](0062-the-forest-world-is-the-observability-layer-rendered-one-art.md) — one-element-per-signal (the cave is a render class of the edge signal, not a new signal).
- Research (2026-07-06, session research agents; sources dated in their reports): routing — Helbing active-walker trail model (1997), Rahix procedural road networks (~2019), Riders Republic trail pathfinder (2021), Nav2 cost-field shaping (2024), Red Blob Games A*; rendering — OSM Carto casing + tunnel-ghost conventions, flow-map width-by-volume (Buchin/Speckmann/Verbeek spiral trees), `pathLength` dash reveal (Jake Archibald 2013 / MDN), Motion Tricks mask reveal for dashed strokes, OpenTTD / Transport Fever portal grammar, Map Effects cave grammar.
- Code: `packages/forest-world/src/routing.ts` (new), `packages/forest-world/src/scene.ts` (`buildRoads` layers), `apps/studio/src/lib/solarLayout.ts` (`dockedRoads` retirement), `apps/studio/src/components/TreeView.tsx` / `SceneView.tsx`, `packages/forest-world-r3f/src/world-to-3d.ts`.
