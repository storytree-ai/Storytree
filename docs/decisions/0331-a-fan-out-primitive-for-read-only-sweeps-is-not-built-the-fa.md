---
status: accepted
decided: 2026-08-09
arc: session-cost-arc
load_bearing: true
---
# ADR-0331: A fan-out primitive for read-only sweeps is not built; the factory already overlaps its delegates

## Status

accepted (2026-08-09) — the owner asked on 2026-08-09 whether more deterministic fan-out over
subagents would reduce session cost, directed that the question be MEASURED before anything was
built, and on being shown the measurement directed that the result be landed as a decision.
Design-time alignment IS the ratification (ADR-0110); no second end-of-flow ask.

This ADR forecloses a build. It is therefore written to be falsifiable rather than final: D4 names
the observation that reopens it, and every number here is re-derivable with one command.

## Context

`session-cost-arc` established that session cost is input-side context rent (ADR-0323) and that
delegation to disposable-context leaves is the lever (ADR-0325). The natural next proposal is a
deterministic fan-out primitive — a workflow engine that replaces N orchestrator DECISION turns with
N agent spawns plus zero-cost control flow.

**The economics of that trade were already known to be unforgiving, and they are the reason this was
not simply built.** One subagent spawn costs $0.95 (a sonnet explorer) to $5.45 (an opus
story-author) against a main-thread turn at $0.18–0.25, so a delegate must save 5–25 main-thread
turns merely to break even. And increment 8 of this arc measured the trap in reasoning about
delegation from the design: DELEGATION RE-PRICES CONTEXT RENT RATHER THAN REMOVING IT — cache write
rose 22.5% → 26.0% as cache read fell, because every delegate pays its own ~85k preamble at the
cache-WRITE rate, 10× read on opus. A fan-out engine built on the assumption that more delegates is
straightforwardly cheaper would repeat that mistake at a larger scale.

**The load-bearing premise turned out to be measurable rather than arguable.** A batcher can only
compress an interval that is currently SERIAL — a session that spawns, waits, reads the digest, and
spawns again. Whether that is what sessions actually do is a fact on disk, not a judgement: subagent
transcripts live at `<sessionId>/subagents/agent-*.jsonl` with their own per-turn timestamps, so a
delegate's live interval is its first→last priced turn and whether two delegates ran together is
directly observable.

`storytree session-cost` was extended (`spawnOverlap`, held red-green over a committed fixture) and
run over two windows with one classifier, `--limit 300` so the scan budget opened all 1,688
transcripts on the measuring machine. PRE: 62 sessions, 8,005 main-thread turns, 81 spawns, started
2026-08-05 → 08-08T09:16:45Z. POST: 20 sessions, 2,437 main-thread turns, 50 spawns, started after
it. Three sessions were excluded as in flight.

**THE FACTORY ALREADY FANS OUT.** 26 of the 33 sessions where overlap was even POSSIBLE — those with
two or more spawns — already had two delegates live at the same instant (17 of 22 pre, 9 of 11
post). Peak concurrency reached ×5 pre and ×7 post.

**THE CEILING, AMDAHL COMPUTED.** The part no batcher can touch is the slowest single chain, so the
compressible interval is `union of the spawn intervals − the longest single interval`, summed PER
SESSION because delegates in different sessions run on different clocks and can never be batched
with each other.

| | PRE (62 sessions) | POST (20 sessions) |
| --- | --- | --- |
| union of intervals | 17.6h | 9.3h |
| per-session critical path | 13.8h | 6.2h |
| **compressible** | **3.8h of 212.5h — 1.8%, ×1.018** | **3.1h of 88.3h — 3.6%, ×1.037** |
| per session | ~3.7 min | ~9.4 min |
| largest single carrier | 15.1% of it | 51.0% of it |
| decision-turn residual | 19 turns, $4.08 (0.2% of spend) | 20 turns, $5.07 (0.8% of spend) |

The POST figure is half one session, so the broader PRE window is the more trustworthy of the two;
both point the same way.

**THE MECHANISM MATTERS MORE THAN THE NUMBER, because it generalises past this arc.** Concurrency
here needs no engine: the harness runs every spawn block emitted in ONE assistant turn at the same
time. A turn dispatching four delegates has therefore already collapsed four decision turns into one
AND already overlapped four intervals, with nobody having built anything — which is why 15–18% of
spawns arrived pre-batched and why the residual decision-turn prize is a fraction of a percent.

One count was discovered rather than expected and it sharpens the decision: main-thread spawn calls
(39 post / 53 pre) fall SHORT of subagent transcripts (50 / 81) because DELEGATES SPAWN DELEGATES
(13 / 28). A sub-subagent's transcript lands in the parent SESSION's `subagents/` directory while
its dispatch turn sits in another delegate's transcript. No main-thread batcher reaches those at
all.

## Decision

