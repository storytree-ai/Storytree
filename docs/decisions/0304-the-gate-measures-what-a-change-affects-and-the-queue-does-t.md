---
status: accepted
load_bearing: true
amends: [22, 195]
decided: 2026-08-04
arc: session-decoupling-arc
---
# ADR-0304: The gate measures what a change affects, and the queue does the rebasing

## Status

accepted (2026-08-04) — decided/directed by the owner in conversation on 2026-08-04. Design-time alignment IS the ratification (ADR-0110); no second end-of-flow ask.

## Context

ADR-0302 handles the *data* half of the shared substrate. This is the *code* half, and it cannot be
solved by moving anything into a database: two sessions editing `packages/cli/src/commands.ts`
collide at any storage layer.

The measurement (2026-08-04, on `session-decoupling-arc`): of what re-syncs forced branches to
absorb, `packages/**` is **47.6%** while `stories/` — the surface claims actually divide — is
**5.2%**. `packages/cli` alone accounts for 264 file-changes, roughly four times all story work
combined. Sessions are not re-reading each other's stories; they are discovering their own toolchain
moved.

What converts "`main` moved" into "you must re-sync **now**" is the gate. `pnpm gate` runs
`pnpm -r typecheck` and `pnpm -r test` across every package, alongside its policy checks, and CI runs
the branch merged with current `main`. So a change a session never touched can red it, and re-syncing
is not a choice — it is the only route to green.

(The gate stopped being a single `&&` chain on 2026-08-04, mid-way through this session: `pnpm gate`
is now `gate-run.ts`, which runs every step and reports per-step rather than aborting at the first
red. That closed a different defect — an aborted chain reporting one red and saying nothing about the
rungs behind it — and does not touch this ADR's problem. The compile-and-test steps are still
repo-wide, which is what D1 scopes.)

Two facts about our own setup shaped this decision.

**Affected-only testing is already half-built, on the wrong half.** CI runs `pnpm ci:affected`. The
**local** gate — the one every session must pass before it may open a PR — still runs `-r` across
everything. The idea is implemented where it saves the least and absent where sessions actually get
blocked, which is also why the reds that hurt most were local-only.

**There is no merge queue** (as measured on 2026-08-04, when this was decided). GitHub offers one
natively and `.github/workflows/` configured no `merge_group` trigger. So ordering is paid by hand:
2026-08-03 saw 34 landings against **40** `git merge origin/main` re-syncs, each one a session
stopping mid-flight to do by hand what a queue does automatically. (`ci.yml` has since gained the
`merge_group` trigger, but the queue is still not switched on — see the status note under D3.)

How large monorepos actually solve this is instructive, and the owner asked. Four things carry the
weight at Google scale, and none is "put the code in a database": almost no long-lived branches;
virtual copy-on-write workspaces (CitC), where files you did not edit *are* current trunk so there is
nothing to re-sync; affected-only testing over a precise dependency graph; and a submit queue that
batches, speculatively tests against projected head, and lands in order — **the queue does the
rebasing, not the engineer**. The workspace-overlay idea has no cheap git equivalent and is not
pursued. The other two are directly transferable and are this decision.

## Decision

**D1 — the local gate tests what the change affects, plus dependents.** `pnpm gate` stops running
`pnpm -r typecheck && pnpm -r test` unconditionally and instead scopes to the changed packages and
everything downstream of them. A session working on a story stops going red because `packages/cli`
moved.

**D2 — one affected computation, shared.** The local gate and CI resolve "what does this change
affect" through the **same** implementation. Two independently-drifting answers to that question
would be worse than the current asymmetry, because a local pass would stop predicting a CI pass.

**D3 — a merge queue does the rebasing.** PRs land through GitHub's native merge queue, which tests
each against the projected post-merge trunk and merges in order. Sessions stop hand-rebasing to chase
a moving `main`.

**D3 is DECIDED but NOT IN FORCE — do not read the paragraph above as a description of how PRs land
today (status 2026-08-12).** `.github/workflows/ci.yml` carries the `merge_group` trigger and guards
every post-merge step for both sides of the flip, and the **blocking defect ADR-0345 D4 found is now
fixed**; what remains is the repo-settings flip itself, which is owner-side and cannot be proved
locally.

