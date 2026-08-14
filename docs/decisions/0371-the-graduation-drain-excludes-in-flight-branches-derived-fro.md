---
status: accepted
decided: 2026-08-14
amends: [301]
---
# ADR-0371: The graduation drain excludes in-flight branches, derived from git so the check stays offline

## Status

accepted — decided 2026-08-14 while driving the `memory-queue-shared-drain-is-unprotected` increment
of `verification-integrity-arc`.

**Born `accepted` rather than `proposed`, deliberately.** The owner commissioned the increment and
DELEGATED this fork to its executor in the commissioning brief — naming the three candidates, stating
that the fix shape was genuinely open, recommending liveness-from-git *as a recommendation to verify
rather than a rubber stamp*, and instructing that whichever candidate was taken be recorded in an
ADR. That verification was performed (D1–D3 below carry its evidence) and the recommended candidate
survived it, so the decision is MADE, not still being explored. It is filed `accepted` because an
unsigned refusal does not read as a refusal: a settled fork left sitting `proposed` invites the next
session to re-derive it. Anything here a later session wants to reverse is a re-decision under
ADR-0139, not a status flip.

Amends ADR-0301, which shipped the provenance half as an acknowledged partial and named this
residual as the load-bearing remainder.

## Context

**The measured failure.** The harness agent-memory store is per-MACHINE —
`~/.claude/projects/<slug>/memory` (ADR-0202), resolved through the MAIN checkout — so every
concurrent worktree and session on the box reads and writes ONE queue. In PR #1124 a librarian
drained that queue properly, VERIFIED `OK — no live agent-memory candidates` at 0 live, and it was
back to 7 live **within ~15 minutes**, entirely from sibling sessions writing between 20:56 and
21:11. None belonged to the draining session. The drain worked, was verified, and evaporated,
through no fault of the drainer and with nothing it could have done differently. Observed again
during #1136: across one session the live count read 1, 2, 0, 2, 0 with that session touching no
memory file.

ADR-0121's claim ledger keys on unit ids, so nothing refuses a concurrent drain. ADR-0301 added a
`metadata.branch` stamp and an own-homework exclusion, and said plainly at the time that this does
NOT fix the above: on the #1124 numbers an own-homework exclusion changes NOTHING, because all seven
candidates were siblings' and an own-homework exclusion cannot suppress a sibling by construction.

**The fork, and the constraint that made it hard.** Three candidates were parked on the arc: (1) a
CLAIM over the drain, (2) a LIVENESS SIGNAL, (3) an ADR-0202 amendment making the queue
session-local. The arc framed (1) and (2) as needing the notice board and therefore the DB, which
would trade away this machinery's offline-by-contract guarantee — `check:graduation-worklist`'s own
header states it "ALWAYS runs (no creds, no network)".

**One half of the old objection has expired and was not re-used.** The arc previously reasoned that
a DB-dependent check would go blind during a nightly sleep window (ADR-0114). ADR-0114 is
superseded: ADR-0302 D2 retired the window and the instance runs 24/7. What survives is the narrower
objection — an offline-by-contract check that acquires a DB dependency stops being runnable where no
credential exists.

**Two facts discovered while building, both of which changed the shape of the answer.**

- **Candidate (3) is infeasible as stated.** The memory directory path is specified by the HARNESS
  system prompt, which this repo does not control. We cannot make the harness write per-worktree.
