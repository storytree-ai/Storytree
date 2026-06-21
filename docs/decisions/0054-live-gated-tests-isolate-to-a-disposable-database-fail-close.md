---
status: accepted
decided: 2026-06-14
---
# ADR-0054: Live-gated tests isolate to a disposable database, fail-closed against production

## Status

accepted (flipped from proposed 2026-06-21 under [ADR-0084](0084-agents-may-flip-an-adr-green.md)) —
owner steer 2026-06-14: "fix the truncation bug so green can't be silently destroyed." This is the
fix; the owner accepted it in conversation 2026-06-21 (recorded under [ADR-0084](0084-agents-may-flip-an-adr-green.md)).
The one-time `storytree_test` provisioning below remains an operational prerequisite.

## Context

The store package's behavioural parity is proven against the real Postgres behind a live gate
(`STORYTREE_DB_LIVE=1`); the live DB is stopped by default, so the gate is normally skipped. Each
live suite starts clean by **truncating** its tables. But the setup connected with a bare
`createPool()`, which defaults to the **production `storytree` database** (ADR-0015) — so running the
live suite against the live instance ran, against production:

- `store.test.ts` → `TRUNCATE events.library_event, events.library_artifact` (the **library corpus**)
- `pg-work-store.test.ts` → `TRUNCATE events.work_event, events.verdict` (every **signed verdict**)
- `adr-store.test.ts` → `TRUNCATE events.adr_number` (the ADR allocator)

This is what silently wiped the `library` story's `8/8` signed verdicts and reverted its crown from
green to brown (verified 2026-06-14: `events.verdict` was empty). A signed verdict is the system's
only source of green (ADR-0020/0040); a **test run must never be able to destroy it.** The standing
"run live store tests per-file only" lore was a fragile workaround for a destructive default, not a
fix.

## Decision

1. **Destructive live-gated tests connect ONLY through `createTestPool()`** (`packages/store/src/test-db.ts`),
   never a bare `createPool()`. It resolves the database from `STORYTREE_DB_NAME` and **fails closed**
   — throwing a loud, instructional error *before opening any socket* — if the name is unset, blank, or
   the production database (`DEFAULT_DATABASE = "storytree"`). So the `TRUNCATE` can never reach
   production: the connection is refused first.

2. **Live tests run against a disposable database** on the same instance, e.g. `storytree_test`
   (its own `events` schema; the store SQL stays fully-qualified `events.*`, unchanged):

   ```
   gcloud sql databases create storytree_test --instance=storytree-pg   # one-time, owner
   STORYTREE_DB_LIVE=1 STORYTREE_DB_NAME=storytree_test STORYTREE_DB_USER=<iam-email> \
     pnpm --filter @storytree/store exec node --import tsx --test src/store.test.ts
   ```

3. **The guard itself is tested offline** (`test-db.test.ts`, in the default `pnpm -r test`): it refuses
   production / unset names and accepts a disposable one — so the protection can't silently rot.

Transactional rollback was rejected: the stores `COMMIT` internally (nested `BEGIN`/`COMMIT`), so an
outer rollback can't undo their writes. Database isolation is the clean fit and needs no SQL changes.

## Consequences

- Good: a `STORYTREE_DB_LIVE=1` run can no longer truncate production — at worst it refuses loudly
  with the exact fix. Signed verdicts (the green) and the corpus are durable against test runs.
- Cost: live tests now require a one-time `storytree_test` database + `STORYTREE_DB_NAME` (the error
  message and this ADR document both). `production createPool` is unchanged (CLI `--pg`, studio,
  CI presence-retire all still hit `storytree`); only the test path gained the guard.
- Not covered: `load-corpus.ts --force` is a separate documented hazard (a deliberate migration tool,
  not a test) and is out of scope here.

## References

- ADR-0015 — the Cloud SQL instance + `storytree` runtime database.
- ADR-0020 / ADR-0040 — green is a signed verdict; this protects that verdict's durability.
- `packages/store/src/test-db.ts` (`createTestPool`, `assertTestDatabase`), `test-db.test.ts`;
  `store.test.ts`, `pg-work-store.test.ts`, `adr-store.test.ts` (the live setups, now guarded).
