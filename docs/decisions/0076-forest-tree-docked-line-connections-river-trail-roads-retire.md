---
status: proposed
decided: 2026-06-20
amends: [73]
---
# ADR-0076: Forest #/tree: docked-line connections (river-trail roads retired) and buildings for foundation utilities

## Status

proposed — owner steer 2026-06-20: *"go back to the tree structure, however I like the
updated lines. Also move the library to the side and remove all its connections — turn
the library into a building that shows up on the island. We can discuss how we determine
if something should be a building or not."* The line-style half is owner-attested (the
owner chose "flip + retire" after a default-vs-lines screenshot comparison); the building
half is built behind a default-off flag and flips to **accepted** once the owner attests
its appearance (ADR-0070 two-stage proof). Amends [ADR-0073](0073-go-all-in-on-roads-retire-rivers-ponds.md)
— roads stay the one world, but their *rendering* changes (trails → docked lines) and the
trail routing machinery is retired.

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
   aside, its connections removed, and drawn as a **building** sitting on an island (a
   per-territory art element like the trees/flora), not a connected node.

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

**2. Foundation utilities render as buildings, by a manual agent-authored tag.**
A story may carry a frontmatter render hint marking it a **building**: it is drawn as a
building on the map (a per-territory art element) and **all of its connection lines are
omitted** (both its outgoing `depends_on` roads and its inbound edges). The distinction is
**explicit and curated** — set by the story-author / reviewer agents during story writing or
review — never derived from degree, kind, tier, or the port/substrate class. `library` is
the first (and, for now, only) tagged building; the first visual pass may hard-code it to
prove the look before the tag is wired.

## Consequences

- **Good.** One connection style across both layouts (tree + solar share `dockedRoads`).
  The map decongests: a heavily-depended foundation drawn as a de-connected building stops
  its edges from crowding the centre. The trail subsystem (a large, intricate routing layer)
  leaves the codebase, shrinking surface area. The building rule is predictable — no node
  silently changes class; an agent decides, visible in frontmatter.
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
