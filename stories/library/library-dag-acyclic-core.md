---
id: "library-dag-acyclic-core"
tier: capability
story: library
arc: directional-dag-arc
title: "A pure cycle detector for authored Library standsOn edges"
outcome: "A pure function identifies cycles in an in-memory standsOn graph while leaving the references citation web outside the dependency relation."
status: proposed
proof_mode: integration-test
depends_on: []
decisions: [223]
proof:
  command:
    file: pnpm
    args: ["--filter", "@storytree/library", "test"]
  scope:
    testGlobs: ["packages/library/src/knowledge-dag.test.ts"]
    sourceGlobs: ["packages/library/src/knowledge-dag.ts"]
  real:
    testFile: "packages/library/src/knowledge-dag.test.ts"
    sourceFile: "packages/library/src/knowledge-dag.ts"
    scope:
      testGlobs: ["packages/library/src/knowledge-dag.test.ts"]
      sourceGlobs: ["packages/library/src/knowledge-dag.ts"]
    install: true
    proofCommand:
      file: pnpm
      args: ["--filter", "@storytree/library", "test"]
    typecheck:
      file: pnpm
      args: ["--filter", "@storytree/library", "typecheck"]
---

# A pure cycle detector for authored Library `standsOn` edges

**Outcome —** A pure function identifies cycles in an in-memory `standsOn` graph while leaving the
`references` citation web outside the dependency relation.

The `arc: directional-dag-arc` frontmatter preserves this increment's initiative provenance while
the capability lives in `library`, the canonical story owning `packages/library`.

## Proof walkthrough first

Create literal nodes with stable ids and authored `standsOn` targets. Pass an empty graph and a
branching acyclic graph to the detector and observe no cycles. Pass self-loop, two-node, and longer
cycle fixtures and observe concrete closed paths. Finally pass objects carrying mutually cyclic
`references` but acyclic `standsOn`; observe no cycle, proving the two edge types are not conflated.
All observations happen in one `node:test` file against one pure source module.

## Build boundary

Author only:

- `packages/library/src/knowledge-dag.ts`
- `packages/library/src/knowledge-dag.test.ts`

The source module defines a minimal graph-node input carrying `id` and `standsOn` and exports the
pure cycle-detection function. It performs no I/O and imports no schema, store, CLI, renderer, or
Node-only module. The test uses literal fixtures under the existing `@storytree/library` `node:test`
suite. The genuine RED is the test's import of the missing `./knowledge-dag.js` module; GREEN is the
new pure implementation satisfying every contract below.

Do not edit `knowledge.ts`, `index.ts`, any store/write/migration module, any CLI source, any Studio
source, or any corpus artifact. Public barrel export, schema admission, write-boundary enforcement,
corpus-gate wiring, bootstrap, and rendering are later capabilities.

## Contracts

1. **`library-dag-accepts-acyclic-standson`** — acyclic authored dependencies return no cycles.
   - **asserts —** the empty graph, isolated nodes, and a branching graph with shared foundations all
     produce an empty cycle list; input nodes and edge arrays are not mutated.
   - **proven by —** `packages/library/src/knowledge-dag.test.ts`, with a test title beginning with
     this exact contract id.
2. **`library-dag-rejects-standson-cycle-with-path`** — every dependency cycle is returned as a
   concrete closed path.
   - **asserts —** a self-loop, a two-node cycle, and a longer cycle each produce a path whose first
     and last id match and whose consecutive ids follow authored `standsOn` edges; a cycle reachable
     from an acyclic entry is still found, and the same cycle is not duplicated merely because more
     than one entry reaches it.
   - **proven by —** `packages/library/src/knowledge-dag.test.ts`, with a test title beginning with
     this exact contract id.
3. **`library-dag-references-are-not-dependencies`** — citation cycles do not participate in
   dependency acyclicity.
   - **asserts —** node fixtures may carry extra `references` arrays that mutually cite; when their
     `standsOn` edges are acyclic, the detector returns no cycles. Adding the same loop to `standsOn`
     makes it report a cycle.
   - **proven by —** `packages/library/src/knowledge-dag.test.ts`, with a test title beginning with
     this exact contract id.

## Integration test

Run `pnpm --filter @storytree/library test`. The standing `knowledge-dag.test.ts` proof calls the
pure function over the fixtures above and carries each contract id verbatim in a distinct test
title. Then run `pnpm --filter @storytree/library typecheck`. No DB, socket, live Library row, CLI
process, filesystem corpus scan, or human witness participates.
