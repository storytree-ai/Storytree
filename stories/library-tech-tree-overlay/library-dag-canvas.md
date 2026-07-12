---
id: "library-dag-canvas"
tier: capability
story: library-tech-tree-overlay
title: "The focus canvas is a true layered reference DAG: dagre rankdir-LR ranks over references[] BOTH ways to FULL transitive depth, DRAWN SVG edges between rank-adjacent nodes, per-branch ⊕ expanders taming breadth (the global depth stepper retired), ← Back leading the breadcrumb with no canvas header, and a machine-asserted fit-to-view viewBox containing every laid-out node — the brownfield rework of library-focus-subgraph (source files keep their names)"
outcome: "The finder's lifted selection centres a @dagrejs/dagre rankdir-LR layered DAG built from the corpus references[] BOTH ways (upstream stands-on left, downstream stood-on-by right) walked to FULL transitive depth (no depth cap), with DRAWN SVG edges between rank-adjacent nodes, per-branch breadth tamed by in-place ⊕ expanders (the global depth stepper and +N-more cluster chip retired), ← Back leading the breadcrumb at the canvas top-left with no canvas header text, and a bounded fit-to-view viewBox computed from the laid-out node bbox and machine-asserted to contain every node — over the already-loaded corpus with no fetch beyond the wire; its geometry and behaviour machine-witnessed, its seed-packet appearance operator-attested."
status: proposed
proof_mode: integration-test
depends_on: [library-finder]
decisions: [188, 187, 185, 70, 122, 23]
# Node-borne proof config (ADR-0057 keystone). BROWNFIELD (editsExisting: true) — this REWORKS the signed
# inc-3 focus subgraph (apps/studio/src/components/LibraryFocusGraph.tsx + apps/studio/src/lib/focusGraph.ts,
# green at HEAD with its lfg-* contracts) into a true layered reference DAG (ADR-0188 dec 5). The SOURCE FILES
# KEEP THEIR NAMES (LibraryFocusGraph.tsx / focusGraph.ts) — only the capability, the test file, and the
# contract prefix (ldag-) are new. real.testFile is a NET-NEW apps/studio/src/components/LibraryDagCanvas.test.tsx
# that drives the DAG behaviour in jsdom + unit-tests the pure heart; real.sourceFile picks ONE representative
# (LibraryFocusGraph.tsx); real.scope.sourceGlobs names BOTH reworked files (the multi-sourceGlob precedent from
# library-category-shelf.md / library-overview.md — ADR-0122 one-real.testFile discipline).
# The RED the spine observes is a FAILING-ASSERTION red (both sources exist — NOT module-not-found): at HEAD the
# component renders three CSS columns with NO drawn edges, a global depth stepper capped at 5, and no SVG
# viewBox, so the net-new ldag- tests (drawn edges, full depth, per-node expanders, fit-to-view viewBox, no
# stepper/header) fail; GREEN after the rework.
# FRONTEND-BUILDER TWO-STAGE (ADR-0070): this real: arm proves the GEOMETRY/BEHAVIOUR ONLY — the both-ways
# full-depth adjacency, the edge list, the dagre LR ranks, the per-branch fan-cap collapse, the two-line kind
# plaques via kindLabel, the DRAWN edge elements, the fit-to-view viewBox numerically containing every node, the
# selected-chain/ephemeral STATE markers, the per-node ⊕ expander expanding in place, ← Back leading the
# breadcrumb with the stepper+header ABSENT, the neighbour-click re-focus, and no fetch. The canvas APPEARANCE
# (the seed-packet palette, the drawn vine-stroke edges, the plaque legibility, the purple selected-chain, the
# dashed ephemeral stroke, the ⊕ affordance) is the story's operator-attested UAT leg (ADR-0188 dec 5/7,
# ADR-0070) — do NOT author a visual/colour/pixel/stroke assertion here, and do NOT edit TreeView.tsx or the
# CSS in this real: scope (the CSS look + the mount are the orchestrator's supplement glue after PASS — plan §G).
#
# HARD COMPAT CONSTRAINT (state it in the spec body too): the reworked LibraryFocusGraph.tsx MUST keep, per
# node, data-testid="lfg-node-<id>" AND the onDoubleClick={() => onOpen?.(toSearchResult(node))} firing —
# because the landed, byte-green apps/studio/src/components/LibraryOpenTrigger.test.tsx (lot-*) does
# fireEvent.doubleClick(getByTestId(`lfg-node-<id>`)) and asserts onOpen fires. The node testids stay lfg-node-*
# (implementation-detail compat); the CONTRACT titles are ldag-* — this split is intentional.
#
# CRITICAL — apps/studio is VITEST + jsdom (@testing-library/react), NOT node:test (apps/studio/vitest.config.ts,
# include src/**/*.test.{ts,tsx}). The default `node --test` real proof cannot run a .test.tsx. So this cap
# declares a real.proofCommand running the ONE test file under vitest (cwd = apps/studio). install: true
# (fresh-worktree tsx + tsc + vitest, ADR-0031 §2) + a typecheck wall. SCOPE = apps/studio/src.
# COVERAGE (ADR-0122): `storytree coverage` scans ONLY real.testFile, so EVERY ldag--named contract test lives
# in LibraryDagCanvas.test.tsx. Each TITLE must LEAD with its unique ldag- id or coverage silently drops N-1/N
# past the signed green (sdk-leaf-drops-contract-id-test-names — this arc's recurring class; the fix if it
# happens is TEST-TITLE-ONLY, never an assertion/source edit).
proof:
  command:
    file: pnpm
    args: ["--filter", "studio", "test"]
  scope:
    testGlobs: ["apps/studio/src/**/*.test.tsx", "apps/studio/src/**/*.test.ts"]
    sourceGlobs: ["apps/studio/src/**/*.ts", "apps/studio/src/**/*.tsx"]
  real:
    testFile: "apps/studio/src/components/LibraryDagCanvas.test.tsx"
    sourceFile: "apps/studio/src/components/LibraryFocusGraph.tsx"
    editsExisting: true
    scope:
      testGlobs: ["apps/studio/src/components/LibraryDagCanvas.test.tsx"]
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
        - "src/components/LibraryDagCanvas.test.tsx"
