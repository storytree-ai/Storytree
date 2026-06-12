---
status: proposed
decided: 2026-06-12
---

# ADR-0037: Decision binding — structured ADR status, story↔ADR edges, and hygiene gates

## Status

proposed (2026-06-12) — authored from the owner direction call of 2026-06-12 ("proceed with the
ADR updates and then orchestration"). **Resolves and retires** the open-question
`oq-artifact-code-backing` (owner studio comment: **"yes go with B"**) — the fourth application of
[ADR-0018](0018-knowledge-tier-phase1-structured-source.md) §6's lifecycle (*record the decision in
an ADR, then retire the open-question*; ADR-0018, [ADR-0027](0027-supersede-adr-0014-notice-board.md),
[ADR-0032](0032-cite-graduation-mechanism.md) were the first three). Operationalises
[ADR-0016](0016-knowledge-code-binding-and-staleness.md)'s staleness intent for **decision records**
(ADR-0016 designed it for code anchors; full anchors stay its work, not this ADR's); extends
[ADR-0026](0026-library-schema-migrations-and-health-checks.md)'s health surface; the errors fire
through [ADR-0022](0022-ci-green-gate-and-auto-merge.md)'s CI green gate.

*Numbering note:* checked all remote branches (`git ls-tree` per ref) and the live library/comments
for ADR references on 2026-06-12 — 0036 is the latest taken; 0037 is free.

## Date

2026-06-12

## Context

Three honesty gaps share one root — claims about decisions are prose, so nothing re-checks them:

1. **ADR status is unqueryable.** Every ADR carries a `## Status` *section* — hand-written prose
   ("accepted (2026-06-08) — supersedes …"). Supersession is recorded as prose notes pasted into the
   superseded file's Status section. `CLAUDE.md` has to warn "read the Status lines first — many are
   superseded-in-part" precisely because nothing structural tracks it; ADR-0011 §5's overtaken
   DBOS line is the recorded incident.
2. **Stories don't link their deciding ADRs.** The work-hierarchy schema (`packages/core/schema.ts`)
   has `status`, `depends_on`, `covers` — but no decisions edge. Story prose cites ADRs constantly;
   none of it is traversable. So "this story went green, which decisions did it realise?" has no
   answer a machine can compute.
3. **Open-question hygiene is unenforced.** The OQ lifecycle (ADR-0018 §6: owner answers in a studio
   comment → a session records the decision in an ADR → the OQ is retired) works only when sessions
   remember. On 2026-06-12 the live store held two OQs whose decisions were implemented and even
   comment-resolved but never retired (`oq-library-doc-shape`, `oq-studio-store-default`), and one
   answered-but-unprocessed for days (`oq-corpus-source-format`). The owner saw "open" questions that
   weren't.

The owner's direction: stories should link back to their ADRs so decision state can be **tracked from
the story** — when a story flips green its ADRs' statuses must be right, with errors fired on
mismatch — and story health should be **gated on open-question hygiene**, forcing an implementation
session to get answers, close answered questions, or post a follow-up comment where an answer is
unclear.

One house principle constrains the shape: **status is a projection of evidence, never a write**
([ADR-0006](0006-event-store-observability-surface.md);
[ADR-0031](0031-real-pass-promotion-and-worktree-deps.md): "promotion lands *code*, never *status*").
An ADR's status is a *human* decision record — so it stays hand-flipped — but every claim *about* it
becomes machine-checked.

## Decision

1. **ADR files carry structured YAML frontmatter.** Every `docs/decisions/*.md` opens with:
   `status` (`proposed` | `accepted` | `superseded`), optional `decided` (ISO date), and optional
   **outgoing** edge lists `supersedes`, `supersedes_in_part`, `amends` (ADR numbers). Incoming
   edges ("superseded-in-part by …") are *derived* from other ADRs' outgoing lists — recorded in
   prose for readers, never double-entered in frontmatter. The prose `## Status` section stays as
   the detail; frontmatter is the queryable summary of the same fact. Retrofit applied to
   0001–0036 with statuses transcribed verbatim from their Status sections (no editorialising —
   ADR-0017 stays `proposed` even though it is load-bearing; the drift checks below are what will
   force that conversation).

2. **Stories declare their deciding ADRs.** The `Story` schema gains
   `decisions: number[]` (default `[]`) — the ADRs this story realises, in its frontmatter. Seeded:
   `library` → 17/18/19/23/26 · `drive-machinery` → 20/30/31/35 · `notice-board` → 33 ·
   `feedback-graduation` → 32 · `studio-foundation` → 8/36.

3. **Drift and integrity checks, fired through CI** (`pnpm -r test`, ADR-0022 — a red check blocks
   merge). The checks (new `adr-health` module in `@storytree/cli`):
   - every ADR parses and carries a known status (GATE);
   - every edge target exists (GATE);
   - **supersedes↔status consistency**: `X.supersedes ∋ Y` ⇔ `Y.status = superseded` (GATE);
   - every story `decisions` entry resolves, and no story names a **fully superseded** ADR as
     deciding (GATE);
   - **the green-flip rule**: a story with `status: healthy` whose deciding ADR is still
     `proposed` is a FAIL — the human flips the ADR (accept it or fix the link); the check is what
     fires the error. This encodes "once a story flips green all the ADRs flip status" without any
     machine ever writing a status.

4. **`oq-artifact-code-backing` → option B** (owner: "yes go with B"): **anchor resolution in the
   health check**, not per-artifact test suites (option A) yet. Backtick-quoted path-shaped tokens
   inside guardrail `enforcedBy` prose (e.g. `packages/agent`, `packages/cli/src/health.ts`) are
   resolved against the repo; a dangling one is a **WARN** (deletion-drift caught; `enforcedBy`
   stays prose — many name intended mechanisms not yet built, so a hard gate would lie). Option A
   (`backedBy` executable backing) is **named-deferred** against ADR-0016's anchor model, the same
   shape as DBOS in [ADR-0019](0019-library-tier-name-and-defer-dbos.md).

5. **Open-question hygiene gates story builds** (the posture change, owner-directed). OQs sit on
   the **gate side** of the advisory/gate line (presence, ADR-0033, stays advisory). At
   `story build --live` / `--real`, the spine resolves the story's deciding ADRs, finds
   open-questions whose `references` point at those ADR docs, and:
   - an OQ with an **unprocessed operator answer** (an unresolved operator comment) **refuses the
     build** — the session must process it: implement/record the decision and retire the OQ, or
     post a follow-up comment asking for clarity (which marks the answer as engaged);
   - an OQ **awaiting an answer** is a loud WARN (the session cannot force the owner; the build may
     proceed).
   Dry-runs and offline builds print what they could not check and never refuse — the gate needs
   the live comment store to have an opinion.

6. **Lifecycle bookkeeping recorded here** (so the retirements have their ADR): retire
   `oq-artifact-code-backing` (decision: §4). Retire the two already-landed stragglers —
   `oq-library-doc-shape` (owner "Go with C"; per-kind structured editing shipped 2026-06-10) and
   `oq-studio-store-default` (owner "Go with B"; the live store is the studio default, in
   `CLAUDE.md`). `oq-corpus-source-format` (owner "Go with A") stays **open** until its doc sweep
   actually lands — under §5 it will now nag every library-story build until processed, which is
   the system working.

## What this does NOT decide

- **ADRs do not move into the Library.** They stay git markdown — the source, per
  [ADR-0017](0017-cross-cutting-knowledge-tier.md) ("ADRs = source; artifacts = derived").
  Promoting them to a structured `adr` kind was considered and rejected for now: it would fork the
  source of truth for the one artifact class whose home is deliberately git.
- **No machine writes any status** — not ADR status, not story status. Checks fail; humans flip.
- **Full knowledge↔code anchors** (versioned, demote-on-drift) remain ADR-0016's deferred design;
  §4's token resolution is the cheap floor, not the anchor model.
- **Cite-graph integration**: story→ADR and OQ→ADR edges are cite-shaped
  ([ADR-0032](0032-cite-graduation-mechanism.md)); folding them into `events.cite` when that
  capability builds is feedback-graduation's work, not this ADR's.

## Consequences

- The studio's docs endpoint strips ADR frontmatter before serving (readers see prose; machines
  read structure). A status chip on the docs list is a natural follow-up, not in scope.
- `library-health-gate`'s "five checks" capability spec stays true: §4's anchor check lives in the
  new `adr-health` module, not `health.ts`; folding it into `libraryHealth` later means updating
  that capability spec in the same change.
- Future ADRs are authored frontmatter-first; superseding an ADR means adding the outgoing edge to
  the *new* ADR's frontmatter and flipping the old one's `status` — the consistency check refuses
  half-done supersessions.