**D1 — A deterministic fan-out primitive for READ-ONLY SWEEPS is not built.** The measured prize is
3.7–9.4 minutes of wall clock per session (1.8–3.6% of session wall clock, ×1.018–×1.037) plus a
decision-turn residual of 0.2–0.8% of spend, against a crossover that requires a delegate to save
5–25 main-thread turns to break even. The number is recorded here so nobody re-derives it. This
refuses a BUILD; it refuses nothing about delegating, which ADR-0325 decided and which the same
measurement shows is working.

**D2 — This refusal does NOT extend to `parallel-red-green-arc`, and the two must not be folded into
one primitive.** That arc's fan-out is parallel BUILDS inside one worktree, which need write-scope
isolation and claim arbitration; this one is parallel read-only SWEEPS, which need neither. They are
different problems with different costs, and a primitive general enough to serve both would
over-constrain the cheap case. `parallel-red-green-arc`'s own `measure-the-serial-baseline` gates
its stage two on its own measurement and is untouched by this one.

**D3 — The overlap measurement is part of the instrument, not a one-off.** `spawnOverlap` and the
`SPAWN OVERLAP` block live in `storytree session-cost` under red-green cover, so this ADR's numbers
are re-derivable with one command rather than trusted. The instrument reports which sessions CARRY
the ceiling, because a ceiling held by one outlier is that session's shape and not the factory's —
the confound increments 8 and 10 of this arc each hit. A ZERO ceiling is reachable by an explicit
test: an instrument whose flattering answer cannot be reached could only ever argue for building.

**D4 — What reopens this, stated so the refusal is falsifiable.** A session shape that dispatches
many delegates it cannot name up front — a migration over a discovered work-list, an audit sweeping
a hundred files — would move the concentration line. Today the ceiling is carried by 15 of 61
sessions pre and 10 of 20 post, with one session holding 51% of the post window's. **If a later
window shows the compressible interval BROADENING across sessions rather than concentrating, or peak
concurrency falling while spawns per session rise, re-run the measurement and reconsider D1.** D1 is
wrong if either of those is observed; it is not wrong merely because a fan-out engine would be
elegant.

## Consequences

**Good.** A build is foreclosed on evidence rather than taken on a hunch, which is cheaper than
building it and discovering the same numbers afterwards. The refusal carries its own reversal
condition, so a later session can overturn it with a measurement instead of an argument. And the
generalisable finding — CHECK WHETHER THE SUBSTRATE ALREADY DELIVERS THE CAPABILITY BEFORE PRICING A
PRIMITIVE THAT WOULD DELIVER IT — is now graduated into
`process:measure-session-cost-from-transcripts` (steps 10 and 11), where it applies to the next
capability proposal and not only to this one.

**Bad, and accepted knowingly.** The POST window's ceiling is half one session, and a
ten-to-twenty-session window is small; the PRE window is broader but older. The overlap intervals
are first→last PRICED turn, so dispatch latency and the last turn's own generation are excluded and
the absolute minutes are a FLOOR. The ceiling is an upper bound twice over, because a transcript
cannot show which spawn's prompt was written from a previous spawn's digest — some of the measured
"compressible" interval is genuine dependency that no batcher could remove. And the wall-clock
denominator includes idle, which is free, so the removable SHARE understates the effect on an
owner's attention while the absolute minutes do not. All of these bias toward a SMALLER prize being
reported than exists, which is the direction that argues for the refusal — so the refusal rests on
the absolute minutes and the concentration, not on the percentage alone.

**The measurement is machine-local.** `~/.claude/projects/` is per-user and per-machine, so these
figures describe this factory on this box. A different operator's session shapes could differ.

**Not decided here.** Whether the harness's existing `Workflow` primitive should be used more (it
exists and has 39 historical uses in this repo's transcripts) is a separate question from whether
storytree should BUILD one; D1 refuses the build and says nothing about the former.

## References

- [ADR-0323](0323-session-cost-is-input-side-context-rent-not-output.md) — session cost is input-side
  context rent; D4 makes its numbers re-runnable, which is what made this measurement possible.
- [ADR-0325](0325-exploration-is-delegated-to-a-disposable-context-leaf-and-ev.md) — exploration is
  delegated to a disposable-context leaf; this ADR refuses a fan-out ENGINE, never the delegation.
- [ADR-0330](0330-the-eagerly-loaded-guidance-surface-is-budgeted-at-96-kib-re.md) — the preamble
  budget; its "every delegate pays its own preamble at the cache-WRITE rate" is why more spawns is
  not straightforwardly cheaper.
- `packages/cli/src/session-cost.ts` — `spawnOverlap`, `OverlapTotals`, `DispatchTotals`,
  `SPAWN_TOOLS`, `FANOUT_MIN_SPAWNS`; `packages/cli/src/session-cost.test.ts` and the
  `session-cost.fixture/C--code-fanout` fixture hold them red-green.
- `process:measure-session-cost-from-transcripts` — steps 10 and 11 carry the reusable method and
  the traps; its Verification section carries this measurement as the fourth replication.
- `session-cost-arc` increment `session-cost-arc-inc-12` (PR #1248) — the measurement as landed.
