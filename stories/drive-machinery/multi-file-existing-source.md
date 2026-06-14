---
id: "multi-file-existing-source"
tier: capability
story: drive-machinery
title: "Multi-file & existing-source builds"
outcome: "A node can declare a multi-file write scope and an edit-existing-source regression red→green, so bug-fixes, refactors, and multi-file changes go through the gate — keeping test-author ≠ code-author."
status: mapped
proof_mode: integration-test
depends_on: [spec-borne-proof-config, proof-command-vocabulary]
decisions: [20, 57]
---

# Multi-file & existing-source builds

**Outcome —** A node can declare a multi-file write scope and an edit-existing-source regression
red→green, so bug-fixes, refactors, and multi-file changes go through the gate — keeping
test-author ≠ code-author.

**Depends on —** [`spec-borne-proof-config`](spec-borne-proof-config.md), [`proof-command-vocabulary`](proof-command-vocabulary.md)

> **Proof status (honest) — `mapped`, built outer-loop (the bootstrap).** ADR-0057 §3's expansion C —
> no new ADR (it ships under the already-decided §3 plan + [ADR-0020](../../docs/decisions/0020-red-green-enforcement-on-the-owned-loop.md)'s
> honesty walls, like B and D). The change is BUILT and its dominant behaviour is observationally
> verified by a real, passing, OFFLINE suite: `proof-config.test.ts` (the `editsExisting` schema +
> honesty-refine legs) and `resolve-prove-spec.test.ts` (the brief branch, the multi-file scope
> matrix, and a REAL edit-existing red→green walk against a fixture git repo with an existing
> committed source + a scripted leaf — plus the forged-already-green CONFIRM_RED self-defeat).
> `@storytree/orchestrator` 146/146, ran 2026-06-15. Like the keystones it extends, C is itself a
> MULTI-FILE change the single-file inner loop could not yet drive, so it was built outer-loop first
> and is `mapped`, not `healthy`; the `proposed` pocket is gate-driving the drive-machinery keystones
> (A/B/D/C) now that the loop can express multi-file + edit-existing — the next bootstrap rung. A LIVE
> edit-existing `--real` red→green is an operator-attested smoke, not a standing test (the same
> posture as the other live legs in this story). The honesty walls of
> [`prove-it-gate`](prove-it-gate.md) and [`phase-scoped-write-wall`](phase-scoped-write-wall.md) are
> PRESERVED unchanged — only the leaf BRIEF changes; see the trust analysis below.

## Guidance (the design, as built)

C was **smaller than it sounded** because A and B already did the structural work — confirmed against
the code while building:

1. **The write scope was ALREADY a glob SET.** `PathWriteScopeConfig` is `{ testGlobs: string[];
   sourceGlobs: string[] }` and `PathWriteScope` matches any path against the set
   ([`phase-machine.ts`](../../packages/orchestrator/src/phase-machine.ts)). A `sourceGlobs` of
   `["packages/x/src/feature.ts", "packages/x/src/feature-helper.ts"]` (or a `**` glob) already
   permits IMPLEMENT to write MULTIPLE source files; AUTHOR_TEST still refuses every source path. So
   multi-file *scope* needed no new machinery — only the brief had to name the set.
2. **The gate ALREADY accepted a runtime red.** `nextPhase("CONFIRM_RED", obs)` only requires
   `obs.result === "red"`; `kind` (`compile` | `runtime`) is optional classification, never gated. So
   an **edit-existing-source** regression — where the red is a NEW failing *assertion* against code
   that already exists, not a missing symbol — was **already gate-legal**. Only the *brief* asserted
   "the impl must NOT exist yet".
