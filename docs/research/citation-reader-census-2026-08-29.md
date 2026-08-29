# The `references` reader census — 2026-08-29

Produced under **ADR-0477 D3 step 1** (`citation-tier-retirement-arc-inc-01`), before anything was
deleted. ADR-0477 retires the library's `references` field — the `Sources:` block at the foot of
every artifact read — leaving the authored `depends_on` edge as the library's only edge.

**This file is the input to step 4, and ADR-0477 names it as the arc's single point of failure.**
Step 4 removes the field; its safety rests entirely on this list being complete. The ADR states the
reason plainly: a reader that only runs against the live store may never be exercised by the
hermetic gate legs, so **a green gate is not sufficient evidence** that nothing was left behind.
Walk this table explicitly.

Re-run the enumeration with:

```bash
pnpm probe:citation-readers
```

It scans every tracked source file for a code-position occurrence of the field, reconciles the
result against the table below, and **exits 1 if the tree contains a production reader this table
does not name**. Once the arc closes, every row should report `resolved`.

The frozen provenance record this arc's step 2 committed is
`docs/research/citation-snapshot-2026-08-30.md` — every citation as it stood before the removal.
This census says WHO READ the field; that snapshot says WHAT IT HELD.

## What the scan can and cannot establish

It is a **lexical** scan: it finds the field name in a code position. It is a FLOOR on this census,
never a proof of it.

