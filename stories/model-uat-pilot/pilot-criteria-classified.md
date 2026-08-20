---
id: "pilot-criteria-classified"
tier: capability
story: model-uat-pilot
arc: model-uat-promotion
title: "Every pilot-story UAT criterion is explicitly classified"
outcome: "Every UAT criterion on the three pilot stories carries an explicit `machine` / `model`(+tier) / `human` tag — zero `either` on those three."
# RETIRED 2026-08-20 with its parent story (ADR-0247 D5, which names that story on its retirement
# worklist by id). The code is NOT unmounted by this flip — ADR-0247 D5 makes each package retirement
# its own provable unit, and that unit is still open.
status: retired
proof_mode: integration-test
depends_on: []
decisions: [209, 184, 70, 82]
# Ownership option A: this capability edits the three pilot stories' UAT sections under
# stories/**. Proof observes the migrated bodies via @storytree/model-uat parseCriteria —
# the standing test lives in the story-owned harness package so observe/Adopt share one suite.
# IMPLEMENT edits only the three story.md UAT criteria lines (witness/tier tags); it does not
# invent detail pointers (pilot-detail-seed) or package code beyond what AUTHOR_TEST needs to
# go red first in packages/model-uat-pilot.
proof:
  command:
    file: pnpm
    args: ["--filter", "@storytree/model-uat-pilot", "test"]
  scope:
    testGlobs: ["packages/model-uat-pilot/src/pilot-criteria-classified.test.ts"]
    sourceGlobs:
      [
        "stories/drive-machinery/story.md",
        "stories/library-review/story.md",
        "stories/library-tech-tree-overlay/story.md",
      ]
  real:
    testFile: "packages/model-uat-pilot/src/pilot-criteria-classified.test.ts"
    sourceFile: "stories/drive-machinery/story.md"
    editsExisting: true
    scope:
      testGlobs: ["packages/model-uat-pilot/src/pilot-criteria-classified.test.ts"]
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

# Every pilot-story UAT criterion is explicitly classified

**Outcome —** Every UAT criterion on the three pilot stories carries an explicit `machine` /
`model`(+tier) / `human` tag — zero `either` on those three.

## Guidance

- Edit the `## UAT Test Criteria` sections of:
  - `stories/drive-machinery/story.md` (deterministic control — all 7 legs already machine;
    keep machine; ensure every leg's `_(witness: machine)_` tag remains parseable by
    `parseCriteria` and none can be read as untagged/`either`)
  - `stories/library-review/story.md` (mixed workflow — keep machine legs machine; keep
    irreducible UI/interaction legs human; only promote a leg to `_(witness: model)(tier: …)_`
    when a rubric-bound semantic judgment with capturable evidence honestly fits)
  - `stories/library-tech-tree-overlay/story.md` (visual frontend — geometry/behaviour machine;
    LOOK / operator-attested legs human; same no-force-model rule)
- **Classification policy (story design floor):** never invent model to "exercise" the tier;
  never downgrade an honest machine leg to human for cost; never leave a leg untagged.
- Do **not** add `(detail: …)` tags here — that is `pilot-detail-seed`.
- AUTHOR_TEST first in `packages/model-uat-pilot/src/pilot-criteria-classified.test.ts`: read the
  three story files from disk, `parseCriteria`, assert every witness is classified and every
  model has a tier. Package scaffold may land as bootstrap before this leaf if the test package
  does not yet exist.
- Preserve existing `_(proof-gate: …)_` bindings on drive-machinery; classification must not
  break Adopt bindings.

## Contracts (3)

1. **`pilot-stories-have-zero-either`** — no legacy-unresolved on the cast
   - **asserts —** parseCriteria over each of the three story bodies yields only
     machine|model|human witnesses (ADR-0209 D8).
2. **`pilot-model-legs-declare-tier`** — model floors are explicit
   - **asserts —** every model criterion carries tier ∈ {advanced, frontier}; no machine/human
     criterion carries a tier (ADR-0209 D2).
3. **`pilot-cast-is-exactly-the-three-stories`** — D8 cast is locked
   - **asserts —** the harness/test reads exactly `drive-machinery`, `library-review`, and
     `library-tech-tree-overlay` as the migrated set — no silent fourth story, no missing cast
     member.
