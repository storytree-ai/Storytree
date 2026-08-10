---
status: accepted
decided: 2026-08-10
arc: parallel-session-dispatch-arc
amends: [332]
load_bearing: true
---
# ADR-0344: Live fan-out clears the bar on both axes, and the binding constraint is still width

## Status

accepted (2026-08-10). The owner answered `oq-live-fanout-is-the-only-remaining-measurement` on
2026-08-10 — **"yes, run the live fan-out test"** — choosing the open question's option 1. This ADR
records what that run measured. It is a MEASUREMENT ADR in the shape of ADR-0340 / ADR-0341 /
ADR-0342: the acceptance bar it applies was pre-committed by the owner in ADR-0332 D1, so applying it
is arithmetic and not a fresh decision, and design-time alignment is ratification (ADR-0110).

The question artifact carries no answer field and there is no answer verb (ADR-0314 D9; ADR-0338 owns
that gap), so `parallel-session-dispatch-arc` will keep rendering `waiting: true` until ADR-0338
lands. **The owner's answer is recorded here and in this arc's increment log. Nothing was written to
the store to fake a closure.**

## Context

Five ADRs on this arc measured how much of the factory's work COULD run in parallel, all of them
through proxies. ADR-0332 priced the two vehicles and set the bar. ADR-0333 read the planner's
declared lanes; ADR-0334 found that population unrepresentative and reopened the arc; ADR-0340 read
371 landed file sets and found ADR-0333's number replicating at 6.4× the population; ADR-0341 ranked
the nine shared registry surfaces and corrected the headline downward; ADR-0342 declined the last one
and exhausted the registry path, with ADR-0343 fencing it architecturally.

Every one of those instruments reads LANDED GIT HISTORY, and ADR-0341 D6 stated the limit plainly: a
history-reading instrument can never show a fix moving the number, because the past was all done
serially. What none of them could produce was a realised reading — what fan-out actually COSTS and
actually WINS when three lanes really run at once.

The condition that had never existed was N concurrent writers. ADR-0332's Consequences named it as
the live risk and noted the ADR-0255/0284 write-authority wall is a static deny block over the
primary checkout and is **claim-blind** — a write into a sibling worktree is refused by nothing.

## Decision

**D1 — THE EXPERIMENT, AND THE THREE LANES IT CHOSE.** Three parked `proposal` increments from
`verification-integrity-arc` (the only arc holding more than two), dispatched as three
`general-purpose` Opus subagents in ONE assistant turn, each in its own pre-cut worktree, on
2026-08-10T11:46:48Z:

| lane | increment | file surface | landed | duration | tokens |
|---|---|---|---|---|---|
| A | `render-fixtures-default-to-the-shipped-map` | `packages/forest-world`, `packages/app-surface` | #1264 | 24.7 min | 222k |
| B | `holdings-fold-distinguishes-cleared-from-held` | `packages/notice-board`, `packages/drive` | #1266 | 24.1 min | 211k |
| C | `process-entrypoint-check-covers-prescriptive-fields` | `packages/cli` | #1265 | 29.9 min | 222k |

All three reached a green gate and landed. **Every lane produced a real red→green proof and every
lane corrected something about its own increment's premise** — A found the filing had named the wrong
one of two gates, B found its preferred remedy would have forced `pg` into a browser-safe organism,
and C found the check it was extending had been retired and unwired by ADR-0311 D2, so the
increment's literal end state was unreachable by code. That is worth recording as a property of
delegated build lanes: none of the three took its brief at face value.

Disjointness was PREDICTED from each increment's own body, not scored with ADR-0340 D1's instrument —
the instrument reads landed PRs, and a `proposal` has landed nothing. Surfaces were then verified by
reading the tree (the holdings fold is `packages/notice-board/src/claim-history.ts` with its renderer
in `packages/drive`, which the increment body does not state).

**Vehicle: subagents, per ADR-0332 D2's 9× onboarding ratio.** Isolation came from
`storytree worktree create` rather than the Agent tool's `isolation: "worktree"`, because that mode
mints its own worktree in a location the write-authority wall's static deny block does not obviously
permit, and because the house ceremony composes the existing claim machinery — it took each lane's
claims BEFORE cutting its tree (ADR-0200 D3). **Each worktree's basename is its session id
(ADR-0033), so three subagent lanes received three DISTINCT ledger identities and the claim ledger
arbitrated them as ordinary sessions.** No new arbitration was written; none was needed.

**D2 — THE TOKEN PREMIUM IS 1.9%–10% DEPENDING ON HOW MUCH IS CHARGED TO FAN-OUT, AND IT PASSES THE
20% BAR UNDER BOTH READINGS.** Measured with the committed classifier (`storytree session-cost`,
ADR-0323), over this session's own transcripts, at the point every lane had landed:

| | |
|---|---|
| whole run | **$45.32** / 118 orchestrator turns / 390 tool calls |
| the three build delegates | $22.74 / 216 turns / 654,826 tokens |
| the librarian-curator delegate | $1.23 / 22 turns |
| the orchestrator itself | **$21.35** / 118 turns |
| delegate preamble floor, measured here | **67k** over 4 transcripts |

**The orchestrator cost almost as much as the three lanes together, and nearly all of it was landing
work** — it stood at $4.80 over 30 turns when the last lane finished building, and grew to $21.35
over 118 turns while sequencing three PRs. Any account of fan-out that prices only the lanes is
pricing the cheap half.

**HOW A RUN MEASURES ITSELF, recorded because it is not obvious and the next measurer will hit the
same wall.** `session-cost` treats any transcript touched in the last 10 minutes as IN FLIGHT and
excludes it by name — which makes a live experiment unmeasurable from inside itself, since the
measuring session is always writing. The fix needs no second instrument and no change to this one:
copy the project's transcript tree to a scratch dir, backdate the copies' mtimes, and point
`STORYTREE_TRANSCRIPT_DIR` at it. Mtime is only the in-flight heuristic; every priced figure is read
from each turn's recorded `usage`, so backdating a frozen copy distorts nothing. Delegate transcripts
live as their own `subagents/agent-<id>.jsonl` files, so per-lane figures are recoverable.

**No second serial arm was run** — it would have doubled the cost and the second arm is contaminated
by the first. The baseline is therefore MODELLED, and naming it is part of meeting ADR-0332 D1's bar:
*one session doing all three increments in-thread, sequentially, landing them as three PRs*.

**The narrow reading, which is the construction the experiment was briefed on.** The work tokens are
paid either way, so fan-out's extra cost is the onboarding the lanes would not otherwise have paid:
3 × ADR-0332 D2's $0.28 = **$0.84 on $44.48, i.e. 1.9%**. The 67k floor measured here sits within 6%
of D2's 71k median, so that price is used rather than re-derived.

**The wider reading, stated because the narrow one flatters the result.** A serial session also would
not have paid for three worktree ceremonies, three lane briefs, three lane reports read back into
context, or the seam repair D6 describes. Charging every orchestrator turn that is plausibly
fan-out-attributable — 3 setup, 1 dispatch, 3 report-processing, 12 for the seam repair, ≈19 of 118
at the measured $0.181/turn — puts the extra at ≈$4.28 on ≈$41.04, i.e. **≈10%**. This
deliberately over-charges: the seam repair delivered real value a serial session would also have had
to write, just more cheaply.

**The conclusion is insensitive to the choice.** 1.9% and 10% are both comfortably inside D1's 20%
ceiling, so the token axis passes without depending on which model a reader prefers. That
insensitivity is the finding; neither individual figure should be quoted as *the* premium.

**THE SIGN MAY IN FACT BE NEGATIVE, AND THIS IS NOT CLAIMED, ONLY NAMED.** ADR-0332's Consequences
left the sign of the context effect genuinely unknown. This run has a datum bearing on it: a delegate
turn cost **$0.105** against the orchestrator's **$0.181**, because cost scales with
`turns × context size` and three ~70-turn windows are cheaper than one long one. A serial in-thread
session would have carried all 216 lane turns in the window that was already reaching a 195k
context, at the higher rate and rising. That points the same direction as D2's conclusion or further.
It is an INFERENCE from a per-turn rate, not a measurement, and only a serial arm could settle it.

**D3 — THE BUILD PHASE WON 2.57×, THE LANDING PHASE WON NOTHING, AND END-TO-END IT IS 1.3×–1.7×.**
The build phase is the only part that parallelises, and reporting its speedup alone would overstate
the result by roughly half:

| phase | serial | fanned out |
|---|---|---|
| build (3 lanes) | 78.0 min | **30.3 min** — 2.57× |
| landing (3 PRs, sequenced) | 32.3 min | **32.3 min** — 1.00× |
| end-to-end | 110.3 min | **64.7 min** — **1.71×** |

Observed straggler ratio (max/mean) in the build phase: **1.14×**, against the 1.89× ADR-0332 D4's
1.59× implies.

**Do not read 2.57× as a correction to ADR-0332 D4.** D4 bootstrapped over 284 `--real` node builds,
a distribution with a 10× spread (median 317s, max 3222s). These three lanes were dominated by a
near-CONSTANT cost — the gate, whose test leg alone ran 6–7 min in every lane — which compresses
variance by construction. **A homogeneous population produces a small straggler tax; that is a
property of this population, not a refutation of D4's.** D4 remains the right model for `--real`
build fan-out.

