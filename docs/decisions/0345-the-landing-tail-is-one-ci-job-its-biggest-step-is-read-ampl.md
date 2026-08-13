---
status: accepted
decided: 2026-08-11
arc: parallel-session-dispatch-arc
amends: [344]
load_bearing: true
---
# ADR-0345: The landing tail is one CI job, its biggest step is read amplification, and it need not be serial

## Status

accepted (2026-08-11) — decided/directed by the owner in conversation on 2026-08-11. Design-time
alignment IS the ratification (ADR-0110); no second end-of-flow ask.

This ADR also **records the owner's answer to `oq-fan-out-cleared-your-bar-build-the-fence-attack-the-landi`**:
they chose **option 3, attack the landing tail**, and then — having seen the measurement below —
directed all three of its sub-options (D2, D3, D4). The question artifact carries no answer field and
there is no answer verb (ADR-0314 D9; ADR-0338 owns that gap), so `parallel-session-dispatch-arc`
keeps rendering `waiting: true`. **Nothing was written to the store to fake a closure.**

## Context

ADR-0344 measured a live three-lane fan-out and found the build phase already at its ceiling — 30.3
minutes against a 29.4-minute critical path — while the landing phase took 32.3 minutes, was serial
in both arms, and appeared to grow with N. Its Consequences drew the obvious inference: *"Anyone
proposing a dispatcher should be asked why they are not instead shortening the landing phase, which
pays out in ordinary serial work too."*

The open question then named the honest gap in that inference. Attacking the tail was
**"one measurement short of being actionable"** — nobody knew where inside those ~6–8 minutes the
time actually went, or how much of it was recoverable. This ADR takes that measurement.

## Decision

**D1 — THE TAIL IS ONE CI JOB, AND THREE OF THE FIVE SUSPECTED CAUSES ARE NOT CAUSES AT ALL.**
Measured over the 45 merged PRs #1224–#1268 from the GitHub API — PR open time, every `verify` step's
start and end, the automerge job, and the recorded merge — all 45 with a first-attempt green `verify`:

| | median |
|---|---|
| **open → merged** | **8.95 min** |
| open → `verify` starts | 0.10 (6 s) |
| **`verify` job** | **8.65 — 96.6% of the tail** |
| `verify` green → automerge starts | 0.03 (2 s) |
| automerge starts → merged | 0.08 (5 s) |

Inside `verify` (medians, summing to 8.82): `Test` **3.72** · `check:agents` **3.22** · `Typecheck`
0.83 · setup 0.34 · eight other checks combined 0.31 · `Build` 0.20 · `check:guidance` 0.20.

**Three candidates are ruled out permanently, and should not be re-investigated:**
- **Automerge/queue latency is 7 seconds**, not a poll delay. The merge lands 5 seconds into the
  automerge job. The job's remaining ~33 seconds is post-merge work and does not delay `mergedAt`.
- **`e2e-desktop` contributes ZERO.** It ran on 7 of 45 PRs at a 2.57-minute median, and `automerge`
  needs only `verify`, so it has never gated a landing.
- **The orchestrator's own gap between sequenced PRs was 35 s and 55 s** in ADR-0344's run — 4.6% of
  that 32.3-minute tail, not the tail.

Separately: mean total (12.88) exceeds median (8.95) entirely because 4 of 45 PRs (9%) needed a
second push. That is rework, not CI, and no CI change addresses it.

**D2 — `check:agents` IS 37% OF THE TAIL, AND ALMOST ALL OF IT IS ONE DOCUMENT FETCHED TWELVE TIMES.
FIXED HERE.** It is a flat 2.55–3.77 minutes on **every** PR regardless of content, because it is not
proof — it is a projection-freshness check, so ADR-0304's affected-scope narrowing does not touch it.

Instrumented against the live corpus, the render loop issued **1,035 `getDoc` calls for 87 distinct
documents — an 11.9× amplification** — plus 51 `queryDocs`. The cause is structural, not a bug in any
one renderer: the five harness renderers read *identical* source documents and differ only in output
format, and `essentialsGateViolations` then re-reads each agent's cited artifacts a third time.

**The amplification is invisible where it was written and dominant where it runs.** On a dev box
beside the database a round trip is ~18 ms; a GitHub runner reaches `australia-southeast1` at
~167 ms, so **~181 of the step's 193 seconds were network round trips**.

The fix is a read-through snapshot over the `Store` seam — `snapshotReads()` in
`@storytree/storage-protocol` — applied in `build-agents.ts` and `build-claude-md.ts`. Measured
against the live store after the change: **78 store reads, 975 served from the snapshot** (better
than the 87 predicted, because `queryDocs` seeds the per-id cache), and `check:agents` fell from
**30.6 s to 13.5 s locally**. Projected in CI: ~0.45 min, **saving ≈2.6–2.8 min on every PR**.

It is placed on the SEAM rather than inside a renderer deliberately. The renderers are not wrong to
ask — asking per ref is how a pull-based renderer stays honest about a dangling ref. What is wrong is
answering the same question twelve times over a network, and every caller that walks a document graph
read-only pays the same tax.

