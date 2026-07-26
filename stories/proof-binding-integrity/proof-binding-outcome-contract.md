---
id: "proof-binding-outcome-contract"
tier: contract
story: proof-binding-integrity
title: "Machine-leg proof binding resolves to an exhaustive evidence-or-refusal outcome"
outcome: "A typed result represents each machine UAT leg as either its declared runnable observe-gate chain or a concrete refusal, with no inferred third state."
status: proposed
proof_mode: contract-test
depends_on: []
decisions: [180, 249]
---

# Machine-leg proof binding resolves to an exhaustive evidence-or-refusal outcome

**Outcome —** A typed result represents each machine UAT leg as either its declared runnable observe-
gate chain or a concrete refusal, with no inferred third state.

## Proof walkthrough (written first)

Given parsed criteria and reliability gates with distinguishable commands:

1. adapt one valid machine resolution and observe the exact full gate id and command argv survive;
2. adapt missing, unknown, non-observe, and commandless cases and observe a distinct refusal reason
   with no command; and
3. attempt to construct an evidence result from any refusal and observe that the contract makes it
   impossible without an eligible resolver result.

The single observable is a discriminated, exhaustive outcome: `evidence` or `refused`.

## Contract

- `evidence` contains `criterionId`, `gateId`, `gateKind: "observe"`, the literal command argv, and
  the derived adoption invocation. It never manufactures argv from prose or package convention.
- `refused` contains `criterionId`, a stable reason (`missing-binding`, `unknown-gate`,
  `ineligible-gate`, or `missing-command`), and the declared gate id where applicable. It contains no
  command or adoption invocation.
- The adapter accepts the existing strict resolver result; it does not parse annotations, choose a
  gate, execute a command, sign an observation, or decide green.

## Integration test

**Goal —** Given the real resolver shapes, a valid binding preserves the exact declared command while
each invalid binding becomes a non-runnable refusal that cannot be rendered as evidence.

## Ownership boundary

The eventual literal source/test pair belongs beside the existing library resolver
(`packages/library/src/witness-resolution.{ts,test.ts}`) unless the landed runtime repair establishes a
new owned proof-binding port. This contract deliberately names the seam, not a premature file edit.
