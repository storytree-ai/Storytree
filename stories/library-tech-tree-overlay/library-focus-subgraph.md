---
id: "library-focus-subgraph"
tier: capability
story: library-tech-tree-overlay
title: "A dagre rankdir-LR focus subgraph over the corpus references, centred on the finder's selection"
outcome: "The finder's lifted selection centres a @dagrejs/dagre rankdir-LR neighbourhood built from the corpus references[] BOTH ways (upstream stands-on left, downstream stood-on-by right), rendered as two-line kind-in-node plaques (kind via kindLabel), colour reserved for STATE (the selected transitive chain marked on-chain, ephemeral plan kinds marked dashed), depth-1 by default with a depth stepper and +N more cluster chips, and neighbour-click graph-walking with a breadcrumb back — over the already-loaded corpus with no fetch beyond the wire; its geometry and behaviour machine-witnessed, its appearance operator-attested."
status: proposed
proof_mode: integration-test
depends_on: [library-finder]
decisions: [185, 70, 169, 122, 23]
# Node-borne proof config (ADR-0057 keystone). NET-NEW (no editsExisting): the leaf authors a vitest
# jsdom component test importing a NOT-YET-EXISTING component (LibraryFocusGraph.tsx) and a NOT-YET-EXISTING
# pure adjacency+layout module (focusGraph.ts) — both under apps/studio/src (red = module-not-found at HEAD),
# then writes them (green). The clean red→green heart is the PURE `buildFocusGraph({ centre, assets, docs,
# depth })` adjacency+dagre-layout function; the component is the SVG plaque render + state marking + depth
# stepper + cluster chips + breadcrumb around it.
# FRONTEND-BUILDER TWO-STAGE (ADR-0070): this `real:` arm proves the GEOMETRY/BEHAVIOUR ONLY — adjacency is
# built from GuidanceAsset.references BOTH ways (upstream = the centre's own refs; downstream = the reverse
# index over assets whose refs point at the centre), the asset:/doc: prefix stripped to resolve a target id
# (trap m — only GuidanceAsset carries references; DocMeta does NOT, so an ADR-centred subgraph has an EMPTY
# upstream fan on the wire); dagre rankdir-LR centres the selected node with upstream ranked left / downstream
# right; each node renders a two-line plaque whose kind line routes through kindLabel (an `arc` node reads
# "epic", NEVER the raw key — trap j); the selected node + its transitive chain carry the on-chain STATE
# marker and ephemeral `plan` nodes carry the dashed marker (assert the MARKER, not the colour/stroke —
# colour is the look); depth-1 by default with a depth stepper and a `+N more` cluster chip when a hub
# overflows the fan cap (the depth limiter ships WITH this increment — trap f); a neighbour click invokes
# onFocus and pushes a breadcrumb with a back control; and the subgraph reads only the loaded corpus (no
# docContent/fetch — trap g). The subgraph's APPEARANCE (does the two-pane peek read as one forest-cozy lens
# — finder left, subgraph right; the plaque legibility; the PURPLE selected-chain trail-reveal colour; the
# dashed ephemeral stroke; the fan laid out left→right) and its real MOUNTING into TreeView's two-pane
# peek-slot composition are the story's operator-attested UAT leg 3 (the look is witnessed, never a machine
# visual verdict; do NOT add a visual/colour/stroke assertion here, and do NOT edit TreeView.tsx or
# LibraryDrawer.tsx in this `real:` scope — the subgraph is proven in isolation and takes assets/docs/
# selection/onFocus as PROPS, the two-pane mount is the orchestrator's supplement glue after PASS, exactly
# as the finder's mount was — trap k).
#
# CRITICAL — apps/studio is VITEST + jsdom (@testing-library/react), NOT node:test (apps/studio/vitest.config.ts,
# include src/**/*.test.{ts,tsx}). The default `node --test` real proof cannot run a `.test.tsx`. So this
# cap declares a `real.proofCommand` running the ONE test file under vitest (cwd = apps/studio).
# install: true (fresh-worktree tsx + tsc + vitest, ADR-0031 §2) + a typecheck wall. SCOPE = apps/studio/src.
# COVERAGE (ADR-0122): `storytree coverage` scans ONLY real.testFile, so EVERY `lfg-`-named contract test —
# including the pure buildFocusGraph ones — lives in LibraryFocusGraph.test.tsx, which imports buildFocusGraph
# from ../lib/focusGraph.
proof:
  command:
    file: pnpm
    args: ["--filter", "studio", "test"]
  scope:
    testGlobs: ["apps/studio/src/**/*.test.tsx", "apps/studio/src/**/*.test.ts"]
    sourceGlobs: ["apps/studio/src/**/*.ts", "apps/studio/src/**/*.tsx"]
  real:
    testFile: "apps/studio/src/components/LibraryFocusGraph.test.tsx"
    sourceFile: "apps/studio/src/components/LibraryFocusGraph.tsx"
    scope:
      testGlobs: ["apps/studio/src/components/LibraryFocusGraph.test.tsx"]
      sourceGlobs:
        - "apps/studio/src/components/LibraryFocusGraph.tsx"
        - "apps/studio/src/lib/focusGraph.ts"
    install: true
    typecheck:
      file: pnpm
      args: ["--filter", "studio", "typecheck"]
    # The studio suite is vitest (jsdom), not node:test — run the ONE test file under vitest.
    proofCommand:
      file: pnpm
      args:
        - "--filter"
        - "studio"
        - "exec"
        - "vitest"
        - "run"
        - "src/components/LibraryFocusGraph.test.tsx"
