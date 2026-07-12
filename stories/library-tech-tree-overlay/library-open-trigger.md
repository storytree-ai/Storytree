---
id: "library-open-trigger"
tier: capability
story: library-tech-tree-overlay
title: "Double-clicking a node on either node surface (the overview constellation or the focus subgraph) fires onOpen with the node's finder-parity SearchResult — additive to the signed single-click onSelect, which stays byte-green"
outcome: "Double-clicking a node OPENS it (ADR-0187 dec 2): on the overview constellation and on the focus subgraph, a `fireEvent.doubleClick` on a node invokes an optional `onOpen(result)` prop with the node's finder-parity `SearchResult` (`{source:'asset',category}` for an artifact / `{source:'doc',category:'adr'}` for an ADR). The edits are ADDITIVE to the signed components — an optional `onOpen?` prop + an `onDoubleClick` handler per node — so the existing single-click `onSelect` contracts (`lov-*` / `lfg-*`) stay byte-green. The double-click-opens behaviour on both surfaces is machine-witnessed; the surfaces' appearance stays the incs-3/5 operator-attested legs."
status: proposed
proof_mode: integration-test
depends_on: [library-overview, library-dag-canvas]
decisions: [187, 185, 70, 23]
# Node-borne proof config (ADR-0057 keystone). BROWNFIELD (editsExisting: true): ADDITIVE edits to the two
# SIGNED node surfaces (LibraryOverview.tsx — the overview constellation, `lov-*`; LibraryFocusGraph.tsx — the
# focus subgraph, `lfg-*`). Each gains an OPTIONAL `onOpen?: (r: SearchResult) => void` prop + an
# `onDoubleClick` handler per node; the existing single-click `onSelect`/`onFocus` path is UNTOUCHED, so
# `lov-*` and `lfg-*` stay byte-green — do NOT rename or disturb their test titles. real.sourceFile picks ONE
# representative (LibraryOverview.tsx); real.scope.sourceGlobs names BOTH edited components (the multi-sourceGlob
# precedent from library-overview.md — ADR-0122 one-real.testFile discipline). real.testFile = a NET-NEW
# LibraryOpenTrigger.test.tsx that imports BOTH components and drives `fireEvent.doubleClick` on a node in each.
# The RED the spine observes is a FAILING-ASSERTION red (the sources exist — NOT module-not-found): at HEAD
# neither component has an `onOpen` prop nor an `onDoubleClick` handler, so the double-click test fails.
# FRONTEND-BUILDER TWO-STAGE (ADR-0070): this `real:` arm proves the TRIGGER BEHAVIOUR ONLY — a double-click on
# a node fires `onOpen` with the node's finder-parity `SearchResult`. The surfaces' APPEARANCE stays the incs-3
# (`lfg`) / 5 (`lov`) operator-attested legs; the TreeView wiring of `onOpen={setOpenSelection}` on both
# surfaces is the orchestrator's supplement glue after PASS (plan §G). Do NOT add a visual assertion here, do
# NOT edit TreeView.tsx in this `real:` scope, and do NOT touch the signed `lov-*`/`lfg-*` single-click tests.
#
# CRITICAL — apps/studio is VITEST + jsdom (@testing-library/react), NOT node:test (apps/studio/vitest.config.ts,
# include src/**/*.test.{ts,tsx}). The default `node --test` real proof cannot run a `.test.tsx`. So this
# cap declares a `real.proofCommand` running the ONE test file under vitest (cwd = apps/studio).
# install: true (fresh-worktree tsx + tsc + vitest, ADR-0031 §2) + a typecheck wall. SCOPE = apps/studio/src.
# COVERAGE (ADR-0122): `storytree coverage` scans ONLY real.testFile, so BOTH `lot-`-named contract tests live
# in LibraryOpenTrigger.test.tsx. Each TITLE must carry its unique `lot-` id or coverage silently drops
# coverage (`sdk-leaf-drops-contract-id-test-names` — the fix if it happens is TEST-TITLE-ONLY).
proof:
  command:
    file: pnpm
    args: ["--filter", "studio", "test"]
  scope:
    testGlobs: ["apps/studio/src/**/*.test.tsx", "apps/studio/src/**/*.test.ts"]
    sourceGlobs: ["apps/studio/src/**/*.ts", "apps/studio/src/**/*.tsx"]
  real:
    testFile: "apps/studio/src/components/LibraryOpenTrigger.test.tsx"
    sourceFile: "apps/studio/src/components/LibraryOverview.tsx"
    editsExisting: true
    scope:
      testGlobs: ["apps/studio/src/components/LibraryOpenTrigger.test.tsx"]
      sourceGlobs:
        - "apps/studio/src/components/LibraryOverview.tsx"
        - "apps/studio/src/components/LibraryFocusGraph.tsx"
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
        - "src/components/LibraryOpenTrigger.test.tsx"
