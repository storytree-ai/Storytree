---
id: "declared-edge-drift-report"
tier: contract
story: cli
capability: organism-boundary-tooling
title: "Report declared cross-story edges with no code backing, deriving virtual stories' real edges from sourceFile"
outcome: "A pure function computes, per story, the declared-but-code-unbacked cross-story edges (drift candidates) and the backed-but-undeclared edges — deriving a virtual story's real edges from its units' proof.real.sourceFile imports — as a non-blocking report, never a gate failure."
status: proposed
proof_mode: contract-test
depends_on: []
# Node-borne proof config (ADR-0057 keystone A): authoring THIS block is what makes the contract
# inner-loop buildable — no NODE_BUILD_REGISTRY edit. EDIT-EXISTING (editsExisting: true): both files
# already exist at HEAD — the leaf ADDS a new exported pure function (the per-story declared-vs-code set
# difference + the report formatter) to packages/cli/src/boundaries.ts, and ADDS exhaustive cases to
# packages/cli/src/boundaries.test.ts. The red is a runtime-assertion red: the new test calls the
# not-yet-existing exported function (a missing-symbol/behaviour red against the source as it stands at
# HEAD), green is the added function. NO `install`: the test imports ONLY node:test, node:assert/strict,
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

> **The gap this closes ([ADR-0115](../../docs/decisions/0115-detect-declared-edge-drift-derive-virtual-story-edges-from-s.md)).**
> The blocking boundary gate ([ADR-0074](../../docs/decisions/0074-enforce-the-organism-boundary-gate-the-cross-story-dependenc.md))
> maps packages→stories via `repo-manifest.json` `packageOwnership`, so it is BLIND to a **virtual
> story** that owns no package (e.g. `headless-orchestrator`, whose code is physically hosted in
> `packages/agent` + `packages/drive`, owned by other stories) and to IoC / build-artifact seams. A
> virtual story's hand-authored `depends_on` can drift with ZERO gate signal — exactly what happened when
> ADR-0112 moved the orchestrator composition into `packages/drive`: the code moved, the
> `headless-orchestrator → cli` declaration did not, and a human had to notice and hand-correct it
> (commit `57f4be8`). This contract is the pure core of the non-blocking drift report that would have
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
     - **the `headless-orchestrator` fixture** — declared `depends_on: [agent, drive-machinery, library,
       notice-board]`; its `orchestrator-composition` unit cites `sourceFile`
       `packages/drive/src/orchestrate.ts`, whose text value-imports `@storytree/agent` + `@storytree/library`
       at runtime and `@storytree/storage-protocol` type-only ⇒ derived real edges `{agent, library}`, so
       the report flags **`drive-machinery`** and **`notice-board`** in `declaredButUnbacked` and does NOT
       flag **`storage-protocol`** (type-only, skipped);
     - **non-blocking** — the function returns report data and never raises a violation / fails the gate
       (the blocking gate's violations and this report's drift candidates are separate outputs); a story
       with no asymmetry contributes no drift entry.
   - **proven by —** `packages/cli/src/boundaries.test.ts` (the leaf ADDS these cases inside the gate's
     AUTHOR_TEST phase; the red — the new test calling the not-yet-existing exported function — is observed
     by the spine before the function is added to `packages/cli/src/boundaries.ts`).
