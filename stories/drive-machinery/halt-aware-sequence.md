---
id: "halt-aware-sequence"
tier: capability
story: drive-machinery
title: "The fail-closed step sequence (runSequence / runLoop)"
outcome: "The spine composes leaf steps in strict order and a halted step can never be reported as a pass."
status: mapped
proof_mode: integration-test
depends_on: []
---

# The fail-closed step sequence (runSequence / runLoop)

**Outcome —** The spine composes leaf steps in strict order and a halted step can never be reported as a pass.

> **Proof status (honest) — `mapped`.** The whole behaviour is covered by a real, passing, offline
> suite (`packages/orchestrator/src/sequence.test.ts`, part of `@storytree/orchestrator` 99/99 —
> I ran it 2026-06-13). storytree's own prove-it-gate did not drive these proofs red→green, so this
> is brownfield `mapped`, never `healthy`.

## Guidance

The deterministic step machine (ADR-0005: the spine owns control flow; the leaf only judges),
ported in spirit from `legacy/Agentic/crates/agentic-runtime/src/sequence.rs`. `runSequence`
(`packages/orchestrator/src/sequence.ts:42-61`) builds each step from the PREVIOUS step's result
(splice composition) and HALTS fail-closed on the first `{ ok:false }`, returning the successful
prefix. `runLoop` (`sequence.ts:100-125`) repeats an iteration until a verdict predicate accepts an
`ok` iteration's structured output or the budget runs out.

**The single most important invariant in the file** (ported from V1's
`loop_halt_no_false_pass.rs`): the pass arm is gated on the iteration being `ok` — a HALTED
iteration can NEVER yield `passed:true`, even if an inner value looked green (`sequence.ts:113`).
A false green here would corrupt the spine's routing. [`story-topo-build`](story-topo-build.md)
deliberately REUSES `runSequence` instead of re-implementing a loop, precisely so this guard is
inherited, not re-proven.

The only import is `type { StepResult }` from `@storytree/agent` — a type-only edge to the leaf
organism's vocabulary, not a runtime coupling (see the story's executor-seam note).

## Integration test

**Goal —** The sequence machinery composes real steps against real in-story collaborators: the
story chain ([`story-topo-build`](story-topo-build.md)) rides `runSequence` verbatim, and its suite
proves a failing NODE halts the whole STORY run with no later node running and `passed:false`
(`packages/orchestrator/src/story-build.test.ts:130`) — the halt guard observed one level up, in
composition, not just in isolation.

## Contracts (7)

1. **`run-sequence-orders-and-prefixes`** — steps run strictly in order and a full success returns one result per step
   - **asserts —** all steps ran, in order, `halted:false`.
   - **covers —** `packages/orchestrator/src/sequence.ts:42-61`
   - **proven by —** `packages/orchestrator/src/sequence.test.ts:19` (REAL, passing)
2. **`run-sequence-splices-prev`** — the previous step's result feeds the next step's build
   - **asserts —** step N's input contains step N-1's output.
   - **covers —** `sequence.ts:48-50`
   - **proven by —** `sequence.test.ts:34` (REAL, passing)
3. **`run-sequence-halts-fail-closed`** — the first failing step halts the run; later steps never run
   - **asserts —** `halted:true`, `haltedAt` at the failing index, the failure recorded, no later step executed.
   - **covers —** `sequence.ts:53-56`
   - **proven by —** `sequence.test.ts:48` (REAL, passing)
4. **`run-loop-passes-within-budget`** — an ok iteration whose verdict passes ends the loop as passed
   - **asserts —** `passed:true`, iteration count = the passing iteration.
   - **covers —** `sequence.ts:105-116`
   - **proven by —** `sequence.test.ts:68` (REAL, passing)
5. **`run-loop-budget-exhausted`** — the budget runs out without a green: `passed:false`
   - **asserts —** `passed:false`, `iterations === maxIterations`.
   - **covers —** `sequence.ts:118-125`
   - **proven by —** `sequence.test.ts:88` (REAL, passing)
6. **`halted-is-never-a-pass`** — THE HARD GUARD: a halting iteration is never a pass, even with a green-looking inner value
   - **asserts —** an `{ ok:false }` iteration carrying a green-shaped structured output still yields `passed:false`.
   - **covers —** `sequence.ts:113` (the `result.ok &&` gate)
   - **proven by —** `sequence.test.ts:104` (REAL, passing)
7. **`passes-never-invoked-on-halt`** — the verdict predicate is not even consulted for a halted iteration
   - **asserts —** `passes()` is never called when the iteration was `{ ok:false }`.
   - **covers —** `sequence.ts:113`
   - **proven by —** `sequence.test.ts:130` (REAL, passing)