**It also closes a race that was not the reason for doing it.** Un-snapshotted, those 1,035 reads
straddled several seconds, so a sibling session's live artifact edit could land mid-check and be
reported as drift against a corpus that never existed at any single instant. A snapshot reads one
instant by construction. Writes are refused outright: a snapshot cannot serve one without lying to a
later read.

**D3 — THE SERIAL LANDING TAIL WAS A CHOICE, NOT A CONSTRAINT.** ADR-0344's run opened each PR only
after the previous one merged (gaps of 35 s and 55 s). Nothing required that. Over the same 45 PRs
there are **19 overlapping open→merged pairs, spanning 17 distinct PRs**, and the clearest case is
decisive: **#1228, #1229, #1230 and
#1231 were opened within 74 seconds of each other on four separate branches, and all four merged
inside a single 9-minute window.** Concurrent landing is not a proposal here; it is existing,
repeated, uneventful practice that the fan-out trial declined to use.

So three lanes land in ~9 minutes rather than ~32, and **ADR-0344's 1.71× becomes roughly 2.8×** —
a larger win than anything available in the build phase, which is at its ceiling. Guidance updated in
`asset:parallel-build-lane-fan-out` (new step 6; step 7 corrected — the tail is roughly FLAT in N, not
growing, once lanes land concurrently, which moves the binding constraint back to width and seam work).

**What this accepts, stated plainly because it is a judgement and not a measurement.** Each PR's
`verify` ran against a base that then moved, and automerge merges on that result, so two file-disjoint
PRs can still break `main` semantically. ADR-0195 §5's post-merge full-suite dispatch catches that
about 9 minutes later; it does not prevent it. This does **not** weaken the gate — every PR still
proves itself green — but it is honest that the tree proved is not always the tree that lands. The
merge queue (D4) is the sound version. **The one exception that must still be sequenced is ADR-0344
D7's class:** a lane that writes to the live store reds the other lanes' `check:guidance` /
`check:agents` whether or not it lands concurrently.

**D4 — THE MERGE QUEUE IS NOT SWITCHED ON, BECAUSE IT WOULD SILENTLY BREAK THE CLAIM LEDGER.** The
owner directed enabling it, and `ci.yml` is already written for it — the `merge_group` trigger is
present and every post-merge step is guarded on `steps.merge.outputs.merged == 'true'`, correct on
both sides of the flip. The repo is also ready in the trivial sense: no ruleset, no branch protection,
and the flip is three settings — and, correcting what the session told the owner when it offered the
option, the session's own token carries `admin`, so it COULD have made the change rather than handing
it back.

**It was refused anyway, on a defect found while preparing it.** `ingest-merge.ts` — ADR-0138 §4 /
ADR-0200's *guaranteed* machine-clear of a merged branch's claims — ran in exactly ONE place in the
repository: inside the `automerge` job, which is `pull_request`-only AND gated on `merged == 'true'`.
Under a merge queue `gh pr merge` **queues** rather than merges, so that expression is false for every
PR, and the queue's own later merge runs no job that releases claims. The `push`-to-`main` run of
`ci.yml` did not help: its `automerge` job is gated to `pull_request`.

**That defect is now FIXED (2026-08-12) and the flip is unblocked, though not yet taken.** The writer
has a second, queue-reachable caller — `.github/workflows/claim-release.yml`, keyed on the merge that
ACTUALLY landed on `main` (a `push` to main, plus the PR-side `pull_request: closed` view of the same
merge, resolved by `scripts/merged-head-refs.sh`). Both callers can fire for one merge and that is
safe: the idempotence is proven against a real Postgres store, including that a second release does
not disturb the waiter the first one promoted. Neither trigger fires for today's GITHUB_TOKEN merge
(GitHub anti-recursion), so the automerge job's own step remains the one that runs until the queue is
on. The standalone caller is deliberately LOUD where the automerge step is fail-soft — it gates
nothing, so a swallowed failure there would rebuild this very failure class. It also closed a gap
that predated the queue entirely: a PR merged by hand in the GitHub UI runs no `automerge` job and
had never released its claims.

The result would be that **every merged branch keeps its claims forever** — the ledger's one
guaranteed clear, gone, silently, with the map showing live wisps for dead branches and future
sessions refused on units nobody is writing. `ci.yml`'s own comments anticipate the queue's effect on
the deploy dispatch and the full-suite backstop, and even flag "verify that on the first
studio-affecting merge rather than assuming it" — but they do not reach the claim release, which has
no equivalent fallback.

So the flip was **blocked on a prerequisite, not declined**: a claim-release path that runs on the
queue's merge (a `merge_group`-aware job, or a `push`-to-`main` job keyed on the merged head ref).
That prerequisite has since landed (above).

