---
status: accepted
decided: 2026-08-10
arc: parallel-session-dispatch-arc
amends: [341]
---
# ADR-0342: Decomposing the CLI dispatcher cannot buy its measured width, and the registry path is exhausted

## Status

accepted (2026-08-10) — ADR-0341 D5 left `packages/cli/src/commands.ts` as an explicitly un-asked
owner fork: the last ranked registry surface, worth +1.7% of wide-wave share, needing a real
decomposition rather than a surgical fix. The owner put that fork to this session directly, delegated
the call to the measurement — *"settle whether that trade is worth making, and treat 'no' as a
first-class outcome"* — and pre-blessed both branches. That is design-time direction and therefore
ratification (ADR-0110), so this ADR is born accepted rather than proposed. The answer is **no**, and
it is a stronger no than "the prize is small": the decomposition **cannot reach** the width that was
modelled for it.

The economics are NOT reopened: ADR-0332 D1/D2/D3/D4 stand untouched and were not re-run. No width
measurement was re-run either, for the reason ADR-0341 D6 gives.

## Context

ADR-0341 ranked ADR-0340's nine registry surfaces by marginal lane width and found two worth
touching. It fixed one (`node-build.test.ts`, D4) and declined six on the measurement. `commands.ts`
was left open because its churn *looked* diffuse — a judgement D5 reached by sampling twelve hunks by
hand, which is the weakest step in the whole ranking.

That hand-sample could not answer the question the fork actually turns on. `marginalRanking` says
which surfaces **cost** width. It says nothing about whether any of them is **fixable**, and those are
different questions: `node-build.test.ts` was fixable because 81% of its churn was one hardcoded list.
Nobody had measured whether `commands.ts` has an equivalent.

## Decision

**D1 — THE INSTRUMENT GAINS A WITHIN-SURFACE READING, AND CONFINEMENT IS THE STATISTIC.** Extending
the existing instrument, never a second one (ADR-0341 D1): `attributeChurn` buckets every added line
of a surface's history under the top-level construct that contained it, rebuilding the construct map
from each commit's own blob because lines move. The pure core is in `packages/cli/src/lane-width.ts`
with tests; the git reads stay in `measure-lane-width.ts`, reachable as
`--attribute <path> [construct ...]` and needing no store.

The deciding statistic is **CONFINEMENT**: the share of a surface's commits that touched *nothing
outside* a proposed fix's blast radius. Those are the commits that would stop touching the file at
all. Validated against the known case — `node-build.test.ts` reports one construct (`deps`, which
held the hardcoded list) at **88.6% of 132 non-merge commits**, matching D4's hand count of 127/157
in shape.

Confinement is a **CEILING and never an achievement**, for exactly ADR-0341 D6's reason: the wave
simulation counts whether two landings *touched* a file, never how many lines each added. **A fix that
shrinks a surface's per-command wiring without removing the touch buys precisely zero measured
width.** That sentence is the whole finding.

**D2 — `commands.ts` DOES NOT CONFINE, AND THE GAP IS NOT CLOSE.** Over 129 non-merge commits:

| construct | commits | share | +lines |
|---|---|---|---|
| `run` — the 1,284-line dispatch | 96 | 74.4% | 1,760 |
| the import block | 91 | 70.5% | 242 |
| `topHelp` | 31 | 24.0% | 69 |
| `RunDeps` | 27 | 20.9% | 195 |
| `editArtifact` | 16 | 12.4% | 293 |
| …then a tail of ~40 constructs, none above 8% | | | |

ADR-0341 D5's "no dominant append point" is right, but "diffuse" undersells it in one direction and
oversells it in the other: the churn *is* concentrated in the dispatcher, and that still does not make
it fixable. Two fences were measured:

| proposed fix | confinement |
|---|---|
| derive the wiring — `run` + `CLI_OPTIONS` + imports | **31.0%** |
| **plus** extract every help renderer, `RunDeps`, and all nine library/artifact command bodies | **59.7%** |

So a decomposition that extracts essentially everything a reasonable person would extract still leaves
**40% of commits touching the file** — and the modelled +1.7% assumes 100%. The realistic capture is
a third to three-fifths of an upper bound that was already small.

**D3 — AND 100% IS NOT AVAILABLE AT ALL, BECAUSE THE CENTRAL PARSE IS STRUCTURAL.** The CLI has
exactly **one** `parseArgs` call (`commands.ts:2330`), strict, over the global `CLI_OPTIONS` table,
executed *before* dispatch across all 31 command areas. A single global parse requires a single place
enumerating every flag. Composing `CLI_OPTIONS` from per-module fragments does not remove that place —
it *relocates* it, and two lanes adding two commands still collide, now on the composition site. The
instrument would report the same width, correctly.

Reaching zero touches would require per-command argv parsing, which changes the unknown-flag refusal
(today one strict parse yielding one `bad arguments` envelope) and the pre-dispatch `--help` path.
Those are user-visible CLI behaviours the brief for this work explicitly ruled out changing, across
31 command areas, with 29 test files and 8,203 test lines importing this module directly.

