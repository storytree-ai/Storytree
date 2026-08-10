---
status: accepted
decided: 2026-08-10
arc: parallel-session-dispatch-arc
amends: [340]
---
# ADR-0341: The registry door is a quarter as wide as it looked, and only one surface is worth opening

## Status

accepted (2026-08-10) — the owner answered `oq-fanout-next-step-after-registry-finding` with
**option A: fix the nine registry surfaces first**, so that a proper measurement of parallel lanes
becomes possible. That direction is ratification of the fork (ADR-0110), and this ADR is the work it
directed plus the finding that work produced. The open-question artifact cannot be closed
mechanically — `open-question` carries no status field and there is no answer verb (ADR-0314 D9;
the gap is named by the proposed ADR-0338) — so the owner's answer is recorded here and in this
arc's increment. `parallel-session-dispatch-arc` will keep rendering as WAITING until ADR-0338's
problem is solved; that is a known instrument gap, not an unanswered question.

The economics are NOT reopened: ADR-0332 D2/D3/D4 stand untouched and were not re-run.

## Context

ADR-0340 D3 found that forgiving conflicts on shared registry surfaces takes landed build width from
15.3% to 34.4% of waves holding ≥2 lanes, and named nine files. Its D6 declined to decide what to do
about it and escalated. The owner chose to attack the surfaces.

That instruction carries a question inside it, which the owner named: the nine are not uniformly
fixable. One was already deleted, one is a lockfile, two are generated projections that must stay
committed (ADR-0302 D5 / ADR-0307 D2), two are registries by design, and two are very large UI
surfaces. Fixing nine surfaces blind would spend real engineering on files that may buy nothing. So
the surfaces had to be **ranked by measured width unlocked**, not by taste.

ADR-0340's instrument already carried the forgiveness machinery, but only as a boolean: forgive
everything or nothing. It could not say what any single surface contributed.

## Decision

**D1 — THE INSTRUMENT IS EXTENDED, NEVER REPLACED, AND ITS DECIDING CORE IS NOW UNIT-TESTED.**
`measure()` takes a forgiveness POLICY (a set of surfaces, plus whether per-arc records count)
instead of a boolean, and `marginalRanking` re-runs the same simulation forgiving exactly one surface
at a time. The pure core — the wave simulation, the classifier, the per-arc record rule, the ranking
— moved to `packages/cli/src/lane-width.ts` with tests; the script keeps the store and the git
reads. A second instrument was never written, so the published readings still reproduce: this run
reports build strict **15.7%** against the published 15.3% and build forgiven **34.8%** against
34.4%, the drift being the three increments that landed since.

Two readings are reported per surface, because they answer different questions and disagree exactly
when surfaces clash together: **add-one** (fix this one and nothing else — the ranking for "what
next") and **leave-one-out** (fix every candidate but this one — what skipping it costs a completed
programme). Both are tested against fixtures that separate the two cases.

**D2 — ADR-0340's DOOR IS THREE DOORS, AND ONLY THE MIDDLE ONE IS WORK ANYONE CAN DO.** The
published 15.3% → 34.4% forgives the nine registries **and** the per-arc hot records — two separate
mechanisms the ADR's prose collapsed into one. Split apart, on build lanes:

| step | build ≥2 | all ≥2 | build speedup |
|---|---|---|---|
| strict — forgives nothing | 15.7% | 22.5% | 1.096× |
| **+ `apps/studio/data/knowledge.json`** — deleted 2026-08-04 by ADR-0302 D1 | 19.1% | 24.7% | 1.115× |
| + the other **eight** registries | 27.4% | 29.3% | 1.145× |
| + per-arc hot records — **not shared registries at all** | 34.8% | 39.9% | 1.191× |

Of the 19.1 points of build width the published figure spans: **3.4 (18%) are already closed** by a
deletion that happened for unrelated reasons, **7.4 (39%) are each arc's own ledgers and decision
docs** — which "fix the nine surfaces" does not name and which are mostly append-by-nature — and
**8.3 (43%) are the eight remaining registries.** That 43% is the true size of option A, before
asking whether any of it is reducible.

ADR-0340 D3's attribution is corrected in place per ADR-0139 (the decision did not change — the
split within it was not measured), and `docs/research/lane-width-2026-08-10/README.md` likewise.