**The defect, and what closed it.** `packages/notice-board/src/store/ingest-merge.ts` — ADR-0138 §4 /
ADR-0200's *guaranteed* machine clear of a merged branch's claims, the thing that makes ADR-0142's
"a branch dies on merge" true rather than aspirational — used to be invoked in exactly one place: the
`pull_request`-only `automerge` job, gated on `merged == 'true'`. Under a queue `gh pr merge` *queues*
instead of merging, so that gate is false for every PR and the queue's own later merge would run no
job that releases claims. Every merged branch would have kept its claims forever, and it would have
failed **silently**: the release is fail-soft by design, so nothing reds — the symptom would surface
as a map filling with dead wisps and ADR-0270/ADR-0346 refusals against sessions that ended days ago.
The writer now has a second, queue-reachable caller — `.github/workflows/claim-release.yml`, keyed on
the merge that ACTUALLY landed on `main` — and the idempotence the two callers depend on is proven
against a real Postgres store rather than assumed. It also closed a gap that predated any queue: a PR
merged by hand in the GitHub UI runs no `automerge` job and had never released its claims.

**What is still owed before the queue is on**, in order, and none of it is code: the settings flip (a
ruleset on `main` requiring the merge queue, `verify` as a required status check,
`delete_branch_on_merge` enabled), and a speculative build count at least the expected lane width —
queue entries run `verify` at full `-r` scope, so a non-speculating queue re-serialises and is
**slower** than today. Until that flip, ordering is still paid by hand.

**D4 — the merge ceremony is unchanged in shape.** A session still runs the gate, opens a **non-draft**
PR, and never merges by hand (ADR-0022, ADR-0271). The queue is *where CI's merge happens*, not a new
step a session performs. This ADR amends ADR-0022's mechanism, not its rule.

## Consequences

**Good.** The gate a session actually runs gets shorter, which the owner named as a present pain, and
CI wall-clock falls with it. The dominant cause of an unrelated red — shared machinery moving —
stops reaching sessions that do not depend on it. The queue *will* absorb the ordering that 40
hand-run re-syncs paid for in a single day, and do so without capping concurrency, which was the
explicitly rejected alternative — but read that in the future tense while D3 is not in force.

**Bad, and accepted.** The affected-graph computation becomes safety-critical: an under-computed
graph lets a genuine break through, and the failure is silent. That risk is why D2 insists on one
shared implementation rather than a second local approximation. The merge queue adds latency per PR
and serialises landings — ordered, not blocked, but a burst of ten PRs no longer merges in parallel;
given the measured cost of *unordered* landing this is the intended trade. A queue also makes
`main`-breaking changes fail at queue time rather than merge time, which is better but unfamiliar.

**What the delay to D3 costs, measured rather than assumed (ADR-0345, 2026-08-11).** Less than this
ADR expected. Concurrent landing turned out to be *already routine* without any queue — 19 overlapping
PR windows in 45, with four PRs opened inside 74 seconds all merging in one 9-minute window — so the
landing tail is roughly flat in N, and the wall-clock win D3 was also expected to deliver is being had
without it. What a queue buys that concurrent landing cannot is **safety, not speed**: two PRs each
green against a base that then moved can still land a broken `main` between them, which today is
caught by ADR-0195 §5's post-merge full run about nine minutes later rather than prevented. That is
the residual value of D3, and it is why the decision stands rather than being withdrawn.

**Interaction worth stating.** `check:*` rungs are not covered by D1 — several read machine-shared
live state and have no package graph to scope against. Whether they survive at all is
`gate-machinery-audit-arc`'s question, not this one's. D1 scopes the compile-and-test rungs; it does
not silently delete a policy check.

## References

- `session-decoupling-arc` — the owning arc, carrying the full measurement.
- ADR-0022 — CI green gate + auto-merge-on-green; D3/D4 amend its mechanism.
- ADR-0302 — the data half of the same substrate problem.
- ADR-0271 — the merge ceremony D4 leaves unchanged.
- ADR-0300 — staleness instrumentation; every remedy there still printed `git merge origin/main`, which is what D3 removes.
- ADR-0345 — measured the landing tail, found the claim-release defect that blocks D3's flip, and showed concurrent landing already delivers D3's wall-clock half.
- `merge-queue-release-claims-then-flip` — the increment carrying D3's prerequisite and the flip itself.
- `package.json` — `gate` and `ci:affected`; the asymmetry D1/D2 close.
- `gate-machinery-audit-arc` — owns the question of which `check:*` rungs survive.
