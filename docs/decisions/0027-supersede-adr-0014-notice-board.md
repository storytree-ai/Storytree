# ADR-0027: Supersede ADR-0014 — the notice board folds into the Library tier; cite/graduation carried forward

## Status

accepted (2026-06-10). Records the owner decision (studio comment on `oq-adr-0014-draft`: **"B Supersede."**) to **supersede [ADR-0014](0014-notice-board-feedback-graduates-into-durable-guidance.md)** by
[ADR-0017](0017-cross-cutting-knowledge-tier.md) (the knowledge/Library tier — graduation's home) and
[ADR-0018](0018-knowledge-tier-phase1-structured-source.md) (the open-question → ADR graduation flow).
Applies ADR-0018 §6's lifecycle — *record the decision in an ADR, then retire the open-question* — to
its second case (ADR-0018 was the first). Builds on
[ADR-0019](0019-library-tier-name-and-defer-dbos.md) (DBOS deferred; the store is plain `node-pg`) and
the comments→events / studio↔store work ([ADR-0015](0015-gcp-hosting-cloud-sql-event-store.md) §6 /
ADR-0017) that has since shipped.

## Date

2026-06-10

## Context

[ADR-0014](0014-notice-board-feedback-graduates-into-durable-guidance.md) ("the notice board — anchored
prose feedback that graduates into durable guidance") was stamped **draft** since 2026-06-06, with four
open conflicts (C1–C4) raised to the owner. It proposed that operator/session feedback ("posts") live as
anchored typed events, accrue social-proof **cites**, and **graduate** into durable guidance.

Two things overtook the draft:

1. **Its graduation target was settled.** Conflict **C2 resolved** (owner, 2026-06-08): the graduation
   home is the single **`library` tier** that [ADR-0017](0017-cross-cutting-knowledge-tier.md) returned
   and [ADR-0019](0019-library-tier-name-and-defer-dbos.md) named — **no separate `forum/`** staging
   surface. The knowledge/Library tier and the open-question→ADR flow that ADR-0014 was reaching for are
   now owned by ADR-0017 and ADR-0018 respectively.

2. **The migration it depended on shipped.** Comments now persist as typed events
   (`events.comment` projection + the append-only `events.comment_event` history; `PgCommentStore` in
   `packages/store`), and the studio reads/writes the shared Cloud SQL Postgres store via
   `STORYTREE_STUDIO_STORE=pg`. ADR-0014's own status line — *"the comments→events / studio↔store
   migration … is still pending; `devApi.ts` + `comments.json` remain the live path"* — was therefore
   **stale**: the pg path is built; the JSON dev API is now the offline fallback only.

A `draft` ADR the implementation has overtaken is a drift risk: downstream units (and the
`oq-adr-0014-draft` open-question) cited it as if it were a live, unsettled decision. The owner directed
**option B — supersede** (studio comment on `oq-adr-0014-draft`, `6526c9ab-…`), carrying forward only
the genuinely still-open items.

## Decision

1. **ADR-0014 is superseded by ADR-0017 / ADR-0018, not retired.** Its status line now reads
   *Superseded by ADR-0017 / ADR-0018* with a dated supersession note and the stale "live path" claim
   corrected; the historical draft body is retained for the record. Supersede (not retire) preserves the
   lineage — the cite/graduation *intent* and the C2/C3 reasoning stay discoverable, attached to where
   the work actually landed.

2. **What ADR-0014 contributed is now owned elsewhere — confirmed item by item:**
   - **C2 (graduation home) → ADR-0017.** Graduation is a lifecycle into the one `library` tier (no
     `forum/`); the tier is ADR-0017's, named by ADR-0019.
   - **The post/comment substrate → ADR-0017 + ADR-0015 §6, *built*.** Posts are typed `events.comment`
     records with topic/section/text anchor grain; the studio is wired to the shared store.
   - **C1 (chat ↔ comments are one stream) → resolved-in-practice.** The shipped comment store *is* one
     anchored event stream at varying grain (topic/section/text), which is the C1 fold-in. The only
     residue — whether ADR-0008's (still-unbuilt) per-node *chat* shares that stream — folds into
     ADR-0008 when chat is built; it is not a standalone backlog item, and minting an open-question for an
     unbuilt surface would be speculative.
   - **C3 (curation trigger) → already resolved in ADR-0014 itself** (orchestrator *proposes* a
     graduation on a cite-threshold; operator *approves* it as a signed event). A decided-but-unbuilt
     policy, not an open question.

3. **One item is genuinely still open and is carried forward as a first-class open-question:**
   the **cite / graduation mechanism** — the concrete shape of a "cite" (a social-proof event carrying
   who/when/why; wrong posts **archived with a reason**, never a forgeable integer counter), the
   orchestrator **cite-threshold curation step** that surfaces graduation *candidates*, and the
   **cite-identity** question (ADR-0014's C4, which ties to `open-questions.md` §1 attestation/identity).
   This is exactly the *citing / reference / reciprocity mechanism + the comments/human-input layer* that
   [ADR-0017](0017-cross-cutting-knowledge-tier.md) **consciously deferred** — named there but with no
   tracked backlog unit. It is recorded as the open-question `oq-feedback-graduation-mechanism` in the
   Library (seed + live DB), so the deferral becomes first-class backlog rather than prose buried in an
   ADR's Deferred section.

4. **The `oq-adr-0014-draft` open-question is retired**, per ADR-0018 §6 ("record the decision in an ADR
   and **retire** the open-question — no manual close by the owner"). Retirement = `deleteDoc` against
   the shared store (which appends a `deleted` event to `events.library_event`, so history is preserved
   while the current-state projection drops it) plus removal from the `knowledge.json` seed — the same
   mechanism by which ADR-0018 retired its four resolved open-questions. The owner's studio comment on
   the unit (`6526c9ab-5e3e-47ab-8c05-3d09e8100b0e`, "B Supersede.") is marked **resolved**.

## Consequences

- ADR-0014 no longer reads as a live unsettled draft; readers are pointed at ADR-0017/0018 (owners) and
  ADR-0027 (this record).
- The Library's open-questions change by net **zero**: `oq-adr-0014-draft` retired, `oq-feedback-graduation-mechanism`
  added. Both the `knowledge.json` seed and the live Cloud SQL projection are updated consistently, and
  the generated views (`assets.json`, `docs/glossary.md`) are regenerated from the seed.
- The cite/graduation mechanism is now tracked backlog (it was a buried deferral in ADR-0017). It stays
  **deferred** — no build is claimed here; only its home moved from prose to a first-class unit.
- **ADR numbering:** `0027` is the next free number on this branch (which carries 0001–0026). Parallel
  branches may also reach for 0027; reconcile at merge time as prior merges did (e.g. the 0024→0025
  renumber). This is flagged, not silently assumed.

## References

- [ADR-0014](0014-notice-board-feedback-graduates-into-durable-guidance.md) (superseded here),
  [ADR-0017](0017-cross-cutting-knowledge-tier.md) (the Library tier; the deferred cite/reciprocity
  mechanism), [ADR-0018](0018-knowledge-tier-phase1-structured-source.md) (the open-question → ADR
  lifecycle this applies), [ADR-0019](0019-library-tier-name-and-defer-dbos.md) (DBOS deferred; plain
  `node-pg`), [ADR-0008](0008-ui-drives-agents-approvals.md) (per-node chat — the C1 residue's home),
  [ADR-0015](0015-gcp-hosting-cloud-sql-event-store.md) §6 (the comment store).
- `open-questions.md` §9 (the resolved cross-cutting-knowledge question that ADR-0014's graduation feeds)
  and §1 (identity/attestation, which the carried-forward C4 cite-identity facet ties to).
- The carried-forward unit `oq-feedback-graduation-mechanism`; the retired unit `oq-adr-0014-draft`;
  the owner comment `6526c9ab-5e3e-47ab-8c05-3d09e8100b0e` on the live store.
- `packages/store/src/pg-comment-store.ts` (`events.comment` / `events.comment_event`),
  `packages/core/src/store.ts` (`deleteDoc` — the retire mechanism), design conversation 2026-06-10.
