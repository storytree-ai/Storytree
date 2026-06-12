---
id: "presence-store"
tier: capability
story: notice-board
title: "Declarations persist as append-only events plus a one-row-per-session projection"
outcome: "Declarations persist through the store seam as append-only events plus a one-row-per-session projection, atomically."
status: proposed
proof_mode: integration-test
depends_on: [declare-presence]
---

# Declarations persist as append-only events plus a one-row-per-session projection

**Outcome —** Declarations persist through the store seam as append-only events plus a
one-row-per-session projection, atomically.

> **Proof status (honest) — since PROVEN and PROMOTED (ADR-0031).** The gated leaf authored
> `packages/store/src/presence-store.ts` + its test in a fresh worktree; the spine observed the
> real red→green and signed a PASS (run `real-mq8ncq3s`, commit `e0e8ccb`, persisted to
> `events.verdict`). The authored status stays `proposed` forever: `healthy` is only ever derived
> from signed verdicts (ADR-0020). The design (ADR-0033 Decision 1): the house event+projection
> pattern — `events.session_event` (history) + `events.session` (current state), siblings of
> `events.comment*`, written together atomically. The registered proof was the OFFLINE leg only —
> pure helpers + a fake transactional client; live SQL stays live-gated and human-verified, never
> attested by a worktree PASS.

## Guidance

The implementation is `packages/store/src/presence-store.ts` — a `PgPresenceStore` mirroring
`PgCommentStore` (`packages/store/src/pg-comment-store.ts`, the pattern ADR-0033 names). The DDL
already exists at HEAD in `packages/store/src/schema.sql` (additive, spine-side — outside your
write scope, do not touch it): history is **`events.session_event`** (`seq BIGSERIAL, id TEXT`
= the sessionId, `type TEXT, doc JSONB, actor TEXT, at TIMESTAMPTZ`); the projection is
**`events.session`** (`id TEXT PRIMARY KEY, doc JSONB, created_at, updated_at`).

- **The exported surface (exactly this — the offline test and the downstream CLI drive it):**
  - structural seams a real `pg.Pool` already satisfies (so the offline test passes a fake):
    `interface PresenceClient { query(text: string, values?: unknown[]): Promise<{ rows: unknown[] }> }`;
    `interface PresencePoolClient extends PresenceClient { release(): void }`;
    `interface PresencePool extends PresenceClient { connect(): Promise<PresencePoolClient> }`.
  - `interface PresenceEvent { type: string; doc: unknown; actor: string; at: string }`.
  - `class PgPresenceStore { constructor(pool: PresencePool) }` with exactly four methods:
    `declare(doc: PresenceDeclarationDoc): Promise<PresenceDeclarationDoc>` (returns the persisted,
    possibly-merged doc), `done(sessionId: string, lastSeenAt: string): Promise<PresenceDeclarationDoc | null>`
    (null when no projection row exists), `listActive(): Promise<PresenceDeclarationDoc[]>`
    (projection rows whose `doc.status === "active"`, ordered by id), and
    `history(sessionId: string): Promise<PresenceEvent[]>` (`session_event` rows for that id,
    ordered by `seq`). **No method updates or deletes a `session_event`** — history is append-only
    by surface; `done` is one more event plus a projection status flip.
- **One transaction per write (the `PgCommentStore.create`/`update` shape verbatim):** `declare`
  takes a dedicated client (`pool.connect()`), issues `BEGIN`; reads the existing projection row
  for `doc.sessionId` inside the transaction; appends ONE
  `INSERT INTO events.session_event (id, type, doc, actor) VALUES (…)` with type `'declared'`,
  the persisted doc as JSONB, and `actor` = the doc's `sessionId`; upserts ONE
  `INSERT INTO events.session (id, doc) VALUES (…) ON CONFLICT (id) DO UPDATE SET doc =
  EXCLUDED.doc, updated_at = now()`; then `COMMIT`. Any error → `ROLLBACK` + rethrow; the client
  is always `release()`d in a `finally`. `done` is the same dance: read the row (missing →
  `ROLLBACK`, return null), merge `{ status: "done", lastSeenAt }`, append a `'done'` event,
  upsert, commit.
