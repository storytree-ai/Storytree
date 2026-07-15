---
status: accepted
decided: 2026-07-02
amends: [79]
---
# ADR-0141: Ambient presence heartbeat never resurrects a retired session

## Status

accepted (2026-07-02) — decided/directed by the owner in conversation on 2026-07-02. Design-time
alignment IS the ratification (ADR-0110); no second end-of-flow ask. **Amends
[ADR-0079](0079-possibly-dead-presence-rows-are-reaped-to-done-by-a-sweep.md)**: its Decision 3
safety rationale ("a quiet-but-alive session re-declares on its next heartbeat and the upsert flips
it back to active") is narrowed — reactivation is now an *explicit* signal, never the ambient beat.
ADR-0033's presence semantics (advisory, fail-silent, derived staleness) are untouched.

## Context

Observed live 2026-07-02: seven "fresh" no-node sessions on branches already merged to `main`
(e.g. `claude/elegant-kare-8b5aa5` = merged PR #525) kept reappearing on the notice board. The
resurrection chain:

1. On a `claude/*` merge, `ingest-merge.ts` correctly retires the session row to
   `status: "done"` (and the ADR-0079 reaper sweeps possibly-dead rows the same way).
2. Any still-open idle Claude tab keeps firing the statusline hook. `statuslineGlance`
   (`packages/drive/src/ambient-presence.ts`) re-declares on its 5-minute heartbeat debounce —
   and because the retired row is invisible to `listActive()`, the lost-SessionStart *self-heal*
   branch fired, declaring a fresh minimal `status: "active"` doc. `PgPresenceStore.declare`'s
   upsert then flipped the done row back to active.

So merge-retire was permanently defeated for open tabs and the board filled with noise. The
self-heal exists to recover the fresh-worktree lost-SessionStart bug (declaring a minimal
`nodes: []` row when NO row exists); it was never meant to reanimate retired rows. ADR-0079 even
leaned on heartbeat resurrection as the reaper's safety valve — which is exactly the mechanism
that kept zombies alive.

## Decision

1. **Ambient presence writes are marked at the store seam.** `PgPresenceStore.declare` (and the
   `PresenceStoreLike` seam in `packages/drive`) gains an optional `opts: { reactivate?: boolean }`,
   default `true`. With `reactivate: false`, a declare against a row whose stored `status` is
   `"done"` is a **no-op**: no event appended, no projection upsert, the retired doc returned
   unchanged. The guard reads the row inside the same transaction as the write, so a retire landing
   between a glance's `listActive` and its declare is still respected.
2. **The statusline heartbeat/self-heal is ambient.** Every `statuslineGlance` write — the
   `lastSeenAt` bump *and* the self-heal declare — passes `reactivate: false`. The self-heal still
   works when no row exists at all (the bug it was built for); it just no longer counts a retired
   row as "missing".
3. **Explicit signals still reactivate.** `storytree noticeboard declare` and the `SessionStart`
   hook (a genuinely new session in the worktree) keep the default
   `reactivate: true` — a deliberate "I'm back" flips a retired row to active exactly as before.
   *(~~and a build's `withPresence`~~ **removed** by
   [ADR-0199](0199-a-build-run-never-writes-session-presence.md), per
   [ADR-0139](0139-the-accepted-adr-set-carries-no-stale-prose-correct-in-place.md): a build run
   writes no session presence, so it is no longer a reactivation writer.)*

## Consequences

- Merge-retire and the ADR-0079 reap are now durable against idle tabs: a retired session stays
  off the board until it does something deliberate. The observed board noise class disappears.
- ADR-0079's "non-destructive retire" story changes shape: a quiet-but-alive session that gets
  reaped no longer self-restores on its next heartbeat — it reappears when it next explicitly
  declares or runs a build. That is the intended trade: an idle tab is not evidence of live work.
- A retired row's `lastSeenAt` stays truthful (the ambient no-op does not bump it), preserving
  ADR-0079's honest-record property.
- Proven offline in `packages/notice-board/src/store/presence-store.test.ts` (the store guard:
  done row untouched, active row still bumps, absent row still created, explicit declare still
  reactivates) and `packages/drive/src/ambient-presence.test.ts` (the glance passes
  `reactivate: false` on both write paths; a done row survives the beat).

## References

- [ADR-0033](0033-session-presence-notice-board.md) — presence semantics; the statusline
  heartbeat (owner decision 2) this scopes.
- [ADR-0079](0079-possibly-dead-presence-rows-are-reaped-to-done-by-a-sweep.md) — the reaper this
  amends; its Context already documented "re-declare after merge" as a way zombies survive.
- [ADR-0110](0110-collapse-the-redundant-end-of-flow-adr-ratification.md) — why this is born accepted.
- `packages/notice-board/src/store/presence-store.ts` (`declare` guard),
  `packages/drive/src/ambient-presence.ts` (`statuslineGlance`),
  `packages/notice-board/src/store/ingest-merge.ts` (the merge-retire this protects).
