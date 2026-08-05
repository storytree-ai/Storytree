---
id: "model-uat-pilot"
tier: story
title: "Three pilot stories migrate to explicit witnesses and addressable UAT detail"
outcome: "Every UAT criterion on drive-machinery, library-review, and library-tech-tree-overlay is explicitly classified as machine, tiered model, or human with a resolvable live-canonical detail pointer — zero legacy-unresolved either remains on those three — and a machine harness reports the migration counts that inform corpus-wide rollout."
status: proposed
proof_mode: UAT
# Every story-UAT leg below is deterministic and machine-witnessed. Absence would default the
# story node to human (ADR-0040) and withhold story build --real dishonestly.
uat_witness: machine
# Immutable arc provenance (ADR-0183): the FIFTH landable increment of the `model-uat-promotion`
# arc (ADR-0209, owner-directed 2026-07-17). Increments 1–4 landed witness/tier, detail/pointer/hash,
# the model judge, and Studio row concision. THIS story is the three-story pilot migration
# (ADR-0209 D8). Corpus-wide migration is a LATER increment informed by this pilot — not scaffolded
# here.
arc: model-uat-promotion
# Packages-forward (ADR-0192): the machine harness lives in a NEW port
# `@storytree/model-uat-pilot` (`packages/model-uat-pilot`). Classification edits touch the three
# pilot stories under `stories/**`; detail BODIES are live Library artifacts (ADR-0307 D5), written
# with `library artifact new|edit <id> --pg` rather than committed anywhere;
# Library KIND registration is hosted glue in `@storytree/library` (loudly owned here — deferred
# from uat-criterion-detail). Ownership option A: this story owns those corpus edits as its leaf
# work (one classify→detail→observe journey), not a follow-on story-author pass.
depends_on:
  [
    model-uat-witness,
    uat-criterion-detail,
    library,
    drive-machinery,
    library-review,
    library-tech-tree-overlay,
  ]
# Write-target / corpus-migration edges (ADR-0166): this story edits the three pilot stories'
# UAT sections + their detail seeds. Not package-import edges — annotate so the boundary gate
# keeps them as honest forest roads. Arc foundation stories model-judged-uat + uat-detail-studio
# are consumed conceptually (landed before this increment) but not as runtime package deps here.
artifact_edges: [drive-machinery, library-review, library-tech-tree-overlay]
# Deciding ADRs: 0209 (D8 — charter); 0192 (packages-forward / hosted honesty); 0082 (per-test
# UAT); 0106 (Adopt resolves witness); 0307 (D5 — withdrew the seed-canonical posture for this
# detail class, so the pointers resolve to LIVE artifacts; supersedes the ADR-0055 once cited here);
# 0184 (drive-machinery machine
# conversion precedent); 0070 (LOOK stays human); 0010 (organism + splitting-rule).
decisions: [209, 192, 82, 106, 307, 184, 70, 10]
capabilities:
  [
    uat-criterion-library-surface,
    pilot-criteria-classified,
    pilot-detail-seed,
    pilot-migration-harness,
  ]
# Node-borne STORY-UAT proof config. NET-NEW package: AUTHOR_TEST writes the standing UAT against
# the public `@storytree/model-uat-pilot` barrel; IMPLEMENT exports the harness that parses the
# three pilot stories + seed details and asserts complete migration. Offline; no live model run.
proof:
  command:
    file: pnpm
    args: ["--filter", "@storytree/model-uat-pilot", "test"]
  scope:
    testGlobs: ["packages/model-uat-pilot/src/model-uat-pilot.uat.test.ts"]
    sourceGlobs: ["packages/model-uat-pilot/src/index.ts"]
  real:
    testFile: "packages/model-uat-pilot/src/model-uat-pilot.uat.test.ts"
    sourceFile: "packages/model-uat-pilot/src/index.ts"
    scope:
      testGlobs: ["packages/model-uat-pilot/src/model-uat-pilot.uat.test.ts"]
      sourceGlobs: ["packages/model-uat-pilot/src/index.ts"]
    install: true
    editsExisting: true
    proofCommand:
      file: pnpm
      args: ["--filter", "@storytree/model-uat-pilot", "test"]
    typecheck:
      file: pnpm
      args: ["--filter", "@storytree/model-uat-pilot", "typecheck"]
---

