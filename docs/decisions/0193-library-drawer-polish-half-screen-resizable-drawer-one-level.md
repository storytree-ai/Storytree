---
status: accepted
decided: 2026-07-13
amends: [191, 188]
---
# ADR-0193: Library drawer polish: half-screen resizable drawer, one-level DAG, in-pane selection card

## Status

accepted (2026-07-13) — decided/directed by the owner in conversation on 2026-07-13. Design-time alignment IS the
ratification (ADR-0110); no second end-of-flow ask. The direction is recorded verbatim in the
`library-tech-tree-overlay-arc` increment log as the `expanded-look-feedback` entry of 2026-07-13 (ten items,
fold-only for the next session) — this ADR is that fold's decision record. Amends ADR-0191 (its dec 1 handle
presentation and dec 3 top-third layout) and ADR-0188 (its dec 5 full-transitive DAG walk is REVERSED, not
sharpened; its dec 3 card placement amended). The look legs remain operator-attested at build time (ADR-0070
stage 2).

## Context

The owner walked the staged incs 9+10+12 shared sitting at `#/tree` on 2026-07-13 and did not sign: "the overall
look is better however it needs more work." Ten items came back, all library-lens concerns. Three re-decide
ADR-0191's layout calls (top-third height, Expand/Collapse buttons, the titled collapsed bar), one reverses
ADR-0188 dec 5's full-depth transitive DAG walk, and the rest are placement/affordance corrections — the worst a
straight bug: the selection card, rendered in the side panel per ADR-0188 dec 3, covers the search input when a
node is selected, making search "no longer useful" at exactly the moment search-first navigation needs it.

Two idioms the owner pointed at already exist in the app: the embedded terminal dock's arrow toggle and drag-resize
(ADR-0174/0175 lineage) — the library drawer should behave like that, not invent its own affordances.

## Decision

**1. Expanded default is HALF the forest frame; the drawer is drag-resizable (amends ADR-0191 dec 3).** The
expanded drawer takes ~50% of the forest frame's height by default (up from ~top-third) — enough to render the
selected node's description alongside the DAG — and carries a drag handle on its bottom edge to resize, the
terminal dock's idiom ("if you want more library surface you can drag it down more"). Full width stands.

**2. The arrow is the only toggle; the collapsed handle slims down and is title-less (amends ADR-0191 dec 1).**
The Expand/Collapse word-buttons retire for the terminal dock's small-arrow idiom: one arrow expands and collapses.
The collapsed handle shrinks to the minimum bar that carries the arrow — no "Library" title collapsed (the title
belongs to the EXPANDED state), and the collapsed presence must NOT occlude the forest's legend or Shared Islands
panels: collapsed, the forest UI costs nothing. ADR-0191's handle-as-single-affordance and URL-derived state
(dec 2) stand — this reshapes the handle, not the state model.

**3. The focus DAG shows ONE level upstream + ONE level downstream only (REVERSES ADR-0188 dec 5).** The
full-transitive, uncapped-depth walk retires. Navigation is search-first plus click-through: clicking a
neighbouring node re-focuses the DAG on it, so any depth is reachable one hop at a time. Explicit rationale, owner
verbatim: a deep DAG canvas demands its own pan/zoom controls layered over the forest's own — **rejected
outright**; NO pan/zoom controls on the library canvas. The **← Back button is removed** (dec 5's breadcrumb
lead-in) — click-through makes it redundant and its removal gives the DAG the space back. Dec 5's surviving
grains: edges are still drawn (one level of them), colour stays state, kind stays text.

**4. The selection card lives IN the DAG pane, never over the search bar (amends ADR-0188 dec 3's placement).**
The selected artifact's card takes its space FROM THE DAG PANE (right), not the side panel: the search input and
result list stay fully usable while a node is selected — the structural fix for the covered-search bug. The card's
content contract (title, kind, badges, description, Open) is unchanged.

**5. Open shrinks to an icon.** The "Open" word button "takes way too much realestate" — it becomes a compact
icon button (with an accessible label).

## Consequences

- This is a polish increment on the landed incs 9+10+12 surfaces — brownfield rework of `LibraryDrawer.tsx`,
  `LibraryFocusGraph.tsx`/`buildFocusGraph`, `LibrarySelectionCard.tsx`, the TreeView mount, and `index.css`.
  Contracts pinning the reversed behaviours (full-depth walk, Back button, panel-housed card, Expand/Collapse
  buttons) are trimmed/re-homed as part of the increment — executing this decision, not a re-decision.
- `buildFocusGraph` simplifies: one rank up, one rank down, no expanders-beyond-one-level, no depth machinery.
- The look legs (half-screen proportion, arrow silhouette, slim handle, resize feel) ride the SHARED still-unsigned
  owner sitting (now incs 9+10+12 + this round), with the 2026-07-12 owner-aligned mock — as updated by these ten
  items — as the reference. Inc 11 (retire `#/library`) stays hard-gated on that signature.
- ADR-0188 stays `accepted`; read its dec 5 through this ADR (reciprocal note recorded there). ADR-0191 stays
  `accepted`; read its dec 1/dec 3 through this ADR.

## References

- ADR-0191 (top drawer handle, URL-derived state — dec 1/3 amended here), ADR-0188 (panel remold — dec 5 reversed,
  dec 3 placement amended), ADR-0185/0187 (the lens lineage), ADR-0110 (design-time alignment is ratification),
  ADR-0070 (two-stage proof).
- The arc: `storytree arc show library-tech-tree-overlay-arc --pg` — the 2026-07-13 `expanded-look-feedback`
  increment-log entry carries the ten owner items verbatim.
- The terminal dock (arrow toggle + drag-resize) — the affordance idiom decs 1–2 borrow.
- `apps/studio/src/components/LibraryDrawer.tsx`, `apps/studio/src/components/LibraryFocusGraph.tsx`,
  `apps/studio/src/components/LibrarySelectionCard.tsx`, `apps/studio/src/components/TreeView.tsx`,
  `apps/studio/src/index.css`.