---

# The focus DAG canvas — a true layered reference DAG over the corpus references

**Outcome —** The finder's lifted selection centres a `@dagrejs/dagre` rankdir-LR layered DAG built from the
corpus's `references[]` BOTH ways (upstream "stands on" fanned left, downstream "stood on by" fanned right)
walked to FULL transitive depth (no depth cap), with DRAWN SVG edges between rank-adjacent nodes, per-branch
breadth tamed by in-place ⊕ expanders (the global depth stepper and `+N more` cluster chip RETIRED), ← Back
leading the breadcrumb at the canvas top-left with NO canvas header text, and a bounded fit-to-view `viewBox`
computed from the laid-out node bbox and machine-asserted to contain every node — over the already-loaded
corpus with no fetch beyond the wire; its geometry and behaviour machine-witnessed, its seed-packet appearance
operator-attested.

**Depends on —** [`library-finder`](library-finder.md). This capability REWORKS the landed focus subgraph
(`LibraryFocusGraph.tsx` + `focusGraph.ts`, inc 3, green at HEAD with its `lfg-*` contracts) into a true
layered reference DAG (ADR-0188 dec 5), reusing the finder's `assets`/`docs`/`selection`/`onFocus` props and
its finder-parity `SearchResult`. The canvas CONSUMES the finder's lifted selection: the finder lifts a full
`SearchResult` via `onSelect`, which `TreeView.tsx` holds as the shared `librarySelection`; that selection is
the canvas's CENTRE. It needs the delivered finder (its search heart, its `SearchResult` lift) as its
precondition, so `depends_on: [library-finder]` — the SAME edge the focus subgraph held; the node's identity in
the within-story graph is unchanged, only its capability id, test file, and contract prefix are new. It holds
no backend seam — it reads only the corpus ALREADY on the wire via `useAppData()` (the `studio` story's library
backend), taken as `assets`/`docs` props so the component is deterministically drivable in jsdom.

