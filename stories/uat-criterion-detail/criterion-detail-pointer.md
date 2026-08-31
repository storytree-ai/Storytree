---
id: "criterion-detail-pointer"
tier: capability
story: uat-criterion-detail
arc: model-uat-promotion
title: "A story criterion points to its detail artifact without ceding the one-liner"
outcome: "A story criterion points to its detail artifact by id while the story remains display-canonical for the one-line title; the detail cannot silently redefine that title."
status: proposed
proof_mode: integration-test
depends_on: [uat-detail-kind]
decisions: [209, 82, 192]
# Node-borne proof config (ADR-0057 / ADR-0192). NET-NEW pair in packages/uat-criterion: binds a
# `Criterion` to a detail artifact id. The `Criterion` shape it binds came from
# `@storytree/model-uat` until 2026-08-31, when ADR-0247 D5 retired that package and the parser was
# lifted into this same building (`packages/uat-criterion/src/criterion.ts`) — so this is now an
# in-story sibling import, and the declared story edge moved to `proof-protocol`, the real provider.
proof:
  command:
    file: pnpm
    args: ["--filter", "@storytree/uat-criterion", "test"]
  scope:
    testGlobs: ["packages/uat-criterion/src/criterion-pointer.test.ts"]
    sourceGlobs: ["packages/uat-criterion/src/criterion-pointer.ts"]
  real:
    testFile: "packages/uat-criterion/src/criterion-pointer.test.ts"
    sourceFile: "packages/uat-criterion/src/criterion-pointer.ts"
    scope:
      testGlobs: ["packages/uat-criterion/src/criterion-pointer.test.ts"]
      sourceGlobs: ["packages/uat-criterion/src/criterion-pointer.ts"]
    install: true
    typecheck:
      file: pnpm
      args: ["--filter", "@storytree/uat-criterion", "typecheck"]
---

# A story criterion points to its detail artifact without ceding the one-liner

**Outcome —** A story criterion points to its detail artifact by id while the story remains
display-canonical for the one-line title; the detail cannot silently redefine that title.

## Guidance

- Author `packages/uat-criterion/src/criterion-pointer.ts`: the binding between a
  `Criterion` (stable id, one-line title, witness, optional tier) from the sibling
  `packages/uat-criterion/src/criterion.ts` and a detail artifact id of the kind `uat-detail-kind`
  defines.
- **Story remains authority (ADR-0209 D5):** the pointer adds `detailArtifactId` (or equivalent) onto
  the criterion surface this port owns — it does NOT move witness/tier ownership out of the
  criterion module, and it does NOT treat the detail body as the display title source.
- **Display-canonical title (ADR-0209 D6):** `displayTitle(binding)` (or equivalent) returns the
  story criterion's one-liner even when the detail body contains longer procedural prose. A helper
  that would prefer the detail's prose as the canonical title is forbidden.
- **Parse surface (settle at build):** extend the criterion annotation grammar so a story UAT leg can
  declare its pointer (e.g. a `(detail: <artifact-id>)` tag alongside witness/tier) OR provide an
  explicit bind API the later library/story parser glue will call — either way, the port must make
  the pointer first-class and validated (unknown / empty detail ids refused).
- **The Criterion object is now an in-story sibling, not a foreign building.** This fence used to
  read "do not edit `packages/model-uat`"; that package was deleted on 2026-08-31 (ADR-0247 D5) and
  its parser lifted into `packages/uat-criterion/src/criterion.ts`, which this story owns. A field
  the shared Criterion zod object needs is an ordinary edit here — no longer a squat, and no longer
  an amend of `model-uat-witness`. What the pointer must still NOT do is reclassify: it adds
  `detailArtifactId`, it never rewrites witness or tier.
- Pure validation + bind helpers. Test-author ≠ code-author.

## Contracts (3)

1. **`criterion-binds-detail-id`** — a criterion points at a detail artifact
   - **asserts —** binding a valid criterion + detail id yields a resolved pointer; an empty or
     missing detail id is refused at the boundary.
2. **`story-title-remains-display-canonical`** — the one-liner does not move to the artifact
   - **asserts —** given a criterion title T and a detail body whose prose differs from T, the
     display-canonical title helper returns T (ADR-0209 D6).
3. **`pointer-preserves-witness-and-tier`** — classification is unchanged by the pointer
   - **asserts —** a bound criterion still reports the same witness (and tier when `model`) the
     parsed criterion carried — the pointer is additive, never a reclassification.
