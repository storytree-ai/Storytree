---
id: "library-tech-tree-overlay"
tier: story
title: "The Library as a tech-tree drawer over the forest map"
outcome: "An operator explores the knowledge corpus as a tech-tree lens pulled down over the living forest map."
status: proposed
proof_mode: UAT
# Frontend-builder two-stage (ADR-0070) still governs where an appearance verdict lives at the
# CAPABILITY tier, but this story's UAT carries NO look leg any more. ADR-0348 D6 (2026-08-11)
# ruled a user EXPERIENCE property is not a user ACCEPTANCE criterion, and the ADR-0294 D2/D4
# pass of 2026-08-21 deleted the four fused `Look (operator-attested)` clauses this story carried
# (their design intent is preserved under "The Library's LOOK" in the UAT section). The story
# still carries NO blanket `uat_witness: machine` override and its one surviving UAT leg marks
# its own witness, which is `machine`.
#   (This comment previously read: "every drawer surface (the shell, the finder, the focus
#   subgraph, the dive body, the overview constellation) splits into a machine-witnessed
#   GEOMETRY/BEHAVIOUR leg and an operator-attested LOOK leg. A UI an agent cannot drive is a
#   human-witness UAT action, not a machine visual verdict (uat-proves-the-goal-not-the-surface).
#   So this story is mixed-witness…". Corrected in place, ADR-0139.)
capabilities: [library-drawer-shell, library-finder, library-dag-canvas, library-dive-body, library-overview, library-adr-wire-signals, library-typed-edges, library-process-flow, library-permanent-lens, library-open-overlay, library-open-trigger, library-category-shelf, library-selection-card, library-top-drawer, library-lifecycle-wire, library-lifecycle-shelf, library-retire-standalone-page]
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
# HOSTED-STORY edges (ADR-0192, the landlord rule — REVISING this spec's original "no cross-story
# edge" call, which conflated "no new @storytree/* package import" (true) with "no dependency"
# (false): the story rendered as an orphaned island, owner-caught 2026-07-13). The units prove
# SOURCE files inside two other stories' territories, so the hosting is declared:
#   - studio: every client cap's sources live under apps/studio/src (mounted in TreeView's
#     `.world-frame`, fed by the studio's EXISTING `useAppData().assets` context) and value-import
#     studio-owned modules (kindDisplay, AssetView/DocView, stressLayout); the inc-6/8 server units
#     bind apps/studio/server files (libraryBackend widening, adrWireSignals.ts).
#   - library: the inc-7 typed-edges lane binds sources inside packages/library/src/store
#     (render-doc.ts) — the wire's shape is proven inside the library organism's own territory.
# See §"Cross-story edges (the hosting call)" below.
depends_on: [studio, library]
# ADR-0166 artifact edges: both are hosted-seam edges — no @storytree/* package import backs them
# (the overlay reads the studio's existing GuidanceAsset wire; the library-side files are edits
# inside the library's own package) — so both are annotated deliberate non-import edges.
artifact_edges: [studio, library]
decisions: [185, 70, 171, 161, 23]
---

# The Library as a tech-tree drawer over the forest map

**Outcome —** An operator explores the knowledge corpus as a tech-tree lens pulled down over the living forest map.

## What this is

The studio's Library today is a separate page (`#/library`, a searchable list/grid) — a route
*away* from the forest map, which is the studio's home surface. ADR-0185 (accepted 2026-07-11)
rebuilds it as a **city-builder tech-tree drawer OVER the map**: a lens pulled down over the living
world, not a different room. **Peek**: the drawer slides down and the map stays fully live below it.
**Open**: opening an artifact mounts its full body in a separate overlay over the map, and dismissing
it (the close control or Esc) returns to the lens in one hop. Navigation is search-first (a
search-only finder driving a focus subgraph); kind is text, colour is state; the empty state is the
whole corpus as a dot constellation under a level-of-detail ladder.

*(The **Open** sentence previously read: "**Dive**: opening an artifact renders its full body over
the rest of the map while the drawer collapses to a bar; Esc unwinds dive → peek → map." That was
ADR-0185 dec 1's closed↔peek↔dive state machine, which **ADR-0187 dec 1 RETIRED** in favour of the
permanent lens plus a separate Open document overlay (dec 2). It stood here in the present tense long
after the model it describes stopped existing, and the ADR-0294 D2/D4 pass of 2026-08-21 — which
re-authored the UAT leg that restated the same retired clauses — would otherwise contradict it.
Corrected in place, ADR-0139. The **empty state** sentence is also weaker than it reads: the
constellation surface exists and its suite is green, but ADR-0188 dec 4 removed its mount and nothing
has re-mounted it, so it is not on screen today — see the increment-9 note under "Capabilities".)*

This is a **new bounded surface**, modelled as its own story (the peer pattern of `library-review`,
`spawn-visibility`, `app-guide` — a coherent studio-surface feature-arc gets its own story, not
a bolt-on to the giant retrospective `studio` story). The build is owned by the
`library-tech-tree-overlay-arc` arc with the disposable, git-anchored plan
`library-tech-tree-overlay-plan-2` (ADR-0183) — the 7-increment roadmap, recon facts, lanes, and
traps live in the plan; this story carries the provable units and the acceptance walkthrough.

The design is SETTLED — **ADR-0185 is the decision record; do not re-litigate** the peek/dive model,
the search-first finder, kind-as-text/colour-as-state, the dot-constellation LOD ladder, the
forest-cozy theme, or the `#/library` retirement call. The one remaining owner touchpoint is the
`#/library` retirement attestation (ADR-0185 dec 6, re-checked against the hosted members studio at
that leg; the owner attested the lens 2026-07-15).

*(This previously read "The remaining owner touchpoints are the **operator-attested LOOK legs on each
increment** and the `#/library` retirement attestation…". There are no look legs to attest — ADR-0348
D6 ruled a user EXPERIENCE property is not a user ACCEPTANCE criterion, and the ADR-0294 D2/D4 pass of
2026-08-21 deleted the four fused `Look (operator-attested)` clauses this story carried, recording
their intent under "The Library's LOOK" in the UAT section instead. Corrected in place, ADR-0139.)*

## Capabilities (grows with the arc)

