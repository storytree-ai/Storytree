---
id: "graduation-candidates"
tier: capability
story: notice-board
title: "A cite-threshold scan proposes graduation candidates"
outcome: "A cite-threshold scan over unarchived posts proposes graduation candidates for operator review."
status: proposed
proof_mode: integration-test
depends_on: [cite-event, archive-with-reason]
---

# A cite-threshold scan proposes graduation candidates

**Outcome —** A cite-threshold scan over unarchived posts proposes graduation candidates for
operator review.

**Depends on —** [`cite-event`](cite-event.md), [`archive-with-reason`](archive-with-reason.md)

> **Proof status (honest) — `proposed`, greenfield.** Would-be tests only. Design floor from
> ADR-0027 §3 (settling ADR-0014's C3): "the orchestrator **proposes** a graduation on a
> cite-threshold; the operator **approves** it" — this capability is the PROPOSE half only, and
> must be incapable of approving.

## Guidance

A pure, deterministic curation step in the spine's idiom (a function over the event log, like
`rollupStatus` — not an agent, not a judgment call):

- **Scan:** `graduationCandidates(events, threshold)` derives distinct-signer cite counts per
  unarchived post (`cite-event`'s derived count; `archive-with-reason`'s exclusion) and returns
  the posts at/over threshold that have no live candidate yet.
- **Propose = append:** for each, a candidate event `{ postId, citeEvidence[], proposedAt,
  threshold }` is appended. The evidence is the cite events (who/when/why) a reviewer reads — a
  candidate without evidence is refused.
- **Idempotent:** re-running the scan never duplicates a live candidate; a post whose candidate
  was rejected only re-candidates on NEW cites past the rejection (no nag loop).
- **Powerless by construction:** the scan can only ever append `candidate` events. Approval is a
  different event type with a different (signed, operator) author — `graduate-to-library` owns
  it. The threshold value itself is owner call #2 on the story.

## Integration test (would-be)

**Goal —** Against a real store seeded with real cite/archival events, the scan proposes exactly
the right candidates, idempotently, and cannot approve.

Seed: post A with 2 distinct-signer cites, post B with 1, post C with 3 cites but archived.
Scan at threshold 2: exactly one candidate (A), carrying A's cite evidence; re-scan appends
nothing; after a new cite on B, a second scan candidates B; no API exists for the scan to emit an
approval event.

## Contracts (3)

1. **`threshold-and-exclusion`** — only unarchived posts at/over threshold candidate
   - **asserts —** with the A/B/C seed above, the scan returns exactly A; archived C never
     candidates regardless of count.
   - **proven by —** would-be `packages/orchestrator/src/graduation-scan.test.ts`
2. **`scan-is-idempotent`** — re-running the scan never duplicates a live candidate
   - **asserts —** two consecutive scans append one candidate total; a post re-candidates only on
     new cites after a rejection.
   - **proven by —** would-be `packages/orchestrator/src/graduation-scan.test.ts`
3. **`propose-cannot-approve`** — the scan's only write is a candidate event with evidence
   - **asserts —** every event the scan appends is `candidate`-typed and carries non-empty cite
     evidence; an evidence-less candidate is refused.
   - **proven by —** would-be `packages/orchestrator/src/graduation-scan.test.ts`
