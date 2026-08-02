---
status: accepted
load_bearing: true
amends: [271]
decided: 2026-08-01
arc: end-at-merge-arc
---
# ADR-0275: Sessions may continue past merge: the unit ends; ending the session is an orchestration call

## Status

accepted — drafted 2026-07-31 by the overnight factory audit session, on its adversarial panel's
*partially supported* verdict over the owner's morning hypothesis ("let sessions continue work but
they just need to land to main and cut a fresh worktree. Cutting a fresh session should be a
orchestration model call not mandated"). At draft time this re-decided a one-day-old, owner-directed
decision (ADR-0271 D1) with no design-time alignment yet in conversation, so ADR-0110 did not apply
and the ADR stayed proposed pending an owner accept/reject.

The owner ACCEPTED it live in conversation on 2026-08-01 — ADR-0110 now applies (design-time
alignment IS ratification). The acceptance sharpened D1's mechanics into two independent axes the
draft had left conflated: **whether repo code may be touched in the merged worktree is mechanical,
never judged** (D1's fresh-worktree clause); **whether to continue in this session or hand off to a
fresh one is the session's own judgment call**, keyed on its remaining context headroom, not on the
workstream-continuation test alone. Both axes are folded into D1 below. D2–D4 stand from the draft,
unchanged in substance. A new D5 records an honesty check the owner asked for directly: the worktree
reaper's actual, verified coverage of the worktree a continuing session leaves behind — flagged as an
open gap, not silently assumed solved.

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
**continue** or **go inert**. Two independent axes govern what "continue" means, and only one of
them is a judgment call (owner ruling, 2026-08-01: *"let sessions continue work but they just need
to land to main and cut a fresh worktree. Cutting a fresh session should be a orchestration model
call not mandated."*):

- **Axis 1 — does the next step touch repo code? Mechanical, never judged.** Discussion, analysis,
  and Library/decision-log updates (editing arcs, ADRs, artifacts via `--pg`) may continue in the
  SAME session, in the SAME (now-merged) worktree, with no fresh worktree at all — none of it
  touches repo code, so ADR-0142's branch-death has nothing to make stale. The MOMENT repo code
  needs to change again, the session MUST stand up a fresh worktree first: never resume coding in
  the worktree whose branch just merged. Its branch is dead (ADR-0142); the checkout is a snapshot
  of a `main` that has already moved, and reusing it invites exactly the staleness/confusion this
  ADR exists to avoid re-introducing. Mechanics of the fresh worktree: wait for automerge to CONFIRM
  (never edit the old tree pre-merge — the stranded-commit shape), stand up a new worktree on a
  fresh branch cut from freshly-fetched `origin/main` (`pnpm storytree worktree create`, ADR-0200 D3,
  or the harness's own worktree-switch mechanism), run `pnpm install` before trusting the next gate
  (the mid-session-merge staleness trap), and re-declare claims for the new unit at ADR-0270 grain.
  Claims release at each merge as today; a continuing session holds claims only for the unit it is
  actually writing.
- **Axis 2 — continue in-session, or hand off to a fresh session? The deciding session's own
  judgment call, never mandated either way.** The session assesses whether its own context window
  still has useful room. Room to work → continue in-session onto the fresh worktree from Axis 1,
  still gated by the linear-continuation test (the next unit is the same workstream) and the hard
  ends in D2. Context getting too full (long orientation, several PRs already landed, a wrong turn
  it had to reason its way out of) → land its state as residue FIRST — the relevant ADRs and arc
  increment entries, so nothing decided in-thread is lost — and THEN cut a fresh session to drive
  (`asset:session-cutting`; the existing `land-decisions-then-cut-a-fresh-session` pattern, now the
  default judgment call rather than an occasional owner correction). Either way the debrief records
  which axis fired and why, so the owner always learns whether the session kept going and on what
  reasoning.

**D2 — Hard ends.** The session MUST end (full closing leg terminating in inert) when any of:
the next unit forks to a different workstream or surface; roughly three continuations have landed
(a context-rot guard — no chain longer than two PRs has been measured yet); context is degraded
(compaction, stale orientation, a wrong-in-hindsight turn); or the next unit needs an owner LOOK,
decision, or attestation — owner-gated work always re-enters through a chip, never by a session
waiting on the owner (that wait is the parked shape this arc exists to kill).

*[Clarified and narrowed by ADR-0288 (2026-08-02). All four hard ends STAND — ADR-0288 D4 re-affirms
them explicitly and declines the offered alternative of restoring in-session discretion at a
workstream fork. What ADR-0288 corrects is a misreading this clause acquired downstream: D2 governs
whether **this session** may carry the next unit, and — on three of its four ends — never governed
whether the work gets **queued** at all. The generated `session-orchestrator` prose fused D2 with
ADR-0271 D2(b) into "NOT a judgment call … chip it into a fresh session", a mandate to queue that
neither ADR alone contains; that fusion is retired. The fourth end IS narrowed: "owner-gated work
always re-enters through a chip" now reads "**when** it re-enters, it re-enters through a chip, never
by a session waiting on the owner" — the anti-waiting rule is untouched. Queuing a follow-up is now
gated on ADR-0288 D2's worth-a-session bar, and declining is a stated, free outcome.]*

**D3 — ADR-0271 D2/D3/D4 survive unchanged.** The debrief becomes per-*landing* (naming what
landed, what continues with its reason, and every chip by title); inert-is-not-mute applies at the
final end; the owner-confirmed janitor sweep is untouched. The per-PR ceremony — gate, pre-PR
librarian pass, residue, non-draft PR, CI automerge — is untouched: landing discipline attaches to
the PR ceremony, not to session death.

**D4 — This is a pilot with falsifiable predictions and a revert rule.** Over the next few nights:
(a) the overnight ready-chip queue falls from ≈20.6 h toward <2 h; (b) linear continuations land
~90–120 min after their predecessor instead of 6–8 h; (c) continuing sessions' parked-idle stays
under 10% of wall — any green-uncommitted park over 60 min is a refutation; (d) debrief coverage
stays 13/13-shaped (100% of merges); (e) zero stranded-commit / branch-death incidents; (f) zero
incidents of a session resuming code edits inside a worktree whose branch already merged (Axis 1's
mandate, D1). If (c), (d), or (f) fail, restore ADR-0271 D1 verbatim by superseding this ADR.

**D5 — The worktree a continuation abandons is not yet reliably reaped; this is a named gap, not an
assumed solve.** Asked directly (2026-08-01) whether cleanup of the old, now-merged worktree
happens automatically, the honest answer is *partially, and not on any bounded clock*. The standing
reaper (`packages/cli/src/worktree.ts` `pruneWorktrees`, invoked from `worktree-prune-entry.ts` at
`SessionStart`) WOULD eventually reap a worktree that is merged, clean, unclaimed, and idle past its
48 h threshold — but three properties of that mechanism were not measured against the shape this ADR
newly creates (a session that finishes and releases claims on worktree A, then keeps running while
it works in fresh worktree B):
  - It only runs opportunistically, throttled to once per 30 minutes, and only when *some* session's
    `SessionStart` fires — a continuing session that itself never restarts does not trigger it, so
    worktree A's reap depends on an unrelated session starting up later.
  - The 48 h idle floor means even a lucky trigger will not sweep worktree A for up to two days.
  - `git worktree lock` is an unconditional keep the reaper never overrides, taken by the Claude Code
    harness (not by anything in this repo) for "a live claude session" — and per the open fork on
    `worktree-reaper-integrity-arc`, that lock is not liveness-checked against the session's actual
    process, only ever released, never aged out. Whether the harness ties that lock to worktree A
    specifically or to the session as a whole once it has moved to worktree B is unverified from this
    repo's side. If it is the latter, worktree A could sit locked for the rest of the continuing
    session's life, growing exactly the permanent-keep class that arc already flags.
  This ADR does not resolve it — D1 mandates the fresh worktree regardless of whether A gets swept
  promptly, and the gap is handed to `worktree-reaper-integrity-arc` rather than silently assumed
  fixed here.

## Consequences

- The merge-ceremony's step 9 gains the continue-or-inert fork; "go inert" becomes the terminal
  branch rather than the only branch. `session-orchestrator` guidance and the `session-cutting`
  definition change with it, landed in the same PR that flips this ADR to accepted.
- ADR-0142 §3's post-merge leg partially un-inverts, but not the way the 2026-07-31 draft framed it:
  it is not "a fresh branch in the same worktree" that returns — it is a fresh **worktree** on a
  fresh branch, mandatory the moment repo code is touched again (D1 Axis 1), plus the *optional*
  in-session continuation onto that worktree (D1 Axis 2). Non-code continuation (discussion,
  `--pg` Library/decision-log edits) never needed a fresh worktree and still doesn't. The old
  worktree's branch still dies at merge; CI still refuses a merged head branch.
- Serial overnight work stops queueing on the sleeping owner's clicks; chips remain the vehicle
  for forks, new workstreams, and owner-gated legs, so the picker stays the owner's scheduler for
  everything that genuinely needs the owner.
- Risk accepted by D4: model-judged continuation is the mechanism that historically drifted into
  parking; the hard ends + the revert rule are the fence. The gate cost that dominates session
  wall-clock is untouched by this ADR (that is audit remedies #2/#4, still undecided).
- Risk named by D5: worktree sprawl (already a recurring, not-fully-solved problem —
  `worktree-reaper-integrity-arc`) gets a new source — a continuation-abandoned worktree — that the
  reaper's measured behaviour does not yet demonstrably cover on any bounded timeline.

## References

- ADR-0271 (amended: D1's mandatory ending becomes a judged, two-axis fork; D2/D3/D4 and both owner
  conditions survive) · ADR-0270 (claim grain per unit) · ADR-0142 (branch dies at merge —
  untouched) · ADR-0110 (design-time alignment in conversation — why the 2026-07-31 draft was NOT
  born accepted, and why the 2026-08-01 owner conversation ratifies it now) · ADR-0200 D3
  (`storytree worktree create`, the claim-gated worktree-creation ceremony D1 points to).
- `worktree-reaper-integrity-arc` (D5's named gap: the lock-liveness fork this ADR does not resolve)
  · `packages/cli/src/worktree.ts` / `worktree-prune-entry.ts` (the reaper D5 describes).
- Evidence: overnight factory audit 2026-07-31 (13-agent panel over the 2026-07-30 17:00 →
  2026-07-31 11:00 window; chip genealogy, per-session dives, adversarial pro/con + judge). Key
  numbers: ≈20.6 h chip click-queue, 8.1 h in-chain lag, 92.4 vs 102–109 min/PR, 190-min
  aac7e195 park, 13/13 closing legs, asks 20→0.
- Arc: `end-at-merge-arc` (this ADR is its first re-decision increment; the owner's 2026-08-01
  acceptance and worktree refinement land as the arc's second).