> **Proof status (honest) — `proposed`, BROWNFIELD re-author (editsExisting).** `LibraryFocusGraph.tsx` and
> `focusGraph.ts` EXIST and are green at HEAD (landed inc 3, #699, with their `lfg-*` contracts): the component
> renders CSS-column upstream/centre/downstream fans with NO drawn edges, a global depth stepper (default 1,
> capped at 5, testids `lfg-depth-value`/`lfg-depth-increase`/`lfg-depth-decrease`), a `+N more` cluster chip,
> and no SVG `viewBox`; `buildFocusGraph` still takes a `depth` param. This capability reworks both into the
> layered DAG: a NET-NEW vitest jsdom test (`LibraryDagCanvas.test.tsx`) drives the both-ways full-depth
> adjacency, the edge list, the dagre LR ranks, the per-branch fan-cap collapse, the DRAWN SVG edges, the
> fit-to-view viewBox, the per-node ⊕ expander, the Back-led breadcrumb with the stepper+header ABSENT, and the
> neighbour-walk — RED at HEAD as a FAILING-ASSERTION red (both sources exist — NOT module-not-found; the
> current render has no edges, no viewBox, and still ships the stepper), GREEN once both modules are reworked.
> Its GEOMETRY/BEHAVIOUR is machine-witnessed; its APPEARANCE (the seed-packet palette, the drawn vine-stroke
> edges, the purple selected-chain, the dashed ephemeral stroke, the ⊕ affordance) is the story's
> operator-attested UAT leg (ADR-0188 dec 5/7, ADR-0070; the shared inc-9/10 look sitting). Status stays
> `proposed` — `healthy` is only ever DERIVED from signed verdicts (ADR-0020), never authored.

## Guidance

WHY THIS IS A CAPABILITY, NOT A CONTRACT: its honest proof is the FOCUS DAG CANVAS AS A WHOLE — a pure
adjacency+edge-list+layout function over the loaded corpus PLUS a behavioural React/SVG component that renders
the laid-out DAG as positioned nodes with DRAWN edges between them, tames per-branch breadth with in-place
expanders, fits every node inside a bounded viewBox, marks the selected transitive chain and ephemeral kinds
with STATE data-attributes, leads the breadcrumb with a ← Back control, and graph-walks on a neighbour click —
spanning the both-ways full-depth adjacency heart, the edge list, the dagre layered layout, the drawn-edge
render, the fit-to-view viewBox, the per-node expander, the state marking, and the neighbour-walk, exercised in
jsdom. It is the brownfield rework of the inc-3 focus subgraph into the true layered reference DAG ADR-0188 dec
5 settles; the category shelf, the selection card, and the lens minimise handle are their own inc-9 increments.

THE PURE HEART — `buildFocusGraph` REWORKED (the `depth` PARAM RETIRES). The pure module
`apps/studio/src/lib/focusGraph.ts` keeps its name but its call becomes `buildFocusGraph({ centre, assets,
docs })` — the `depth` argument RETIRES (breadth is now tamed per-branch, not by a global depth cap). It walks
`references[]` BOTH ways to FULL transitive depth (no cap) in BOTH directions: **upstream ("stands on")** = the
transitive closure of each node's OWN `GuidanceAsset.references` (the `asset:`/`doc:` prefix stripped to
resolve a target id); **downstream ("stood on by")** = the transitive closure over the reverse index — every
asset whose `references` points at the node's id. `DocMeta` carries no `references` on the wire, so an
ADR-centred call has an EMPTY upstream fan (consistent with ADR-0185 dec 3 — "ADRs … bodies fetched on
demand"), though the ADR still appears as a downstream neighbour when an asset points at it; build the reverse
index over `GuidanceAsset.references` ONLY. The function returns (a) an EDGE LIST `{ from, to }` for every
in-scope reference, (b) the `@dagrejs/dagre` `rankdir: 'LR'` laid-out nodes (each carrying its x/y, side, and
STATE flags), and (c) the laid-out BBOX (width/height) so the component can compute a fit-to-view viewBox.
Per-BRANCH fan cap: a parent whose visible children exceed the cap COLLAPSES the overflow and exposes, per
parent, WHICH neighbours are collapsed and a collapsed COUNT — so a per-node ⊕ expander can reveal them.
Implementation note for the leaf (not a contract): an OPTIONAL `expanded?: ReadonlySet<string>` arg (default
empty) — the set of parent node ids whose collapsed children are revealed — keeps `buildFocusGraph({ centre,
assets, docs })` a valid call while making expand-in-place a PURE re-layout (dagre lays out only the visible
set, so the viewBox and edges stay correct as branches expand). Keep it PURE (input → output, no `useState`,
no DOM, NO fetch). Pin the adjacency in `ldag-adjacency-both-ways-full-depth`, the edge list in
`ldag-edge-list-over-references`, the ranks in `ldag-layered-ranks-upstream-left-downstream-right`, and the
fan cap in `ldag-per-branch-fan-cap-collapses-overflow`. Do NOT prescribe more than the observable behaviour.

THE COMPONENT REWORKED TO SVG — POSITIONED NODES + DRAWN EDGES + A BOUNDED VIEWBOX. `LibraryFocusGraph.tsx`
keeps its name but is reworked from three CSS columns into an SVG canvas: ONE positioned `<g>`/element per node
at the dagre-computed x/y (NOT three CSS columns), DRAWN SVG edge elements (e.g. `<path>`/`<line>` carrying
`data-testid="ldag-edge-<from>-<to>"`) between rank-adjacent referenced/referencer nodes, and a bounded
`viewBox` computed from the laid-out bbox. Per node it still renders the two-line kind plaque — the `title` and
a muted kind line whose text is `kindLabel(category, arcDisplay)` (`apps/studio/src/lib/kindDisplay.ts`, the
ONE place a kind KEY maps to display text, ADR-0183 D1), read via `useArcDisplay()`; an `arc` node reads the
lowercase string `"epic"`, NEVER the raw key `"arc"` — a hand-rolled `category → label` map would make the
canvas read "arc" while every other surface reads "Epic". Where a branch overflows the fan cap it renders a
per-node ⊕/"+N" expander (`data-testid="ldag-expander-<nodeId>"`) that expands IN PLACE on click. The selected
node + its transitive chain carry `data-chain`; ephemeral `plan`-kind nodes carry `data-ephemeral` (assert the
MARKER, the colour/stroke is the look). ← Back is the LEADING element of the breadcrumb at the canvas top-left;
the global depth stepper is REMOVED (no `lfg-depth-value`/`lfg-depth-increase`/`lfg-depth-decrease`) and there
is NO canvas header text. A neighbour click invokes `onFocus` with the finder-parity `SearchResult` and pushes
a breadcrumb entry. No fetch beyond the loaded corpus. Pin these in `ldag-node-plaque-kind-via-kindLabel`,
`ldag-edges-drawn-between-nodes`, `ldag-viewbox-contains-all-nodes`, `ldag-selected-chain-and-ephemeral-markers`,
`ldag-per-node-expander-expands-in-place`, `ldag-back-leads-breadcrumb-no-stepper-no-header`,
`ldag-neighbour-click-refocuses`, and `ldag-no-fetch-beyond-loaded`.

HARD COMPAT — KEEP `lfg-node-<id>` + THE `onDoubleClick` OPEN TRIGGER (the byte-green `lot-*` fence). The
landed, byte-green `apps/studio/src/components/LibraryOpenTrigger.test.tsx` (the inc-8 `lot-*` contracts) does
`fireEvent.doubleClick(screen.getByTestId(`lfg-node-<id>`))` and asserts `onOpen` fires with the node's
finder-parity `SearchResult`. So the reworked `LibraryFocusGraph.tsx` MUST keep, per node, BOTH
`data-testid="lfg-node-<id>"` AND the existing `onDoubleClick={() => onOpen?.(toSearchResult(node))}` handler
(already on the node at HEAD). The node testids stay `lfg-node-*` (an implementation-detail compat with the
signed `lot-*` test) while this capability's CONTRACT titles are `ldag-*` — that split is INTENTIONAL, not an
inconsistency. `LibraryOpenTrigger.test.tsx` is OUTSIDE this cap's `real.scope` (its `testGlobs` is
`LibraryDagCanvas.test.tsx` only), so the leaf CANNOT and MUST NOT edit it — keep the node testid + the
double-click handler so its `lot-subgraph-dblclick-opens` test stays green with zero edits.

