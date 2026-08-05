---
id: "uat-detail-studio"
tier: story
title: "Studio UAT criterion rows stay one-line and open the Library detail"
outcome: "The Studio story detail panel renders each UAT criterion as the story-owned one-line title and opening the row follows its Library detail pointer — never dumping procedure prose into the table."
status: proposed
proof_mode: UAT
# Machine-judged capability behaviour has no remaining story-UAT journey under ADR-0294; the
# observe reliability gate carries the story's own proof obligation under ADR-0085.
uat_witness: machine
# Immutable arc provenance (ADR-0183): the FOURTH landable increment of the `model-uat-promotion` arc
# (ADR-0209, owner-directed 2026-07-17). Increments 1–3 landed witness/tier, detail/pointer/hash, and
# the model judge. THIS story is Studio row concision (ADR-0209 D7): one-liner display + open-Library-
# detail navigation. The three-story pilot migration is a LATER increment — not scaffolded here.
arc: model-uat-promotion
# Hosted in the studio surface (ADR-0192 grandfather register): proof-bound sources live under
# `apps/studio` (TreeView UatTestCriteriaSection + its vitest). The story CONSUMES
# `@storytree/uat-criterion` (displayTitle + detail pointer) without reopening that port. Register
# `uat-detail-studio` under hostedStories at bootstrap — a loud, owner-visible add for this
# Studio-UI increment (same honesty class as other apps/studio-hosted units).
depends_on: [uat-criterion-detail, studio]
# Deciding ADRs: 0209 (D7 — this story's charter); 0192 (packages-forward / hosted honesty);
# 0082 (per-test UAT criteria surface); 0070 (frontend-builder two-stage — behaviour here, LOOK later
# only if irreducible); 0010 (organism + splitting-rule).
decisions: [209, 192, 82, 70, 10]
capabilities: [uat-row-one-liner, uat-row-opens-detail]
# Node-borne STORY-UAT proof config. EDIT-EXISTING Studio surface: AUTHOR_TEST extends
# UatTestCriteriaSection.test.tsx; IMPLEMENT edits TreeView.tsx (+ types/route as needed).
# Vitest jsdom (not node:test) — proofCommand must run vitest. Package suite is the observe gate.
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
    scope:
      testGlobs: ["apps/studio/src/components/UatTestCriteriaSection.test.tsx"]
      sourceGlobs: ["apps/studio/src/**"]
    install: true
    editsExisting: true
    proofCommand:
      file: pnpm
      args:
        - "--filter"
        - "studio"
        - "exec"
        - "vitest"
        - "run"
        - "src/components/UatTestCriteriaSection.test.tsx"
    typecheck:
      file: pnpm
      args: ["--filter", "studio", "typecheck"]
---

# Studio UAT criterion rows stay one-line and open the Library detail

**Outcome —** The Studio story detail panel renders each UAT criterion as the story-owned one-line
title and opening the row follows its Library detail pointer — never dumping procedure prose into
the table.

This is the **Studio concision** increment of the `model-uat-promotion` arc (ADR-0209 D7): the story
detail panel's UAT table stays scannable (story-owned one-liner per row), and opening a row follows
the criterion→detail Library pointer landed in increment 2 (`@storytree/uat-criterion`) so the full
action/success/evidence body lives in the Library, not in the table cell.

It stands on `uat-criterion-detail` (pointer + `displayTitle`) and the Studio surface that owns
`UatTestCriteriaSection`. It deliberately does **not** run a model judge, migrate pilot stories, or
reopen witness/tier/hash — each of those is a different journey.

## The journey (why this is ONE story — the journey-principle)

The consumer is the Studio reader scanning a story's UAT table: its goal is *"see the acceptance
intent at a glance, open the full criterion when I need the procedure."* Finishing "the row is a
one-liner" leads straight to needing "and I can open the detail artifact from that row" — one
continuous concise→openable journey (journey-principle). Its proof shares one precondition (a
criterion with an optional detail pointer) and one observable (row text + open-navigation), so the
splitting-rule keeps it whole.

**Pilot migration (ADR-0209 D8) stays OUT.** Different consumer (authors classifying real stories).

## Design floor (from ADR-0209 D7 — do not re-litigate)

- **Story-owned one-liner is display-canonical.** The panel renders the story criterion's one-line
  title (the `displayTitle` / criterion.title contract from `@storytree/uat-criterion`), never the
  detail body's action/success/evidence prose (ADR-0209 D5/D6/D7).
- **Open follows the Library pointer.** Opening the row navigates to the detail artifact the
  criterion points to (Library asset / lens pathway already owned by Studio). No second copy of the
  procedure in a modal template that erases story-specific evidence (ADR-0209 D7).
- **Criteria without a detail pointer stay honest.** A legacy row with no `(detail:)` still shows
  its story one-liner; open-detail is absent or inert — not a fake navigation (pilot/migration later
  attaches pointers).
- **Frontend-builder two-stage (ADR-0070).** This story proves geometry/behaviour in vitest
  (what text renders; what navigation fires). Visual polish LOOK is only escalated if an irreducible
  aesthetic gap remains after behaviour is green — not a default human queue.

## Scope boundary — what this story does NOT do

- **`model-uat-pilot`** — classify/detail `drive-machinery`, `library-review`,
  `library-tech-tree-overlay` (ADR-0209 D8).
- **Reopening incs 1–3** — no edits to `@storytree/model-uat`, `@storytree/uat-criterion`, or
  `@storytree/model-judged-uat` proof sources.