---

# The double-click Open trigger — opening a node from either node surface

**Outcome —** Double-clicking a node OPENS it (ADR-0187 dec 2). On the overview constellation
(`LibraryOverview`) and on the focus subgraph (`LibraryFocusGraph`), a `fireEvent.doubleClick` on a node
invokes an optional `onOpen(result)` prop with the node's finder-parity `SearchResult` —
`{ source: 'asset', category }` for an artifact and `{ source: 'doc', category: 'adr' }` for an ADR. The edits
are ADDITIVE to the signed components (an optional `onOpen?` prop + an `onDoubleClick` handler per node), so
the existing single-click `onSelect`/`onFocus` contracts (`lov-*` / `lfg-*`) stay byte-green. The
double-click-opens behaviour on both surfaces is machine-witnessed; the surfaces' appearance stays the incs-3
(`lfg`) / 5 (`lov`) operator-attested legs.

**Depends on —** [`library-overview`](library-overview.md) and
[`library-dag-canvas`](library-dag-canvas.md). This capability ADDS the double-click Open trigger to
BOTH landed node surfaces — it edits `LibraryOverview.tsx` (the overview constellation, inc 5) and
`LibraryFocusGraph.tsx` (the focus DAG canvas — reworked from the inc-3 focus subgraph, the source file keeps
its name), so it needs both delivered surfaces (their nodes, their finder-parity result shape) as its
precondition. Both are genuine within-story code edges — this cap edits both components — so
`depends_on: [library-overview, library-dag-canvas]`. It holds no backend seam — the
double-click reads only the node already rendered from the loaded corpus and lifts a `SearchResult`, so it is
deterministically drivable in jsdom.

> **Proof status (honest) — `proposed`, BROWNFIELD (editsExisting).** Both `LibraryOverview.tsx` and
> `LibraryFocusGraph.tsx` EXIST and are green at HEAD on their single-click `onSelect`/`onFocus` path (verified
> 2026-07-12 — neither has an `onOpen` prop nor an `onDoubleClick` handler). This capability adds the
> double-click trigger: a NET-NEW vitest jsdom test (`LibraryOpenTrigger.test.tsx`) imports BOTH components and
> drives `fireEvent.doubleClick` on a node in each, asserting `onOpen` fires with the finder-parity
> `SearchResult`, RED at HEAD as a FAILING-ASSERTION red (the trigger is absent, NOT module-not-found), GREEN
> once the additive edits land. Its TRIGGER BEHAVIOUR is machine-witnessed; the surfaces' appearance stays the
> incs-3/5 operator-attested legs. Status stays `proposed` — `healthy` is only ever DERIVED from signed
> verdicts (ADR-0020), never authored.

## Guidance

