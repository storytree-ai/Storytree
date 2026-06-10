---
id: "cite-event"
tier: capability
story: notice-board
title: "Cites are attributable typed links; counts are derived, never stored"
outcome: "A cite is an attributable typed link between comments, cites, and artifacts; counts are derived, never stored."
status: proposed
proof_mode: integration-test
depends_on: []
---

# Cites are attributable typed links; counts are derived, never stored

**Outcome —** A cite is an attributable typed link between comments, cites, and artifacts; counts
are derived, never stored.

> **Proof status (honest) — `proposed`, greenfield.** Nothing exists: no schema, no store surface,
> no tests. Every "proven by" below is a would-be test. ADR-0032 §2 fixes the design: a cite is a
> typed **link** carrying who/when/why — not a forgeable counter — whose endpoints may each be a
> comment, a cite, or an artifact, so cites compose into a signal-graph across the whole system.

## Guidance

The cite is the notice board's atom of social proof and its **edge** primitive, shaped like the
system's other typed events (`packages/core` zod schema; persisted via the store seam alongside the
`events.comment*` tables it links into — exact table naming is implementation's call, history-event
+ projection like the substrate).

- **Shape:** `{ from, to, why, actor, at }` — `from`/`to` are typed endpoint references, each one of
  a **comment**, a **cite**, or an **artifact** (a node, a doc, or a Library unit). A cite both
  *reinforces* a signal (cite → comment) and *relates* signals/artifacts (comment → artifact,
  artifact → artifact), so traversing cites yields the signal-graph. `actor` resolves through the
  SAME fail-closed signer chain verdicts use (`resolveSigner`, `packages/core/src/signer.ts`): an
  unattributable cite is refused, not defaulted. `why` is required prose (an empty why is a refusal —
  the why is what a synthesis reviewer reads).
- **Counts are projections:** any count (e.g. cites *into* a target) derives from the log at read
  time, the `rollupStatus` pattern. There is NO stored counter to increment, decrement, or forge —
  exactly how health is non-authorable under ADR-0020.
- **The graph is the point, not the tally:** the read surface is *traversal* — given any endpoint,
  the cites touching it (in and out) — not a leaderboard. Per ADR-0032 §5 there is deliberately **no**
  cite-density / threshold / anti-gaming machinery here; a future synthesis agent reads the graph and
  judges it (`signal-synthesis`).
- **Identity is provenance, not a gate (ADR-0032 §6):** `actor` records who linked; what an
  agent-session cite is *worth* is the synthesis agent's concern and ties to `open-questions.md` §1 —
  it is not weighed by this primitive.

## Integration test (would-be)

**Goal —** Against a real store (parity: `InMemoryStore` + the pg impl), cites append as events,
endpoints resolve, the graph is traversable, and the forgery surfaces don't exist.

Append cites linking a comment→comment (reinforce) and a comment→artifact (cross-link); assert the
events persist in order with both endpoints, traversal from each endpoint returns the touching
cites, an unattributable cite (empty signer chain) and an empty `why` are refused fail-closed, and
no write path accepts a stored count.

## Contracts (3)

1. **`cite-requires-attribution`** — an unattributable or why-less cite is refused
   - **asserts —** appending a cite with no resolvable signer, or an empty/whitespace `why`,
     throws; nothing lands in the log.
   - **proven by —** would-be `packages/core/src/cite.test.ts`
2. **`cite-links-typed-endpoints`** — a cite records typed from/to endpoints and is traversable
   - **asserts —** a cite whose endpoints are any of comment/cite/artifact persists both refs;
     traversal from either endpoint returns the cite; an endpoint of an unknown kind is refused.
   - **proven by —** would-be `packages/core/src/cite.test.ts`
3. **`cite-store-parity`** — cites persist through the store seam with parity
   - **asserts —** the same cite sequence yields identical traversal results over `InMemoryStore`
     and the pg store (live-gated), event order preserved; no API exists to write a count.
   - **proven by —** would-be `packages/store/src/cite-store.test.ts`
