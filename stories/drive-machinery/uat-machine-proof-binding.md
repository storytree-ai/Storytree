---
id: "uat-machine-proof-binding"
tier: capability
story: drive-machinery
title: "Per-UAT-leg proof-gate parsing"
outcome: "The Story UAT parser carries each explicit proof-gate annotation into the strict per-leg model without dropping or inventing a binding."
status: proposed
proof_mode: integration-test
depends_on: []
decisions: [106]
# Commit 7f19272 authored this parser pair before the original six-file declaration was audited.
# It is merged before this node is rerun/landed, so this is honestly an edit-existing increment.
proof:
  command:
    file: pnpm
    args: ["--filter", "@storytree/library", "test"]
  scope:
    testGlobs:
      - "packages/library/src/uat-tests.test.ts"
    sourceGlobs:
      - "packages/library/src/uat-tests.ts"
  real:
    testFile: "packages/library/src/uat-tests.test.ts"
    sourceFile: "packages/library/src/uat-tests.ts"
    scope:
      testGlobs:
        - "packages/library/src/uat-tests.test.ts"
      sourceGlobs:
        - "packages/library/src/uat-tests.ts"
    install: true
    editsExisting: true
    proofCommand:
      file: pnpm
      args: ["--filter", "@storytree/library", "test"]
    typecheck:
      file: pnpm
      args: ["--filter", "@storytree/library", "typecheck"]
---

# Per-UAT-leg proof-gate parsing

**Outcome —** The Story UAT parser carries each explicit proof-gate annotation into the strict
per-leg model without dropping or inventing a binding.

**Depends on —** nothing within this story. This is the data boundary consumed by
[`uat-machine-gate-resolution`](uat-machine-gate-resolution.md).

> **Proof status (honest) — `proposed`.** Inner-loop run commit `7f19272` touched only
> `packages/library/src/uat-tests.{ts,test.ts}` and implemented the parser increment. The earlier
> six-file capability claimed resolver and adopt contracts that run did not touch or prove
> (verdict coverage 0/3). This node now names only the pair actually placed under the spotlight.
> `editsExisting: true` is required because `7f19272` will be merged before this node is rerun and
> landed. No resolver, command-observation, signing, or witness-label claim is made here.

## Proof walkthrough (written first)

Given Story UAT prose containing machine, human, and either legs:

1. parse a leg carrying `_(proof-gate: drive-machinery#gate-2)_`;
2. observe the exact full id on that parsed `UatTest`;
3. parse a leg with no annotation and observe that the optional field is absent; and
4. present malformed or duplicate proof-gate annotations and observe a parse refusal.

The single observable is the strict parsed UAT model or its explicit parse failure.

## Guidance

Add one optional field to the parsed `UatTest` model:

```ts
proofGateId?: string;
```

The prose syntax is `_(proof-gate: story-id#gate-n)_`. The parser preserves that full id exactly;
it does not infer a gate from ordering, title, package, or `(covers:)`. Absence remains absence.
Malformed or duplicate annotations fail at this parsing boundary rather than being dropped.
Whether a parsed id names an eligible gate is deliberately outside this increment and belongs to
[`uat-machine-gate-resolution`](uat-machine-gate-resolution.md).

## Integration test

**Goal —** The real Story UAT parser preserves one explicit full proof-gate id in the strict model
and refuses malformed authoring without involving gate resolution or the drive.

## Contracts (1)

1. **`parses-explicit-uat-proof-gate`** — the Story UAT parser carries a full per-leg gate id into the strict UAT model.
   - **asserts —** `_(proof-gate: drive-machinery#gate-2)_` parses as
     `proofGateId: "drive-machinery#gate-2"`; absent stays absent; malformed/duplicate annotations
     are refused rather than dropped or guessed.
   - **covers —** `packages/library/src/uat-tests.ts`.
   - **proven by —** `packages/library/src/uat-tests.test.ts`, the literal REAL pair.

## Follow-up machine-witness authoring

Keep every current UAT witness label unchanged. Parsing alone is not machine proof. The separate
follow-up may bind or re-author witnesses only after
[`uat-machine-gate-resolution`](uat-machine-gate-resolution.md) and
[`uat-bound-command-adoption`](uat-bound-command-adoption.md) are both built and proven.
