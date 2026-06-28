---
id: "owned-loop-phase-author"
tier: capability
story: drive-machinery
title: "The owned loop behind the executor seam (OwnedLoopAuthor)"
outcome: "The owned agent loop authors one phase slice at a time behind the PhaseAuthor seam under the in-process write wall."
status: mapped
proof_mode: integration-test
depends_on: [phase-scoped-write-wall, red-green-phase-machine]
---

# The owned loop behind the executor seam (OwnedLoopAuthor)

**Outcome —** The owned agent loop authors one phase slice at a time behind the PhaseAuthor seam under the in-process write wall.

**Depends on —** [`phase-scoped-write-wall`](phase-scoped-write-wall.md), [`red-green-phase-machine`](red-green-phase-machine.md)

> **Proof status (honest) — `mapped`, now with a dedicated characterization test.** This adapter is the
> leaf in EVERY offline gate test: the unit walk (`prove-it-gate.test.ts:106-237`), the genuine e2e
> (`prove-it-gate.e2e.test.ts:160`, `:214`), the dry-run glue (`resolve-prove-spec.test.ts:309`),
> and the offline REAL-mode walk (`resolve-prove-spec.test.ts:539`) all drive a real
> `OwnedLoopAuthor` — its dominant behaviour is observationally pinned by those suites
> (`@storytree/orchestrator`, ran 2026-06-13). The fail-closed step-error path — the one path those
> suites exercised only INDIRECTLY — is now pinned directly by `owned-loop-author.test.ts` (contract 3
> below), so the `drive-machinery#gate-1` observe gate honestly covers this capability.

## Guidance

ADR-0030 §2/§4: the original ADR-0011 runtime — `Model` + `ToolExecutor` + the write-scoped
decorator — adapted onto the executor seam. This is the OFFLINE/deterministic executor
(`ScriptedModel` tests run the whole gate at zero cost) **and the pivot-out fallback** if the
rented runtime bites. `OwnedLoopAuthor`
(`packages/orchestrator/src/owned-loop-author.ts:33-64`):

- wraps the leaf's tool surface in a `WriteScopedToolExecutor` at construction
  (`owned-loop-author.ts:39-44`) and flips its phase per slice (`:53`) — the wall travels WITH the
  author, so the gate never has to trust the leaf's writes;
- runs exactly ONE fail-closed `runStep` per authoring slice (`:54-58`) — the prompt is the leaf
  brief, the model decides nothing about phases;
- surfaces the wall's refusals via the `violations` getter (`:48-50`) so the gate and tests can
  assert the wall held.

**Placement is deliberate:** this file lives in `packages/orchestrator` (the spine's package), not
`packages/agent` — it is the SPINE-side adapter that plugs the consumed owned-loop internals
(`runStep`, `Model`, `ToolExecutor` from `@storytree/agent`, `owned-loop-author.ts:8-9`) into the
seam the gate drives. The loop internals themselves (model seam, run-turn, step, fs-tools) and the
live `ClaudeAgentAuthor` are the leaf organism's code — consumed, not owned here (see the story's
executor-seam section).

## Integration test

**Goal —** The adapter authors through the real gate against real in-story collaborators: the e2e
walk (`packages/orchestrator/src/prove-it-gate.e2e.test.ts:160`) hands `proveUnit` an
`OwnedLoopAuthor` over a real `FileToolExecutor` + `PathWriteScope`; the scripted model's writes
REALLY land on disk, the test file only in AUTHOR_TEST and the impl only in IMPLEMENT, and the
spine's observed red→green is caused by those writes alone.

## Contracts (3)

1. **`one-step-per-authoring-slice`** — each `author(phase, prompt)` call is exactly one fail-closed `runStep` whose success advances the gate
   - **asserts —** the gate's happy path makes exactly two authoring slices (test, then impl) and reaches GATE.
   - **covers —** `packages/orchestrator/src/owned-loop-author.ts:52-63`
   - **proven by —** `packages/orchestrator/src/prove-it-gate.test.ts:106` and `prove-it-gate.e2e.test.ts:160` (REAL, passing)
2. **`wall-travels-with-the-author`** — the decorator's phase flips on every slice, so writes land per ADR-0020 §2 ownership
   - **asserts —** in the e2e the test file is written during AUTHOR_TEST and the impl during IMPLEMENT, through the real wall.
   - **covers —** `owned-loop-author.ts:39-44`, `:53`
   - **proven by —** `prove-it-gate.e2e.test.ts:160` (REAL, passing — composition; the wall's own refusal mechanics are [`phase-scoped-write-wall`](phase-scoped-write-wall.md)'s contracts)
3. **`failed-step-fails-closed`** — a `runStep` that ends `{ ok:false }` surfaces as a fail-closed `AuthorResult` (the gate then aborts the phase)
   - **asserts —** a scripted model that halts mid-slice (an empty terminal → `NoTerminalResult`, or a thrown turn → `ModelError`) yields `{ ok:false, error }` from `author` — the step's error surfaced verbatim, `exhausted` unset (a genuine fail-closed error, not a cost-guard exhaustion).
   - **covers —** `owned-loop-author.ts:59-62`
   - **proven by —** `packages/orchestrator/src/owned-loop-author.test.ts` (REAL, passing — a green-on-arrival characterization at the AUTHOR level, ADR-0098; the gate-aborts-with-no-signing-row consequence is `prove-it-gate.test.ts`'s fail/exhausted fall-through).