- **The doc's brain comes from `declare-presence` (core):** when `declare` finds an existing row,
  persist `mergeDeclaration(existingDoc, incomingDoc)` — import `mergeDeclaration` and
  `type PresenceDeclarationDoc` from `@storytree/core`; the merge ignores `undefined` fields and
  re-anchors `sessionId`/`startedAt` itself. When no row exists, persist the incoming doc as-is.
  Do NOT re-implement merge, validation, or staleness here; the store has no clock — `lastSeenAt`
  arrives on the incoming doc (callers bump it).
- **The test is OFFLINE-ONLY (the registered REAL proof):** drive a FAKE `PresencePool` whose
  client records every `query(text, values)` call and returns canned projection rows
  (`{ rows: [{ id, doc }] }` shaped). One declare issues, in order, on the SAME client:
  `BEGIN` → the projection SELECT → exactly ONE `session_event` INSERT → exactly ONE `session`
  upsert → `COMMIT` (five statements total — the SELECT is part of the transaction, count it).
  Assert by ORDERED SUBSEQUENCE and by counting the INSERTs, never by an exact total-call-count or
  byte-exact SQL strings (match fragments like `INSERT INTO events.session_event`) — you cannot
  run this test yourself, so brittle assertions are how this build dies. Also assert: a
  fake-induced failure on the upsert → `ROLLBACK` issued, no `COMMIT` (abort-together); a
  re-declare for the same `sessionId` (the fake returns the previously stored row) persists the
  MERGED doc — `startedAt` survives, the changed `workingOn`/`nodes` land — still keyed on the same
  id (upsert, never a second row) while history grows by one event; `done` appends a third
  event and flips the persisted projection doc's status; `history` returns events in order.
  NO live DB, no `STORYTREE_DB_LIVE` leg, no env probing — the live parity run is explicitly
  OUTSIDE this proof (later spine work: live-gated per-file, truncating ONLY the session tables).
- **No signer chain, advisory writes:** presence is not proof (ADR-0033 Decision 1) — rows carry the
  worktree-derived `sessionId`, nothing is signed, and nothing here refuses on overlap. Failure
  modes are connection-shaped (DB down → throw to the caller, who degrades gracefully), never
  conflict-shaped.
- **Cross-story seam (ADR-0010 §4):** the connection comes from the `library` story's
  `event-sourced-store-seam` (`createPool`, keyless IAM) — consumed, not absorbed; this module
  never creates pools itself.

## Integration test

**Goal —** OFFLINE, against a fake transactional client (the registered, REAL-buildable proof):
a declare issues exactly one event insert plus one projection upsert inside one transaction,
re-declares upsert while history grows, and the surface exposes no history rewrite. The same
sequence against the live pg store is the **live-gated parity leg** — run per-file behind the live
gate and human-verified (the `PgCommentStore` posture), explicitly OUTSIDE the registered
REAL-build proof, which a DB-less worktree could never run honestly.

Declare once and assert one `events.session_event` insert and one `events.session` upsert were
issued in the same transaction with the same doc; re-declare with changed `workingOn`/`nodes` and
assert the projection updated in place (still one row) while history holds two events; mark `done`
and assert it is a third event plus a projection status flip, with all three history events still
readable in order.

## Contracts (3)

1. **`presence-event-plus-projection-atomic`** — each declare appends one event AND upserts the
   projection in one transaction
   - **asserts —** against the fake transactional client, a declare issues exactly one
     `events.session_event` insert and the matching `events.session` upsert between one
     BEGIN/COMMIT; an induced mid-write failure rolls back leaving neither (abort-together).
   - **proven by —** `packages/store/src/presence-store.test.ts` (real at HEAD) (offline; live parity
     live-gated per-file)
2. **`one-row-per-session`** — the projection is keyed by `sessionId`
   - **asserts —** a re-declare for the same `sessionId` updates that projection row, never
     duplicates it; history grows by exactly one event per declare.
   - **proven by —** `packages/store/src/presence-store.test.ts` (real at HEAD)
3. **`history-append-only`** — no update/delete path exists for events
   - **asserts —** the store surface exposes no way to update or delete a `session_event`; `done`
     is one more event plus a projection status flip, and the full ordered history stays readable
     after it.
   - **proven by —** `packages/store/src/presence-store.test.ts` (real at HEAD)
