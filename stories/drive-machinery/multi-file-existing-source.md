---
id: "multi-file-existing-source"
tier: capability
story: drive-machinery
title: "Multi-file & existing-source builds"
outcome: "A node can declare a multi-file write scope and an edit-existing-source regression red→green, so bug-fixes, refactors, and multi-file changes go through the gate — keeping test-author ≠ code-author."
status: proposed
proof_mode: integration-test
depends_on: [spec-borne-proof-config, proof-command-vocabulary]
decisions: [20, 57]
---

# Multi-file & existing-source builds

**Outcome —** A node can declare a multi-file write scope and an edit-existing-source regression
red→green, so bug-fixes, refactors, and multi-file changes go through the gate — keeping
test-author ≠ code-author.

**Depends on —** [`spec-borne-proof-config`](spec-borne-proof-config.md), [`proof-command-vocabulary`](proof-command-vocabulary.md)

> **Proof status (honest) — `proposed`, UNBUILT — this is a DESIGN NOTE for the next session.** This
> is ADR-0057 §3's expansion C (the last build-machinery expansion before E). Authored as the queued
> next unit during the overnight A→B→D session (A/B/D landed; C deferred to keep the higher-risk
> "loosen the right-red + single-file assumptions" change off the tail of a long session). The
> contracts below are PROPOSED proof obligations, not a standing suite. The honesty walls of
> [`prove-it-gate`](prove-it-gate.md) and [`phase-scoped-write-wall`](phase-scoped-write-wall.md) MUST
> be preserved — see the trust analysis below.

## Guidance (the design, scoped from the as-built machinery)

C is **smaller than it sounds** because A and B already did most of the structural work — confirm
each of these against the code before building:

1. **The write scope is ALREADY a glob SET.** `PathWriteScopeConfig` is `{ testGlobs: string[];
   sourceGlobs: string[] }` and `PathWriteScope` matches any path against the set
   ([`phase-machine.ts`](../../packages/orchestrator/src/phase-machine.ts)). A `sourceGlobs` of
   `["packages/x/src/**/*.ts"]` already permits IMPLEMENT to write MULTIPLE source files. So
   multi-file *scope* needs no new machinery — only the brief + the default proof command assume a
   single pair.
2. **The gate ALREADY accepts a runtime red.** `nextPhase("CONFIRM_RED", obs)` only requires
   `obs.result === "red"`; `kind` (`compile` | `runtime`) is optional classification, never gated
   ([`phase-machine.ts`](../../packages/orchestrator/src/phase-machine.ts)). So an
   **edit-existing-source** regression — where the red is a NEW failing *assertion* against code that
   already exists, not a missing symbol — is **already gate-legal today**. The only thing asserting
   "the impl must NOT exist yet" is the *brief* (`realPrompts`, AUTHOR_TEST text), not the gate.
3. **B's `proofCommand` ALREADY runs a multi-file suite.** A node can declare `proofCommand: pnpm
   --filter x test` (the whole package suite over many files). So multi-file *proof* needs no new
   machinery either.

So C's REAL work is narrow:

- **`proof-config.ts` / `RealProofConfig`** — generalize `testFile`/`sourceFile` (single) to
  `testFiles`/`sourceFiles` (a SET), OR add an optional `editsExisting?: boolean` that flips the
  brief. Keep the single-file fields working (back-compat: the migrated nodes + A's parity guard).
  Recommended: keep `testFile`/`sourceFile` as the primary (single) shape and ADD optional
  `extraSourceGlobs`/an `editsExisting` flag, rather than churn every existing entry — decide via a
  design panel.
- **`resolve-prove-spec.ts` / `realPrompts`** — an **existing-source brief**: do NOT say "the impl
  must NOT exist yet"; instead "read the existing `<sourceFile(s)>`, add a regression test that FAILS
  against the current behaviour (a new assertion, not a missing symbol), then EDIT the source to
  satisfy it." For multi-file, name the file SET. `realProofCommand` already supports a declared
  proof command for the suite.
- **No orchestrator gate change** — the phase machine + write wall already do the right thing.

## Trust analysis (the honesty walls hold — verify when building)

The test-author ≠ code-author wall holds for edit-existing-source **because the AUTHOR_TEST scope is
test-globs only**: a leaf in AUTHOR_TEST can write the regression test but CANNOT edit the existing
source (source globs are IMPLEMENT-only). So a leaf cannot forge by quietly editing source while
"authoring the test." And **CONFIRM_RED observes the new test failing against the UNCHANGED source**
— if the leaf writes a test that is already green against current code (no real regression), CONFIRM_RED
observes GREEN and the gate fails closed (a real red must come first). So an "already-green" forged
test self-defeats, exactly as B's always-green `proofCommand` does. The one genuinely-new property to
guard: the "right red" for existing-source is a runtime assertion failure rather than a missing
symbol — already accepted by the gate, but the brief should still steer the leaf to a red "for the
right reason" (a behaviour assertion, not a syntax error), as the current brief does.

## Open owner calls (surface before building, do not guess)

- **The shape of the multi-file config** — `testFiles`/`sourceFiles` sets vs an `editsExisting` flag
  vs leaning entirely on `scope` globs + `proofCommand`. A design panel should pick one (back-compat
  with A's parity guard is the constraint).
- **Cross-package refactor** — C as scoped is within-package (one package's glob set + suite). A
  cross-package refactor (multiple packages' suites) is a wider surface; decide whether it is in C or
  a later expansion.
- **Is C the first thing to build via the (now-working) inner loop?** C is itself multi-file, so it
  must be built outer-loop first (the bootstrap, like A/B/D). But once C lands, the multi-file
  keystones (A/B/D) become gate-driveable toward `healthy` — the natural next bootstrap rung.

## Integration test (proposed)

**Goal —** A node with a multi-file scope and an `editsExisting` brief drives an "edit existing
source + add a regression test" red→green through the REAL gate offline (mirroring
`story-real-build.test.ts`'s fixture-repo + scripted-author recipe): the leaf authors a regression
test that fails against existing source (CONFIRM_RED), edits the existing source across more than one
file (IMPLEMENT), and the spine observes green — with the AUTHOR_TEST wall refusing a source edit.

## Contracts (6, PROPOSED)

1. **`multi-file-scope-permits-a-set`** — a `sourceGlobs` set permits IMPLEMENT to write more than one source file; AUTHOR_TEST still refuses every source path.
2. **`edit-existing-source-red-green`** — a node edits an EXISTING source file + adds a regression test; the red is a new failing assertion (runtime), the green is the edit — driven through the gate offline.
3. **`author-test-wall-holds-for-existing-source`** — in AUTHOR_TEST the leaf cannot edit the existing source (source globs are IMPLEMENT-only); a forged "already-green" test fails closed at CONFIRM_RED.
4. **`right-red-runtime-assertion-accepted`** — a runtime-assertion red (not a missing symbol) is accepted by the gate; the brief steers the leaf to a red for the right reason.
5. **`existing-source-brief`** — `realPrompts` drops the "must NOT exist yet" net-new assumption for an edits-existing node and names the file set.
6. **`single-file-parity-unchanged`** — the migrated single-file nodes (A's parity guard) and B's `proofCommand` resolve identically; C is purely additive.
