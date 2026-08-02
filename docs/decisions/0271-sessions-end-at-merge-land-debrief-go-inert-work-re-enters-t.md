---
status: accepted
load_bearing: true
decided: 2026-07-30
amends: [142]
arc: end-at-merge-arc
---
# ADR-0271: Sessions end at merge: land, debrief, go inert; work re-enters through fresh sessions

## Status

accepted (2026-07-30) — decided/directed by the owner in conversation on 2026-07-30. Design-time
alignment IS the ratification (ADR-0110); no second end-of-flow ask. This is remedy #1 of the
2026-07-30 factory-floor audit, and the owner attached two conditions that are part of the decision:

1. *"this will work as long as the closing ceremony shows me what the new session is so i can find
   it, as well as debriefs me well"* — hence the mandatory debrief (D2), which names every follow-up
   chip by its title.
2. *"i do like to ask the existing session questions etc and do analysis i think this should be
   allowed and the closed session should not fight me on it"* — hence inert-is-not-mute (D3), and
   the generous janitor threshold (D4) so recent landings stay easy to question.

**Amends** ADR-0142 — extends "the branch dies on merge" to "and the session's working life ends
with it." ADR-0142 §1 (CI refuses a merged head branch) and §2 (claim-at-declare) stand untouched;
§3's post-merge leg — cut a fresh branch, re-declare, keep working — stops being the default move
and survives only inside a *fresh session*: the branch's death now takes its session with it.

## Context

The 2026-07-30 factory-floor audit (three days of transcripts, 2026-07-27→30) found that
**parked-open sessions were the single largest cost — ~48% of lost wall-clock**. Sessions landed
their PR and then sat open for hours: ~2,920 minutes of session wall-clock surrounded ~111 active
minutes. The parked pool wasn't just idle spend — it actively degraded the factory: the owner
re-tasked stale tabs whose context predated main (producing duplicate ADR drafts from parked
pools), monitors and polling loops kept running against nothing, and the session list grew until
finding the *right* tab was itself work. Live confirmation while drafting this ADR: the session
list showed 10+ merged-PR sessions sitting unarchived, one idle ~17 hours.

The structural cause: the merge ceremony had no ending. ADR-0142 killed the *branch* at merge and
prescribed "cut a fresh branch and keep working" as the post-merge leg, so a session's natural
lifecycle was open-ended — nothing ever said *done*. Meanwhile the residue machinery that makes
closing safe already exists: the arc increment log is the durable record of what landed (ADR-0183
D1), memory files carry session-learned traps, and follow-up work can be chipped into fresh
sessions that start with current context.

Two harness facts (verified from this session while drafting, per the owner's ask to verify before
committing the ADR to a mechanism):