- **`check:graduation-worklist` has been RETIRED since 2026-08-05** (ADR-0311 D2), and the arc entry
  is written throughout on the contrary premise — including its own "verify honestly" instruction,
  which names `pnpm check:graduation-worklist`, a command that does not exist.

  **This was established from the authoritative registries, not from the absence of a script**, because
  `UNWIRED` means "does not GATE", not "unreached", and there is a real class of retired-looking rungs
  whose test companions still enforce inside `pnpm -r test` — `coverage-drain.test.ts` is one, recorded
  as "the only surviving enforcement of the contract-coverage ceiling". Three independent sources agree
  this is not that case: `RETIRED_CHECKS` names `check:graduation-worklist` with
  `retiredBy: "ADR-0311 D2"` and sources `["check-graduation-worklist.ts", "graduation-drain.ts"]`;
  `RETIRED_TEST_COMPANIONS` classifies its only companion `graduation-drain.test.ts` as
  `role: "unit-only"`, `cost: "nothing — pure; the ceiling it exercises reaches no disk"`; and
  ADR-0311's own body lists the check by name, separately from `check:friction-drain`, so this is not a
  generalisation from a sibling retired by the same decision. There is no `check-graduation-worklist.test.ts`
  at all.

  It means the #1124 red cannot recur *through the gate* today — but it also means a fix landed only in
  that shell would be a green diff changing no output any human or agent reads, which is precisely the
  criticism the arc levelled at building the stamp alone. Hence D5.

## Decision

**D1 — Take candidate (2), LIVENESS, and derive it from GIT rather than from the notice board.** A
live candidate whose authoring branch has not yet merged into `origin/main` belongs to a session
still in flight, and is NOT YET ANYONE'S OBLIGATION; it becomes one the moment that branch lands,
when its knowledge becomes everyone's. This is the honest generalisation of `friction-drain.ts`'s
`isOwnItem` from "mine" to "still being written".

**D2 — THE OFFLINE CONTRACT IS PRESERVED, NOT TRADED.** The arc's assumption that liveness requires
the notice board is false. `git for-each-ref --no-merged=origin/main` is a LOCAL REF READ: no
network, no credential, no database. Nothing in this change acquires a DB dependency, and the
machinery remains runnable wherever a checkout exists. This is the whole reason candidate (2) was
affordable and the reason it beat candidate (1), which genuinely does need the ledger.

**D3 — THE IN-FLIGHT SET IS AGE-BOUNDED, and the bound is baselined on a sweep, not chosen.**
"Unmerged" alone is not "in flight". Measured on the authoring machine 2026-08-14: **810** local
branches, **88** unmerged into `origin/main`, but only **5** touched that day — and the
next-most-recent was FIVE DAYS older. An unbounded rule would permanently excuse memories written
from branches abandoned two months ago, which is under-counting a backlog this ceiling exists to
BOUND. `IN_FLIGHT_WINDOW_DAYS = 2` sits inside that measured five-day gap rather than on a knife
edge: 1 day and 2 days select the same five branches on that data, and 2 is taken for margin so a
long session that commits early and works late is not dropped mid-flight.

**D4 — FAIL-CLOSED IN EVERY DIRECTION.** Only a POSITIVE branch match excludes, the `friction-drain`
direction exactly. A branch git cannot resolve — deleted on merge (ADR-0142), or written on another
machine — is absent from the set and therefore CHARGED. An unstamped memory has no branch to be in
flight and is CHARGED. A detached HEAD, an unreadable `origin/main`, or an unparseable date yields an
empty set, which disables the exclusion entirely and charges the whole queue. Unknown is never
excused, so the exclusion can only ever shrink by losing information, never grow.

**D5 — THE FIX LANDS IN WIRED CODE, not only in the retired shell.** `evaluateGraduationDrain` is now
also consumed by `graduate.ts`'s `graduateCommand` — the `storytree library graduate [--review]` verb,
which IS wired and is the command a librarian actually runs to drain this queue. It prints the
four-way split (yours · still in flight · merged · unstamped) above the candidate list, reusing the
same evaluator so the verb and the retired gate step can never disagree about who owes what. The
retired shell is updated in step, so a future re-wire inherits the fix rather than the bug.

**D6 — THIS DOES NOT RE-WIRE THE GATE STEP.** `check:graduation-worklist` stays retired. ADR-0311 D5
requires fresh production-catch evidence AND an ADR to re-wire, and this ADR asserts neither. The
banner on `graduation-drain.ts` is corrected rather than removed: it now states that the module gates
nothing while no longer claiming it is unreached, because both halves are true and the old wording
made the second one false.