**THE LANDING PHASE IS THE SERIAL FRACTION, AND IT IS NOT SMALL.** Measured per PR from open to
automerge: #1265 6.1 min, #1266 7.7 min, #1264 17.0 min (that one carried an unrelated repair). ADR-0333
D6 and ADR-0334 D4(c) both said landings serialise; here that is not a caveat but half the wall clock.
Amdahl does the rest — a 32-minute serial tail caps a three-lane fan-out at 1.71× no matter how
perfectly the build phase parallelises, and **the tail grows with N while the build saving does not.**

The 1.71× assumes the serial baseline also opens three PRs. If a serial session instead landed all
three increments in ONE PR — which ADR-0340 D1's instrument explicitly collapses to a single landing,
and which sessions do — its tail is ~7.7 min, its total ~85.7 min, and fan-out's advantage falls to
**1.33×**. Both readings bracket ADR-0332 D4's modelled 1.59×, which is a striking result: **D4's
number was about right end-to-end, for a completely different reason than it modelled.** D4 priced a
straggler tax that did not materialise, and the landing tax it did not price ate the difference.

**D4 — n=1, AND IT IS REPORTED AS ONE SAMPLE.** ADR-0332 D4's own population varies 1.9×–8.9× between
runs of the same unit. A single three-lane trial is one draw. Neither the 2.57× nor the 3.1% is a
settled rate, and neither should be quoted as one.

**D5 — NO CROSS-TREE CONTAMINATION OCCURRED, AND THAT IS WEAKER EVIDENCE THAN IT LOOKS.** All three
lanes independently reported their worktree holding only their own files, no foreign edits, no
conflicts, and no gate failure naming a package they did not touch. `origin/main` did not move during
the run. **But the lanes were TOLD not to cross, and the wall did not stop them — it permits
everything under `.claude/worktrees` (ADR-0284).** This run is evidence that briefed lanes obey a
declared fence; it is NOT evidence that the claim-blind hazard is absent, and ADR-0332's
gating of the claim-aware fence behind this evidence should be read as still open on the safety
question even though the economics passed.

**D6 — THE REAL COST OF FAN-OUT WAS NOT TOKENS, IT WAS THAT A FENCE CUTS THROUGH REAL WORK.** Lane B
delivered the honest floor — its fold is now structurally incapable of asserting a live holder it has
not checked — but the half that makes the ~205 historical spans legible is DORMANT in production,
because the wiring is one line in `packages/cli/src/commands.ts`, inside lane C's fence. It stopped
and reported rather than reaching across.

**This is the effect ADR-0333 D6 named and ADR-0340 D3 sized, caught live at lane grain — and the
git-reading instrument is structurally blind to it.** Instrument A scores width from landed file
sets. These three lanes landed disjoint file sets, so it would score this run as clean three-lane
width. The cross-lane edge was real, and it never became a shared file: it became a piece of work one
lane could not finish. **A fan-out design must expect to finish lanes at the seams, and that cost
lands on the orchestrator, serially, after the parallel phase is over.**

The seam cost here, measured rather than estimated: the orchestrator wrote the one line, reversed a
test fake whose `throw` encoded the invariant the increment deliberately reversed, and added two
tests pinning the wiring in both directions — and that pulled `packages/cli` into lane B's gate
scope, widening it from `{notice-board, drive}` to `{cli, drive, notice-board}` plus dependents.
**One line of production code cost a full extra gate cycle.** It was worth paying: shipping the fold
without it would have landed a built-but-unreachable mechanism, which is the same defect class as the
sibling increment `memory-provenance-stamp-has-no-writer` still parked on this arc. But the general
form is the warning — a lane fence converts a one-line reach-across into an orchestrator task with
its own verification cost, and there is no reason to think one line is typical.

**D7 — A SHARED LIVE STORE IS A CONFLICT SURFACE NO FILE-DISJOINTNESS MEASURE CAN SEE.** A fourth
candidate, `memory-provenance-stamp-has-no-writer`, was DROPPED from the experiment before dispatch
and the reason is a finding. Its only available lever is durable guidance — most likely the
`session-orchestrator` agent artifact — which is a LIVE-STORE write, and `check:guidance` /
`check:agents` compare the committed projections against the live store on **every** lane's gate. The
moment that lane wrote, the other two lanes would have gone red on a file they never touched, before
its own PR landed.

So the dispatchability of a lane is not a property of its file set alone. **Any lane whose work
passes through the live store, or through a gate rung that reads the live store, is un-fannable
beside code lanes regardless of how disjoint its files are.** Guidance-authoring, agent edits and
prose sweeps over the generated projections are all in this class.

