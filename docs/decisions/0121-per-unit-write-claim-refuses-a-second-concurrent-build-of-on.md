---
status: accepted
load_bearing: true
decided: 2026-06-27
amends: [9]
---
# ADR-0121: Per-unit write-claim refuses a second concurrent build of one unit

## Status

accepted (2026-06-27) — decided/directed by the owner in conversation on 2026-06-27. Design-time
alignment IS the ratification (ADR-0110); no second end-of-flow ask.

**Amends** [ADR-0009](0009-concurrency-isolation-id-allocation.md) without overturning it: it *enacts*
ADR-0009's typed claim on plain Postgres (the DBOS substrate ADR-0009 assumed was deferred by
[ADR-0019](0019-library-tier-name-and-defer-dbos.md), so the claim was named-but-unbuilt). **Builds the
typed-claims-with-refusal upgrade [ADR-0033](0033-session-presence-notice-board.md) §4 named-deferred**
— that ADR's **Decision 4** deferred the enforcing claim ("No claims, no conflict refusal… It is not
built now") *until* overlap conflicts became routine; the evidence arrived (the 2026-06-27 duplicate
build below), so this builds it for the build surface. ADR-0033's advisory presence board (Decisions
1–3, 5) stands untouched; only the deferral of the enforcing claim is overtaken (ADR-0033 corrected in
place per [ADR-0139](0139-the-accepted-adr-set-carries-no-stale-prose-correct-in-place.md)). Resolves
open-questions §3 (b) claim granularity and (c) the conflict-resolution ceremony for the build surface.

## Context

The system advertises parallel multi-session work — different sessions iterate different artifacts and
build different units against one shared Cloud SQL store, which is safe *because* state is per-id rows
(different ids never contend). The hole is the **same** unit: two sessions building one unit, or
editing one artifact, were uncoordinated.

ADR-0009 decided exactly the fix — a typed **claim** naming write-ownership, checked under a
unique/serializable constraint at node-schedule time, a **hard refusal** on conflict — but pinned it to
DBOS, and ADR-0019 deferred DBOS. So the claim became the canonical deferred-but-named mechanism.
ADR-0033 then shipped the notice board as **advisory presence** (it *shows* overlap; nothing refuses
anything) and, in §4, named typed-claims-with-refusal as "the explicit upgrade path **if** overlap
conflicts become routine… Evidence for 'routine' accrues in the board's own event history."

That evidence arrived. On 2026-06-27 two parallel cascade sessions independently built the SAME
capability (`chat-session-stream`); both ran `node build --real`, both signed a PASS, and both promoted
a `claude/real/*` branch — caught only by the best-effort pre-PR `git fetch origin/main`, which is a
reconciliation, not a guarantee. A duplicate signed verdict in the shared log and a wasted billed build
are the audit/integrity cost; that the loser's branch would have collided on the same files is luck,
not a gate. The owner directed: build the claim now (over downscoping the promise), as a plain-Postgres
claims table (DBOS stays deferred), scoped to the build race.

## Decision

A per-unit **write-claim** on plain Postgres — the enforcing twin of presence — refuses a second
concurrent build of one unit.

1. **Two tables in the central `schema.sql`** (additive, `IF NOT EXISTS`): `events.node_claim` (one row
   per claimed unit, `unit_id` **PRIMARY KEY** — the refusal point) and append-only
   `events.claim_event` (the audit history: `claimed` / `reclaimed` / `released` / `conflict-refused`).
2. **Granularity is the unit id** (story / capability / contract). Different units never contend (the
   existing per-id property); the same unit does (the hole). This answers open-q §3(b).
