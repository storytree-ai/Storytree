---
status: accepted
decided: 2026-06-14
amends: [41]
---

# ADR-0048: The in-flight build is the primary wisp — harness-driven, self-cleaning presence

## Status

accepted (2026-06-14; ratified 2026-06-20) — owner steer in conversation 2026-06-14: *"go all in on the harness so that
when the leaf agents run the mechanical red-green TDD process, the UI is updated. This should make it
fully mechanical and I shouldn't get all these stale false positives, or like now nothing at all.
This might mean wisps only happen when the actual wiring work happens, but I think that's good design.
We can take a look at 'I'm planning work around this' claims showing up in a different form later."*

**Demotes session presence out of the orbiting-wisp role ([ADR-0033](0033-session-presence-notice-board.md))**
— the *session* no longer orbits a tree; the *mechanical build* does. Session presence stays (the data
model, the dock) but loses the orbiting-wisp role (ADR-0033 corrected in place per
[ADR-0139](0139-the-accepted-adr-set-carries-no-stale-prose-correct-in-place.md)). **Reverses
[ADR-0045](0045-live-activity-layer-is-verdict-blooms.md)'s §6 "presence is NOT demoted (owner call
2026-06-14)" and picks up its named-deferred in-flight 'building' shimmer** — now in scope as this
ADR's centrepiece (ADR-0045 corrected in place per
[ADR-0139](0139-the-accepted-adr-set-carries-no-stale-prose-correct-in-place.md)). **Amends
[ADR-0041](0041-possibly-dead-wisps-park-in-the-dock.md)** — the wisp gains a new `building` band
above `fresh`. **Applies [ADR-0020](0020-red-green-enforcement-on-the-owned-loop.md) /
[ADR-0030](0030-claude-agent-sdk-live-runtime.md)** — the signal is sourced from the prove-it-gate's
phase walk and the leaf executor it drives.

**Superseded-in-part by [ADR-0138](0138-the-wisp-is-a-forced-ci-cleared-story-claim-one-coordination.md)** — the wisp is now the render of a forced story-CLAIM, not only of a build; the build becomes a colour STATE of the claim wisp (honest-by-absence generalises).

*Numbering note:* 0046 is the latest on `main`; 0047 is taken by open draft PR #109
(`inbound-signal-librarian`). 0048 is free across all fetched refs and the live DB carries no ADR
rows (ADRs are docs, ADR-0017/0018).

## Date

2026-06-14

## Context

The story world (`#/tree`, ADR-0036) was meant to show agent wisps floating around the trees they're
working on, in real time. In practice the owner sees either **stale false positives** or **nothing at
all**. A diagnostic pass (2026-06-14) found the cause is structural, not a stale deploy — the deployed
studio image carries byte-identical wisp/presence/bloom code to `main`. The live `events.session`
table told the story: **17 rows, every one `possibly-dead`** (oldest 58 h, newest ~16 h), **10 still
flagged `active`** (zombies — sessions that ended without `SessionEnd` flipping them to `done`), and
**zero wisp-eligible** right now. The last build verdict was 35 h ago.

Two failure modes fall out of binding presence to **sessions** (ADR-0033) rather than to **work**:

1. **A normal session never produces a wisp.** The `SessionStart` hook and the statusline heartbeat
   self-heal both declare with `nodes: []` (`packages/cli/src/ambient-presence.ts`), and a row with
   no resolvable node anchors nowhere — it shows in the dock list only, never as an orbiting wisp
   (`TreeView.tsx`, `sessionAnchors`). The only writers of `nodes:[<id>]` are a manual `noticeboard
   declare --node` (rare) and an actual `node build` / `story build` via `withPresence` — neither of
   which had run recently. Hence "nothing at all".

2. **Dead sessions linger as live wisps.** `SessionEnd` is racy and unreliable (accepted limitation,
   ADR-0041) and the CI merge-retire backstop (PR #95) is held pending a one-time `terraform apply`,
   so `active` rows pile up and only drop out of the world via the client-side 4 h reband. While
   under 4 h they orbit trees as if the work were live. Hence "stale false positives".

There is also a latent bug: `withPresence` reuses the *session's own* `sessionId` and calls `done()`
in its `finally`, so a build run inside an interactive session clobbers and then **retires that
session's** presence row.

The signal the owner actually wants on the wire is **mechanical work in flight** — a leaf agent
walking a unit through `AUTHOR_TEST → CONFIRM_RED → IMPLEMENT → CONFIRM_GREEN → GATE`. That signal is
**already partly emitted**: every `node build`/`story build --store pg` appends an
`events.work_event` row with `type: building` keyed by `unit_id` + `run_id`, and lands a signed
`events.verdict` at the end. The world simply never renders the `building` rows — `/api/tree` reads
`latestVerdicts()` only. This is the same shape as ADR-0045's verdict bloom (a per-unit, territory-
anchored, time-keyed decoration), except it announces work *in progress* rather than work *just
landed*.

