---
status: accepted
decided: 2026-08-08
arc: session-cost-arc
amends: [95, 139]
load_bearing: true
---
# ADR-0324: The librarian pass is trigger-gated and split, not per-landing

## Status

accepted (2026-08-08) — decided/directed by the owner in conversation on 2026-08-08. Design-time alignment IS the ratification (ADR-0110); no second end-of-flow ask.

## Context

ADR-0095 D7 made a librarian-curator pass MANDATORY before every merge ceremony, and the generated
`session-orchestrator` workflow encodes it as step 5 with an explicit ordering fence: green unit →
retro → librarian pass → open the PR → CI merges. The fence's stated reason is sound and is not in
dispute — under ADR-0022 the session does not perform its own merge, a green PR automerges within
minutes, so an already-open PR is past the last moment the session controls, and a pass started then
strands on a dead branch.

The owner suspected the pass was expensive enough to be worth doing less often. The measurement
(ADR-0323) says it is 8.7% of spend — real, but not the dominant cost — and, importantly, that it
EARNS most of what it costs. Per-session detail across the ten-session window:

| session  | cost  | turns | output | what it actually did                          |
|----------|------:|------:|-------:|-----------------------------------------------|
| 5f0104b2 | $1.90 |    22 |    877 | 3 edits, ADR-0316 + ADR-0314 build-state fixes |
| bb358639 | $2.99 |    30 |  1,458 | 4 edits + 1 write, ADR-0060 prose falsified    |
| 2ea938b3 | $3.04 |    28 |  1,133 | 3 edits, ADR-0294 correction                   |
| f8ed128c | $4.36 |    42 |  1,004 | 2 edits + 3 writes, ADR-0305 correct-in-place  |
| 2e9247b0 | $5.47 |    53 |  2,407 | 13 edits, caught a FALSE claim written that day |
| a494343d | $7.03 |    72 |  7,419 | swept 3 claim shapes, "one thing to report"    |

Six of ten sessions ran one; every one found something. Four of ten ran none — and those four are the
signal. There is no evidence any of the four needed one: a session that edits only `packages/**` code
has not touched the decision log, the story corpus, or the guidance surfaces the librarian curates.
The mandate did not cause those four passes to happen, which means the mandate is already
under-enforced in exactly the cases where it is cheapest to skip — and the discipline is honoured
selectively rather than by rule.

Two further facts shape the decision. First, the floor cost is ~$2 even when the pass finds almost
nothing, because the cost is dominated by preamble and context rent (ADR-0323) rather than by the
work; a494343d spent $7.03 largely to conclude "nothing else needed". Second, and decisively: the
project's own operating knowledge already records that **decision-log staleness is not
session-local**. The agent-memory entry for the `check:agents` race states that *any branch's regen
fixes it for all* — a stale ADR on `main` is equally fixable by the next session to notice it. That
is not true of the pass's other half. Graduating what THIS session learned — the durable essence of
its own friction, its own memory candidates — is knowledge only this session holds, and it evaporates
when the session ends.

So the pass is two jobs with different lifecycles, welded together by one mandate: one is
session-local and perishable, the other is shared, durable, and repairable by anyone.

## Decision

**D1 — The pass splits into two halves with different triggers.**

- **GRADUATION (session-local, unconditional).** Extracting the durable essence of what this session
  learned — friction, memory candidates, guidance worth promoting — stays where ADR-0095 put it:
  before the PR, every landing, no trigger. This half is perishable and cheap; it is the reason
  ADR-0095's ordering fence exists and the fence is preserved for it verbatim.
- **DECISION-LOG CURATION (shared, triggered).** Sweeping `docs/decisions/**` and the guidance
  surfaces for prose this session overtook runs when the session actually TOUCHED a curated surface.

**D2 — The trigger is mechanical, not a judgment call.** The curation half fires when the branch's
diff against `merge-base(origin/main, HEAD)` touches any of `docs/decisions/**`, `stories/**`, the
generated guidance projections (`CLAUDE.md`, `AGENTS.md`, the harness agent directories), or when the
session performed a live-store write to any `agent`/`principle`/`guardrail`/`pattern`/`process`
artifact. This is deliberately the same class of path-classification `pnpm gate --scope` already
performs (ADR-0304 D1), and like that classifier it **fails WIDE**: an unmapped path, an unreadable
`origin/main`, or any doubt fires the pass. A session cannot cheapen itself by guessing "probably
nothing to curate" — it must be able to show the diff touched nothing curated.

