---
id: "library-standson-corpus-bootstrap"
tier: capability
story: library
arc: directional-dag-arc
title: "The one-time standsOn seed projects only down-tier citations, acyclic by construction"
outcome: "A pure projection decides the whole one-time standsOn migration from existing citations, emitting only edges that strictly descend the tier order and a per-reason account of everything it declined, so the corpus can be seeded once without a repair pass and without overwriting curator work."
status: proposed
proof_mode: integration-test
depends_on: ["library-standson-schema-admission"]
decisions: [223, 363]
proof:
  command:
    file: pnpm
    args: ["--filter", "@storytree/library", "test"]
  scope:
    testGlobs: ["packages/library/src/standson-bootstrap.test.ts"]
    sourceGlobs: ["packages/library/src/standson-bootstrap.ts"]
  real:
    testFile: "packages/library/src/standson-bootstrap.test.ts"
    sourceFile: "packages/library/src/standson-bootstrap.ts"
    scope:
      testGlobs: ["packages/library/src/standson-bootstrap.test.ts"]
      sourceGlobs: ["packages/library/src/standson-bootstrap.ts"]
    install: true
    proofCommand:
      file: pnpm
      args: ["--filter", "@storytree/library", "test"]
    typecheck:
      file: pnpm
      args: ["--filter", "@storytree/library", "typecheck"]
---

# The one-time `standsOn` seed projects only down-tier citations, acyclic by construction

**Outcome —** A pure projection decides the whole one-time `standsOn` migration from existing
citations, emitting only edges that strictly descend the tier order and a per-reason account of
everything it declined, so the corpus can be seeded once without a repair pass and without
overwriting curator work.

ADR-0223 dec 5 decided the initial `standsOn` values are bootstrapped once from down-tier citations
and curated thereafter. `library-standson-schema-admission` opened the field; `library-dag-acyclic-corpus-gate`
judges whatever ends up in it. This capability is the seed itself — the function that decides what the
migration WOULD write, over the tier order ADR-0223 dec 3 fixed and ADR-0363 D1 amended by removing
`definition` from the DAG entirely.

**Why the rule lives in a pure function and the applier proves nothing.** The property that makes a
corpus-wide seed safe is structural: every emitted edge strictly descends a total order, and a path
that only ever descends cannot return to its start. That is provable against a literal corpus and
unprovable against a live database nobody can pin down — so the whole rule lives here, exactly as
`library-dag-acyclic-corpus-gate` keeps every rule in its pure judge. The thin applier reads the
store, calls this function, applies the plan through field-scoped `patchDoc` and prints; it carries no
decision of its own and is not part of this capability's proof.

## Proof walkthrough first

Hand the projection literal stored rows. Observe a principle citing a techstack artifact seed
`asset:<id>`, and a `doc:docs/decisions/….md` citation seed a tier-0 edge — ADRs being the bedrock
that cannot be stood on wrongly. Observe a same-tier citation, an up-tier citation and a citation to a
kind outside the DAG each seed nothing at all: the first two are the curation tail ADR-0223 dec 5
hands to curators, the third is the arbitrary-winner problem ADR-0363 D1 refused to solve by
guessing. Then hand it a DELIBERATELY cyclic citation web — the mutual pairs the live corpus actually
carries — project it, feed the seeded edges to the shipped detector, and observe it reports clean;
that is the whole reason a one-shot seed needs no repair pass. Hand it an artifact a curator has
already edited and observe it skipped whole and counted, so a re-run mid-curation reverts nothing.
Finally read the plan's own numbers — documents scanned, edges planned, and one count per skip reason
— and observe a bare `doc:0241` land in `malformed` rather than in the corpus.

## Build boundary

Author only:

- `packages/library/src/standson-bootstrap.ts` (the pure projection and the tier order)
- `packages/library/src/standson-bootstrap.test.ts`
- `packages/library/src/index.ts` (barrel re-export only)
- `packages/library/src/knowledge.ts` (the `definition` addition to `EDGE_FREE_KINDS`, ADR-0363 D1)
- `packages/cli/src/standson-bootstrap.ts`, `package.json` (the applier wiring)

Every rule lives in the pure projection; the applier reads the live store, applies the plan and
prints. Do NOT write a second detector — the acyclicity claim is proven by feeding this projection's
output to the shipped `findStandsOnCycles`, which `library-dag-acyclic-core` owns. Do not touch the
Studio: rendering the seeded DAG is the next increment, `standson-studio-projection`.

## Contracts

1. **`library-standson-bootstrap-seeds-only-down-tier-citations`** — an edge is a strict descent.
   - **asserts —** a citation to a strictly lower tier seeds an `asset:<id>` edge and a
     `doc:<relpath>` ADR citation seeds a tier-0 edge; a same-tier and an up-tier citation each seed
     nothing; a citation to a kind outside the DAG — `definition` (ADR-0363 D1), `friction`,
     `open-question`, the never-placed `uat-criterion` — seeds nothing, so the seed points only at
     what the tier order actually ranks.
   - **proven by —** `packages/library/src/standson-bootstrap.test.ts`, with a test title beginning
     with this exact contract id.
2. **`library-standson-bootstrap-is-acyclic-by-construction`** — the seed cannot author a cycle.
   - **asserts —** a deliberately CYCLIC citation web driven through the projection yields a plan the
     shipped detector (`findStandsOnCycles`) reports clean, because every seeded edge strictly
     descends the tier order; so a corpus-wide seed is safe without a repair pass, and the corpus gate
     is left judging authored curation rather than the migration's own output.
   - **proven by —** `packages/library/src/standson-bootstrap.test.ts`, with a test title beginning
     with this exact contract id.
3. **`library-standson-bootstrap-never-overwrites-authored-edges`** — curation outranks the seed.
   - **asserts —** an artifact already carrying a non-empty `standsOn` is skipped WHOLE and counted
     rather than merged or replaced, so the migration cannot revert a curator's hand-authored
     same-tier edges and re-running it after curation has begun is safe.
   - **proven by —** `packages/library/src/standson-bootstrap.test.ts`, with a test title beginning
     with this exact contract id.
4. **`library-standson-bootstrap-reports-what-it-skipped`** — a thin plan is explained, not guessed.
   - **asserts —** the plan carries `docsScanned` and `edgesPlanned` alongside a count per skip reason
     — `sameTier`, `upTier`, `targetOutsideDag`, `targetAbsent`, `malformed`, `alreadyAuthored` — so a
     small yield can be read rather than assumed a bug; a bare `doc:0241` that is not a relpath counts
     as `malformed` and is never written, since a pointer the schema would reject must be dropped
     where it can be reported rather than at the write.
   - **proven by —** `packages/library/src/standson-bootstrap.test.ts`, with a test title beginning
     with this exact contract id.

## Integration test

Run `pnpm --filter @storytree/library test`, then `pnpm --filter @storytree/library typecheck`. The
proof is literal stored rows against the real projection and the real shipped cycle detector. No DB,
socket, live Library row, CLI process or human witness participates — the applier's live run is an
operation, not this capability's evidence.
