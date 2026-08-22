---
status: accepted
decided: 2026-08-12
# ADR-0122 established the binding this widens (the sweep read the `real:` arm alone), so it is no
# longer wholly self-describing — that is an `amends` edge. ADR-0252 D3 and ADR-0269 are APPLIED
# here, not amended: the ceiling moves DOWN (D3's own remedy) and the aperture enlargement is
# measured exactly as ADR-0269 4(b) requires. Claiming amends on those would inflate the
# load-bearing set with decisions this one obeys rather than changes.
amends: [122]
---
# ADR-0353: A capability declares where its contract tests live, separately from what its build may write

## Status

accepted (2026-08-12) — decided/directed by the owner in conversation on 2026-08-12. Design-time alignment IS the ratification (ADR-0110); no second end-of-flow ask.

## Context

`check:coverage` (ADR-0122) credits a declared contract when a substantive test NAMES it, and it looks
for that test in the capability's registered `proof.real.testFile` ∪ `proof.real.scope.testGlobs`. That
binding conflates two different questions, and the conflation only becomes visible when a capability's
`real:` arm is **borrowed**.

`stories/library/event-sourced-store-seam` is the live instance. Its `real:` arm exists solely so
`library#gate-5` can drive an ADR-0098 R1 red over the keyless connection (`connection.ts`); the verdict
signs FOR the gate id, so the arm never greens the capability at all. The seam's actual contract tests
live somewhere else entirely — the shared parity suite `packages/storage-protocol/src/store-parity.ts`,
run against `InMemoryStore` and against `HttpStore` over a real socket, plus the schema assertion in
`packages/library/src/store/store.test.ts`. The sweep never read any of them. Result: **all nine declared
contracts sat in the drain backlog while five of them cited real, passing tests.**

This stopped being cosmetic when ADR-0352 landed `patchDoc`. Its five parity contracts are genuinely
proven, but declaring just two of them as numbered contracts moved the corpus backlog 119 → 121 and
breached the ADR-0252 D3 ceiling — for behaviour that IS tested. The ceiling could not be raised
(ADR-0252 D3: drain, never raise), and naming the contracts in `connection.test.ts` to satisfy the
scanner would have been a fake drain. ADR-0352 therefore shipped the tests and **withheld the
contracts**, recording the reason in the spec and in its own Consequences. That left the capability
knowingly under-declaring what it does — a stopgap, and the wrong one to leave standing.

Two forces constrain the repair, and they point the same way:

1. **`real.scope.testGlobs` is not a reporting field — it is the phase machine's WRITE fence**
   (`phase-machine.ts`, `isTest`). Widening it so a reader could see the parity tests would hand
   `library#gate-5`'s leaf write authority over another package's test files, to fix a REPORTING fault.
   The ADR-0087 bound is per-glob rather than per-array, so the schema would have PERMITTED this; it is
   refused on what it authorizes, not on whether it parses.
2. **A second, independent fault sat underneath the first.** Not one of the seam's tests named its
   contract id — the parity titles read `${name} parity: upsertDoc replaces on same id…`. Repairing only
   the file binding would have credited **zero** contracts. Either half alone is a no-op.

## Decision

**Split the two surfaces by what they authorize.** A spec's `proof:` block may declare an optional,
read-only `coverage.testGlobs` surface naming where that capability's contract tests actually live.

- `real.scope` says what a drive may **WRITE**. `coverage` says where a reader may **LOOK**.
- The coverage sweep reads `real.testFile` ∪ `real.scope.testGlobs` ∪ `coverage.testGlobs`. It **adds,
  never replaces** — the borrowed arm's own file is still scanned.
- **TEST globs only; there is deliberately no `sourceGlobs` counterpart, and the schema refuses one.**
  The ADR-0192/ADR-0074 hosted-story landlord rule derives a story's claimed territory from its units'
  `real.sourceFile` plus their literal `real.scope.sourceGlobs`. A source-shaped coverage field would
  silently enlarge that territory and red `check:boundaries` for a capability that merely wants its own
  tests read. Naming only TEST paths keeps this field invisible to the landlord rule *by construction* —
  verified, not assumed: `check:boundaries` passes with the surface declared.
- **Each glob carries the ADR-0087 single-package bound.** Read-only is not harmless: what this field
  authorizes is a CLAIM about proof, so an unbounded repo-wide glob would let a capability credit its
  contracts against any test anywhere — a fake-drain vector on the very check that exists to catch
  under-declaration. The bound is per-glob, so an array may legitimately span the two packages a seam's
  contracts genuinely live in.
- Absent = unchanged behaviour, and absent stays *absent* rather than explicit-undefined, so the
  registry-vs-spec parity drift-lock holds byte-for-byte.

**And the naming half is repaired with it**, because neither half works alone: the parity suite and both
`store.test.ts` files now carry their contract ids in their test names.

**Both readers resolve the same surface.** The per-capability `storytree coverage <cap>` command and the
gate sweep have separate loaders; teaching only one would have left the checker contradicting itself on
the single question it exists to answer.

**The ceiling is TIGHTENED 119 → 112 in the same commit**, and the aperture change is stated at the
number (ADR-0269 4(f)).

