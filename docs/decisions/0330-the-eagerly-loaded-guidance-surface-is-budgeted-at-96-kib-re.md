---
status: accepted
decided: 2026-08-09
arc: session-cost-arc
amends: [323]
---
# ADR-0330: The eagerly-loaded guidance surface is budgeted at 96 KiB, reported not gated

## Status

accepted (2026-08-09) — the owner directed this work in conversation on 2026-08-08/09: set the
number ADR-0323 D3 deferred, and decide the enforcement posture deliberately rather than defaulting
to a gate rung. Design-time alignment IS the ratification (ADR-0110); no second end-of-flow ask. The
owner directed that a number be set and named the posture fork; the specific value and the surface
it is reported on are this session's judgement inside that direction, and both are falsifiable by
re-running the instrument (ADR-0323 D4).

## Context

ADR-0323 D3 decided that the eagerly-loaded session-start surface is held to a budget and then
explicitly declined to set one: *"This ADR sets no number — the measurement instrument below is what
makes a number arguable."* That precondition is now met. `storytree session-cost` exists, is held
red-green, and has already been used to falsify a prediction rather than confirm one
(`session-cost-arc` increment 8). The number was still unset, and the surface kept growing.

**THE COMPOSITION WAS RE-VERIFIED RATHER THAN INHERITED, and one part of it was wrong.** ADR-0323 §1
reports the preamble as *"~85k tokens (CLAUDE.md 17.8k + AGENTS.md 5.7k + MEMORY.md 5.4k + system
prompt + tool definitions)"*. Every later increment carried that figure forward without re-measuring
it. Measured again on 2026-08-09, by a method that does not depend on knowing which files the harness
loads:

- **The ~85k HOLDS, and is now read off the bill.** A transcript never records the system prompt, the
  tool definitions, `CLAUDE.md` or `MEMORY.md` — the harness injects all four at request-build time —
  but the FIRST assistant turn's `usage` prices every one of them, because turn one's live context IS
  the preamble plus that session's opening prompt. Across the 14 sessions that started in
  `session-cost-arc` increment 8's post-intervention window, the smallest first turn is **85k tokens**
  and the median is 86k, with every session in an 85–87k band. Over the 62-session pre-intervention
  window the floor is 81k. No tokenizer, no file list and no guess about what the harness loads enters
  that number.
- **`AGENTS.md` IS NOT IN A CLAUDE SESSION'S PREAMBLE.** It is the CODEX runtime's root guidance
  (ADR-0232), and a Claude Code session's injected context carries `CLAUDE.md` and `MEMORY.md` only —
  verified against a live session's own preamble. ADR-0323 §1's composition list is corrected in place
  (ADR-0139) to drop it. `AGENTS.md` is 23,938 bytes and is real cost in a Codex session; it is simply
  not cost in the population this instrument measures, and nothing here budgets it.
- **"24% of everything, spent re-reading onboarding text" is REPRODUCED as a figure and TOO GENEROUS
  as a label.** Pricing the measured floors across the pre-intervention window — one cache write per
  transcript, then a cache read on every later turn — gives $416.92 of $1,717.96, **24.3% of spend**,
  landing on ADR-0323's 24% almost exactly. But the great majority of that is the harness's system
  prompt and tool definitions, which are not "onboarding text" and are not ours to edit. The
  repo-owned share is `CLAUDE.md` + `MEMORY.md` ≈ 23.5k of the 85k floor, so about **7–8% of session
  spend** is the part this factory controls. That is the honest number to budget, and it is a third of
  what the ADR's phrasing invites a reader to assume.
- **The growth is the actual finding.** `CLAUDE.md` was 37,962 bytes on 2026-07-26 and is 71,062
  bytes at the commit this ADR lands on — **+87% in fourteen days**, about +2.4 KB per day, monotonic
  across 50 commits. At the measured marginal price that is roughly **+$1.00 per session added in two
  weeks**, recurring on every session forever, for no decision anybody made. The rate is not an
  average smoothed over a fortnight either: the surface grew **630 bytes during the drafting of this
  ADR** — 451 into `CLAUDE.md` from a sibling's guidance landing, 179 into `MEMORY.md` from another
  session — in about forty minutes, from two changes that were each individually reasonable.
