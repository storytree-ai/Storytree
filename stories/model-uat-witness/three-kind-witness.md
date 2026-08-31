---
id: "three-kind-witness"
tier: capability
story: model-uat-witness
arc: model-uat-promotion
title: "A classified UAT criterion uses machine, model, or human while legacy either remains unresolved"
outcome: "A new or migrated UAT criterion explicitly classifies as machine, model, or human while an existing untagged criterion remains parseable only as legacy-unresolved either until migration and can never default into model judgment."
# RETIRED 2026-08-20 with its parent story (ADR-0247 D5, which names that story on its retirement
# worklist by id). The code is NOT unmounted by this flip — ADR-0247 D5 makes each package retirement
# its own provable unit, and that unit is still open.
status: retired
proof_mode: integration-test
depends_on: []
decisions: [209, 192, 82, 106]
# Node-borne proof config (ADR-0057 / ADR-0192 packages-forward). NET-NEW pair in this story's own
# `@storytree/model-uat` package: AUTHOR_TEST writes criterion.test.ts importing the missing
# criterion.ts; IMPLEMENT authors the parser/validator. The assertions pin explicit `model`
# classification alongside legacy-only unresolved `either` compatibility. `install: true` is
# required for zod/tsx; typecheck closes the tsx type-stripping gap.
# PROOF BINDING REMOVED 2026-08-31 — the package it named is gone. `@storytree/model-uat` was DELETED
# by `model-uat-family-consolidation-arc` increment 2 (ADR-0247 D5's THIRD and last package
# retirement), so the `proof:` block that stood here bound a `pnpm --filter` target that no longer
# resolves. Leaving it would not have been inert: a dead `--filter` EXITS 0 WITHOUT RUNNING, which is
# a proof command that can only ever report success. `check:verification-decay`'s
# `contract-binding-drift` instrument (ceiling 0) and the `coverage-drain` sweep both red on exactly
# that, and ADR-0252 D3 forbids raising a ceiling to absorb it — of the three sanctioned drains
# (author a test, split/retire, repair the binding), only REPAIR applies: this node was already
# `status: retired`, which by itself cleared nothing because no instrument filters on it.
# ⚠ REPAIR here could not mean REPOINTING. The `criterion.ts` / `criterion.test.ts` pair this node
# bound was not deleted — it was LIFTED into `packages/uat-criterion/src/`, which the LIVE story
# `uat-criterion-detail` owns. Re-binding a retired node at a live story's building would be exactly
# the ADR-0192 squat the landlord rule forbids, and it would assert that a retired capability's
# proofs cover a file another story is responsible for. The parser's standing proof is
# `uat-criterion-detail`'s package suite, where the moved test now runs.
#
# The node is KEPT as a browsable row, per ADR-0247 D2 (a retirement, not a deletion). It simply no
# longer registers a real-build surface — the shape `stories/model-uat-pilot` took in increment 1.
---

# A classified UAT criterion uses machine, model, or human while legacy either remains unresolved

**Outcome —** A new or migrated UAT criterion explicitly classifies as `machine`, `model`, or `human`
while an existing untagged criterion remains parseable only as legacy-unresolved `either` until
migration and can never default into model judgment.

## Guidance

- Author the criterion parser/validator in the story-owned
  `packages/model-uat/src/criterion.ts`. Preserve the current Library parser's externally-observed
  legacy behaviour as the compatibility contract: untagged criteria parse to unresolved `either`.
  ADR-0209 D1 adds `model` as a DISTINCT third classified kind; new and migrated criteria classify
  explicitly as `machine | model | human`. The later completed corpus migration, not this increment,
  removes `either`. Moving existing consumers behind this port is later integration glue, not a
  proof-bound edit to the foreign `packages/library` building.
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
- Pure, no I/O: a parser + a zod enum. Test-author ≠ code-author (`criterion.test.ts` →
  `criterion.ts` is the red→green pair). Consumers to keep honest downstream (NOT this
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
