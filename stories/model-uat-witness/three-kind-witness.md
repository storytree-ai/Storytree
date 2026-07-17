---
id: "three-kind-witness"
tier: capability
story: model-uat-witness
title: "A classified UAT criterion uses machine, model, or human while legacy either remains unresolved"
outcome: "A new or migrated UAT criterion explicitly classifies as machine, model, or human while an existing untagged criterion remains parseable only as legacy-unresolved either until migration and can never default into model judgment."
status: proposed
proof_mode: integration-test
depends_on: []
decisions: [209, 82, 106]
---

# A classified UAT criterion uses machine, model, or human while legacy either remains unresolved

**Outcome —** A new or migrated UAT criterion explicitly classifies as `machine`, `model`, or `human`
while an existing untagged criterion remains parseable only as legacy-unresolved `either` until
migration and can never default into model judgment.

## Guidance

- This RESHAPES the existing per-criterion witness enum in
  `packages/library/src/uat-test-criteria.ts` (brownfield edit-existing red→green). Today
  `UAT_TEST_CRITERION_WITNESSES = ["human", "machine", "either"]` with `either` the conservative
  default (ADR-0044/0106). ADR-0209 D1 adds `model` as a DISTINCT third classified kind. Increment 1
  preserves `either` only as a legacy parse/unresolved compatibility state; new and migrated
  criteria classify explicitly as `machine | model | human`. The later completed corpus migration,
  not this increment, removes `either`.
- **`model` is not a spelling of `machine`** (ADR-0209 D1): the enum, the type, and every downstream
  switch must treat it as its own kind. Existing deterministic `machine` proofs and their
  reliability-gate bindings keep their current semantics untouched.
- **Legacy compatibility without model default** (ADR-0209 D8): the parser continues mapping an
  existing untagged criterion to legacy-unresolved `either`, preserving current conservative handling
  until explicit migration. That state may not carry a model tier, enter the model-judge route, or be
  treated as classified green. New and migrated criteria must carry an explicit
  `machine | model | human` witness. Keep the state visibly unresolved so migration can find it.
- An explicit-but-invalid witness value (e.g. `(witness: nobody)`) is refused as it is today — keep
  the refuse-don't-default behaviour, widen the accepted set to the three kinds.
- Pure, no I/O: a parser + a zod enum. Test-author ≠ code-author (the reshaped
  `uat-test-criteria.test.ts` is the red→green pair). Consumers to keep honest downstream (NOT this
  capability's scope, flagged for the judge/pilot increments): the drive's `witness-resolution.ts` and
  any binary `human|machine` assumption in the adopt/rollup path.

## Contracts (3)

1. **`model-is-a-distinct-classified-witness`** — classified criteria admit `model` as its own kind
   - **asserts —** a criterion tagged `(witness: model)` parses to witness `model`, distinct from both
     `machine` and `human`; the three kinds each round-trip through the parser + zod validator; `model`
     is never coerced to or conflated with `machine`.
2. **`legacy-either-stays-unresolved`** — an existing untagged criterion remains parseable but never becomes model by default
   - **asserts —** an existing criterion with no witness tag parses as legacy-unresolved `either` and
     continues the current conservative path; it carries no model tier, cannot enter model judgment,
     and remains due for explicit migration. A new or migrated criterion must explicitly declare one
     of the three classified kinds.
3. **`witness-enum-refuses-unknown`** — an explicit invalid witness value is refused at the boundary
   - **asserts —** an explicit `(witness: <unknown>)` value is refused at the parse boundary (not
     coerced or dropped); classified values are exactly `machine | model | human`, with `either`
     accepted only through the legacy untagged compatibility path until corpus migration completes.