Authored just-in-time, one provable unit per increment (ADR-0183 slow growth). Listed roots-first.

| # | increment | capability | outcome | status |
|---|---|---|---|---|
| 1 | Drawer shell → permanent lens | [`library-drawer-shell`](library-drawer-shell.md) | The `?overlay=library` invocation gate (`readLibraryOverlay` reader + absent-renders-nothing); its closed↔peek↔dive state machine RETIRED by ADR-0187 dec 1, reworked into `library-permanent-lens`. | landed #691, reconciled inc 8 |
| 2 | Finder panel | [`library-finder`](library-finder.md) | Client-side search over the loaded corpus (assets on id/title/description/body, ADRs on title/id only) with a `kindLabel` sub-line, ADR status, and selection lifted via `onSelect`. | landed #693 |
| 3 | Focus subgraph → DAG canvas | [`library-dag-canvas`](library-dag-canvas.md) | The focus canvas is a true layered reference DAG (ADR-0188 dec 5, walk reversed to one level by ADR-0193 dec 3): dagre rankdir-LR ranks over `references[]` BOTH ways to ONE level upstream + ONE level downstream, DRAWN SVG edges between rank-adjacent nodes, per-branch ⊕ expanders (the global depth stepper + `+N more` chip retired), NO ← Back / breadcrumb / pan-zoom controls (click-through re-centre is the whole navigation, ADR-0193 dec 3), and a machine-asserted fit-to-view viewBox containing every node — the brownfield rework of the inc-3 focus subgraph (source files keep their names; only the capability/test/`ldag-` prefix are new). | authored (inc 10) |
| 4 | Dive body panel | [`library-dive-body`](library-dive-body.md) | The full artifact body + Sources rendered over the map, reusing AssetView (assets, no fetch) / DocView (ADRs, on-demand `docContent`), routed off `SearchResult.source`. | landed #701 |
| 5 | Overview constellation | [`library-overview`](library-overview.md) | The empty-state dot field of the whole corpus under the LOD ladder (importance = degree), search-glow highlighting, node-select lifted with finder parity. | landed #704 |
| 6 | ADR wire signals | [`library-adr-wire-signals`](library-adr-wire-signals.md) | Each ADR's `load_bearing` boolean + its decision-lineage edge numbers onto the studio wire via a tolerant flat-scan frontmatter parser (machine-only plumbing, no look leg). | landed #707 |
| 8 | Permanent lens (shell rework) | [`library-permanent-lens`](library-permanent-lens.md) | The overlay is a permanent lens (ADR-0187 dec 1): flag-gated presence, no ×/Dive/mode machine, live map beneath, a body slot, and a bottom selection-preview section firing `Open`. | authored (inc 8) |
| 8 | Open document overlay | [`library-open-overlay`](library-open-overlay.md) | A separate full-detail document overlay over the map (ADR-0187 dec 2, "like opening a Word doc"), reusing `LibraryDiveBody`, dismissable back to the lens. | authored (inc 8) |
| 8 | Open trigger (double-click) | [`library-open-trigger`](library-open-trigger.md) | Double-clicking a node on the overview constellation or the focus subgraph fires `onOpen` with the node's finder-parity `SearchResult` (additive; the single-click path stays byte-green). | authored (inc 8) |
| 9 | Category shelf | [`library-category-shelf`](library-category-shelf.md) | The finder's idle state is a category shelf (rows + counts derived from the corpus, never hardcoded) and each category is a removable search scope (browse-all then filter-within); the signed `lf-*` query path stays byte-green (ADR-0188 dec 2). | authored (inc 9) |
| 9 | Selection card | [`library-selection-card`](library-selection-card.md) | A pinned side-panel card renders the selection — asset title/kind/(corpus-looked-up)description or ADR title/status/load-bearing badge — with an Open button; null renders nothing, a stale selection renders tolerantly (ADR-0188 dec 3). | authored (inc 9) |
| 9 | Lens minimise → top drawer handle (shell-affordance polish) | [`library-top-drawer`](library-top-drawer.md) | The lens presents by DEFAULT as a collapsed top drawer handle (visible on every map load); lens state is URL-derived (`?overlay=library` present = expanded, absent = the collapsed handle), the handle firing an `onToggle` seam the parent glue owns; the ADR-0188 dec-6 minimise machine + the #715 corner toggle retire; no scrim either state (ADR-0191). The brownfield rework of the inc-9 minimise lens — REPLACES `library-lens-minimise` on the same source (`LibraryDrawer.tsx`), the inc-10 cap-replacement precedent; only the capability/test/`ltd-` prefix are new. | authored (inc 12) |
| 11 | Retire `#/library` | [`library-retire-standalone-page`](library-retire-standalone-page.md) | The standalone `#/library` page retires into the lens: `libraryHref()` re-points to `?overlay=library#/tree` (every caller follows for free), `parseRoute('#/library')` + `/library/<category>` redirect to the tree route, and the `{name:'library'}` variant leaves the `Route` union — every other route unchanged (ADR-0185 dec 6, owner attested the lens 2026-07-15). | authored (inc 11) |
| 13 | Unified lifecycle wire | [`library-lifecycle-wire`](library-lifecycle-wire.md) | A pure, browser-safe `lifecycleOf(kind, doc) → open \| active \| archived` in `@storytree/library` (root barrel, no `node:` imports) maps every stored per-kind vocabulary onto ADR-0196's universal triad; AND `renderStoredDoc` serializes a plan doc's `status` onto the `GuidanceAsset` wire (mirroring `arcRef`). Machine-only plumbing, no look leg. | authored (inc 13) |
| 13 | Lifecycle shelf toggle | [`library-lifecycle-shelf`](library-lifecycle-shelf.md) | The finder gains an Active \| All lifecycle toggle (default Active): Active rows count `open`+`active` via `lifecycleOf` with the muted total ("2 of 38"); the Decisions row counts only `group === 'Decisions'` (223→191); scoped state chips use each kind's own stored vocabulary and filter the scoped browse; the signed `lf-*`/`lcs-*` paths stay byte-green. | landed #731; re-proven inc 14 (ADR-0197) |
| 14 | Lifecycle selector (shelf re-prove) | [`library-lifecycle-shelf`](library-lifecycle-shelf.md) | The inc-13 Active \| All toggle + per-kind state chips + "N of M" totals collapse to ONE three-state selector (open \| active \| archived, DEFAULT open) governing the shelf categories, the scoped browse, and the search uniformly (zero-in-state categories hidden, plain per-state counts); the per-kind chips retire; quiet one-line empty states. SAME node, contracts v2 (ADR-0197, amends 0196 D3). | authored (inc 14) |

