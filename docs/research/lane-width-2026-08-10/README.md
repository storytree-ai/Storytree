# Lane width from landed work — 2026-08-10

The measurement behind **ADR-0340**, on `parallel-session-dispatch-arc` (charter: ADR-0332;
reopened by ADR-0334).

**Question.** Does the factory's work genuinely decompose into parallel lanes?

**Why not just re-read ADR-0333.** ADR-0333 counted lanes the `planner` *declared*. ADR-0334 D2
showed that instrument is endogenous: the declarations came from a brief that never asked for
width, and the two plans that declined a split priced the *fresh-session* vehicle ($2.56) rather
than the subagent one ($0.28). Declared width cannot falsify a claim about available width. Landed
file sets can: they are git facts, produced by no brief.

Re-run it:

```bash
pnpm --filter @storytree/cli exec tsx scripts/measure-lane-width.ts "$PWD" out.json
```

Needs the live store up (`pnpm db:up`) and `origin/main` fetched. Read-only.

---

## Method

**Population.** Every `increment` in the live store that is `closed` and carries an `outcome.pr`:
430 of 574. Each PR's changed file set is resolved from local git — for a merge commit with parents
`(main, branch)`, `diff(merge-base .. branch)`, so main's meanwhile-commits are excluded. 372 of 379
distinct PRs resolved (98.2%).

**A unit is one landing, not one increment.** 36 PR-refs carry more than one increment; those landed
atomically and are collapsed, or they would trivially self-conflict on identical file sets. 430
increments → **371 landed units across 53 arcs**.

> For scale: ADR-0333 read **58** anchored plans across **11** arcs. This is **6.4× the landings**
> and **4.8× the arcs**, and its discriminator is not opt-in.

**Instrument A — inter-landing width.** Per arc, walk the units in landing order and simulate an
in-order fan-out: open a wave, add the next unit while it stays file-disjoint from everything already
in the wave, close and re-open on the first conflict. The wave-width distribution is the width that
arc's landed work offered. Reported as the **share of waves holding ≥2 lanes** (ADR-0334 D3: a median
cannot judge an opt-in primitive), never the median alone.

**Instrument B — intra-landing width.** A landing that touched several independent stories in one
pass is width a session *collapsed into a serial run*. Instrument A scores that as width 1, so
without B the paradigm case — #1214, eleven stories in one PR — is invisible. B is also the
**confound-free** half: work inside one PR was concurrently known by construction.

### The consolidation discriminator

A conflict on a shared **registry** (every lane appends a row) is not a conflict on the arc's own
**source module** (the lanes are edits to one thing). Forgiving the first is ADR-0334 D4(c)'s "fan
the builds, sequence the landings". Forgiving the second manufactures width. They are told apart by
*where* a file is hot:

| where it is hot | verdict |
|---|---|
| factory-wide (≥5% of all resolved PRs) | registry — every arc passes through it |
| one arc only, and it is source | that arc's subject — **never** forgiven |
| one arc only, and it is a record (`.md`/`.json`) | a ledger or decision doc — forgiven |

A plain per-arc frequency rule cannot make that split. An earlier pass used one and it stripped
`packages/notice-board/src/claim.ts` from `noticeboard-claim-ledger-arc` and
`packages/drive/src/write-authority.ts` from `session-isolation-arc` — each arc's whole subject —
inflating width to a mean of 2.26. That rule was discarded, not reported.

The nine derived factory-wide registries:

```
AGENTS.md                                CLAUDE.md
apps/studio/data/knowledge.json          apps/studio/src/components/TreeView.tsx
apps/studio/src/index.css                packages/cli/src/commands.ts
packages/cli/src/node-build.test.ts      pnpm-lock.yaml
repo-manifest.json
```

Three of these were named by hand in ADR-0333 D6; the derivation finds them without being told, plus
six more. `apps/studio/data/knowledge.json` was **deleted** by ADR-0302 D1 on 2026-08-04, which is
why the era split below matters.