- **Deferred consumer glue from prior increments** — Library KIND_SPECS registration, CLI sync,
  story-author fence injection, live Fable adapter — still scheduled separately when landing honesty
  needs those surfaces.
- **Witness-icon / sign-UAT redesign** — the robot/person glyph and "I saw it work" path stay as
  landed (ADR-0082/0106); this story only changes title display + detail open.

## Capabilities (2)

Listed roots-first. Each is a **LEAF** — isolatable vitest red→green under `apps/studio` (hosted),
armed for `node build --real` with vitest `proofCommand` (hud-chrome precedent).

| # | capability | class | outcome | depends on |
|---|---|---|---|---|
| 1 | [`uat-row-one-liner`](uat-row-one-liner.md) | LEAF | Each UAT table row renders the story-owned one-line title; detail-body prose never appears in the title cell. | — |
| 2 | [`uat-row-opens-detail`](uat-row-opens-detail.md) | LEAF | When a criterion carries a detail pointer, activating the row navigates to that Library artifact; without a pointer, no fake open. | `uat-row-one-liner` |

## Within-story dependency graph

- `uat-row-opens-detail` → `uat-row-one-liner` — open affordance attaches to the same concise row;
  navigation must not reintroduce detail prose into the cell.

## Ownership (ADR-0192)

**Hosted in `studio` (`apps/studio`).** Every `proof.real.sourceFile` / scoped glob for the leaves
lives under `apps/studio/src`. Bootstrap must add `uat-detail-studio` to `repo-manifest.json`
`hostedStories.register` (hosted in studio) — packages-forward forbids a silent foreign squat.

Runtime dependency (honest `depends_on`):

- **`uat-criterion-detail`** — `displayTitle` + detail pointer shape already proven; Studio consumes
  the public `@storytree/uat-criterion` barrel (and/or API fields that carry `detailArtifactId`).
- **`studio`** — owns the `apps/studio` building and the Library lens / `assetHref` navigation.

## UAT Test Criteria

This story intentionally declares **zero story-UAT criteria** under ADR-0294. The deleted criteria
described capability/component assertions, not an end-to-end journey exercised through a real
surface. Their complete disposition audit is retained here before the absent numbered list:

| deleted criterion title | legacy key | current criterion id | lower-tier proving node and assertion |
|---|---|---|---|
| The row shows the story-owned one-liner. | `uat-detail-studio#uat-1` | `uatc_c8ac95ae8657a719ee831875` | Capabilities `uat-row-one-liner` and `criterion-detail-pointer`: the Studio component test asserts that the exact one-line title renders; the pointer tests attach a resolved long action/success body and assert that neither field can replace the story title. |
| Opening a pointed row reaches the Library detail. | `uat-detail-studio#uat-2` | `uatc_766469bf1341893d855b141e` | Capability `uat-row-opens-detail`, contract `uat-row-open-navigates-to-detail`: the component test asserts the exact Library asset href and that the one-liner remains the link label. |
| A row without a detail pointer does not fake-open. | `uat-detail-studio#uat-3` | `uatc_6dd0345314a8967b907b6b16` | Capability `uat-row-opens-detail`, contracts `uat-row-without-pointer-does-not-fake-open` and `uat-row-open-preserves-sign-glyph`: the component test asserts no detail link exists, the one-line title remains, and the human sign affordance is retained. |
| Witness sign path still works on a concise row. | `uat-detail-studio#uat-4` | `uatc_69926cb3a7b856f539e5ce3c` | Capability `uat-row-opens-detail`, contract `uat-row-open-preserves-sign-glyph`: the focused coexistence test asserts pointed human and machine rows keep distinct sign states, while the ADR-0082 witness tests assert a human leg is signable, a machine leg is inert, and signing issues the real sign call. |

No numbered story-UAT list follows because there is no remaining journey-level criterion to bind.

End state — Studio UAT rows are scannable one-liners that open real Library detail when pointed; procedure prose stays in the artifact.

## Reliability Gates

1. **The Studio UAT-criteria section suite is green** _(gate: observe)_ _(covers: uat-row-one-liner, uat-row-opens-detail)_ `pnpm --filter studio exec vitest run src/components/UatTestCriteriaSection.test.tsx`.
   The spine observes the vitest file that proves one-liner display, open-detail navigation, no-pointer
   honesty, and preserved sign behaviour for the covered capabilities. It then signs
   `uat-detail-studio#gate-1`; no story UAT criteria bind to this gate, and the adopted pass greens
   both capabilities via `(covers:)`.

Run from a clean committed rebuilt HEAD:
`pnpm storytree adopt uat-detail-studio --signer <email> --pg`.

## Proof

Package/host registration (hostedStories) lands first; then the two leaves chain through
`node build --real` (vitest); then Adopt observes the section suite. ADR-0085's own-proof union
permits this story to declare zero UAT criteria because its behaviour is wholly proven by the
capability proofs, while the reliability observe gate remains as the story-level adoption check.
Authored status stays `proposed`; `healthy` is derived (ADR-0020).

## Where this sits in the arc

1. **`model-uat-witness`** (landed) — tiered-witness DATA + eligibility.
2. **`uat-criterion-detail`** (landed) — seed-canonical detail, pointer, hash, author authority.
3. **`model-judged-uat`** (landed) — independent judge + spine + escalation.
4. **`uat-detail-studio`** (THIS story) — Studio one-liner + open-Library-detail (ADR-0209 D7).
5. **`model-uat-pilot`** (later) — three-story pilot migration (ADR-0209 D8); depends on 1–4.
