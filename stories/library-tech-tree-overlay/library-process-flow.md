---
id: "library-process-flow"
tier: capability
story: library-tech-tree-overlay
title: "A process node's authored branchEdges become DOWNSTREAM flow edges in the focus DAG: each target joins the one-level downstream frontier as a node, each edge carries its authored label, branch edges are kind-tagged apart from reference edges, and a process carrying no branchEdges contributes none"
outcome: "buildFocusGraph walks a `process` asset's `branchEdges` (the typed-edge field library-typed-edges already surfaces onto the GuidanceAsset wire) as SUCCESSOR edges: each branch target joins the one-level DOWNSTREAM frontier as a real FocusNode, the FocusEdge it produces carries the authored `label` and a `kind: 'branch'` tag that distinguishes it from an ordinary reference edge, and a process with no branchEdges contributes no branch edges at all (absent, never an empty-array artifact). The station flow of `software-factory-line` becomes navigable in the canvas by the existing click-through re-centre — no new navigation affordance. Geometry and behaviour machine-witnessed here; the DRAWN label and any branch-edge styling are the story's operator-attested look leg."
status: proposed
proof_mode: integration-test
depends_on: [library-dag-canvas]
decisions: [266, 193, 188, 185, 70, 122, 161, 154]
# Node-borne proof config (ADR-0057 keystone): authoring THIS block is what makes the capability
# inner-loop buildable — no NODE_BUILD_REGISTRY edit. EDITS-EXISTING (editsExisting: true): the
# `buildFocusGraph` heart ALREADY exists in apps/studio/src/lib/focusGraph.ts and walks `references[]`
# BOTH ways; `branchEdges` ALREADY rides the wire (packages/library/src/store/render-doc.ts →
# apps/studio/server/libraryBackend.ts → apps/studio/src/types.ts `GuidanceAsset.branchEdges?`,
# signed by library-typed-edges in commit 3c69dd21). The leaf ADDS a third neighbour source feeding
# the DOWNSTREAM frontier plus the label/kind on FocusEdge. NOTHING new is fetched.
#
# DIRECTION IS THE DESIGN POINT — state it in the spec body. `branchEdges` are the node's OWN field,
# like `references`, but they are NOT a "stands on" edge: ADR-0154/0161 define them as "the artifact
# this process HANDS ON TO". Feeding them through `referencesOf` would rank the targets UPSTREAM
# (left), rendering `software-factory-line` as STANDING ON the merge ceremony and inverting the
# flow the map exists to show. They must join the DOWNSTREAM frontier so the flow reads left→right,
# centre → stations. This is the one call the leaf must not get backwards.
#
# THE RED IS A RUNTIME WITNESS, NOT A TYPE CHANGE (this cap's specific trap — see
# `asset:type-only-red-needs-runtime-witness`, a station-3 ceremony). Adding `label`/`kind` to the
# FocusEdge INTERFACE produces NO runtime failure: vitest runs through esbuild/tsx which strips types
# without checking them. The legitimate observed red is the ABSENCE OF A RETURNED VALUE at run time —
# a fixture `process` asset carrying branchEdges to two in-corpus targets, passed as `centre`, returns
# a `FocusGraphResult` whose `edges` contain NO entry for those targets and whose `nodes` omit them
# entirely at HEAD (buildFocusGraph reads only `asset.references`). Author every assertion as a VALUE
# check over the returned object — `assert` on edges/nodes contents — never as a type assertion.
#
# CRITICAL — apps/studio is VITEST + jsdom, NOT node:test (apps/studio/vitest.config.ts includes
# src/**/*.test.{ts,tsx}). The default `node --import tsx --test` real proof cannot run this file, so
# a vitest `real.proofCommand` is declared and the leaf must import { describe, it, expect } from
# 'vitest'. Confirm with `storytree node resolve library-process-flow` ("real proof: …vitest run…")
# BEFORE the paid --real. install: true (fresh-worktree tsx + tsc + vitest, ADR-0031 §2) + typecheck wall.
#
# COVERAGE (ADR-0122 / ADR-0126): `storytree coverage` scans ONLY real.testFile, and matches on the
# test TITLE. Every lpf- contract test MUST lead its title with its exact contract id or coverage
# silently reports N-1/N past the signed green (this arc's recurring class). The fix if it happens is
# a TEST-TITLE-ONLY rename, never an assertion or source edit, and only after reading each test to
# confirm the assertion is genuine — renaming a hollow test under the right name is reward-hacking.
#
# SCOPE IS THE PURE HEART ONLY. The DRAWN label and any branch-edge stroke treatment in
# LibraryFocusGraph.tsx are the orchestrator's supplement glue after PASS and the story's
# operator-attested look leg (ADR-0070 stage 2) — do NOT author a visual/colour/stroke/pixel
# assertion here, and do NOT edit LibraryFocusGraph.tsx or the CSS in this real: scope.
proof:
  command:
    file: pnpm
    args: ["--filter", "studio", "test"]
  scope:
    testGlobs: ["apps/studio/src/**/*.test.ts", "apps/studio/src/**/*.test.tsx"]
    sourceGlobs: ["apps/studio/src/**/*.ts", "apps/studio/src/**/*.tsx"]
  real:
    testFile: "apps/studio/src/lib/processFlowEdges.test.ts"
    sourceFile: "apps/studio/src/lib/focusGraph.ts"
    editsExisting: true
    scope:
      testGlobs: ["apps/studio/src/lib/processFlowEdges.test.ts"]
      sourceGlobs:
        - "apps/studio/src/lib/focusGraph.ts"
    install: true
    typecheck:
      file: pnpm
      args: ["--filter", "studio", "typecheck"]
    proofCommand:
      file: pnpm
      args:
        - "--filter"
        - "studio"
        - "exec"
        - "vitest"
        - "run"
        - "src/lib/processFlowEdges.test.ts"
