---
id: "library-standson-schema-admission"
tier: capability
story: library
arc: directional-dag-arc
title: "The knowledge schema admits the authored standsOn dependency edge"
outcome: "Every knowledge kind outside the transient signal tier can carry an authored standsOn edge to a Library artifact or an ADR, while the references citation web and every existing document are unchanged."
status: proposed
proof_mode: integration-test
depends_on: []
decisions: [223]
proof:
  command:
    file: pnpm
    args: ["--filter", "@storytree/library", "test"]
  scope:
    testGlobs: ["packages/library/src/knowledge-standson.test.ts"]
    sourceGlobs: ["packages/library/src/knowledge.ts"]
  real:
    testFile: "packages/library/src/knowledge-standson.test.ts"
    sourceFile: "packages/library/src/knowledge.ts"
    scope:
      testGlobs: ["packages/library/src/knowledge-standson.test.ts"]
      sourceGlobs: ["packages/library/src/knowledge.ts"]
    install: true
    proofCommand:
      file: pnpm
      args: ["--filter", "@storytree/library", "test"]
    typecheck:
      file: pnpm
      args: ["--filter", "@storytree/library", "typecheck"]
---

# The knowledge schema admits the authored `standsOn` dependency edge

**Outcome —** Every knowledge kind outside the transient signal tier can carry an authored
`standsOn` edge to a Library artifact or an ADR, while the `references` citation web and every
existing document are unchanged.

ADR-0223 decided the knowledge DAG is an authored `standsOn` edge, additive to and distinct from
`references`. Increment 1 shipped only the pure cycle detector (`library-dag-acyclic-core`); until
this capability lands, no artifact can carry an edge for it to detect. The `arc: directional-dag-arc`
frontmatter preserves the initiative provenance while the capability lives in `library`, the
canonical story owning `packages/library`.

## Proof walkthrough first

Build a minimal valid document for every kind in `KIND_SPECS`. For each kind outside
`EDGE_FREE_KINDS`, author a `standsOn` carrying one `asset:` and one `doc:` pointer and observe it
round-trip; author `references` and `standsOn` on the same document with overlapping targets and
observe both survive independently. For each edge-free kind, observe that the field is absent from
the kind's schema shape and that authoring it is REFUSED rather than dropped. Exercise the ref shape
directly over legal and illegal pointers, and drive one malformed entry through the real write
boundary to observe a throw. Finally parse every kind's minimal document and observe no `standsOn`
key appears — the absence is preserved, so no migration is owed.

## Build boundary

Author only:

- `packages/library/src/knowledge.ts`
- `packages/library/src/knowledge-standson.test.ts`
- `packages/library/src/index.ts` (barrel re-export only)

The schema module gains `EDGE_FREE_KINDS`, the `StandsOnRef` pointer shape, and the conditional
field in `buildKindSchema`. The field is OPTIONAL, never defaulted, so `CURRENT_SCHEMA_VERSION` does
not move and `migrations.ts` is untouched. Do not edit any store, CLI or Studio source, do not
bootstrap any corpus edge, and do not wire any gate — the corpus gate is
`library-dag-acyclic-corpus-gate`, and the bootstrap and Studio projection are later increments on
`directional-dag-arc`.

## Contracts

1. **`library-standson-admitted-on-dag-kinds`** — the edge exists on the DAG kinds and only there.
   - **asserts —** every kind outside `EDGE_FREE_KINDS` carries `standsOn` in its schema shape and
     round-trips an authored value; `references` and `standsOn` coexist on one document without
     constraining each other; the transient signal kinds carry no such field, and `.strict()` REFUSES
     an authored edge on them rather than silently dropping it.
   - **proven by —** `packages/library/src/knowledge-standson.test.ts`, with a test title beginning
     with this exact contract id.
2. **`library-standson-refs-are-asset-or-adr`** — the edge admits exactly the two target schemes.
   - **asserts —** `asset:<id>` Library pointers and `doc:<relpath>` ADR pointers validate; bare ids,
     `node:` / `story:` / `capability:` work-tree pointers, empty targets and malformed tokens are
     refused; a malformed entry inside the array is refused at the real write boundary.
   - **proven by —** `packages/library/src/knowledge-standson.test.ts`, with a test title beginning
     with this exact contract id.
3. **`library-standson-absence-is-preserved`** — admission owes no migration.
   - **asserts —** parsing a minimal valid document of every kind produces no `standsOn` key, so a
     document authored before ADR-0223 both validates and re-serialises unchanged; and the edit
     surface sees the new field as array-typed, so it is writable through `artifact edit --set`.
   - **proven by —** `packages/library/src/knowledge-standson.test.ts`, with a test title beginning
     with this exact contract id.

## Integration test

Run `pnpm --filter @storytree/library test`, then `pnpm --filter @storytree/library typecheck`. The
proof is literal fixtures against the real zod schema and the real write-boundary validator. No DB,
socket, live Library row, CLI process, filesystem corpus scan, or human witness participates.
