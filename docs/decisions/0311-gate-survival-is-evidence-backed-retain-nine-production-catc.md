---
status: accepted
decided: 2026-08-05
supersedes: [25, 194, 276]
amends: [122, 126, 143, 154, 161, 168, 200, 202, 215, 216, 245, 252, 298, 301, 302]
arc: gate-machinery-audit-arc
---
# ADR-0311: Gate survival is evidence-backed: retain nine production-catching rungs and retire sixteen

## Status

accepted (2026-08-05) — decided/directed by the owner in conversation on 2026-08-05. Design-time alignment IS the ratification (ADR-0110); no second end-of-flow ask.

**Supersedes** ADR-0025, ADR-0194 and ADR-0276. Each made a particular standalone gate
obligation its core decision (`check:manifest`, `check:deploy-health`, `check:test-timing`); this
owner-directed survival audit withdraws those obligations, so leaving any of the three accepted
would make the current set false.

**Amends** ADR-0122, ADR-0126, ADR-0143, ADR-0154, ADR-0161, ADR-0168, ADR-0200, ADR-0202, ADR-0215,
ADR-0216, ADR-0245, ADR-0252, ADR-0298, ADR-0301 and ADR-0302. Their coverage, hollow-test,
session-anchoring, process ownership, context-DAG, friction, claim, memory-lease, website-experience,
verification and live-store decisions remain current. What retires is only their claim that a named
standalone check must be a root/CI gate rung or that its drain ceiling blocks landing.

*(Edge set COMPLETED 2026-08-06 per ADR-0139, which is a correction to this ADR's frontmatter and not
a change to anything it decided. As first written the set named nine targets and missed six —
ADR-0122 and ADR-0126, which decided and built on `check:coverage`; ADR-0143, which DECIDED
`check:declared` as one of its only two mechanisms; ADR-0161, whose "the new edges are born enforced"
rested on `check:process-graph`; and ADR-0215 D5 / ADR-0216 D7, whose machine floor was
`check:web-experience`. Each stands in exactly the relationship ADR-0139 defines for `amends` — still
current, no longer wholly self-describing — and each is the same shape as targets the set already
carried, so the omission was an oversight rather than a distinction. It mattered because
`storytree adr list --load-bearing` follows `amends` edges and prints back-edges: a reader of those six
saw no pointer to the decision that unwired their rung. The retirements needing NO new edge are
unchanged: `check:manifest`, `check:test-timing` and `check:deploy-health` are covered by the
`supersedes` edges above, `check:node-version` and `check:dist-drift` are named by no ADR at all, and
ADR-0127 / ADR-0159 mention a retired rung without resting a decision on it.)*

## Context

The gate had accumulated twenty-five standalone rungs. They were added one at a time under locally
reasonable arguments, but the set had never been audited as a set against the only outcome that can
justify recurring merge cost: a concrete production escape the rung has actually caught after it
was introduced. The resulting policy mixed proof integrity with repo bookkeeping, advisory queues,
factory discipline, environment observations and inert rollout guards.

The audit traced every rung through its source, tests, ADR, Library guidance, local gate wiring, CI
wiring and git/PR history. It found nine rungs with concrete catches and an escape that would recur
without them. The other sixteen either had no post-introduction production catch or primarily
policed bookkeeping/advisory/factory/environment state rather than the shipped behaviour a merge
gate exists to protect. Three of those sixteen had already been removed by ADR-0302; thirteen
remained wired when this audit began.

This is a survival decision, not a deletion of capability. The retired check implementations and
their unit tests stay in the repository unless separately removed. The question settled here is
whether every merge must run them.

## Decision

**D1 — the canonical gate contains exactly nine audited survivors, in this order.**

1. `check:boundaries`
2. `check:mirror-conformance`
3. `check:web-grounding`
4. `check:web-engine`
5. `pnpm -r typecheck`
6. `pnpm -r test`
7. `check:guidance`
8. `check:agents`
9. `check:verification-decay`

The first four are cheap branch-local checks, the two recursive proof legs follow, and the three
checks that can observe shared live state run last. The run-every-step reporting and affected-only
rewriting decided by ADR-0304 remain unchanged.