WHY THIS IS A CAPABILITY, NOT A CONTRACT: its honest proof is the DOUBLE-CLICK OPEN TRIGGER AS A WHOLE — an
additive behaviour on BOTH node surfaces (the overview constellation and the focus subgraph) that lifts a
node's finder-parity `SearchResult` via a new `onOpen` prop on a double-click — spanning both surfaces'
node-double-click handlers, exercised in jsdom against both components. It is the node-driven half of the Open
trigger ADR-0187 dec 2 introduces (the button-driven half is the permanent lens's bottom section,
`library-permanent-lens`); the Open overlay it feeds is `library-open-overlay`'s job, and the TreeView wiring
is the glue's.

ADDITIVE TO THE SIGNED SURFACES — the single-click path is UNTOUCHED (byte-green `lov-*`/`lfg-*`). The edits
are purely additive: each component gains an OPTIONAL `onOpen?: (r: SearchResult) => void` prop and an
`onDoubleClick` handler on each node element (`LibraryOverview`'s node `<g>` at the `library-overview-node-*`
testid, `LibraryFocusGraph`'s node `<div>` at the `lfg-node-*` testid). The existing single-click `onSelect`
(overview) / `onFocus`+`onSelect` (subgraph) path is NOT changed — so the signed `lov-*` (overview) and
`lfg-*` (subgraph) single-click contracts stay byte-green. Do NOT rename or disturb their test titles, and do
NOT change the single-click semantics. A double-click ALSO firing the existing single-click select is
ACCEPTABLE and NOT asserted here (jsdom's `doubleClick` fires the click handlers too; the `lot-` contracts
assert only that `onOpen` fires with the right result).

FINDER-PARITY `SearchResult` — the SAME discriminant the single-click uses. The lifted `onOpen` result is
built with finder parity — an artifact node lifts `{ source: 'asset', category }` and an ADR node lifts
`{ source: 'doc', category: 'adr' }` (source is the `'asset' | 'doc'` discriminant; an ADR is `source: 'doc'`
but `category: 'adr'`). This is the SAME discriminant `lov-node-select-yields-searchresult-asset-and-doc`
(overview) and the subgraph's `toSearchResult` already use — the double-click lifts the identical shape the
single-click does, just through `onOpen` instead of `onSelect`/`onFocus`. On the overview each node is ALREADY
a `SearchResult` (`onClick={() => onSelect(node)}`), so `onDoubleClick={() => onOpen?.(node)}` lifts it
directly; on the subgraph the node is a `FocusNode` mapped via the existing `toSearchResult(node)` helper, so
`onDoubleClick={() => onOpen?.(toSearchResult(node))}` lifts the parity result. Pin the two surfaces in
`lot-overview-dblclick-opens` and `lot-subgraph-dblclick-opens`.

REUSE THE EXISTING `SearchResult` — DEFINE NO NEW TYPE (the inc-7 fence). `onOpen` uses the EXISTING
`SearchResult` type from `../lib/librarySearch` (the same shape both surfaces already lift). Do NOT define a
new type and do NOT touch `apps/studio/src/lib/types.ts` or `apps/studio/server/**` — that is the inc-7 / inc-6
lane, file-disjoint (plan §Lanes FENCE).

APPEARANCE STAYS THE INCS-3/5 OPERATOR-ATTESTED LEGS (ADR-0070). This cap adds NO new appearance — the
overview's and subgraph's look are the incs-5 (`lov`) / 3 (`lfg`) operator-attested legs; the double-click
trigger is invisible behaviour. Do NOT author a visual/colour/pixel/animation assertion in this cap's tests
(assert only that the double-click fires `onOpen` with the finder-parity result). The wiring of
`onOpen={setOpenSelection}` on both surfaces in `TreeView.tsx` is the orchestrator's supplement glue after PASS
(plan §G) — do NOT edit `TreeView.tsx` in this `real:` scope.

OFFLINE-TESTABLE IN JSDOM (the `LibraryOverview.test.tsx` / `LibraryFocusGraph.test.tsx` discipline).
`@vitest-environment jsdom`, `@testing-library/react` for render / `fireEvent.doubleClick`. No backend seam to
mock — both surfaces take `assets`/`docs` (+ `onSelect`/`onFocus`/`onOpen`) as props and render from the loaded
corpus; the double-click reads only the rendered node. No real `fetch`, no `docContent`, no socket, no DB, no
Electron. The components import no agent/drive/model (the `modelPathBoundary.test.ts` wall stays green).

## Integration test

**Goal —** Prove the double-click Open trigger on both node surfaces: `fireEvent.doubleClick` on a node in
`LibraryOverview` invokes `onOpen` with the node's finder-parity `SearchResult`; and the same on a node in
`LibraryFocusGraph` invokes `onOpen` with the node's finder-parity `SearchResult` — entirely in jsdom, driven
by props, with the single-click `onSelect`/`onFocus` path untouched.

The integration test exercises this capability against both signed surfaces — the additive `onOpen` prop + the
`onDoubleClick` handler on each. It would:

1. Render `<LibraryOverview assets={…} docs={…} onSelect={vi.fn()} onOpen={spy} />` in jsdom over a small fixed
   corpus (an artifact node and an ADR node). `fireEvent.doubleClick` the artifact node and assert `onOpen` is
   invoked with `{ source: 'asset', category }`; `fireEvent.doubleClick` the ADR node and assert `onOpen` is
   invoked with `{ source: 'doc', category: 'adr' }` — the finder-parity `SearchResult` discriminant.
2. Render `<LibraryFocusGraph assets={…} docs={…} selection={centre} onFocus={vi.fn()} onOpen={spy} />` in
   jsdom with a centre selection whose neighbourhood includes an artifact and/or an ADR node.
   `fireEvent.doubleClick` a node and assert `onOpen` is invoked with that node's finder-parity `SearchResult`
   (via the existing `toSearchResult` shape).

## Contracts (2)

The test-proven leaf behaviours — each **one isolated automated test** in the `studio` suite (vitest jsdom,
`apps/studio/src/components/LibraryOpenTrigger.test.tsx`). Per ADR-0122 (`storytree coverage`) each contract id
is the lead of a distinctly-named test, so the coverage check reports 2/2 against the ONE `real.testFile`.
Neither is an APPEARANCE assertion — the surfaces' look stays the incs-3/5 operator-attested legs (ADR-0070).

1. **`lot-overview-dblclick-opens`** — double-clicking a node in the overview constellation fires onOpen with the node's finder-parity SearchResult
   - **asserts —** `fireEvent.doubleClick` on a node in `<LibraryOverview>` invokes the optional `onOpen` prop
     with the node's finder-parity `SearchResult` — `{ source: 'asset', category }` for an artifact and
     `{ source: 'doc', category: 'adr' }` for an ADR (the SAME discriminant
     `lov-node-select-yields-searchresult-asset-and-doc` uses). The single-click `onSelect` path is untouched
     (`lov-*` stays byte-green).
   - **covers —** `apps/studio/src/components/LibraryOverview.tsx` (the additive `onOpen?` prop + the per-node `onDoubleClick` handler)
   - **proven by —** `apps/studio/src/components/LibraryOpenTrigger.test.tsx` (net-new, vitest jsdom).
2. **`lot-subgraph-dblclick-opens`** — double-clicking a node in the focus subgraph fires onOpen with the node's finder-parity SearchResult
   - **asserts —** `fireEvent.doubleClick` on a node in `<LibraryFocusGraph>` invokes the optional `onOpen`
     prop with the node's finder-parity `SearchResult` (via the existing `toSearchResult(node)` shape —
     `{ source, category, id, title }`). The single-click `onFocus`/`onSelect` path is untouched (`lfg-*` stays
     byte-green).
   - **covers —** `apps/studio/src/components/LibraryFocusGraph.tsx` (the additive `onOpen?` prop + the per-node `onDoubleClick` handler)
   - **proven by —** `apps/studio/src/components/LibraryOpenTrigger.test.tsx`.

