---
status: accepted
decided: 2026-07-06
amends: [76]
---
# ADR-0169: Pathways are procedural trails: cost-field routing, trail merging, and caves (docked-line roads superseded)

<!-- Filename slug retains "reveal-on-focus" as a stable identity anchor (ADRs 0073/0076/0102/0171
link by it); the reveal-on-focus DEFAULT was retired 2026-07-07 → always-drawn with growth-on-arrival,
corrected in place per ADR-0139 (see §3). Title/body prose updated to match. -->

> **NOTE (2026-07-07):** §3's original "hidden by default / reveal-on-click" model was retired by
> owner direction — pathways are now ALWAYS drawn and the growth animation plays on island
> ARRIVAL. Corrected in place per ADR-0139 (the routing/merging/cave/honesty core stands). See §3.

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
not) is answered here structurally — island-avoiding routes, the item-4 reuse moat that merges
near-parallels onto one trunk, and ADR-0171 stress placement that spaces the islands (the original
cut leaned on reveal-on-focus for this, retired 2026-07-07 per §3) — and the machinery lives in
the shared render core so all three surfaces inherit it, where the trail system was studio-side. The retired implementation
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
  `from→to` ids). After each route, its traversed cells get a strong reuse discount (a
  clamped floor); the surrounding halo is a *tunable* shaping band — originally a weaker
  discount, now (item 4, 2026-07-07) a slight MOAT (cost above base) so there is no
  comfortable parallel lane a cell over — so later routes snap onto the existing trunk and
  peel off near their destination rather than running side-by-side. And where several edges
  converge on one island from nearly the same direction, their near-coincident rim approaches
  are snapped to a SHARED dock (one dock cell + one rim node, clustered by bearing and capped
  so opposite-side approaches keep their own), so they arrive as ONE thicker trunk instead of
  separate approach lines fanning at the rim (owner item 1, 2026-07-07). Trunk trails emerge
  procedurally, the way footpaths form in a field. Per-cell usage counts accumulate.
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
- Width from usage: fill `1.2 + 1.8·√n` (n = edges through the segment; retuned thinner
  2026-07-07 so width ALONE reads the merge). Only the fill renders — the casing/shadow passes
  are suppressed to `display:none` per §3's one-quiet-line default, so this IS the visible
  width: a usage-1 spur is a thin line and each edge sharing a trunk steps it thicker (a legible
  thin→thick ladder). Spur-vs-trunk is width, computed from usage, never authored.
- Cave portals render in the prop layer (occluding the trail): inset + dark arch in the island's
  shadow hue + lit rim arc + trampled apron, sized from trail width, placed from the crossing
  bearing. The under-island run is a fine dashed **ghost** segment (the OSM tunnel convention) on
  its own layer, visible only while revealed.
- Every segment carries the edge ids that use it plus per-edge `data-from`/`data-to`, so surfaces
  reveal by selection without re-walking the graph.

**3. Pathways are always drawn; growth animates on island arrival.**
(Owner-re-directed 2026-07-07, item 4 round — reveal-on-click retired: "see the pathways
without clicking everywhere". The original decision here was hidden-by-default with
reveal-on-focus; it is corrected in place per ADR-0139, the decision element genuinely
overtaken. The routing/merging/cave/honesty core below and in §§1–2, 5–6 stands unchanged;
only the reveal *trigger* flipped.) The map draws every trail at rest — one quiet
faded-brown line, no direction tints, no spur dash (viable without noise now because the
item-4 reuse MOAT merges near-parallels and ADR-0171 stress placement spaces the islands).
The draw-on growth animation moves to WHERE it means something: a story island being
PLACED. When an island ARRIVES, its DIRECT incident segments draw on, growing outward from
the new island (existing trails elsewhere stay statically drawn) — direct-incident only,
not the transitive chain, since it is the NEW connections that draw in. SVG mechanism
(unchanged): per-segment solid mask stroke animated via `pathLength="1"` + CSS
`stroke-dashoffset` 1→0 (~350ms/segment, ease-out) masking the real cased/dashed strokes;
when the arrival ends the masks drop and the strokes stay drawn. A segment shared by k≥2
edges still steps its width up, so merging stays legible.
(Prior art, retained pure + tested but UNWIRED from the app in case click-to-highlight
returns: `trailRevealPlan` — the focus-rooted full-transitive-closure-both-directions
selector from the reveal-on-click era, `apps/studio/src/lib/trailReveal.ts`. §5's honesty
invariant holds for both selectors by construction — every plan is a subset of REAL edges,
never a curated subset and never an invented edge.)

