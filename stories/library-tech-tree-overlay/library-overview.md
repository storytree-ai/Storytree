---
id: "library-overview"
tier: capability
story: library-tech-tree-overlay
title: "The empty-state whole-corpus dot field under the ADR-0185 dec-4 LOD ladder — importance = degree, owning its own search input, geometry machine-witnessed / appearance operator-attested"
outcome: "With no selection the whole corpus renders as a constellation dot field over the map under the ADR-0185 dec-4 LOD ladder — one SVG element per node at FAR (importance = reference-graph DEGREE, bucketed into three size tiers; circle for an artifact, square for an ADR; no ambient labels), top-tier labels per grid cell at MID, and two-line kind-in-node plaques at CLOSE — laid out over the whole corpus by a pure, deterministic, cycle-tolerant layout, glowing the live matches of its OWN internal search input (searchCorpus), and lifting a node click into the SHARED librarySelection as a SearchResult; its degree/tiers/band/layout-totality/element-count/glow-marker/select-result/no-fetch machine-witnessed, its appearance operator-attested."
status: proposed
proof_mode: integration-test
depends_on: [library-finder]
decisions: [185, 171, 122, 23, 70]
# Node-borne proof config (ADR-0057 keystone). NET-NEW (no editsExisting): the leaf authors a vitest
# jsdom component test importing a NOT-YET-EXISTING component (LibraryOverview.tsx) and a NOT-YET-EXISTING
# pure module (overviewConstellation.ts) — both under apps/studio/src (red = module-not-found at HEAD),
# then writes them (green). The clean red→green heart is the PURE overviewConstellation module (importanceOf
# degree scoring + size-tier bucketing + lodBand + constellationLayout + glowIds); the component is the SVG
# dot-field render layer (FAR/MID/CLOSE LOD, search-glow, node-select) around it.
# FRONTEND-BUILDER TWO-STAGE (ADR-0070): this `real:` arm proves the GEOMETRY/BEHAVIOUR ONLY — importance is
# in+out DEGREE over the client-side references[] graph (reuse the focusGraph.ts resolveRef + reverse-index
# idiom); load_bearing is NOT on the wire this increment (neither GuidanceAsset nor DocMeta carries it, and
# DocMeta carries no references either), so importance is DEGREE-ONLY and an ADR's out-degree is always 0 →
# its importance = its IN-degree only (the load_bearing enrichment is increment 6). importance buckets into
# EXACTLY 3 monotonic size tiers; lodBand(zoom) returns 'far'|'mid'|'close' at settled thresholds, monotonic
# in zoom; constellationLayout assigns a position to EVERY corpus node deterministically (wrapping the pure,
# cycle-tolerant stressSeeds — the engine is NOT the red-green surface; assert totality + repeat-equality +
# element-count, NEVER pixel coords); glowIds = the ids searchCorpus returns (MIN_QUERY_LENGTH=2 floor). The
# component renders the empty-state constellation — FAR one SVG element per node (circle=artifact, square=ADR,
# sized by tier, NO ambient labels — the perf/LOD contract), MID top-tier labels per grid cell, CLOSE two-line
# kind-in-node plaques (reuse the inc-3 plaque idiom + kindLabel/useArcDisplay — an `arc` reads "epic"); marks
# matched nodes with a data-glow STATE attribute (assert the MARKER, not the pulse); a node click lifts an
# onSelect(SearchResult) into the SHARED librarySelection (source 'asset' for an artifact, source 'doc' +
# category 'adr' for an ADR — finder parity). The dot field's APPEARANCE (the tier sizes, the band transitions,
# the glow pulse, the plaque styling, the forest-cozy palette) and its real MOUNTING into TreeView's empty-state
# slot are the story's operator-attested UAT leg 5 (the look is witnessed, never a machine visual verdict; do
# NOT add a visual/colour/stroke/pixel/animation assertion here, and do NOT edit TreeView.tsx or LibraryDrawer.tsx
# in this `real:` scope — the overview is proven in isolation and takes assets/docs/onSelect as PROPS, holding
# its OWN internal query+zoom state; the peekSlot conditional mount is the orchestrator's supplement glue after
# PASS, exactly as the finder's / subgraph's / dive's mount was — trap k).
#
# CRITICAL — apps/studio is VITEST + jsdom (@testing-library/react), NOT node:test (apps/studio/vitest.config.ts,
# include src/**/*.test.{ts,tsx}). The default `node --test` real proof cannot run a `.test.tsx`. So this
# cap declares a `real.proofCommand` running the ONE test file under vitest (cwd = apps/studio).
# install: true (fresh-worktree tsx + tsc + vitest, ADR-0031 §2) + a typecheck wall. SCOPE = apps/studio/src.
# COVERAGE (ADR-0122): `storytree coverage` scans ONLY real.testFile, so EVERY `lov-`-named contract test —
# including the pure overviewConstellation ones — lives in LibraryOverview.test.tsx, which imports the pure
# module from ../lib/overviewConstellation.
proof:
  command:
    file: pnpm
    args: ["--filter", "studio", "test"]
  scope:
    testGlobs: ["apps/studio/src/**/*.test.tsx", "apps/studio/src/**/*.test.ts"]
    sourceGlobs: ["apps/studio/src/**/*.ts", "apps/studio/src/**/*.tsx"]
  real:
    testFile: "apps/studio/src/components/LibraryOverview.test.tsx"
    sourceFile: "apps/studio/src/components/LibraryOverview.tsx"
    scope:
      testGlobs: ["apps/studio/src/components/LibraryOverview.test.tsx"]
      sourceGlobs:
        - "apps/studio/src/components/LibraryOverview.tsx"
        - "apps/studio/src/lib/overviewConstellation.ts"
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
        - "src/components/LibraryOverview.test.tsx"
