---
status: accepted
decided: 2026-06-14
amends: [36, 38]
---

# ADR-0041: Possibly-dead session wisps park in the dock — the world orbits fresh/stale only

## Status

accepted (2026-06-14) — a display-level recalibration of the story world's presence layer.
**Amends [ADR-0036](0036-story-world-studio-visualisation.md) / [ADR-0038](0038-story-world-vocabulary-recalibration.md)'s
visual vocabulary** (what a wisp means on screen). It *applies* — does not change —
[ADR-0033](0033-session-presence-notice-board.md)'s presence semantics: staleness stays derived
(d.1 "staleness replaces release discipline"), automation stays advisory and never blocks (d.3),
and the owner-set thresholds (fresh < 1 h, possibly-dead ≥ 4 h, `packages/core/src/presence.ts`
*(now `packages/notice-board/src/presence.ts` — `packages/core` dissolved by ADR-0068)*)
are untouched.

**Correction (owner direction 2026-07-13, per
[ADR-0139](0139-the-accepted-adr-set-carries-no-stale-prose-correct-in-place.md)):** Decision 3's
map-top **toolbar count** is removed — the owner directed dropping the always-on map-top session
counter (the `(+N aged)` suffix / `N aged sessions` element) as redundant map clutter, in favour of a
full-bleed map (recorded in the `library-tech-tree-overlay-arc` increment log, desktop-layout-feedback
item B). The dock is now reached via a story panel's session rows → detail → "all sessions", not a
standing map-top count. This is an overtaken-detail correction, not a re-decision: the presence
semantics (D1), the parked possibly-dead listing (D2, as narrowed by ADR-0079), the "active counts
fresh + stale only" **meaning** wherever a count still shows (the dock header, `active sessions (N)`),
and the wisps are all untouched — only the map-top toolbar *surface* and its "so the dock stays
reachable" rationale are overtaken.

*Numbering note:* checked all remote branches post-`git fetch` for `docs/decisions/0041*` on
2026-06-14 — 0040 is the latest taken; 0041 is free.

## Date

2026-06-14

## Context

Session identity is the worktree name (ADR-0033 d.1) — `noticeboard done` only works from the
declaring worktree. When a worktree is deleted before a successful `SessionEnd` (the hook races
worktree teardown and is fail-silent by contract), the session's `status: active` row can never be
marked done. `PgPresenceStore.listActive` returns every active row with no age cutoff, so the
world rendered such sessions as wisps **forever**: they dimmed at the stale threshold, then orbited
story territories permanently as possibly-dead. Three such zombies existed on the live board on
2026-06-14 (plus an older unanchored one).

The data layer is working as designed — "sessions die ungracefully; the board view ages rows"
(ADR-0033 d.1). The bug is in what the *world* makes of an aged row: a wisp says "someone is
here", and a permanent wisp says it falsely, training operators to ignore the presence layer
(the exact credibility failure ADR-0033's heartbeat decision guards against).

## Decision

1. **The world stops orbiting possibly-dead wisps.** Only fresh and stale sessions render as
   wisps (stale keeps its existing dim + slow treatment). The hide is driven by the
   **client-recomputed** band (`usePresence`'s reband ticker, ADR-0036), so a wisp vanishes the
   moment it crosses the 4 h threshold — not at the next fetch. The seam is display-level
   (`isOrbitingBand` / `splitSessions` in `apps/studio/src/lib/presence.ts`), the house pattern
   of ADR-0038's `worldStatus` folds: data and thresholds untouched.
2. **The session dock and the story panel keep listing possibly-dead rows, parked.** They are the
   history/debugging surface: live sessions read first, parked rows group after them under a
   "possibly dead — quiet ≥ 4 h, no longer orbiting" label, visually aged. Detail view is
   unchanged — a parked session's card still answers who/what/where.
3. **"Active" counts fresh + stale only.** The toolbar count (and the dock header) speak the
   orbiting set; permanently-dead rows in an "active" count read as noise. Aged sessions surface
   as a `(+N aged)` suffix — or `N aged sessions` when nothing is live — so the dock stays
   reachable.
   *(Overtaken in part — see the Correction in Status: the map-top **toolbar** count is removed
   (owner, 2026-07-13); the "active = fresh + stale (orbiting)" meaning stands on the dock header.)*
4. **The legend reflects the new truth.** The sessions entry appears only when something orbits;
   its bar icons fan fresh/stale only; the possibly-dead tile in the drawer becomes a pointer
   ("parked in the session list, not orbiting").

## Known, accepted limitation — the SessionEnd teardown race

A `SessionEnd` hook racing worktree deletion is **inherent**: the hook is fail-silent by contract
(ADR-0033 d.3 — a board write failure never fails the enclosing action), and the worktree — the
session's identity — may already be gone when it fires. We do not try to fix the hook; rows
orphaned this way are exactly what the 4 h band plus this display rule absorb. `SessionStart`
self-heal (PR #84) covers the matching start-of-life gap. A data-side janitor (ageing active rows
to `done` after some horizon) stays available as later work if the dock's parked list grows
noisy — it would be a *data* change and would need its own decision.

> **Enacted by [ADR-0079](0079-possibly-dead-presence-rows-are-reaped-to-done-by-a-sweep.md)
> (2026-06-20).** The dock's parked list did grow noisy (19 possibly-dead rows, oldest 146 h),
> so ADR-0079 enacts that janitor: a fail-soft sweep retires possibly-dead active rows to `done`,
> riding the existing merge-retire CI step. This narrows Decision 2 — possibly-dead rows no
> longer park in the dock *indefinitely* (the append-only `events.session_event` history still
> retains them for debugging).

## Consequences

- A finished session's wisp now disappears from the world at worst 4 h after its last heartbeat;
  territories only ever orbit sessions that are plausibly alive.
- The board (CLI `storytree noticeboard`) is untouched — it lists and ages all rows as before;
  only the world's at-a-glance layer narrows.
- The dock is now the only surface for possibly-dead sessions in the studio — deliberate: a
  surface you open to investigate, not one that ambiently claims liveness.
- `pnpm gate` covers the seam: presence-hook tests pin the reband-tick unmount (zero fetches),
  legend tests pin the bar/fan split.
