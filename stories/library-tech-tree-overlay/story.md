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
capabilities: [library-drawer-shell, library-finder, library-dag-canvas, library-dive-body, library-overview, library-adr-wire-signals, library-typed-edges, library-permanent-lens, library-open-overlay, library-open-trigger, library-category-shelf, library-selection-card, library-lens-minimise]
# GROWS one provable unit at a time (slow growth / ADR-0183). The build is owned by the arc
# `library-tech-tree-overlay-arc`, whose disposable per-increment plans carry the live roadmap (the
# roadmap lives in the current plan, not here). Increments 1–6 have LANDED — library-drawer-shell
# (#691), library-finder (#693), library-focus-subgraph (#699), library-dive-body (#701),
# library-overview (#704), library-adr-wire-signals (#707). ADR-0187 (2026-07-12) re-sequenced the
# remaining arc: increment 8 (authored here via `library-tech-tree-overlay-plan-9`) is the
# interaction-model overhaul — the permanent lens (dec 1) replacing the peek/dive shell, the Open
# document overlay (dec 2) replacing the inline dive, and the double-click Open trigger; increment 7
# (the parallel server typed-edge wire lane) and increments 9 (overview look-overhaul, dec 3) / 10
# (#/library retirement) are authored just-in-time as the orchestrator consumes each.
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
| 1 | Drawer shell → permanent lens | [`library-drawer-shell`](library-drawer-shell.md) | The `?overlay=library` invocation gate (`readLibraryOverlay` reader + absent-renders-nothing); its closed↔peek↔dive state machine RETIRED by ADR-0187 dec 1, reworked into `library-permanent-lens`. | landed #691, reconciled inc 8 |
| 2 | Finder panel | [`library-finder`](library-finder.md) | Client-side search over the loaded corpus (assets on id/title/description/body, ADRs on title/id only) with a `kindLabel` sub-line, ADR status, and selection lifted via `onSelect`. | landed #693 |
| 3 | Focus subgraph → DAG canvas | [`library-dag-canvas`](library-dag-canvas.md) | The focus canvas is a true layered reference DAG (ADR-0188 dec 5): dagre rankdir-LR ranks over `references[]` BOTH ways to FULL transitive depth, DRAWN SVG edges between rank-adjacent nodes, per-branch ⊕ expanders (the global depth stepper + `+N more` chip retired), ← Back leading the breadcrumb with no canvas header, and a machine-asserted fit-to-view viewBox containing every node — the brownfield rework of the inc-3 focus subgraph (source files keep their names; only the capability/test/`ldag-` prefix are new). | authored (inc 10) |
| 4 | Dive body panel | [`library-dive-body`](library-dive-body.md) | The full artifact body + Sources rendered over the map, reusing AssetView (assets, no fetch) / DocView (ADRs, on-demand `docContent`), routed off `SearchResult.source`. | landed #701 |
| 5 | Overview constellation | [`library-overview`](library-overview.md) | The empty-state dot field of the whole corpus under the LOD ladder (importance = degree), search-glow highlighting, node-select lifted with finder parity. | landed #704 |
| 6 | ADR wire signals | [`library-adr-wire-signals`](library-adr-wire-signals.md) | Each ADR's `load_bearing` boolean + its decision-lineage edge numbers onto the studio wire via a tolerant flat-scan frontmatter parser (machine-only plumbing, no look leg). | landed #707 |
| 8 | Permanent lens (shell rework) | [`library-permanent-lens`](library-permanent-lens.md) | The overlay is a permanent lens (ADR-0187 dec 1): flag-gated presence, no ×/Dive/mode machine, live map beneath, a body slot, and a bottom selection-preview section firing `Open`. | authored (inc 8) |
| 8 | Open document overlay | [`library-open-overlay`](library-open-overlay.md) | A separate full-detail document overlay over the map (ADR-0187 dec 2, "like opening a Word doc"), reusing `LibraryDiveBody`, dismissable back to the lens. | authored (inc 8) |
| 8 | Open trigger (double-click) | [`library-open-trigger`](library-open-trigger.md) | Double-clicking a node on the overview constellation or the focus subgraph fires `onOpen` with the node's finder-parity `SearchResult` (additive; the single-click path stays byte-green). | authored (inc 8) |
| 9 | Category shelf | [`library-category-shelf`](library-category-shelf.md) | The finder's idle state is a category shelf (rows + counts derived from the corpus, never hardcoded) and each category is a removable search scope (browse-all then filter-within); the signed `lf-*` query path stays byte-green (ADR-0188 dec 2). | authored (inc 9) |
| 9 | Selection card | [`library-selection-card`](library-selection-card.md) | A pinned side-panel card renders the selection — asset title/kind/(corpus-looked-up)description or ADR title/status/load-bearing badge — with an Open button; null renders nothing, a stale selection renders tolerantly (ADR-0188 dec 3). | authored (inc 9) |
| 9 | Lens minimise handle | [`library-lens-minimise`](library-lens-minimise.md) | The permanent lens carries a bottom handle bar and minimises to just that handle (state kept on restore, no scrim); the inc-8 bottom selection-preview strip retires (ADR-0188 dec 6 + dec 3). | authored (inc 9) |
| 10 | Retire `#/library` | *(library-retire, unauthored)* | The standalone `#/library` page retires/redirects into the lens, members parity re-checked (owner-attested, ADR-0185 dec 6). | planned |