- **The marginal price is now a measured constant.** +1,000 eagerly-loaded tokens costs **$0.11–0.12
  per session** over both windows (weight proxy at list rates — the leaves are subscription-funded,
  ADR-0030 / ADR-0232). One KiB of markdown is ≈269 tokens, so **1 KiB ≈ $0.031 per session**.
- **Delegation has made the surface more expensive, not less.** A subagent pays its own preamble at
  the cache-WRITE rate — 10× read on opus — and the measured delegate floor rose from 23k tokens
  (pre) to 64k (post) while spawns per session rose from 1.3 to 3.2. This is the mechanism behind
  increment 8's "cache write rose 28% per turn" and it means growing `CLAUDE.md` is now materially
  costlier per byte than it was when ADR-0323 was written.

**THE SECOND THING THE INSTRUMENT COULD NOT PREVIOUSLY SAY.** `classifyCommand` counts polling by
command SHAPE, so one deliberate `gh pr checks` scores identically to the second tick of a
`sleep 300; tail` loop. That generosity is right for a before/after comparison — it is equally
generous on both sides of a cut point — and wrong for judging whether the retired PATTERN is gone.
Increment 8 read 25 surviving polling turns as end-state 2 unmet on that flat count. Detecting
CONSECUTIVE polling turns separates the two, and the result is in the Consequences below: the loops
did not survive at their old depth, and most of what remains was never the target.

## Decision

**D1 — THE EAGERLY-LOADED, REPO-OWNED GUIDANCE SURFACE IS BUDGETED AT 96 KiB (98,304 bytes),
measured as `CLAUDE.md` + the harness `MEMORY.md` for this project, together.** It stands at 87.7 KiB
at the commit this lands on (`CLAUDE.md` 69.4 KiB + `MEMORY.md` 18.3 KiB), i.e. **91.4% of the
ceiling**, with about 8.3 KiB of headroom — under four days at the current growth rate.

*Why bytes.* Tokens are the unit the bill is in, but counting them needs a tokenizer this repo does
not carry, and a budget whose measurement drifts with an estimator is not a budget. Bytes are
`wc -c`: identical on every machine, in every checkout, forever, so two readings are always
comparable. That is the only property a ceiling must have.

*Why 96 KiB.* The number was chosen as a SHARE OF SESSION SPEND and converted once. At the measured
marginal price and ≈3.8 chars/token for this repo's markdown — back-solved from ADR-0323's own
`CLAUDE.md` figure against that file's git-recorded size on the day, so it is calibrated on this
corpus rather than borrowed — 96 KiB is ≈25.9k tokens ≈ $2.98 on a ~$30 session: **a tenth of what a
session costs, spent on the factory's own standing instructions.** That is the trade the budget
encodes, and it is the sentence to argue with if the number is wrong.