**Corrected in place, 2026-08-13 — THE FLIP IS NOW DECLINED, and this D4 is the last word on the
defect rather than on the queue** ([ADR-0362](0362-the-merge-queue-is-declined-on-measurement-and-the-fan-out-a.md)
D1, owner-directed; ADR-0304 D3 is withdrawn with it). What decided it was measuring the hazard the
queue existed to prevent: across all 80 dispatched full-suite backstop runs on `main` (ADR-0195 §5,
2026-07-14 → 2026-08-12) `main` landed red **once**, on `check:agents` — a live-store projection race
a queue does not prevent — and on **zero** stale-base semantic breaks. D3 above is why that matters:
the wall-clock half was already being had, so safety was the whole residual case, and it measured to
nothing against ~2x runner minutes. **The claim-release path is KEPT** (ADR-0362 D2) — it closed a
gap that predated any queue.

The verification order below was never run, and is kept only as the recipe if ADR-0362 D3's re-entry
condition ever fires: `workflow_dispatch` the release workflow against a branch holding claims, then
take one ordinary merge by hand in the GitHub UI (a real non-GITHUB_TOKEN merge, so the real triggers
fire), and only then flip — checking the FIRST queue merge's run rather than assuming it. Likewise
the two preconditions below; the first of them is the ~2x cost ADR-0362 D1 weighed:
- **Speculative building must be on** (`max_entries_to_build` ≥ the lanes in flight). Queue entries
  never narrow — `ci.yml` disables the affected step for `merge_group` on purpose — so a
  non-speculating queue re-serialises N landings at FULL scope and is **worse than today**.
- `delete_branch_on_merge` must be turned on; the queue merges the PR itself, so the `--delete-branch`
  flag the automerge job passes stops doing the deleting.

**D5 — TWO LEVERS MEASURED AND DECLINED, so they are not re-proposed.**
- **Narrowing ADR-0304's root paths.** `docs/**` alone forces the full `-r` run on 12 of 45 PRs
  (27%) — the single largest cause of a wide scope. But `docs/decisions` and `stories/` are read by
  tests across six to eight packages, so narrowing them would barely narrow anything and would trade
  a real correctness property for it. The fail-wide behaviour is load-bearing and stays.
- **Splitting `verify` into parallel jobs.** Before D2 this looked worth ~3 minutes. After D2 the
  remaining terms are `Test` 3.72 against everything-else ~0.8, so `max()` buys ~0.5 min for roughly
  double the runner minutes and a change to the required-check contract that D4 depends on.

## Consequences

**Every PR gets ~2.6–2.8 minutes shorter, serial or fanned out** — the ADR-0341 D4 shape, and the
reason the owner found this attractive: it pays out in ordinary work, not only in the ~9% of arcs that
hold width. The 45-PR population spans 2.19 days — **20.5 PRs/day** — so that is **~55 minutes of
wall clock a day**. Every local `pnpm gate` gets ~17 s shorter too, though far less, because the dev
box is beside the database — which is precisely why this cost was never noticed from a dev box.

**The measured floor is now visible.** After D2 the median tail should be ~6.3 min, of which `Test`
(3.72) and `Typecheck` (0.83) are actual proof. There is no large recoverable remainder — anyone
proposing further CI work should be asked which of those two they intend to weaken.

**D3 changes behaviour with no code**, and is the larger number of the two. It is also the one
carrying accepted risk, and that risk is argued rather than observed: ADR-0345 measured that
concurrent landing HAPPENS and is uneventful, not that it is safe. If a stale-base break ever does
reach `main`, that is evidence for D4, not against D3.

**D4 leaves the arc holding a real, small, blocked unit** — the claim-release path — where before it
held only an owner question. That is a better state than the flip would have produced.

Accepted knowingly: n=45 PRs over 2.19 days from one repository, so the ~167 ms round-trip figure is
inferred from the CI/local step delta rather than measured on a runner; the CI saving is therefore
projected, and the first PR carrying this change will confirm or correct it. The 2.8× in D3 assumes
three lanes whose CI runs do not contend for runner capacity.

## References

- ADR-0344 — the live fan-out measurement. This ADR carries `amends: [344]`: D1–D8 stand, and what
  changes is its Consequences' framing of the tail as an irreducible serial fraction (D3 here) plus
  the actionable decomposition its own text called for.
- ADR-0304 D1/D2 — the affected-scope classifier whose fail-wide behaviour D5 confirms as load-bearing.
- ADR-0304 D3/D4 — the merge-queue half, whose prerequisite D4 here identified as unmet; the
  prerequisite was met (PR #1292) and D3 is now WITHDRAWN by ADR-0362 D1.
- ADR-0362 — amends this ADR: declines the flip D4 prepared, on the backstop measurement.
- ADR-0138 §4 / ADR-0200 — the claim-release guarantee the merge queue would break.
- ADR-0195 §5 — the post-merge full-suite backstop D3 leans on.
- ADR-0341 D4 — the de-registry whose "pays out in serial work too" argument D2 repeats.
- `asset:parallel-build-lane-fan-out` — the durable guidance D3 updates.
- `oq-fan-out-cleared-your-bar-build-the-fence-attack-the-landi` — the question this answers.
