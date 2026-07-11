---
id: "library-tech-tree-overlay"
tier: story
title: "The Library as a tech-tree drawer over the forest map"
outcome: "An operator explores the knowledge corpus as a tech-tree lens pulled down over the living forest map."
status: proposed
proof_mode: UAT
# Frontend-builder two-stage (ADR-0070): every drawer surface (the shell, the finder, the
# focus subgraph, the dive body, the overview constellation) splits into a machine-witnessed
# GEOMETRY/BEHAVIOUR leg and an operator-attested LOOK leg. A UI an agent cannot drive is a
# human-witness UAT action, not a machine visual verdict (uat-proves-the-goal-not-the-surface).
# So this story is mixed-witness and carries NO blanket `uat_witness: machine` override — each
# UAT leg below marks its own witness (ADR-0040 fail-closed default for the un-drivable look).
capabilities: [library-drawer-shell, library-finder, library-focus-subgraph]
# GROWS one provable unit at a time (slow growth / ADR-0183). The build is owned by the arc
# `library-tech-tree-overlay-arc` with plan `library-tech-tree-overlay-plan-4` (the 7-increment
# roadmap lives in the plan, not here). Increments 1 (library-drawer-shell), 2 (library-finder), and
# 3 (library-focus-subgraph) are authored so far; increments 4–7 (dive body panel, overview
# constellation, wire extension, #/library retirement) are authored just-in-time as the orchestrator
# consumes each.
#
# NO cross-story `depends_on` edge (the wire-shape-only / rides-the-existing-wire call): the
# drawer is a NEW SURFACE inside the studio map view (apps/studio/src/components), mounted inside
# TreeView.tsx's `.world-frame`. Increments 1–5 are entirely client-side and read the corpus DAG
# through the studio's EXISTING `useAppData().assets` React context (the `GuidanceAsset` wire the
# `studio` story's library backend already serves) — they add NO new `@storytree/*` package import,
# so there is no new cross-story code edge to declare (the `studio` story already owns the
# `library` corpus seam). Only increment 6 (server wire extension) touches
# `apps/studio/server/libraryBackend.ts` / `@storytree/library/store`, which is the `studio`
# server's own already-declared `library` edge — not a new edge for this story. See §"No new
# cross-story edge" below.
depends_on: []
decisions: [185, 70, 171, 161, 23]
---

# The Library as a tech-tree drawer over the forest map

**Outcome —** An operator explores the knowledge corpus as a tech-tree lens pulled down over the living forest map.

## What this is

The studio's Library today is a separate page (`#/library`, a searchable list/grid) — a route
*away* from the forest map, which is the studio's home surface. ADR-0185 (accepted 2026-07-11)
rebuilds it as a **city-builder tech-tree drawer OVER the map**: a lens pulled down over the living
world, not a different room. **Peek**: the drawer slides down and the map stays fully live below it.
**Dive**: opening an artifact renders its full body over the rest of the map while the drawer
collapses to a bar; Esc unwinds dive → peek → map. Navigation is search-first (a search-only
finder driving a focus subgraph); kind is text, colour is state; the empty state is the whole
corpus as a dot constellation under a level-of-detail ladder.

This is a **new bounded surface**, modelled as its own story (the peer pattern of `library-review`,
`spawn-visibility`, `terminal-chat` — a coherent studio-surface feature-arc gets its own story, not
a bolt-on to the giant retrospective `studio` story). The build is owned by the
`library-tech-tree-overlay-arc` arc with the disposable, git-anchored plan
`library-tech-tree-overlay-plan-2` (ADR-0183) — the 7-increment roadmap, recon facts, lanes, and
traps live in the plan; this story carries the provable units and the acceptance walkthrough.

The design is SETTLED — **ADR-0185 is the decision record; do not re-litigate** the peek/dive model,
the search-first finder, kind-as-text/colour-as-state, the dot-constellation LOD ladder, the
forest-cozy theme, or the `#/library` retirement call. The remaining owner touchpoints are the
operator-attested LOOK legs on each increment and the `#/library` retirement attestation (ADR-0185
dec 6, re-checked against the hosted members studio at that leg).

## Capabilities (grows with the arc)

