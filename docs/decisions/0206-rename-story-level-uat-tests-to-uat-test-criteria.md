---
status: accepted
decided: 2026-07-17
amends: [44]
---
# ADR-0206: Rename story-level 'UAT tests' to 'UAT test criteria'

## Status

accepted (2026-07-17) — decided/directed by the owner in conversation on 2026-07-17. Design-time alignment IS the ratification (ADR-0110); no second end-of-flow ask. Executes (and closes) the long-parked `rename-tests-to-uat-test-criteria` library proposal.

## Context

The single word *tests* was overloaded across storytree. It named at least four things: (a) `node:test` unit tests — the real, runnable suites (`pnpm -r test`); (b) per-capability **contracts** ("one automated, isolated unit test"); (c) the story-level acceptance items under `## Story UAT`, which ADR-0044 called "UAT tests" (`<story>#uat-<n>`, the attestation surface); and (d) the informal "blind/dogfood test". The sharpest collision was (c): the studio labelled the acceptance list "UAT tests" in a panel beside genuinely runnable suites, and in prose "the UAT tests" could mean a thing you *run* or a thing you *satisfy*. An acceptance item is a condition to be satisfied or attested — a **criterion** — never something executed.

The rename was authored as the `rename-tests-to-uat-test-criteria` proposal (2026-06), parked for a quiet window. At the 2026-07-17 transient-tier sweep the owner directed execution: the board was quiet (one active session, claim-fenced to embedded-terminal surfaces disjoint from this rename; zero open PRs), and the owner chose the full variant — heading rename included.

## Decision

Rename the story-level acceptance vocabulary from **UAT tests** to **UAT test criteria** (singular: **UAT test criterion**):

- **Heading:** `## Story UAT` → `## UAT Test Criteria` across `stories/**`. The parser anchor (`STORY_UAT_HEADING`, now in `packages/library/src/uat-test-criteria.ts`) becomes a **dual-accept** alternation matching BOTH headings, so no story — including in-flight branches and worktrees still carrying the old heading — ever parses to `[]`. The `(would-be)` qualifier (ADR-0097) is unchanged and composes with either heading.
- **Module:** `packages/library/src/uat-tests.ts` → `uat-test-criteria.ts` (and its test file).
- **Identifiers:** `UatTest` → `UatTestCriterion`, `parseUatTests` → `parseUatTestCriteria`, `uatTestId` → `uatTestCriterionId`, `uatTests` (NodeSpec field, API payload fields, `uatTestsForStory`, `uatTestsByStory`, `loadUatTests`, `hardUatTests`) → `uatTestCriteria*`, and — going beyond the proposal's "optional" marker, for consistency — `UatTestWitness` → `UatTestCriterionWitness`, `UAT_TEST_WITNESSES` → `UAT_TEST_CRITERION_WITNESSES`.
- **Labels:** the studio panel heading, the `storytree tree` / `storytree uat|witness list` output blocks, and the `.uat-tests` / `.uat-test-cell` / `.uat-test-title` CSS classes move to the criteria vocabulary.

**Unchanged — the load-bearing non-goals:**

- **Stored ids and signed data.** The attestation join key `<story>#uat-<n>` (the output of `uatTestCriterionId`) and the `events.attestation.test_id` column are stored, append-only, signed ids. They are opaque keys and are NOT renamed — renaming them would orphan every recorded attestation.
- **Contracts stay contracts** (a category decision, ADR-0010: UAT lives at the story level only; a contract IS a unit test, so "criterion" would be a category error). `node:test` unit tests stay *tests*.
- ADR-0040's witness vocabulary (`uat_witness` frontmatter, `UatWitness`, `effectiveUatWitness`) — it names who *witnessed*, not the criteria list.
- The `uat` library definition ("user-acceptance walkthrough") — the section is still the story's UAT walkthrough; only the per-item noun moves.

## Consequences

- The "which test is this?" ambiguity at the acceptance tier is gone: *criteria* are satisfied/attested, *tests* are run. New story authors and the studio UI stop conflating the two.
- The parser accepts both headings indefinitely-until-tightened: a follow-up MAY tighten `STORY_UAT_HEADING` to the new heading only once no live branch carries `## Story UAT`; until then legacy fixtures in tests double as dual-accept coverage.
- Older ADRs (0044, 0082, 0097, 0106) say "UAT tests" in their decided bodies; per ADR-0139 those bodies are history and are not rewritten wholesale — the term is redefined here, and readers calibrate via the live decision log.
- Any un-merged branch touching the renamed surfaces (`uat-tests.ts` importers, TreeView, story headings) will conflict textually and must rebase; the board was checked quiet at execution time to minimise this.

## References

- The executed proposal: library artifact `rename-tests-to-uat-test-criteria` (retired at landing, superseded by this ADR).
- ADR-0044 (UAT test units — now UAT test criteria), ADR-0082 (per-test UAT proof), ADR-0097 (would-be legs), ADR-0106 (witness resolution), ADR-0010 (proof-mode split: contracts are unit tests), ADR-0110 (design-time ratification).
- `packages/library/src/uat-test-criteria.ts` (parser + schema, dual-accept heading regex).
