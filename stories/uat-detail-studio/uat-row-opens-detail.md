---
id: "uat-row-opens-detail"
tier: capability
story: uat-detail-studio
arc: model-uat-promotion
title: "Opening a UAT row follows its Library detail pointer"
outcome: "When a criterion carries a detail pointer, activating the row navigates to that Library artifact; without a pointer, no fake open."
status: proposed
proof_mode: integration-test
depends_on: [uat-row-one-liner]
decisions: [209, 192, 70]
# Hosted in apps/studio (ADR-0192). EDIT-EXISTING: same vitest file + TreeView section; may touch
# route helpers (assetHref / library lens) already owned by studio.
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

# Opening a UAT row follows its Library detail pointer

**Outcome —** When a criterion carries a detail pointer, activating the row navigates to that
Library artifact; without a pointer, no fake open.

## Guidance

- Attach an open affordance to the concise UAT row (title cell link/button, or whole-row activate —
  settle at build; must not steal the witness-glyph sign click). Prefer the existing Library pathway
  (`assetHref(detailArtifactId)` or the overlay lens equivalent) — one way to open Library artifacts
  (ADR-0205 one-pathway posture).
- **Pointer required for open (ADR-0209 D7):** only when the criterion carries a detail artifact id
  (from the story's `(detail:)` / API field) does activate navigate. No pointer → no fabricated
  navigation.
- Do not inline a second procedure template in a modal that replaces the Library artifact — open the
  real detail doc.
- Preserve the witness glyph's "I saw it work" behaviour on human legs (ADR-0082) — open-detail and
  sign are distinct affordances.
- Vitest: spy `navigate` / location.hash (or link href) rather than full Studio boot.
- Test-author ≠ code-author in `UatTestCriteriaSection.test.tsx`.

## Contracts (3)

1. **`uat-row-open-navigates-to-detail`** — pointed rows open the detail artifact
   - **asserts —** activating a row with `detailArtifactId` navigates to that artifact's Library
     href (e.g. `assetHref`); the row label remains the one-liner.
2. **`uat-row-without-pointer-does-not-fake-open`** — no pointer → no fake navigation
   - **asserts —** activating a row without a detail pointer does not navigate to a fabricated
     detail id (no-op or no open affordance).
3. **`uat-row-open-preserves-sign-glyph`** — sign path undisturbed
   - **asserts —** an unproven human leg's person glyph remains the sign affordance; opening detail
     does not disable or replace that glyph's sign behaviour (ADR-0082).