**D8 — THE WIDTH FINDING IS UNCHANGED, AND IT IS WHAT GOVERNS.** ADR-0332 D5 measured 17 open
increments across 9 of 22 active arcs, with only two holding two or more. Re-read from
`storytree arc list --pg` immediately before this ADR was written, the figures are **identical, to
the unit**: 22 active arcs, 17 open increments across the same 9, and still exactly two arcs holding
two or more — **`verification-integrity-arc` with 8 and `session-decoupling-arc` with 2.** Every
other arc with any open work holds exactly one.

That the distribution did not move in a day is itself the point: the economics now pass on both axes,
and there is almost nothing to spend them on. **A reader must not mistake a good ratio for a large
opportunity.** This experiment could only be run at all because a single arc holds eight lanes, and
after it that arc holds five — so running it consumed roughly a fifth of the entire factory's
fannable width.

## Consequences

**What is now settled.** The subagent-build cell ADR-0332's Consequences called "untried rather than
refused" has been tried. It passes the bar on tokens (1.9%–10% depending on what is charged to
fan-out, inside the 20% ceiling either way) and wins real but modest wall clock (**1.33×–1.71×
end-to-end**, not the 2.57× the build phase alone shows). ADR-0331's
1.8–3.6%-removable ceiling is confirmed as not binding here for the reason ADR-0332 gave — the mix.
This window's own overlap reading is 2.1% removable **only because all three spawns were already
dispatched in one turn**; the instrument reports 100% of spawns pre-batched, so its "compressible"
figure measures what a batcher could still add, which is nothing, and must not be read as the
speedup.

**What is NOT settled, and what this ADR declines to decide.** Whether to build anything remains the
owner's call and is not taken here. The honest summary is that the two constraints have swapped
places: the economics were the open question and are now answered, while WIDTH (D8) and the
claim-blind write fence (D5) are what stand between this result and a dispatcher. Building the fence
on the strength of a run in which nothing tried to cross it would be building on the absence of a
test, not the presence of evidence.

**And if anything IS built, D3 says where the leverage is, and it is not the dispatcher.** The build
phase is already near its ceiling — 30.3 min against a 29.4 min critical path, so a perfect scheduler
would save under a minute. The serial landing tail is 32.3 minutes, it is half the end-to-end wall
clock, and it GROWS with N while the build saving does not. A fourth or fifth lane therefore buys
progressively less and costs progressively more tail. Anyone proposing a dispatcher should be asked
why they are not instead shortening the landing phase, which pays out in ordinary serial work too —
the same argument ADR-0341 D4 made for the `node-build.test.ts` de-registry.

Accepted knowingly: the 3.1% rests on a modelled baseline and a per-lane onboarding price carried
over from ADR-0332 D2 rather than re-derived; a serial arm would settle both and was deliberately not
run. D6's seam cost is real but unpriced — it was one line in this run, and there is no reason to
think one line is typical.

**Two defects this experiment surfaced incidentally**, recorded because they are on
`verification-integrity-arc`'s own subject and would otherwise be lost:
- `check:web-engine` is **green when blind**. Without the `web/` submodule it prints a SKIP line and
  returns exit 0, so `pnpm gate`'s per-step table reports it PASS — while its siblings
  `check:web-grounding` / `check:web-experience-closure` exit 3 and report SKIP honestly. Every lane's
  local gate reported it green; CI, which has the submodule, blocked. The vocabulary to fix this
  already exists (exit 3) and the fix is one line. It is NOT fixed here.
- Lane A's fixture extraction found three product defects the old fixtures had been hiding: the
  sprite swap discards the `sign-blank` human-witness signpost, `is-filtered` never reaches
  `parcel-flora`, and `handlersFor` wires `onSelectCap` only on the retired `flora` kind. Reported,
  not fixed — they are product code and outside that increment's scope.

## References

- ADR-0332 — the charter, the bar (D1), the onboarding price (D2), the break-even (D3), the straggler
  model (D4) and the width finding (D5). This ADR carries `amends: [332]`: D1–D5 stand unchanged and
  are applied rather than corrected. What it adds is the realised reading D1 asked for, and D8
  confirms D5's width finding still governs.
- ADR-0340 / ADR-0341 — the git-reading instrument and its marginal ranking. D6 and D7 name two
  conflict classes that instrument is structurally unable to see; neither corrects its numbers.
- ADR-0342 / ADR-0343 — the registry path's exhaustion and its architectural fence.
- ADR-0338 — owns the missing answer verb that leaves this arc rendering `waiting: true`.
- `oq-live-fanout-is-the-only-remaining-measurement` — the question the owner answered.