### Method validation

ADR-0334 D1 names `uat-journey-surgery-arc` as the case any honest instrument must score as wide.
The first version of this instrument **failed that check** — #1169 (`uat-detail-studio`) and #1174
(`studio-cloud`) both append to `stories/uat-legacy-dispositions.json`, so a hand-picked
consolidation list scored them as two waves of one. That failure is what forced the derived
discriminator above. The arc now scores **5 units → 2 waves (3 and 2), 100% of units in a wide
wave**, and instrument B independently finds 9 collapsed story lanes in #1214 and 5 in #1120.

---

## Results

### A — inter-landing width

| population | units | waves | mean | median | **waves ≥2** | units in a ≥2 wave | arcs with a wide wave | speedup |
|---|---|---|---|---|---|---|---|---|
| all, **strict** (forgives nothing) | 371 | 266 | 1.39 | 1 | **22.2%** | 44.2% | 29/53 | 1.167× |
| build, **strict** | 268 | 222 | 1.21 | 1 | **15.3%** | 29.9% | 18/50 | 1.095× |
| all | 352 | 202 | 1.74 | 1 | **39.6%** | 65.3% | 36/53 | 1.282× |
| build | 262 | 180 | 1.46 | 1 | **34.4%** | 55.0% | 28/50 | 1.190× |
| authoring | 90 | 46 | 1.96 | 1 | **41.3%** | 70.0% | 14/31 | 1.332× |
| all, since 2026-08-04 | 99 | 67 | 1.48 | 1 | 31.3% | 53.5% | 13/25 | 1.209× |
| build, since 2026-08-04 | 74 | 57 | 1.30 | 1 | 28.1% | 44.6% | 9/23 | 1.125× |

*build* = the landing has an own source file; *authoring* = own `stories/**` or `docs/**` and no
source. The arc's intent names both ("parallel story writers and parallel red/green builds"). 19
landings were **registry-only** — nothing of their own survives the exclusion, so they would have
been disjoint from everything and joined any wave for free. They are excluded and counted, not
silently kept.

Speedups are straggler-adjusted with **ADR-0332 D4's measured factors** (1.31 / 1.59 / 1.84 at
2/3/4 lanes), applied and never re-derived, with dispatch capped at 4 lanes because beyond 4 the tax
is unmeasured. Observed waves went as wide as 12, so the capped figure is the conservative one.

### The finding that matters

**Strict build width replicates ADR-0333 almost exactly.**

| | mean | ≥2 share | population |
|---|---|---|---|
| ADR-0333 Build1 — lanes *declared* in plans | 1.21 | 17.2% | 58 plans, 11 arcs |
| this, build **strict** — lanes *landed* disjoint | **1.21** | **15.3%** | 268 landings, 50 arcs |

Two independent instruments — one reading the planner's declarations, one reading git — agree to
two decimal places on a population 4.6× larger and selected by a different mechanism. **ADR-0333's
number was not an artefact of its population.** ADR-0334 D1's population critique is factually
correct and its D3 statistic critique is load-bearing, but the defect it identified did not bias the
answer.

What *does* move the answer is the definition of a conflict. Forgiving everything this instrument
forgives takes build width from **15.3% → 34.4%** at ≥2, and all-work width from **22.2% → 39.6%**.
ADR-0333 D6's landing-serialisation finding, which ADR-0334 D4(c) carried forward as "the real
limit", turns out to be the whole story rather than a caveat.