THE FIT-TO-VIEW VIEWBOX IS GEOMETRY, NOT LOOK (ADR-0187 promoted friction). The bounded `viewBox` is computed
from the laid-out node bbox and is MACHINE-ASSERTED numerically — parse the `viewBox` attribute and confirm
every laid-out node's x/y falls WITHIN it (`ldag-viewbox-contains-all-nodes`). This is NOT an appearance
assertion: CSS cannot retrofit a viewBox, so the fit-to-view containment is a genuine geometry contract, not a
colour/pixel judgment. The seed-packet PALETTE inside that viewBox is the operator-attested look; the viewBox
BOUNDS are geometry.

THE RETIRED `lfg-*` BEHAVIOURS RE-HOME AS `ldag-*` (this is a rework, not a from-scratch build). The still-true
inc-3 subgraph behaviours — the both-ways `references` adjacency, the dagre rankdir-LR layered ranks, the
two-line `kindLabel` plaque, the selected-chain / ephemeral-plan STATE markers, the neighbour-click re-focus,
and the no-fetch invariant — MOVE from the retired `library-focus-subgraph` capability (its `LibraryFocusGraph.test.tsx`
`lfg-*` contracts) into THIS capability's `ldag-*` contracts, now walked to full depth and rendered as a true
DAG. The NET-NEW dec-5 geometry — DRAWN edges, full transitive depth, per-node expanders, the fit-to-view
viewBox, and the no-stepper/no-header layout — is pinned alongside them. The retired `LibraryFocusGraph.test.tsx`
(the `lfg-*` file) is replaced by `LibraryDagCanvas.test.tsx`; its still-true behaviours are re-proven under the
`ldag-*` titles here. (Deleting the retired `lfg-*` test file + swapping the `node-build.test.ts` snapshot is the
orchestrator's mechanical glue, done separately — NOT this leaf's scope.)

APPEARANCE IS OPERATOR-ATTESTED, NOT ASSERTED (ADR-0188 dec 5/7 + ADR-0070). The canvas follows the map's
seed-packet palette (the world's CSS variables, as the shell and finder do), NOT neutral-admin white and NEVER
the black-terminal look. The seed-packet palette, the DRAWN vine-stroke edges, the plaque legibility, the
PURPLE selected-chain, the DASHED ephemeral stroke, and the ⊕ affordance are WITNESSED by the owner (the shared
inc-9/10 look sitting against the owner-aligned mock, ADR-0188 Consequences), never a machine visual verdict —
do NOT author a visual/colour/pixel/stroke assertion in this cap's tests (assert the adjacency, the edge list,
the ranks/ordering, the DRAWN edge ELEMENTS, the viewBox CONTAINMENT, the plaque TEXT, the state MARKERS, the
expander behaviour, the Back-led breadcrumb, and the neighbour-walk — never their styling). Do NOT edit
`TreeView.tsx` or the CSS in this `real:` scope — the CSS look and the TreeView mount are the orchestrator's
supplement glue after PASS (plan §G).

OFFLINE-TESTABLE IN JSDOM (the `LibraryFinder.test.tsx` / `LibraryDrawer.test.tsx` discipline).
`@vitest-environment jsdom`, `@testing-library/react` for render / `fireEvent` (click a neighbour, click a ⊕
expander, breadcrumb back). No backend seam to mock (the canvas holds no `api` call — it takes
`assets`/`docs`/`selection`/`onFocus`/`onOpen` as props); the pure `buildFocusGraph` tests need no jsdom at all
but still live in the one test file (ADR-0122 coverage). No real `fetch`, no `docContent`, no socket, no DB, no
Electron. The component imports no agent/drive/model (the `modelPathBoundary.test.ts` wall stays green).

## Integration test

**Goal —** Prove the focus DAG canvas: `buildFocusGraph({ centre, assets, docs })` builds adjacency BOTH ways
over `GuidanceAsset.references` to FULL transitive depth (no cap), stripping the `asset:`/`doc:` prefix, with an
ADR centre having an empty upstream fan; returns an edge list `{ from, to }` for every in-scope reference; runs
dagre rankdir-LR with upstream ranked left / downstream right and x monotonic along a chain; collapses a
per-branch overflow and exposes its collapsed count; and the `<LibraryFocusGraph>` component renders each node
as a two-line `kindLabel` plaque (an `arc` reads "epic"), DRAWS SVG edges between rank-adjacent nodes, fits
every node inside a bounded `viewBox`, marks the selected transitive chain `data-chain` and ephemeral `plan`
nodes `data-ephemeral`, renders a per-node ⊕ expander that expands in place, leads the breadcrumb with ← Back
with the depth stepper and header ABSENT, re-focuses via `onFocus` on a neighbour click, and never fetches
beyond the loaded corpus — entirely in jsdom, no backend, driven by props.