## Guidance — the brownfield slice that earns the signed verdict

The rung toward `healthy` (ADR-0057 §3, BROWNFIELD editsExisting): add the double-click Open trigger to both
signed node surfaces, test-first.

- **The new test —** `apps/studio/src/components/LibraryOpenTrigger.test.tsx` (`@vitest-environment jsdom`,
  vitest + `@testing-library/react` — the studio package convention, the `LibraryOverview.test.tsx` /
  `LibraryFocusGraph.test.tsx` shape; NO real `fetch`/`docContent`/socket/DB/Electron). Import
  `{ LibraryOverview }` from `"./LibraryOverview"` and `{ LibraryFocusGraph }` from `"./LibraryFocusGraph"`,
  and `import type { SearchResult } from "../lib/librarySearch"` for the assertions — define NO new type. Name
  each test for its contract id (`lot-…`) so `storytree coverage library-open-trigger` reports 2/2 (ADR-0122).
- **The RED the spine observes (before IMPLEMENT) —** a FAILING-ASSERTION red (NOT module-not-found — both
  sources exist): at HEAD neither component has an `onOpen` prop nor an `onDoubleClick` handler, so the
  double-click test's `onOpen` spy is never called (and, if `onOpen` is passed as an unknown prop, a type
  error). This is the brownfield red the spine observes against the single-click-only sources at HEAD (ADR-0057).
