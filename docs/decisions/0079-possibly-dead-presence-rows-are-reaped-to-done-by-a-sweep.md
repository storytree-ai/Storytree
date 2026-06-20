---
status: proposed
amends: [41]
---
# ADR-0079: Possibly-dead presence rows are reaped to done by a sweep

## Status

proposed (2026-06-20) — a session found 19 `status:active` presence rows that all classify
`possibly-dead` (oldest 146 h) polluting the `events.session` roster, cleaned them up, and
proposes this sweep so they stop accumulating. **Amends [ADR-0041](0041-possibly-dead-wisps-park-in-the-dock.md)**:
it enacts the data-side janitor ADR-0041 §"Known, accepted limitation" reserved for exactly
this condition, and narrows ADR-0041 Decision 2 (possibly-dead rows no longer park in the dock
*forever* — they are retired after the possibly-dead threshold). It *applies* — does not change —
[ADR-0033](0033-session-presence-notice-board.md)'s presence semantics: staleness stays derived,
automation stays advisory and never blocks, and the owner-set thresholds (fresh < 1 h,
possibly-dead ≥ 4 h) are untouched.

## Context

The notice-board's `events.session` projection accumulates zombie rows: sessions whose
`status` never flipped `active → done`. A 2026-06-20 live probe found **19 active rows, every one
of them `possibly-dead`** (≥ 4 h since `lastSeenAt`, the existing `classifyPresence` band), the
oldest quiet for 146 h, all labelled "interactive session on claude/…". They pollute the
`activeSessions()`/`listActive()` read and the studio session dock's parked list.

Two reliability mechanisms already exist and are *not* enough:

1. **`SessionEnd` is racy** (ADR-0041) — the hook is fail-silent by contract and the worktree
   (the session's identity) is often already deleted when it fires, so the `done` write is lost.
2. **The merge-retire backstop** (`ingest-merge.ts`, ADR-0033/0041) *is* wired into the CI
   automerge job and *does* work — a live run was observed authenticating (keyless WIF) and
   logging `no presence row … no-op`. But it is a **one-shot per branch tail**: it retires
   exactly the merged PR's own session id, once, at merge time. Probing the actual zombies shows
   three structural ways it misses:
   - **re-declare after merge** — `admiring-williamson`, `recursing-shaw`, `strange-shannon` all
     merged a PR, then kept working and re-declared presence *after* the merge, flipping the row
     back to `active` and clobbering the merge-time `done`. A one-shot at merge time cannot undo
     a later heartbeat.
   - **work merged under a different branch** — `gifted-borg` (the ADR-0074 hub work landed as
     PR #234 from `kind-dijkstra`): no PR ever had `gifted-borg` as its head ref, so the
     backstop's `sessionIdFromBranch` never matched it.
   - **PR closed, not merged** — `kind-cerf` (PR #231 was closed in favour of #234): the automerge
     job (hence the retire) never runs for a closed PR.

ADR-0041 foresaw precisely this: *"A data-side janitor (ageing active rows to `done` after some
horizon) stays available as later work if the dock's parked list grows noisy — it would be a
data change and would need its own decision."* The dock's parked list has grown noisy. This is
that decision.

A read-time guard (filtering `possibly-dead` out of the live surfaces) was considered and
rejected: ADR-0041 already does the display-level guarding (the world stops orbiting
possibly-dead, the "active" count is fresh + stale only, the dock parks them under an aged
label), so a read guard adds nothing — and it would not stop the *data* from accumulating
without bound.

## Decision

1. **A possibly-dead sweep retires zombie rows to `done`.** A pure selector
   `reapableSessions(docs, now)` (in `packages/notice-board/src/presence.ts`, beside
   `classifyPresence`) returns the rows that are still `status:"active"` AND classify
   `possibly-dead`. A fail-soft `reapStaleSessions(store, now)`
   (`packages/notice-board/src/store/reaper.ts`) lists the active rows, selects the reapable
   ones, and calls `PgPresenceStore.done()` on each — preserving each row's original
   `lastSeenAt` so the retired record stays truthful (the appended `done` event's `at` captures
   the reap time).

2. **The sweep rides the existing merge-retire CI step.** `ingest-merge.ts`'s entry, after
   retiring the merged session, now also calls `reapStaleSessions` over the same keyless pool.
   This reuses the automerge job's already-provisioned WIF auth + DB connection (ADR-0021,
   `infra/ci-presence.tf`) — **no new cron, IAM, terraform, or workflow**. Every `claude/*`
   merge sweeps the whole roster, so a zombie is cleared within one merge of crossing the 4 h
   threshold.

3. **The reap threshold is the existing `possibly-dead` band (≥ 4 h).** No new constant. This is
   safe because retiring is **non-destructive**: a session that is merely quiet-but-alive
   re-declares on its next heartbeat and `PgPresenceStore.declare`'s upsert flips it back to
   `active`/`fresh`. Only rows that *stay* quiet remain retired.

4. **Fail-soft, always.** Presence is advisory (ADR-0033) and the sweep runs inside the merge
   job, so every failure path — a `listActive` that never returns, one row's `done()` throwing —
   is caught, logged, and the sweep returns a count without rejecting. It can never fail a merge.

## Consequences

- The `events.session` roster and the studio dock stop accumulating unbounded `possibly-dead`
  rows; `listActive()` converges on plausibly-live sessions. The 19 standing zombies were
  retired by hand (the same `reapableSessions` predicate) as the immediate cleanup; this keeps
  them from coming back.
- **Amends ADR-0041 Decision 2:** the dock no longer keeps `possibly-dead` rows parked
  *indefinitely*. They are retired after the threshold — but the full record survives in the
  append-only `events.session_event` history (a `done` event is appended), so
  `PgPresenceStore.history()` still answers who/what/where for a retired session. The dock's
  brief in-band window (a session between 4 h quiet and the next merge) still shows it parked.
- The sweep only runs on `claude/*` merges (the existing step's gate). In a long merge drought a
  zombie can outlive 4 h until the next merge — acceptable, and far better than 146 h. If merge
  cadence ever proves too sparse, a scheduled sweep is a small follow-on (it would reuse the same
  `reapStaleSessions` + WIF service account).
- Proven offline: `reapableSessions` (pure, 5 cases incl. the 4 h boundary and the
  status-gate) and `reapStaleSessions` (fail-soft sweep over a fake store, 5 cases) keep
  `pnpm -r test` and CI DB-free.

## References

- [ADR-0041](0041-possibly-dead-wisps-park-in-the-dock.md) — the display recalibration this
  amends; its "Known, accepted limitation" reserved this janitor.
- [ADR-0033](0033-session-presence-notice-board.md) — presence semantics (derived staleness,
  advisory automation, the thresholds) this leaves intact.
- [ADR-0021](0021-keyless-agent-session-auth-and-db-bootstrap.md) — the keyless WIF auth +
  `infra/ci-presence.tf` the sweep reuses.
- `packages/notice-board/src/presence.ts` (`reapableSessions`),
  `packages/notice-board/src/store/reaper.ts` (`reapStaleSessions`),
  `packages/notice-board/src/store/ingest-merge.ts` (the wired entry),
  `.github/workflows/ci.yml` (the automerge step it rides).