3. **B's `proofCommand` ALREADY ran a multi-file suite.** A node can declare `proofCommand: pnpm
   --filter x test` (the whole package suite). So multi-file *proof* needed no new machinery either.

### The design fork — RESOLVED (config shape)

The one blocking fork — the shape of the config — was resolved by a 3-proposer + adversarial-judge
design panel (the ADR-0057 §3 "design panel picks one" path; back-compat with A's parity guard was the
hard constraint). **Decision: add ONE optional field `editsExisting?: boolean` to `RealProofConfig`,
and derive multi-file naming off the existing `scope.sourceGlobs` — no `testFiles`/`sourceFiles` sets
(option a, foreclosed; it would churn all 7 parity entries and re-baseline the oracle).** Multi-file
and edit-existing are **orthogonal axes**: multi-file was already expressible (A's glob-set scope +
B's suite `proofCommand`); the only *irreducible new bit* is the net-new ↔ edit-existing **brief**
axis, which is exactly one boolean.

The change, two touch-points (no orchestrator gate change):

- **`proof-config.ts` / `RealProofConfig`** — `editsExisting?: boolean` (zod `.strict()`, the
  spread-only-when-present builder so the key is ABSENT-not-undefined → the 7 net-new nodes stay
  byte-for-byte `deepEqual` to their registry twins). Plus **one load-bearing honesty refine**: an
  edits-existing node whose `sourceGlobs` reach BEYOND the single spotlight `sourceFile` MUST declare
  a suite `real.proofCommand` — the default `node:test`-on-`testFile` cannot OBSERVE a regression that
  lives in a sibling edited file, so the proof must be a suite that exercises the edited code.
  Single-file edit-existing (`sourceGlobs === [sourceFile]`) stays legal on the default command (the
  one test imports the one edited file, exactly as a net-new node does). Scoped to `editsExisting:true`
  so it never fires on a net-new node.
- **`resolve-prove-spec.ts` / `realPrompts`** — an `editsExisting` brief branch: drop "must NOT exist
  yet / importing the missing implementation"; instead "read the existing source(s), author a
  REGRESSION test that FAILS against current behaviour (a behaviour assertion, not a missing symbol),
  then EDIT the source(s)". A `sourcesNamed` helper names the multi-file set off `scope.sourceGlobs`
  (singular `[sourceFile]` → just the spotlight; broader → spotlight + the rest). The NET-NEW arm is
  kept BYTE-FOR-BYTE (the parity-of-prose guard; the 7 migrated nodes never set the flag).

## Trust analysis (the honesty walls hold — verified by the suite)

The test-author ≠ code-author wall holds for edit-existing **because the AUTHOR_TEST scope is
test-globs only**: a leaf in AUTHOR_TEST can write the regression test but CANNOT edit the existing
source (source globs are IMPLEMENT-only) — proven by the multi-file scope matrix + the explicit
edit-existing wall test. **CONFIRM_RED observes the new test failing against the UNCHANGED source** —
a leaf that writes a test already-green against current code (no real regression) gets GREEN at
CONFIRM_RED and the gate fails closed (proven by the forged-already-green walk → `failedAt:
"CONFIRM_RED"`). The one genuinely-new property — the "right red" for existing-source is a runtime
assertion, not a missing symbol — is already accepted by the gate (`kind` never gated) and is steered
by the brief; honesty never DEPENDS on the brief being followed. The one new HOLE (a default
single-file proof not exercising edited code in a sibling file) is closed structurally by the honesty
refine above, not left to the brief.

## Open owner calls (surfaced, not decided — the panel's residue)

- **Single-file edit-existing right-red rests on the leaf** authoring a meaningful runtime-assertion
  regression vs a syntax-error red — the gate accepts any *real* red. Inherent to C (the spec always
  named it); mitigated by the brief's `run_proof` "right reason" self-check, the same posture the
  net-new brief already trusts. NON-BLOCKING.
- **Wildcard-single-glob edge.** The honesty refine triggers on "`sourceGlobs` is more than
  `[sourceFile]`" — a single `**/*.ts` glob is length-1 yet matches many files, so it would NOT trip
  the refine while still being broad. C ships P1's conservative predicate (catches explicit
  multi-literal sets; the wildcard-single-glob case extends the same trust a package suite already
  gets). Tightening to "any glob containing `*`" is a back-compatible follow-up (refines never affect
  the 7 net-new nodes). OWNER CALL, non-blocking.
- **`editsExisting ⇒ install`?** A panelist proposed forcing `install:true` for edit-existing (existing
  source must load in an installed worktree). C **declined** to bake it in (don't forbid a legitimate
  builtins-only edit-existing node). OWNER CALL to confirm.
- **Cross-package refactor is OUT of C** (per the original note): C is within-package (one package's
  glob set + suite). The shape does not forbid a workspace-wide `proofCommand`, but the brief/guidance
  scope within-package. A cross-package refactor is a later expansion if wanted.
- **Option-a (testFiles/sourceFiles sets) is permanently foreclosed** by the `editsExisting` +
  set-valued-scope choice. Confirm acceptable.

## Integration test (as built)

A node with `editsExisting: true` drives an "edit existing source + add a regression test" red→green
through the REAL gate offline (a fixture git repo with an existing committed `widget.ts`, a scripted
leaf that authors a regression test red against current behaviour then EDITS the existing source
green), the spine observes red→green and commits, and a signed pass lands — with the AUTHOR_TEST wall
refusing every source edit and a forged already-green test failing closed at CONFIRM_RED. Proven by
`packages/orchestrator/src/resolve-prove-spec.test.ts` (the C section) + `proof-config.test.ts` (the
schema/refine legs), REAL, passing.

## Contracts (6, BUILT)

1. **`multi-file-scope-permits-a-set`** — a `sourceGlobs` set permits IMPLEMENT to write more than one source file; AUTHOR_TEST still refuses every source path.
   - **proven by —** `resolve-prove-spec.test.ts` ("C — a multi-file sourceGlobs set permits >1 IMPLEMENT write …") (REAL, passing)
2. **`edit-existing-source-red-green`** — a node edits an EXISTING source file + adds a regression test; the red is a new failing assertion (runtime), the green is the edit — driven through the gate offline.
   - **proven by —** `resolve-prove-spec.test.ts` ("C — REAL edit-existing offline walk …") (REAL, passing)
3. **`author-test-wall-holds-for-existing-source`** — in AUTHOR_TEST the leaf cannot edit the existing source (source globs are IMPLEMENT-only); a forged "already-green" test fails closed at CONFIRM_RED.
   - **proven by —** `resolve-prove-spec.test.ts` ("C — edit-existing: the AUTHOR_TEST wall refuses the EXISTING source path", "C — … a forged already-green regression test fails closed at CONFIRM_RED") (REAL, passing)
4. **`right-red-runtime-assertion-accepted`** — a runtime-assertion red (not a missing symbol) is accepted by the gate; the brief steers the leaf to a red for the right reason.
   - **proven by —** the offline walk's red→green (a runtime-assertion red advanced CONFIRM_RED) + `resolve-prove-spec.test.ts` ("C — a runtime-assertion red is accepted … and the brief steers to it") (REAL, passing)
5. **`existing-source-brief`** — `realPrompts` drops the "must NOT exist yet" net-new assumption for an edits-existing node and names the file set; the net-new arm is unchanged.
   - **proven by —** `resolve-prove-spec.test.ts` ("C — realPrompts for an editsExisting node drops the net-new assumption …", "C — a NET-NEW node's brief is UNCHANGED", "C — realPrompts NAMES the multi-file set …") (REAL, passing)
6. **`single-file-parity-unchanged`** — the migrated single-file nodes (A's parity guard) and B's `proofCommand` resolve identically; C is purely additive (the `editsExisting` key is ABSENT on all 7).
   - **proven by —** `proof-config.test.ts` ("C — editsExisting is ABSENT … the net-new parity drift-lock", "C — a NET-NEW node may carry a broad source scope with no proofCommand …") + `resolve-prove-spec.test.ts` (the contract-4 parity loop now also asserts `"editsExisting" in real === false`) (REAL, passing)