Authored just-in-time, one provable unit per increment (ADR-0183 slow growth). Listed roots-first.

| # | increment | capability | outcome | status |
|---|---|---|---|---|
| 1 | Drawer shell | [`library-drawer-shell`](library-drawer-shell.md) | A slide-down Library drawer overlays the live forest map behind `?overlay=library` and walks a peek↔dive↔closed state machine. | authored |
| 2 | Finder panel | [`library-finder`](library-finder.md) | Client-side search over the loaded corpus (assets on id/title/description/body, ADRs on title/id only) with a `kindLabel` sub-line, ADR status, and selection lifted via `onSelect`. | authored |
| 3 | Focus subgraph | [`library-focus-subgraph`](library-focus-subgraph.md) | The selected artifact centred, `references[]` fanned upstream/downstream via dagre rankdir-LR, two-line `kindLabel` plaques with state-only colour, depth-1 with a stepper + `+N more` clusters and neighbour-click re-focus with a breadcrumb. | authored |
| 4 | Dive body panel | *(dive-body, unauthored)* | The full artifact body + Sources rendered over the map, deep-link-synced with `#/asset/<id>`, Esc-unwound. | planned |
| 5 | Overview constellation | *(overview, unauthored)* | The empty-state dot field of the whole corpus under the LOD ladder, search-glow highlighting, dot→plaque swap at close zoom. | planned |
| 6 | Wire extension | *(wire-extension, unauthored)* | `stepRefs`/`branchEdges`/`arcRef` passed through `GuidanceAsset`/`toGuidanceAsset`; typed edges rendered distinctly (a parallel server lane). | planned |
| 7 | Retire `#/library` | *(library-retire, unauthored)* | The standalone `#/library` page retires/redirects into the drawer, members parity re-checked (owner-attested, ADR-0185 dec 6). | planned |

### Anticipated within-story dependency graph (code-derived, authored per increment)

Drawn as each capability lands — NOT speculatively (ADR-0010 §3). **Authored so far:**
`library-drawer-shell` is the root (an overlay shell with no upstream, `depends_on: []`);
`library-finder` **`depends_on: [library-drawer-shell]`** — the finder fills the shell's reserved peek body
slot (`library-drawer-peek-slot`, `LibraryDrawer.tsx:111`), so it needs the shell's peek mode as its
precondition; `library-focus-subgraph` **`depends_on: [library-finder]`** — the subgraph CONSUMES the
finder's lifted `SearchResult` selection as its centre (the two-pane peek: finder left, subgraph right,
composed into the shell's existing `peekSlot` at the TreeView level — `LibraryDrawer.tsx` untouched), so it
needs the finder's selection as its precondition. **Anticipated (authored when their capabilities land):**
the dive body panel fills the shell's reserved region off a selection (`dive-body → library-drawer-shell`,
`dive-body → library-finder`); the overview constellation is the shell's empty state
(`overview → library-drawer-shell`). Increment 6 (server wire) is file-disjoint (a parallel lane, plan
§Lanes). These edges are authored when their capabilities are.

## No new cross-story edge (recorded — the rides-the-existing-wire call)