## Decision

1. **The orbiting wisp is sourced from the harness, not the session.** A unit shows an orbiting wisp
   **iff** it has an *in-flight build* — a `building` work-event keyed on `(unit_id, run_id)` that
   has no terminal event yet (no signed verdict, no failure/halt) **and** is within a short freshness
   TTL. The wisp anchors on the unit's territory via the existing `unit → story` resolution
   (`sessionAnchors` logic), so it orbits the tree the work belongs to. When the build terminates,
   the wisp clears: a **pass** hands off to the ADR-0045 verdict bloom; a **fail/halt** simply stops
   the wisp. This makes the signal **self-cleaning by construction** — a bounded, self-terminating
   build, not an unbounded session.

2. **Self-cleaning has a hard floor: a short TTL, not the 4 h session staleness.** A build that is
   hard-killed mid-flight leaves a dangling `building` row with no terminal event. A tight TTL
   (proposed **20 min**, owner-tunable) reaps it from the activity layer — orders of magnitude
   tighter than the 4 h presence staleness, so a crashed build never becomes a multi-hour false
   positive.

3. **The wisp is phase-resolved (the red-green is visible).** The wisp's hue/animation reflects the
   live phase: a *red* cast while the spine is in `CONFIRM_RED` / authoring the failing test, a
   *green* pulse on `CONFIRM_GREEN` / `GATE`. This is delivered in two steps (see plan): **v1**
   renders the coarse `building` state already on the wire (one "building" band — no orchestrator
   change); **v2** adds an injected, default-no-op `onPhase` observer to `proveUnit` (the orchestrator
   stays pure and deterministic — the *write* happens in the CLI, never the gate) so the wisp colours
   by phase as the spine walks it.

4. **Harness activity gets its own identity, separate from session presence.** It is keyed by
   `run_id` (the build), never the host `sessionId`. This fixes the `withPresence` clobber bug and
   keeps "what mechanical work is happening" cleanly distinct from "who is here". The existing
   `events.work_event` stream is the source — no new write path for v1.

5. **Session presence is demoted out of the orbiting role, and re-homed later.** Per the owner steer,
   "I'm planning work around this" is a real but *different* claim from "a proof is being mechanically
   driven here right now". Session-presence rows (`nodes:[]` or declared) **stop orbiting trees**;
   they remain available in the dock/board. A quieter ambient form for the "planning" claim (e.g. a
   faint territory tint or a board-only roster) is **named-deferred** to a later owner call — not
   built here. This is the deliberate, accepted consequence that **wisps appear only when real wiring
   work runs**.

## What this explicitly does NOT do

- **No new lifecycle word.** It renders the existing `building` work-event; it does not add a
  `WorkEventDoc` value, and green stays verdict-only (ADR-0040/0045).
- **No orchestrator impurity.** The gate never writes presence/activity. v2's `onPhase` is an
  injected observer that defaults to a no-op; the activity write lives in the CLI drive
  (`node-build.ts` / `story-build.ts`), exactly where `withPresence` lives today.
- **No deletion of the presence model.** `events.session`, the dock, and `noticeboard declare` stay.
  Only their *orbiting-wisp* role moves to the harness.
- **It does not, by itself, make the world busy.** Live/real builds are currently infrequent and
  short, so the honest near-term effect is a mostly-empty world that lights up *during* a build —
  which is the point.

## Named-deferred (future owner calls)

- **A quieter form for the "planning work" claim** (§5) — territory tint, board roster, or a distinct
  low-key marker. The owner explicitly deferred the form.
- **Fail/halt micro-announcement** — a brief red flash when a build dies at a phase, distinct from
  just stopping the wisp (kin to ADR-0045's deferred fail-bloom).
- **Near-real-time cadence** — a cheap `/api/activity` poll so a build lights up within seconds
  (ADR-0045 named the same idea for verdicts; `/api/tree` must stay one-shot).
- **Finishing the presence reliability track** — the merge-retire backstop (PR #95) and heartbeat
  hardening still matter for the dock/board even after wisps move to the harness.

## Consequences

- The orbiting wisp becomes **fully mechanical and self-cleaning**: it exists exactly while a proof
  is being driven, anchored on the right territory, and clears on termination — no SessionEnd
  dependency, no 4 h zombie window, no `nodes:[]` dead-ends. Both reported symptoms are addressed at
  the root.
- The world is **honest by absence**: an empty world means no mechanical build is running, which is
  true. Ambient "who's around" awareness is intentionally separated and re-homed later.
- The hosted Cloud Run image is frozen — this goes live only after the studio image is **rebuilt +
  redeployed** (manual today, ADR-0042; or via the CD work in flight, ADR-0046).
- `pnpm gate` covers the seam: an activity helper test (TTL edges, terminal-clears-wisp,
  unit→territory anchoring), backend tests for the in-flight read, and (v2) a phase-observer test on
  `proveUnit`.
