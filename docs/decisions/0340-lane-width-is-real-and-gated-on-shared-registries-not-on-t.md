---
status: accepted
decided: 2026-08-10
arc: parallel-session-dispatch-arc
amends: [332, 334]
load_bearing: true
---
# ADR-0340: Lane width is real, and gated on shared registries rather than on the planner's brief

## Status

accepted (2026-08-10) — the owner directed this measurement as a fresh session on 2026-08-09, naming
the three outcomes that close it honestly: width is real and the arc proceeds, width is absent and
the arc closes on evidence that could have found it, or it cannot be measured cleanly and that is
said plainly. This is the first outcome, with one substantial correction to how the arc has been
reasoning about the constraint. The economics are NOT reopened: ADR-0332 D2/D3/D4 stand untouched
and were not re-run.

## Context

ADR-0333 measured lane width from the `## Lanes` section of 58 anchored plans and found a median of
one. ADR-0334 reopened the arc on three defects: the population was 10.3% of the store's increments
and selected by a mechanism (having been routed through the `planner`) correlated with the answer;
the instrument counted lanes the planner *declared* under a brief that never asked for width, and
priced its declines at the fresh-session vehicle rather than the subagent one; and a median cannot
judge a primitive that is only ever invoked where width exists.

ADR-0334 D5 concluded that the evidence must be taken forward — the amended planner brief is the
intervention, and plans authored under it are the evidence. That leaves the arc waiting on an
intervention it has not yet tested, with no independent reading of whether the underlying work
decomposes at all.

There is one. Declared intentions are contaminated by the regime that produced them; **landed file
sets are not**. Whether work that landed serially touched disjoint files is a git fact, authored by
no brief, available over the whole history rather than an opt-in tenth of it.

## Decision

**D1 — WIDTH IS MEASURED FROM LANDED FILE SETS, OVER 371 LANDINGS ACROSS 53 ARCS.** Every `closed`
increment carrying an `outcome.pr` (430 of 574) has its PR's changed files resolved from git;
increments sharing a PR are collapsed into one landing. Per arc, landings are walked in landing order
and an in-order fan-out is simulated: a wave grows while each next landing stays file-disjoint from
everything already in it, and closes on the first conflict. That is **6.4× ADR-0333's landings and
4.8× its arcs**, and the discriminator is not opt-in. The instrument is committed and re-runnable
(`packages/cli/scripts/measure-lane-width.ts`); the method, the full tables and the discarded first
version are in `docs/research/lane-width-2026-08-10/`.

