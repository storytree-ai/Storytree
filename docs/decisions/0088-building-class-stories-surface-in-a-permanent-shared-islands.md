---
status: accepted
decided: 2026-06-22
---
# ADR-0088: Building-class stories surface in a permanent Shared Islands left panel

## Status

accepted — owner-directed model, 2026-06-22. The owner directed the structure: building-class
("shared") stories move OFF the map into a **permanent, always-visible "Shared Islands" left
panel** that also houses the relocated world legend, with right-popping drawers, and the
redundant building legend retired. The structural decision stands as owner-directed; the
**appearance** (panel look/sizing, the in-panel island rendering, the right-pop boxes) is
operator-attested under [ADR-0070](0070-frontend-as-an-inner-loop-role-the-two-stage-proof-for-visua.md)'s
two-stage proof — geometry/behaviour red-green, the look built then surfaced for the owner's nod
(pending at landing; the model does not wait on it). Refines
[ADR-0076](0076-forest-tree-docked-line-connections-river-trail-roads-retire.md) §2 — replacing its
distributed-only building placement; 0076's docked-line connections (§1) and the manual
`render: building` tag stand.

*(Currency note — amended by [ADR-0228](0228-forest-map-defaults-to-pathways-only-shared-island-hubs-retu.md)
(2026-07-22): the off-map Shared Islands panel (§1/§2) and its on-map consumer stamps (§3) are now
**DEFAULT-OFF**, kept behind the `?buildings=on` escape; the studio map now defaults to **pathways-only**,
with the shared-island hubs (`library`/`cli`/`notice-board`) drawn back on the map and their dependencies
routed as ordinary ADR-0169 trails. This ADR still describes the `?buildings=on` world — its machinery is
kept, not deleted. Corrected in place per [ADR-0139](0139-the-accepted-adr-set-carries-no-stale-prose-correct-in-place.md).)*

## Context

[ADR-0076](0076-forest-tree-docked-line-connections-river-trail-roads-retire.md) §2 decided that a
story tagged `render: building` (the `library`) "moves to the side" by **dropping out of the
layout entirely** and being DISTRIBUTED as a small bookshelf icon stamped on every island that
connects to it, with a bottom **building legend** mapping the icon to its meaning. A heavily-depended
foundation thus left the graph and showed up, in miniature, on each of its users.

That distributed-only model was then refined twice by owner pivots (recorded in the working notes,
flagged there as an open "ADR-0076 amendment"):

1. The building stamps alone lost the building's own island — you could see *that* islands used the
   library, but the library itself (its health, its capability garden, its growth) had nowhere to
   render. So an **on-map edgeless building island** was introduced (`buildingIsland` mode, default
   ON): the `library` rendered as a real island pinned to the foundation row next to `cli`, with its
   many inbound edges SUPPRESSED (`isEdgeless`/`edgeIsDrawn`) and a bookshelf glyph on its nameplate,
   coexisting with the consumer stamps.
2. Sitting the building island on the map still mixed a heavily-centralised hub into the bottom row,
   and it scrolled away with the rest of the world. The owner wants the shared island(s) **always
   visible** and **off** the map proper — a dedicated home — while keeping the on-map stamps as the
   "this island uses the shared one" markers.

Two legends had also accumulated: the main `WorldLegend` bottom bar (the tree/plant/proof
vocabulary) and a separate `BuildingLegend` bottom dock (explaining the bookshelf). Inside a left
panel a downward-expanding legend drawer would shove the panel's content down — unwanted.

## Decision

**1. A permanent "Shared Islands" left panel houses the building-class stories.**
The `#/tree` world gains a fixed, always-visible left panel titled **"Shared Islands"** (not a
toggle, not a pop-out). Every building-class story — generic over `story.building === true`, the
manual `render: building` tag from ADR-0076 (unchanged) — renders there as its **full island**:
the story tree, the capability garden, the health hue, the nameplate, and a bookshelf glyph
marking it as a shared island. The panel is always on screen regardless of how far the map is
scrolled. The in-panel island reuses the world's own island renderer (`TerritoryFlora` over a
one-story `buildWorld`), so a shared island in the panel reads identically to an island on the map.

**2. Building-class stories no longer render on the map.**
The interim on-map edgeless building-island path is removed: building-class stories are
**excluded from the laid-out map territories** (the existing exclusion, now unconditional on the
`buildings` flag, no longer coupled to a `buildingIsland` mode). The `isEdgeless`/`edgelessIds`
edge-suppression, the `rankOf` root-pin override, and the nameplate `buildingGlyph` on the map all
go; the `buildingIsland` gear toggle is retired (the panel is permanent, so there is nothing to
toggle). A building is no longer a node in the map's rank/road graph at all.