3. **A conflict is a HARD refusal, recorded as a typed event** (ADR-0009's exact stance). `PgClaimStore`
   (`@storytree/notice-board/store`) acquires atomically: it reads the holder `FOR UPDATE`, then either
   takes the unit (unclaimed / re-entrant same-session / a stale holder reclaimed) or **refuses** —
   returning the live holder so the caller can name it, and appending a `conflict-refused` row. The
   fresh-insert race the row-lock cannot cover (two sessions inserting the *first* claim) resolves via
   `ON CONFLICT (unit_id) DO NOTHING RETURNING` — exactly one winner; the loser refuses. Proven
   live: 8 sessions racing one unit yield exactly one acquire.
4. **Staleness replaces release discipline** (ADR-0033's choice, carried to claims): a crashed holder
   never ran `release()`, so a claim self-heals once its `heartbeatAt` is older than
   `CLAIM_STALE_RECLAIM_MS` (2 h — deliberately longer than any single build; the cost is asymmetric, a
   too-short window re-opens the very race this closes). A mid-build heartbeat that lets the window
   shrink is a named follow-on, mirroring presence's separate statusline heartbeat.
5. **Acquired spine-side around the build, live-store-gated** (ADR-0009 "at node-schedule time";
   ADR-0033 §3 "spine-side, no hooks"): `node build` / `story build` claim the unit before the leaf
   runs and release it in a `finally`. The claim is **enforcing** where presence is advisory — a
   refusal returns a clear envelope and the build does NOT proceed (presence swallows all failures and
   always proceeds). It is live exactly when verdicts persist (`--store pg`, i.e. `--live` / `--real`)
   and identity is worktree-derivable; a `--dry-run` (in-memory, no shared store) and a non-worktree
   build (no identity) are no-ops, mirroring presence — neither is the parallel-contention scenario.
   A failed `release()` is swallowed (the claim ages out via reclaim).
6. **Placement: the notice-board organism, not the library store.** The claim is presence's enforcing
   twin and the literal subject of ADR-0033 §4, so `PgClaimStore` sits beside `PgPresenceStore` in
   `@storytree/notice-board/store`, with the pure shape + reclaim predicate (`claim.ts`) in the
   browser-safe root barrel beside `presence.ts`. (This refines the design-conversation shorthand of
   "in the library store" toward organism cohesion; the table DDL still lives in the one central
   `schema.sql`, where every organism's tables already do.)

**Scope.** This closes the **build** race (the confirmed incident). The lower-stakes same-artifact
library **edit** race (a transactional JSONB upsert, last-write-wins, recoverable) is a named
follow-on — optimistic concurrency (a version compare-and-swap on `library artifact edit --pg`) is its
natural shape, not a build claim. DBOS remains deferred (ADR-0019); this is the plain-Postgres path.

## Consequences

- **Closed:** two sessions can no longer both build one unit through the gate — the second is refused
  before any worktree, spend, or duplicate promotion. The refusal is **auditable** (`claim_event`), so
  the "is overlap routine?" question ADR-0033 §4 posed now has a queryable home.
- **Unaffected:** different-unit parallelism (the common case) never touches a claim; the advisory
  notice board (ADR-0033) stands as-is — presence *shows*, the claim *refuses*; they are complementary
  reads/writes over sibling tables.
- **Paid:** a new DB coupling (two additive tables). A unit whose holder crashed stays locked until the
  reclaim window passes (≤ 2 h) — bounded, self-healing, and still backstopped by the pre-PR fetch for
  the rare reclaim-collision. No heartbeat yet, so a build legitimately exceeding 2 h could be
  reclaimed (no real build approaches this; the follow-on heartbeat removes even the theoretical risk).
  Dry-run / offline / non-worktree builds are uncoordinated by design (they don't share the store).
- **Enablement (post-merge, idempotent):** the two tables ship in `schema.sql` (additive,
  `IF NOT EXISTS`), applied by the standard `applySchema` migration path the live/real build already
  runs. Until applied, the claim path errors clearly and offline builds are unaffected. No data
  migration, no seeding.

## References

- [ADR-0009](0009-concurrency-isolation-id-allocation.md) (the claim this enacts), [ADR-0019](0019-library-tier-name-and-defer-dbos.md)
  (DBOS deferred — why plain Postgres), [ADR-0033](0033-session-presence-notice-board.md) §4 (the
  named-deferred upgrade this builds; the advisory board it complements), [ADR-0050](0050-adr-number-allocation.md)
  (the atomic-allocator precedent `PgClaimStore` mirrors), [ADR-0020](0020-red-green-enforcement-on-the-owned-loop.md)
  (the signed verdict a duplicate build would forge a second of).
- `docs/open-questions.md` §3 (b)/(c) — claim granularity + conflict ceremony, resolved here for the
  build surface.
- Code: `packages/notice-board/src/claim.ts` + `src/store/claim-store.ts` (the claim); `events.node_claim`
  / `events.claim_event` in `packages/library/src/store/schema.sql`; the spine-side acquire/release in
  `packages/drive/src/node-build.ts` (and the `story build` chain).
