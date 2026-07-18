---
id: "uat-row-one-liner"
tier: capability
story: uat-detail-studio
arc: model-uat-promotion
title: "Each UAT table row renders the story-owned one-line title"
outcome: "Each UAT table row renders the story-owned one-line title; detail-body prose never appears in the title cell."
status: proposed
proof_mode: integration-test
depends_on: []
decisions: [209, 192, 70]
# Hosted in apps/studio (ADR-0192). EDIT-EXISTING: AUTHOR_TEST extends
# UatTestCriteriaSection.test.tsx; IMPLEMENT edits TreeView.tsx UatTestCriteriaSection.
# Vitest jsdom — proofCommand runs vitest on the ONE test file (hud-chrome precedent).
proof:
  command:
    file: pnpm
    args: ["--filter", "studio", "test"]
  scope:
    testGlobs: ["apps/studio/src/components/UatTestCriteriaSection.test.tsx"]
    sourceGlobs: ["apps/studio/src/components/TreeView.tsx"]
  real:
    testFile: "apps/studio/src/components/UatTestCriteriaSection.test.tsx"
    sourceFile: "apps/studio/src/components/TreeView.tsx"
    editsExisting: true
    scope:
      testGlobs: ["apps/studio/src/components/UatTestCriteriaSection.test.tsx"]
      sourceGlobs: ["apps/studio/src/**"]
    install: true
    typecheck:
      file: pnpm
      args: ["--filter", "studio", "typecheck"]
    proofCommand:
      file: pnpm
      args:
        - "--filter"
        - "studio"
        - "exec"
        - "vitest"
        - "run"
        - "src/components/UatTestCriteriaSection.test.tsx"
---

# Each UAT table row renders the story-owned one-line title

**Outcome —** Each UAT table row renders the story-owned one-line title; detail-body prose never
appears in the title cell.

## Guidance

- Edit `UatTestCriteriaSection` in `apps/studio/src/components/TreeView.tsx`. Today the title cell
  renders `{t.title}` verbatim — which can carry long bold-lead / procedure prose when authors put
  detail into the story criterion line.
- **Display-canonical one-liner (ADR-0209 D5/D6/D7):** the row must show the story-owned one-line
  acceptance intent. Prefer the `@storytree/uat-criterion` `displayTitle` contract (criterion.title)
  when the row carries a detail binding; never render detail `action` / `successConditions` /
  `evidenceExpectations` into the title cell.
- Extend the attestations payload / `UatTestCriterionRow` type only as needed to distinguish
  one-liner vs detail (e.g. optional `detailArtifactId`) — server/API glue stays minimal and
  story-owned under `apps/studio` scope, consuming the public uat-criterion barrel where pure.
- Frontend-builder stage 1 (ADR-0070): assert rendered text in vitest — not pixels/colour.
- Test-author ≠ code-author: failing assertions in `UatTestCriteriaSection.test.tsx` first.

## Contracts (2)

1. **`uat-row-shows-story-one-liner`** — the title cell is the story one-liner
   - **asserts —** given a row whose story title is a short one-liner, that exact text appears in the
     title cell (accessible name / text content).
2. **`uat-row-hides-detail-body-prose`** — detail procedure never leaks into the cell
   - **asserts —** given a criterion with a long detail body (action/success prose), that prose does
     not appear in the title cell; only the story one-liner does (ADR-0209 D7).
