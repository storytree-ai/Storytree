---
id: "hosted-story-landlord-rule"
tier: contract
story: cli
capability: organism-boundary-tooling
title: "Block a story whose unit sources are hosted in another story's building unless a declared edge connects the two either way"
outcome: "The pure boundary judge blocks a story whose units' proof.real.sourceFile paths live inside another story's building (a foreign packages/<x> or apps/<x> dir) unless the merged declared story graph connects the two in either direction — so a story can no longer claim files in a neighbour's territory while declaring depends_on: [] and rendering as an orphaned island."
status: proposed
proof_mode: contract-test
depends_on: []
# Node-borne proof config (ADR-0057 keystone A): authoring THIS block is what makes the contract
# inner-loop buildable — no NODE_BUILD_REGISTRY edit. EDIT-EXISTING (editsExisting: true): both files
# already exist at HEAD — the leaf ADDS a new BLOCKING rule (the hosted-story landlord rule) to the
# existing `checkBoundaries` in packages/cli/src/boundaries.ts, plus the two new OPTIONAL BoundaryInput
# fields it reads (unitSourceFiles, dirOwners), and ADDS exhaustive cases to
# packages/cli/src/boundaries.test.ts. The red is a runtime-assertion red: the new cases feed a
# hosted-story fixture to checkBoundaries AS IT STANDS AT HEAD (where the rule does not exist), so they
# assert a landlord violation that is NOT yet produced — a behaviour red against the source at HEAD —
# and green is the added rule. NO `install`: the test imports ONLY node:test, node:assert/strict, and
# ./boundaries.js (relative); boundaries.ts itself imports nothing (no zod, no @storytree/*, no node:
# builtins) and must STAY that way — so the proof runs OFFLINE in a bare worktree with no lockfile
# install (and therefore no typecheck wall is required). Single LITERAL sourceFile (no `*`), and
# sourceGlobs === [sourceFile], so the default node:test proof on the single test file is legal — no
# `proofCommand` (the honesty refine does not fire: one literal source glob equal to sourceFile, no
# wildcard, stays on the default command). The write scope stays within packages/cli (ADR-0087: one
# concrete package per write scope).
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

# Block a story hosted in another story's building unless a declared edge connects the two

**Outcome —** The pure boundary judge BLOCKS a story whose units' `proof.real.sourceFile` paths live
inside **another story's building** (a foreign `packages/<x>` or `apps/<x>` dir) UNLESS the merged
declared story graph connects the two in either direction — so a story can no longer claim files in a
neighbour's territory while declaring `depends_on: []` and rendering as an orphaned island.

> **The gap this closes (ADR-0192).** The blocking boundary gate
> ([ADR-0074](../../docs/decisions/0074-enforce-the-organism-boundary-gate-the-cross-story-dependenc.md))
> is PACKAGE-granular: it maps whole packages → stories and checks that every cross-package CODE import
> is a declared cross-story edge. But a story's proof-bound sources can sit INSIDE another story's
> package with no cross-package import crossing — a capability whose `proof.real.sourceFile` points at
> `apps/studio/src/…` while `apps/studio` is owned by a DIFFERENT story. That story could declare
> `depends_on: []` and render as an ORPHANED ISLAND on the forest map with ZERO mechanical pushback,
> because the building it squats in is owned by someone else and the gate never asked *"who owns the file
> this unit proves?"*. That is exactly the **library-tech-tree-overlay** incident (owner-caught
> 2026-07-13): a story whose units' sources sat under `apps/studio` declared no edges at all. When this
> rule was decided, **13 standing violations across 7 stories** were found and fixed. This contract is
> the pure core of the new BLOCKING landlord rule that flags it. It is a rule ADDED to `checkBoundaries`,
> not a change to the drift report; the disk gatherer that reads each non-retired story's unit
> `sourceFile`s and derives the dir→owner map (in
> [`check-boundaries.ts`](../../packages/cli/src/check-boundaries.ts)) is the consuming surface's I/O
> glue, deliberately OUT of this contract's write scope — exactly like the drift-report precedent.

## Guidance

Add ONE more BLOCKING rule to the EXISTING `checkBoundaries` in
[`packages/cli/src/boundaries.ts`](../../packages/cli/src/boundaries.ts) — beside rule 4 (the ADR-0166
declared-edge honesty rule), its closest sibling: another rule that turns a real-world drift incident
into mechanical pushback, appending to the SAME violation list. It reads TWO new OPTIONAL fields on
`BoundaryInput` (the leaf owns the exact names/types, but the asserted behaviour below is binding):

- **`unitSourceFiles?: Record<string, string[]>`** — story id → the repo-relative POSIX paths of that
  story's units' `proof.real.sourceFile` (plus any LITERAL, non-glob `real.scope.sourceGlobs` entries),
  gathered from disk by `check-boundaries.ts`. The gatherer passes only NON-RETIRED stories (a retired
  story's island no longer renders, so "it's an orphan" is meaningless noise — the same retired-story
  exclusion the drift report already makes).
- **`dirOwners?: Record<string, string>`** — a building dir (`"packages/<x>"` or `"apps/<x>"`) → the
  story that owns it, derived by the gatherer from each `package.json` `name` + the repo-manifest
  `packageOwnership` organisms/surfaces.

How the rule computes, per story `S` in `unitSourceFiles`, for each of its files `F`:

- Take `F`'s FIRST TWO path segments as the building — but ONLY if `F` starts with `packages/` or
  `apps/`. Any other root (`.github/`, `scripts/`, `stories/`, a bare filename) is OUT of the boundary
  surface: SKIP it (those are not owned buildings — the boundary gate governs only the packages/apps
  organism graph).
- Let `T = dirOwners[building]`. SKIP if `T` is undefined (an unmapped building — insufficient data,
  never a violation) or `T === S` (the file is in `S`'s OWN building — the normal, correct case).
- Otherwise `S` is HOSTED in `T`'s territory. The merged declared story graph (the existing
  `mergeDeclaredGraph`: `depends_on` ∪ inverse(`consumed_by`)) must contain the edge `S → T` OR `T → S`
  — declared NEIGHBOURS in EITHER direction, the same either-endpoint philosophy
  [ADR-0074 §4](../../docs/decisions/0074-enforce-the-organism-boundary-gate-the-cross-story-dependenc.md)
  already uses for code-edge coverage. The REVERSE direction (`T → S`) is what keeps the legitimate
  code-backed HUB pattern clean: e.g. `notice-board`'s tree-view sources physically live in
  `packages/cli`, and the real `cli → notice-board` edge (cli declaring notice-board) covers them without
  notice-board having to declare a spurious dependency on cli.
- If NEITHER direction is declared, append ONE violation per `(S, T)` pair — DEDUPED across `F` (a story
  hosted in the same building/host by ten files yields one violation) and deterministically ordered. The
  message names `S`, the host `T`, the building dir, and ONE example file, and points the fix: add `T` to
  `stories/S/story.md` `depends_on` and — if no code import backs the edge — annotate it in the spec's
  `artifact_edges` frontmatter (consumer-side is the annotatable side; an unbacked provider-side
  `consumed_by` would sit forever as drift-report wallpaper) — OR remove the hosted-file claim (re-home
  the unit's `sourceFile`, or retire the mis-homed unit).

When `unitSourceFiles` is ABSENT the rule is SKIPPED entirely — narrow fixtures that populate only the
dep-graph inputs are unaffected, the same insufficient-data posture rule 4 takes
([ADR-0166](../../docs/decisions/0166-declared-edge-honesty-gates-blocking-unbacked-edges-for-pack.md),
"skipped when insufficient data"; the real gatherer always passes the map). Keep the rule pure and
dependency-light: `boundaries.ts` imports NOTHING today and must STAY import-free (no `@storytree/*`, no
`node:` builtins) so `boundaries.test.ts` keeps proving OFFLINE with builtins + `./boundaries.js` only.
This is a BLOCKING rule — a landlord violation FAILS the gate exactly like an undeclared coupling —
unlike the ADR-0115 drift report it sits near in the file, which only WARNs.

## Contract

1. **`hosted-story-landlord-rule-flags-undeclared-host`** — the landlord rule flags a story whose unit
   sources live in a foreign story's building with no declared edge either way, and stays silent for
   every legitimate arrangement (own building, either-direction edge, off-surface path, unmapped
   building, absent input).
   - **asserts —**
     - **a hosted story with no declared edge either way → a violation** — given `unitSourceFiles`
       mapping story `S` to a file under a foreign building `B`, `dirOwners[B] = T` (`T ≠ S`), and NEITHER
       `S → T` nor `T → S` in the merged declared graph, `checkBoundaries` returns a violation naming the
       story `S`, the host `T`, the building dir, and an example file (the real-world incident fixture: a
       story whose unit `sourceFile`s live under `apps/studio` with `depends_on: []` — the
       library-tech-tree-overlay orphan-island incident, owner-caught 2026-07-13);
     - **consumer-side edge `S → T` → clean** — when `S`'s `depends_on` lists `T`, the hosted file is
       covered and no landlord violation is raised;
     - **provider-side edge `T → S` → clean** — when the REVERSE edge is declared instead (`S`'s
       `consumed_by` lists `T`, or `T`'s `depends_on` lists `S` — the code-backed hub fixture, e.g. cli
       hosting notice-board's sources under the real `cli → notice-board` edge), no violation;
     - **a file in the story's OWN building → clean** — when `dirOwners[building] === S`, no violation
       (the normal, correct case);
     - **a file outside `packages/` and `apps/` → clean** — a `sourceFile` such as
       `".github/workflows/ci.yml"` (or a `scripts/`, `stories/`, or bare-filename path) is out of the
       boundary surface and contributes no landlord violation;
     - **a building absent from `dirOwners` → clean** — an unmapped building (`dirOwners[building]`
       undefined) is insufficient data, not a violation;
     - **multiple foreign hosts → one violation per `(S, T)` host, deterministic order** — a story whose
       files are hosted across several foreign buildings with no declared edges yields exactly one
       violation per `(S, T)` host pair, deduped across files and deterministically ordered;
     - **`unitSourceFiles` absent → no landlord violations** — with `unitSourceFiles` omitted the rule is
       SKIPPED entirely: even a fixture that would otherwise trip it (hostile dep-graph / story-graph
       inputs present) produces no landlord violation.
   - **proven by —** `packages/cli/src/boundaries.test.ts` (the leaf ADDS these cases inside the gate's
     AUTHOR_TEST phase; the red — the new cases asserting a landlord violation `checkBoundaries` does not
     yet produce at HEAD — is observed by the spine before the rule is added to
     `packages/cli/src/boundaries.ts`).
</content>
</invoke>
