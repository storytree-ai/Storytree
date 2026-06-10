---
id: "notice-board"
tier: story
title: "The notice board — cites graduate posts into durable Library guidance"
outcome: "Operator and session feedback accrues attributable cites and graduates, operator-approved, into durable Library guidance."
status: proposed
proof_mode: UAT
capabilities: [cite-event, archive-with-reason, graduation-candidates, graduate-to-library]
---

# The notice board — cites graduate posts into durable Library guidance

**Outcome —** Operator and session feedback accrues attributable cites and graduates,
operator-approved, into durable Library guidance.

This is the cite / graduation mechanism that [ADR-0027](../../docs/decisions/0027-supersede-adr-0014-notice-board.md)
carried forward from the superseded ADR-0014 as the open-question
`oq-feedback-graduation-mechanism` — the one genuinely unbuilt piece of the notice-board idea.
The **post substrate is already built and is NOT re-scoped here**: posts/comments persist as typed
events (`events.comment` projection + append-only `events.comment_event`; `PgCommentStore` in
`packages/store`), and the studio reads/writes them against the shared store. This story builds
what sits ON that substrate: cites, curation, approval, graduation, and reasoned archival.

**First feature story through the drive (intent).** Unlike the seed stories (retrospective specs
over existing code), every capability here is greenfield `proposed` — authored first, to be built
through the prove-it-gate (`node build`/`story build`), with REAL worktree builds now able to
import workspace packages (`install: true`, ADR-0031 §2) and signed passes landing by promotion
(ADR-0031 §1). Registry entries are NOT pre-created — registration is the deliberate act that
makes a node buildable, done per node when its build is actually next.

## Design floor (from ADR-0027 §3, the carried-forward decisions)

- A **cite** is a social-proof **event** carrying who/when/why — never a forgeable integer
  counter. Counts are always derived from the event log.
- The orchestrator **proposes** graduation on a cite-threshold; the operator **approves** it as a
  signed event. Curation never self-approves (mirrors ADR-0020: proof — here, endorsement — is
  non-authorable).
- Wrong posts are **archived with a reason**, never deleted and never decremented: history stays,
  the projection drops them from curation.

## Capabilities (4)

Listed roots-first. All `proposed` — no code exists; the Proof note in each file is a would-be
integration test, not evidence.

| # | capability | outcome | status | depends on |
|---|---|---|---|---|
| 1 | [`cite-event`](cite-event.md) | A post accrues attributable who/when/why cite events whose count is always derived, never stored. | proposed | — |
| 2 | [`archive-with-reason`](archive-with-reason.md) | A wrong post is archived by a reasoned event that preserves history and removes it from curation. | proposed | — |
| 3 | [`graduation-candidates`](graduation-candidates.md) | A cite-threshold scan over unarchived posts proposes graduation candidates for operator review. | proposed | `cite-event`, `archive-with-reason` |
| 4 | [`graduate-to-library`](graduate-to-library.md) | An operator-approved candidate lands as a Library artifact through the validated write boundary with provenance to its post. | proposed | `graduation-candidates` |

## Dependency graph (predicted, not code-derived)

Greenfield story: these edges are the *designed* couplings the integration tests will assert,
to be re-derived from real imports once code exists (the `library` story's standard).

- `graduation-candidates` → `cite-event` — the scan derives per-post cite counts from cite events.
- `graduation-candidates` → `archive-with-reason` — the scan excludes archived posts (an archived
  post's cites never resurface a candidate).
- `graduate-to-library` → `graduation-candidates` — only a proposed candidate can be approved and
  graduated; approval references the candidate event.

**Cross-story boundary (first declared one — owner call #4):** every capability here consumes the
**comment/post substrate** owned by the existing organisms (`events.comment*` via the store seam)
and `graduate-to-library` writes through the **Library write boundary**
(`library-schema-and-write-validation` / `event-sourced-store-seam` in the `library` story).
Under ADR-0010 §4 these are cross-story interfaces and should be declared, not absorbed.

## Story UAT (would-be)

**Goal —** One operator, one session: feedback becomes durable guidance with an auditable trail,
and a wrong post leaves curation without losing history.

1. **Cite:** two different sessions cite an existing post with a why each. **Success —** two cite
   events persist (who/when/why), the post's derived cite count reads 2, and no stored counter
   exists anywhere to forge.
2. **Propose:** the curation scan runs with threshold 2. **Success —** exactly one graduation
   candidate event is appended, referencing the post and the citing evidence; re-running the scan
   is idempotent (no duplicate candidate).
3. **Approve:** the operator approves the candidate as a **signed** event. **Success —** the
   approval names the operator (signer chain, fail-closed) and the candidate; an unapproved or
   unsigned approval graduates nothing.
4. **Graduate:** the approved candidate lands as a Library artifact through the validated write
   boundary. **Success —** the artifact exists in the live store (zod-validated, event +
   projection), carries provenance back to the post and approval, and the post is marked
   graduated, not duplicated on re-run.
5. **Archive:** a different, wrong post is archived with a reason. **Success —** the archival
   event (who/when/reason) persists, the post leaves the curation surface, its cites no longer
   produce candidates — and its full history remains readable.

## Open modeling calls (for the owner)

1. **Cite identity (ADR-0014's C4).** Who may cite — any resolved signer (the fail-closed signer
   chain, as verdicts use)? Does an agent-session cite weigh like an operator cite? Ties to
   `open-questions.md` §1 (attestation/identity).
2. **Threshold policy.** A fixed N (UAT assumes 2)? Per-category? Operator-tunable config in the
   Library itself?
3. **Graduation target kind.** Which Library kind does a graduated post become — an existing
   guidance kind, or does it interact with ADR-0029's `agent` category proposal?
4. **Declare the cross-story interfaces** (comment substrate; Library write boundary) per
   ADR-0010 §4 — this story would be the first consumer of a declared interface.
