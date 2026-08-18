---
status: accepted
decided: 2026-08-19
amends: [384]
arc: arc-and-open-question-truth-maintenance-arc
---
# ADR-0386: The increment's active flip rides the notice-board claim

## Status

accepted (2026-08-19) — the owner directed this arc closed in conversation on 2026-08-19 ("please
proceed to close: Arc and open-question truth-maintenance"), and this was its last open increment.
[ADR-0384](0384-the-increment-lifecycle-s-middle-states-get-a-write-path.md)'s Consequences already
named the work as its accepted residual; what this ADR decides is HOW, on the three forks the parked
increment left open. Design-time alignment IS the ratification
([ADR-0110](0110-collapse-the-redundant-end-of-flow-adr-ratification.md)).

## Context

ADR-0384 gave the increment lifecycle's middle states a write path — `storytree arc increment ready`
and `… start`. That made `ready` and `active` REACHABLE. It did not make them INEVITABLE, and ADR-0384
named the gap as its own accepted residual: **a verb is a remembered call.**

This corpus has measured twice what remembered state does.
[ADR-0239](0239-arc-closure-is-stored-state-an-arc-lifecycle-field-written-f.md) found 9 of 15 arcs had
met their end state unnoticed, and [ADR-0335](0335-arc-lifecycle-is-derived-from-increment-state-min-one-increm.md)
records that even the explicit `arc close` verb rotted — which is precisely why ADR-0335 made the ARC
lifecycle mechanical rather than curated. The increment lifecycle was one verb short of the same
treatment.

**Re-measured 2026-08-19, one day after ADR-0384 landed: 10 active arcs, 33 open increments — 32
`proposal`, 1 `ready`, 0 `active`.** The `ready` verb was used once, by hand. `active` has never been
written at all, in a period during which sessions were demonstrably executing increments. That is the
evidence this ADR turns on, and it is a sharper reading than ADR-0384's "all 37 at proposal": the
lifecycle now has a writer and is still not being written.

The measurement also answers the open sub-question the parked increment refused to settle by symmetry
— *does `ready` deserve the same binding?* — with data rather than taste. `ready` has a natural
producer that actually produced: it is an editorial judgment ("this is next"), and the one hand-write
proves the verb is reachable when someone means it. `active` has no such moment, because the thing
that means "I have started" is not a separate act at all — it is the claim a session already takes.

## Decision

**D1 — `active` is bound to `noticeboard declare`.** When a declare takes a work claim on a node that
resolves to an `increment`, that increment is promoted to `active` through the same validated write
path `arcIncrementPromote` uses. The declare is the event that means execution started; recording it
twice was the bug.

**D2 — the arrow is COMPOSED at the CLI root, and neither organism grows a dependency.** The claim
ledger (`packages/drive`) and the arc tier (`packages/arc`) are separate organisms. `packages/drive`
gains an optional injected `onWorkClaimed` callback on `NoticeboardDeps` and stays ignorant of what an
increment is; `packages/arc` is untouched. `packages/cli`'s dispatch — the one place that already
imports both — supplies the callback. The parked increment fenced this explicitly ("`packages/arc`
must not grow a dependency on the noticeboard to get this"), and composition satisfies it in both
directions rather than only the named one.

**D3 — `ready` stays an explicit editorial act, decided on evidence and not on symmetry.** Its natural
producer is the planner writing a plan with an anchor
([ADR-0183](0183-arcs-contain-plans-the-initiative-overlay-upstream-of-storie.md)), and readiness is a
judgment nothing mechanical is entitled to make. The 2026-08-19 population supports this: `ready` was
written by a human who meant it; `active` was written by nobody.

**D4 — the binding is on `declare` ALONE, not on every path that can produce a work claim.**
`noticeboard claim` / `upgrade` are ledger surgery — reading them as an execution event would flip
increments on hands that were only tidying rows. `declare` is the verb a session runs to say "I am
starting this", and it is the highest-volume claim-taking path.

**D5 — the flip is a RIDER and may never cost a claim.** It runs after the claim is banked, inside its
own guard: a throw is caught and reported, and the claim stands. A node the session was FENCED out of
never reaches it — being queued behind a holder is not starting work. A refusal from the promotion
itself (already `active`, or `closed`) is SILENT, because a re-declare is the common case and has
nothing new to say.

## Consequences

**Execution state is now recorded rather than remembered, for the one transition that had no honest
author.** `incrementCheck`'s execute-once write-lock (ADR-0183 D2) keys on `active` and has therefore
never engaged; it now will. `arcShowNext`'s freshness offer keys on `ready` and is unaffected by
design.

**A session that declares an increment it is not about to work is now wrong in the durable row, not
merely in its own head.** This is the accepted cost of binding to the highest-volume path: it trades a
state nobody wrote for a state occasionally written early. The prior condition — a four-state
lifecycle where one state had no writer at all — was strictly worse, because a state that is read but
never written makes every consumer dead code silently.

**The residual is `noticeboard claim`/`upgrade` (D4).** A session taking a work claim through those
verbs still gets no flip. That is deliberate scope, not an oversight, and it is small: `declare` is
where the grain and the volume both are. If the population still shows increments executing at
`proposal` after this lands, widening to the other claim-taking paths is the next move — and the
measurement above (`status` histogram across open increments on active arcs) is how to know.

**This closes `arc-and-open-question-truth-maintenance-arc`.** It was the arc's last open increment;
under ADR-0335 the closure auto-closes the arc.

## References

- [ADR-0384](0384-the-increment-lifecycle-s-middle-states-get-a-write-path.md) — the write path this
  binds; names this work as its accepted residual.
- [ADR-0305](0305-arcs-hold-increments-one-durable-typed-tier-replaces-increme.md) D2 — the
  `proposal → ready → active → closed` lifecycle.
- [ADR-0335](0335-arc-lifecycle-is-derived-from-increment-state-min-one-increm.md) — the precedent: a lifecycle that
  depends on a remembered verb rots.
- [ADR-0239](0239-arc-closure-is-stored-state-an-arc-lifecycle-field-written-f.md) — 9 of 15 arcs met
  their end state unnoticed.
- [ADR-0142](0142-branch-dies-on-merge-the-wisp-survives-via-claim-at-declare.md) / [ADR-0200](0200-the-noticeboard-is-the-claim-ledger-forced-session-claims-pr.md) — claim-at-declare and the ledger.
- [ADR-0183](0183-arcs-contain-plans-the-initiative-overlay-upstream-of-storie.md) D2 — the
  execute-once write-lock that keys on `active`.
- `packages/drive/src/noticeboard.ts` (the rider seam) · `packages/cli/src/commands.ts` (the
  composition) · `packages/arc/src/arc.ts` (`arcIncrementPromote`, untouched).
