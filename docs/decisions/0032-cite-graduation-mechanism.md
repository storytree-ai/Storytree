# ADR-0032: The cite + graduation mechanism — a cite is a typed link; graduation is a future synthesis agent

## Status

accepted (2026-06-10). **Resolves and retires** the open-question `oq-feedback-graduation-mechanism`
that [ADR-0027](0027-supersede-adr-0014-notice-board.md) carried forward from the superseded
[ADR-0014](0014-notice-board-feedback-graduates-into-durable-guidance.md). Applies the
[ADR-0018](0018-knowledge-tier-phase1-structured-source.md) §6 lifecycle — *record the decision in
an ADR, then retire the open-question* — for its third case (ADR-0018 was the first, ADR-0027 the
second). Records the owner decision (studio comment on the OQ, `a50e0372-99b5-461c-9d3c-1b5e9d6bd25e`,
now marked resolved). **Refines** ADR-0014's C3 and bullet-2, and **reshapes** the `notice-board`
story (`stories/notice-board/`, authored in PR #32). Builds on
[ADR-0017](0017-cross-cutting-knowledge-tier.md) (the Library tier; the consciously-deferred
citing/reciprocity bundle this settles) and [ADR-0008](0008-ui-drives-agents-approvals.md) (operator
identity as a signed event).

## Date

2026-06-10

## Context

The post/comment substrate shipped (`events.comment` + the append-only `events.comment_event`
history, `PgCommentStore`; the studio reads/writes the shared store via `STORYTREE_STUDIO_STORE=pg`).
What ADR-0027 left open and carried as `oq-feedback-graduation-mechanism` was the **mechanism**: the
shape of a "cite", the archive-with-reason lifecycle, and how accumulated feedback **graduates** into
durable Library guidance.

ADR-0014 (and the OQ's framing) reached for that mechanism as a *cite-density / cite-threshold*
machine: cites as social-proof events, a numeric threshold, an orchestrator that proposes on the
count, an operator who approves — with much of the design weight spent on making the counter
**forge-resistant** (the cite-stuffing failure mode). The owner reframed this on 2026-06-10:

- **The unit of the system is a signal, not a vote-count.** A *comment* is a signal that an artifact
  needs attention. A *cite* is not primarily a counter — it is a **link**: it reinforces a signal
  *and connects* signals and artifacts. A cite can target another **artifact**, not just a comment,
  so cites compose into a **signal-graph across the whole system** that can surface issues spanning
  the tree, not just upvotes on one post.
- **Graduation is intelligence, not arithmetic.** Turning accumulated signal into durable guidance is
  the job of a (future) **synthesis agent** that reads the signal-graph and emits **open-questions /
  proposals** into the existing ADR-0018 OQ→ADR flow — not a deterministic cite-threshold scan that
  auto-proposes a Library promotion.
- **Don't pre-solve the anti-gaming problem.** The forge-resistance / signal-vs-noise machinery was
  load-bearing when model intelligence was weak. Intelligence keeps rising, a capable agent does the
  curation, and **we have not yet observed cite-stuffing** — building defences for it now is solving
  an issue that does not exist.

## Decision

1. **Comment = a signal that an artifact needs attention** (operator or session). Already built
   (ADR-0017 / [ADR-0015](0015-gcp-hosting-cloud-sql-event-store.md) §6); not re-scoped here.

2. **A cite is a typed *link*, not a counter.** A cite is an event `{ from, to, why?, actor,
   createdAt }` whose `from`/`to` endpoints may each be a **comment, a cite, or an artifact** (a node,
   a doc, or a Library unit). It both *reinforces* a signal and *relates* signals and artifacts, so
   the cite set is a traversable **signal-graph** spanning the whole system. It is stored exactly like
   the comment substrate already proven — a history event stream plus a current-state projection
   (`events.cite` + append-only `events.cite_event`, mirroring `PgCommentStore`). Keep it minimal.

3. **Graduation is a future synthesis agent** (named, unbuilt). It reads the accumulated signal-graph
   and synthesises **open-questions / proposals** into the ADR-0018 OQ→ADR flow — it does **not** run
   a cite-density threshold that auto-proposes a Library promotion. This is the vision; the loop is not
   built, and nothing here claims it is.

4. **archive-with-reason stays.** A wrong or handled signal is closed by a reasoned, attributable
   event that preserves history (a record, not a delete) — the one piece of ADR-0014's design that
   carries through unchanged.

5. **Deprioritise the anti-gaming machinery.** No cite-density math, no cite-stuffing / forge
   defences, no signal-vs-noise threshold scaffolding — they solve an unobserved problem and assume an
   intelligence floor we have moved past. If cite-stuffing is ever observed, it becomes its own work
   item then, with evidence.

6. **Identity (`open-questions.md` §1 / ADR-0014's C4) is provenance on the edge, not a gate.** What
   backs a cite or comment from a session is still genuinely open, but it is now just the `actor`
   field's meaning on a link — not a weight in a threshold. The edge shape is specifiable now;
   agent-cite identity semantics land with §1, and the synthesis agent's trust in agent-authored
   signal is what actually waits on it.

## What this refines / reshapes

- **ADR-0014 C3** ("the orchestrator *proposes* a graduation on a cite-threshold; the operator
  *approves*") → **"a synthesis agent digests the signal-graph into OQs/proposals."** ADR-0014's
  **bullet 2** anti-forge framing ("a bare integer counter is rejected — forgeable") is relaxed per
  Decision 5. ADR-0014 is already superseded (ADR-0027); this updates the *carried-forward mechanism*,
  the live part of it.
- **ADR-0027 §3 / Consequences** ("the cite/graduation mechanism … stays **deferred**") → **decided
  here.** A forward-pointer is added to ADR-0027.
- **ADR-0017 Deferred** ("the citing / reference / reciprocity mechanism … and the comments layer") →
  the citing half is settled here (the comments layer shipped); a pointer is added.
- **The `notice-board` story** (`stories/notice-board/`) is re-authored to this direction: `cite-event`
  becomes cite-as-link; `graduation-candidates` (the deterministic threshold scan) and
  `graduate-to-library` (land-a-guidance-artifact) are replaced by one deferred `signal-synthesis`
  capability (the future agent); `archive-with-reason` is unchanged.

## Consequences

- **The OQ is retired**, per ADR-0018 §6: `deleteDoc` against the shared store (appends a `deleted`
  event — history preserved, current-state projection drops it) plus removal from the
  `apps/studio/data/knowledge.json` seed, and the generated views (`assets.json`, `docs/glossary.md`)
  regenerated. The Library's open-questions go from four to three. The *build* of the mechanism stays
  tracked by the `notice-board` story, not by an open question.
- **Near-term buildable** in `notice-board`: `cite-event` (as a typed link) and `archive-with-reason`.
  **Deferred**: `signal-synthesis` (the future agent; its trust in agent-authored signal waits on
  identity §1).
- **No anti-gaming scaffolding is built.** This is a deliberate non-goal, revisited only on evidence.
- **ADR numbering:** `0032` is the next free number on `main` (which carries 0001–0031). Parallel
  branches may also reach for `0032`; reconcile at merge time as prior merges did (e.g. the 0024→0025
  and the 0027 renumbers). Flagged, not silently assumed.

## References

- [ADR-0014](0014-notice-board-feedback-graduates-into-durable-guidance.md) (superseded; the
  mechanism's origin and the C3/bullet-2 framing refined here),
  [ADR-0017](0017-cross-cutting-knowledge-tier.md) (the Library tier; the deferred citing/reciprocity
  bundle), [ADR-0027](0027-supersede-adr-0014-notice-board.md) (carried the mechanism forward as the
  OQ), [ADR-0018](0018-knowledge-tier-phase1-structured-source.md) (the OQ→ADR lifecycle this applies),
  [ADR-0008](0008-ui-drives-agents-approvals.md) (operator identity / signed events).
- `open-questions.md` §1 (identity/attestation, which the cite `actor` semantics tie to).
- The retired OQ `oq-feedback-graduation-mechanism`; the resolved owner comment
  `a50e0372-99b5-461c-9d3c-1b5e9d6bd25e` on the live store.
- `packages/store/src/pg-comment-store.ts` (the substrate `events.cite` mirrors);
  `stories/notice-board/` (the build vehicle, re-authored here).
- Design conversation, 2026-06-10.
