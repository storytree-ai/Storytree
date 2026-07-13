---
status: accepted
decided: 2026-07-13
amends: [188]
---
# ADR-0191: Library lens defaults to a top drawer handle; lens state is URL-derived; full-width top-third layout

## Status

accepted (2026-07-13) — decided/directed by the owner in conversation on 2026-07-13. Design-time alignment IS the
ratification (ADR-0110); no second end-of-flow ask. The direction is recorded verbatim in the
`library-tech-tree-overlay-arc` increment log as the `desktop-layout-feedback` (item A) and
`drawer-affordance-feedback` entries of 2026-07-13, both marked fold-only for the next session — this ADR is that
fold's decision record. Amends ADR-0188 (dec 1's flag-as-only-presence-gate and dec 6's component-local
minimise machine).

**Amended by ADR-0193 (2026-07-13), reciprocal note.** After the owner walked the staged sitting: **dec 3**'s
~top-1/3 expanded height becomes ~HALF the forest frame, drag-resizable (terminal-dock idiom); **dec 1**'s
handle is reshaped — the Expand/Collapse word-buttons retire for the terminal dock's arrow toggle, the collapsed
handle slims down, carries no "Library" title (title is expanded-only), and must not occlude the forest legend /
Shared Islands panels. Dec 2's URL-derived state and dec 4's corner-toggle retirement stand unchanged.

## Context

ADR-0188 dec 6 gave the permanent lens a component-local minimise state machine (a bottom handle bar with
Minimise/Restore), and dec 1 kept `?overlay=library` as the ONLY presence gate — without the flag, nothing of the
library renders. That left the lens unreachable in the Electron desktop (no URL bar), which PR #715 patched with a
bottom-left map-corner toggle (`.world-library-dock`).

The owner walked the lens live in the desktop app on 2026-07-13 and directed a correction:

- The library should present **by default** as a **drawer handle/tab at the TOP edge of the forest** — a
  persistent collapsed drawer, visible on load; clicking it slides the lens down over the map. This restores the
  original ADR-0185 "tech-tree lens pulled DOWN over the map" idiom as the entry affordance.
- The lens should span the **full width of the forest frame**, and expanded take about the **top 1/3** of it
  (today: a centred `min(1180px, 100% − 64px)` box at `min(80%, 640px)` height).
- The PR-#715 bottom-corner toggle is a fragile entry point (it disappears once the embedded terminal opens —
  occluded/displaced at the shared bottom edge) and is **unneeded** once the handle both opens and closes the
  drawer — remove it.

Two presence models (a component-local minimise state AND a URL flag AND a corner toggle) had accumulated for what
is one user-visible fact: is the drawer open?

## Decision

1. **Default top drawer handle.** On the map (`#/tree`), the library presents by default as a persistent
   collapsed drawer handle/tab at the top edge of the forest — visible on load with NO flag. Clicking the handle
   slides the lens down (expanded); the handle remains on the expanded drawer and slides it back up. The handle is
   the single open/close affordance.
2. **Lens state is URL-derived.** `?overlay=library` present = expanded; absent = collapsed to the handle. The
   ADR-0188 dec-6 component-local minimise/restore state machine RETIRES — minimise, collapse, and close unify
   into clearing the flag (the drawer component fires an `onToggle` seam; the parent glue owns the URL write via
   `commitSearch`, the same reactive seam the gear dials ride). Deep links carrying the flag still open the lens
   expanded, and dismissal-on-map-navigation (dec 1) is unchanged. "Absent renders nothing" is no longer true —
   absent renders the collapsed handle (and only it).
3. **Full-width, top-third layout (look leg).** The drawer spans the full width of the forest frame; expanded it
   takes ~the top 1/3 of the frame. The centred-box width and 80%-height are retired. As look, this is
   owner-attested (ADR-0070 stage 2), not machine-asserted.
4. **The PR-#715 corner toggle retires.** The `.world-library-dock` bottom-left button and its glue are removed —
   the top handle replaces it (also mooting its disappears-behind-the-terminal bug).

## Consequences

- The `library-lens-minimise` capability (its `lmin-*` contracts pin the retired component-local machine) is
  REPLACED by a new `library-top-drawer` capability on the same source (`LibraryDrawer.tsx`) — the inc-10
  cap-replacement precedent. The inc-9 `lpl-flag-gates-permanent-lens` contract ("absent renders nothing") is
  retired and its flag semantics re-home into the new cap's contracts; the other `lpl-*` contracts (no ×/dive
  affordance, no scrim, body-slot render) stay true and survive.
- The library becomes discoverable on every map load (no URL knowledge, no corner icon) — the desktop
  reachability gap #715 patched is now solved structurally.
- The lens takes less of the map when open (top 1/3 vs 80%), keeping the forest the home surface.
- The look leg (handle silhouette, slide, full-width/third-height proportions) rides the SHARED still-unsigned
  inc-9+10 owner sitting, with the 2026-07-12 owner-aligned mock (which showed a top handle bar) as reference.
- Inc 11 (retire `#/library`, ADR-0185 dec 6) is untouched and stays hard-gated on that sitting.

## References

- ADR-0185 (the lens idiom), ADR-0187 (permanent lens), ADR-0188 (panel remold — dec 1/6 amended here).
- The `library-tech-tree-overlay-arc` increment-log entries `desktop-layout-feedback` and
  `drawer-affordance-feedback` (2026-07-13) — the owner direction this records.
- PR #715 (the interim corner toggle this retires).
- `apps/studio/src/components/LibraryDrawer.tsx`, `apps/studio/src/components/TreeView.tsx`,
  `apps/studio/src/index.css`.
