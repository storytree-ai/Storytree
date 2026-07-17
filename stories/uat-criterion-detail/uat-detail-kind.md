---
id: "uat-detail-kind"
tier: capability
story: uat-criterion-detail
arc: model-uat-promotion
title: "A detailed UAT criterion is a structured Library artifact kind"
outcome: "A detailed UAT criterion validates as a structured Library artifact kind whose body carries action, success conditions, evidence expectations, and optional refs to reusable principles/processes — and refuses a malformed or title-redefining body."
status: proposed
proof_mode: integration-test
depends_on: []
decisions: [209, 55, 192]
# Node-borne proof config (ADR-0057 / ADR-0192 packages-forward). NET-NEW pair in this story's own
# `@storytree/uat-criterion` package: AUTHOR_TEST writes detail-kind.test.ts importing the missing
# detail-kind.ts; IMPLEMENT authors the zod kind schema. `install: true` for zod/tsx; typecheck
# closes the tsx type-stripping gap. No DB.
proof:
  command:
    file: pnpm
    args: ["--filter", "@storytree/uat-criterion", "test"]
  scope:
    testGlobs: ["packages/uat-criterion/src/detail-kind.test.ts"]
    sourceGlobs: ["packages/uat-criterion/src/detail-kind.ts"]
  real:
    testFile: "packages/uat-criterion/src/detail-kind.test.ts"
    sourceFile: "packages/uat-criterion/src/detail-kind.ts"
    scope:
      testGlobs: ["packages/uat-criterion/src/detail-kind.test.ts"]
      sourceGlobs: ["packages/uat-criterion/src/detail-kind.ts"]
    install: true
    editsExisting: true
    typecheck:
      file: pnpm
      args: ["--filter", "@storytree/uat-criterion", "typecheck"]
---

# A detailed UAT criterion is a structured Library artifact kind

**Outcome —** A detailed UAT criterion validates as a structured Library artifact kind whose body
carries action, success conditions, evidence expectations, and optional refs to reusable
principles/processes — and refuses a malformed or title-redefining body.

## Guidance

- Author the detail-kind schema in the story-owned `packages/uat-criterion/src/detail-kind.ts`. The
  kind id is the stable Library kind string for this seed-canonical class (settle the exact spelling
  at build — e.g. `uat-criterion` — and keep it one exported constant so sync / pointer / fence all
  share it).
- **Body fields (ADR-0209 D5):** required action, success conditions, and evidence expectations;
  optional references to reusable Library principles/processes (`asset:` refs). These are the
  proof-bearing fields later hashed by `criterion-detail-hash-anchor`.
- **Not a second title authority (ADR-0209 D6):** the story owns the display-canonical one-line
  title. The detail schema must not offer a competing canonical-title field that silently redefines
  the story criterion's one-liner — refuse or omit any such field at the schema boundary.
- **Port, not KIND_SPECS squat:** this capability proves the zod DATA shape the Library will later
  register. Registering the kind in `@storytree/library`'s `KIND_SPECS` / `KnowledgeKind` is
  consumer-side glue after the port is green (ADR-0192 — no proof source under `packages/library`).
- Pure, no I/O: zod schema + helpers. Test-author ≠ code-author (`detail-kind.test.ts` →
  `detail-kind.ts`).

## Contracts (3)

1. **`detail-kind-round-trips-proof-bearing-body`** — a well-formed detail validates
   - **asserts —** a doc with the detail kind, stable id, and required action / success / evidence
     (plus optional principle/process refs) parses through the zod schema and round-trips; the kind
     constant is exported for sync/pointer/fence consumers.
2. **`detail-kind-refuses-malformed`** — malformed bodies are refused at the boundary
   - **asserts —** missing required proof-bearing fields, an empty action/success/evidence, or an
     unknown field under `.strict()` is refused — never coerced or defaulted into a fake green
     contract.
3. **`detail-kind-refuses-title-redefinition`** — the detail is not a second title authority
   - **asserts —** a payload that attempts to carry a competing display-canonical title field (or
     otherwise redefine the story criterion's one-liner) is refused or structurally impossible at the
     schema boundary (ADR-0209 D6).
