---
id: "uat-criterion-library-surface"
tier: capability
story: model-uat-pilot
arc: model-uat-promotion
title: "Library recognizes uat-criterion as a first-class kind"
outcome: "Library recognizes `uat-criterion` as a first-class kind (`KnowledgeKind` + `KIND_SPECS`) so a detail artifact resolves through the Library kind tables like every other live-canonical kind."
# RETIRED 2026-08-20 with its parent story (ADR-0247 D5, which names that story on its retirement
# worklist by id). The code is NOT unmounted by this flip — ADR-0247 D5 makes each package retirement
# its own provable unit, and that unit is still open.
status: retired
proof_mode: integration-test
depends_on: []
decisions: [209, 192, 307]
# Hosted in @storytree/library (ADR-0192 foreign-building honesty): deferred consumer glue from
# uat-criterion-detail. AUTHOR_TEST extends library knowledge/schema tests; IMPLEMENT adds the
# kind to KnowledgeKind + KIND_SPECS (+ minimal seed-path / sync recognition if required for
# validateLibraryDoc). Consumes the field shape already proven in @storytree/uat-criterion
# (action / successConditions / evidenceExpectations / refs) — do not fork a second schema.
proof:
  command:
    file: pnpm
    args: ["--filter", "@storytree/library", "test"]
  scope:
    testGlobs: ["packages/library/src/knowledge.test.ts"]
    sourceGlobs: ["packages/library/src/knowledge.ts"]
  real:
    testFile: "packages/library/src/knowledge.test.ts"
    sourceFile: "packages/library/src/knowledge.ts"
    editsExisting: true
    scope:
      testGlobs: ["packages/library/src/knowledge.test.ts"]
      sourceGlobs: ["packages/library/src/knowledge.ts"]
    install: true
    typecheck:
      file: pnpm
      args: ["--filter", "@storytree/library", "typecheck"]
    proofCommand:
      file: pnpm
      args: ["--filter", "@storytree/library", "test"]
---

# Library recognizes uat-criterion as a first-class kind

**Outcome —** Library recognizes `uat-criterion` as a first-class kind (`KnowledgeKind` +
`KIND_SPECS`) so a detail artifact resolves through the Library kind tables like every other
live-canonical kind.

**Re-pointed by ADR-0307 D5 (2026-08-05).** This capability originally carried a second half — "and
the seed-kinds directory layout is the admitted detail surface" — naming
`apps/studio/data/seed-kinds/uat-criterion/` and the constant `UAT_CRITERION_DETAIL_SEED_DIR`. That
half is withdrawn: the directory and the constant are deleted, and a detail body is a live-store
artifact (`library artifact new|edit <id> --pg`). The SURVIVING and still-true half is the one that
mattered — `uat-criterion` is a real `KnowledgeKind` with a `KIND_SPECS` entry, resolvable through
the Library kind tables. Registration is what makes the pointers resolvable now; the directory never
was the thing that made the kind first-class.

## Guidance

- Edit `packages/library/src/knowledge.ts`: add `"uat-criterion"` to `KnowledgeKind` and a
  `KIND_SPECS` entry whose required fields match the landed `@storytree/uat-criterion`
  `UatCriterionDetail` body — `action`, `successConditions`, `evidenceExpectations`, optional
  `refs` — and deliberately **omit** any title-shaped field (ADR-0209 D6).
- Keep schema parity with the port: Library's kind table is the Studio/CLI recognition surface;
  the zod authority for detail validation remains `@storytree/uat-criterion`. Prefer adapting /
  re-exporting over duplicating refine rules when a thin adapter suffices.
- **No seed surface, and do not re-introduce one (ADR-0307 D5).** There is no admitted detail
  DIRECTORY: `apps/studio/data/seed-kinds/uat-criterion/`, the `UAT_CRITERION_DETAIL_SEED_DIR`
  constant, and `reconcileDetails` are all deleted. Registration alone is the surface. A detail body
  is written with `storytree library artifact new|edit <id> --pg` through the ordinary
  library-edit ceremony — the same one every other kind uses (ADR-0023 / ADR-0302 D1).
- **No `sync-…` / `check:…-sync` CLI surface.** That whole family was deleted by ADR-0302 D4 /
  ADR-0307 D3, and nothing about this kind earns it back: with the store canonical there is no
  second copy to reconcile against and no drift to detect. If this capability seems to need one, the
  requirement is wrong, not the decision.
- Test-author ≠ code-author: extend `knowledge.test.ts` (KIND_SPECS ↔ zod parity) first.

## Contracts (3)

1. **`uat-criterion-is-knowledge-kind`** — the kind is enumerated
   - **asserts —** `"uat-criterion"` ∈ `KnowledgeKind` and `KIND_SPECS["uat-criterion"]` exists.
2. **`uat-criterion-kind-specs-match-detail-body`** — field table matches the port
   - **asserts —** required KIND_SPECS fields cover action / successConditions /
     evidenceExpectations; no title-shaped lead field is present (ADR-0209 D6).
3. **`uat-criterion-detail-resolves-through-the-kind-tables`** — registration is the surface
   - **asserts —** a well-formed detail doc validates through `validateLibraryDoc` under kind
     `uat-criterion` and is addressable by id through the Library kind tables — with no directory,
     seed constant, or reconciler in the path (ADR-0307 D5).