This story adds **no new cross-story `depends_on` edge** (mirroring the `studio` story's `chat-panel`
wire-shape-only call). The drawer is a client-side surface inside `apps/studio/src`, mounted as a
sibling overlay inside `TreeView.tsx`'s `.world-frame` (`apps/studio/src/components/TreeView.tsx:1899`).
The corpus DAG it renders (increments 2–5) is read through the studio's **existing** `useAppData().assets`
React context — the `GuidanceAsset` wire the `studio` story's library backend already serves
(`apps/studio/server/libraryBackend.ts` `toGuidanceAsset`) — so no capability here adds a NEW
`@storytree/*` runtime import the boundary scan (ADR-0100) would require a declared edge for. Increment 6
(the wire extension) edits the studio SERVER (`libraryBackend.ts`, which already imports
`@storytree/library/store` under the `studio` story's declared `library` edge) — a widening of an
existing seam, not a new story edge. Consequently `depends_on` is `[]` and there are no `artifact_edges`.
The overlay rides the world it sits over; it does not consume the `forest-world` render core (it is a
sibling overlay, not a scene-graph layer).

## Story UAT

The integrated **acceptance walkthrough** that proves the whole `library-tech-tree-overlay` organism
meets its outcome end-to-end against the **real running studio** (`pnpm --filter studio dev` with the
live corpus). Minimal-first: one coherent operator journey that opens the drawer, walks the corpus DAG
by search, dives into an artifact, sees the overview constellation, and closes back to the map. Each leg
marks its own witness — GEOMETRY/BEHAVIOUR legs are machine-witnessed (the frontend-builder `real:` arms
of the capabilities), the LOOK legs are operator-attested (ADR-0070 stage 2; the owner sees the drawer
slide, read as part of the world, legible against the map).

> **Proof status (honest) — `proposed`; only increment 1 authored.** This UAT describes the TARGET
> journey the whole drawer must pass. As of authoring only `library-drawer-shell` (increment 1) exists
> and is real-buildable; legs 2–6 depend on increments 2–5 and are placeholders until those capabilities
> are authored and built. The story reaches `healthy` only when every capability's proof is green AND
> this UAT passes against the real running studio — earned through the gate, never authored (ADR-0020).

**Goal —** One operator, in one session against the real running studio, pulls the Library down over the
forest map, walks from a search to an artifact's neighbourhood, dives into its body and back, glimpses the
whole-corpus constellation, and closes the drawer — the map staying live the whole time except during a
deliberate dive.

1. Open the studio map (`#/tree`) and append `?overlay=library` to the URL. **Success (machine —
   `library-drawer-shell`) —** the Library drawer slides down over the map in **peek**; the forest map
   stays fully live and interactive beneath it (no dimming scrim). **Look (operator-attested) —** the
   drawer reads as part of the world (the map's forest-cozy palette), sitting above the map chrome but
   below the flyout/chat layers, legible against the map.
2. Type a query into the finder. **Success (machine — `finder`) —** results narrow client-side over the
   loaded corpus (id/title/description/body + ADR titles), each result showing its kind as a muted
   sub-line (via `kindLabel`, so `arc` reads "Epic"); selecting one sets the finder selection.
3. Read the selected artifact's neighbourhood. **Success (machine — `library-focus-subgraph`) —** the selected
   artifact is centred, its `references[]` fan upstream (stands on) left and downstream (stood on by)
   right, depth-1 by default with a depth stepper and `+N more` cluster chips for hubs; clicking a
   neighbour re-focuses with a breadcrumb back. **Look (operator-attested) —** two-line kind-in-node
   plaques (title / kind), colour encoding STATE only (the selected chain lights purple, ephemeral
   plan nodes dashed).
4. Open the selected artifact to read it. **Success (machine — `dive-body`) —** the drawer collapses to
   a bar and the artifact's full body + Sources render over the rest of the map (ADR bodies fetched via
   `docContent()`); the route syncs to `#/asset/<id>`; Esc unwinds dive → peek → map. **Look
   (operator-attested) —** the dive body reads over the world without losing the peek bar.
5. Clear the finder to the empty state. **Success (machine — `overview`) —** the whole corpus renders as
   a dot constellation (circle = artifact, square = ADR), sized by importance, one SVG element per node
   at far zoom; a search match pulses independent of zoom; nodes swap to plaques at close zoom. **Look
   (operator-attested) —** the constellation reads as a tech-tree overview and stays smooth as the corpus
   grows toward ~2000 nodes (the LOD ladder holds).
6. Press Esc until the drawer closes. **Success (machine — `library-drawer-shell`) —** the drawer walks
   back peek → closed and the operator is returned to the full live map with no residue; the `?overlay=library`
   flag is cleared so a reload stays on the bare map.

## Proof

The story carries the UAT (above) at the story tier (ADR-0010 §2). It is proven when that UAT passes
against the real running studio AND its capabilities' `real:` proofs (geometry/behaviour) are signed
green underneath it, with the LOOK legs operator-attested (ADR-0070). **Honest status — `proposed`.**
Nothing here is proven through the ceremony; `healthy` is derived from signed verdicts, never authored.
See [`../README.md`](../README.md) for the representation and field mapping.