*(Corrected in place 2026-08-09 per ADR-0139; D1's audit conclusion is unchanged — these nine are
still the exact set that survived the audit, in this order, and none is weakened. What no longer
follows is reading "exactly nine" as today's total rung count: ADR-0336 amends this ADR to add a
tenth, `check:web-experience-closure`, of different provenance — not a readmission of any of the
sixteen D2 retired, but a narrow, freshly-justified new rung scoped to one property of the retired
`check:web-experience`. D1's list is the closed set this audit certified; it is no longer the
complete list of what the gate runs.)*

*(Updated 2026-08-14 —
[ADR-0372](0372-check-ownership-totality-earns-its-blocking-rung-clearing-ad.md), `proposed`, amends
this ADR under D5's evidence-plus-ADR requirement to add `check:ownership-totality`: an exact,
mechanical assertion (a source file either falls under a declared `sourceOwnership` subtree or it
does not, ADR-0317 D2) with no false-positive surface, charged only against what a branch itself
authors (the same authorship rule ADR-0301 decided for `check:verification-decay`). Also not a
readmission of any retired rung — the map it reads did not exist at this audit. D1's nine-rung list
remains the closed, certified set; the gate's actual current rung count keeps growing beyond it, one
freshly-justified ADR at a time, exactly as this correction's previous paragraph already
anticipated.)*

**D2 — the tombstone is complete: sixteen original rungs are retired.** ADR-0302 already removed
`check:agents-sync`, `check:corpus-sync` and `check:corpus-content`. This decision additionally
removes `check:manifest`, `check:process-graph`, `check:test-timing`, `check:web-experience`,
`check:declared`, `check:friction-drain`, `check:arc-proposal-drain`, `check:coverage`,
`check:surface-coverage`, `check:graduation-worklist`, `check:node-version`, `check:dist-drift` and
`check:deploy-health` from root policy and CI wiring. These lists are bounded historical inventory,
not an invitation to infer policy from command names.

**D3 — no survivor is weakened and no ceiling is raised.** A retained rung keeps the predicate,
failure semantics and ceiling it had before this audit. Scope changes only by deletion of whole
rungs. In particular, `check:verification-decay` survives intact; this decision does not absorb a
breach, exclude a new signal or relax its authorship aperture.

**D4 — retirement from the gate does not erase the underlying operating discipline.** The
librarian still performs the bounded friction drain, memory graduation remains lease-filtered,
process artifacts remain a current projection of the decision log, claims remain mandatory work
authority, and deploy/distribution diagnostics remain available at their purpose-built surfaces.
What ends is charging every merge for those obligations through a standalone rung.

**D5 — re-addition stays cheap but must earn a fresh decision.** Source implementations and focused
tests remain. Re-adding a retired check therefore requires only explicit root-script, gate-plan and
CI wiring, but it also requires new production-catch evidence and an ADR that explains why recurring
merge cost is now justified. A source file's continued existence is not evidence that its old gate
policy remains current.

## Consequences

**Good.** The gate's recurring cost and failure surface shrink to evidence-backed protection. Its
plan is short enough to inspect as one literal inventory, while the retained checks still cover
organism boundaries, mirrored surfaces, public-web grounding/engine drift, type and behavioural
proof, harness guidance drift and verification decay.

**Bad / accepted.** The retired checks can now report problems only when an operator or purpose-built
workflow invokes them. Repo-surface drift, process/entrypoint gaps, queue growth, claim absence,
runtime/version drift and hosted deployment health can therefore persist without blocking an
unrelated merge. This is the deliberate price of refusing to treat every observable concern as a
merge invariant. Keeping the implementations makes reversal cheap, but also leaves discoverable
code whose unwired status must not be mistaken for a forgotten gate rung.

## References

- ADR-0302 — the first three tombstones and the live-canonical Library substrate.
- ADR-0304 — run-every-step reporting and affected-only proof scope, both preserved.
- ADR-0139 — why focused re-decisions are superseded and broader decisions are corrected in place.
- `packages/cli/src/gate-order.ts` / `gate-order.test.ts` — the executable nine-rung inventory,
  catch evidence and complete tombstone.
- `package.json` / `.github/workflows/ci.yml` — root and CI policy wiring.
- `gate-machinery-audit-arc` — the owner-directed audit and its implementation residue.