**D7 — THE STAMP STAYS OPTIONAL, WITH NO BACKFILL.** A required field would make every unstamped
memory unparseable, dropping it from the worklist and making the backlog look SMALLER; under-counting
is the wrong way to fail for a check whose job is to bound a backlog. The stamp exists only going
forward, exactly as ADR-0290 D2's actor stamp does, and every pre-existing memory reads unattributed
and is charged, which is correct. Because the memory FILE FORMAT is the harness's and no CLI verb
writes these files, the only available lever for emission is durable guidance, which is landed
alongside this ADR in the `session-orchestrator` agent's workflow.

**D8 — N STAYS 4.** What changed is WHICH candidates count as this session's obligation, never how
large a backlog is allowed. ADR-0252 D3 (a ceiling's remedy is a drain, never a raise) and ADR-0269
are untouched. The OK/WARN levels still read the FULL live count, so nothing goes quiet: an excluded
candidate is still reported, still printed, and still visible in the split.

## Consequences

**Good.** The #1124 breach is suppressed at its cause, proved as a differential control rather than
argued: `gd-inflight-reproduces-pr1124` builds the exact seven-sibling queue and asserts it holds
(warn, 0 charged) while their branches are in flight and reds (7 charged) once merged. A librarian
draining the queue can now see, in the command they already run, which candidates are actually
theirs — the question #1124 answered by hand. The offline contract is intact, so nothing about where
this machinery can run has narrowed.

**Bad, and knowingly accepted.**

- **The exclusion is only as good as the stamp, and the stamp has no enforcer.** Verified on the live
  machine 2026-08-14: of 49 live candidates the split printed `0 yours · 0 in flight · 0 merged · 49
  unstamped`. Until sessions actually emit `metadata.branch`, this change alters no real count. That
  is why D7's guidance is part of the same unit and not a follow-up — but guidance is discipline, and
  discipline decays. The honest expectation is partial adoption. The mitigation is built into the
  incentive rather than a gate: an unstamped memory is CHARGED, so omitting the stamp makes a memory
  *your* obligation sooner, not later.
- **A branch abandoned within the window is excused for up to two days.** Bounded and deliberate;
  the alternative (no bound) was a permanent hole measured at 88 branches.
- **A session that has written a memory but made NO commits yet has a branch that is an ancestor of
  `origin/main`, so it reads as merged and its memory is CHARGED.** Fail-closed, and the safe
  direction, but it means the exclusion protects committing sessions better than pre-commit ones.
- **The primary consumer is a verb, not a gate.** Nothing here blocks a landing, because
  `check:graduation-worklist` is retired. This ADR deliberately does not change that.

## References

- ADR-0301 — the provenance half this amends (the own-homework exclusion, shipped as an acknowledged
  partial); ADR-0290 D2 — the going-forward-only stamp posture it borrows.
- ADR-0202 — park leases and the per-machine memory store; ADR-0311 D2/D5 — the retirement of
  `check:graduation-worklist` and the bar for re-wiring it; ADR-0142 — a branch dies on merge.
- ADR-0168 D4 — the friction drain ceiling whose `isOwnItem` this generalises; ADR-0252 D3 / ADR-0269
  — a ceiling's remedy is a drain, never a raise.
- ADR-0121 — the claim ledger that keys on unit ids and so cannot refuse a concurrent drain;
  ADR-0114 (superseded by ADR-0302 D2) — the retired sleep window whose blind-spot objection has
  expired and was not re-used.
- Code: `packages/cli/src/graduation-drain.ts` (the pure ceiling + the in-flight exclusion),
  `packages/cli/src/cli-actor.ts` (`inFlightBranches` / `selectInFlightBranches` /
  `IN_FLIGHT_WINDOW_DAYS`), `packages/cli/src/graduate.ts` (the wired verb's authorship split),
  `packages/cli/src/check-graduation-worklist.ts` (the retired shell, kept in step).
- `verification-integrity-arc` → `memory-queue-shared-drain-is-unprotected`.