**D4 — THE DECOMPOSITION IS DECLINED, ON THE MEASUREMENT.** Priced against ADR-0341's own ladder: the
whole remaining registry prize is 1.115× → 1.145× straggler-adjusted; `node-build.test.ts` banked
1.115× → 1.121×; both CLI surfaces together would reach about 1.13×. `commands.ts` is therefore worth
about **+0.009× at its 100% ceiling**, and 31–60% of that in practice — under half a percent of wall
clock, bought by rewriting the CLI's entry path. That does not clear any bar the arc has. **Corrected
in place, 2026-08-10 (ADR-0139):** that framing was economic only —
[ADR-0343](0343-the-cli-command-register-is-one-capability-and-stays-one-uni.md) records that the
decomposition was never architecturally available in the first place (the register is one capability,
owned by `cli`, per ADR-0192's landlord rule), so no future measurement — more or less favourable —
can reopen it.

**D5 — THE REGISTRY PATH IS EXHAUSTED, AND THAT IS THE REAL CONSEQUENCE.** With this decline, all nine
of ADR-0340's surfaces are resolved: one already deleted, one fixed, six declined on the measurement,
and one declined here. **Option A is complete** — not abandoned. There is no tenth surface and no
further registry work that would widen the measured lanes.

What that leaves is the question option A was chosen to enable. Instrument A reads landed file sets,
so it can price *available* width but can never observe *realised* width, and ADR-0340's Consequences
already record its unquantified upward bias (file-disjointness is not dispatchability). The only
remaining route to the proper measurement the owner asked for is a **live instrumented fan-out** —
actually running N subagent lanes on one of ADR-0334 D3's eleven concentrated arcs and measuring
tokens and wall clock end-to-end against ADR-0332 D1's 20% bar. That is an owner fork about appetite
and spend, not a measurement anyone can settle from history, and it is escalated as
`oq-live-fanout-is-the-only-remaining-measurement` on this arc.

## Consequences

**The arc's forward path is now a single owner decision, and no engineering is queued behind it.**
Every surface-side move that could be made without owner spend has been made. `measure-lane-width-after-brief`
stays parked as ADR-0334 D6's forward test of the amended planner brief; ADR-0340 D5's amended
falsifier is unchanged. Nothing else on this arc is dispatchable until the owner answers.

**A negative result is the deliverable, and it cost one session rather than a CLI rewrite.** The
attribution reading is what made the decline defensible instead of a matter of taste — it is the
difference between "this looks diffuse" and "a fix confines 31% of the churn, and the ceiling it is
chasing is 1.7%".

**Confinement is reusable and belongs beside the ranking, permanently.** The next candidate surface —
on this arc or any other — can be asked *is it fixable?* before anyone estimates the fix. The pairing
generalises: rank by marginal width to find what costs, then attribute churn to find what is
recoverable, and never assume the second from the first.

**Accepted knowingly — the same caveats, one layer down.** Confinement inherits everything ADR-0341's
Consequences records about marginal readings, and adds one of its own: it attributes churn at
top-level-construct grain, so a fix that splits a construct *internally* is invisible to it. That
grain was chosen because it is the grain at which code actually moves between files, and the
conclusion here does not turn on a close call — 31% against a 1.7% ceiling has room for a great deal
of measurement error.

**Not re-run and not re-derived**, deliberately: ADR-0332 D1–D4, ADR-0340's population, and every
width number in ADR-0341. This ADR reads *within* one surface and changes no width figure. Consistent
with ADR-0341 D6, no claim is made that any number moved: nothing was fixed here.

## References

- ADR-0343 — amends this ADR (`amends: [342]`): this ADR's measurements stand and are untouched, but
  its decline read as economic alone; ADR-0343 records that the decomposition was never
  architecturally available regardless of cost, so no future measurement can revive it. Corrected in
  place above (D4).
- ADR-0341 — the ranking that produced this fork. **Amended here** (`amends: [341]`): it stays current
  in full, but its D5 left `commands.ts` as an open owner fork and that fork now has an answer. Its
  D1–D4 and D6 are untouched, and its "the owner should see the new number before spending more on it"
  is what this ADR acts on.
- ADR-0340 — the measurement that named the nine surfaces; D5's falsifier unchanged.
- ADR-0332 D1 — the owner's bar (>20% extra tokens fails regardless of latency won). Applied, not re-derived.
- ADR-0334 D3 — the eleven concentrated arcs, which is where a live fan-out should be pointed.
- ADR-0110 — owner direction in-conversation is ratification, which is why this is born accepted.
- ADR-0314 D5 / ADR-0338 (proposed) — escalation authors an `open-question` artifact; why this arc
  keeps rendering as WAITING regardless.
- `packages/cli/src/lane-width.ts` (+ `.test.ts`) — `attributeChurn` / `constructLines` / confinement;
  `packages/cli/scripts/measure-lane-width.ts --attribute` — the runnable reading.
- `packages/cli/src/commands.ts:2330` — the single strict `parseArgs` that D3 turns on.