---

# The overview constellation — the empty-state whole-corpus dot field under the LOD ladder

**Outcome —** With no selection the WHOLE corpus renders as a constellation dot field over the map under the
ADR-0185 dec-4 LOD ladder: at FAR one SVG element per node (importance = reference-graph DEGREE, bucketed
into three size tiers; a circle for an artifact, a square for an ADR; NO ambient labels), at MID the top-tier
labels per screen grid cell, and at CLOSE two-line kind-in-node plaques — laid out over the whole corpus by a
pure, deterministic, cycle-tolerant layout, glowing the live matches of its OWN internal search input (via
`searchCorpus`), and lifting a node click into the SHARED `librarySelection` as a `SearchResult`. Its
degree/tiers/band/layout-totality/element-count/glow-marker/select-result/no-fetch are machine-witnessed; its
appearance is operator-attested.

**Depends on —** [`library-finder`](library-finder.md). The overview ORIGINATES a selection into the SAME
`librarySelection` the finder and subgraph share: a node click lifts a full `SearchResult` via `onSelect`
(recon fact — not just an id), which `TreeView.tsx` holds as `librarySelection`
(`useState<SearchResult | null>`). The overview is the empty-state entry point that seeds that shared
selection — feeding the finder/subgraph/dive downstream — so it depends on the finder that established the
selection seam, exactly as increments 3 and 4 did. It is functionally INDEPENDENT of the focus subgraph
(increment 3) and the dive body (increment 4): it consumes neither the subgraph's graph-walk nor the dive's
router, it only seeds the shared selection, so the finder is the tightest true edge. The overview mounts as
the empty-state view of the shell's EXISTING single `peekSlot` node (rendered when there is no selection),
composed at the TreeView level, so `LibraryDrawer.tsx` is NOT touched (its `lds-*`/`ldw-*` tests stay
byte-green — trap k). That empty-state mount is the orchestrator's supplement glue AFTER this leaf's PASS
(mirroring how increments 1–4's real mounting was outside their `real:` scope) — so this capability edits
NEITHER `TreeView.tsx` NOR `LibraryDrawer.tsx`; it proves the overview in isolation, driven by props, holding
its OWN internal `query` and zoom/pan state. It holds no backend seam — it reads the corpus that is ALREADY
on the wire via `useAppData()` (the `studio` story's library backend), taken as `assets`/`docs` props so the
component is deterministically drivable in jsdom.

> **Proof status (honest) — `proposed`, NET-NEW two-stage.** Neither
> `apps/studio/src/lib/overviewConstellation.ts` nor `apps/studio/src/components/LibraryOverview.tsx` exists
> at HEAD (verified 2026-07-12 — `ls` returns absent for both, and for the test file
> `apps/studio/src/components/LibraryOverview.test.tsx`). This capability authors them test-first: a new
> vitest jsdom test drives the pure `overviewConstellation` module (degree scoring, size-tier bucketing, LOD
> band, layout totality/determinism, glow set) and the component's FAR-band render / search-glow / node-select
> / no-fetch behaviour, RED at HEAD (module-not-found), GREEN once both modules are written. Its
> GEOMETRY/BEHAVIOUR is machine-witnessed; its APPEARANCE inside the real drawer (the tier sizes, the band
> transitions, the glow pulse, the plaque styling, the forest-cozy palette) and its real mounting into the
> shell's empty-state slot are the story's operator-attested UAT leg 5 (ADR-0070), witnessed at
> `?overlay=library#/tree`. Status stays `proposed` — `healthy` is only ever DERIVED from signed verdicts
> (ADR-0020), never authored.

## Guidance

WHY THIS IS A CAPABILITY, NOT A CONTRACT: its honest proof is the OVERVIEW CONSTELLATION AS A WHOLE — a pure
module that scores importance over the reference graph, buckets it into size tiers, maps zoom to an LOD band,
lays out the whole corpus deterministically, and computes the search-glow set, PLUS a behavioural React/SVG
component that renders the empty-state dot field at the FAR band (one element per node), glows the live query
matches, and lifts a node click into the shared selection — spanning the degree heart, the tier bucketing,
the LOD ladder, the whole-corpus layout, the glow set, the one-element-per-node render, and the node-select
lift, exercised in jsdom. It is the empty-state entry surface that turns the whole corpus into a walkable dot
field; the wire extension and the load_bearing importance enrichment are those increments' jobs, gated on
this constellation.

IMPORTANCE IS DEGREE OVER `references[]` — AND DEGREE-ONLY THIS INCREMENT (the enrichment trap). Importance
is scored in the PURE module as `importanceOf(assets, docs)` = the in+out DEGREE of each node over the
client-side `references[]` graph — REUSING the `focusGraph.ts` idiom (`resolveRef` to strip the
`asset:`/`doc:` prefix and resolve a ref to a target id, plus the reverse index over
`GuidanceAsset.references` for in-degree). **`load_bearing` is NOT on the wire this increment** — neither
`GuidanceAsset` nor `DocMeta` carries a `load_bearing` field, and `DocMeta` carries NO `references` field
either — so importance is DEGREE-ONLY, read from nothing but the reference graph. CONSEQUENCE: an ADR's
out-degree is always 0 (its outgoing edges live in its body, not on the wire — ADR-0185 dec 3), so an ADR's
importance = its IN-degree only (how many assets point AT it). The `load_bearing`-weighted importance
enrichment is increment 6's job — do NOT read `load_bearing` here (it is not on the wire). Pin it in
`lov-importance-degree-over-references`.

THE PURE HEART — the `overviewConstellation` module (the clean red→green core, unit-testable without jsdom).
A new module `apps/studio/src/lib/overviewConstellation.ts` exporting the pure functions that are the leaf's
red→green heart (several `lov-` contracts assert them directly; they live in the ONE test file but import
from `../lib/overviewConstellation`):

- **`importanceOf(assets, docs)`** — the in+out DEGREE of each node over the `references[]` graph (reuse the
  `focusGraph.ts` `resolveRef` + reverse-index idiom); degree-only, `load_bearing` NOT read; an ADR's
  out-degree is 0 → its importance = its in-degree only.
- **size-tier bucketing** — maps importance into EXACTLY 3 size tiers, monotonic: the highest-importance
  nodes land in the top tier, the lowest in the base tier.
- **`lodBand(zoom) → 'far' | 'mid' | 'close'`** — maps a zoom level to one of exactly three LOD bands at
  settled thresholds, monotonic in zoom (more zoom → a closer band, never a reversal).
- **`constellationLayout(assets, docs, seed) → Map<id, {x, y}>`** — assigns a position to EVERY corpus node
  (assets + docs), wrapping the pure, deterministic, cycle-tolerant `stressSeeds`
  (`apps/studio/src/lib/stressLayout.ts` — rank is a pure, deterministic, cycle-tolerant depth over the
  `references` DAG, foundation = 0; the EXACT rank is NOT asserted, only totality + determinism). The layout
  ENGINE is NOT the red-green surface — dagre is a viable fallback; the tests assert totality (a position for
  every node), determinism (two calls over the same corpus yield identical positions), and element-count,
  NEVER pixel coordinates.
- **`glowIds(query, assets, docs) → Set<string>`** — the ids that `searchCorpus(query, assets, docs)`
  returns (REUSE the existing matcher in `apps/studio/src/lib/librarySearch.ts`, `MIN_QUERY_LENGTH = 2`
  floor — a query shorter than 2 chars glows nothing).

None of these fetches — they read only the loaded `assets`/`docs`. This module is the leaf's red→green heart.

THE LOD LADDER — three bands, geometry not look (ADR-0185 dec 4). The dot field renders at three
levels-of-detail keyed off `lodBand(zoom)`:

- **FAR** — ONE SVG element per node, sized by its 3-tier importance bucket; a **circle** for an artifact and
  a **square** for an ADR; NO ambient labels (the perf/LOD contract — hold one-element-per-node so the whole
  corpus stays performant at the far zoom; the element count MUST equal the node count).
- **MID** — the top-importance-tier nodes carry a label, laid out per screen grid cell (so labels don't
  collide) — not every node, only the top tier per cell.
- **CLOSE** — two-line kind-in-node plaques, REUSING the increment-3 plaque idiom and `kindLabel` /
  `useArcDisplay()` (`apps/studio/src/lib/kindDisplay.ts` — the ONE place a kind KEY maps to its display
  text, ADR-0183 D1). Load-bearing: an `arc` node MUST render `kindLabel('arc', arcDisplay)` = the lowercase
  string **`"epic"`**, NEVER the raw key `"arc"` — a hand-rolled `category → label` map here would make the
  overview read "arc" while every other studio surface reads "Epic".

The band TRANSITIONS, the tier sizes, the plaque styling, and the palette are the operator-attested look —
assert the FAR element-count and the band function, NEVER the pixel geometry or the styling.

THE COMPONENT OWNS ITS OWN SEARCH INPUT — SEARCH-GLOW OPTION A (do NOT lift the finder's query). The
`<LibraryOverview>` component holds its OWN internal `query` `useState` and its OWN search input, plus its own
zoom/pan UI state — it does NOT lift the finder's byte-locked internal query (that would couple the two
surfaces and risk touching the finder's frozen tests). As the query changes, the component computes
`glowIds(query, assets, docs)` = the ids `searchCorpus` returns for the LIVE query, and marks each matched
node with a `data-glow` STATE attribute; non-matched nodes carry no `data-glow`; a query shorter than 2 chars
(`MIN_QUERY_LENGTH`) glows nothing. Assert the MARKER (`data-glow` present/absent), NEVER the pulse animation
— the glow pulse is the operator-attested look. Pin it in `lov-search-glow-matched-set-via-searchcorpus`.

NODE-CLICK LIFTS INTO THE SHARED SELECTION — FINDER PARITY. Clicking a node invokes an
`onSelect(result: SearchResult)` callback the component is handed as a PROP — seeding the SAME
`librarySelection` the finder/subgraph/dive share. The lifted result is built with finder parity: an artifact
node lifts `{ source: 'asset', category, … }` and an ADR node lifts `{ source: 'doc', category: 'adr', … }`
(source is the `'asset' | 'doc'` discriminant — an ADR is `source: 'doc'` but `category: 'adr'`, exactly the
inc-4 discriminant rule). Pin it in `lov-node-select-yields-searchresult-asset-and-doc`. Take `onSelect` as a
prop so the lift is deterministically drivable in jsdom — mirroring how the shell took `search`, the finder
took `assets`/`docs`/`selectedId`, the subgraph took `selection`/`onFocus`, and the dive took `selection` as
props.

THE EMPTY-STATE, WHOLE-CORPUS FIELD — NO FETCH (the inc-3 real-data crash-class guard). The overview is the
EMPTY-STATE view (no selection): it renders the WHOLE corpus as a dot field, reading ONLY the loaded
`assets`/`docs` already on the wire via `useAppData()` (taken as props). It must NEVER call `docContent()`,
`fetch`, or a socket — the constellation reads ids/titles/`references` already loaded; an ADR body is
increment 4's on-demand dive, not the overview's. This is the SAME data-boundary discipline whose real-data
crash the increment-3 staging walk caught (a crash the jsdom gate missed) — so the no-fetch invariant is
pinned here as `lov-empty-state-renders-constellation-no-fetch`.

APPEARANCE IS OPERATOR-ATTESTED, NOT ASSERTED (ADR-0185 dec 5/6 + ADR-0070). The overview follows the map's
forest-cozy palette (the world's CSS variables, as the shell / finder / subgraph / dive do), NOT
neutral-admin white and NEVER the black-terminal look. The dot field appearance, the 3-tier size sizing, the
band transitions (FAR↔MID↔CLOSE), the glow pulse, the plaque styling, the circle/square node shapes, and the
whole-corpus layout aesthetics are WITNESSED by the owner (UAT leg 5), never a machine visual verdict — do
NOT author a visual/colour/stroke/pixel/animation/layout assertion in this cap's tests (assert the DEGREE
scoring, the size TIERS, the LOD BAND function, the layout TOTALITY + determinism, the FAR ELEMENT-COUNT, the
glow MARKER, the select RESULT, and the no-fetch invariant — never their styling or coordinates). Surface the
STILL-UNSIGNED shell / finder / subgraph / dive look legs at the SAME attestation (trap l), rather than
letting them sit unsigned. Witness the look at `?overlay=library#/tree`.

OFFLINE-TESTABLE IN JSDOM (the `LibraryFinder.test.tsx` / `LibraryFocusGraph.test.tsx` /
`LibraryDiveBody.test.tsx` discipline). `@vitest-environment jsdom`, `@testing-library/react` for render /
`fireEvent` (type in the search input, click a node). No backend seam to mock (the overview holds no `api`
call — it takes `assets`/`docs`/`onSelect` as props and reuses `searchCorpus` over them); the pure
`overviewConstellation` tests need no jsdom at all but still live in the one test file (ADR-0122 coverage). No
real `fetch`, no `docContent`, no socket, no DB, no Electron. The component imports no agent/drive/model (the
`modelPathBoundary.test.ts` wall stays green).

## Integration test

**Goal —** Prove the overview constellation: the pure `overviewConstellation` module scores
`importanceOf(assets, docs)` as in+out reference DEGREE (degree-only — `load_bearing` not on the wire, an ADR
out-degree 0 → in-degree only), buckets importance into EXACTLY 3 monotonic size tiers, maps `lodBand(zoom)`
to `'far'|'mid'|'close'` at the thresholds monotonically, lays out EVERY corpus node deterministically via
`constellationLayout` (assert totality + repeat-equality, never pixels), and computes `glowIds` = the ids
`searchCorpus` returns (2-char floor); and the `<LibraryOverview>` component renders the FAR band as exactly
one SVG element per corpus node (circle for artifact / square for ADR), marks the live query's matches with
`data-glow`, lifts a node click into a finder-parity `SearchResult` via `onSelect`, and renders the whole
corpus as the empty state reading ONLY the loaded assets/docs — no fetch — entirely in jsdom, driven by props.

The integration test exercises this capability against its own composition (no backend seam) — the pure
degree/tier/band/layout/glow functions, the FAR-band render, the search-glow, and the node-select lift are
all real. It would:

1. Call `importanceOf(assets, docs)` directly with a small fixed corpus (a few `GuidanceAsset`s wired via
   `references` — including a hub and an `arc` — and a couple of `DocMeta` ADRs one of which is referenced by
   assets). Assert importance = in+out DEGREE over the reference graph (the `asset:`/`doc:` prefix stripped,
   the reverse index over `GuidanceAsset.references` for in-degree); assert `load_bearing` is NOT read (it is
   not on the wire — degree-only); assert the ADR's out-degree is 0 so its importance = its in-degree only.
2. Bucket the importance scores and assert they map into EXACTLY 3 size tiers, monotonically — the
   highest-importance node lands in the top tier, the lowest in the base tier.
3. Call `lodBand(zoom)` across a range of zoom levels and assert it returns `'far'|'mid'|'close'` at the
   settled thresholds, monotonic in zoom.
4. Call `constellationLayout(assets, docs, seed)` and assert it assigns a position to EVERY corpus node
   (assets + docs — totality); call it twice over the same corpus and assert identical positions
   (determinism) — asserting on totality + repeat-equality, NEVER pixel values.
5. Render `<LibraryOverview assets={…} docs={…} onSelect={spy} />` in jsdom at the FAR band. Assert the
   component renders exactly ONE SVG element per corpus node (element count === node count), a circle for an
   artifact and a square for an ADR (the LOD/perf contract, no ambient labels).
6. Type a query into the component's OWN search input. Assert the matched nodes (= the ids `searchCorpus`
   returns) carry `data-glow` and non-matched nodes do not; assert a query shorter than 2 chars glows
   nothing.
7. Click a node. Assert `onSelect` is invoked with a correct finder-parity `SearchResult` —
   `{ source: 'asset', category }` for an artifact and `{ source: 'doc', category: 'adr' }` for an ADR.
8. Assert no `docContent`/`fetch`/socket is called across the whole exercise (the overview reads only the
   loaded corpus — the inc-3-crash-class guard at the data boundary).

## Contracts (8)

The test-proven leaf behaviours — each **one isolated automated test** in the `studio` suite (vitest jsdom,
`apps/studio/src/components/LibraryOverview.test.tsx`; the pure-module contracts import the functions from
`../lib/overviewConstellation`). Per ADR-0122 (`storytree coverage`) each contract id is the lead of a
distinctly-named test, so the coverage check reports 8/8 against the ONE `real.testFile` — the pure-module
contracts live in THIS one file too, since coverage scans only `real.testFile`. None of these is an
APPEARANCE assertion — the look (the dot field, the tier sizes, the band transitions, the glow pulse, the
plaque styling, the forest-cozy palette) is the story's operator-attested UAT leg 5 (ADR-0070).

1. **`lov-importance-degree-over-references`** — `importanceOf` scores in+out reference DEGREE; `load_bearing` not read (degree-only); an ADR out-degree 0 → in-degree only
   - **asserts —** `importanceOf(assets, docs)` scores each node's importance as its in+out DEGREE over the
     client-side `references[]` graph (reuse the `focusGraph.ts` `resolveRef` prefix-strip + reverse-index
     idiom for in-degree); `load_bearing` is NOT read (it is not on the wire this increment — neither
     `GuidanceAsset` nor `DocMeta` carries it, so importance is degree-only); and an ADR's out-degree is 0
     (`DocMeta` carries no `references`) so its importance = its IN-degree only (how many assets point at it).
   - **covers —** `apps/studio/src/lib/overviewConstellation.ts` (the degree-based `importanceOf` over the reference graph + the reverse index)
   - **proven by —** `apps/studio/src/components/LibraryOverview.test.tsx` (net-new, vitest; imports `importanceOf`).
2. **`lov-size-tier-buckets-by-importance`** — importance maps into EXACTLY 3 size tiers, monotonic
   - **asserts —** the importance scores bucket into EXACTLY 3 size tiers, monotonically — the
     highest-importance node lands in the top tier and the lowest in the base tier (no tier inversion).
   - **covers —** `apps/studio/src/lib/overviewConstellation.ts` (the importance → 3-tier size bucketing)
   - **proven by —** `apps/studio/src/components/LibraryOverview.test.tsx`.
3. **`lov-lod-band-by-zoom`** — `lodBand(zoom)` returns `'far'|'mid'|'close'` at the thresholds, monotonic in zoom
   - **asserts —** `lodBand(zoom)` returns one of `'far'|'mid'|'close'` at the settled thresholds, monotonic
     in zoom (more zoom → a closer band, never a reversal). Pure, no jsdom.
   - **covers —** `apps/studio/src/lib/overviewConstellation.ts` (the zoom → LOD band ladder)
   - **proven by —** `apps/studio/src/components/LibraryOverview.test.tsx`.
4. **`lov-layout-total-and-deterministic`** — `constellationLayout` positions EVERY corpus node; two calls yield identical positions
   - **asserts —** `constellationLayout(assets, docs, seed)` assigns a position to EVERY corpus node (assets
     + docs — totality), and two calls over the same corpus yield identical positions (determinism) — asserted
     on TOTALITY + repeat-equality, NEVER pixel values (the layout engine wraps the pure, cycle-tolerant
     `stressSeeds`; the engine is not the red-green surface).
   - **covers —** `apps/studio/src/lib/overviewConstellation.ts` (the whole-corpus `constellationLayout` wrapping `stressSeeds`)
   - **proven by —** `apps/studio/src/components/LibraryOverview.test.tsx`.
5. **`lov-far-band-one-element-per-node`** — at FAR the component renders exactly ONE SVG element per corpus node; circle for artifact / square for ADR
   - **asserts —** rendering `<LibraryOverview>` at the FAR band, the component renders exactly ONE SVG
     element per corpus node (element count === node count), a circle for an artifact and a square for an ADR
     — the LOD/perf contract that holds one-element-per-node with no ambient labels (trap h).
   - **covers —** `apps/studio/src/components/LibraryOverview.tsx` (the FAR-band one-element-per-node dot field, circle/square by kind)
   - **proven by —** `apps/studio/src/components/LibraryOverview.test.tsx`.
6. **`lov-search-glow-matched-set-via-searchcorpus`** — the glow set = the ids `searchCorpus` returns for the live query; matched nodes carry `data-glow`, a <2-char query glows nothing
   - **asserts —** typing a query into the component's OWN search input, the glow set = the ids
     `searchCorpus(query, assets, docs)` returns; matched nodes carry the `data-glow` STATE marker and
     non-matched nodes do NOT; a query shorter than 2 chars (`MIN_QUERY_LENGTH`) glows nothing. The assertion
     is on the MARKER, never the pulse animation (the pulse is the operator-attested look).
   - **covers —** `apps/studio/src/components/LibraryOverview.tsx` (the internal search input + `glowIds` → `data-glow` marking) + `apps/studio/src/lib/overviewConstellation.ts` (the `glowIds` = `searchCorpus` set)
   - **proven by —** `apps/studio/src/components/LibraryOverview.test.tsx`.
7. **`lov-node-select-yields-searchresult-asset-and-doc`** — clicking a node invokes `onSelect` with a finder-parity `SearchResult` (`{source:'asset',category}` for an artifact, `{source:'doc',category:'adr'}` for an ADR)
   - **asserts —** clicking a node invokes the `onSelect` callback with a correct `SearchResult` — an
     artifact lifts `{ source: 'asset', category }` and an ADR lifts `{ source: 'doc', category: 'adr' }`
     (source is the `'asset' | 'doc'` discriminant — an ADR is `source: 'doc'` but `category: 'adr'`) —
     seeding the SHARED `librarySelection` with finder parity.
   - **covers —** `apps/studio/src/components/LibraryOverview.tsx` (the node-click → finder-parity `onSelect(SearchResult)` lift)
   - **proven by —** `apps/studio/src/components/LibraryOverview.test.tsx`.
8. **`lov-empty-state-renders-constellation-no-fetch`** — the component renders the whole-corpus constellation as the empty state, reading ONLY the loaded assets/docs; no `docContent`/fetch/socket
   - **asserts —** the component renders the whole-corpus constellation as the empty state, reading ONLY the
     loaded `assets`/`docs` (ids/titles/`references` already on the wire) — no `docContent`, no `fetch`, no
     socket is called (the inc-3 real-data crash-class guard at the data boundary; ADR bodies are increment
     4's on-demand dive).
   - **covers —** `apps/studio/src/components/LibraryOverview.tsx` (the empty-state whole-corpus render, loaded-corpus-only, no-fetch invariant)
   - **proven by —** `apps/studio/src/components/LibraryOverview.test.tsx`.

## Guidance — the net-new slice that earns the signed verdict

The bootstrap rung toward `healthy` (ADR-0057 §3, NET-NEW): author the overview constellation as a new pure
degree/tier/band/layout/glow module + a new SVG dot-field render component, test-first.

- **The new test —** `apps/studio/src/components/LibraryOverview.test.tsx` (`@vitest-environment jsdom`,
  vitest + `@testing-library/react` — the studio package convention, the `LibraryFinder.test.tsx` /
  `LibraryFocusGraph.test.tsx` / `LibraryDiveBody.test.tsx` shape; NO real `fetch`/`docContent`/socket/DB/
  Electron). Import the pure functions (`importanceOf`, `lodBand`, `constellationLayout`, `glowIds`, and the
  tier bucketer) from `"../lib/overviewConstellation"` and `{ LibraryOverview }` from `"./LibraryOverview"`.
  Name each test for its contract id (`lov-…`) so `storytree coverage library-overview` reports 8/8
  (ADR-0122) — the pure-module contracts (1–4, 6) live in THIS one file too, since coverage scans only
  `real.testFile`.
- **The RED the spine observes (before IMPLEMENT) —** the imports resolve NOTHING — neither
  `apps/studio/src/lib/overviewConstellation.ts` nor `apps/studio/src/components/LibraryOverview.tsx` exists
  at HEAD, so the test fails module-not-found (the net-new missing-symbol red, ADR-0057).
- **The GREEN —** write the two modules. `apps/studio/src/lib/overviewConstellation.ts`: the pure
  `importanceOf(assets, docs)` (in+out reference DEGREE, reusing the `focusGraph.ts` `resolveRef` +
  reverse-index idiom; `load_bearing` NOT read — degree-only; ADR out-degree 0), a 3-tier size bucketer
  (monotonic), `lodBand(zoom) → 'far'|'mid'|'close'` (monotonic in zoom),
  `constellationLayout(assets, docs, seed) → Map<id, {x, y}>` (total over the whole corpus + deterministic,
  wrapping the pure/cycle-tolerant `stressSeeds`), and `glowIds(query, assets, docs)` (= the `searchCorpus`
  match set, 2-char floor) — all pure, no fetch/DOM/context. `apps/studio/src/components/LibraryOverview.tsx`:
  an SVG dot-field render layer taking `{ assets, docs, onSelect }` as PROPS and holding its OWN internal
  `query` + zoom/pan state, calling the pure module, rendering the empty-state constellation — FAR one SVG
  element per node (circle=artifact / square=ADR, sized by tier, no ambient labels), MID top-tier labels per
  grid cell, CLOSE two-line kind-in-node plaques (reuse the inc-3 plaque idiom + `kindLabel` / `useArcDisplay`,
  an `arc` reads "epic"), marking matched nodes with `data-glow`, and on a node click invoking
  `onSelect(toSearchResult(node))` with finder parity. MOUNTING it into TreeView's empty-state `peekSlot`
  composition (the conditional mount when there is no selection) and the forest-cozy appearance are witnessed
  under the story's UAT leg 5 (operator-attested, ADR-0070), NOT asserted in CI and NOT in this `real:` scope.
  After it, the imports resolve, the assertions hold, and `pnpm --filter studio test` +
  `pnpm --filter studio typecheck` stay green.

Rules:

- **Importance is DEGREE over `references`, degree-only this increment** — `importanceOf` = the in+out degree
  over the reference graph (reuse the `focusGraph.ts` `resolveRef` + reverse-index idiom); `load_bearing` is
  NOT on the wire (do NOT read it — the enrichment is increment 6); an ADR's out-degree is 0 so its
  importance = its in-degree only (`lov-importance-degree-over-references`).
- **Three size tiers, monotonic** — importance buckets into EXACTLY 3 size tiers, highest → top / lowest →
  base (`lov-size-tier-buckets-by-importance`).
- **Three LOD bands, monotonic in zoom** — `lodBand(zoom)` returns `'far'|'mid'|'close'` at the settled
  thresholds (`lov-lod-band-by-zoom`). FAR = one element per node; MID = top-tier labels per grid cell;
  CLOSE = two-line plaques.
- **Layout is total + deterministic, engine is not the red-green surface** — `constellationLayout` positions
  EVERY corpus node and repeats identically; assert totality + repeat-equality, NEVER pixels (wrap the pure,
  cycle-tolerant `stressSeeds`; dagre is a viable fallback) (`lov-layout-total-and-deterministic`).
- **FAR renders one SVG element per node** — element count === node count, circle for artifact / square for
  ADR, no ambient labels — the perf/LOD contract (`lov-far-band-one-element-per-node`, trap h).
- **Kind is text via `kindLabel`, never a hand-rolled map** — the CLOSE plaque kind line is
  `kindLabel(category, arcDisplay)` so an `arc` reads "epic" like every other surface (reuse the inc-3
  plaque idiom + `useArcDisplay()`).
- **The component owns its own search input — search-glow Option A** — the overview holds its OWN internal
  `query` state + search input (do NOT lift the finder's byte-locked query); the glow set = the ids
  `searchCorpus` returns; matched nodes carry `data-glow`, a <2-char query glows nothing; assert the MARKER,
  never the pulse (`lov-search-glow-matched-set-via-searchcorpus`).
- **Node-click lifts a finder-parity `SearchResult` into the shared selection** — an artifact lifts
  `{ source: 'asset', category }` and an ADR lifts `{ source: 'doc', category: 'adr' }` via `onSelect`
  (`lov-node-select-yields-searchresult-asset-and-doc`).
- **No fetch beyond the loaded corpus** — the empty-state field reads only the loaded `assets`/`docs`; no
  `docContent`/fetch/socket (`lov-empty-state-renders-constellation-no-fetch`, the inc-3-crash-class guard).
- **Appearance is operator-attested, not asserted here** (ADR-0070) — prove the degree scoring, the size
  tiers, the LOD band function, the layout totality + determinism, the FAR element-count, the glow MARKER, the
  select RESULT, and the no-fetch invariant; the dot field look, the tier sizes, the band transitions, the
  glow pulse, the plaque styling, and the forest-cozy palette are the story's UAT leg 5 (surface the
  still-unsigned shell/finder/subgraph/dive look legs at the same attestation — trap l). Do NOT author a
  visual/colour/stroke/pixel/animation assertion, and do NOT edit `TreeView.tsx` or `LibraryDrawer.tsx` in the
  `real:` scope (the peekSlot conditional mount is the orchestrator's supplement glue after PASS; the overview
  is proven in isolation, driven by props — trap k). `LibraryDrawer.test.tsx` (`lds-*`/`ldw-*`),
  `LibraryFinder.test.tsx` (`lf-*`), `LibraryFocusGraph.test.tsx` (`lfg-*`), and `LibraryDiveBody.test.tsx`
  (`ldb-*`) must all stay green.