**3. Consumer bookshelf STAMPS stay on the map.**
The distributed stamp (ADR-0076 §2, `bookshelfConsumers`/`StoryBookshelf`, computed from the full
story list before exclusion) is unchanged: every island that uses a shared island still carries the
small bookshelf, the "uses this shared island" marker. Clicking a consumer focuses/highlights the
corresponding shared island in the panel — co-location plus a click, replacing the suppressed edges.
The `buildings` flag (default ON, escape `?buildings=off`) still governs the stamps.

*(The generic, consumer-only bookshelf stamp described here was later replaced by per-island icon
stamps in both directions — you carry the icon of what you depend on, and a building's edges are
promoted to those stamps rather than dropped:
[ADR-0102](0102-shared-islands-promote-edges-to-per-island-icon-stamps.md). The off-map panel (§1/§2),
legend move (§4), and BuildingLegend removal (§5) stand; corrected in place per
[ADR-0139](0139-the-accepted-adr-set-carries-no-stale-prose-correct-in-place.md).)*

**4. The world legend moves into the panel; its drawers pop RIGHT.**
`WorldLegend` is relocated out of the bottom bar into the Shared Islands panel as a section ABOVE
the islands. Every expansion in the panel — the legend chips and a shared island's detail — opens as
a self-contained box that pops out to the **RIGHT** of the panel, a clean open/close loop that does
NOT reflow the panel's vertical content (a downward drawer would). The legend keeps its behaviour:
the status fan doubles as the status filter; Escape / click-outside dismisses.

**5. The `BuildingLegend` bottom dock is removed.**
With the shared islands rendered in the panel and the stamps explained there, the separate
`BuildingLegend` is redundant and is deleted (component, data, and `.building-legend-*` CSS).

## Consequences

- **Good.** A shared foundation utility gets a real, persistent home that shows its full state
  (health, garden, growth) without crowding or scrolling away, and without flooding the centre of
  the map with edges. The map proper is reserved for the dependency forest; the "off to the side"
  intent of ADR-0076 is honoured more literally (a fixed side panel, not a row-0 island). One legend,
  in one place; right-popping drawers keep the panel's vertical rhythm stable. The model stays
  generic — any future `render: building` story appears in the panel automatically.
- **Cost / risk.** The shared island's dependencies remain non-traceable as lines on the world (as in
  ADR-0076 — intended for true foundation utilities); the stamp-click → panel-highlight is the
  navigation affordance instead. The panel consumes horizontal space and is a new always-on surface
  (mobile/narrow widths want a follow-up). This changes the DEFAULT world (not byte-identical) — the
  appearance is owner-attested before it is considered settled (ADR-0070).
- **Reversibility.** The render is a studio-only change (`apps/studio/src`), revertable as a unit. The
  `render: building` tag is still one frontmatter field per ADR-0076 — adding/removing a shared island
  is a one-line edit through the normal story-authoring flow.

## References

- [ADR-0076](0076-forest-tree-docked-line-connections-river-trail-roads-retire.md) — the distributed-bookshelf building model; §2's distributed-only placement is replaced here (the docked-line connections §1 and the manual `render: building` tag stand). The interim on-map edgeless building-island (`buildingIsland` mode) was an owner pivot under 0076; this ADR is the amendment that supersedes it.
- [ADR-0070](0070-frontend-as-an-inner-loop-role-the-two-stage-proof-for-visua.md) — the two-stage visual proof (geometry red-green + owner-attested appearance) this work follows.
- [ADR-0062](0062-the-forest-world-is-the-observability-layer-rendered-one-art.md) — one-element-per-signal: a shared island in the panel is a render placement, not a new signal.
- [ADR-0036](0036-story-world-studio-visualisation.md) / [ADR-0038](0038-story-world-vocabulary-recalibration.md) — the forest-world island vocabulary the panel island reuses.
- Code: `apps/studio/src/components/TreeView.tsx` (`buildWorld` building exclusion, the Shared Islands panel + `TerritoryFlora` reuse, the right-pop flyout, `BuildingLegend` removal), `apps/studio/src/components/WorldLegend.tsx` (relocated into the panel), `apps/studio/src/lib/buildingLayout.ts` (`bookshelfConsumers` stamps + the shared-island roster helper), `apps/studio/src/lib/worldSettings.ts` (the `buildingIsland` control retired).