The integration test exercises this capability against its own composition (no backend seam) — the pure
`buildFocusGraph` adjacency+edge-list+layout, the drawn-edge render, the fit-to-view viewBox, the `kindLabel`
routing, the state marking, the per-node expander, the Back-led breadcrumb, and the neighbour-walk are all
real. It would:

1. Call `buildFocusGraph({ centre, assets, docs })` directly with a small fixed corpus (a few `GuidanceAsset`s
   wired via `references` — a multi-rank chain centre→A→B→C, a hub, and an `arc` — plus a couple of `DocMeta`
   ADRs). Assert upstream nodes come from the centre's OWN `references` and downstream nodes from the reverse
   index, with the `asset:`/`doc:` prefix stripped; assert the chain is walked to FULL depth (B at depth-2 and
   C at depth-3 are BOTH present — no cap); assert an ADR-centred call yields an EMPTY upstream fan.
2. Assert `buildFocusGraph` returns an edge list — one `{ from, to }` per in-scope reference — and the fixture's
   edges (centre→A, A→B, B→C, …) are all present.
3. Assert the dagre rankdir-LR layout ranks upstream nodes LEFT of the centre and downstream nodes RIGHT, with
   x monotonically increasing along the multi-rank chain (assert ranks / x-ordering, not pixel-exact
   coordinates).
4. Assert a hub whose branch exceeds the per-branch fan cap COLLAPSES its overflow and exposes the collapsed
   set + a collapsed count (so a per-node expander can reveal it).
5. Render `<LibraryFocusGraph assets={…} docs={…} selection={…} onFocus={vi.fn()} onOpen={vi.fn()} />` in jsdom
   over a corpus including an `arc` node. Assert each node renders a two-line plaque — its `title` and a kind
   line whose text is `kindLabel(category, arcDisplay)`; the `arc` node reads "epic", and the raw key `"arc"`
   does NOT appear as the kind text.
6. Assert the component renders DRAWN SVG edge elements (`data-testid="ldag-edge-<from>-<to>"`) between
   rank-adjacent nodes — an edge element exists for a fixture edge (the shipped subgraph drew NO edges).
7. Parse the SVG `viewBox` attribute and assert it is a BOUNDED box within which EVERY laid-out node's x/y falls
   numerically (fit-to-view containment).
8. Assert the selected node + its transitive chain carry `data-chain` (off-chain nodes do not), and a
   `plan`-kind node carries `data-ephemeral` (a durable-kind node does not) — asserting the MARKERS, not the
   colour/stroke.
9. Assert a per-node ⊕/"+N" expander (`data-testid="ldag-expander-<nodeId>"`) renders where a branch overflows;
   `fireEvent.click` it and assert a previously-collapsed neighbour now appears (expand-in-place re-layout).
10. Assert ← Back is the LEADING element of the breadcrumb at the canvas top-left (Back precedes the trail
    entries in DOM order); assert the depth-stepper testids (`lfg-depth-value`/`lfg-depth-increase`/
    `lfg-depth-decrease`) are ABSENT; assert there is NO canvas header text.
11. Click a neighbour node. Assert `onFocus` is invoked with that neighbour's finder-parity `SearchResult` and a
    breadcrumb entry is pushed.
12. Assert no `docContent`/`fetch`/socket is called across the whole exercise (the canvas reads only the loaded
    corpus).

## Contracts (12)

The test-proven leaf behaviours — each **one isolated automated test** in the `studio` suite (vitest jsdom,
`apps/studio/src/components/LibraryDagCanvas.test.tsx`; the pure-heart contracts import `buildFocusGraph` from
`../lib/focusGraph`, the component contracts import `LibraryFocusGraph` from `./LibraryFocusGraph`). Per
ADR-0122 (`storytree coverage`) each contract id is the LEAD of a distinctly-named test, so the coverage check
reports 12/12 against the ONE `real.testFile`. None of these is an APPEARANCE assertion — the look (the
seed-packet palette, the drawn vine-stroke edges, the purple selected-chain, the dashed ephemeral stroke, the
⊕ affordance) is the story's operator-attested UAT leg (ADR-0188 dec 5/7, ADR-0070). Contracts 1–4 (the
adjacency, edge list, ranks, neighbour-walk, kind plaque, chain/ephemeral markers, no-fetch) RE-HOME the
still-true `lfg-*` survivors of the retired focus subgraph; contracts pinning DRAWN edges, full depth, per-node
expanders, the fit-to-view viewBox, and no-stepper/no-header are the NET-NEW dec-5 geometry.

1. **`ldag-adjacency-both-ways-full-depth`** — adjacency over `references[]` BOTH ways, prefix-stripped, walked to FULL transitive depth (no cap) in both directions
   - **asserts —** `buildFocusGraph({ centre, assets, docs })` yields UPSTREAM nodes from the transitive closure
     of the centre's own `GuidanceAsset.references` ("stands on") AND DOWNSTREAM nodes from the transitive
     closure over the reverse index — every asset whose `references` points AT a node ("stood on by") — with the
     `asset:`/`doc:` prefix stripped to resolve each ref; walked to FULL transitive depth (no cap), so a chain
     centre→A→B→C includes B (depth-2) and C (depth-3); and an ADR-CENTRED call yields an EMPTY upstream fan
     (DocMeta carries no `references`). The reverse index is built over `GuidanceAsset.references` only.
   - **covers —** `apps/studio/src/lib/focusGraph.ts` (the both-ways full-depth transitive walk + prefix strip + reverse index)
   - **proven by —** `apps/studio/src/components/LibraryDagCanvas.test.tsx` (net-new, vitest; imports `buildFocusGraph`).