A second instrument is not optional. A landing that touched several independent stories in ONE pass
is width a session collapsed into a serial run, and the first instrument scores it as width one — so
the paradigm case ADR-0334 D1 named (#1214, eleven stories in a single PR) would be invisible.
Intra-landing story-grain width is measured alongside, and it is the **confound-free** half: work
inside one PR was concurrently known by construction.

**D2 — ADR-0333's NUMBER WAS NOT AN ARTEFACT OF ITS POPULATION. IT REPLICATES.** Under a strict
conflict test — every file counts — landed build width is:

| | mean | ≥2 lanes | population |
|---|---|---|---|
| ADR-0333 Build1 — lanes *declared* in plans | 1.21 | 17.2% | 58 plans, 11 arcs |
| this, build **strict** — lanes *landed* disjoint | **1.21** | **15.3%** | 268 landings, 50 arcs |

Two instruments with nothing in common — one reading the planner's declarations, one reading git —
agree to two decimal places on a population 4.6× larger, selected by a different mechanism, and
including the arc ADR-0334 D1 showed was excluded. **ADR-0334 D1's population critique is factually
correct and its D3 statistic critique is load-bearing, but the defect it named did not bias the
answer.** This ADR records that correction rather than leaving the arc believing the previous number
was wrong; it was incomplete, which is a different failure.

**D3 — WHAT MOVES THE ANSWER IS THE DEFINITION OF A CONFLICT.** Forgiving conflicts on shared
consolidation surfaces — the factory-wide registries, derived as those touched by ≥5% of all
resolved PRs, plus each arc's own hot records — changes the picture:

| population | waves ≥2 lanes | units in a wide wave | straggler-adjusted |
|---|---|---|---|
| all work, strict | 22.2% | 44.2% | 1.167× |
| all work, forgiven | **39.6%** | 65.3% | 1.282× |
| build lanes, strict | 15.3% | 29.9% | 1.095× |
| build lanes, forgiven | **34.4%** | 55.0% | 1.190× |
| authoring lanes, forgiven | **41.3%** | 70.0% | 1.332× |

Build width more than doubles.

> **How that move divides is measured by ADR-0341, not by this ADR, and the division matters.**
> This table's forgiving rows forgive the nine registries **and** the per-arc hot records — two
> separate mechanisms (see the discriminator in the research note). ADR-0341 splits them: the nine
> registries carry 15.7% → 27.4%, the per-arc records a further 27.4% → 34.8%, and within the
> registry share the largest single contributor is `apps/studio/data/knowledge.json`, already
> deleted. So "the door is nine files wide" — this decision's original framing — overstates what
> engineering those files can buy, and only two of the nine carry non-trivial width. Corrected in
> place per ADR-0139; the finding that shared surfaces are what re-serialise the work stands.

The nine surfaces are `CLAUDE.md`, `AGENTS.md`,
`apps/studio/data/knowledge.json`, `apps/studio/src/components/TreeView.tsx`,
`apps/studio/src/index.css`, `packages/cli/src/commands.ts`,
`packages/cli/src/node-build.test.ts`, `pnpm-lock.yaml`, `repo-manifest.json` — derived, not chosen,
and three of them are the ones ADR-0333 D6 named by hand.

So **ADR-0333 D6's landing-serialisation finding is not a caveat on the result, it is the result.**
ADR-0334 D4(c) carried it forward as "the real limit" and was right; what was not known is that it
accounts for better than half of all available width. The factory's work does decompose. It is the
shared surfaces that re-serialise it — though ADR-0341 shows that only a quarter of that width sits
on surfaces anyone can still go and fix.

**D4 — THE ARC'S FALSIFIER DOES NOT FIRE, AND WIDTH IS CONCENTRATED WHERE ADR-0334 D3 SAID TO POINT.**
ADR-0332's falsifier was that the width does not exist. It exists: 36 of 53 arcs hold at least one
wide wave, and eleven arcs with ≥3 landings run at ≥80% of their units inside a wide wave (119
landings, mean widest wave 4.36) — `model-uat-promotion`, `uat-journey-surgery-arc`,
`explorer-onboarding-arc`, `grounded-art-machinery-arc`, `proposal-tier-drain-arc`,
`session-cost-arc`, `arc-orientation-surface-arc`, `linked-session-context-arc` among them.
Authoring lanes are the widest category (41.3% at ≥2), which is the owner's UAT-rewrite intuition
holding up. The confound-free instrument agrees independently: 17 of 107 story-touching landings
spanned ≥2 stories, collapsing **64 latent lanes** into serial passes, as wide as 23 (#1149) and 9
(#1214).

**D5 — ADR-0334 D6's FALSIFIER IS AMENDED: IT MUST MEASURE DELIVERED WIDTH, NOT DECLARED WIDTH.**
D6 set the arc's test as "plans authored under the D4 brief show no more independent lanes than plans
authored before it". On D3's finding that test is confounded in a way that can produce a false pass:
a brief that asks for width will raise *declared* lane counts whether or not anything can be
dispatched, because the registries serialise the landings regardless of what the plan says. The
falsifier is amended to require both halves — declared width rose **and** the landings of that work
were disjoint on the same instrument used here. The parked increment `measure-lane-width-after-brief`
therefore stays parked and becomes MORE valuable, not redundant: it is the only forward reading of
the intervention, and it now has a before-population on both instruments to be read against.
**Corrected in place, 2026-08-13 (ADR-0139): that forward reading was taken and CANNOT BE ANSWERED**
([ADR-0362](0362-the-merge-queue-is-declined-on-measurement-and-the-fan-out-a.md) D4 — n=1 against a
before-population of 58, and the `## Lanes` field this before-number was read off was deleted by
ADR-0305 D4 five days before the brief landed). The falsifier this paragraph amends is itself retired
as unrunnable by ADR-0362 D4; do not re-park the increment or attempt to read it again.

**D6 — WHAT IS NOT DECIDED HERE.** Whether the arc's next work is making those nine surfaces
append-safe, or the forward planner-brief test D5 just sharpened, is a redirect of an arc the owner
reopened on a different premise, and it is not this session's call. It is escalated as an
`open-question` on this arc. Nothing is built here beyond the instrument.

> **Answered 2026-08-10: the owner chose option A**, make the surfaces dispatch-safe first. The
> ranking that direction required, and what it found, are ADR-0341.

## Consequences

**The honest size of the prize.** Straggler-adjusted with ADR-0332 D4's measured factors (1.31 /
1.59 / 1.84 at 2/3/4 lanes, applied and never re-derived, dispatch capped at 4 because beyond 4 the
tax is unmeasured), fanning every wide wave the factory has already landed buys **1.19× on build
lanes and 1.28× across all work** — not 2×, and nowhere near N×. Most wide waves hold exactly two
lanes, which is where the straggler tax bites hardest relative to the gain. The case for a primitive
rests on targeting the eleven wide arcs, exactly as ADR-0334 D3 said, not on a factory-wide average.

**Against the owner's bar** (ADR-0332 D1: more than 20% extra tokens fails regardless of latency
won), at D2's measured subagent onboarding of $0.28 per lane, a lane must carry **≥ $1.40 of work**
— about 0.85 of a node build, against D3's break-even of $0.83. That is checkable before dispatch,
which is what D1's bar asks for. Where ADR-0275 D2's hard ends already force a lane into its own
session the orientation is paid either way and the premium is zero.

**Accepted knowingly — file-disjointness is not dispatchability, and the gap is demonstrated rather
than hypothesised.** Two landings can share no file and still be strictly ordered. In
`session-cost-arc` this instrument places #1248 ("measured whether the factory's work is fan-out
shaped") and #1249 ("landed the decision behind the fan-out measurement") in the same wave; the ADR
was written *from* the measurement and could not have been dispatched beside it. This cannot be
screened out mechanically: increments are minted at closing time, so 395 of 430 carry a `createdAt`
equal to their landing date and only 29 are provably pre-known. **Instrument A therefore carries an
unquantified upward bias**, and every number in D3's table should be read with it. The intra-landing
instrument in D4 is immune — its 64 collapsed lanes were concurrently known by construction — which
is why the argument does not rest on instrument A alone.

**Coverage is honest but not complete.** 372 of 379 PRs resolved (98.2%); the seven that did not
(#1046–#1048, #1053–#1056) all belong to `chapter2-pixellab-organic-growth-arc`, whose nine affected
increments are under-measured. Five further increments carry a non-numeric `outcome.pr` (operator
attestations such as `look-feedback`) and 19 landings were registry-only — nothing of their own
survives the exclusion — and are excluded and counted rather than silently kept.

**A discarded method is recorded, because it was wrong in an instructive way.** The first version of
this instrument derived consolidation surfaces by per-arc frequency alone. That rule stripped
`packages/notice-board/src/claim.ts` from `noticeboard-claim-ledger-arc` and
`packages/drive/src/write-authority.ts` from `session-isolation-arc` — each arc's entire subject
matter — and reported a mean width of 2.26. A frequency rule cannot tell a shared ledger from the
one module an arc is rewriting; only asking WHERE a file is hot can (factory-wide is a registry,
one-arc-only-and-source is that arc's subject). The earlier version also failed ADR-0334 D1's stated
validation case, scoring `uat-journey-surgery-arc` as two waves of one because #1169 and #1174 both
append to `stories/uat-legacy-dispositions.json`. That failure is what forced the correct rule.

**Still not built and still gated**, unchanged from ADR-0334: the claim-blind write fence
(ADR-0255/0284), and the owner's "previous attempts have overloaded the system", which remains
unpinned to a concrete failure mode.

## References

- ADR-0334 — reopened this arc; amended here. Its D1 population critique and D3 statistic critique
  stand; D2's endogeneity claim is supported (declared width tracks *strict* landed width, and both
  understate what registries hide). Its D5 "the next plans are the evidence" is no longer the only
  evidence path, and its D6 falsifier is amended by D5 above to require delivered width.
- ADR-0333 — superseded by ADR-0334, but its measurement replicates (D2) and its D6
  landing-serialisation finding is promoted from caveat to headline (D3).
- ADR-0332 — this arc's charter and economics: the owner's bar (D1), onboarding price (D2),
  break-even (D3), the straggler tax (D4). Applied here, none re-derived. **Amended here** (`amends:
  [332]`), for the same reason ADR-0334 amended it: ADR-0332 stays current but is no longer wholly
  self-describing, because its D5 and Consequences had absorbed ADR-0334's declared-width-only
  falsifier as prose, and D5 above amends that falsifier. Those two passages are corrected in place
  in ADR-0332 (this pass); its D1–D4 economics are untouched. The edge is recorded rather than left
  implicit: ADR-0332's body now cites this ADR twice as the current test, so a reader querying what
  amends ADR-0332 must find it.
- ADR-0302 D1 — deleted `apps/studio/data/knowledge.json`, one of the nine registry surfaces, on
  2026-08-04; the era split in the research note reads the regime either side of it.
- ADR-0270 D1 — capability-grain claims, the factory's own definition of what never contends.
- `docs/research/lane-width-2026-08-10/` — method, full tables, caveats, the discarded first version.
- `packages/cli/scripts/measure-lane-width.ts` — the committed, re-runnable instrument.
