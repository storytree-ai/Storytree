---
id: "declared-edge-drift-report"
tier: contract
story: cli
capability: organism-boundary-tooling
title: "Report declared cross-story edges with no code backing, deriving virtual stories' real edges from sourceFile"
outcome: "A pure function computes, per story, the declared-but-code-unbacked cross-story edges (drift candidates) and the backed-but-undeclared edges — deriving a virtual story's real edges from its units' proof.real.sourceFile imports — as a non-blocking report, never a gate failure."
status: mapped
proof_mode: contract-test
depends_on: []
# DELIVERED, BUT NOT GATE-PROVEN. This file remains `status: mapped` only because ADR-0395's bounded
# hierarchy audit reclassifies stories and capabilities, while this file is tier `contract`; the
# retained contract status is not a claim of inherited brownfield provenance. `declaredEdgeDriftReport` and `formatDriftReport` are exported from
# packages/cli/src/boundaries.ts at HEAD, wired non-blocking into check-boundaries.ts, and covered by
# passing `declaredEdgeDriftReport: …` cases in packages/cli/src/boundaries.test.ts — landed by an
# ORDINARY hand-authored commit ("feat(cli): non-blocking declared-edge drift report (ADR-0115)"), NOT
# by a `--real` build. So the planned red was never observed by storytree's spine and no signed verdict
# backs this contract. Its parent capability is greenfield `proposed` under ADR-0395. The
# `real:` arm below is RETAINED so the unit stays re-buildable, but a re-run must start from a genuine
# red — the function it was to author already exists.
#
# Node-borne proof config (ADR-0057 keystone A): authoring THIS block is what makes the contract
# inner-loop buildable — no NODE_BUILD_REGISTRY edit. EDIT-EXISTING (editsExisting: true): both files
# already exist at HEAD — the leaf ADDS a new exported pure function (the per-story declared-vs-code set
# difference + the report formatter) to packages/cli/src/boundaries.ts, and ADDS exhaustive cases to
# packages/cli/src/boundaries.test.ts. The planned red was a runtime-assertion red: a new test calling
# the then-not-existing exported function (a missing-symbol/behaviour red), green the added function.
# NO `install`: the test imports ONLY node:test, node:assert/strict,
# and ./boundaries.js (relative); boundaries.ts itself imports nothing (no zod, no @storytree/*, no node:
# builtins) — so the proof runs OFFLINE in a bare worktree with no lockfile install (and therefore no
# typecheck wall is required). Single LITERAL sourceFile (no `*`), and sourceGlobs === [sourceFile], so
# the default node:test proof on the single test file is legal — no `proofCommand` (the C honesty refine
# does not fire: a single literal source glob equal to sourceFile with no wildcard stays on the default
# command). The write scope stays within packages/cli (ADR-0087: one concrete package per write scope).
proof:
  command:
    file: pnpm
    args: ["--filter", "@storytree/cli", "test"]
  scope:
    testGlobs: ["packages/cli/src/**/*.test.ts"]
    sourceGlobs: ["packages/cli/src/**/*.ts"]
  real:
    testFile: "packages/cli/src/boundaries.test.ts"
    sourceFile: "packages/cli/src/boundaries.ts"
    editsExisting: true
    scope:
      testGlobs: ["packages/cli/src/boundaries.test.ts"]
      sourceGlobs: ["packages/cli/src/boundaries.ts"]
---

# Report declared cross-story edges with no code backing, deriving virtual stories' real edges from `sourceFile`

**Outcome —** A pure function computes, per story, the **declared-but-code-unbacked** cross-story edges
(the drift candidates) and the **backed-but-undeclared** edges — deriving a **virtual** story's real
edges from its units' `proof.real.sourceFile` imports — as a NON-BLOCKING report, never a gate failure.

> **The gap this closes (ADR-0115).**
> The blocking boundary gate (ADR-0074)
> maps packages→stories via `repo-manifest.json` `packageOwnership`, so it is BLIND to a **virtual
> story** — one owning no package, its code physically hosted in packages owned by other stories — and
> to IoC / build-artifact seams. A
> virtual story's hand-authored `depends_on` can drift with ZERO gate signal — exactly what happened when
> ADR-0112 moved the orchestrator composition into `packages/drive`: the code moved, the
> `headless-orchestrator → cli` declaration did not, and a human had to notice and hand-correct it
> (commit `57f4be8`). *(That motivating story, `headless-orchestrator`, has since been RETIRED —
> ADR-0175,
> owner-directed 2026-07-17 — so it is history here, not a live example. The blind spot it illustrates
> is unchanged and still applies to every current virtual story.)* This contract is the pure core of the non-blocking drift report that would have
> flagged it the moment ADR-0112 landed. It is a SIBLING to the gate, not a change to it (the disk
> gatherer + the WARN wiring in [`check-boundaries.ts`](../../packages/cli/src/check-boundaries.ts) are
> the consuming surface's I/O glue, deliberately OUT of this contract's write scope).

## Guidance

Add ONE pure exported function (no I/O, no spawning, no `fs`) to the EXISTING
[`packages/cli/src/boundaries.ts`](../../packages/cli/src/boundaries.ts) — the analyser is already pure
and already computes both graphs; this adds the per-story set difference + a report formatter beside the
existing `checkBoundaries` / `mergeDeclaredGraph` / `extractImports`.

The function takes the gathered boundary inputs PLUS the virtual stories' source-file text (so it stays
pure — the disk read of those files is the gatherer's job, passed in) and returns, per story, two edge
sets. Suggested shape (the leaf owns the exact names/signature, but the asserted behaviour below is
binding):

