---
status: accepted
decided: 2026-08-08
arc: session-cost-arc
load_bearing: true
---
# ADR-0323: Session cost is input-side context rent, not output

## Status

accepted (2026-08-08) — decided/directed by the owner in conversation on 2026-08-08. Design-time alignment IS the ratification (ADR-0110); no second end-of-flow ask.

## Context

The owner asked which recurring parts of a session are expensive enough to do less often, opening
with the hypothesis that the mandatory per-session librarian pass (the `session-orchestrator`
workflow step 5, ADR-0095 D7) was the culprit. The question was answered by MEASUREMENT rather than
by reading the ceremony list.

Every main-thread and subagent transcript for the ten most recent completed sessions
(2026-08-05 → 2026-08-08; 1,482 main-thread turns; 7 subagent spawns) was parsed from
`~/.claude/projects/**/*.jsonl` and priced per-turn at list rates from the recorded `message.usage`
and `message.model`. The transcripts carry exact token counts, so the token RATIOS below are
measured, not modelled; the dollar figures are a weight proxy (this factory's leaves are
subscription-funded, ADR-0030/0232) and should be read as relative weight, never as a bill.

**The hypothesis was wrong, and interestingly wrong.** The librarian pass cost $24.79 of $285.55 —
**8.7%**. Six of the ten sessions ran one; every one of the six made real corrections (2–13 edits,
predominantly ADR-0139 correct-in-place work on `docs/decisions/**`). Removing it outright would have
bought under a tenth of the spend while costing the decision log its only standing curator. The
ceremony was not the problem. It was, however, the WRONG PLACE TO LOOK, and the reason is the finding
this ADR records.

The measured price mix across those 1,482 turns:

| component      |    cost | share |
|----------------|--------:|------:|
| cache **read** | $173.32 |  67%  |
| cache write    |  $56.00 |  22%  |
| output         |  $29.96 |  12%  |
| input          |   $0.08 |   0%  |

**89% of spend is input-side.** The tokens a session AUTHORS — the edits, the prose, the reasoning —
are an eighth of what it costs to author them. A session is not billed mainly for thinking; it is
billed rent on the context it drags from turn to turn.

Four structural consequences follow directly, all measured:

1. **The fixed preamble is ~85k tokens** (CLAUDE.md 17.8k + AGENTS.md 5.7k + MEMORY.md 5.4k + system
   prompt + tool definitions) and is re-read on every turn. Across 1,482 turns that is ~$63 — **24% of
   everything** — spent re-reading onboarding text. This is the sharpest irony available: CLAUDE.md's
   own opening paragraph directs agents to pull context just-in-time (ADR-0023, ADR-0135), and the
   file arguing for pull-based context is itself the single largest eagerly-loaded object in the
   session.
2. **Median live context is 200–307k tokens, peaking at 428k.** At $0.177/turn average, a turn costs
   that much simply to EXIST, before it calls a tool. Cost therefore scales with
   `turns × context size` — with session LENGTH — and not with the number of ceremonies performed.
3. **133 turns (10%, $27.45) were pure polling**: `sleep 300; tail -4 .gate-logs/*.log` and
   `gh pr checks` loops. Each tick drags a quarter-million-token context along to read four lines.
   The harness already provides `run_in_background` with a completion notification; these loops
   re-implement it by hand at roughly 30× the price.
4. **246 of 1,033 bash calls (24%) were ad-hoc `grep`/`cat`/`head`/`ls` inspection in the MAIN
   thread.** The face cost of each is trivial; the real cost is that every result lands in context and
   is re-read on every subsequent turn. A 5k-token grep result at turn 50 of a 200-turn session costs
   ~$0.38 in downstream rent — **10–40× its face value**. Meanwhile subagents, whose context is
   DISPOSABLE and never charged to the parent again, were barely used: 7 spawns across 10 sessions,
   4 sessions using none at all.

Cost by phase confirms that no single ceremony dominates: orientation $34.04 / 245 turns, build
$160.55 / 934 turns, landing $65.54 / 296 turns (of which $37.48 / 184 turns fell AFTER
`gh pr create` — largely the polling above).

## Decision

**The factory optimises session cost as CONTEXT RENT — the product of context size and turn count —
and not by pruning ceremonies.** Three rules follow, and they bind the `session-orchestrator`
operating discipline:

**D1 — Discovery is delegated, not accumulated — and this is a RE-AFFIRMATION, not a new rule.**
`asset:delegate-exploration-to-digest-subagents` already decided exactly this on 2026-07-16, from a
much larger study than this one (trace mining over ~10.6B billed tokens / ~61.5k requests, which put
pure Read/Grep/Glob exploration at 21% of main-agent requests and re-billed ~50–65× when left in a
main session versus ~26× in a subagent context that dies at digest-return — an estimated ~14% of all
billed tokens, its largest verified lever). That principle is cited by `session-orchestrator` today.
**The rule is not restated here** (`asset:reference-dont-restate`); it is CITED, and what this ADR
adds is the finding that it is NOT BEING FOLLOWED and the diagnosis of why.

