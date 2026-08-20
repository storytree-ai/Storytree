---
id: "pilot-detail-seed"
tier: capability
story: model-uat-pilot
arc: model-uat-promotion
title: "Every pilot criterion points at a live-canonical detail artifact"
outcome: "Every pilot criterion carries a `(detail: …)` pointer that resolves to a validating `uat-criterion` detail artifact in the live Library."
# RETIRED 2026-08-20 with its parent story (ADR-0247 D5, which names that story on its retirement
# worklist by id). The code is NOT unmounted by this flip — ADR-0247 D5 makes each package retirement
# its own provable unit, and that unit is still open.
status: retired
proof_mode: integration-test
depends_on: [uat-criterion-library-surface, pilot-criteria-classified]
decisions: [209, 307, 192]
# Corpus pair: (detail:) tags on the three story.md files (a FILE write) + the detail bodies
# themselves, which since ADR-0307 D5 are LIVE Library artifacts written with `library artifact
# new|edit <id> --pg`, not committed JSON. Only the story-side half is a write-scoped path below;
# the detail half is authored through the library-edit ceremony. Proof observes via
# parseCriterionPointers + UatCriterionDetail against the store.
proof:
  command:
    file: pnpm
    args: ["--filter", "@storytree/model-uat-pilot", "test"]
  scope:
    testGlobs: ["packages/model-uat-pilot/src/pilot-detail-seed.test.ts"]
    sourceGlobs:
      [
        "stories/drive-machinery/story.md",
        "stories/library-review/story.md",
        "stories/library-tech-tree-overlay/story.md",
      ]
  real:
    testFile: "packages/model-uat-pilot/src/pilot-detail-seed.test.ts"
    sourceFile: "stories/drive-machinery/story.md"
    editsExisting: true
    scope:
      testGlobs: ["packages/model-uat-pilot/src/pilot-detail-seed.test.ts"]
      sourceGlobs:
        [
          "stories/drive-machinery/story.md",
          "stories/library-review/story.md",
          "stories/library-tech-tree-overlay/story.md",
        ]
    install: true
    typecheck:
      file: pnpm
      args: ["--filter", "@storytree/model-uat-pilot", "typecheck"]
    proofCommand:
      file: pnpm
      args: ["--filter", "@storytree/model-uat-pilot", "test"]
---

# Every pilot criterion points at a live-canonical detail artifact

**Outcome —** Every pilot criterion carries a `(detail: …)` pointer that resolves to a validating
`uat-criterion` detail artifact in the live Library.

**The pointer half is a file; the body half is not (ADR-0307 D5).** This capability was authored
when a detail body was committed JSON under `apps/studio/data/seed-kinds/uat-criterion/`. That
directory is deleted and the posture is withdrawn, so the capability now spans two media
deliberately: the `(detail: …)` TAG is a `stories/**` file edit, and the detail BODY is a live
Library write. Its proof is unchanged in substance — every pointer still has to resolve to a
validating body — only the place the body is read from moved.

## Guidance

- For each classified criterion on the three pilot stories, add a `(detail: <id>)` tag beside
  the witness/tier tags. Prefer stable ids `<story-id>#uat-<n>` matching `criterionId` from
  `@storytree/model-uat`.
  ⚠ Adding a tag to a criterion line CHANGES that criterion's canonical content, so each edited
  criterion needs a recomputed `(revision-id:)` carrying its old value as
  `(previous-revision-id:)` — and the `uatc_` id is never regenerated. Follow
  `asset:edit-story-uat-criteria`; that section has three identity schemes that fail silently.
- Author one detail artifact per criterion in the LIVE Library —
  `storytree library artifact new --file <doc.json> --pg` (then `edit … --pg` to amend) —
  validating as `UatCriterionDetail` from `@storytree/uat-criterion`:
  - `kind: "uat-criterion"`
  - `id` matching the pointer
  - non-blank `action`, `successConditions`, `evidenceExpectations`
  - optional `refs: ["asset:…"]` to reusable principles/processes (reference, don't copy)
  - **no title field**
- Lift procedure prose out of long story criterion lines into the detail body when it is clearly
  action/success/evidence — keep the story line as the one-liner display title (ADR-0209 D7
  Studio already renders).
- Write-scope: the file half is `stories/**`, which the story-author fence
  (`isStoryAuthorWriteAllowed`) already admits — no widening is needed or available, since
  ADR-0307 D5 narrowed that predicate to one root. The body half is out of band for any file
  fence: it goes through the `--pg` library-edit ceremony.
- AUTHOR_TEST in `pilot-detail-seed.test.ts`: parseCriterionPointers count equals parseCriteria
  count per story; every pointed id loads a detail that `UatCriterionDetail.parse` accepts;
  `displayTitle` stays the story one-liner. Note the harness now needs a STORE to resolve bodies —
  keep the pure parse/shape assertions hermetic and gate anything needing the live store behind an
  explicit live-only path, so `pnpm -r test` stays DB-free (ADR-0302 D2 retired offline as a
  supported MODE; it did not make the hermetic test legs need a database).

## Contracts (3)

1. **`every-pilot-criterion-has-detail-pointer`** — full coverage
   - **asserts —** for each of the three stories, `#pointers === #criteria` after
     parseCriterionPointers / parseCriteria.
2. **`every-pilot-detail-validates`** — the bodies are real
   - **asserts —** each pointed id resolves to a live Library artifact whose body parses as
     `UatCriterionDetail` with matching `id` (ADR-0209 D5 as amended by ADR-0307 D5) — a dangling
     pointer fails this contract rather than being tolerated.
3. **`detail-does-not-redefine-title`** — story stays display-canonical
   - **asserts —** `displayTitle` for each binding equals the criterion.title; detail bodies
     carry no title-shaped field that the harness treats as display-canonical (ADR-0209 D6).
