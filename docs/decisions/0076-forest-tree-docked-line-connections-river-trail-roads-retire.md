---
status: accepted
decided: 2026-06-20
amends: [73]
---
# ADR-0076: Forest #/tree: docked-line connections (river-trail roads retired) and buildings for foundation utilities

## Status

accepted — owner steer 2026-06-20: *"go back to the tree structure, however I like the
updated lines. Also move the library to the side and remove all its connections — turn
the library into a building that shows up on the island. We can discuss how we determine
if something should be a building or not."* **Both halves are owner-attested.** The
line-style half: the owner chose "flip + retire" after a default-vs-lines screenshot
comparison (landed PR #244). The building half: built behind a default-off flag, refined to
the distributed-bookshelf model below (PR #247), then **attested 2026-06-20** — the owner
saw the `?buildings=on#/tree` screenshots, said "looks good — flip default on", and
confirmed library's own island is removed (ADR-0070 two-stage proof: geometry red-green +
owner-attested appearance). The default is now ON (escape `?buildings=off`). Amends
[ADR-0073](0073-go-all-in-on-roads-retire-rivers-ponds.md) — roads stay the one world, but
their *rendering* changes (trails → docked lines) and the trail routing machinery is retired.

**Superseded-in-part by [ADR-0088](0088-building-class-stories-surface-in-a-permanent-shared-islands.md)** (accepted, 2026-06-22) — §2's building *rendering placement* is overtaken: a building-class story no longer "drops out of the layout" with no home of its own (nor, in the interim owner-pivot `buildingIsland` mode, as an on-map edgeless island) — it now renders its full island in a permanent off-map **"Shared Islands"** left panel. §1 (docked-line connections), the manual `render: building` tag, and the consumer bookshelf STAMPS all stand.

## Context

[ADR-0073](0073-go-all-in-on-roads-retire-rivers-ponds.md) made roads the single world and
drew every `depends_on` edge as a worn dirt **trail**: a routed, island-skirting polyline
(`buildBasin` / `buildBundle` over the `riverGeometry` routing substrate) painted in three
stacked passes (`road-net-margin` / `-bed` / `-texture`, the `world-trail-*` CSS), tuned by
four gear dials (road straightness, long-route split, junction spread, road spacing).

Two things then happened:

1. [ADR-0074 §6](0074-enforce-the-organism-boundary-gate-the-cross-story-dependenc.md)'s
   solar layout introduced a *different* connection style — thin, no-arrow curves docked on
   each island's **perimeter** in the bearing of its neighbour (`dockedEdgePath`), so a
   hub's many edges fan around its rim instead of piling on one routed corridor. The owner
   liked these lines (PR #243 brought them onto the tree layout behind `?roads=lines`).
2. The `library` story is a heavily-depended foundation whose many edges clutter the centre
   of the map regardless of routing. The owner wants it **off the graph entirely** — moved
   aside, its connections removed, and drawn as a **building** (a per-territory art element
   like the trees/flora), not a connected node.

A first pass (PR #245) drew the building as a single house on the library's own island. On
seeing it the owner refined the model (2026-06-20): the building should be a recognisable
**bookshelf** (a weathered, crammed old-library shelf), and rather than keeping its own
island it should be **distributed** — *"we put the library on every island it connects to, so
each island connected to the library shows a building on it."* So the library's island is
removed and its icon is stamped, in miniature, on each of its consumers; a bottom legend maps
the icon to its meaning. This is what §2 below records (superseding the single-house pass).

Open question raised and settled with the owner at session start: *how do we decide whether
something is a "building" (on an island, no connections) vs an island/organism node?* The
owner chose a **manual tag, decided by agents as part of story writing / review** — not a
derived rule (dependency-degree, port/substrate class, kind/tier). The map should not
silently reclassify nodes; an agent makes the call when authoring or reviewing a story.

## Decision

**1. Tree-world connections are docked lines; the river-trail system is retired.**
The DAG/tree world draws its `depends_on` edges with the solar world's `dockedEdgePath`
style (thin, no-arrow, perimeter-docked, gently bowed — the shared `dockedRoads` helper).
This becomes the **default and only** road rendering. The river-trail subsystem is
**genuinely removed** (not shelved, per ADR-0073's own discipline): the three render passes
+ `world-trail-*`/`road-net-*` CSS, `buildBasin`/`buildBundle` and the strands river passes,
their docking/meander helpers, the `riverGeometry` module, and the four trail-routing gear
dials all go. (Solar mode already drew docked lines and is unchanged.)

**2. A building-tagged utility is DISTRIBUTED as an icon on every island it connects to.**
A story may carry a frontmatter render hint (`render: building`) marking it a **building**.
Rather than drawing it as its own (de-connected) island, the map:

- **removes the building's own island** from the layout — it does not render as a node, and
  because it leaves the laid-out story set its connection lines never enter the road/rank
  graph (so nothing to drop); and
- **stamps a small building icon on every island that connects to it** — its *consumer set*:
  every story whose `depends_on` names the building **∪** the building's own `consumed_by`,
  resolved symmetrically from both declaration styles (ADR-0074 §4 / `fullConnectionSet`).
  The icon sits beside that island's story tree (a per-territory art element), it does not
  replace the tree.

So a heavily-depended foundation "moves to the side" by appearing, in miniature, on each of
its users instead of crowding the centre with edges. For `library` the icon is a weathered
**bookshelf** crammed with old books. A bottom **building legend** (separate from the top
world legend) maps each on-island icon → its meaning, extensible to future buildings. The
distinction stays **explicit and curated** — set by the story-author / reviewer agents during
story writing or review — never derived from degree, kind, tier, or the port/substrate class.
`library` is the first (and, for now, only) tagged building.

## Consequences

- **Good.** One connection style across both layouts (tree + solar share `dockedRoads`).
  The map decongests sharply: a heavily-depended foundation leaves the graph entirely and its
  many edges go with it, while it stays *legible* as a small icon repeated on each user — the
  relationship is shown by co-location rather than a line. A bottom legend keeps the new icon
  vocabulary self-explanatory. The trail subsystem (a large, intricate routing layer) leaves
  the codebase, shrinking surface area. The building rule is predictable — no node silently
  changes class; an agent decides, visible in frontmatter.
- **Cost / risk.** Retiring the trail machinery is a large deletion (`riverGeometry.ts` + its
  suite, `buildBasin`/`buildBundle`, the strands passes, four gear dials). The docked lines
  carry less routing nuance than the trails did (no island-skirting, no flow-fattening) — an
  accepted simplification. A de-connected building loses its edges from the map, so its
  dependencies are no longer traceable *visually* on the world (they remain in the panel /
  frontmatter); this is intended for true foundation utilities, which is why the tag is
  manual and conservative.
- **Reversibility.** The line-style flip and the trail retirement are one PR (revertable as a
  unit); the building render is a second PR behind its own flag, attested before its default
  flips. The building tag is one frontmatter field — adding/removing a building is a one-line
  edit, reconcilable through the normal story-authoring flow.

## References

- [ADR-0073](0073-go-all-in-on-roads-retire-rivers-ponds.md) — roads is the one world (amended here: trail rendering retired).
- [ADR-0074 §6](0074-enforce-the-organism-boundary-gate-the-cross-story-dependenc.md) — the solar world + the `dockedEdgePath` perimeter-docking model this adopts.
- [ADR-0070](0070-frontend-as-an-inner-loop-role-the-two-stage-proof-for-visua.md) — two-stage visual proof (geometry red-green + owner-attested appearance) this work follows.
- [ADR-0062](0062-the-forest-world-is-the-observability-layer-rendered-one-art.md) — one-element-per-signal: the building is a render class, not a new signal.
- Code: `apps/studio/src/lib/solarLayout.ts` (`dockedEdgePath`/`dockedRoads`), `apps/studio/src/components/TreeView.tsx` (`buildWorld`), PR #243 (the docked-line layer behind `?roads=lines`).
- Code (§2 distributed model): `apps/studio/src/lib/buildingLayout.ts` (`bookshelfConsumers` over `fullConnectionSet`, `shelfBooks` icon geometry) + its `*.test.ts`; `apps/studio/src/components/TreeView.tsx` (`BookshelfGlyph`/`StoryBookshelf`/`BuildingLegend`, the `buildWorld` building-filter + consumer stamp). Behind the default-OFF `?buildings=on` flag; PR #245 was the single-house first pass this supersedes.