2. **`ldag-edge-list-over-references`** — the pure heart returns an edge list `{from,to}` for every in-scope reference
   - **asserts —** `buildFocusGraph` returns an EDGE LIST — one `{ from, to }` per in-scope reference across the
     walked neighbourhood; over a fixture whose refs form centre→A, A→B, B→C, the returned edges contain all of
     those pairs (the edge data the component draws from).
   - **covers —** `apps/studio/src/lib/focusGraph.ts` (the edge-list construction over the walked references)
   - **proven by —** `apps/studio/src/components/LibraryDagCanvas.test.tsx`.
3. **`ldag-layered-ranks-upstream-left-downstream-right`** — dagre rankdir-LR layered ranks; upstream left, downstream right, x monotonic along a chain
   - **asserts —** `buildFocusGraph` runs `@dagrejs/dagre` with `rankdir: 'LR'` and returns laid-out nodes whose
     ranks place upstream nodes LEFT of the centre and downstream nodes RIGHT, with x monotonically increasing
     along a multi-rank chain — asserted on the computed ranks / x-ordering, NOT pixel-exact coordinates (the
     exact geometry is the look).
   - **covers —** `apps/studio/src/lib/focusGraph.ts` (the dagre rankdir-LR layered layout)
   - **proven by —** `apps/studio/src/components/LibraryDagCanvas.test.tsx`.
4. **`ldag-per-branch-fan-cap-collapses-overflow`** — a branch past the per-branch fan cap yields a collapsed set + an expandable overflow count
   - **asserts —** a parent branch whose visible children exceed the per-branch fan cap COLLAPSES the overflow:
     the pure heart exposes, per parent, WHICH neighbours are collapsed behind it and a collapsed COUNT (so a
     per-node expander can later reveal them); over a hub fixture, the overflow is collapsed and the collapsed
     count is exposed. Breadth is tamed per-branch, not by a global depth cap.
   - **covers —** `apps/studio/src/lib/focusGraph.ts` (the per-branch fan cap + collapsed-set/count exposure)
   - **proven by —** `apps/studio/src/components/LibraryDagCanvas.test.tsx`.
5. **`ldag-node-plaque-kind-via-kindLabel`** — each node renders a two-line plaque; the kind line routes through `kindLabel`; an `arc` reads "epic", never the raw key
   - **asserts —** rendering `<LibraryFocusGraph>` over a corpus that includes an `arc` node, each node renders a
     two-line plaque — its `title` and a muted kind line whose text is `kindLabel(category, arcDisplay)` (via
     `useArcDisplay()`); the `arc` node's kind line reads "epic", and the raw key `"arc"` does NOT appear as the
     kind text. The kind line routes through `kindLabel` — NEVER a hand-rolled `category → label` map.
   - **covers —** `apps/studio/src/components/LibraryFocusGraph.tsx` (the two-line `kindLabel` plaque)
   - **proven by —** `apps/studio/src/components/LibraryDagCanvas.test.tsx`.
6. **`ldag-edges-drawn-between-nodes`** — the component renders DRAWN SVG edge elements between rank-adjacent nodes
   - **asserts —** the component renders DRAWN SVG edge elements (e.g. `<path>`/`<line>` at
     `data-testid="ldag-edge-<from>-<to>"`, or a `data-edge` marker) between rank-adjacent referenced/referencer
     nodes; over a fixture with a known edge, an edge element exists for that edge. This is the core dec-5 fix —
     the shipped inc-3 subgraph drew NO edges (three bare CSS columns).
   - **covers —** `apps/studio/src/components/LibraryFocusGraph.tsx` (the drawn SVG edge layer)
   - **proven by —** `apps/studio/src/components/LibraryDagCanvas.test.tsx`.
7. **`ldag-viewbox-contains-all-nodes`** — the SVG viewBox is a bounded box computed from the laid-out bbox, and every node falls numerically within it
   - **asserts —** the SVG's `viewBox` is a BOUNDED box computed from the laid-out node bbox; parsing the
     `viewBox` attribute (x/y/width/height), every laid-out node's x/y falls numerically WITHIN it. This is the
     fit-to-view GEOMETRY contract (ADR-0187 promoted friction) — machine-asserted numerically, NOT a look
     assertion (CSS cannot retrofit a viewBox).
   - **covers —** `apps/studio/src/components/LibraryFocusGraph.tsx` (the fit-to-view viewBox from the laid-out bbox)
   - **proven by —** `apps/studio/src/components/LibraryDagCanvas.test.tsx`.
8. **`ldag-selected-chain-and-ephemeral-markers`** — the selected node + transitive chain carry `data-chain`; plan-kind nodes carry `data-ephemeral`
   - **asserts —** the selected node AND its transitive reference chain carry the `data-chain` STATE marker
     (off-chain nodes do NOT), and a `plan`-kind node carries the `data-ephemeral` marker (a durable-kind node
     does NOT). The assertion is on the MARKERS, never the colour value or the stroke style — the purple
     selected-chain and the dashed ephemeral are the operator-attested look.
   - **covers —** `apps/studio/src/components/LibraryFocusGraph.tsx` (the on-chain + ephemeral state markers)
   - **proven by —** `apps/studio/src/components/LibraryDagCanvas.test.tsx`.