## Consequences

- **`event-sourced-store-seam` now declares 11 contracts, 9 of them credited.** The two that remain
  uncovered — `pg-upsert-transactional-event-projection`, `pg-createpool-iam-no-password` — are the
  honest would-be pair, proven only behind the default-skipped live-DB gate and earned by story gate 5.
  The repair credits proof; it never manufactures it. The test asserts that REMAINDER rather than a
  count, so a future widening that swept in the live-gated pair would red rather than read as success.
- **The measured effect, over the same 310 spec files / 125 scanned capabilities: `uncovered` 119 → 112,
  `unbound` unchanged at 1.** All seven are this one capability, credited to tests that already existed
  and already passed. This is the OPPOSITE direction from ADR-0269's worked example (which raised
  119 → 120): teaching the sweep to look where the tests are can only ever REVEAL coverage, never
  manufacture a gap, so the resulting ceiling is strictly tighter and no backlog was absorbed.
- **112 is NOT comparable to the historical 66 → 121 series**, which was measured through the narrower
  aperture. That series remains the evidence for why this ceiling exists; it is no longer the same
  measurement. The historical sum-blindness case in `coverage-drain.test.ts` is now pinned to the ceiling
  in force on the day it was measured, rather than to the shipped constant, so tightening the ceiling
  cannot destroy the contrast that case exists to show.
- **The signed `real:` arm is untouched** — no `testFile`, `sourceFile`, or scope glob moved, so no
  signed verdict is re-pointed and gate-5's R1 red still lives exactly where ADR-0098 put it. The
  hazard that bit PR #1202 (moving a `sourceFile` across a package reds `check:boundaries`) is avoided
  by not moving anything.
- **The drain is now available to other capabilities**, and each one that declares a surface will lower
  this count again. That is a drain, not a raise — the remedy stays ADR-0252 D3's.
- **A self-declared surface is a self-declared claim, and this does not close that.** A capability could
  name a sibling package's unrelated tests and credit a contract against them; the single-package bound
  narrows the blast radius but does not judge relevance. That is the same residual limitation
  `check:coverage` already carries and states — a substantive-but-semantically-irrelevant assertion
  reads covered — and it remains the semantic-reviewer follow-on (ADR-0122 / ADR-0020 §4), not something
  a static sweep can settle.
- **The naming convention is now load-bearing on a SHARED suite.** `store-parity.ts` is run against three
  backends, so its titles carry `event-sourced-store-seam`'s contract ids for every one of them. That is
  harmless today (contract matching is per-capability, and the module is reachable only as a literal
  path, never by a `*.test.ts` walk) but it is a coupling a future reader should see rather than
  rediscover.
- **Measured 2026-08-22 (`uat-contractless-tested-behaviour-claims`): a capability with contracts and NO
  `real:`/`proof:` arm at all cannot declare a `coverage` surface, and is invisible to both coverage
  directions.** `coverage` is a field of the spec-borne `proof:` block
  (`NodeBuildConfigSchema`, `packages/orchestrator/src/proof-config.ts`), and that block's `command` /
  `scope` are REQUIRED — a capability cannot open a `proof:` block for the sole purpose of naming
  `coverage.testGlobs`. `forest-world`'s `render-core` is the live instance: eight declared contracts,
  no `proof:` block, greenfield without a `--real` arm (ADR-0395), and the sweep therefore never reads
  it at all — not "reads it and finds nothing," structurally unreachable. Its contracts bind by the
  `describe("<contract-id>: …")` naming convention alone, cited by a `proven by —` pointer in the
  capability's own prose rather than by any ADR-0353 surface. This is a residual gap in the mechanism
  this ADR decided, not a defect this ADR introduced — recorded so a future widening of `coverage` to a
  standalone declaration independent of `real`/`command`/`scope` is read as closing a known gap, and so
  a capability hitting this wall cites it rather than re-deriving it.

## References

- ADR-0122 — the contract-coverage sweep this amends (the binding it established).
- ADR-0252 D3 / ADR-0269 — the drain-ceiling instrument, and the aperture rule this move is measured against.
- ADR-0352 — landed `patchDoc` and withheld its two contracts against this exact fault.
- ADR-0098 — `library#gate-5`, the borrowed `real:` arm that makes the conflation visible.
- ADR-0087 — the structural single-package scope bound reused here.
- ADR-0192 / ADR-0074 — the hosted-story landlord rule the test-only shape keeps this field clear of.
- ADR-0126 — vouching-test extraction (a hollow or skipped test still credits nothing).
- `packages/orchestrator/src/proof-config.ts` — `CoverageSurfaceConfig` + its schema.
- `packages/cli/src/coverage-gate.ts`, `packages/cli/src/commands.ts` — the two readers.
- `stories/library/event-sourced-store-seam.md` — the declared surface and contracts 10–11.
- [ADR-0294](0294-story-uat-is-a-journey-not-a-spec-criteria-that-duplicate-lo.md) D2 — the citation
  obligation the `no proof: block` gap (above) leaves unmet for a `real:`-less capability.
- `stories/forest-world/render-core.md` contract 8 — the live instance of the `no proof: block` gap:
  its own `note` records the same limit inline.
