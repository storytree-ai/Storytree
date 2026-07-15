---
status: accepted
decided: 2026-07-16
amends: [33]
load_bearing: true
---
# ADR-0199: A build run never writes session presence

## Status

accepted (2026-07-16) — decided/directed by the owner in conversation on 2026-07-16 after hitting the
defect twice on 2026-07-15/16. Design-time alignment IS the ratification (ADR-0110); no second
end-of-flow ask. **Amends [ADR-0033](0033-session-presence-notice-board.md)** — Decision 3's
build-side ambient rung (`withPresence`, "spine-side around SDK builds") is retired; the hook and
statusline rungs stand unchanged.

## Context

`withPresence` (ADR-0033 Decision 3, `packages/drive/src/ambient-presence.ts`) wrapped every
`node build` / `story build` leaf walk: declare presence before the leaf runs, mark `done` in a
`finally`. It keyed that declaration on `deriveIdentity()` — the **launching session's**
worktree-derived identity — because at the time the build WAS the only presence-worthy activity.

Two things have changed since:

1. **Builds got their own observability channel.** Every `--live`/`--real` build appends `building`
   work-events keyed by `(unit_id, run_id)` (ADR-0048 §3, now the *proving* colour state of
   ADR-0138's claim-wisp), and takes/releases a per-unit write-claim (ADR-0121/0138). The map's
   in-flight wisp reads `events.work_event` — never `events.session`.
2. **The session's presence row became load-bearing for the session itself.** `noticeboard declare
   --node` anchors the session and takes its work-time story claim (ADR-0142); the studio session
   dock and `check:declared` read the presence row.

That left `withPresence` with no rendering role and a destructive one instead — the exact "latent
bug" ADR-0048 named in 2026-06-14 but whose fix (Decision 4, run-keyed harness identity) was never
wired before ADR-0138 superseded it: a build launched from an interactive session **adopts and then
terminates the launching session's presence row**. It re-declares the session's `nodes`/`workingOn`
as its own run (`workingOn: "real run <id>", nodes: [<built node>]`), then at completion emits a
`done` event flipping the SESSION to `status: done`. The session vanishes from the dock, its
wisp-anchoring dies, and the gate's `check:declared` falsely warns the session is off the board —
while `events.node_claim` still truthfully holds the session's claims.

Evidence: `events.session_event` for session `clever-chatelet-76014c`, 2026-07-15 — 13:45 declared
`nodes=[embedded-terminal]` → 13:51 build re-declared `nodes=[terminal-dock-panel]
workingOn="real run real-mrm51y12"` → 13:58 `done` (owner interrupt #1) → 14:02 re-declared →
14:07 build re-declared again → 14:13 `done` (owner interrupt #2). The friction artifact is
`friction-real-build-marks-interactive-session-done`.

**The fork considered:** give the build run its own run-scoped presence identity (declare under
`run_id`, `done` its own row) versus write no presence at all. Run-scoped rows were rejected
against the corpus: ADR-0138 fixes the dock as "the lighter *session* roster" (a run is not a
session); the build's in-flight signal already lives on `events.work_event` with a 20-minute
self-cleaning TTL, so a presence row would be a duplicate write path (the thing ADR-0048 Decision 4
explicitly declined) with a worse failure mode — a hard-killed build would leave an `active` zombie
row until the 4-hour reap, recreating the stale-false-positive class ADR-0048 was written to kill.

## Decision

1. **A build run writes NO session presence.** `node build` / `story build` (every mode) neither
   declares nor retires any `events.session` row. The `withPresence` wrapper and its
   `BuildPresenceInfo` are deleted from `packages/drive/src/ambient-presence.ts`; the ambient-deps
   plumbing (`presence:` on `DriveNodeArgs` / `RealBuildArgs` / the story chain / the gate build
   driver) is removed with it.
2. **The build's footprint on the shared store is exactly: work-events + the write-claim.**
   `building`/phase marks on `events.work_event` (observability — the map's proving wisp) and the
   per-unit `events.node_claim` taken under the launching session's identity and released by
   `(unit_id, session_id)` on completion (coordination — ADR-0121/0138). Both already exist;
   neither touches `events.session`.
3. **Presence rows are written by sessions only** — the SessionStart/SessionEnd hooks, the
   statusline heartbeat (ambient, `reactivate: false`, ADR-0141), and a deliberate
   `noticeboard declare` / `done` (ADR-0142). The "deliberate reactivation" writer set (ADR-0079's
   reaper prose) shrinks accordingly: an explicit declare is the only deliberate reactivation
   signal left.

The work-hierarchy contract encoding the old behaviour
(`spine-declares-around-builds`, `stories/notice-board/ambient-integration.md`) is re-authored to
assert the inverse: a build drives to green with zero presence-store calls.

## Consequences

**Good**
- The two owner-facing lies die at the root: the session dock row survives its own builds, and
  `check:declared` stops false-warning after every inner-loop drive. The orchestrator no longer
  re-declares after every build (the `real-build-clobbers-session-presence` operational trap
  retires).
- Presence semantics become one-sentence honest: `events.session` = who is here (sessions),
  `events.node_claim` = who holds what (coordination), `events.work_event` = what is being proven
  (observability).
- One fewer advisory write per build; nothing renders differently — no studio surface read the
  build's presence row (the map's wisp reads work-events; the dock reads sessions).

**Bad / accepted**
- The CLI notice board (`storytree noticeboard --pg`) no longer lists an in-flight build as a
  pseudo-session row. Accepted: the same fact is visible as the unit's claim (intent `real`) and
  its `building` work-events; weaving those into the board view is a possible later nicety, not
  presence.
- A session whose presence row was merge-retired no longer gets resurrected by launching a build;
  it must re-declare deliberately. This is the ADR-0142 ceremony anyway (a branch dies on merge —
  cut fresh, re-declare).

## References

- [ADR-0033](0033-session-presence-notice-board.md) — presence + the ambient ladder (amended:
  the build rung is retired; hooks/statusline stand).
- [ADR-0048](0048-in-flight-build-is-the-primary-wisp.md) — named this exact clobber bug and the
  run-keyed direction; superseded by 0138 before the fix landed.
- [ADR-0138](0138-the-wisp-is-a-forced-ci-cleared-story-claim-one-coordination.md) — the claim is
  the wisp; the dock is the session roster; the build is the proving colour state.
- [ADR-0121](0121-per-unit-write-claim-refuses-a-second-concurrent-build-of-on.md) /
  [ADR-0142](0142-branch-dies-on-merge-the-wisp-survives-via-claim-at-declare.md) — the write-claim
  the build keeps.
- [ADR-0079](0079-possibly-dead-presence-rows-are-reaped-to-done-by-a-sweep.md) /
  [ADR-0141](0141-ambient-presence-heartbeat-never-resurrects-a-retired-sessio.md) — reaper /
  reactivation prose corrected in place alongside this ADR.
- Code: `packages/drive/src/ambient-presence.ts`, `node-build.ts`, `story-build.ts`,
  `packages/cli/src/gate-build-driver.ts`, `ambient-wiring.test.ts`;
  `stories/notice-board/ambient-integration.md` (contract re-author).
- Friction: `friction-real-build-marks-interactive-session-done`,
  `friction-released-build-wisp-reads-as-lost-claim` (the owner-interrupt evidence).