> **That door is NOT nine files wide — see [the marginal ranking](#the-marginal-ranking-adr-0341)
> below, added 2026-08-10.** The forgiving mode above forgives the nine registries **and** the
> per-arc hot records, and the two are separate mechanisms. Split apart, the nine registries carry
> 15.7% → 27.4% and the per-arc records a further 27.4% → 34.8%. Of the registry share, the surface
> that carries the most is `apps/studio/data/knowledge.json`, which was already deleted. ADR-0341
> records the split; this paragraph is corrected in place per ADR-0139.

### B — intra-landing width (confound-free)

107 landings touched story grain; **17 spanned ≥2 stories**, collapsing **64 latent lanes** into
serial passes.

```
lanes per landing:  1:90   2:7   3:2   4:3   5:2   7:1   9:1   23:1
```

| lanes | PR | arc |
|---|---|---|
| 23 | #1149 | session-decoupling-arc |
| 9 | #1214 | uat-journey-surgery-arc |
| 7 | #908 | model-uat-promotion |
| 5 | #775 | explorer-onboarding-arc |
| 5 | #1120 | uat-journey-surgery-arc |

### Where the width is — targeting, not refusing

ADR-0334 D3 corrected ADR-0333 D4: concentration names where to point the thing. Eleven arcs with
≥3 units run at ≥80% of units in a wide wave (119 units), mean widest wave 4.36.

| all-work | | build-only | |
|---|---|---|---|
| model-uat-promotion | 100% (max 12, 30u) | explorer-onboarding-arc | 100% (max 4, 14u) |
| uat-journey-surgery-arc | 100% (max 3, 5u) | model-uat-promotion | 100% (max 5, 5u) |
| explorer-onboarding-arc | 94% (max 4, 17u) | proposal-tier-drain-arc | 86% (max 4, 7u) |
| grounded-art-machinery-arc | 86% (max 5, 28u) | linked-session-context-arc | 80% (max 3, 10u) |
| proposal-tier-drain-arc | 86% (max 4, 7u) | grounded-art-machinery-arc | 76% (max 4, 21u) |
| session-cost-arc | 83% (max 4, 12u) | library-tech-tree-overlay-arc | 75% (max 2, 16u) |
| arc-orientation-surface-arc | 78% (max 5, 9u) | arc-orientation-surface-arc | 75% (max 4, 8u) |

---

## The marginal ranking (ADR-0341)

*Added 2026-08-10, after the owner answered `oq-fanout-next-step-after-registry-finding` with option
A — fix the shared surfaces first. Ranking them needed evidence, so the instrument was extended
rather than replaced: `measure()` now takes a forgiveness POLICY instead of a boolean, and
`marginalRanking` re-runs the same simulation forgiving exactly one surface at a time. The pure core
moved to `packages/cli/src/lane-width.ts` and is unit-tested; the script keeps the store and git.*

**The re-run reproduces.** 577 increments (up from 574 — three landed since), 373 landings, 53 arcs,
374 PRs resolved. Build strict **15.7%** vs the published 15.3%; build forgiven **34.8%** vs 34.4%.

### The door, decomposed

The published 15.3% → 34.4% is three separate things, and only the middle one is work anyone can do:

| step | build ≥2 | all ≥2 | build speedup |
|---|---|---|---|
| strict — forgives nothing | 15.7% | 22.5% | 1.096× |
| **+ `knowledge.json`** — deleted by ADR-0302 D1 on 2026-08-04 | 19.1% | 24.7% | 1.115× |
| + the other **eight** registries | 27.4% | 29.3% | 1.145× |
| + per-arc hot records — **not registries at all** | 34.8% | 39.9% | 1.191× |

So of the 19.1 points of build width the published figure spans: **3.4 (18%) are already closed**,
**7.4 (39%) are not shared registries** — they are each arc's own ledgers and decision docs, which
"fix the nine surfaces" does not name and mostly cannot fix — and **8.3 (43%) are the eight
remaining registries**, which is the actual size of option A.

### Per-surface, all history, build lanes

Baseline forgives `knowledge.json` (already gone). `+alone` = fix this one and nothing else;
`−if skipped` = fix every candidate but this one. They disagree exactly when surfaces clash together.

| surface | landings touching | waves blocked | **+alone** | −if skipped | +speedup |
|---|---|---|---|---|---|
| `packages/cli/src/node-build.test.ts` | 59 (15.8%) | 36 | **+2.8%** | 5.9% | +0.006× |
| `packages/cli/src/commands.ts` | 46 (12.3%) | 17 | **+1.7%** | 1.9% | +0.007× |
| `CLAUDE.md` | 46 (12.3%) | 9 | +0.6% | 0.6% | +0.002× |
| `apps/studio/src/components/TreeView.tsx` | 52 (13.9%) | 19 | +0.6% | 1.9% | +0.002× |
| `AGENTS.md` | 22 (5.9%) | 2 | 0.0% | 0.0% | 0 |
| `pnpm-lock.yaml` | 21 (5.6%) | 9 | 0.0% | 1.7% | 0 |
| `repo-manifest.json` | 26 (7.0%) | 6 | 0.0% | 1.7% | 0 |
| `apps/studio/src/index.css` | 46 (12.3%) | 21 | **−0.4%** | 0.3% | −0.003× |

The recent era (since 2026-08-04, 76 build landings) reorders the top two — `commands.ts` +3.5%,
`CLAUDE.md` +1.7%, `node-build.test.ts` +1.7% — and drives the other five to exactly 0.0%. Small
population, so read it as agreement on the shape rather than on the order: **both eras put the two
CLI surfaces on top and the studio UI surfaces at or below zero.**

**Why a delta can be negative.** Forgiving a file changes the POPULATION as well as the conflicts: a
landing whose only source file was `index.css` stops being a build lane, and a landing whose whole
file set was forgiven is excluded as registry-only. `index.css` loses more studio landings out of the
build population than it unblocks. A negative delta means "this surface is not what serialises the
work", not "fixing it makes things worse".

**These deltas are UPPER BOUNDS.** Forgiveness models a *perfect* decomposition — every lane touching
the surface made disjoint. A real split captures the fraction of that file's churn that was actually
the registry, and no more.

### What was done, and the honest form of the proof

Only `packages/cli/src/node-build.test.ts` was de-registried (2026-08-10). Its append point was a
single hardcoded, alphabetically-sorted regex naming every REAL-buildable node: **127 of the 157
commits that ever touched that file edited it**, so 81% of the file's churn was one construct, and
two sessions authoring two different nodes collided there even when nothing else they touched met.
The list was redundant with the story specs — authoring a node's spec IS its registration (ADR-0057
keystone A) — so it is derived from disk now and the file holds no list to append to.

