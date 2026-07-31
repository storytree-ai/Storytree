---
status: proposed
amends: [271]
arc: end-at-merge-arc
---
# ADR-0275: Sessions may continue past merge: the unit ends; ending the session is an orchestration call

## Status

proposed — drafted 2026-07-31 by the overnight factory audit session, on its adversarial panel's
*partially supported* verdict over the owner's morning hypothesis ("let sessions continue work but
they just need to land to main and cut a fresh worktree. Cutting a fresh session should be a
orchestration model call not mandated"). This re-decides a one-day-old, owner-directed decision
(ADR-0271 D1), so ADR-0110 does **not** apply — no design-time alignment happened in conversation —
and this ADR must not be self-accepted. It is presented in the audit debrief for the owner's
accept / reject; until accepted, ADR-0271 D1 stands and sessions end at merge.

## Context

ADR-0271 shipped at 17:32 on 2026-07-30 and its first night measurably delivered what it promised:
13/13 merged sessions ran the closing leg (debrief naming every chip by title, claims released,
inert after), owner asks fell 20 → 0, watch-polling fell 21.1 h → 41 min, and the post-0271 cohort
barely parks (the 48%-parked baseline collapsed to legacy pre-0271 tabs). Those wins trace to the
closing ceremony, land-per-unit, and ADR-0270 claims — none of which this ADR touches.

What the mandate uniquely added — *the session dies with its PR* — priced the night differently.
With every follow-up forced through a click-gated chip, the sleeping owner became the factory's
scheduler: three ready chips waited 6 h 16 m / 6 h 51 m / 7 h 31 m for the 07:42 batch click
(≈20.6 h cumulative queue); the five-hop decision-log lineage (#1026→#1028→#1032→#1033→#1038)
carried ≈8.1 h of in-chain click lag; no transcript was active 01:34–08:29 while finished work sat
queued; #1039 — a literal continuation of #1035's workstream, on the same `headless-orchestrator`
claim its parent held — landed at 09:16 instead of a plausible ~02:00. The chip click-queue was the
night's largest *actionable* cost (~29% of accounted wall-clock, vs ~31% legacy parked tabs).

The audit also bounded the upside honestly, which shapes the conditions below:

- Continuing saves ~10% per PR, not 6–10×. The measured continue exemplar (2b2dd1eb, PRs
  #1025+#1027) ran 92.4 min/PR against the fresh trio's 102–109; its PR-B setup was ~3 min (fetch +
  branch cut + 19 s re-declare, zero re-orientation) against 8–39 min fresh orientation. The
  headline "5.9–9.9× overhead" ratios fold the gate into the parent's pre-PR gate — that is
  batching, not land-then-continue. Sessions "take ages" mostly because the repo-wide gate is
  46–52% of wall per PR — paid under either lifecycle.
- Unmandated discretion is the measured baseline that parked 48%. The one green unit parked
  overnight (aac7e195: built its fix in 12 min, idled 190 min — 81.5% of its wall — until the
  owner's 22:04 nudge) is exactly the drift the mandate exists to stop. A continuation rule with no
  hard ends re-opens it.
- The mechanics have known traps, measured in-window: pre-merge edits on the old branch's tree
  (2b2dd1eb began PR-B edits 72 s after `gh pr create`, before the merge — the stranded-commit
  shape ADR-0142/CI exist to block) and post-merge `node_modules` staleness (the mid-session-merge
  TS2307 trap no hook catches).

## Decision

**D1 — The merge ends the unit; the closing leg ends in a fork, not always in death.** The closing
leg keeps ADR-0271 D1's order (residue → release claims → clean tree → debrief) and then forks:
**continue** or **go inert**. A session MAY continue past its merge only when the next unit is a
linear continuation of the same workstream and the model judges its context is not spent; the
debrief records the continuation and its one-line reason, so the owner always learns the session
kept going and why. Mechanics of a legal continuation: wait for automerge to CONFIRM (never edit
the old tree pre-merge — the stranded-commit shape), then cut a fresh branch from freshly-fetched
`origin/main`, run `pnpm install` before trusting the next gate (the mid-session-merge staleness
trap), and re-declare claims for the new unit at ADR-0270 grain. Claims release at each merge as
today; a continuing session holds claims only for the unit it is actually writing.

**D2 — Hard ends.** The session MUST end (full closing leg terminating in inert) when any of:
the next unit forks to a different workstream or surface; roughly three continuations have landed
(a context-rot guard — no chain longer than two PRs has been measured yet); context is degraded
(compaction, stale orientation, a wrong-in-hindsight turn); or the next unit needs an owner LOOK,
decision, or attestation — owner-gated work always re-enters through a chip, never by a session
waiting on the owner (that wait is the parked shape this arc exists to kill).

**D3 — ADR-0271 D2/D3/D4 survive unchanged.** The debrief becomes per-*landing* (naming what
landed, what continues with its reason, and every chip by title); inert-is-not-mute applies at the
final end; the owner-confirmed janitor sweep is untouched. The per-PR ceremony — gate, pre-PR
librarian pass, residue, non-draft PR, CI automerge — is untouched: landing discipline attaches to
the PR ceremony, not to session death.

**D4 — This is a pilot with falsifiable predictions and a revert rule.** Over the next few nights:
(a) the overnight ready-chip queue falls from ≈20.6 h toward <2 h; (b) linear continuations land
~90–120 min after their predecessor instead of 6–8 h; (c) continuing sessions' parked-idle stays
under 10% of wall — any green-uncommitted park over 60 min is a refutation; (d) debrief coverage
stays 13/13-shaped (100% of merges); (e) zero stranded-commit / branch-death incidents. If (c) or
(d) fail, restore ADR-0271 D1 verbatim by superseding this ADR.

## Consequences

- The merge-ceremony's step 9 gains the continue-or-inert fork; "go inert" becomes the terminal
  branch rather than the only branch. `session-orchestrator` guidance and the `session-cutting`
  definition change with it (on acceptance — not before).
- ADR-0142 §3's post-merge leg partially un-inverts: the fresh-branch continuation returns as a
  *legal in-session* move under D1's conditions, instead of surviving only inside a fresh session.
  The branch still dies at merge; CI still refuses a merged head branch.
- Serial overnight work stops queueing on the sleeping owner's clicks; chips remain the vehicle
  for forks, new workstreams, and owner-gated legs, so the picker stays the owner's scheduler for
  everything that genuinely needs the owner.
- Risk accepted by D4: model-judged continuation is the mechanism that historically drifted into
  parking; the hard ends + the revert rule are the fence. The gate cost that dominates session
  wall-clock is untouched by this ADR (that is audit remedies #2/#4, still undecided).

## References

- ADR-0271 (amended: D1's mandatory ending becomes a judged fork; D2/D3/D4 and both owner
  conditions survive) · ADR-0270 (claim grain per unit) · ADR-0142 (branch dies at merge —
  untouched) · ADR-0110 (why this is NOT born accepted).
- Evidence: overnight factory audit 2026-07-31 (13-agent panel over the 2026-07-30 17:00 →
  2026-07-31 11:00 window; chip genealogy, per-session dives, adversarial pro/con + judge). Key
  numbers: ≈20.6 h chip click-queue, 8.1 h in-chain lag, 92.4 vs 102–109 min/PR, 190-min
  aac7e195 park, 13/13 closing legs, asks 20→0.
- Arc: `end-at-merge-arc` (this ADR is its first re-decision increment).