Increment 7 (the parallel server typed-edge wire lane, `GuidanceAsset` typed edges) is file-disjoint from
this story's client surfaces (plan §Lanes FENCE) and authored on its own lane. **Increment 9 (ADR-0188 —
the panel remold)** re-decomposes the earlier ADR-0187 dec-3 overview look-overhaul: the always-on side
panel becomes a category shelf (`library-category-shelf`, dec 2), a pinned selection card
(`library-selection-card`, dec 3), and a minimise handle (`library-lens-minimise`, dec 6), and the overview
constellation retires to a quiet idle canvas (dec 4 — the inc-5 `LibraryOverview` mount is removed by the
inc-9 glue, its `lov-*` contracts staying green while the source remains). The DAG canvas overhaul (drawn
edges, one-level-each-way walk, expanders, palette — ADR-0188 dec 5, its depth reversed to one level and its
Back/breadcrumb removed by ADR-0193 dec 3) and the `#/library` retirement follow as their own increments,
authored just-in-time. Increments 9 and 10 share one
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
reading the existing `useAppData()` wire — see §"Cross-story edges (the hosting call)").

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
DAG (dagre rankdir-LR ranks over `references[]` BOTH ways to ONE level each way — ADR-0193 dec 3 reversed
ADR-0188 dec 5's full transitive walk — DRAWN SVG edges, per-branch ⊕ expanders replacing the retired global
depth stepper + `+N more` chip, NO ← Back / breadcrumb / pan-zoom controls (ADR-0193 dec 3), and a
machine-asserted fit-to-view viewBox), keeping the SAME `depends_on: [library-finder]` edge
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

**Increment 12 (authored here, ADR-0191 — the top drawer rework; amends ADR-0188 dec 1/6):** `library-top-drawer`
**`depends_on: [library-permanent-lens]`** — it REWORKS the inc-9 minimise lens (`LibraryDrawer.tsx`) so the lens
presents by DEFAULT as a collapsed top drawer handle and its state is URL-derived (`?overlay=library` present =
expanded, absent = the collapsed handle), the handle firing a new `onToggle?` seam the parent glue owns (the
component never writes the URL itself), and the ADR-0188 dec-6 component-local Minimise/Restore machine + the #715
`.world-library-dock` corner toggle both retire. It keeps the SAME `depends_on: [library-permanent-lens]` edge the
retired `library-lens-minimise` held (it needs the delivered permanent lens's flag-derived render, `bodySlot`, and
no-scrim posture as its precondition — the node's identity in the graph is unchanged). This REPLACES
`library-lens-minimise` (DELETED) on the same source — the inc-10 cap-replacement precedent (`library-dag-canvas`
replaced `library-focus-subgraph`): the SOURCE FILE KEEPS ITS NAME (`LibraryDrawer.tsx`) — only the capability,
its test file (`LibraryTopDrawer.test.tsx`), and the contract prefix (`ltd-`) are new; the retired
`library-lens-minimise`'s still-true behaviours (the handle bar + state-kept body, the flag gate, the no-scrim
posture) re-home as `ltd-` contracts. As part of THIS increment the inc-9 `lpl-flag-gates-permanent-lens` contract
RETIRES — ADR-0191 makes "the flag alone gates presence — absent renders nothing" false (absent now renders the
collapsed handle); its flag semantics re-home across `library-top-drawer`'s `ltd-collapsed-handle-by-default` +
`ltd-flag-renders-expanded` + `ltd-flag-reader-survives` (see `library-permanent-lens.md`'s ADR-0191
reconciliation note). The other three `lpl-*` contracts survive verbatim. The inc-12 cap carries no new cross-story
edge (client-side, reading the existing `useAppData()` wire); the TreeView mount rewire, the full-width / half-screen
look (ADR-0193 dec 1), the URL write via `commitSearch`, and REMOVING the #715 corner toggle are the orchestrator's supplement glue
after the leaf's PASS (plan §G). Deleting the retired `LibraryLensMinimise.test.tsx`, swapping the
`node-build.test.ts` REAL-buildable snapshot, and trimming the `lpl-flag-gates-permanent-lens` block from
`LibraryPermanentLens.test.tsx` are the orchestrator's mechanical glue, done separately — not this capability's
`real:` scope (its `sourceGlobs` is `LibraryDrawer.tsx` only, its `testGlobs` is `LibraryTopDrawer.test.tsx` only).