---

# A process node's branch edges are the flow

**Outcome —** `buildFocusGraph` walks a `process` asset's authored `branchEdges` as **successor**
edges, so the station flow recorded in `software-factory-line` becomes navigable in the Library
canvas through the click-through re-centre that already exists.

## What this is

ADR-0266 authored the first `branchEdges` in the corpus: `process:software-factory-line` points at
eleven station ceremonies, each edge carrying a label naming the station it serves. Three of the four
pieces needed to draw that flow were already built — the schema field (ADR-0154 / ADR-0161 dec 5), the
wire that surfaces it onto `GuidanceAsset` (`library-typed-edges`, signed in `3c69dd21`), and the gate
that keeps the edges resolvable and acyclic (`check:process-graph`). The missing piece is the one
`library-typed-edges` explicitly deferred:

> nothing renders differently until a later increment (inc-9) draws with the edges

This capability is that increment's machine-witnessed half.

## Direction is the design point

`branchEdges` sit on the node like `references` do, which makes it tempting to feed them through the
same `referencesOf` path. That would be wrong. A `reference` is a *stands-on* edge, and the existing
walk ranks a node's own references **upstream** (left of centre). A `branchEdge` is defined as the
artifact a process **hands on to** — a successor. Routed through `referencesOf`, the canvas would
render `software-factory-line` as *standing on* the merge ceremony, inverting the very flow the map
exists to communicate.

So branch targets join the **downstream** frontier: centre on the left, stations to the right, flow
reading left→right. This is the one call the implementation must not get backwards.

## Contracts (4)

The test-proven leaf behaviours — each **one isolated automated test** in the `studio` suite (vitest,
`apps/studio/src/lib/processFlowEdges.test.ts`), importing `buildFocusGraph` from `./focusGraph`. Per
ADR-0122 each contract id is the LEAD of a distinctly-named test, so `storytree coverage` reports 4/4
against the ONE `real.testFile`. None is an APPEARANCE assertion — the drawn label and any branch-edge
stroke treatment are the story's operator-attested UAT leg (ADR-0070).

1. **`lpf-branch-target-renders-downstream`** — a `process` centre carrying `branchEdges` yields, for
   each in-corpus target, a `FocusNode` with `side: 'downstream'` and a `FocusEdge` from the centre to
   it. At HEAD neither the node nor the edge is returned.
2. **`lpf-branch-edge-carries-its-label`** — the `FocusEdge` produced from a branch edge carries that
   edge's authored `label` verbatim; an edge authored without a label carries none rather than an
   empty string.
3. **`lpf-branch-edge-is-kind-tagged`** — a branch-derived edge is distinguishable from a
   reference-derived one by an explicit kind tag, so the look leg can style them apart without
   re-deriving provenance from the node pair.
4. **`lpf-no-branch-edges-yields-none`** — a `process` asset with no `branchEdges` (every other process
   in the corpus today) contributes no branch edges and no branch nodes: absent, never an empty-array
   artifact. This is the back-compat contract — sixteen of seventeen processes are in this state.

## Out of scope

The DRAWN label, any branch-edge stroke treatment, and the mount are **not** proved here: they are
supplement glue after PASS and the story's operator-attested look leg (ADR-0070 stage 2). The
click-through re-centre needs no new work — a branch target is an ordinary `FocusNode`, so it inherits
the existing neighbour-click behaviour, and `LibraryOpenTrigger`'s `lfg-node-<id>` double-click
contract keeps holding.