**4. All three surfaces inherit through the one scene-graph.**
Studio: React mapper + CSS animation + the existing arrival-diff state. Website: the synced
string mapper renders the same scene (always-drawn trails render statically where there is no
arrival animation — the public map shows the trail network). Desktop R3F: segments become
ground-plane ribbon strips (width by the same rule), caves an arch + unlit dark disc at the rim
bearing; the arrival growth may land as show/hide first (shader-cutoff growth is polish, not
gate).

**5. The honesty invariant.**
Everything above is procedural and seeded from ids, with no per-map hand-tuning surface: a messy
dependency graph routes messy (more forced caves, thicker tangles, more crossings) and a clean one
routes clean. Every trail drawn is a REAL edge (§3, always-drawn); the arrival growth and the
retained focus selector both animate only subsets of real edges — never a curated subset and
never an invented edge. The rendering organizes complexity; it must never hide an edge that
exists or draw one that doesn't. Our own system is the baseline and is expected to render clean —
if it doesn't, the finding is about the system, not the renderer.

**6. Retirement.** `dockedRoads` and the road use of `dockedEdgePath` retire with the flip
(ADR-0073's remove-don't-shelve discipline); `dockedEdgePath` itself stays for the solar
`consumed_by` spokes, which are out of scope here and unchanged.

## Consequences

- **Good.** Each named noise source is answered structurally, not cosmetically: overlay noise →
  island-avoiding routes + the item-4 reuse moat (near-parallels merge onto one trunk) + ADR-0171
  stress placement (islands spaced); crossing confusion → trunk merging + one quiet line;
  beeline sterility → cost-field wander + clearance falloff + spline smoothing. (The original
  cut leaned on hidden-by-default + reveal-on-focus for the overlay/crossing noise; those were
  retired 2026-07-07 per §3, the structural remedies above carry it now.)
  Routing joins the render core, so the studio, website, and desktop can never drift apart on it.
  The engine is a pure function — red-green testable invariants (determinism, avoidance,
  merge-emergence, cave-only-when-forced, meander-bounded-by-clearance).
- **Cost / risk.** ~600 lines of new core machinery + tests — the class of subsystem ADR-0076
  deleted; the differences are stated in Context (shared-core ownership; and now always-drawn
  trails with growth-on-arrival, §3) and the honesty invariant plus owner attestation gate the
  look. Layout-time routing cost is
  bounded (one grid, tens of islands, ~10² edges — sub-100ms budget). A `forest-world/src` change
  trips the web-engine drift gate: landing requires `sync:web-engine` + web publish + pin bump
  (the publish is outward-facing — owner approves that leg).
- **Reversibility.** The flip is one PR over the shared core + mappers; the docked-line helper
  survives in git and in the solar spokes. The always-drawn/growth-on-arrival choice, width curve,
  discount, moat, and cave thresholds are named constants / plan selectors in one module — tunable
  without re-deciding this ADR (and the reveal-on-click selector `trailRevealPlan` is retained
  unwired, so restoring click-to-highlight is a wiring change, not a rewrite).

## References

- Owner direction 2026-07-06 (this session) — the three noise sources, the three remedies, and the procedural-honesty bar.
- [ADR-0076](0076-forest-tree-docked-line-connections-river-trail-roads-retire.md) — docked lines (§1 road rendering superseded here; amended, building model stands); [ADR-0073](0073-go-all-in-on-roads-retire-rivers-ponds.md) — roads are the one world (stands); prior art: the retired trail system (`git show 7dcf297^:apps/studio/src/lib/riverGeometry.ts`).
- [ADR-0093](0093-shared-forest-world-render-core-for-studio-and-the-public-we.md) — the shared render core + thin mappers this routing engine joins; [ADR-0070](0070-frontend-as-an-inner-loop-role-the-two-stage-proof-for-visua.md) — two-stage visual proof; [ADR-0062](0062-the-forest-world-is-the-observability-layer-rendered-one-art.md) — one-element-per-signal (the cave is a render class of the edge signal, not a new signal).
- Research (2026-07-06, session research agents; sources dated in their reports): routing — Helbing active-walker trail model (1997), Rahix procedural road networks (~2019), Riders Republic trail pathfinder (2021), Nav2 cost-field shaping (2024), Red Blob Games A*; rendering — OSM Carto casing + tunnel-ghost conventions, flow-map width-by-volume (Buchin/Speckmann/Verbeek spiral trees), `pathLength` dash reveal (Jake Archibald 2013 / MDN), Motion Tricks mask reveal for dashed strokes, OpenTTD / Transport Fever portal grammar, Map Effects cave grammar.
- Code: `packages/forest-world/src/routing.ts` (new), `packages/forest-world/src/scene.ts` (`buildRoads` layers), `apps/studio/src/lib/solarLayout.ts` (`dockedRoads` retirement), `apps/studio/src/components/TreeView.tsx` / `SceneView.tsx`, `packages/forest-world-r3f/src/world-to-3d.ts`.