The evidence that it is unheeded: 24% of bash calls in the window were inline ad-hoc inspection, and
7 subagent spawns occurred across 10 sessions with 4 sessions using none. Two structural reasons, both
addressed by ADR-0325 rather than by exhortation. First, the principle's "How to apply" pointed at
*"the `Explore` agent, or a general read-only agent"* — the factory had no delegate of its own, so
following the rule meant reaching for a harness built-in. Second, that built-in carries no model pin
and inherits the caller's tier, so the one observed compliant spawn ran on opus. A rule whose only
delegate is unowned and untierable is a rule that decays into inline sweeps, which is what the
measurement shows. `explorer` (ADR-0325 D1) is the missing delegate.

**D2 — Mechanical waiting never pays full-context rent.** A backgrounded gate, a CI run, a long build
or any other wait for a machine is watched with a background task plus its completion notification, or
with a single bounded `Monitor`. `sleep N; tail` polling loops are RETIRED as a pattern. This is not
a style preference: at a 250k context each tick costs ~$0.21 to read four lines, and the harness
already offers the free version.

**D3 — The preamble is budgeted.** The eagerly-loaded session-start surface (CLAUDE.md + AGENTS.md +
MEMORY.md) is treated as a standing cost multiplied by every turn of every session, and is held to a
budget rather than allowed to grow monotonically. This ADR sets no number — the measurement instrument
below is what makes a number arguable — but it establishes that ADDING to those files has a
quantifiable recurring price and that the pull-based alternative (a Library artifact, fetched when
relevant) is the default for anything that is not needed by EVERY session on its FIRST turn.

**D4 — The measurement is the check, not this prose.** The analysis above is reproducible from the
transcripts and MUST be re-runnable over any window of sessions. A claim in this ADR that the numbers
later contradict is overtaken prose to be corrected in place (ADR-0139), not a rule to defend. This
ADR is explicitly falsifiable: if a later measurement shows output-side cost dominating, or shows
delegation failing to reduce main-thread context, D1–D3 are wrong and should be reversed.

## Consequences

**Good.** The optimisation target stops being "which ceremony can we skip" — a framing that trades
evidence for cost, and that this factory's whole gate discipline exists to refuse — and becomes "how
much does this session carry, for how many turns". Those are reducible without weakening a single
proof: the gate, the prove-it-gate, the merge ceremony and the PR discipline are all untouched by
D1–D4. Delegation additionally improves the main thread's signal-to-noise, since a summarised finding
is easier to reason over than 5k tokens of raw grep output.

**Bad / the honest costs.** Delegation is not free: a subagent pays its own preamble (~85k tokens of
system + tools + guidance) on its first turn, so a sweep that would have been two `grep`s in the main
thread is now MORE expensive, not less. D1 is a rule about EXPLORATORY sweeps with uncertain shape,
not about every read — a session that delegates a one-line lookup has misread it. The crossover is
roughly: if you can name the file and the symbol, read it; if you are hunting, delegate. Similarly,
D3 constrains a file that exists precisely because sessions needed orientation, so trimming it too
far re-creates the orientation failures ADR-0162 measured — the budget is a forcing function for
moving text to the Library, never a licence to delete it.

**Unresolved.** This ADR does not set the preamble budget number, and does not decide whether the
measurement instrument becomes a `check:*` gate rung. Making it a rung is tempting and probably wrong
for the reason ADR-0168 D1 gives about retro theater: a cost gate would be gamed by splitting
sessions. It is currently a diagnostic a session or the owner runs deliberately.

**What this ADR explicitly does NOT do.** It does not weaken the librarian pass (that is ADR-0324's
narrower decision, and it gates rather than removes it), does not reduce what any session PROVES, and
does not authorise skipping `pnpm gate`, the merge ceremony, or a librarian pass whose trigger fired.
An increment that lowers cost by lowering evidence has missed the point of the arc and should be
reverted.

## References

- `session-cost-arc` — the owning arc (intent, end state, increment log).
- ADR-0324 — the librarian pass is trigger-gated and split (the narrower, measured follow-on).
- ADR-0325 — the `explorer` delegate and the per-agent model tiering that D1 depends on.
- `asset:delegate-exploration-to-digest-subagents` — the STANDING principle D1 re-affirms (authored
  2026-07-16 from the ~10.6B-token study). D1 adds only the finding that it is unheeded and why.
- `asset:pull-based-context-architecture` · `asset:exploration-principles` — its neighbours; D3 is the
  same economics applied to the eagerly-loaded preamble rather than to exploration.
- ADR-0023 / ADR-0135 — pull-based, just-in-time context; the principle D3 restores to the preamble.
- ADR-0162 — the measured cost of over-reading orientation as a do-first ritual; the counterweight to D3.
- ADR-0139 — correct-in-place; how a later measurement overtakes prose in this ADR.
- ADR-0168 D1 — why a compliance gate prices a ceremony toward theater (the reason D4 is a diagnostic).
- ADR-0030 / ADR-0232 — subscription-funded leaves; why dollar figures here are weight, not a bill.
