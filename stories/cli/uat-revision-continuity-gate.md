---
id: "uat-revision-continuity-gate"
tier: capability
story: cli
arc: story-green-monotonicity-arc
title: "The UAT revision continuity gate — changed criteria carry replacement proof before merge"
outcome: "A branch that changes an existing UAT criterion revision cannot merge until the candidate revision has an exact signed pass, while a newly added criterion remains additive expansion."
status: proposed
proof_mode: integration-test
depends_on: []
decisions: [560, 253, 416]
proof:
  command:
    file: pnpm
    args: ["--filter", "@storytree/cli", "test"]
  scope:
    testGlobs: ["packages/cli/src/uat-revision-continuity.test.ts"]
    sourceGlobs: ["packages/cli/src/uat-revision-continuity.ts"]
  real:
    testFile: "packages/cli/src/uat-revision-continuity.test.ts"
    sourceFile: "packages/cli/src/uat-revision-continuity.ts"
    scope:
      testGlobs: ["packages/cli/src/uat-revision-continuity.test.ts"]
      sourceGlobs: ["packages/cli/src/uat-revision-continuity.ts"]
    install: true
    typecheck:
      file: pnpm
      args: ["--filter", "@storytree/cli", "typecheck"]
    editsExisting: false
---

# The UAT revision continuity gate — changed criteria carry replacement proof before merge

**Outcome —** A branch that changes an existing UAT criterion revision cannot merge until the
candidate revision has an exact signed pass. Adding a new criterion id remains visible expansion and
does not acquire a replacement-proof obligation merely by being new (ADR-0560 D3).

## Proof walkthrough first

Give the pure judge a base hierarchy whose story is green, a candidate hierarchy, and signed
criterion verdicts. Keep the criterion id and change only its revision: without an exact pass for the
candidate binding, observe a red that names the story, criterion and old/new revisions; add that pass
and observe green. Repeat with only a stale old-revision pass and with a candidate fail and observe
the same refusal. Then add a wholly new criterion id and observe no replacement-proof finding. Finally
make the base, candidate, binding or verdict source unreadable and observe an explicit red rather
than a skipped comparison.

The single observable is the continuity verdict over `(storyId, criterionId, revisionId)`: every
changed existing binding either has exact candidate proof or is named as blocking.

## Guidance

- Compare the merge base's disk hierarchy with the candidate disk hierarchy. This is a proving
  reader, so neither side may be substituted with the live hierarchy projection.
- A changed binding means the same immutable `criterionId` has a different `revisionId`. Matching by
  position, title or prose is forbidden; ADR-0253's pair is the only identity.
- Replacement proof is one parseable signed PASS bound to the candidate pair. A stale pass for the
  base revision, a candidate fail, a positional legacy id, or a malformed verdict grants nothing.
- A criterion id that exists only in the candidate is additive scope under ADR-0416. It stays visible
  and must earn proof normally, but is not misclassified as a replacement for an established promise.
- Fail closed on an unreadable merge base, malformed hierarchy, ambiguous duplicate identity,
  unavailable authenticated verdict source, or unparsable signing row. Each refusal names the failed
  input and the exact repair; there is no disk-only or store-less pass.
- The pure judge and thin authenticated gatherer live in `packages/cli/src`. The canonical local gate
  plan and CI placement are pipeline wiring owned by `ci-cd`'s `green-gate`, not a second copy of the
  rule here.

## Contracts (4)

1. **`changed-existing-revision-requires-exact-candidate-pass`** — replacement meaning carries replacement proof.
   - **asserts —** when one immutable criterion id changes revision between base and candidate, the
     judge fails until a parseable signed PASS names that exact candidate `(criterionId, revisionId)`;
     it names the story, criterion and both revisions in the failure.
2. **`stale-failed-or-malformed-proof-grants-nothing`** — nearby evidence cannot satisfy continuity.
   - **asserts —** an old-revision pass, a candidate-revision fail, a positional legacy verdict and a
     malformed signing row each leave the changed criterion blocking.
   - **covers —** `packages/cli/src/uat-revision-continuity.ts`.
3. **`new-criterion-is-expansion-not-replacement`** — additive scope is not a silent reset.
   - **asserts —** a criterion id present only in the candidate produces no replacement-proof
     finding, while a changed existing id in the same story is still detected independently.
   - **covers —** `packages/cli/src/uat-revision-continuity.ts`.
4. **`continuity-inputs-fail-closed`** — an unread comparison is never reported green.
   - **asserts —** an unreadable base, malformed candidate, duplicate criterion identity or
     unavailable authenticated verdict source returns red with the failed input and remedy named.
   - **covers —** `packages/cli/src/uat-revision-continuity.ts`.

## Integration test

Run `pnpm --filter @storytree/cli test` and typecheck. The focused suite drives the real parser shapes,
the real signed-verdict schema and the pure judge; gatherer tests inject git/store readers so the suite
is hermetic. `green-gate` separately proves that the thin check is required in both the canonical
local plan and authenticated CI path.