**D3 — The librarian-curator runs on `sonnet`, not `opus`.** Its work is sweep-compare-correct against
an explicit standard (is this prose still true; does this edge exist; is this status a projection of
the `## Status` prose). That is the workhorse profile ADR-0182's tier split names, not the judgment
profile. The judgment-heavy curation seats — `graduation-synthesist` (adjudicates), `guidance-curator`
(decides whether a rule is true and durable) — STAY on opus, because deciding what is true is exactly
the split's opus side.

**D4 — What is NOT decided: a batched drain.** The obvious next step — run one decision-log sweep per
N landings, or nightly, instead of per triggered session — is deliberately NOT taken here. D2 already
removes the passes with nothing to curate, which is the measured waste; a batched drain would trade a
known-good trigger for an unowned scheduled job, and this factory has no evidence yet that the
remaining triggered passes are redundant with each other. Revisit only if the measurement shows
triggered passes routinely finding nothing.

## Consequences

**Good.** The four sessions in ten that already ran no pass become CORRECT rather than
under-enforced, and the discipline stops being honoured selectively. On the measured window the
curation half would have fired for the ADR-editing sessions (which all found real corrections) and
not for the pure-code ones. Combined with D3's tier flip the population cost drops from $24.79 toward
roughly $7 — a ~70% reduction on this line with, on the measured evidence, no correction lost. The
split also makes each half's purpose legible: one is "don't lose what you learned", the other is
"don't leave the log lying".

**Bad / the honest risks.** The real risk is a session that overtakes an ADR's prose WITHOUT touching
a curated path — landing a code change that silently falsifies a claim in an accepted ADR. D2's
fail-wide bias does not catch this: the diff is pure `packages/**` and the trigger stays quiet. This
is a genuine narrowing of coverage and it is accepted knowingly, for two reasons. It is the case
ADR-0323's measurement cannot price (no observed instance in the window), and it is exactly the case
the shared-repairability argument covers — the next session to touch that ADR fixes it, as the
`check:agents` precedent already relies on. If instances accumulate, the remedy is to widen D2's
trigger, not to restore the blanket mandate.

Secondarily, D3 risks a sonnet curator missing a subtle overtaking that opus would have caught.
Mitigated by the standard being explicit rather than tacit — ADR-0139 tells the curator exactly what
to compare — and falsifiable: a missed correction traced to the tier flip is grounds to revert D3
alone, independently of D1/D2.

**Neutral.** ADR-0095 D7 stays accepted and is AMENDED, not superseded: its ordering fence and its
graduation half survive intact, and only its "every landing, unconditionally" scope on the curation
half is narrowed. Per ADR-0139 this ADR carries the `amends: [95]` edge so the amendment renders
beside the decision it qualifies and is pulled into the load-bearing set transitively.

**ADR-0139 §7 is narrowed on the same axis, and carries the same edge.** §7 does not merely point at
ADR-0095 D7 — it independently restates the standing pass in its own words, promising the corpus is
kept in shape "every loop, not in one-off sweeps". D2 overtakes that phrasing exactly as it overtakes
D7's scope: it is now every *triggered* loop. §7 stays current but is no longer wholly
self-describing, which is ADR-0139's own test for an `amends` edge — hence `amends: [95, 139]`. The
edge was missed when this ADR landed because 0139 was read only as the *rule source* for edge
semantics, not as a target with a decision of its own on the same mechanism.

## References

- ADR-0095 D7 — the mandatory pre-merge librarian pass this ADR amends (D4/D6/D8 graduation half preserved).
- ADR-0323 — the measurement: the pass is 8.7%, and cost is context rent.
- ADR-0304 D1 / `packages/cli/src/ci-affected.ts` — the fail-wide path classifier D2's trigger mirrors.
- ADR-0182 — the workhorse/judgment model tier split D3 applies.
- ADR-0139 §7 — correct-in-place and the `amends` edge semantics used here, AND the second decision
  D2 narrows: §7's own "every loop, not in one-off sweeps" standing pass. Hence the `amends: [139]` edge.
- ADR-0022 — CI performs the merge; the reason ADR-0095's ordering fence exists and is preserved.
- ADR-0168 D1 / D5 — friction capture is free and discipline-not-gate; the graduation half's neighbour.
- ADR-0325 — the sibling tiering decision (built-in agents, the `explorer` delegate).