`commands.ts` was NOT touched, and 2026-08-10 measured *why* rather than leaving it at the original
hand-sample of twelve hunks — see "Is a ranked surface fixable?" below. It was subsequently declined
outright (ADR-0342).

**A re-run cannot show history moving, and this note does not claim it does.** Instrument A reads
landed file sets; fixing a file today cannot make yesterday's landings disjoint. What the instrument
reports is a labelled counterfactual — the `programme` reading, over the surfaces actually
de-registried:

| | build ≥2 | all ≥2 |
|---|---|---|
| baseline (`knowledge.json` forgiven) | 19.1% | 24.7% |
| **+ `node-build.test.ts` de-registried** | **21.9%** | **26.3%** |
| + `commands.ts` as well (not done) | 23.7% | 26.6% |

Read: had that catalogue been append-safe for the whole measured period, the factory's own landings
would have offered 21.9% instead of 19.1%. The forward reading — landings authored *after* the fix —
is the parked `measure-lane-width-after-brief` increment, and only time supplies it.

---

## Is a ranked surface fixable? — churn attribution and confinement (ADR-0342)

The marginal ranking says which surfaces **cost** width. It cannot say which are **fixable**, and the
two come apart: `node-build.test.ts` was fixable because 81% of its churn was one hardcoded list,
while `commands.ts` ranks beside it and has no such construct. That was first judged by sampling
hunks by hand, which is the weakest step in the ranking, so it is a reading now:

```
tsx packages/cli/scripts/measure-lane-width.ts <repoRoot> --attribute <path> [construct ...]
```

For every non-merge commit touching the path, it rebuilds the file's top-level construct map **from
that commit's own blob** (lines move) and buckets each added line under the construct containing it.
Ranking is by **commits touched, not lines added** — a three-line wiring edit conflicts exactly as
hard as a three-hundred-line one. It opens no store.

**CONFINEMENT** is the deciding statistic: the share of a surface's commits that touched *nothing
outside* a proposed fix's blast radius — the commits that would stop touching the file at all.

| surface | fence | confinement |
|---|---|---|
| `node-build.test.ts` | `deps` (held the hardcoded list) | **88.6%** of 132 commits |
| `commands.ts` | derive `run` + `CLI_OPTIONS` + imports | **31.0%** of 129 commits |
| `commands.ts` | …plus every help renderer, `RunDeps`, and all nine library/artifact bodies | **59.7%** |

`commands.ts` churn concentrates in the dispatcher (`run` 74.4%, imports 70.5%) and then runs out
into a tail of ~40 constructs, none above 8%. Extracting everything a reasonable person would extract
still leaves 40% of commits touching the file, against a modelled +1.7% that assumes 100%.

**Confinement is a CEILING, never an achievement** — the same discipline as the counterfactual above,
for the same reason. The wave simulation counts whether two landings *touched* a file, never how many
lines each added, so **shrinking an edit without removing the touch buys zero measured width**. It is
also why composing `CLI_OPTIONS` from per-module fragments would buy nothing: the CLI has exactly one
strict `parseArgs` (`commands.ts:2330`) running before dispatch across 31 areas, so a single place
must enumerate every flag, and per-module composition relocates that place rather than removing it.

Caveat: attribution is at top-level-construct grain, so a fix that splits a construct *internally* is
invisible to it. That grain was chosen because it is the grain at which code moves between files.

---

## What this measurement cannot tell you

**1. File-disjointness is not dispatchability, and the gap is demonstrated, not hypothetical.**
Two landings can touch no common file and still be strictly ordered. In `session-cost-arc` wave 5,
#1248 ("measured whether the factory's work is fan-out shaped") and #1249 ("landed the decision
behind the fan-out measurement") are file-disjoint and share a wave — but the ADR is written *from*
the measurement and could not have been dispatched beside it. `createdAt` cannot screen these out:
increments are minted at closing time, so 395 of 430 carry a `createdAt` equal to their landing date
and only 29 are provably pre-known. **This is an unquantified upward bias on instrument A.**
Instrument B is immune to it.

**2. Serial landing order can create artificial dependencies in the other direction too**, biasing
downward: an increment authored after seeing its predecessor land may avoid files it would otherwise
have touched. Not separable from (1) with this data.

**3. The straggler eats about half.** Three lanes buy 1.59×, not 3× (ADR-0332 D4). Every speedup
here is already adjusted; none is an ideal N×.

**4. Coverage gap, concentrated.** Seven PRs (#1046–#1048, #1053–#1056) resolve to nothing in this
repo's history and all nine of their increments belong to `chapter2-pixellab-organic-growth-arc` —
that arc is under-measured. A further 5 increments carry a non-numeric `outcome.pr` (operator
attestations such as `look-feedback`).

**5. The token side is not measured here.** ADR-0332 D2/D3 are settled and were not re-run. What
this measurement supplies is the width the economics get applied to.

## The token bar, applied

ADR-0332 D1's bar: more than 20% extra tokens fails regardless of latency won. At D2's measured
subagent onboarding of **$0.28 per lane**, a lane must carry **≥ $1.40 of work** to keep the premium
at or under 20% — against D3's break-even of $0.83 per lane (about half a node build). So the bar is
roughly **0.85 of a node build per lane**, and it is checkable before dispatch. Where ADR-0275 D2's
hard ends already force a lane into its own session, the orientation is paid either way and the
premium is zero.
