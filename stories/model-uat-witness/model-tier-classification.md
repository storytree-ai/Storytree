---
id: "model-tier-classification"
tier: capability
story: model-uat-witness
arc: model-uat-promotion
title: "A model criterion declares a minimum capability tier — advanced or frontier, nothing below"
outcome: "A model criterion declares a minimum capability tier of advanced or frontier; a non-model criterion carries none, and a tier below the advanced floor or an unknown tier is refused at the parse boundary."
status: proposed
proof_mode: integration-test
depends_on: [three-kind-witness]
decisions: [209, 192]
# Node-borne proof config (ADR-0057 / ADR-0192). This is the second sequential EDIT-EXISTING increment
# over the story-owned criterion pair: after three-kind-witness lands, runtime assertions add model-tier syntax,
# required/exclusive field refinement, advanced floor, and the legacy-`either` no-tier fence. The
# unchanged parser must RED those assertions before IMPLEMENT edits it. The whole package suite is
# the regression oracle; install + typecheck are required for the dependency-bearing model-uat package.
proof:
  command:
    file: pnpm
    args: ["--filter", "@storytree/model-uat", "test"]
  scope:
    testGlobs: ["packages/model-uat/src/criterion.test.ts"]
    sourceGlobs: ["packages/model-uat/src/criterion.ts"]
  real:
    testFile: "packages/model-uat/src/criterion.test.ts"
    sourceFile: "packages/model-uat/src/criterion.ts"
    scope:
      testGlobs: ["packages/model-uat/src/criterion.test.ts"]
      sourceGlobs: ["packages/model-uat/src/criterion.ts"]
    install: true
    editsExisting: true
    proofCommand:
      file: pnpm
      args: ["--filter", "@storytree/model-uat", "test"]
    typecheck:
      file: pnpm
      args: ["--filter", "@storytree/model-uat", "typecheck"]
---

# A model criterion declares a minimum capability tier — advanced or frontier, nothing below

**Outcome —** A `model` criterion declares a minimum capability tier of `advanced` or `frontier`; a
non-model criterion carries none, and a tier below the `advanced` floor or an unknown tier is refused
at the parse boundary.

## Guidance

- Extends the criterion schema in `packages/model-uat/src/criterion.ts` (built on
  `three-kind-witness`'s committed reshape) with a preclassified minimum-tier field, plus its parser
  annotation (e.g. `(witness: model, tier: advanced)` — settle the exact surface syntax at build,
  reusing the existing `WITNESS_TAG` parsing shape; recommend a `tier:` sub-key or a second
  `(tier: …)` annotation).
- **Two tiers, ordered** (ADR-0209 D2): `advanced` (a registered Opus-class or approved-equivalent
  judge) < `frontier` (Fable today). Model the tier as an ORDERED enum so `model-eligibility-registry`
  can compute "at least this tier" (substitute-upward) — but keep the *ordering* comparison in the
  registry capability; this capability owns only the field, its allowed values, and the refusals.
- **The `advanced` floor is a hard bar** (ADR-0209 D2): anything below `advanced` is prohibited from
  judging UAT. A criterion declaring a below-`advanced` tier (or an unknown tier string) is refused at
  the parse boundary — never accepted, never silently clamped up to `advanced`.
- **Tier is meaningful only on classified `model`** (ADR-0209 D1/D2): a `machine`, `human`, or
  legacy-unresolved `either` criterion carrying a tier is refused (the tier field is exclusive to
  `model`); a `model` criterion with no tier is refused (a model witness with no preclassified minimum
  is exactly the ambiguity ADR-0209 D2 forbids). This is the hard fence that keeps legacy
  compatibility from becoming model judgment by default.
- Pure, no I/O: a zod refinement + parser extension. The story-owned `criterion.test.ts` is the
  red→green pair; test-author ≠ code-author.

## Contracts (3)

1. **`model-declares-min-tier`** — a model criterion carries a required tier ∈ {advanced, frontier}
   - **asserts —** a `(witness: model)` criterion tagged `advanced` parses tier `advanced` and one
     tagged `frontier` parses tier `frontier`; a `model` criterion with NO tier is refused (a
     model witness must preclassify its minimum tier, ADR-0209 D2).
2. **`below-advanced-barred`** — a tier below the floor or an unknown tier is refused at the boundary
   - **asserts —** a criterion declaring a tier below `advanced` (or an unrecognised tier string) is
     REFUSED at the parse boundary — never accepted and never silently clamped to `advanced` (the
     `advanced` allowlist floor, ADR-0209 D2).
3. **`tier-only-on-model`** — tier is exclusive to the model witness kind
   - **asserts —** a `machine`, `human`, or legacy-unresolved `either` criterion that carries a tier
     is refused; only an explicitly classified `model` criterion may declare one (legacy
     compatibility can never enter model judgment by acquiring a tier).
