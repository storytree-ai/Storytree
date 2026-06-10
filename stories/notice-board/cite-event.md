---
id: "cite-event"
tier: capability
story: notice-board
title: "Cites are attributable events; counts are derived, never stored"
outcome: "A post accrues attributable who/when/why cite events whose count is always derived, never stored."
status: proposed
proof_mode: integration-test
depends_on: []
---

# Cites are attributable events; counts are derived, never stored

**Outcome —** A post accrues attributable who/when/why cite events whose count is always derived,
never stored.

> **Proof status (honest) — `proposed`, greenfield.** Nothing exists: no schema, no store surface,
> no tests. Every "proven by" below is a would-be test. ADR-0027 §3 fixes the design floor: a cite
> is a social-proof event "carrying who/when/why … never a forgeable integer counter."

## Guidance

The cite is the notice board's atom of social proof, shaped like the system's other typed events
(`packages/core` zod schema; persisted via the store seam alongside the `events.comment*` tables
it cites into — exact table naming is implementation's call, history-event + projection like the
substrate).

- **Shape:** `{ postId, citedBy, why, at }` — `citedBy` resolves through the SAME fail-closed
  signer chain verdicts use (`resolveSigner`, `packages/core/src/signer.ts`): an unattributable
  cite is refused, not defaulted. `why` is required prose (an empty why is a refusal — the why is
  what a graduation reviewer reads).
- **Counts are projections:** `citeCount(postId, events)` derives from the log at read time, the
  `rollupStatus` pattern. There is NO stored counter column to increment, decrement, or forge —
  exactly how health is non-authorable under ADR-0020.
- **Idempotency call:** one signer citing the same post twice is TWO events (a re-cite after time
  passes is real signal) but derived count may deduplicate by signer — surface both
  (`citeCount` distinct-signers; `citeEvents` raw) and let curation choose distinct-signers.

## Integration test (would-be)

**Goal —** Against a real store (parity: `InMemoryStore` + the pg impl), cites append as events,
counts derive correctly, and the forgery surfaces don't exist.

Append two cites from different signers and one repeat; assert `citeEvents` returns 3 in order,
distinct-signer count is 2, an unattributable cite (empty signer chain) and an empty `why` are
refused fail-closed, and no write path accepts a count.

## Contracts (3)

1. **`cite-requires-attribution`** — an unattributable or why-less cite is refused
   - **asserts —** appending a cite with no resolvable signer, or an empty/whitespace `why`,
     throws; nothing lands in the log.
   - **proven by —** would-be `packages/core/src/cite.test.ts`
2. **`cite-count-is-derived`** — cite counts derive from events at read time
   - **asserts —** after appending N cite events for a post, the derived distinct-signer count and
     raw count are correct; no API exists to write a count.
   - **proven by —** would-be `packages/core/src/cite.test.ts`
3. **`cite-store-parity`** — cites persist through the store seam with parity
   - **asserts —** the same cite sequence yields identical derived counts over `InMemoryStore` and
     the pg store (live-gated), event order preserved.
   - **proven by —** would-be `packages/store/src/cite-store.test.ts`
