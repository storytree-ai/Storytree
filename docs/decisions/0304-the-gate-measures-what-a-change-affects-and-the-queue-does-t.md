---
status: accepted
load_bearing: true
amends: [22]
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
`pnpm -r typecheck && pnpm -r test` across every package, plus 25 sequential checks, and CI runs the
branch merged with current `main`. So a change a session never touched can red it, and re-syncing is
not a choice — it is the only route to green.

Two facts about our own setup shaped this decision.

**Affected-only testing is already half-built, on the wrong half.** CI runs `pnpm ci:affected`. The
**local** gate — the one every session must pass before it may open a PR — still runs `-r` across
everything. The idea is implemented where it saves the least and absent where sessions actually get
blocked, which is also why the reds that hurt most were local-only.

**There is no merge queue.** GitHub offers one natively and `.github/workflows/` configures no
`merge_group` trigger. So ordering is paid by hand: 2026-08-03 saw 34 landings against **40**
`git merge origin/main` re-syncs, each one a session stopping mid-flight to do by hand what a queue
does automatically.

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

**D4 — the merge ceremony is unchanged in shape.** A session still runs the gate, opens a **non-draft**
PR, and never merges by hand (ADR-0022, ADR-0271). The queue is *where CI's merge happens*, not a new
step a session performs. This ADR amends ADR-0022's mechanism, not its rule.

## Consequences

**Good.** The gate a session actually runs gets shorter, which the owner named as a present pain, and
CI wall-clock falls with it. The dominant cause of an unrelated red — shared machinery moving —
stops reaching sessions that do not depend on it. The queue absorbs the ordering that 40 hand-run
re-syncs paid for in a single day, and it does so without capping concurrency, which was the
explicitly rejected alternative.

**Bad, and accepted.** The affected-graph computation becomes safety-critical: an under-computed
graph lets a genuine break through, and the failure is silent. That risk is why D2 insists on one
shared implementation rather than a second local approximation. The merge queue adds latency per PR
and serialises landings — ordered, not blocked, but a burst of ten PRs no longer merges in parallel;
given the measured cost of *unordered* landing this is the intended trade. A queue also makes
`main`-breaking changes fail at queue time rather than merge time, which is better but unfamiliar.

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
- `package.json` — `gate` and `ci:affected`; the asymmetry D1/D2 close.
- `gate-machinery-audit-arc` — owns the question of which `check:*` rungs survive.