*What is deliberately NOT in it.* `AGENTS.md` (Codex's surface, above). The system prompt and the
tool definitions, which are the larger half of the floor and are the harness's — budgeting what we
cannot edit would make the number unactionable. Subagent preamble, which is the same files paid at a
different rate and is a consequence of this budget rather than a second one.

*What being over budget means.* Not "delete text". ADR-0323's own Consequences warn that trimming
too far re-creates the orientation failures ADR-0162 measured. The remedy is REHOMING to a Library
artifact pulled just-in-time (ADR-0023 / ADR-0135) — which is what D3 of ADR-0323 already names as
the default for anything not needed by EVERY session on its FIRST turn. The budget is the forcing
function for that move, never a licence to cut orientation.

**D2 — IT IS REPORTED, NOT GATED.** The budget speaks as a WARN-level `preamble-budget` probe on
`storytree doctor`, and the price it rests on is re-derivable from `storytree session-cost`. It is
NOT a `pnpm gate` rung, NOT a `check:*`, and never a FAIL. Argued against
`process:justify-a-gate-rung` rather than asserted:

1. *No production escape (step 1).* A rung's bar is a concrete wrong outcome that reached `main`.
   Being over budget is a cost, not a defect: nothing is broken, nothing is unproven, and no commit
   would have been made differently. The honest sentence is "nothing has gone wrong, it just costs
   more", which is step 5's question already answered.
2. *The gate has no WARN, and every non-blocking row available LIES (step 7).* `gate-runner.ts` has
   four statuses — `pass | fail | not-run | skip` — and none of them means "checked, and it is over".
   A reporting-only rung has exactly two options and both misreport: exit 0 and print **PASS** on a
   row named for the budget while the budget is breached (the precise defect ADR-0311's tombstone
   exists to refuse), or exit the reserved code 3 and print **SKIP**, which asserts the step ran and
   verified NOTHING — false, and it would also narrow the whole gate's summary to "GREEN, NARROWED"
   on every run.
3. *Half the subject does not exist in CI (step 6).* `MEMORY.md` lives under `~/.claude/projects/…`,
   is per-user and per-machine, and is absent on every CI runner. A rung would skip there and observe
   one developer's housekeeping — the category ADR-0311 D2 retired BY NAME.
4. *The precedent is fresh and it went the other way.* A `storytree worktree drain` rung was REFUSED
   on this bar on 2026-08-08 after replaying 47 recorded runs and finding zero fires. The bar is real
   and this proposal is weaker, not stronger, than the one it refused.
5. *And a cost gate specifically is gamed by splitting sessions* — ADR-0323's Unresolved section and
   ADR-0168 D1's finding that a compliance gate prices a ceremony toward theater. Both stand.

Hosting it on `doctor` stretches that command's "setup invariant" charter, and the stretch is
deliberate: `doctor` is the only offline, local, checkout-reading report surface that already has
WARN as a first-class verdict and a fix-hint slot, and a budget nobody can read is a budget nobody
keeps. An absent `MEMORY.md` is treated as a determined ZERO rather than an undetermined value — the
harness loads nothing for a file that does not exist, so that machine's preamble really is smaller,
and WARNing on every clean environment would train the reader to ignore the probe.

**D3 — ADR-0323 D2'S SUBJECT IS THE LOOP, AND THE POLLING LINE IS JUDGED BY CONSECUTIVE RUNS, NOT BY
A FLAT COUNT.** Two or more consecutive polling turns is the loop — the hand-rolled
`run_in_background` D2 retired. One polling turn standing alone is a deliberate status read and was
never the target: a session that runs `gh pr checks` once after opening a PR has done nothing wrong.
A window can therefore hold a stable count of polling turns while the retired pattern is gone, and
only the split can tell those apart. This amends ADR-0323 D2 by naming its subject precisely; it does
not weaken it, and the flat count remains the right instrument for comparing two windows because it
is equally generous on both sides.

The adjacency test UNDER-reports by construction — real work between two polls breaks the run — so
the loop count is a floor, and "the loops have stopped" is the one conclusion this instrument cannot
manufacture. That is the correct direction for a measure whose flattering answer is zero.

## Consequences

**The polling verdict this makes reachable, stated with its numbers.** One classifier over both
windows (never against ADR-0323's published percentages, which came from analyzers that no longer
exist —`process:measure-session-cost-from-transcripts` names that trap):

| | pre-intervention (62 sessions) | post (14 sessions) |
|---|---:|---:|
| polling turns | 243 (2.7% of spend) | 42 (1.7%) |
| …in LOOPS | 107 turns / 46 runs (1.1%) | 14 turns / 7 runs (0.5%) |
| …ISOLATED | 136 turns (1.6%) | 28 turns (1.1%) |
| longest run | **7** | **2** |
| sessions that looped | 34 of 62 (55%) | 7 of 14 (50%) |

**The depth of looping collapsed to the floor while its incidence barely moved.** Every surviving
loop in the post window is exactly two turns long, and every looping session has exactly one of them:
nobody polls three times in a row any more, where the pre window ran to seven. Per session, looped
turns fell 1.73 → 1.00 (−42%) and the looped spend share halved. Two-thirds of what remains is
isolated status reads, which ADR-0323 D2 never targeted.

**`session-cost-arc`'s end-state 2 — "the polling line goes to approximately zero" — is still UNMET,
and the arc is NOT closed.** But the gap is smaller and differently shaped than increment 8 could
see: what is left is one double-check and two single checks per session, not a wait loop. The end
state is written against the flat line, which mixes the retired pattern with behaviour that was never
wrong; whether to re-word it is the arc author's call and is deliberately not taken here.

**Good.** The recurring price of the factory's own instructions is now a number an author can read
before appending to `CLAUDE.md`, in a unit that cannot drift, on a surface that already exists. The
composition is verified rather than inherited, and one wrong component (`AGENTS.md`) is out of it.
And ADR-0323's headline held for a fourth independent time — 90.1% input-side pre, 90.9% post.

**Bad / the honest costs.** A WARN nobody runs `doctor` to see is weak enforcement, and this ADR does
not pretend otherwise: the real enforcement is this decision plus the number being cheap to check.
The budget has about four days of headroom at the current growth rate, so it will be breached soon —
that is the forcing function working, provided each breach is answered by rehoming rather than by
raising the ceiling. **Raising this number is a decision that needs its own ADR and its own
measurement, not an edit.** The 3.8 chars/token conversion carries maybe ±10%; every decision here
rests on the byte figure, and the token figure is presentation only. And the whole measurement is
one machine's `~/.claude` — a finding only as wide as the box it was measured on.

**What this ADR explicitly does NOT do.** It does not reduce what any session PROVES, does not touch
the gate, the prove-it-gate or the merge ceremony, and does not authorise deleting orientation to hit
a number. It sets no budget on `AGENTS.md`, on subagent preamble, or on live context during a
session. An increment that lowers cost by lowering evidence has missed the point of the arc and
should be reverted (ADR-0323).

## References

- ADR-0323 — the arc's founding measurement; D3 deferred this number, D4 makes it falsifiable, and
  §1's composition is corrected in place here. D3 of this ADR amends its D2.
- `session-cost-arc` — the owning arc (intent, end state, increment log).
- `process:measure-session-cost-from-transcripts` — the method, and the classifier-dependence trap
  that forbids comparing a new figure against ADR-0323's published percentages.
- `packages/cli/src/session-cost.ts` — the instrument: `pollingRuns` / `LOOP_RUN_MIN`,
  `PreambleTotals`, `GUIDANCE_BUDGET_BYTES`, `measureGuidanceSurface`. Red-green in
  `session-cost.test.ts` against a committed fixture, never the real `~/.claude`.
- `packages/cli/src/doctor.ts` — the `preamble-budget` probe (WARN, never FAIL).
- ADR-0311 D2 / D5 and `process:justify-a-gate-rung` — the bar D2 is argued against, and the
  machine-local-state category it lands in.
- ADR-0168 D1 — why a compliance gate prices a ceremony toward theater.
- ADR-0325 — the `explorer` delegate and per-agent tiering; why the delegate preamble floor is now a
  cost multiplier on this budget.
- ADR-0023 / ADR-0135 — pull-based, just-in-time context: the alternative the budget forces toward.
- ADR-0162 — the measured cost of over-reading orientation; the counterweight that makes rehoming,
  not deletion, the remedy.
- ADR-0232 — the Codex runtime, whose root guidance is `AGENTS.md`.
- ADR-0030 / ADR-0232 — subscription-funded leaves; why every dollar here is weight, not a bill.