**Increment 13 (authored here, ADR-0196 — the unified artifact lifecycle):** `library-lifecycle-wire`
**`depends_on: [library-finder]`** — the arc's shared foundational SEQUENCING anchor (not a hard code edge, like
`library-typed-edges` inc 7): a NET-NEW pure browser-safe projection `lifecycleOf` in `packages/library/src/lifecycle.ts`
(re-exported from the root barrel) that maps every stored per-kind vocabulary (friction `route`, plan `status`,
adr status, the stateless-kind defaults) onto ADR-0196's `open`/`active`/`archived` triad, PLUS the parallel
`renderStoredDoc` read that crosses a plan's `status` onto the `GuidanceAsset` wire beside `arcRef` (its `real:`
surface is `lifecycle.ts` + `render-doc.ts` + `lifecycle.test.ts` only — machine-only, no look leg, exactly like
inc-7 `library-typed-edges`). `library-lifecycle-shelf`
**`depends_on: [library-category-shelf, library-lifecycle-wire]`** — it REWORKS the landed inc-9 category-shelf
finder (`LibraryFinder.tsx` / `libraryShelf.ts`) to add the Active|All lifecycle toggle, the live/total counts,
the Decisions count-bug fix, and the scoped per-kind state chips (a genuine within-story code edge on the
category-shelf finder, so `depends_on: [library-category-shelf]`), and it CONSUMES `lifecycleOf` + the plan-`status`
wire the sibling delivered (so `depends_on: [library-lifecycle-wire]`). The inc-13 caps carry no new cross-story
edge — `library-lifecycle-wire` binds `packages/library/src/store` files (the `render-doc.ts` wire, inside the
library organism's own territory, the inc-7 lane) and the browser-safe root-barrel `lifecycle.ts`, and
`library-lifecycle-shelf` is client-side reading the existing `useAppData()` wire plus consuming the already-declared
`@storytree/library` studio dependency (the projection is a pure barrel export — no NEW `@storytree/*` runtime import).
The CLI's `friction-lifecycle.ts` folding onto the universal `lifecycleOf` (ADR-0196 D3), the `toGuidanceAsset`
carry-through of plan `status` (`apps/studio/server/libraryBackend.ts`), the finder mount into `TreeView.tsx`, and
the toggle/chip look are the orchestrator's supplement glue after each leaf's PASS (plan §G).

**Increment 14 (authored here, ADR-0197 — the lifecycle selector; amends ADR-0196 D3):** `library-lifecycle-shelf`
**`depends_on: [library-category-shelf, library-lifecycle-wire]`** — UNCHANGED node identity and edges. ADR-0197
(owner-directed at the landed #731 walk, ADR-0110) RE-PROVES the same inc-13 lifecycle-shelf node — the inc-12
`library-top-drawer` re-prove precedent, but on the SAME cap id (the contract set is replaced v1→v2, the node is
not): the owner reviewed the Active|All toggle + per-kind state chips + "N of M" muted totals and directed their
collapse into ONE three-state selector (open|active|archived, DEFAULT open) that governs the shelf categories, the
scoped browse, and the typed search uniformly. It still reworks the same category-shelf finder (`LibraryFinder.tsx`
/ `libraryShelf.ts`) around the delivered shelf/scope/search path (so `depends_on: [library-category-shelf]`) and
still consumes `lifecycleOf` + the already-landed plan-`status` wire (so `depends_on: [library-lifecycle-wire]`) —
no new cross-story edge, and NO `types.ts` change (`GuidanceAsset.status?` landed at #731, so its `real.scope`
drops `types.ts`). Per ADR-0197 D5 this increment genuinely RE-TENSES a handful of signed `lf-*`/`lcs-*` COMPONENT
blocks whose durable-kind fixtures project `active` and so become unobservable under the default `open` state:
story-author records the retire/re-home notes on `library-finder.md` + `library-category-shelf.md` (which `lf-*`/
`lcs-*` blocks survive byte-green vs are trimmed), the orchestrator trims the re-tensed blocks as mechanical glue
committed BEFORE the `--real` build (the inc-10/inc-12 precedent), and the surviving behaviours re-prove under the
v2 `lls-*` selector contracts. The three-state selector look, the empty-state copy, and the finder mount into
`TreeView.tsx` are the orchestrator's supplement glue after the leaf's PASS (plan §G).

## Cross-story edges (the hosting call — revised by ADR-0192)

> **Revision (ADR-0192, 2026-07-13).** This section originally argued `depends_on: []` on the ground
> that the drawer "adds no new `@storytree/*` runtime import the boundary scan (ADR-0100) would
> require a declared edge for". That claim was — and remains — literally true, but it conflated "no
> new package import" with "no dependency": the story's proof-bound SOURCE files live inside other
> stories' territories, a real hosting relationship the forest must draw. The result was an orphaned
> island on the map (owner-caught 2026-07-13), the incident that decided the landlord rule (ADR-0192).

The story declares two **hosted-seam** edges (annotated in `artifact_edges`, ADR-0166 — no package
import backs them):

- **`studio`** — the drawer is a client-side surface inside `apps/studio/src`, mounted as a sibling
  overlay inside `TreeView.tsx`'s `.world-frame` and fed by the studio's **existing**
  `useAppData().assets` React context (the `GuidanceAsset` wire the `studio` story's library backend
  already serves via `toGuidanceAsset`); its components also value-import studio-owned modules
  (`kindDisplay`, `AssetView`/`DocView`, `stressLayout`). The inc-6/8 server units bind
  `apps/studio/server` files (the `libraryBackend.ts` widening, `adrWireSignals.ts`).
- **`library`** — the inc-7 typed-edges lane binds sources inside `packages/library/src/store`
  (`render-doc.ts`): the wire's shape is proven inside the library organism's own territory.

Per-capability the original observation still stands: no capability adds a NEW `@storytree/*` runtime
import, so no increment adds an edge beyond these two story-level hosting edges. The overlay rides the
world it sits over; it does not consume the `forest-world` render core (it is a sibling overlay, not a
scene-graph layer).

## UAT Test Criteria

The integrated **acceptance walkthrough** that proves the whole `library-tech-tree-overlay` organism
meets its outcome end-to-end against the **real running studio** (`pnpm --filter studio dev` with the
live corpus). Minimal-first: one coherent operator journey. After the ADR-0294 D2/D4 pass of
2026-08-21 the walkthrough carries ONE leg — the composed open-an-artifact step, whose halves are
proven at the capability tier but whose COMPOSITION is not (see the pass block below); the other five
steps of the original journey are each proven one rung down and are recorded in the disposition table
rather than restated here. The surviving leg marks its own witness and is machine-witnessed.
*(This paragraph previously read "…one coherent operator journey that opens the drawer, walks the
corpus DAG by search, dives into an artifact, sees the overview constellation, and closes back to the
map. Each leg marks its own witness — GEOMETRY/BEHAVIOUR legs are machine-witnessed (the
frontend-builder `real:` arms of the capabilities), the LOOK legs are operator-attested (ADR-0070
stage 2; the owner sees the drawer slide, read as part of the world, legible against the map)."
There are no LOOK legs any more — ADR-0348 D6 ruled an experience property is not an acceptance
criterion — and the journey it enumerated no longer matches the surviving list. Corrected in place,
ADR-0139.)*

> **Proof status (honest) — `proposed`.** This UAT describes the operator journey the whole drawer
> must pass. The story reaches `healthy` only when every capability's proof is green AND this UAT
> passes against the real running studio — earned through the gate, never authored (ADR-0020).
> *(This note previously read "`proposed`; only increment 1 authored … As of authoring only
> `library-drawer-shell` (increment 1) exists and is real-buildable; legs 2–6 depend on increments
> 2–5 and are placeholders until those capabilities are authored and built." That stopped being true
> once all five named capabilities were built and carried real suites; the 2026-08-08 disposition
> below recorded the correction in its own prose but left the sentence standing. Corrected in place
> here per ADR-0139.)*

> **ADR-0294 D2/D4 pass, 2026-08-21 — legs 1, 3 and 5 are DELETED; leg 4 is RE-AUTHORED and declared
> UNBOUND.** The fourth and final slice of the D4 pass over live stories (predecessors: PR #1444, the
> desktop terminal cluster; PR #1448, the studio/claim cluster; PR #1459, `website-experience` /
> `uat-attestation` / `desktop`). All four legs were left whole by the 2026-08-08 adjudication for a
> SCOPING reason that has since expired — each FUSES a machine `Success` clause with a
> `Look (operator-attested)` clause, and the Look halves were reserved for chip `task_99f7e0a9`
> (ADR-0294 D3, which would have RELOCATED them to the capability whose look it is). **ADR-0348 D6 is
> that adjudication and it went the other way** — a user EXPERIENCE property is not a user ACCEPTANCE
> criterion at all — so the disposition changed from relocate-to-capability to DELETE and the chip's
> claim on these four is discharged. With the Look halves disposed of, D2 applies to what remains.
> The design intent the Look clauses carried is preserved under "The Library's LOOK" below.
>
> **Leg 1 (open the Library drawer on the map) is DELETED.** Every observable it states is asserted
> one-to-one by [`library-top-drawer`](library-top-drawer.md) at
> `apps/studio/src/components/LibraryTopDrawer.test.tsx`: "ltd-collapsed-handle-by-default:
> `search=""` renders the collapsed handle — no wordmark, no body, no scrim" (presents by DEFAULT as
> a collapsed handle, visible with no URL knowledge); "ltd-flag-renders-expanded: `?overlay=library`
> renders expanded, with the body, the handle, and the wordmark" (a deep link carrying the flag opens
> EXPANDED); "ltd-handle-toggle-fires-in-both-states: the arrow toggle fires onToggle once from
> collapsed and once from expanded; no word button; no history mutation" and
> "ltd-lens-state-is-url-derived: a changed `search` flips collapsed -> expanded -> collapsed ->
> expanded, keeping the handed body" (clicking the handle expands, state is URL-derived);
> "ltd-no-scrim-either-state: no scrim renders collapsed or expanded" (the leg's own parenthesised
> observable for "the map stays fully live beneath", verbatim); and "ltd-flag-reader-survives:
> `?overlay=library` reads true; `""` and an unrelated value read false". Checked against that file's
> ACTUAL assertions, not its file existence (ADR-0294 D2's honesty wall).
> **⚠ Its FRAMING was also overtaken, and that is a second reason it should not survive as authored.**
> The leg says "the LIBRARY presents by default as a collapsed top drawer handle". Since ADR-0267 D1
> and ADR-0314 D6 the handle belongs to the DRAWER, whose PRIMARY lens is arcs
> (`DEFAULT_DRAWER_LENS = 'arcs'` in `apps/studio/src/lib/drawerLens.ts`), and the Library is the
> demoted half of an `Arcs | Library` toggle in the same header — so clicking the handle opens ARCS,
> not the Library. The deletion is not "this is proven one rung down" alone; the journey step as
> WORDED no longer describes the surface.
>
> **Leg 3 (read the selected neighbourhood DAG) is DELETED — and the deletion must NOT be read as
> "proven one rung down" without this correction.** Its observables map one-to-one onto
> [`library-dag-canvas`](library-dag-canvas.md) at
> `apps/studio/src/components/LibraryDagCanvas.test.tsx`: "ldag-adjacency-one-level-each-way",
> "ldag-layered-ranks-upstream-left-downstream-right", "ldag-edges-drawn-between-nodes",
> "ldag-per-branch-fan-cap-collapses-overflow", "ldag-per-node-expander-expands-in-place",
> "ldag-viewbox-contains-all-nodes", "ldag-neighbour-click-refocuses" and
> "ldag-no-back-no-breadcrumb-no-panzoom". **But the leg names the wrong MECHANISM.** It says the DAG
> fans the artifact's `references[]`; the shipped behaviour walks **`standsOn`**
> ("ldag-adjacency-one-level-each-way: walks standsOn BOTH ways to ONE level only in each direction")
> and explicitly DEMOTES citations out of the graph
> ("ldag-citations-are-demoted-out-of-the-dag: a `references[]` citation contributes NO node and NO
> edge, and a mutual citation pair cannot close a cycle"). The leg's wording predates that demotion.
> So what the rung proves is the CORRECTED behaviour, not the one the leg describes — the journey
> step survives at the capability tier, the field name it cites does not survive anywhere.
>
> **Leg 5 (see the whole-corpus overview) is DELETED, and it carries the pass's one authoring call.**
> Its behavioural clauses are asserted by [`library-overview`](library-overview.md) at
> `apps/studio/src/components/LibraryOverview.test.tsx`:
> "lov-far-band-one-element-per-node: at the FAR band each node is exactly one element — circle for an
> artifact, square for an ADR — with no ambient labels" (the dot constellation, the shapes, and one
> element per node at far zoom); "lov-size-tier-buckets-by-importance" with
> "lov-importance-degree-over-references" (sized by importance); "lov-lod-band-by-zoom: zoom maps to
> exactly one of far/mid/close, and never reverses to a farther band as zoom increases" together with
> "lov-close-band-arc-plaque-reads-epic" (nodes swap to plaques at close zoom); and
> "lov-search-glow-matched-set-via-searchcorpus" (the matched set that glows). **Two things the rung
> does NOT cover are recorded rather than glossed.** First, "a search match pulses INDEPENDENT OF
> ZOOM" is not asserted: `data-glow` is applied per node regardless of band in the source, but every
> glow assertion runs at the component's default zoom, so the independence itself is untested.
> Second, the Look clause fused a taste claim with an UNBUDGETED PERFORMANCE claim ("stays smooth as
> the corpus grows toward ~2000 nodes"); both are disposed of under "The Library's LOOK" below.
> **⚠ And the leg is not walkable at all.** `LibraryOverview` is imported by no non-test source file —
> ADR-0188 dec 4 removed its mount from the inc-9 glue and nothing has re-mounted it, exactly as the
> increment-9 note in "Capabilities" above already records. Its suite is green and its source stands,
> but the journey step "clear the finder to the empty state and see the constellation" cannot be
> walked in the running studio.
>
> **Leg 4 (open the selected artifact) is RE-AUTHORED, not deleted, and stays UNBOUND.** Its
> behavioural half IS proven one rung down — [`library-dive-body`](library-dive-body.md)'s
> "ldb-asset-selection-renders-assetview-body-and-sources" and
> "ldb-doc-selection-fetches-and-renders-markdown", and
> [`library-open-overlay`](library-open-overlay.md)'s
> "loo-open-overlay-mounts-full-detail-over-map" and "loo-dismiss-fires-ondismiss". What KEEPS the leg
> is the parent-glue COMPOSITION, which no component suite reaches: `TreeView`'s
> `onOpen={setOpenSelection}` wiring from the DAG canvas, the overview and the selection card into
> `<LibraryOpenOverlay selection={openSelection} …/>`, mounted as a `.world-frame` sibling over the
> live map. Every capability suite renders its component directly with props, and three `TreeView`
> test files deliberately stub `./LibraryDrawer.js` down to `{ LibraryDrawer: () => null }` to keep
> the pan/camera suites light (`apps/studio/src/lib/drawerLens.ts` records why), so the composition is
> exercised nowhere. **Its ORIGINAL wording was substantially overtaken and is corrected in place**
> (ADR-0139): it read "the drawer collapses to a bar and the artifact's full body + Sources render
> over the rest of the map (ADR bodies fetched via `docContent()`); the route syncs to `#/asset/<id>`;
> Esc unwinds dive → peek → map." Of that, "the drawer collapses to a bar" and "Esc unwinds dive →
> peek → map" describe the closed↔peek↔dive state machine ADR-0187 dec 1 RETIRED; "the route syncs to
> `#/asset/<id>`" was never built in the Open-overlay model at all — `openSelection` is transient
> React state and the overlay writes no URL; and Esc now dismisses in ONE hop
> ("loo-dismiss-fires-ondismiss"). Three stale clauses, not three uncovered residuals.
>
> **No gate is minted for the survivor.** This story declares no reliability gate at all, and
> answering an unbound leg with a freshly minted check is the rubber stamp ADR-0097 §2 forbids and the
> reflex ADR-0294's end state point 4 names. Ordinals **1**, **3** and **5** are BURNED, joining **2**
> and **6** (burned 2026-08-08) — never reused, never backfilled, and no surviving ordinal collides
> with a `superseded` key for this story in `stories/uat-legacy-dispositions.json` (the burned set is
> now 1, 2, 3, 5, 6; leg 4 keeps the number it has always had). Verified on the LIVE store before
> deleting: all four legs read `proven=–`, so no signed verdict was destroyed. Each deleted leg's
> `(detail:)` artifact (`library-tech-tree-overlay#uat-1`, `#uat-3`, `#uat-5`) is RETIRED in the store
> in the same pass, so no orphan is left behind; leg 4 keeps `#uat-4`, as `PILOT_STORY_IDS` coverage
> requires — `packages/model-uat-pilot` asserts BOTH that this story still declares at least one
> criterion and that every criterion it declares carries a well-formed detail pointer, which is why
> the story is cut to one leg and not to zero.

**Goal —** One operator, in one session against the real running studio, pulls the Library down over
the forest map, walks from a search to an artifact's neighbourhood, opens that artifact's body over
the map, and dismisses it back to the map — the map staying live the whole time. *(This previously
also promised "glimpses the whole-corpus constellation, and closes the drawer — the map staying live
the whole time except during a deliberate dive". The constellation glimpse is removed because
`LibraryOverview` is mounted by no non-test source, and the dive exception is removed because
ADR-0187 dec 1 retired the dive state the exception was carved for. Corrected in place, ADR-0139.)*

### ADR-0294 disposition of the six original criteria

**Five of six deleted (two on 2026-08-08, three on 2026-08-21); the sixth re-authored.** Every leg
here was a genuine D1 journey step — the six are consecutive moves of one operator session (open →
find → read the DAG → open the artifact → overview → close) — and every leg is UNBOUND, since this
story declares no reliability gate at all.

*(What this paragraph read before, corrected in place per ADR-0139: "**Two of six deleted
(2026-08-08); four kept for a scoping reason, not a proof one.** … four of the six FUSE two claims
into one criterion: a machine `Success` clause and a `Look (operator-attested)` clause. Those Look
clauses are ADR-0294 D3 appearance verdicts, owned by the D3 increment (chip `task_99f7e0a9`), which
relocates them to the capability whose look it is. Cutting the machine half of a fused leg would
either destroy the appearance claim or force a re-authoring that D3 must then re-author again, so
those four are left whole and untouched." **That reservation is RETIRED.** ADR-0348 D6 settled the
question the other way on 2026-08-11 — an experience property is not an acceptance criterion, so the
disposition became DELETE rather than relocate — and chip `task_99f7e0a9` has nothing left to move
here. `app-guide` and `app-surface` recorded the same discharge on their own tables; this one was
never updated until now, so it went on citing a chip that owned nothing.)*

**The surviving number is deliberately NOT closed up.** `1`, `2`, `3`, `5` and `6` are burned; the
detail artifacts of every deleted leg are retired in the live store. Leg 4 keeps its `(detail:)`
pointer, as `PILOT_STORY_IDS` coverage requires.

| original leg | criterion id | disposition |
|---|---|---|
| 1. **Open the Library drawer on the map** | `uatc_dc5913099db55821e44fe257` | ~~**Keep — fused D3 clause.** Its machine half is largely covered by `library-top-drawer` …but it carries a Look clause that is D3's to relocate.~~ **DELETED 2026-08-21 by the ADR-0294 D2/D4 pass above; the D3 reservation is RETIRED and chip `task_99f7e0a9`'s claim on this leg is discharged (ADR-0348 D6).** Every observable maps one-to-one onto [`library-top-drawer`](library-top-drawer.md) (`ltd-collapsed-handle-by-default`, `ltd-flag-renders-expanded`, `ltd-handle-toggle-fires-in-both-states`, `ltd-lens-state-is-url-derived`, `ltd-no-scrim-either-state`, `ltd-flag-reader-survives`) — including the parenthesised "no dimming scrim, in either state" verbatim. Its framing was separately overtaken by ADR-0267 D1 / ADR-0314 D6: the handle is the drawer's and opens onto ARCS by default, the Library being the demoted half of an `Arcs \| Library` toggle. |
| 2. **Find an artifact in the drawer** | `uatc_a89c30e97ac72fc3c454d2fe` | **Delete as duplicate (2026-08-08).** No Look clause — a pure machine leg. [`library-finder`](library-finder.md), `apps/studio/src/components/LibraryFinder.test.tsx`: **“lf-search-ranks-asset-matches-across-fields: an id/title hit outranks a description/body-only hit, all four asset fields are match surfaces”** asserts the client-side narrowing over id/title/description/body, and **“lf-adrs-matched-on-title-and-id-only”** asserts the ADR-title half. The kind sub-line via `kindLabel` is pinned by the sibling `LibraryDagCanvas` test **“ldag-node-plaque-kind-via-kindLabel: … an arc node reads ‘epic’, never the raw key”**, the same `kindLabel` seam this leg names. |
| 3. **Read the selected neighbourhood DAG** | `uatc_586b8bb4e1f926b416497e3f` | ~~**Keep — fused D3 clause.** Its machine half maps one-to-one onto `library-dag-canvas` …but the two-line plaque and colour-encoding Look clause is D3's.~~ **DELETED 2026-08-21 — but as a PROSE DEFECT as much as a duplicate.** The journey step is proven by [`library-dag-canvas`](library-dag-canvas.md) (`ldag-adjacency-one-level-each-way`, `ldag-layered-ranks-upstream-left-downstream-right`, `ldag-edges-drawn-between-nodes`, `ldag-per-branch-fan-cap-collapses-overflow`, `ldag-per-node-expander-expands-in-place`, `ldag-viewbox-contains-all-nodes`, `ldag-neighbour-click-refocuses`, `ldag-no-back-no-breadcrumb-no-panzoom`), but the leg's stated MECHANISM was overtaken: it says the DAG fans `references[]`, while the shipped walk is `standsOn` and `ldag-citations-are-demoted-out-of-the-dag` asserts a `references[]` citation contributes no node and no edge. The rung proves the corrected behaviour, not the one the leg describes. |
| 4. **Dive into the selected artifact** → **Open the selected artifact over the map** | `uatc_2539bfd0b1c1c04c2adf77c7` | ~~**Keep — fused D3 clause.** Machine half in `library-dive-body`; the "reads over the world without losing the peek bar" clause is D3's.~~ **RE-AUTHORED 2026-08-21, and KEPT as this story's only criterion.** The Look clause is deleted under ADR-0348 D6 (intent carried below). Its behavioural half is proven by [`library-dive-body`](library-dive-body.md) (`ldb-asset-selection-renders-assetview-body-and-sources`, `ldb-doc-selection-fetches-and-renders-markdown`) and [`library-open-overlay`](library-open-overlay.md) (`loo-open-overlay-mounts-full-detail-over-map`, `loo-dismiss-fires-ondismiss`); what keeps it is the parent-glue COMPOSITION no component suite reaches. Three clauses of its original wording were stale rather than uncovered — see the pass block above. |
| 5. **See the whole-corpus overview** | `uatc_1dfa5ebe29eb8a99f847ac01` | ~~**Keep — fused D3 clause.** Machine half in `library-overview`; the "reads as a tech-tree overview and stays smooth toward ~2000 nodes" clause is D3's.~~ **DELETED 2026-08-21.** Its behavioural clauses are proven by [`library-overview`](library-overview.md) (`lov-far-band-one-element-per-node`, `lov-size-tier-buckets-by-importance`, `lov-importance-degree-over-references`, `lov-lod-band-by-zoom`, `lov-close-band-arc-plaque-reads-epic`, `lov-search-glow-matched-set-via-searchcorpus`). Two gaps are recorded rather than glossed: "pulses INDEPENDENT OF ZOOM" is asserted at no band but the component's default, and the surface is mounted by no non-test source (ADR-0188 dec 4 removed the mount), so the step is not walkable. The taste half and the unbudgeted ~2000-node performance claim are disposed of below. |
| 6. **Close the Library drawer** | `uatc_f8209997c50c90df84024161` | **Delete as duplicate (2026-08-08).** No Look clause — a pure machine leg, and the close half of the same capability leg 1 opens. [`library-top-drawer`](library-top-drawer.md), `apps/studio/src/components/LibraryTopDrawer.test.tsx`: **“ltd-handle-toggle-fires-in-both-states: the arrow toggle fires onToggle once from collapsed and once from expanded; no word button; no history mutation”** asserts the close firing `onToggle`; **“ltd-lens-state-is-url-derived: a changed `search` flips collapsed → expanded → collapsed → expanded”** asserts the flag-clearing round trip; **“ltd-flag-reader-survives: `?overlay=library` reads true; `""` … read false”** asserts that a reload with the flag cleared stays collapsed. |

### The Library's LOOK — design intent, deliberately NOT a UAT leg (ADR-0348 D6)

The appearance intent that stood fused into legs 1, 3, 4 and 5 until 2026-08-21 is recorded here so it
is not lost with those legs. Under ADR-0348 D6 none of it is an acceptance criterion: it is a user
EXPERIENCE property, gathered as continuous owner feedback through use rather than signed off as a
discrete obligation the story must clear to be green. **An agent never renders any of these verdicts.**

- **The drawer reads as part of the world** (from leg 1) — expanded it spans the full width of the
  forest frame and takes about the top third, wearing the map's forest-cozy palette, legible against
  the map beneath it rather than floating over it as a separate application.
- **The DAG canvas encodes state in colour and nothing else** (from leg 3) — two-line kind-in-node
  plaques (title over kind), with colour reserved for STATE: the traversed chain lights purple,
  ephemeral plan nodes read dashed. The machine-observable half of that intent is already asserted —
  `ldag-node-plaque-kind-via-kindLabel` pins the kind line and
  `ldag-selected-chain-and-ephemeral-markers` pins the `data-chain` / `data-ephemeral` markers the CSS
  hangs off — so what is left here is only whether the resulting palette READS right.
- **The opened artifact reads over the world** (from leg 4) — the full-detail overlay should read as a
  document opened on top of the living map, not as a route away from it, and the lens beneath should
  not feel lost while it is open.
- **The constellation reads as a tech-tree overview** (from leg 5) — the dot field, its size tiers,
  its band transitions, and the search glow's pulse should read as one legible overview of the whole
  corpus rather than as scattered noise.

**The ~2000-node performance claim is NOT taste, and it is recorded here as UNDISCHARGED rather than
deleted quietly.** Leg 5's Look clause fused the reading above with a second, machine-shaped claim:
*"stays smooth as the corpus grows toward ~2000 nodes (the LOD ladder holds)."* It was NOT kept as a
machine leg, and the reason is a discriminator worth stating, because the corpus holds a leg that
looks like its twin. [`app-surface`](../app-surface/story.md) leg 10 ("the hosted witness is viewable
within its recorded browser budget") IS kept as a machine leg, deliberately unbound, because no
lower-tier node opens a deployed build in a real browser and measures it — but that leg names a
RECORDED BUDGET and a DEPLOYED artifact to measure it against. This claim has neither: "smooth" names
no threshold and "~2000 nodes" names a corpus size rather than a frame time, so no instrument could
ever discharge it as written; and `LibraryOverview` is mounted by no non-test source, so there is no
running surface to measure at all. Keeping it as a machine leg would have manufactured an obligation
that could not be met by any amount of effort, which is the hollow proof ADR-0294 exists to remove.

What IS proven of it, one rung down, is its stated MECHANISM: `lov-far-band-one-element-per-node`
asserts that at the far band the whole corpus stays exactly one element per node with no ambient
labels, and `lov-lod-band-by-zoom` asserts the ladder is monotonic and never reverses. So "the LOD
ladder holds" is green; "stays smooth at ~2000 nodes" has never been measured, by anybody, and its
absence must not later be read as approval (ADR-0348 Consequences). **No gate is minted for it**
(ADR-0097 §2 — a check is minted only where a real persisted artifact exists to witness). Two things
would have to exist before it could honestly become a leg again: the overview re-mounted into a
running surface, and a recorded budget with a number in it. Until then this paragraph is the record
that the claim was made and never discharged.

4. **Open the selected artifact over the map.** _(witness: machine)(detail: library-tech-tree-overlay#uat-4)_ From a selection made in the lens — the finder, the DAG canvas, the overview or the selection card — open the artifact. **Success (machine) —** a _(criterion-id: uatc_2539bfd0b1c1c04c2adf77c7)_ _(revision-id: uatr1:1286e1be718ce91a)_ _(previous-revision-id: uatr1:d44edbb8ee4ca285)_
   distinct full-detail overlay mounts OVER the live forest map as a `.world-frame` sibling, rendering
   the artifact's full body + Sources (an ADR body fetched on demand via `docContent()`), with the map
   and the lens both still mounted beneath it; dismissing it — the close control or Esc — returns to
   the lens and the live map in ONE hop, clearing the open selection.
   **UNBOUND — fails closed (ADR-0294 D4, 2026-08-21).** No `(proof-gate:)`: this story declares no
   reliability gate at all, and none is minted here — answering an unbound leg with a freshly minted
   check is the rubber stamp ADR-0097 §2 forbids. The leg's two HALVES are proven one rung down —
   [`library-dive-body`](library-dive-body.md)'s `ldb-asset-selection-renders-assetview-body-and-sources`
   and `ldb-doc-selection-fetches-and-renders-markdown` for the body/Sources render and the on-demand
   ADR fetch, and [`library-open-overlay`](library-open-overlay.md)'s
   `loo-open-overlay-mounts-full-detail-over-map` and `loo-dismiss-fires-ondismiss` for the distinct
   overlay container and the one-hop dismiss. What the leg ADDS, and what nothing reaches, is the
   COMPOSITION: that `TreeView`'s `onOpen={setOpenSelection}` wiring actually carries a selection from
   each of those four surfaces into `<LibraryOpenOverlay selection={openSelection} …/>`, and that the
   overlay lands over a map and lens that stay mounted. Every capability suite renders its component
   directly with props, and three `TreeView` test files stub `./LibraryDrawer.js` down to
   `{ LibraryDrawer: () => null }` to keep the pan/camera suites light, so the composed path is
   exercised nowhere. The instrument that WOULD bind it is a mounted-composition test over `TreeView`
   (or the desktop `_electron` harness) driving select → Open → dismiss against the real mount; none
   exists, so the leg stays deliberately unbound and fails closed, and it still blocks the crown.
   *(Machine, not human: every condition above is a DOM/mount observable, not a judgment. Whether the
   result LOOKS right is no longer a leg at all — ADR-0348 D6 deleted that experience clause; the
   intent lives under "The Library's LOOK" above.)*

## Proof

The story carries the UAT (above) at the story tier (ADR-0010 §2). It is proven when that UAT passes
against the real running studio AND its capabilities' `real:` proofs (geometry/behaviour) are signed
green underneath it. **Honest status — `proposed`.**
Nothing here is proven through the ceremony; `healthy` is derived from signed verdicts, never authored.
See [`../README.md`](../README.md) for the representation and field mapping.

*(This section previously read "…are signed green underneath it, **with the LOOK legs
operator-attested (ADR-0070)**." There are no LOOK legs to attest: ADR-0348 D6 ruled a user
EXPERIENCE property is not a user ACCEPTANCE criterion, and the ADR-0294 D2/D4 pass of 2026-08-21
deleted the four fused Look clauses this story carried, recording their design intent under "The
Library's LOOK" instead. ADR-0070's two-stage posture still governs where an appearance verdict lives
WHEN one is worth carrying — it is the "this story owes an operator-attested UAT signature" reading
that is withdrawn. Corrected in place, ADR-0139.)*
