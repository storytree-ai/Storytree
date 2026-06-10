---
id: "graduate-to-library"
tier: capability
story: notice-board
title: "An operator-approved candidate graduates into the Library"
outcome: "An operator-approved candidate lands as a Library artifact through the validated write boundary with provenance to its post."
status: proposed
proof_mode: integration-test
depends_on: [graduation-candidates]
---

# An operator-approved candidate graduates into the Library

**Outcome —** An operator-approved candidate lands as a Library artifact through the validated
write boundary with provenance to its post.

**Depends on —** [`graduation-candidates`](graduation-candidates.md)

> **Proof status (honest) — `proposed`, greenfield.** Would-be tests only. This is the APPROVE +
> LAND half of ADR-0027 §3's split: the operator approves a proposed candidate **as a signed
> event**, and only then does anything reach the Library. Approval is non-authorable by the
> machinery — the exact ADR-0020 posture, applied to endorsement instead of proof.

## Guidance

- **Approval is a signed event:** `{ candidateRef, approvedBy, at }` where `approvedBy` resolves
  through the fail-closed signer chain. No candidate → no approval (an approval referencing a
  missing/rejected candidate is refused). Rejection is the symmetric signed event with a required
  reason (the `archive-with-reason` shape).
- **Landing goes through the front door:** the graduated artifact is written via the Library's
  validated write boundary (`upcastAndValidate` → store seam, the `library` story's capabilities)
  — never a raw row insert. Which Library kind it lands as is owner call #3 on the story
  (interacts with ADR-0029's `agent` category proposal).
- **Provenance is part of the artifact:** references back to the source post, the cite evidence,
  and the approval event ride the artifact's `references`/`provenance` fields (the grouped-Sources
  surface), so a reader can walk guidance → approval → cites → post.
- **Terminal + idempotent:** graduating marks the post graduated (an event, like archival);
  re-running graduation for the same approval is a no-op, not a duplicate artifact.

## Integration test (would-be)

**Goal —** Against a real store + the real Library write boundary (parity stores; live-gated pg
leg), only a signed approval of a live candidate produces exactly one valid artifact with full
provenance.

From a seeded candidate: an unsigned approval is refused; a signed approval lands one
zod-validated artifact whose provenance names post + cites + approval; re-running lands nothing
new; the post projection reads graduated; a rejection (signed, reasoned) graduates nothing and
the post only re-candidates on new cites.

## Contracts (4)

1. **`approval-is-signed-or-refused`** — only a signed operator approval of a live candidate
   proceeds
   - **asserts —** unsigned/unattributable approvals and approvals of missing or rejected
     candidates are refused fail-closed.
   - **proven by —** would-be `packages/orchestrator/src/graduate.test.ts`
2. **`lands-through-write-boundary`** — the artifact lands via upcast-validate, never raw
   - **asserts —** the graduated doc passes `upcastAndValidate` at the boundary; an
     invalid-shaped graduation is refused with the zod message and nothing persists.
   - **proven by —** would-be `packages/store/src/graduate-store.test.ts`
3. **`provenance-is-walkable`** — the artifact carries references to post, cites, and approval
   - **asserts —** the landed artifact's sources resolve to the source post id, the cite
     evidence, and the approval event.
   - **proven by —** would-be `packages/store/src/graduate-store.test.ts`
4. **`graduation-is-idempotent`** — one approval, one artifact, ever
   - **asserts —** re-running graduation for an already-graduated approval is a no-op; the post
     reads graduated in the projection.
   - **proven by —** would-be `packages/store/src/graduate-store.test.ts`