- It cannot tell the library field from an unrelated property of the same name. Two rows below are
  marked `not-the-field` for exactly this reason (the ESLint scope API's `variable.references`).
- It cannot see a reader that reaches the field through a computed key, a spread, or an untyped
  `Record<string, unknown>` walk that never spells it. One such reader is in the table anyway
  (`packages/cli/src/retire.ts` recurses over every string value in a doc), found by reading rather
  than by grepping.

**Test files are counted, not classified.** 73 carry a hit. A test that reads a removed field FAILS
loudly at the moment of removal, which is the honest signal this census exists to manufacture for
production code that would instead go quiet. Enumerating them would bury the 41 rows that need a
decision.

## What was measured in the live store

Taken 2026-08-29 from `events.library_artifact` (the store is the only source of truth for artifact
state, ADR-0302 D1 / ADR-0307). ADR-0477 quotes ~4,063 refs across 2,490 artifacts, measured
2026-08-27; the corpus has grown since.

| measure | value |
| --- | --- |
| artifacts | 2,651 |
| artifacts carrying ≥1 reference | 890 |
| total refs | 4,115 |
| `asset:<id>` refs | 3,315 |
| `doc:<relpath>` refs | 683 |
| `node:<id>` refs | 102 |
| bare / unprefixed refs (malformed) | 12 |
| `story:<id>` refs | 2 |
| other prefix (malformed) | 1 |
| `asset:` refs whose target is not a live row | 1 |

Refs by citing kind: `adr` 2,089 · `principle` 530 · `friction` 526 · `definition` 244 · `agent` 186
· `process` 163 · `increment` 127 · `pattern` 116 · `guardrail` 68 · `arc` 28 · `techstack` 23 ·
`open-question` 15. (`uat-criterion` and `template` carry none.)

## ⚠ The finding that matters most: `references` is not only provenance

ADR-0477 characterises the field as "the artifacts it was written FROM" — a provenance list. That is
true of the overwhelming bulk of the 4,115 refs. It is **not** true of four populations, which use
the same field as a working link. Each needs a disposition of its own, and two of them are the
"quietly reports a smaller number" class ADR-0477 D5 requires to be corrected in the same landing as
the removal.

| population | size | mechanism | disposition |
| --- | --- | --- | --- |
| `node:<id>` on **open-questions** | **0 live rows** | ADR-0107: an OQ raised during a story's proving process carries `node:<storyId>`, and while it is open the story's green is WITHHELD | retire the mechanism; annotate ADR-0107 |
| `node:<id>` on friction / principle | 102 refs, 93 docs | display only — no reader filters on it (the ADR-0107 gate reads open-questions alone) | goes with the field |
| **open-question → ADR** | 15 refs, 15 docs | ADR-0434: `question settle --adr` appends `asset:adr-NNNN`, recording WHICH decision answered the question | repoint the verb to `dependsOn` (see below) |
| **friction → friction** | 245 refs, 163 docs | ADR-0316 `COLLAPSING_RULE` edge (b): "one filing names another in its `references` as `asset:<id>`" — a join in the distinct-cause **denominator** | correct the instrument in the same landing (D5) |

**The ADR-0107 gate has zero live data.** All 102 `node:` refs sit on `friction` (101) and
`principle` (1); no open-question carries one. So the gate reads an empty set today, and removing
the field changes no current behaviour — but it would leave the filter reading a field that does not
exist, which is a permanently vacuous pass rather than an honest absence
(`renaming-a-read-field-blinds-every-reader`: a check that reads zero edges finds zero cycles and
passes). Retire the mechanism; do not leave it reading a dead field.

**The `question settle --adr` fork, and how it was resolved.** ADR-0477 D6 says the decision "adds no
edges and judges no artifact's linkage". Read literally that forbids repointing this verb to
`dependsOn`. Read for its stated reason — D6 names `unlinked-corpus-half-arc`'s measure-first charter
and the judgement of *which artifacts deserve an edge* — it does not reach a verb writing one edge
that a settlement has just established. The link is given, not judged. **Disposition: repoint
`--adr` to `dependsOn`, forward only.** The 15 existing pointers are frozen in step 2's snapshot and
are NOT backfilled, because backfilling is exactly what D6 fences. The alternative — dropping `--adr`
— would destroy a six-day-old capability the owner decided in ADR-0434, which is the "removing
`depends_on` by mistake" failure wearing different clothes.

Note the fence ADR-0434 actually sets is on `--answer`, which is REQUIRED and unaffected: the
settlement's content survives the field's removal either way. Only the machine-readable pointer is at
stake.

## ⚠ Two more denominators, both of the silent-shrink class

Beyond the friction cause-join above:

- **`apps/studio/src/lib/overviewConstellation.ts`** — `importanceOf(assets)` is the in+out DEGREE of
  each node over the `references[]` graph, and it drives node sizing on the studio overview. With the
  field gone every node's importance collapses to 0. The constellation does not break; it goes
  uniform, which reads as a corpus with no structure.
- **`packages/drive/src/health.ts`** — `referentialIntegrity` scans `references` for dangling
  pointers, and reports the count of decision pointers it checked as an auditable denominator.
  Removing the field shrinks what it checked while the report still reads as a clean answer.

## ✅ A named risk retired by measurement: `web/`

ADR-0477 flags the `web/` submodule as carrying "a vendored copy of the engine" that does not update
itself. **Checked out and scanned on 2026-08-29: `web/` contains ZERO occurrences of the field and no
copy of the Sources render.**

This is structural, not luck. `ENGINE_PACKAGES` (`packages/cli/src/web-engine-sync.ts`) vendors
exactly two packages — `packages/forest-world` and `packages/forest-world-r3f`, the 3D art render
core and its R3F mapper. Neither has any path to the knowledge schema. So `check:web-engine` has
nothing to notice here and no `pnpm sync:web-engine` is owed by this arc.

## The census

41 rows. 40 carry a code-position hit today; `retire.ts` carries none and is listed anyway
because it reaches the field by recursing over every string value — the lexical blind spot
named above. `disposition` is what step 4 must do.

| file | what it does with the field | disposition |
| --- | --- | --- |
| `packages/library/src/knowledge.ts` | **the schema** — `references: z.array(z.string()).default([])` on `commonShape` | remove |
| `packages/library/src/library-doc.ts` | a second schema declaration on the library-doc shape | remove |
| `packages/library/src/migrations.ts` | migrations 88/117 read the field while upcasting older rows | keep (the registry is append-only) + add a stripping migration |
| `packages/library/src/store/render-doc.ts` | carries the field through the soft render and its field list | remove |
| `packages/library/src/templates.ts` | template scaffolds seed `references: []` | remove |
| `packages/library/src/knowledge-sources.ts` | `groupSources` / `ResolvedSource` — the Sources view. ⚠ `sourceGroupOf` is SHARED with the `depends_on` block and MUST SURVIVE (D7) | narrow — keep `sourceGroupOf` |
| `packages/library/src/oq-gating.ts` | `openQuestionsGatingNode` — the ADR-0107 story-green gate. Zero live rows | retire the mechanism |
| `packages/library/src/standson-bootstrap.ts` | `citationsOf` reads the field to seed `dependsOn` (the ADR-0223 one-shot bootstrap) | retire |
| `packages/library/src/graduation/graduation.ts` | `GraduationCandidate.references` — resolved from a memory body's `[[wiki-links]]`, NOT the library field; it is the value a graduated doc would be authored WITH | retire (its destination is going) |
| `packages/storage-protocol/src/store-parity.ts` | the parity suite's doc shape carries the field | remove |
| `packages/cli/src/commands.ts` | `referencesOf` + the `Sources:` block render; `tree focus`'s inbound/outbound view reads `references[]` | retire render (step 3), reader (step 4) |
| `packages/cli/src/library-search.ts` | `STRING_REF_FIELDS = ["dependsOn","cites","references"]` — search indexing | remove from the list |
| `packages/cli/src/retire.ts` | `referencedAssetIds` recurses over EVERY string value, so it covers the field implicitly — the retire hard-refusal narrows but does not break | narrow (no edit strictly required) |
| `packages/cli/src/asset-citation.ts` | `citedAssetIds(references)` — ADR-0168 D2's "route set, output cited in `references`" | repoint or retire |
| `packages/cli/src/friction.ts` | the ADR-0168 D3 floor: a friction item's `references` must resolve; also the capture surface | close the surface, then retire |
| `packages/cli/src/graduate.ts` | renders a graduation candidate's refs | retire with `graduation.ts` |
| `packages/cli/src/adr.ts` | `scaffoldRow` writes `references: []` | remove |
| `packages/cli/src/check-mirror-conformance.ts` | builds a doc literal carrying `references: []` | remove |
| `packages/arc/src/arc.ts` | scaffolds write `references: []`; friction discharge REWRITES the field (an authoring surface) | close the surface, then remove |
| `packages/arc/src/question.ts` | `question settle --adr` APPENDS `asset:adr-NNNN` (ADR-0434) — an authoring surface | repoint to `dependsOn` |
| `packages/arc/src/decision.test-helpers.ts` | a shared test helper building docs with the field | remove |
| `packages/drive/src/health.ts` | `refsOf` feeds `referentialIntegrity` — a **denominator** | correct in the same landing (D5) |
| `packages/drive/src/factory-health.ts` | `COLLAPSING_RULE` edge (b), the friction cause join — a **denominator**, 245 refs / 163 docs | correct in the same landing (D5), incl. the rule's prose |
| `packages/drive/src/oq-gate.ts` | classifies open-questions whose `references` name a story's deciding ADRs | retire or repoint |
| `packages/drive/src/orientation-reads.ts` | renders a `references:` block in the orientation read | retire (step 3) |
| `packages/drive/src/curate.ts` | renders the field in the curator's open-question view | retire (step 3) |
| `apps/studio/src/components/AssetView.tsx` | the studio's `Sources` pane — `groupSources(asset.references)` | retire (step 3) |
| `apps/studio/src/components/AssetEditor.tsx` | a `references` TEXT INPUT — an authoring surface | close the surface |
| `apps/studio/src/components/ReviewEditor.tsx` | carries the field through the review/suggestion path | remove |
| `apps/studio/src/components/TreeView.tsx` | normalises `a.references` for the focus subgraph — VESTIGIAL: `focusGraph.ts` moved to `dependsOn` under ADR-0223 and no longer reads it | remove (dead) |
| `apps/studio/src/lib/overviewConstellation.ts` | `importanceOf` — in+out degree over the `references[]` graph, drives node sizing. A **denominator** | correct in the same landing (D5) |
| `apps/studio/src/types.ts` | the wire type declares `references: string[]` | remove |
| `apps/studio/server/libraryBackend.ts` | carries the field onto the wire | remove |
| `apps/studio/server/deriveOfflineCorpus.ts` | carries the field into the offline corpus view | remove |
| `apps/studio/server/apiRouter.ts` | ACCEPTS the field on write (`asStringArray(input.references)`) and serves it | close the surface, then remove |
| `apps/desktop/src/backend/local-backend.ts` | feeds the ADR-0107 OQ green-gate from the asset list | retire with `oq-gating.ts` |
| `docs/research/library-doctor-prototype.mjs` | a dead prototype: reads `apps/studio/data/knowledge.json`, deleted by ADR-0302 D1 | not-live |
| `docs/research/sources-grouping-prototype.mjs` | a dead prototype: same deleted seed file | not-live |
| `packages/cli/src/citation-readers.ts` | the census scanner itself — its match pattern spells the field name, so the scan finds its own source | retire with the verb when the arc closes |
| `tools/oxlint/anti-slop/rules/no-widen-then-assert.ts` | the ESLint scope API's `variable.references` | not-the-field |
| `tools/oxlint/anti-slop/rules/no-known-value-widening.ts` | the ESLint scope API's `variable.references` | not-the-field |

## The order step 4 must follow

From `retiring-a-field-in-the-corpus-does-not-retire-its-surface` — a retirement that does not reach
the authoring surface has not happened, and the corpus refills while you believe it is done. The
measured precedent: `amends` was migrated out of 517 rows and `adr new --amends` was left alive, so a
decision authored the next day put a fresh edge into a field that had just been emptied.

1. **Close the authoring surfaces first** — `question settle --adr`, the friction discharge write in
   `arc.ts`, `friction new`'s accepted `references`, the studio's `AssetEditor` input and
   `apiRouter`'s write path.
2. **Then** freeze (step 2, already committed) and stop rendering (step 3).
3. **Then** remove the field, in ONE landing with the schema change and the data drop, having checked
   no sibling session is mid-write (`storytree own --all`). Every kind schema is `.strict()`, so a row
   written from a pre-merge checkout carrying the field becomes un-editable the moment the field is
   gone (`additive-schema-field-write-must-wait-for-merge` bites in this direction too).
4. **Correct the four denominators in that same landing** (D5) — the friction cause join, the studio
   constellation's importance, health's referential-integrity count, and any figure
   `unlinked-corpus-half-arc` derives from citations.

Removing the field needs a `CURRENT_SCHEMA_VERSION` bump. Expect a standing `version-floor` report
against the whole corpus afterwards: `upcast` migrates each row at the WRITE boundary, so rows drain
naturally as they are written. **Do not drain it in bulk** — a corpus-wide write destroys `updatedAt`
as a signal, and `library --check` is not a gate rung, so nothing reds.

## Two readers a `git grep` does not surface as problems

Both are recorded from the `amends` retirement, and both were checked here:

- **A package's own document parser, separate from the obvious one.** `adr push` parses through
  `packages/library/src/adr-doc.ts`, not `packages/drive/src/adr-frontmatter.ts`. Neither declares
  `references` today (checked), so neither appears above — but re-check them at step 4 rather than
  trusting a clean typecheck: their field sets are local interfaces, so removing the field from the
  schema tells them nothing.
- **A flag-classification list the arg table does not feed.** `packages/cli/src/at-path.ts` carries
  its own list of known flags. It names no `references` flag today (checked). If step 4 removes a
  flag, check it there too.