Increment 7 (the parallel server typed-edge wire lane, `GuidanceAsset` typed edges) is file-disjoint from
this story's client surfaces (plan §Lanes FENCE) and authored on its own lane. **Increment 9 (ADR-0188 —
the panel remold)** re-decomposes the earlier ADR-0187 dec-3 overview look-overhaul: the always-on side
panel becomes a category shelf (`library-category-shelf`, dec 2), a pinned selection card
(`library-selection-card`, dec 3), and a minimise handle (`library-lens-minimise`, dec 6), and the overview
constellation retires to a quiet idle canvas (dec 4 — the inc-5 `LibraryOverview` mount is removed by the
inc-9 glue, its `lov-*` contracts staying green while the source remains). The DAG canvas overhaul (drawn
edges, uncapped depth, expanders, breadcrumb/Back, palette — ADR-0188 dec 5) and the `#/library`
retirement follow as their own increments, authored just-in-time. Increments 9 and 10 share one
operator-attested look sitting against the owner-aligned mock (ADR-0188 Consequences).

### Within-story dependency graph (code-derived, authored per increment)

Drawn as each capability lands — NOT speculatively (ADR-0010 §3). **Increments 1–6 (landed):**
`library-drawer-shell` is the root (`depends_on: []`); `library-finder` **`depends_on: [library-drawer-shell]`**
(fills the shell's reserved peek body slot); `library-dag-canvas` **`depends_on: [library-finder]`**
(centres the finder's lifted `SearchResult`; the inc-10 DAG-canvas rework of the landed inc-3 focus subgraph —
ADR-0188 dec 5, see the increment-10 note below; the same edge, the node's graph identity unchanged);
`library-dive-body` **`depends_on: [library-finder]`** (renders
the finder's selection via `planDive`); `library-overview` **`depends_on: [library-finder]`** (originates a
selection into the same shared `librarySelection`); `library-adr-wire-signals` **`depends_on: [library-finder]`**
(the arc's shared foundational sequencing anchor — a standalone pure parser, not a hard code edge).

**Increment 8 (authored here, ADR-0187 dec 1/2 — the interaction-model overhaul):**
`library-permanent-lens` **`depends_on: []`** — the RE-AUTHOR of the root shell into the permanent lens
(retiring the closed→peek→dive state machine; it shares `LibraryDrawer.tsx` as source with the reconciled
`library-drawer-shell` but holds no upstream code edge); `library-open-overlay`
**`depends_on: [library-dive-body]`** — the separate Open document overlay REUSES the landed `LibraryDiveBody`
router verbatim inside its container; `library-open-trigger`
**`depends_on: [library-overview, library-dag-canvas]`** — the additive double-click Open trigger edits
both landed node surfaces (it re-points its edge from the retired `library-focus-subgraph` to the reworked
`library-dag-canvas`; the source file it edits, `LibraryFocusGraph.tsx`, keeps its name). The lens's bottom-section `onOpen`, the trigger's node `onOpen`, and the Open
overlay's `onDismiss` are wired together at the TreeView level (the orchestrator's supplement glue after each
leaf's PASS — plan §G); that glue removes the retired inline `diveSlot={<LibraryDiveBody …/>}` composition.
These edges are authored with their capabilities; the inc-8 caps carry no new cross-story edge (client-side,
reading the existing `useAppData()` wire — see §"No new cross-story edge").

**Increment 9 (authored here, ADR-0188 — the panel remold):** `library-category-shelf`
**`depends_on: [library-finder]`** — it reworks the landed finder (`LibraryFinder.tsx`) to add the idle
category shelf + the scope-chip browse/search model around the finder's existing `searchCorpus` query path (a
genuine within-story code edge on the finder); `library-selection-card` **`depends_on: [library-finder]`** — a
NET-NEW side-panel card that renders the finder's lifted `SearchResult` and resolves its detail from the same
loaded corpus (`assets`/`docs`); `library-lens-minimise` **`depends_on: [library-permanent-lens]`** — it
reworks the inc-8 permanent lens (`LibraryDrawer.tsx`) to add the minimise handle and retire the inc-8 bottom
selection-preview strip (whose Open job moves to `library-selection-card`, ADR-0188 dec 3). The inc-9 caps carry
no new cross-story edge (client-side, reading the existing `useAppData()` wire); the side-panel composition (the
finder + selection card in the lens body, the retired-strip removal, the overview-mount removal) is wired at the
TreeView level as the orchestrator's supplement glue after each leaf's PASS (plan §G). As part of inc 9,
story-author trims the now-false inc-8 contract `lpl-bottom-selection-preview-open-fires-onopen` from
`LibraryPermanentLens.test.tsx` (re-homed across `library-selection-card` + `library-lens-minimise`), executing
settled ADR-0188 dec 3/6 — not a re-decision (see `library-permanent-lens.md`'s reconciliation note).

**Increment 10 (authored here, ADR-0188 dec 5 — the DAG canvas rework):** `library-dag-canvas`
**`depends_on: [library-finder]`** — it REWORKS the landed inc-3 focus subgraph into a true layered reference
DAG (dagre rankdir-LR ranks over `references[]` BOTH ways to FULL transitive depth, DRAWN SVG edges, per-branch
⊕ expanders replacing the retired global depth stepper + `+N more` chip, ← Back leading the breadcrumb with no
canvas header, and a machine-asserted fit-to-view viewBox), keeping the SAME `depends_on: [library-finder]` edge
the focus subgraph held (it centres the finder's lifted `SearchResult` — the node's identity in the graph is
unchanged). The SOURCE FILES KEEP THEIR NAMES (`LibraryFocusGraph.tsx` / `focusGraph.ts`) — only the
capability, its test file (`LibraryDagCanvas.test.tsx`), and the contract prefix (`ldag-`) are new; the retired
`library-focus-subgraph`'s still-true `lfg-*` behaviours re-home as `ldag-` contracts. `library-open-trigger`
re-points its edge from the retired `library-focus-subgraph` to `library-dag-canvas` (the source file
`LibraryFocusGraph.tsx` it edits keeps its name, so its `lot-*` tests stay byte-green). The inc-10 cap carries
no new cross-story edge (client-side, reading the existing `useAppData()` wire); the DAG-canvas CSS look + the
TreeView mount are the orchestrator's supplement glue after the leaf's PASS (plan §G). Deleting the retired
`lfg-*` test file and swapping the `node-build.test.ts` snapshot is the orchestrator's mechanical glue, done
separately — not this capability's `real:` scope.

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
3. Read the selected artifact's neighbourhood. **Success (machine — `library-dag-canvas`) —** the selected
   artifact is centred in a layered reference DAG, its `references[]` fanning upstream (stands on) left
   and downstream (stood on by) right to FULL transitive depth, with DRAWN edges between rank-adjacent
   nodes and per-branch ⊕ expanders taming breadth (no global depth stepper) and a fit-to-view viewBox
   holding every node; clicking a neighbour re-focuses with ← Back leading the breadcrumb. **Look (operator-attested) —** two-line kind-in-node
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