- `list_sessions` (ccd session-management) returns per-session `prState` / `isRunning` /
  `lastActivityAt` / `isArchived` — the janitor predicate is computable from any session.
  `prState` can lag GitHub (observed: a session's PR showed OPEN eight minutes after it merged), so
  only an affirmative `MERGED` qualifies; a stale `OPEN` just waits for the next sweep.
- `archive_session` is callable from a session but **always confirmation-prompted** — the harness
  asks the user per call, and the tool contract forbids speculative calls. Archiving stops the
  session's process and cleans up its worktree; an archived session can be reopened from the
  Archived list. A native Settings preference ("Auto-archive on PR close") archives at merge with
  zero clicks, owner-side. There is **no** silent in-session archive, so any sweep is offer-shaped
  by construction.

## Decision

**D1 — The merge ceremony gains a closing leg; the session ends where its PR merges.** After
automerge confirms, the landing session runs, in order: append the residue (the arc's
increment-log entry per ADR-0183 D1, plus any memory worth keeping); release its claims
(`storytree noticeboard done --pg` — belt-and-braces: the ADR-0142 machine-clear now covers any
head-branch shape since PR #1025, but claims taken on a *different* branch than the PR's head are
the measured dead-holder class the local release guarantees against); leave the worktree
committed-clean and reap-ready — the reap itself rides the archive (the harness cleans the
worktree when the session is archived; mid-session `git worktree remove` on the session's own tree
is Windows-hostile and would break D3's read-only exploration); deliver the debrief (D2); then go
**inert**: no further monitors, polling loops, scheduled wakeups, or new work in this session.

*[Amended by ADR-0275 (2026-08-01): the closing leg's ORDER stands unchanged — residue, release
claims, clean tree, debrief — but "then go **inert**" is retired as the only ending. The leg now
ends in a **fork**: continue, or go inert. Inert remains the terminal branch and everything this
clause says about it still holds once taken. What is no longer true is that the session ends where
its PR merges: the UNIT ends there, and whether the SESSION ends is an orchestration call. Two axes
govern it (ADR-0275 D1) — whether repo code may be touched again is MECHANICAL (non-code work
continues right here; the moment repo code changes a fresh **worktree** is mandatory), and whether
to continue in-thread or hand off to a freshly cut session is the session's own judgment on its
context headroom. ADR-0275 D2's hard ends (a workstream fork, ~3 continuations, degraded context,
an owner-gated leg) force this clause's inert branch. D2/D3/D4 survive — see D3's own note.]*

**D2 — The debrief is owner-facing and mandatory.** Its three parts: **(a) what landed** — PR
number(s) and a plain-language outcome paragraph; **(b) every follow-up chip created, named by its
chip title** — follow-up work is *chipped as part of the debrief*, not merely mentioned, so the
owner can find each new session in the picker by the name the debrief gave it; **(c) what remains
open and where it lives** — arc, ADR, or chip. A landing without a debrief is an unfinished
ceremony.

*[Amended by ADR-0288 (2026-08-02): (b) no longer forces a chip. "not merely mentioned" was the
clause that made queuing mandatory — under it a session could not say "I considered this and it is
not worth a session", which the 2026-08-02 self-load audit measured as the generator of 88%
agent-started sessions and 16/19 chips minted within four minutes of their own merge. (b) now reads:
every follow-up **chipped** — named by its chip title — **or considered and declined, with its
one-line reason**. Declining is free; SILENCE is not — the judgment became sayable, the omission did
not. (a) and (c) are untouched, and a landing without a debrief is still an unfinished ceremony.]*

**D3 — Inert is not mute.** A landed session remains fully conversational: questions, analysis,
and read-only exploration are always answered — never refused, never fought. What it does not do
after landing is open new **work**: writes, claims, builds, PRs. When the owner asks for new work
in a landed session, the right response is to chip it into a fresh session — visibly, named per
D2b — not to refuse, and not to silently do it.

*[Scope narrowed by ADR-0275 (2026-08-01), which keeps this decision itself unchanged: read
"landed" here as **inert**. Inert-is-not-mute applies at the FINAL end, and the no-new-work clause
binds a session that has taken D1's inert branch — not every session that has merged a PR, since a
session may now legally continue past its merge. A continuing session opens new work by ADR-0275
D1's mechanics (fresh worktree, re-declared claims); a session past a D2 hard end, or already
inert, still chips it.]*

**D4 — The janitor is an owner-confirmed distributed sweep.** A session may — at session start,
or at its own debrief — list sessions and surface the qualifying siblings as an archive offer:
`isArchived` false, `prState` **MERGED** (affirmative only; stale OPEN fails safe), `isRunning`
false, and `lastActivityAt` past a generous idle threshold — **12 h as the floor, 24 h equally in
spirit** — generous *by design* so recent landings stay easy to question (archiving is reversible;
the cost of sweeping late is lower than the cost of sweeping a session the owner still wants).
The offer names each candidate by title — never a bare count — and each archive lands through the
confirmation-gated `archive_session` call, so the owner's click is the final check. Never offer a
session known to hold an unanswered owner question. The zero-infra scheduled-task fallback is
**rejected, with reason**: a headless janitor hits the same confirmation gate with nobody present
to click — strictly worse than the distributed offer. Owners who prefer zero clicks can enable the
native "Auto-archive on PR close" preference; the corpus-side sweep remains the default because
its timing honours the owner's conversational window.

Out of scope, deliberately: audit remedies #2 (wake-on-done polling replacement) and #4 (gate
diff-scoping + concurrency cap) are undecided — nothing here implements or forecloses them.

## Consequences

- **The parked pool stops growing.** Every landing ends in a debrief and an inert tab that a
  one-click, reversible archive can clear; the owner never needs to re-task an old tab, because
  new work always arrives in a fresh session with current context — the stale-re-tasking and
  duplicate-draft failure modes lose their habitat.
- **ADR-0142's post-merge leg inverts.** `storytree branch next` stops being the ceremony's
  continuation verb; the wisp lifecycle across a landing is no longer a blink but an ending — the
  machine-clear at merge is the session's last board state, which is honest: it isn't working.
  *[Partially un-inverted by ADR-0275 (2026-08-01): what returns is NOT ADR-0142's fresh branch in
  the same worktree — that stays retired — but a fresh **worktree** on a fresh branch, mandatory
  the moment repo code is touched again. So for a CONTINUING session the wisp lifecycle is a blink
  again (the merge machine-clears, the re-declare re-lights it on the new branch), and the
  machine-clear is not its last board state; for a session taking the inert branch this bullet
  stands exactly as written.]*
- **The residue is load-bearing.** Closing is safe only because what landed lives in the arc's
  increment log, what was learned lives in memory/Library, and what's next lives in named chips.
  A session that skips the residue steps has stranded context — the debrief (D2) is the checklist
  that catches it.
- **Follow-up chips are click-gated**, so un-opened chips are work the owner has visibly deferred,
  not work lost — the picker is the queue, and the owner is the scheduler.
- **Cost**: a few minutes of ceremony per landing (residue + debrief + chips) — measured against
  the ~48% parked-pool loss it retires.

## References

- ADR-0142 (amended — branch dies on merge), ADR-0022 (approval-gated trunk; CI merges), ADR-0110
  (design-time ratification), ADR-0183 D1 (the increment log is the residue), ADR-0200 (the
  noticeboard is the claim ledger), ADR-0270 (capability-grain claims).
- Factory-floor audit 2026-07-30: memory `factory-floor-audit-2026-07-30.md`; parked-open sessions
  ~48% of lost wall-clock, 2,920-min wall around ~111 active min.
- PR #1025 — the merge machine-clear runs for ANY head branch shape (the D1 dead-holder fix).
- Verified harness surface: ccd session-management `list_sessions` / `archive_session` (always
  confirmation-prompted; cleans the worktree; reopenable), and the Settings preference
  "Auto-archive on PR close".
- Library: `end-at-merge-arc` (this ADR's arc), `merge-ceremony` (gains the closing leg),
  `session-orchestrator` (gains D1–D4 in its landing step).