**D3 — THE RANKING IS DECISIVE: TWO SURFACES CARRY THE WIDTH AND SIX CARRY NONE.** Baseline forgives
`knowledge.json`; all history, build lanes:

| surface | landings | waves blocked | **+alone** | −if skipped |
|---|---|---|---|---|
| `packages/cli/src/node-build.test.ts` | 59 (15.8%) | 36 | **+2.8%** | 5.9% |
| `packages/cli/src/commands.ts` | 46 (12.3%) | 17 | **+1.7%** | 1.9% |
| `CLAUDE.md` | 46 (12.3%) | 9 | +0.6% | 0.6% |
| `apps/studio/src/components/TreeView.tsx` | 52 (13.9%) | 19 | +0.6% | 1.9% |
| `AGENTS.md` | 22 (5.9%) | 2 | 0.0% | 0.0% |
| `pnpm-lock.yaml` | 21 (5.6%) | 9 | 0.0% | 1.7% |
| `repo-manifest.json` | 26 (7.0%) | 6 | 0.0% | 1.7% |
| `apps/studio/src/index.css` | 46 (12.3%) | 21 | **−0.4%** | 0.3% |

The two CLI surfaces together are worth 19.1% → **23.7%**, i.e. **+4.6 points against the 19.1 the
published figure spans — a quarter of it.** The recent era (since 2026-08-04) reorders those two
(`commands.ts` +3.5%, `node-build.test.ts` +1.7%) and drives the other five to exactly 0.0%, so both
eras agree on the shape even where the small recent population disagrees on the order.

**Being hot is not the same as serialising anything.** `index.css` is touched by 12.3% of landings
and blocks 21 waves, and forgiving it *lowers* measured width, because it changes the population as
well as the conflicts: a landing whose only source file was CSS stops being a build lane at all.
`repo-manifest.json` and `AGENTS.md` are hot and worth zero. The ≥5%-of-PRs derivation that produced
the nine is a good detector of shared surfaces and a poor predictor of which ones cost width.

**D4 — `node-build.test.ts` IS DE-REGISTRIED, AND THAT IS THE ONE SURFACE THIS ADR FIXES.** Its
append point was a single hardcoded, alphabetically-sorted regex naming every REAL-buildable node:
**127 of the 157 commits that ever touched that file edited it**, so 81% of the file's churn was one
construct, and two sessions authoring two different nodes collided there even when nothing else they
touched met. The list was redundant with the story specs all along — authoring a node's spec IS its
registration (ADR-0057 keystone A) — so the assertion now derives the expectation from
`stories/**` with its own small frontmatter parse and compares it to what the CLI renders. Two
independent readings of the same fact, and no list left to append to.

The teeth were checked, not assumed: dropping a spec-borne node from discovery in
`buildableNodeIds` fails the new assertion. It was also checked in the direction that does NOT hold
— a node present in BOTH the in-code registry and a spec is restored by the union, so removing it
from the spec branch alone is invisible. The old hardcoded list had exactly the same blind spot, so
nothing regressed, but it is recorded rather than left to be rediscovered.

**D5 — `commands.ts` IS NOT FIXED HERE, AND IT IS THE OPEN FORK.** It is the recent era's top
surface (+3.5%) and second all-history (+1.7%), but its churn is diffuse across a 3,507-line dispatch
module — sampled hunks land at twelve unrelated line ranges with no dominant append point — so it
needs a genuine decomposition, not a surgical fix. That is a real unit of work for at most +1.7% of
wide-wave share, and it is the owner's call whether to spend it. The other six surfaces are
**declined on the measurement**: two must not be touched (`knowledge.json` is gone; `pnpm-lock.yaml`
is a lockfile resolved by re-running install), and `CLAUDE.md`, `AGENTS.md`, `TreeView.tsx`,
`index.css` and `repo-manifest.json` are worth +0.6% or less each, with `index.css` negative.

**D6 — A RE-RUN CANNOT SHOW HISTORY MOVING, AND NO CLAIM THAT IT DOES WILL BE MADE.** Instrument A
reads landed file sets. Fixing a file today cannot make yesterday's landings disjoint, so re-running
the instrument after a fix necessarily reports the same numbers. What it reports instead is a
labelled counterfactual, the `programme` reading, over the surfaces actually de-registried:

| | build ≥2 | all ≥2 |
|---|---|---|
| baseline (`knowledge.json` forgiven) | 19.1% | 24.7% |
| **+ `node-build.test.ts` de-registried (this ADR)** | **21.9%** | **26.3%** |
| + `commands.ts` as well (not done) | 23.7% | 26.6% |

Read as: had that catalogue been append-safe for the whole measured period, the factory's own
landings would have offered 21.9% instead of 19.1%. **And that is an upper bound** — forgiveness
models a perfect decomposition, where a real fix captures only the share of the file's churn that
was the registry (81%, here). The forward reading is the parked `measure-lane-width-after-brief`
increment, and only time supplies it; ADR-0340 D5's amended falsifier is unchanged and that
increment stays parked.

## Consequences

**The prize shrank, and the owner should see the new number before spending more on it.** ADR-0340
priced fanning every wide wave at 1.19× on build lanes with the registries forgiven. The registries
actually available to fix carry 1.115× → 1.145×, and the two surfaces worth touching carry
1.115× → about 1.13×. This ADR delivers 1.115× → 1.121×. Against ADR-0332 D1's bar — more than 20%
extra tokens fails regardless of latency won — a half-percent of wall clock does not by itself
justify a dispatcher, and the case for one still rests where ADR-0334 D3 put it: on the eleven
concentrated arcs, not on the factory-wide average.

**The de-registry pays off whether or not a dispatcher is ever built**, which was option A's own
stated argument and is the part of it that survives this measurement intact. 127 commits appended to
that catalogue; none will again, and the textual merge conflicts they caused in ordinary serial work
are gone with it.

**Accepted knowingly — the ranking inherits every caveat of the thing it ranks.** These are marginal
readings of instrument A, which ADR-0340's Consequences already records as carrying an unquantified
upward bias (file-disjointness is not dispatchability). A marginal delta is a difference between two
biased readings, so it is more trustworthy as an ORDERING than as a magnitude. The ordering is what
the decision rests on, and it replicates across two eras selected differently.

**A per-arc record is not a shared registry, and nothing here proposes touching one.** The 7.4 points
sitting behind per-arc hot records are an arc's own ledgers and decision docs — `stories/uat-legacy-dispositions.json`
and its kind. Forgiving them was correct for measuring available width (ADR-0340's discriminator) and
would be wrong as a work item: an append-only ledger appending is not a defect.

**Still not built and still gated**, unchanged: the claim-blind write fence (ADR-0255/0284), and the
owner's "previous attempts have overloaded the system", still unpinned to a concrete failure mode.

## References

- ADR-0340 — the measurement that found the nine surfaces and escalated what to do about them.
  **Amended here** (`amends: [340]`): it stays current, but its D3 attributed the whole 15.3% → 34.4%
  move to the nine registries when the forgiving mode also forgave per-arc hot records. That passage
  is corrected in place (ADR-0139), and its D5 falsifier and D1/D2/D4 findings are untouched.
- ADR-0332 — this arc's charter and economics (owner's bar, onboarding price, break-even, straggler
  tax). Applied, none re-derived.
- ADR-0334 D3 — concentration names where to point a primitive; the case for one still rests there.
- ADR-0302 D1 — deleted `apps/studio/data/knowledge.json`, the surface carrying 18% of the published
  door. ADR-0302 D5 / ADR-0307 D2 — why `CLAUDE.md` / `AGENTS.md` must stay committed regardless.
- ADR-0057 keystone A — authoring a node's spec IS its registration, which is why the catalogue in
  `node-build.test.ts` was redundant.
- ADR-0314 D9 / ADR-0338 (proposed) — why `oq-fanout-next-step-after-registry-finding` cannot be
  closed mechanically and this arc keeps rendering as WAITING.
- `packages/cli/src/lane-width.ts` (+ `.test.ts`) — the extended instrument's tested core;
  `packages/cli/scripts/measure-lane-width.ts` — the runnable entry.
- `docs/research/lane-width-2026-08-10/README.md` — method, the full marginal tables, and the caveats.