9. **`ldag-per-node-expander-expands-in-place`** — a per-node ⊕/"+N" expander renders where a branch overflows and expands in place on click
   - **asserts —** where a branch overflows the fan cap, a per-node expander (`data-testid="ldag-expander-<nodeId>"`)
     renders; `fireEvent.click` on it re-lays-out with the previously-collapsed neighbours now shown (assert the
     expander present → click → a hidden neighbour appears). This per-node expander REPLACES both the `+N more`
     cluster chip AND the global depth stepper.
   - **covers —** `apps/studio/src/components/LibraryFocusGraph.tsx` (the per-node ⊕ expander + expand-in-place render) and `apps/studio/src/lib/focusGraph.ts` (the `expanded`-arg pure re-layout)
   - **proven by —** `apps/studio/src/components/LibraryDagCanvas.test.tsx`.
10. **`ldag-back-leads-breadcrumb-no-stepper-no-header`** — ← Back leads the breadcrumb at the canvas top-left; the global depth stepper is absent; no canvas header text
    - **asserts —** ← Back is the LEADING element of the breadcrumb at the canvas top-left (Back precedes the
      trail entries in DOM order); the global depth stepper is ABSENT
      (`queryByTestId('lfg-depth-value')`/`'lfg-depth-increase'`/`'lfg-depth-decrease'` all null); and there is
      NO canvas header text. The inc-3 depth stepper and header retire with this rework.
    - **covers —** `apps/studio/src/components/LibraryFocusGraph.tsx` (the Back-led breadcrumb + the removed depth stepper + the removed header)
    - **proven by —** `apps/studio/src/components/LibraryDagCanvas.test.tsx`.
11. **`ldag-neighbour-click-refocuses`** — clicking a neighbour fires `onFocus` with its finder-parity SearchResult and pushes a breadcrumb entry
    - **asserts —** clicking a NEIGHBOUR node invokes `onFocus(result)` with that neighbour's finder-parity
      `SearchResult` (via the existing `toSearchResult` shape) and pushes a breadcrumb entry. The single-click
      re-focus / graph-walk carries over from the inc-3 subgraph, unchanged in semantics.
    - **covers —** `apps/studio/src/components/LibraryFocusGraph.tsx` (the neighbour-click `onFocus` lift + breadcrumb push)
    - **proven by —** `apps/studio/src/components/LibraryDagCanvas.test.tsx`.
12. **`ldag-no-fetch-beyond-loaded`** — building + rendering never calls fetch/docContent/socket; reads only the loaded corpus
    - **asserts —** across building and rendering the canvas, only ids/titles/`references` already on the loaded
      `assets`/`docs` props are read — no `docContent`, no `fetch`, no socket is called (ADR bodies are the
      dive's on-demand job, not the canvas's adjacency).
    - **covers —** `apps/studio/src/lib/focusGraph.ts` + `apps/studio/src/components/LibraryFocusGraph.tsx` (the loaded-corpus-only, no-fetch invariant)
    - **proven by —** `apps/studio/src/components/LibraryDagCanvas.test.tsx`.

## Guidance — the brownfield slice that earns the signed verdict

The rung toward `healthy` (ADR-0057 §3, BROWNFIELD editsExisting): rework the signed focus subgraph into the
true layered reference DAG, test-first, keeping the `lot-*` node-open trigger byte-green.

- **The new test —** `apps/studio/src/components/LibraryDagCanvas.test.tsx` (`@vitest-environment jsdom`, vitest
  + `@testing-library/react` — the studio package convention, the `LibraryFinder.test.tsx` /
  `LibraryDrawer.test.tsx` shape; NO real `fetch`/`docContent`/socket/DB/Electron). Import `{ buildFocusGraph }`
  from `"../lib/focusGraph"` and `{ LibraryFocusGraph }` from `"./LibraryFocusGraph"` (the source files KEEP
  their names). Name each test for its contract id (`ldag-…`, LEADING the title) so
  `storytree coverage library-dag-canvas` reports 12/12 (ADR-0122) — the pure-heart contracts live in THIS one
  file too, since coverage scans only `real.testFile`.
- **The RED the spine observes (before IMPLEMENT) —** a FAILING-ASSERTION red (both sources exist — NOT
  module-not-found): at HEAD the component renders three CSS columns with NO drawn edges, a global depth stepper
  (testids `lfg-depth-*`), a `+N more` cluster chip, and no SVG `viewBox`, and `buildFocusGraph` still takes a
  `depth` param — so the `ldag-` tests (drawn edges, full transitive depth, per-node expanders, fit-to-view
  viewBox, no-stepper/no-header) fail. This is the brownfield red the spine observes against the shipped subgraph
  (ADR-0057).