- **The GREEN —** add to each component an OPTIONAL `onOpen?: (r: SearchResult) => void` prop and an
  `onDoubleClick` handler on each node element: `LibraryOverview` — `onDoubleClick={() => onOpen?.(node)}` on
  the node `<g>` (the node is already a `SearchResult`); `LibraryFocusGraph` —
  `onDoubleClick={() => onOpen?.(toSearchResult(node))}` on the node `<div>` (reuse the existing
  `toSearchResult` helper). Leave the single-click `onSelect`/`onFocus` path untouched. WIRING
  `onOpen={setOpenSelection}` on both surfaces in `TreeView.tsx` is the orchestrator's supplement glue after
  PASS (plan §G), NOT this leaf's scope. After it, the double-click test's assertions hold, the signed
  `lov-*`/`lfg-*` single-click tests stay green, and `pnpm --filter studio test` +
  `pnpm --filter studio typecheck` stay green.

Rules:

- **Additive only — the single-click path stays byte-green** — add an optional `onOpen?` prop + a per-node
  `onDoubleClick`; do NOT change `onSelect`/`onFocus` semantics or rename/disturb the signed `lov-*`/`lfg-*`
  test titles (`lot-overview-dblclick-opens`, `lot-subgraph-dblclick-opens`).
- **Finder-parity `SearchResult`** — the `onOpen` result is `{ source:'asset', category }` for an artifact /
  `{ source:'doc', category:'adr' }` for an ADR (the same discriminant the single-click lifts) — overview lifts
  the node directly, subgraph via the existing `toSearchResult`.
- **A double-click also firing single-click select is acceptable and NOT asserted** — the `lot-` contracts
  assert only that `onOpen` fires with the right result.
- **Reuse the existing `SearchResult`, touch no `types.ts`/`server`** (inc-7 fence) — `onOpen` uses
  `SearchResult` from `../lib/librarySearch`; define no new type.
- **Appearance stays the incs-3/5 operator-attested legs** (ADR-0070) — prove only the double-click→`onOpen`
  behaviour; do NOT author a visual assertion, and do NOT edit `TreeView.tsx` in the `real:` scope (the
  `onOpen` wiring is the orchestrator's supplement glue after PASS — plan §G).
- **Every `lot-` contract test TITLE carries its unique id** or `storytree coverage` silently drops coverage
  (`sdk-leaf-drops-contract-id-test-names` — the fix if it happens is TEST-TITLE-ONLY, never an
  assertion/source edit).