```ts
export interface StoryEdgeDrift {
  /** declared edges (depends_on ∪ inverse(consumed_by)) with NO backing code import — drift candidates. */
  declaredButUnbacked: string[];
  /** real code edges NOT declared on either endpoint — a hard violation for a package-owning story; a
   *  missing declaration the report surfaces for a virtual story. */
  backedButUndeclared: string[];
}
export interface DeclaredEdgeDriftReport {
  /** story id → its two asymmetries (only stories with at least one asymmetry need appear). */
  byStory: Record<string, StoryEdgeDrift>;
}
export function declaredEdgeDriftReport(input: DriftReportInput): DeclaredEdgeDriftReport;
export function formatDriftReport(report: DeclaredEdgeDriftReport): string; // the pure WARN text
```

How it computes, per story:

- **The DECLARED set** = the story's `depends_on` UNION the inverse of every other story's `consumed_by`
  that names it (i.e. `A`'s declared targets are `depends_on[A] ∪ { B : consumed_by[B] ∋ A }`). REUSE the
  existing `mergeDeclaredGraph` (it already merges exactly these two directions) for the declared graph.
- **The REAL code-edge set** for a PACKAGE-OWNING story = the owning-story projection of its packages'
  real `@storytree/*` runtime imports (the same code graph the blocking gate reads, mapped package→story
  via the ownership map; same-story edges dropped).
- **The REAL code-edge set** for a VIRTUAL story (owns no package) = DERIVED: for each of the story's
  units (its capabilities/contracts), take the unit's `proof.real.sourceFile` (and `sourceGlobs`, and the
  contracts' `covers` paths), run the EXISTING `extractImports` over that file's text, map each imported
  `@storytree/*` package to its owning story (via the ownership map), and drop same-story + self edges.
  SKIP `import type` / `export type` (type-only — erased, not a runtime coupling, exactly as the blocking
  scan's rule (b) does) and SKIP test scaffolding (`isTestScaffolding`).
- **The two asymmetries** = `declaredButUnbacked` = DECLARED \ REAL; `backedButUndeclared` = REAL \
  DECLARED. Sort each for determinism.

Keep it total and dependency-light: the function is a pure data transform over the gathered inputs and the
supplied source-file text. No `process`, no `fs`, no network — `boundaries.ts` imports NOTHING today and
must STAY import-free (so `boundaries.test.ts` keeps proving offline with builtins + `./boundaries.js`
only). Copy array fields into the report so it never aliases the inputs' internal arrays. The report
SURFACES candidates only — it does NOT auto-classify legitimate-vs-drift (a build-artifact / IoC honesty
edge looks identical to drift to a machine, ADR-0115 d.3/d.4) — and it is NON-BLOCKING: it returns report
data and NEVER appends to the gate's violation list / fails the gate.

## Contract

1. **`declared-edge-drift-report-flags-unbacked-and-derives-virtual`** — the report computes the per-story
   declared-vs-code set difference and, for a virtual story, derives the real edges from its units'
   `sourceFile` imports — non-blocking, type-only imports skipped.
   - **asserts —**
     - **the set difference per story** — given a declared graph (`depends_on` ∪ inverse(`consumed_by`))
       and a real code-edge graph, the report returns, per story, `declaredButUnbacked` (DECLARED \ REAL,
       the drift candidates) and `backedButUndeclared` (REAL \ DECLARED), each deterministically ordered;
     - **virtual-story derivation from `proof.real.sourceFile`** — for a story owning no package, the real
       edges are DERIVED by running `extractImports` over the story's units' `sourceFile` text and mapping
       imported `@storytree/*` packages to owning stories (same-story + self edges dropped);
     - **type-only imports skipped** — an `import type … from "@storytree/x"` in a derived source file does
       NOT contribute a real edge (erased, not a runtime coupling);
     - **the `headless-orchestrator` fixture — a SYNTHETIC fixture, not a live story** — a virtual
       story declaring `depends_on: [agent, drive-machinery, library, notice-board]` is fed an
       in-memory source text (the suite's `ORCHESTRATE_TS` literal, modelled on the import head of
       `packages/drive/src/orchestrate.ts`) that value-imports `@storytree/agent` and
       `@storytree/library/store` at runtime and `@storytree/storage-protocol` type-only ⇒ derived real
       edges `{agent, library}` — a SUBPATH specifier is reduced to its bare package (`scopePackage`)
       before the ownership lookup, so `@storytree/library/store` still resolves to the `library` story
       — so the report flags **`drive-machinery`** and **`notice-board`** in `declaredButUnbacked` and
       does NOT flag **`storage-protocol`** (type-only, skipped). *(Why synthetic: the real story was
       RETIRED with ADR-0175,
       and its `orchestrator-composition` capability had its `real:` arm dropped on retirement, so it
       now cites NO `proof.real.sourceFile` and derives nothing. An in-memory literal is a legitimate
       fixture and the suite is correct; what this bullet must not do is present it as a live worked
       example. Note `packages/drive/src/orchestrate.ts` itself still EXISTS — ADR-0175's deliberately
       KEPT half, re-aimed under `app-guide`; it is the CITATION that is gone, not the file.)*;
     - **non-blocking** — the function returns report data and never raises a violation / fails the gate
       (the blocking gate's violations and this report's drift candidates are separate outputs); a story
       with no asymmetry contributes no drift entry.
   - **proven by —** `packages/cli/src/boundaries.test.ts` — the `declaredEdgeDriftReport: …` cases,
     passing at HEAD against `declaredEdgeDriftReport` / `formatDriftReport` in
     `packages/cli/src/boundaries.ts`. *(Contract status retained as `mapped` by this increment's
     story/capability tier fence, not because ordinary delivery created brownfield provenance. No
     signed verdict backs it. The `real:` arm is retained for a future re-proof, which would have to start from
     a genuine red.)*
