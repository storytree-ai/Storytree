---
status: accepted
decided: 2026-08-13
amends: [304, 334, 345]
arc: parallel-session-dispatch-arc
---
# ADR-0362: The merge queue is declined on measurement, and the fan-out arc's forward test closes unread

## Status

accepted (2026-08-13) — directed by the owner in conversation on 2026-08-13, after reading the
backstop measurement in D1. Design-time alignment IS the ratification (ADR-0110); no second
end-of-flow ask. The owner had previously directed *enabling* the queue (ADR-0345 D4's preparation
was that direction being carried out), so this ADR is that direction reversed by its author on new
evidence, not a session overriding it.

## Context

`parallel-session-dispatch-arc` answered its own question three times over and was closed on
2026-08-11 (ADR-0344: live fan-out clears the owner's bar; width is the binding constraint). The
close stranded two OPEN increments, so the arc kept rendering `active` on no worklist until the
owner reopened it on 2026-08-12 for those two entries alone
(`parallel-session-dispatch-arc-inc-16`). This ADR drains both. Nothing about the arc's economics is
reopened: ADR-0332 D2/D3/D4, ADR-0340's width readings and ADR-0343's `commands.ts` fence all stand
untouched.

The two entries are unrelated to each other and are decided separately below.

## Decision

**D1 — THE MERGE QUEUE IS DECLINED, AND ADR-0304 D3 IS WITHDRAWN RATHER THAN LEFT PENDING.** The
queue's remaining value was named precisely by ADR-0304's own Consequences and by ADR-0345 D3:
**safety, not speed** — two PRs each green against a base that then moved can land a broken `main`
between them, which today is caught by ADR-0195 §5's dispatched full-suite run minutes later rather
than prevented. ADR-0345 recorded that risk as *argued, not observed*. It has now been observed, and
it is not there.

THE MEASUREMENT. ADR-0195 §5's backstop is a `workflow_dispatch` full run on `main` after every
affected-only merge — not the `push` trigger, which GitHub anti-recursion suppresses for
`GITHUB_TOKEN` merges (that correction is already recorded in ADR-0195 §5 and is why the push-run
history is the wrong instrument: 26 runs, none since 2026-08-02, all of them hand merges). Reading
the right one, over its entire life:

  **80 dispatched full-suite backstop runs on `main`, 2026-07-14 → 2026-08-12: 75 success, 4
  cancelled, 1 failure.**

The single failure (run `31599356483`, 2026-08-12, head `d3d83a8`) failed on the step **`Harness
agents in sync`** — `check:agents`, a projection-freshness check that compares generated views
against the LIVE store. That is the known corpus-content race: a sibling session's live-store edit
landing between a PR's `verify` and the backstop run. **A merge queue would not have prevented it.**
The queue tests a projected trunk, but `check:agents` reads shared mutable state that the projection
is not part of, so the same red lands the same way from inside a queue. So the stale-base semantic
break — the one hazard a queue is the right instrument for — has fired **zero** times in the whole
affected-scope era, at a measured ~20.5 PRs/day with 19 overlapping PR windows in 45 (ADR-0345 D3).

THE COSTS ARE CONCRETE AND WERE NEVER IN DOUBT. Speculative building is mandatory, not a detail: a
non-speculating queue re-serialises N landings at FULL `-r` scope and is **slower than today**
(ADR-0304 D3), so the flip carries roughly **2x runner minutes** by construction. ADR-0304's own
Consequences accept that a queue "serialises landings — ordered, not blocked, but a burst of ten PRs
no longer merges in parallel", against ADR-0345 D3's finding that concurrent landing is **already
routine** and delivers the wall-clock half without any queue. And the flip is owner-side operational
surface (a ruleset, a required check, a speculative count) that cannot be proved locally.

**THIS IS THE SAME CALL, ON THE SAME EVIDENTIAL SHAPE, THE OWNER ALREADY MADE ON THIS ARC.** The
claim-blind write fence was declined at this arc's 2026-08-11 close because the live fan-out produced
zero attempted crossings — "prevention against a hazard that has never fired, not a fix for one
observed". The merge queue is that shape exactly, and is declined for that reason, priced this time
rather than assumed.

**D2 — WHAT SURVIVES THE DECLINE, SO THIS IS NOT READ AS A REVERT.** Two things built for the queue
are KEPT, and neither is contingent on it:

  (a) **`.github/workflows/claim-release.yml` (PR #1292) stays.** It was built as the queue's
      prerequisite but it closed a gap that **predated the queue entirely**: a PR merged by hand in
      the GitHub UI runs no `automerge` job and had never released its claims (ADR-0138 §4 /
      ADR-0200's *guaranteed* machine clear). That is a live defect on today's landing path, not a
      queue defect, and the idempotence it depends on is proven against a real Postgres store.
      Deleting it would re-open a real hole to tidy up after a decision that has nothing to do with
      it.

  (b) **`ci.yml`'s `merge_group` trigger and its both-sides-of-the-flip guards stay.** They cost
      nothing when no queue exists, and keeping them means this decision is reversible by settings
      alone if D3's condition ever fires. Do not strip them as dead code — they are the option.

**D3 — THE RE-ENTRY CONDITION IS AN OBSERVED BREAK, NOT A COUNT OF PRs.** Reopen the queue question
when a stale-base semantic break is **actually observed landing on `main`** — that is, a dispatched
backstop run (or a `merge_group` run, if one ever exists) fails on a genuine cross-PR semantic
break rather than on a live-store projection race or a flake. One instance is enough; the decline
rests on a zero, so a one falsifies it. Explicitly NOT a re-entry condition: PR volume rising, more
overlapping windows, or a `check:agents` / live-store race recurring — the last of these is
`gate-machinery-audit-arc`'s subject and a queue is the wrong instrument for it.

**D4 — THE FORWARD TEST CLOSES UNREAD, AND ADR-0334 D6'S FALSIFIER IS RETIRED AS UNRUNNABLE.**
`measure-lane-width-after-brief` was parked to read whether the ADR-0334 D4 planner brief moved
declared lane width. It was read on 2026-08-13 and **cannot be answered**, which its own charter
named as a first-class third outcome ("it cannot be measured cleanly, said plainly rather than
reported as a shaky number"). Three independent reasons, any one of which is sufficient:

  1. **n = 1.** Anchored increments are the mechanical plan discriminator (ADR-0333 D1). The live
     store holds **59** of them; ADR-0333 read 58 on 2026-08-09. Exactly **one** has been authored
     since the D4 brief landed — `arc-drilldown-reviewability-arc-inc-01`, anchored 2026-08-12,
     landed as PR #1304. Both readings agree (`anchor.date` and `createdAt`). ADR-0333's own
     smallest temporal bucket was n=5 and this increment already recorded that as too small to
     judge.
  2. **THE FIELD THE METHOD READS NO LONGER EXISTS.** The before-number was read off each plan's own
     `## Lanes` section — a schema field. **ADR-0305 D4 (2026-08-04) deleted it**, collapsing
     `decomposition`/`lanes`/`budgets`/`traps` into one free `body`, five days BEFORE the
     intervention it would have measured. The one post-brief plan carries no `## Lanes` heading and
     the word "lane" zero times. A like-for-like read is impossible by construction, and reading
     free prose by a different rule would not be the same measurement.
  3. **THE SUPPLY COLLAPSED, SO THE INTERVENTION IS UNEXERCISED RATHER THAN FAILED.** Of **91**
     increments created since 2026-08-09, **1** is anchored — **1.1%**. Since 2026-08-05: 3 of 178.
     Plans are never mandatory (ADR-0183 D6) and the factory has drifted almost entirely to planless
     work. The amended brief is live and correct — the `planner` artifact still carries D4 verbatim
     as step 3, and correctly re-homes the dropped headings as its own checklist under ADR-0305 D4 —
     but almost nothing routes through it, so it has no population to act on.

This is recorded as a reading, not as evidence about width: it says nothing about whether the brief
works. The question it was written to answer has in any case already been answered by a better
instrument — **ADR-0340 read landed git file sets over 371 landings / 53 arcs, brief-independent and
4.6x larger, and REPLICATED ADR-0333's number** (build width mean 1.21 / 15.3% ≥2 against 1.21 /
17.2%). Any future forward test must use that instrument, not declared lanes. ADR-0334 D6's
falsifier is therefore retired rather than left standing unevaluated, and D5's "the next plans are
the evidence" is corrected in place there.

**D5 — THE ARC CLOSES MECHANICALLY, WITH NO `arc close`.** Both entries above are its only open
increments. Closing them drains the log, and ADR-0335's rule closes the arc with no ceremony —
which is also why `arc close` is neither used nor needed here (ADR-0347 would refuse it while either
was open). If this arc is ever wanted again, the live re-entry conditions are ADR-0344's (width) and
D3 above (the queue); the 2026-08-11 close's "three or more arcs holding two or more open
increments" condition stands unchanged.

## Consequences

**Good.** An accepted ADR stops describing a landing path that does not exist: ADR-0304 D3 has
carried a "DECIDED but NOT IN FORCE — do not read the paragraph above as a description of how PRs
land today" warning since 2026-08-04, which is exactly the stale-prose state ADR-0139 forbids, and it
is now resolved by decision rather than by a longer warning. The arc drains to zero and stops
surfacing. The one genuine defect found while preparing the queue is fixed and kept. And the queue
question now has a falsifier that is an event rather than a vibe.

**Bad, and accepted.** The stale-base hazard is real in principle and stays unprevented — it is
detected minutes later by ADR-0195 §5 and fixed forward, which is a strictly weaker guarantee than a
queue's. The decline rests on a zero over one month at ~20.5 PRs/day; a zero is evidence of a low
rate, not of impossibility, and the rate could rise with concurrency the factory has not yet run.
D3 exists precisely because one counter-instance should reopen this, and the `merge_group` scaffolding
is kept so that reopening costs a settings change rather than a rebuild.

**A second thing this measurement found, deliberately NOT decided here.** Four of the 80 backstop
runs were **cancelled** — `ci.yml`'s concurrency group is keyed on `github.ref`, which is
`refs/heads/main` for every dispatched backstop run, so a second merge landing while a backstop is
in flight cancels the first. Those merged trees got no full-suite proof, which is a hole in ADR-0195
§5's "every merged tree gets one FULL-suite proof" invariant. It is small (4 of 80, 5%), it is not
this arc's subject, and fixing it is a one-line concurrency-key change — but it is a backstop
integrity question and it belongs to `gate-machinery-audit-arc` / `verification-integrity-arc`, not
here. Named so it is not lost, not folded into this decision.

**What must not be re-derived.** ADR-0332 D2/D3/D4 (onboarding price, break-even lane size,
straggler tax), ADR-0340's landed-file-set width readings and its marginal ranking, ADR-0341's
"only two surfaces carry width", ADR-0342's confinement finding, and ADR-0343's architectural fence
on `commands.ts` are all untouched and stand. This ADR adds one measurement (the backstop history)
and one reading (the forward test's n).

## References

- ADR-0304 — amended here: D3's merge-queue decision is withdrawn by D1. D1/D2/D4 stand; the
  affected-scope narrowing and the unchanged merge ceremony are unaffected.
- ADR-0345 — amended here: D4 identified the blocking defect and prepared the flip; the defect is
  fixed (PR #1292) and the flip is now declined. Its D1–D3 measurements of the landing tail stand,
  and D3's "concurrent landing is already routine" is load-bearing for D1 above.
- ADR-0334 — amended here: D5's forward-evidence path and D6's falsifier are retired by D4, and
  corrected in place there.
- ADR-0195 §5 — the dispatched full-suite backstop, which is both the instrument D1 reads and the
  detection the decline relies on.
- ADR-0344 — the live fan-out verdict; the arc's economics question, already answered.
- ADR-0340 — the landed-file-set width instrument that supersedes declared lanes as the evidence
  path (`packages/cli/src/lane-width.ts`, `packages/cli/scripts/measure-lane-width.ts`).
- ADR-0305 D4 — the plan body collapse that deleted the `lanes` field D4.2 turns on.
- ADR-0335 / ADR-0347 — the mechanical arc lifecycle D5 relies on.
- ADR-0138 §4 / ADR-0200 — the claim-release guarantee D2(a) keeps.
- `.github/workflows/claim-release.yml`, `.github/workflows/ci.yml` — the two surfaces D2 keeps.
- `merge-queue-release-claims-then-flip`, `measure-lane-width-after-brief` — the two increments this
  ADR closes.
