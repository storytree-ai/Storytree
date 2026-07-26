---
id: "machine-leg-binding-audit"
tier: capability
story: proof-binding-integrity
title: "Audit every machine UAT leg into a proof-binding outcome"
outcome: "A corpus audit emits exactly one evidence-or-refusal outcome for every parsed machine UAT leg, retaining refused claims instead of omitting or repairing them."
status: proposed
proof_mode: integration-test
depends_on: [proof-binding-outcome-contract]
decisions: [180, 249]
---

# Audit every machine UAT leg into a proof-binding outcome

**Outcome —** A corpus audit emits exactly one evidence-or-refusal outcome for every parsed machine
UAT leg, retaining refused claims instead of omitting or repairing them.

## Proof walkthrough (written first)

Given a small disk-canonical corpus with two valid machine legs, four differently invalid machine legs,
and human/undecided controls:

1. parse the corpus through the existing criterion and gate readers;
2. audit every machine leg through the proof-binding outcome contract;
3. observe one result per machine leg, including every refusal; and
4. add a machine leg without a proof annotation and observe the report grow by one explicit refusal,
   rather than borrowing a nearby gate or dropping the row.

The single observable is the complete, deterministically ordered audit report.

## Guidance

The audit has a closed population: parsed criteria whose witness is explicitly `machine`. It identifies
each row by story id plus criterion id, preserves source location/provenance for a reader, and delegates
eligibility to the strict resolver. Its result is read-only diagnostic data. It must not mutate story
frontmatter, add annotations, change a witness, create a gate, invoke `gate run`, or treat a current
passing suite as proof for an unbound row.

## Integration test

**Goal —** Corpus fixtures prove completeness and refusal retention: valid rows keep their literal
chain; every invalid machine binding yields its own stated refusal; non-machine criteria create no row.

## Contracts (1)

1. **`accounts-for-every-machine-leg`** — the audit's population is every and only parsed machine UAT
   criteria.
   - **asserts —** row count equals the machine-criterion count; valid rows carry their declared
     chain; missing/unknown/ineligible/commandless bindings remain rows with their matching refusal.
   - **proven by —** a fixture corpus with deliberately reordered gates and all four refusal cases.

## Implementation boundary

The successor owns only an additive audit/projection seam. It consumes the disk hierarchy and existing
`packages/library` parser/resolver behaviour; it does not revise either. If audit collection needs a
CLI or API adapter, that adapter is consumer glue after this capability's pure completeness proof,
not a reason to widen this capability into runtime presentation.