# Three pilot stories migrate to explicit witnesses and addressable UAT detail

**Outcome —** Every UAT criterion on `drive-machinery`, `library-review`, and
`library-tech-tree-overlay` is explicitly classified as `machine`, tiered `model`, or `human` with
a resolvable live-canonical detail pointer — zero legacy-unresolved `either` remains on those three —
and a machine harness reports the migration counts that inform corpus-wide rollout.

This is the **three-story pilot migration** of the `model-uat-promotion` arc (ADR-0209 D8 /
increment 5). It stands on the landed foundation (witness/tier, detail/pointer/hash, judge, Studio
concision) and applies that contract to three deliberately different stories: `drive-machinery` as
the deterministic control, `library-review` as the mixed knowledge workflow, and
`library-tech-tree-overlay` as the visual frontend. Corpus-wide migration waits on this pilot's
measurement signal (ADR-0209 Consequences) and is a later increment.

## The journey (why this is ONE story — the journey-principle)

The consumer is the corpus author (and the later planner of corpus-wide migration): its goal is
*"these three stories are fully on the new witness+detail contract, and I can see the counts."*
Finishing "every leg is explicitly classified" leads straight to needing "and each has an
addressable detail artifact" and "and a harness proves both with no silent model default" — one
continuous classify→detail→observe journey (journey-principle). Its proof shares one precondition
(the three story bodies + the detail seed surface) and one observable (zero `either`, every
pointer resolves, migration counts), so the splitting-rule keeps it whole.

**Ownership option A.** This story owns the classification edits to the three pilot stories and the
detail-seed authoring as its leaf work. A separate "harness only, then follow-on story-author pass"
split (option B) would conjunction the outcome across two journeys.

## Design floor (from ADR-0209 D8 — do not re-litigate)

- **No silent model default.** Untagged criteria must not inherit `model`. Until a criterion is
  explicitly migrated it may retain legacy-unresolved `either` on the conservative path; `either` is
  not a fourth classified witness, carries no tier, and cannot enter model judgment (ADR-0209 D8).
  After this pilot, the three named stories have **zero** `either`.
- **Three honest kinds.** Each pilot leg is `machine`, tiered `model` (`advanced`|`frontier`), or
  `human`. Human is for irreducible judgment gaps (LOOK / live interaction / spend) — never cost
  (`human-witness-is-a-judgment-gap-not-cost`, ADR-0070).
- **Pilot cast (locked).** `drive-machinery` = deterministic control; `library-review` = mixed
  knowledge workflow; `library-tech-tree-overlay` = visual frontend (ADR-0209 D8).
- **Classification policy for the first cut.** Keep an already-honest machine leg machine; keep
  irreducible UI/LOOK legs human; introduce `model` + tier only where a rubric-bound semantic
  judgment with capturable evidence honestly fits — never force model onto a judgment gap to
  "exercise" the tier. A pilot that measures mostly machine+human with detail cost is still a
  valid D8 signal.