- **The GREEN —** rework the two modules. `apps/studio/src/lib/focusGraph.ts`: `buildFocusGraph({ centre, assets,
  docs })` (retire the `depth` param) — both-ways adjacency walked to FULL transitive depth, an edge list
  `{ from, to }`, the dagre rankdir-LR laid-out nodes + the laid-out bbox, and a per-branch fan cap exposing the
  collapsed set/count (an OPTIONAL `expanded?` arg driving the pure re-layout). `apps/studio/src/components/LibraryFocusGraph.tsx`:
  an SVG canvas — one positioned element per node, DRAWN edge elements between rank-adjacent nodes, a bounded
  fit-to-view `viewBox` from the bbox, the two-line `kindLabel` plaque, `data-chain`/`data-ephemeral` state
  markers, a per-node ⊕ expander that expands in place, a ← Back-led breadcrumb with the depth stepper + header
  REMOVED, and the neighbour-click `onFocus` lift — KEEPING per node `data-testid="lfg-node-<id>"` and
  `onDoubleClick={() => onOpen?.(toSearchResult(node))}` so `LibraryOpenTrigger.test.tsx` (`lot-*`, OUTSIDE this
  `real.scope`) stays byte-green. MOUNTING it into TreeView's side-panel/canvas composition, the DAG-canvas CSS,
  and the seed-packet appearance are witnessed under the story's operator-attested UAT leg (ADR-0070), NOT
  asserted in CI and NOT in this `real:` scope. After it, the new test's assertions hold, the signed `lot-*`
  tests stay green, and `pnpm --filter studio test` + `pnpm --filter studio typecheck` stay green.

Rules:

- **Adjacency both ways to FULL transitive depth, assets-only source** — upstream = the transitive closure of
  the centre's own `references`; downstream = the transitive closure over the reverse index (assets pointing at
  a node); strip the `asset:`/`doc:` prefix; no depth cap; an ADR centre has an empty upstream fan
  (`ldag-adjacency-both-ways-full-depth`). `DocMeta` carries no `references`.
- **The pure heart returns an edge list** — one `{ from, to }` per in-scope reference; the component draws from
  it (`ldag-edge-list-over-references`). The `depth` param RETIRES.
- **Dagre rankdir-LR layered ranks** — upstream left, downstream right, x monotonic along a chain; assert ranks/
  ordering, not pixel coordinates (`ldag-layered-ranks-upstream-left-downstream-right`). Build the layout FRESH
  in the pure module — do NOT thread it through TreeView.
- **Breadth is tamed per-branch, not by a global depth cap** — a branch past the fan cap collapses its overflow
  and exposes the collapsed set/count (`ldag-per-branch-fan-cap-collapses-overflow`), revealed by a per-node ⊕
  expander that expands IN PLACE on click (`ldag-per-node-expander-expands-in-place`). This replaces BOTH the
  `+N more` cluster chip and the global depth stepper.
- **Edges are DRAWN** — SVG edge elements between rank-adjacent nodes (`ldag-edges-drawn-between-nodes`); the
  shipped subgraph drew none (the core dec-5 fix).
- **The viewBox is fit-to-view GEOMETRY, machine-asserted** — a bounded box from the laid-out bbox containing
  every node numerically (`ldag-viewbox-contains-all-nodes`); this is geometry, not look (CSS cannot retrofit a
  viewBox).
- **Kind is text via `kindLabel`, never a hand-rolled map** — an `arc` reads "epic" like every other surface
  (`ldag-node-plaque-kind-via-kindLabel`).
- **Colour is STATE, asserted as a marker** — the selected transitive chain carries `data-chain`, ephemeral
  `plan` nodes carry `data-ephemeral`; assert the MARKERS, never the colour/stroke
  (`ldag-selected-chain-and-ephemeral-markers`). Purple/dashed are the look.
- **← Back leads the breadcrumb; the stepper + header are GONE** — Back precedes the trail entries at the canvas
  top-left, the `lfg-depth-*` stepper testids are absent, and there is no canvas header text
  (`ldag-back-leads-breadcrumb-no-stepper-no-header`).
- **Neighbour-click re-focuses via `onFocus`** — the graph-walk lifts the neighbour's finder-parity
  `SearchResult` and pushes a breadcrumb entry (`ldag-neighbour-click-refocuses`).
- **No fetch beyond the loaded corpus** — no `docContent`/fetch/socket (`ldag-no-fetch-beyond-loaded`).
- **HARD COMPAT — keep `lfg-node-<id>` + the `onDoubleClick` Open trigger** — the reworked component keeps the
  node testid and the double-click `onOpen` handler so the signed, byte-green `lot-*` tests
  (`LibraryOpenTrigger.test.tsx`, OUTSIDE this `real.scope`) stay green with zero edits. The node testids stay
  `lfg-node-*` (compat) while the CONTRACT titles are `ldag-*` — that split is intentional.
- **Appearance is operator-attested, not asserted here** (ADR-0188 dec 5/7, ADR-0070) — prove the adjacency,
  the edge list, the ranks/ordering, the DRAWN edge ELEMENTS, the viewBox CONTAINMENT, the plaque TEXT, the
  state MARKERS, the expander behaviour, the Back-led breadcrumb, and the neighbour-walk; the seed-packet
  palette, the vine-stroke edges, the purple chain, the dashed ephemeral, and the ⊕ affordance are the story's
  shared inc-9/10 look leg. Do NOT author a visual verdict, and do NOT edit `TreeView.tsx` or the CSS in the
  `real:` scope (the CSS + mount are the orchestrator's supplement glue after PASS — plan §G).
- **Every `ldag-` contract test TITLE leads with its unique id** or `storytree coverage` silently drops coverage
  (`sdk-leaf-drops-contract-id-test-names`, this arc's recurring class risk — the fix if it happens is
  TEST-TITLE-ONLY, never an assertion/source edit).