---

# A dagre rankdir-LR focus subgraph over the corpus references, centred on the finder's selection

**Outcome —** The finder's lifted selection centres a `@dagrejs/dagre` rankdir-LR neighbourhood built from
the corpus's `references[]` BOTH ways (upstream "stands on" fanned left, downstream "stood on by" fanned
right), rendered as two-line kind-in-node plaques (kind text via `kindLabel`), colour reserved for STATE
(the selected node + its transitive chain marked on-chain, ephemeral `plan` kinds marked dashed), depth-1 by
default with a depth stepper and `+N more` cluster chips, and neighbour-click graph-walking with a
breadcrumb back — over the already-loaded corpus with no fetch beyond the wire; its geometry and behaviour
machine-witnessed, its appearance operator-attested.

**Depends on —** [`library-finder`](library-finder.md). The subgraph CONSUMES the finder's lifted
selection: the finder lifts a full `SearchResult` via `onSelect` (recon fact — not just an id), which
`TreeView.tsx` holds as `librarySelection` (`useState<SearchResult | null>`, ~line 1273). That selection is
the subgraph's CENTRE. The subgraph mounts as the RIGHT pane of a two-pane peek — finder left, subgraph
right — composed at the TreeView level into the shell's EXISTING single `peekSlot` node (a
`<div className="library-peek-panes">…</div>`), so `LibraryDrawer.tsx` is NOT touched (its `lds-*`/`ldw-*`
tests stay byte-green — trap k). That two-pane mount is the orchestrator's supplement glue AFTER this
leaf's PASS (mirroring how increments 1 & 2's real mounting was outside their `real:` scope) — so this
capability edits NEITHER `TreeView.tsx` NOR `LibraryDrawer.tsx`; it proves the subgraph in isolation,
driven by props. It holds no backend seam — it reads the corpus that is ALREADY on the wire via
`useAppData()` (the `studio` story's library backend), taken as `assets`/`docs` props so the component is
deterministically drivable in jsdom.

> **Proof status (honest) — `proposed`, NET-NEW two-stage.** Neither
> `apps/studio/src/lib/focusGraph.ts` nor `apps/studio/src/components/LibraryFocusGraph.tsx` exists at HEAD
> (verified 2026-07-11 — `ls` returns absent for both, and for the test file). This capability authors them
> test-first: a new vitest jsdom test drives the pure `buildFocusGraph` adjacency+layout and the subgraph's
> render / state-marking / depth / neighbour-walk behaviour, RED at HEAD (module-not-found), GREEN once both
> modules are written. Its GEOMETRY/BEHAVIOUR is machine-witnessed; its APPEARANCE inside the real drawer
> (the two-pane forest-cozy lens, the plaque legibility, the PURPLE selected-chain trail-reveal, the dashed
> ephemeral stroke, the fan laid out left→right) and its real mounting into the two-pane peek slot are the
> story's operator-attested UAT leg 3 (ADR-0070). Status stays `proposed` — `healthy` is only ever DERIVED
> from signed verdicts (ADR-0020), never authored.

## Guidance

WHY THIS IS A CAPABILITY, NOT A CONTRACT: its honest proof is the FOCUS SUBGRAPH AS A WHOLE — a pure
adjacency+layout function over the loaded corpus PLUS a behavioural React/SVG component that renders the
laid-out neighbourhood as two-line kind-in-node plaques, marks the selected transitive chain and ephemeral
kinds with STATE data-attributes, ships the depth limiter (stepper + `+N more` clusters), and graph-walks on
a neighbour click with a breadcrumb back — spanning the adjacency heart, the dagre layout, the plaque
render, the state marking, the depth/cluster UI, and the neighbour-walk, exercised in jsdom. It is the
navigation surface that turns the finder's single selection into a walkable neighbourhood; the dive body,
the overview, and the wire extension are those increments' jobs, gated on this graph-walk.

ADJACENCY IS BOTH WAYS OVER `references[]` — AND ONLY ASSETS CARRY THEM (trap m). Adjacency is built in the
PURE module from `GuidanceAsset.references: string[]` (`types.ts` ~148), which holds PREFIXED pointers —
`"asset:<id>"` or `"doc:<relpath>"`. The builder must STRIP the `asset:`/`doc:` prefix to resolve a ref to a
target id. **Upstream ("stands on")** of a node = that node's OWN `references`. **Downstream ("stood on
by")** of a node = the reverse index — every asset whose `references` points AT this node's id. CONSEQUENCE:
`DocMeta` (`types.ts` ~188) carries `id`/`title`/`group`/`excerpt`/`status?`/`decided?` and **NO
`references` field** — an ADR's outgoing edges live in its body, fetched on demand (increment 4). So an
**ADR-centred** subgraph has an EMPTY upstream fan on the wire (its out-edges are not loaded), though it
still appears as a referenced NEIGHBOUR when an asset points at it. Build the reverse index over
`GuidanceAsset.references` ONLY. This is consistent with ADR-0185 dec 3 ("ADRs … bodies fetched on demand").
Pin it in `lfg-adjacency-both-directions-from-references`.

THE PURE HEART — `buildFocusGraph({ centre, assets, docs, depth })` (the clean red→green core, unit-testable
without jsdom). A pure function in a NEW module `apps/studio/src/lib/focusGraph.ts`, taking the centre
(`SearchResult`), the loaded `assets: GuidanceAsset[]` and `docs: DocMeta[]` (both already in `useAppData()`),
and the depth, returning `{ nodes, edges }` where each node carries something like
`{ id, title, category, source: 'asset' | 'doc', side: 'centre' | 'upstream' | 'downstream', onChain: boolean,
ephemeral: boolean }` plus its dagre-computed position/rank. The layout runs `@dagrejs/dagre` (already
imported in `TreeView.tsx` ~line 39 for the StoryPanel sub-DAG — REUSE the library, but build the layout
FRESH in this pure module; do NOT thread it through TreeView's 4340-line body) with `rankdir: 'LR'`, the
centre ranked mid, upstream ranked LEFT of it and downstream RIGHT. Depth-limited (default 1) with a fan cap
that collapses overflow neighbours into a `+N more` cluster placeholder node. Deterministic node/edge order
so the geometry tests can pin ranks/x-ordering (assert on the computed ordering, not pixel-exact
coordinates — `lfg-dagre-lr-centres-selected`). NO fetch, no `docContent`, no socket, no DB (reads only the
loaded `assets`/`docs`). This function is the leaf's red→green heart; several `lfg-` contracts assert it
directly (they live in the ONE test file but import it from `../lib/focusGraph`).

KIND IS TEXT, COLOUR IS STATE — the two-line plaque (ADR-0185 dec 3). Each node renders a two-line plaque:
the `title`, and below it a muted **kind line** whose text is `kindLabel(category, arcDisplay)`
(`apps/studio/src/lib/kindDisplay.ts` — the ONE place a kind KEY maps to its display text, ADR-0183 D1),
read via the `useArcDisplay()` hook (as `Library.tsx:36,38` does). This is load-bearing: an `arc` node MUST
render `kindLabel('arc', 'epic')` = the lowercase string **`"epic"`**, NEVER the raw key `"arc"` — a
hand-rolled `category → label` map here would make the subgraph read "arc" while every other studio surface
reads "Epic". Pin it in `lfg-node-plaque-kind-via-kindLabel` (arc → "epic", never "arc"). Colour is NOT for
kind — it is reserved for STATE: the selected node + its transitive reference chain carry an on-chain STATE
marker (a `data-chain` attribute — the purple trail-reveal idiom, ADR-0169), and ephemeral `plan`-kind nodes
carry a dashed marker (a `data-ephemeral` attribute). Assert the MARKERS
(`lfg-selected-chain-marked-onchain`, `lfg-ephemeral-plan-node-marked-dashed`), NEVER the colour value or
the stroke style — the purple and the dashed rendering are the operator-attested look (ADR-0070). One
channel per meaning.

THE DEPTH LIMITER SHIPS WITH THIS INCREMENT (trap f — the hub-hairball guard). The first click on a hub is a
hairball WITHOUT a depth limiter, so it ships HERE, not deferred: depth-1 by DEFAULT, a depth stepper that
widens/narrows the fan, and a `+N more` cluster CHIP that collapses a hub's overflow neighbours past the fan
cap into a single expandable placeholder node. Pin it in `lfg-depth-1-default-with-stepper-and-cluster`. Do
NOT ship the subgraph without the limiter (it would be unusable on the first real hub).

SELECTION IS LIFTED / GRAPH-WALK RE-FOCUSES (the seam to the finder and back). The subgraph's CENTRE is the
`selection: SearchResult | null` prop (the finder's lifted result, held in `TreeView`). Clicking a NEIGHBOUR
node invokes an `onFocus(result)` callback the subgraph is handed as a prop — re-centring the graph on that
neighbour (graph-walking, the Factorio focus-on-selection idiom) — while pushing a BREADCRUMB (a small
internal breadcrumb stack with a "back" control that returns to the prior centre). The subgraph OWNS its
breadcrumb/depth UI state but LIFTS the selection change through `onFocus` (so the same `librarySelection`
in TreeView drives both panes). Pin it in `lfg-neighbour-click-refocuses-with-breadcrumb`. Take `selection`
as a prop so the centre is deterministically drivable in jsdom — mirroring how the shell took `search` and
the finder took `assets`/`docs`/`selectedId` as props.

NO FETCH BEYOND THE LOADED CORPUS (trap g). The subgraph uses only ids/titles/`references` already on the
loaded `assets`/`docs`. It must NEVER call `docContent()` or fetch anything beyond what `useAppData()`
already holds — an ADR body is increment 4's on-demand dive, not the subgraph's adjacency. Pin the
no-fetch invariant in `lfg-no-fetch-beyond-loaded`.

APPEARANCE IS OPERATOR-ATTESTED, NOT ASSERTED (ADR-0185 dec 5/6 + ADR-0070). The subgraph follows the map's
forest-cozy palette (the world's CSS variables, as the shell and finder do), NOT neutral-admin white and
NEVER the black-terminal look. The two-pane peek layout (`.library-peek-panes` — finder left, subgraph
right), the plaque legibility, the PURPLE selected-chain trail-reveal colour, the DASHED ephemeral stroke,
and the fan laid out left→right are WITNESSED by the owner (UAT leg 3), never a machine visual verdict — do
NOT author a visual/colour/stroke/layout assertion in this cap's tests (assert the plaque TEXT, the state
MARKERS, the ranks/ordering, and the neighbour-walk behaviour, never their styling). Surface the STILL-
UNSIGNED drawer-shell + finder look legs (slide/palette/z-layering, the muted finder styling) at the SAME
attestation (trap l), rather than letting them sit unsigned.

OFFLINE-TESTABLE IN JSDOM (the `LibraryDrawer.test.tsx` / `LibraryFinder.test.tsx` discipline).
`@vitest-environment jsdom`, `@testing-library/react` for render / `fireEvent` (click a neighbour, step
depth, expand a cluster, breadcrumb back). No backend seam to mock (the subgraph holds no `api` call — it
takes `assets`/`docs`/`selection`/`onFocus` as props); the pure `buildFocusGraph` tests need no jsdom at all
but still live in the one test file (ADR-0122 coverage). No real `fetch`, no `docContent`, no socket, no DB,
no Electron. The component imports no agent/drive/model (the `modelPathBoundary.test.ts` wall stays green).

## Integration test

**Goal —** Prove the focus subgraph: `buildFocusGraph({ centre, assets, docs, depth })` builds adjacency
BOTH ways over `GuidanceAsset.references` (upstream = the centre's own refs; downstream = the reverse index),
stripping the `asset:`/`doc:` prefix, with an ADR centre having an empty upstream fan; runs dagre rankdir-LR
with the selected node centred, upstream left / downstream right; and the `<LibraryFocusGraph>` component
renders each node as a two-line plaque whose kind line is `kindLabel(category, arcDisplay)` (an `arc` reads
"epic"), marks the selected transitive chain on-chain and ephemeral `plan` nodes dashed, ships depth-1 by
default with a stepper and a `+N more` cluster chip, re-focuses via `onFocus` with a breadcrumb back on a
neighbour click, and never fetches beyond the loaded corpus — entirely in jsdom, no backend, driven by props.

The integration test exercises this capability against its own composition (no backend seam) — the pure
`buildFocusGraph` adjacency+layout, the plaque render, the `kindLabel` routing, the state marking, the depth/
cluster UI, and the neighbour-walk are all real. It would:

1. Call `buildFocusGraph({ centre, assets, docs, depth: 1 })` directly with a small fixed corpus (a few
   `GuidanceAsset`s wired via `references` — including a hub and an `arc` — and a couple of `DocMeta` ADRs).
   Assert the centre's OWN `references` become upstream nodes and the assets whose `references` point AT the
   centre become downstream nodes, with the `asset:`/`doc:` prefix stripped to resolve targets; assert an
   ADR-centred call yields an EMPTY upstream fan (DocMeta carries no `references`).
2. Assert the dagre layout ranks the selected node centre with upstream nodes ordered LEFT and downstream
   nodes ordered RIGHT (assert on the computed x-ordering / ranks, not pixel-exact coordinates).
3. Render `<LibraryFocusGraph assets={…} docs={…} selection={…} onFocus={spy} />` in jsdom over a corpus
   including an `arc` node. Assert each node renders a two-line plaque — the `title` and a kind line whose
   text is `kindLabel(category, arcDisplay)`; the `arc` node's kind line reads "epic" (the default
   preference), and the raw key `"arc"` does NOT appear as the kind text (trap j pinned).
4. Assert the selected node + its transitive reference chain carry the `data-chain` STATE marker (off-chain
   nodes do not), and a `plan`-kind node carries the `data-ephemeral` marker (a durable-kind node does not)
   — asserting the MARKERS, not the colour/stroke.
5. Assert the default depth is 1; drive the depth stepper and assert the fan widens/narrows; assert a hub
   past the fan cap collapses its overflow into a `+N more` cluster chip.
6. Click a neighbour node. Assert `onFocus` is invoked with that neighbour's result (the re-centre / graph
   walk) and a breadcrumb is pushed; assert the breadcrumb "back" control returns to the prior centre.
7. Assert no `docContent`/`fetch`/socket is called across the whole exercise (the subgraph reads only the
   loaded corpus — ADR bodies are increment 4's dive).

## Contracts (8)

The test-proven leaf behaviours — each **one isolated automated test** in the `studio` suite (vitest jsdom,
`apps/studio/src/components/LibraryFocusGraph.test.tsx`; the pure-adjacency/layout contracts import
`buildFocusGraph` from `../lib/focusGraph`). Per ADR-0122 (`storytree coverage`) each contract id is the
lead of a distinctly-named test, so the coverage check reports 8/8 against the ONE `real.testFile`. None of
these is an APPEARANCE assertion — the look (the two-pane forest-cozy layout, the purple selected-chain
colour, the dashed ephemeral stroke, the plaque styling, the fan render) is the story's operator-attested
UAT leg 3 (ADR-0070).

1. **`lfg-adjacency-both-directions-from-references`** — `buildFocusGraph` builds upstream AND downstream from `references`, prefix-stripped; an ADR centre has empty upstream
   - **asserts —** `buildFocusGraph({ centre, assets, docs, depth })` yields UPSTREAM nodes from the centre's
     own `GuidanceAsset.references` ("stands on") AND DOWNSTREAM nodes from the reverse index — every asset
     whose `references` points AT the centre ("stood on by") — over `assets`+`docs`, with the `asset:`/`doc:`
     prefix stripped to resolve each ref to a target id; and an ADR-CENTRED call yields an EMPTY upstream fan
     because `DocMeta` carries no `references` on the wire (trap m). The reverse index is built over
     `GuidanceAsset.references` only.
   - **covers —** `apps/studio/src/lib/focusGraph.ts` (the both-ways adjacency builder + the prefix strip + the reverse index)
   - **proven by —** `apps/studio/src/components/LibraryFocusGraph.test.tsx` (net-new, vitest; imports `buildFocusGraph`).
2. **`lfg-dagre-lr-centres-selected`** — the layout runs dagre rankdir-LR with the selected node centred, upstream left / downstream right
   - **asserts —** `buildFocusGraph` runs `@dagrejs/dagre` with `rankdir: 'LR'`, the selected node ranked
     CENTRE, upstream nodes positioned LEFT of it and downstream nodes RIGHT — asserted on the computed
     x-ordering / ranks the function returns, NOT pixel-exact coordinates (the exact geometry is the look).
   - **covers —** `apps/studio/src/lib/focusGraph.ts` (the dagre rankdir-LR layout with the centre ranked mid)
   - **proven by —** `apps/studio/src/components/LibraryFocusGraph.test.tsx`.
3. **`lfg-node-plaque-kind-via-kindLabel`** — each node renders a two-line plaque; the kind line routes through `kindLabel`; an `arc` reads "epic", never the raw key
   - **asserts —** rendering `<LibraryFocusGraph>` over a corpus that includes an `arc` node, each node
     renders a two-line plaque — its `title` and a muted kind line whose text is `kindLabel(category,
     arcDisplay)`; the `arc` node's kind line reads "epic" (the default preference, and `kindLabel('arc',
     'epic')` returns lowercase "epic"), and the raw key `"arc"` does NOT appear as the kind text. The kind
     line routes through `kindLabel` — NEVER a hand-rolled `category → label` map (trap j).
   - **covers —** `apps/studio/src/components/LibraryFocusGraph.tsx` (the two-line plaque — title + `kindLabel` kind line)
   - **proven by —** `apps/studio/src/components/LibraryFocusGraph.test.tsx`.
4. **`lfg-selected-chain-marked-onchain`** — the selected node + its transitive chain carry the on-chain state marker
   - **asserts —** the selected node AND its transitive reference chain carry the `data-chain` STATE marker
     (the purple trail-reveal, ADR-0169), while off-chain nodes do NOT. The assertion is on the MARKER, not
     the colour value — the purple rendering is the operator-attested look.
   - **covers —** `apps/studio/src/components/LibraryFocusGraph.tsx` (the on-chain state marking over the transitive chain)
   - **proven by —** `apps/studio/src/components/LibraryFocusGraph.test.tsx`.
5. **`lfg-ephemeral-plan-node-marked-dashed`** — an ephemeral `plan`-kind node carries the dashed marker
   - **asserts —** a `plan`-kind node carries the `data-ephemeral` marker (the dashed treatment), while a
     durable-kind node does NOT. The assertion is on the MARKER, not the stroke style — the dashed rendering
     is the operator-attested look.
   - **covers —** `apps/studio/src/components/LibraryFocusGraph.tsx` (the ephemeral-kind marking)
   - **proven by —** `apps/studio/src/components/LibraryFocusGraph.test.tsx`.
6. **`lfg-depth-1-default-with-stepper-and-cluster`** — depth-1 by default, a depth stepper, and a `+N more` cluster chip for hub overflow
   - **asserts —** the subgraph is depth-1 by DEFAULT; driving the depth stepper widens/narrows the fan; and
     a hub whose neighbours exceed the fan cap collapses the overflow into a single `+N more` cluster chip
     (the depth limiter ships WITH this increment — trap f). Without it the first hub click is a hairball.
   - **covers —** `apps/studio/src/lib/focusGraph.ts` (the depth limit + fan cap + cluster collapse) + `apps/studio/src/components/LibraryFocusGraph.tsx` (the depth stepper + `+N more` chip)
   - **proven by —** `apps/studio/src/components/LibraryFocusGraph.test.tsx`.
7. **`lfg-neighbour-click-refocuses-with-breadcrumb`** — clicking a neighbour invokes `onFocus` and pushes a breadcrumb with a back control
   - **asserts —** clicking a NEIGHBOUR node invokes the `onFocus` callback with that neighbour's result (the
     re-centre / graph walk) and pushes a breadcrumb; the breadcrumb "back" control returns to the prior
     centre. Selection change is lifted through `onFocus`; the breadcrumb/depth UI state lives in the subgraph.
   - **covers —** `apps/studio/src/components/LibraryFocusGraph.tsx` (the neighbour-click `onFocus` lift + the breadcrumb stack + back)
   - **proven by —** `apps/studio/src/components/LibraryFocusGraph.test.tsx`.
8. **`lfg-no-fetch-beyond-loaded`** — the subgraph reads only the loaded corpus; no `docContent`/fetch/socket
   - **asserts —** across building and rendering the subgraph, only ids/titles/`references` already on the
     loaded `assets`/`docs` are read — no `docContent`, no `fetch`, no socket is called (ADR bodies are
     increment 4's on-demand dive — trap g).
   - **covers —** `apps/studio/src/lib/focusGraph.ts` + `apps/studio/src/components/LibraryFocusGraph.tsx` (the no-fetch, loaded-corpus-only invariant)
   - **proven by —** `apps/studio/src/components/LibraryFocusGraph.test.tsx`.

## Guidance — the net-new slice that earns the signed verdict

The bootstrap rung toward `healthy` (ADR-0057 §3, NET-NEW): author the focus subgraph as a new pure
adjacency+layout module + a new SVG render component, test-first.

- **The new test —** `apps/studio/src/components/LibraryFocusGraph.test.tsx` (`@vitest-environment jsdom`,
  vitest + `@testing-library/react` — the studio package convention, the `LibraryFinder.test.tsx` /
  `LibraryDrawer.test.tsx` shape; NO real `fetch`/`docContent`/socket/DB/Electron). Import `{ buildFocusGraph }`
  from `"../lib/focusGraph"` and `{ LibraryFocusGraph }` from `"./LibraryFocusGraph"`. Name each test for its
  contract id (`lfg-…`) so `storytree coverage library-focus-subgraph` reports 8/8 (ADR-0122) — the pure
  adjacency/layout contracts live in THIS one file too, since coverage scans only `real.testFile`.
- **The RED the spine observes (before IMPLEMENT) —** the imports resolve NOTHING — neither
  `apps/studio/src/lib/focusGraph.ts` nor `apps/studio/src/components/LibraryFocusGraph.tsx` exists at HEAD, so
  the test fails module-not-found (the net-new missing-symbol red, ADR-0057).
- **The GREEN —** write the two modules. `apps/studio/src/lib/focusGraph.ts`: a pure
  `buildFocusGraph({ centre, assets, docs, depth })` — adjacency built BOTH ways over
  `GuidanceAsset.references` (upstream = the centre's own refs; downstream = the reverse index; strip the
  `asset:`/`doc:` prefix; ADR centre → empty upstream), dagre rankdir-LR layout (centre mid, upstream left /
  downstream right), depth-limited (default 1) with a fan cap collapsing overflow into a `+N more` cluster
  node, deterministic order, NO fetch. `apps/studio/src/components/LibraryFocusGraph.tsx`: an SVG render
  layer taking `assets`/`docs`/`selection`/`onFocus` as PROPS, calling `buildFocusGraph`, rendering each node
  as a two-line plaque (title + `kindLabel(category, arcDisplay)` kind line via `useArcDisplay()`), marking
  the selected transitive chain with `data-chain` and ephemeral `plan` nodes with `data-ephemeral`, rendering
  the depth stepper + `+N more` cluster chips, and on a neighbour click invoking `onFocus` + pushing a
  breadcrumb with a back control. MOUNTING it into TreeView's two-pane `peekSlot` composition
  (`<div className="library-peek-panes"><LibraryFinder …/><LibraryFocusGraph …/></div>`), the
  `.library-peek-panes` CSS, and the forest-cozy appearance are witnessed under the story's UAT leg 3
  (operator-attested, ADR-0070), NOT asserted in CI and NOT in this `real:` scope. After it, the imports
  resolve, the assertions hold, and `pnpm --filter studio test` + `pnpm --filter studio typecheck` stay green.

Rules:

- **Adjacency both ways, assets-only source** — upstream = the centre's own `references`; downstream = the
  reverse index over `GuidanceAsset.references` (assets pointing at the centre); strip the `asset:`/`doc:`
  prefix; an ADR centre has an empty upstream fan on the wire (`lfg-adjacency-both-directions-from-references`,
  trap m). `DocMeta` carries no `references`.
- **Dagre rankdir-LR, centre mid** — the selected node ranks centre, upstream left / downstream right; assert
  ranks/ordering, not pixel coordinates (`lfg-dagre-lr-centres-selected`). Build the layout FRESH in the pure
  module — do NOT thread it through TreeView.
- **Kind is text via `kindLabel`, never a hand-rolled map** — the plaque kind line is `kindLabel(category,
  arcDisplay)` so an `arc` reads "epic" like every other surface (`lfg-node-plaque-kind-via-kindLabel`, trap j).
- **Colour is STATE, asserted as a marker** — the selected transitive chain carries `data-chain`, ephemeral
  `plan` nodes carry `data-ephemeral`; assert the MARKERS, never the colour/stroke
  (`lfg-selected-chain-marked-onchain`, `lfg-ephemeral-plan-node-marked-dashed`). Purple/dashed are the look.
- **Ship the depth limiter WITH this increment** — depth-1 default + stepper + `+N more` cluster chips; the
  first hub click is a hairball without it (`lfg-depth-1-default-with-stepper-and-cluster`, trap f).
- **Neighbour-click re-focuses via `onFocus` with a breadcrumb** — graph-walk lifts the selection through
  `onFocus`; the breadcrumb "back" returns to the prior centre (`lfg-neighbour-click-refocuses-with-breadcrumb`).
- **No fetch beyond the loaded corpus** — no `docContent`/fetch/socket; ADR bodies are increment 4's dive
  (`lfg-no-fetch-beyond-loaded`, trap g).
- **Appearance is operator-attested, not asserted here** (ADR-0070) — prove the adjacency, the ranks/ordering,
  the plaque TEXT, the state MARKERS, the depth/cluster behaviour, and the neighbour-walk; the two-pane
  forest-cozy layout, the purple chain, the dashed ephemeral stroke, and the fan render are the story's UAT
  leg 3 (surface the still-unsigned shell/finder look legs at the same attestation — trap l). Do not author a
  visual verdict, and do NOT edit `TreeView.tsx` or `LibraryDrawer.tsx` in the `real:` scope (the two-pane
  mount is the orchestrator's supplement glue after PASS; the subgraph is proven in isolation, driven by props
  — trap k).