- **Story title stays display-canonical.** Detail artifacts hold action / successConditions /
  evidenceExpectations (+ optional `asset:` refs); they never carry a competing title (ADR-0209
  D5/D6). Criterion annotations use `(detail: <story>#uat-<n>)` (or the story's stable detail id).
- **Live-canonical details (ADR-0307 D5, re-pointed 2026-08-05).** A detail body is a LIVE Library
  artifact, authored with `storytree library artifact new|edit <id> --pg` and validating as
  `@storytree/uat-criterion`'s `uat-criterion` kind. It is NOT committed JSON: this floor once read
  "detail JSON lives under `apps/studio/data/seed-kinds/uat-criterion/`", and that directory has
  been deleted along with the seed-canonical posture it rested on. Library `KIND_SPECS` registration
  (deferred from increment 2) still lands here — with the store canonical it is now the ONLY thing
  making the pointers resolvable for Studio/Library, so it carries more weight, not less.
- **Hash-anchor stands.** Substantive detail edits invalidate prior green via the landed
  content-hash classifier; this story does not reopen that port.

## Scope boundary — what this story does NOT do

- **Corpus-wide migration** — every other story's UAT legs stay as they are; only the completed
  corpus-wide increment may retire legacy-only `either` parsing (ADR-0209 D8).
- **Live model judge runs** against pilot legs — the judge port is landed; wiring a live Fable run
  for a newly `model`-classified leg is consumer glue / out-of-band attestation when that leg is
  actually judged, not this story's proof.
- **Reopening increments 1–4 proof sources** — consume `@storytree/model-uat`,
  `@storytree/uat-criterion`, `@storytree/model-judged-uat`, and the Studio one-liner surface as
  public contracts.
- **Retiring `either` from the parser** — compatibility parse stays until corpus-wide completion.

## Capabilities (4)

Listed roots-first. Cap 1 is library-hosted glue (ADR-0192 honesty). Caps 2–3 are corpus edits
(stories + seed). Cap 4 is the story-owned harness package.

| # | capability | class | outcome | depends on |
|---|---|---|---|---|
| 1 | [`uat-criterion-library-surface`](uat-criterion-library-surface.md) | LEAF | Library recognizes `uat-criterion` as a first-class kind (`KnowledgeKind` + `KIND_SPECS`) so a detail artifact resolves through the Library kind tables like every other live-canonical kind. | — |
| 2 | [`pilot-criteria-classified`](pilot-criteria-classified.md) | LEAF | Every UAT criterion on the three pilot stories carries an explicit `machine` / `model`(+tier) / `human` tag — zero `either` on those three. | — |
| 3 | [`pilot-detail-seed`](pilot-detail-seed.md) | LEAF | Every pilot criterion carries a `(detail: …)` pointer that resolves to a validating `uat-criterion` detail artifact in the live Library. | `uat-criterion-library-surface`, `pilot-criteria-classified` |
| 4 | [`pilot-migration-harness`](pilot-migration-harness.md) | LEAF | A public `@storytree/model-uat-pilot` harness parses the three stories + seed, refuses incomplete migration / silent model default, and reports classified counts. | `pilot-criteria-classified`, `pilot-detail-seed` |

## Within-story dependency graph

- `pilot-detail-seed` → `uat-criterion-library-surface` — a detail body is only addressable once
  the kind is a real Library kind; with no seed directory left, registration is the whole surface.
- `pilot-detail-seed` → `pilot-criteria-classified` — pointers attach to already-classified
  criteria (`<story>#uat-<n>`).
- `pilot-migration-harness` → `pilot-criteria-classified` + `pilot-detail-seed` — the harness
  observes the migrated corpus; it does not author it.

## Ownership (ADR-0192)

- **NEW port:** `@storytree/model-uat-pilot` (`packages/model-uat-pilot`) — harness + story UAT.
  Register in `repo-manifest.json` `packageOwnership` at bootstrap.
- **Hosted glue:** `uat-criterion-library-surface` edits `@storytree/library` kind tables (and
  any minimal sync recognition). Loud, owner-visible foreign-building work — the deferred
  increment-2 consumer glue this pilot cannot complete without.
- **Corpus edits (option A):** `pilot-criteria-classified` sourceGlobs include the three pilot
  `stories/*/story.md` UAT sections; `pilot-detail-seed` edits those same story files to add the
  `(detail: …)` tags, and authors the detail BODIES as live Library artifacts (`--pg`) rather than
  as files (ADR-0307 D5). story-author runtime fence injection (`isStoryAuthorWriteAllowed` into
  `runSpawnStoryAuthor`) remains consumer glue, but it no longer WIDENS anything: every file this
  story writes is already under `stories/**`, and the detail bodies are out of any file fence's
  reach.

Runtime depends_on (already declared): foundation stories 1–4 plus the three pilot stories being
migrated.

## UAT Test Criteria

The integrated **acceptance walkthrough** proving the pilot end-to-end against the public
`@storytree/model-uat-pilot` barrel + the real migrated corpus on disk. Every leg is
**(witness: machine)**.

**Goal —** The three pilot stories are fully migrated: every criterion is explicitly classified,
every detail pointer resolves to a live-canonical Library artifact, and the harness reports the
counts with no silent path into model judgment.

1. **Library surface admits the detail kind.** _(witness: machine)_ _(proof-gate: model-uat-pilot#gate-1)_ Import / resolve `uat-criterion` through the Library kind tables. **Success —** `uat-criterion` is a `KnowledgeKind` with a `KIND_SPECS` entry, so a detail artifact resolves by id through those tables. No committed directory participates: ADR-0307 D5 withdrew the seed-canonical posture ADR-0209 D5 rested on, so kind registration is the whole admitted surface. _(criterion-id: uatc_2da84216aec52749bba2a930)_ _(previous-revision-id: uatr1:d5aa50ae863c7754)_ _(revision-id: uatr1:e1d419fafeb51bd1)_
2. **Zero legacy-unresolved on the three pilots.** _(witness: machine)_ _(proof-gate: model-uat-pilot#gate-1)_ Parse `drive-machinery`, `library-review`, and `library-tech-tree-overlay` via `@storytree/model-uat` `parseCriteria`. **Success —** every criterion's witness ∈ {machine, model, human}; none is `either`; every `model` criterion declares `advanced` or `frontier` (ADR-0209 D8/D2). _(criterion-id: uatc_2fd3f06617acf375e5c74c53)_ _(revision-id: uatr1:f85b950747bd855c)_
3. **Every pilot criterion has a resolvable detail.** _(witness: machine)_ _(proof-gate: model-uat-pilot#gate-1)_ Parse pointers via `@storytree/uat-criterion` `parseCriterionPointers` and load seed details. **Success —** pointer count equals criterion count on each pilot story; every detail id validates as `UatCriterionDetail`; `displayTitle` remains the story one-liner. _(criterion-id: uatc_001591d1102af0b3efaf822c)_ _(revision-id: uatr1:0a7fbb901b38ec3b)_
4. **Silent model default is refused.** _(witness: machine)_ _(proof-gate: model-uat-pilot#gate-1)_ Present an untagged fixture criterion to the harness alongside the pilots. **Success —** it remains legacy-unresolved / outside the "migrated" set; it cannot enter model judgment; the pilots' completeness check does not coerce it (ADR-0209 D8). _(criterion-id: uatc_e64c1f58d3377dfff5093b47)_ _(revision-id: uatr1:423c15adeff48150)_
5. **Migration counts are observable.** _(witness: machine)_ _(proof-gate: model-uat-pilot#gate-1)_ Ask the harness for a summary over the three pilots. **Success —** it reports per-story and total counts by witness kind (and model tier), plus detail-pointer coverage — the measurement ADR-0209 Consequences requires before corpus-wide rollout. _(criterion-id: uatc_5832f729b08d865542c43c6a)_ _(revision-id: uatr1:6c9a476e4d1d5b0e)_
6. **Public barrel exports the harness.** _(witness: machine)_ _(proof-gate: model-uat-pilot#gate-1)_ Import the harness API from `@storytree/model-uat-pilot`. **Success —** the root barrel exports the parse/assert/report surface; an empty barrel fails this leg. _(criterion-id: uatc_f609cdef47efa4bba4db2b2c)_ _(revision-id: uatr1:c1cd3ef651d2c117)_

End state — the three pilot stories are on the explicit witness+detail contract; the harness
machine-witnesses completeness and counts; corpus-wide migration remains a later, informed
increment.

## Reliability Gates

1. **The public model-uat-pilot suite is green** _(gate: observe)_ `pnpm --filter @storytree/model-uat-pilot test`.
   The spine observes the real package suite (library-surface recognition as exercised by the
   harness, zero-either, detail coverage, refuse silent model default, migration counts, public
   barrel). It then signs `model-uat-pilot#gate-1`; all six machine criteria bind to this gate.

Run from a clean committed rebuilt HEAD:
`pnpm storytree adopt model-uat-pilot --signer <email> --pg`.

## Proof

Package scaffold + `packageOwnership` registration land first; then the four capabilities chain
roots-first (`node build --real`); then story UAT + Adopt observe the public barrel against the
migrated corpus. Per ADR-0020, `healthy` is only ever DERIVED from signed verdicts; authored status
stays `proposed`. Whole-story UAT is `uat_witness: machine`.

## Where this sits in the arc

1. **`model-uat-witness`** (landed) — tiered-witness DATA + eligibility.
2. **`uat-criterion-detail`** (landed) — the detail kind, pointer, hash, author scope.
3. **`model-judged-uat`** (landed) — judge + spine validation + escalation.
4. **`uat-detail-studio`** (landed) — Studio one-liner + open-Library-detail.
5. **`model-uat-pilot`** (THIS story) — three-story pilot migration (ADR-0209 D8).
6. **Corpus-wide migration** (later) — informed by this pilot; only its completion retires
   legacy-only `either` parsing.
