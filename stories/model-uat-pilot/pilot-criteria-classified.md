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
# PROOF BINDING REMOVED 2026-08-31 — the package it named is gone. `@storytree/model-uat-pilot` was DELETED
# by `model-uat-family-consolidation-arc` increment 1 (ADR-0247 D5's first package retirement), so
# the `proof:` block that stood here bound a test file, a source file and a `pnpm --filter` target
# that no longer exist. Leaving it would not have been inert: a dead `--filter` EXITS 0 WITHOUT
# RUNNING, which is a proof command that can only ever report success. `check:verification-decay`'s
# `contract-binding-drift` instrument (ceiling 0) and the `coverage-drain` sweep both red on exactly
# that, and ADR-0252 D3 forbids raising a ceiling to absorb it — of the three sanctioned drains
# (author a test, split/retire, repair the binding), only REPAIR applies here: the code is gone so no
# test can be authored, and this node was already `status: retired`, which by itself cleared nothing
# because no instrument filters on it.
#
# The node is KEPT as a browsable row, per ADR-0247 D2 (a retirement, not a deletion — the tier can
# be brought back). It simply no longer registers a real-build surface. This is the shape
# `stories/studio-build` already holds: retired, body kept as history, binding no file, breaching no
# ceiling. The implementation stays recoverable in git history.
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
