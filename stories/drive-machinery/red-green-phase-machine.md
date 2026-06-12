---
id: "red-green-phase-machine"
tier: capability
story: drive-machinery
title: "The ADR-0020 red-green phase machine"
outcome: "A unit advances through the spine-owned phase ladder only via fail-closed transitions the spine itself legitimizes."
status: mapped
proof_mode: integration-test
depends_on: []
---

# The ADR-0020 red-green phase machine

**Outcome —** A unit advances through the spine-owned phase ladder only via fail-closed transitions the spine itself legitimizes.

> **Proof status (honest) — `mapped`.** Fully covered by a real, passing, offline suite
> (`packages/orchestrator/src/phase-machine.test.ts`, part of `@storytree/orchestrator` 99/99 —
> I ran it 2026-06-13). Brownfield `mapped`, not `healthy`: the gate never drove these proofs.

## Guidance

The honesty floor (ADR-0020 §1–§3). ADR-0011 collapsed the per-node runtime to ONE owned loop,
which removed V1's process-isolation walls (separate crates authored the test, the code, and
signed the verdict); this module re-establishes that property in the deterministic spine. Four
pieces, one file (`packages/orchestrator/src/phase-machine.ts`):

- the **phase ladder** `AUTHOR_TEST → CONFIRM_RED → IMPLEMENT → CONFIRM_GREEN → GATE`
  (`phase-machine.ts:20-25`) — the spine owns every transition; the model never decides it is done;
- **`nextPhase`** (`phase-machine.ts:60-108`), the OBSERVATION gates: `CONFIRM_RED → IMPLEMENT`
  requires an observed red (a green here is the forged/early pass ADR-0020 §3 stops);
  `CONFIRM_GREEN → GATE` requires an observed green; everything else refuses with a reason;
- **`advancePhase`** (`phase-machine.ts:116-128`), the two authoring-complete advances — these
  carry no observation, and `nextPhase` refuses to govern them (the split is itself load-bearing:
  an agent cannot drive an observation gate with an authoring signal or vice versa);
- **`PathWriteScope`** + the dependency-free tiny glob matcher (`phase-machine.ts:159-225`),
  ADR-0020 §2's write-ownership predicate: TEST paths writable only in AUTHOR_TEST, SOURCE paths
  only in IMPLEMENT, everything else denied — a path matching both globs stays test-owned (the
  stricter owner), and the CONFIRM/GATE phases are observe-only;
- the **`TestExecutor` seam** + the `RecordingTestExecutor` offline double
  (`phase-machine.ts:232-266`) — the seam the spine observes red/green through; the double rejects
  on over-run rather than handing back a silent green.

Enforcement lives elsewhere by design: [`phase-scoped-write-wall`](phase-scoped-write-wall.md)
wires the predicate into the tool surface; [`shell-test-observer`](shell-test-observer.md) is the
live `TestExecutor`; [`prove-it-gate`](prove-it-gate.md) drives the ladder.

## Integration test

**Goal —** The ladder composes end-to-end against real in-story collaborators: the e2e gate walk
(`packages/orchestrator/src/prove-it-gate.e2e.test.ts:160`) advances a unit through every phase
with `advancePhase`/`nextPhase` deciding each transition off REAL observations from a spawned test
process, and the in-file composition test (`phase-machine.test.ts:63`) walks the full legal path
`AUTHOR_TEST → … → GATE` through the same two functions.

## Contracts (8)

1. **`confirm-red-requires-observed-red`** — CONFIRM_RED advances only on an observed red; a green is a forged/early pass
   - **asserts —** red → `IMPLEMENT`; green → `{ ok:false }` with the forged-pass reason.
   - **covers —** `packages/orchestrator/src/phase-machine.ts:64-73`
   - **proven by —** `packages/orchestrator/src/phase-machine.test.ts:15` and `:20` (REAL, passing)
2. **`confirm-green-requires-observed-green`** — CONFIRM_GREEN advances only on an observed green
   - **asserts —** green → `GATE`; red → `{ ok:false }`.
   - **covers —** `phase-machine.ts:75-82`
   - **proven by —** `phase-machine.test.ts:26` and `:31` (REAL, passing)
3. **`authoring-phases-are-not-observation-gates`** — AUTHOR_TEST/IMPLEMENT refuse `nextPhase`; GATE is terminal; a forged transition is refused
   - **asserts —** each returns `{ ok:false }` with a pointed reason.
   - **covers —** `phase-machine.ts:84-101`
   - **proven by —** `phase-machine.test.ts:36`, `:42`, `:46` (REAL, passing)
4. **`advance-phase-authoring-complete-only`** — exactly the two authoring-complete advances are legal
   - **asserts —** `AUTHOR_TEST → CONFIRM_RED` and `IMPLEMENT → CONFIRM_GREEN` succeed; every other source phase refuses.
   - **covers —** `phase-machine.ts:116-128`
   - **proven by —** `phase-machine.test.ts:52` and `:57` (REAL, passing)
5. **`full-legal-path-composes`** — the only path to GATE is the whole ladder
   - **asserts —** chaining `advancePhase`/`nextPhase` with right-kind observations reaches GATE.
   - **covers —** `phase-machine.ts:60-128`
   - **proven by —** `phase-machine.test.ts:63` (REAL, passing)
6. **`path-write-scope-ownership`** — test paths writable only in AUTHOR_TEST; source only in IMPLEMENT; unmatched and both-globbed paths fail closed; Windows separators match
   - **asserts —** the §2 ownership table holds for every phase × path-class combination.
   - **covers —** `phase-machine.ts:159-183`
   - **proven by —** `phase-machine.test.ts:95`, `:104`, `:112`, `:118`, `:125` (REAL, passing)
7. **`tiny-glob-match`** — `**` spans segments, `*` stays within a segment
   - **asserts —** the dependency-free matcher's two wildcard behaviours.
   - **covers —** `phase-machine.ts:193-225`
   - **proven by —** `phase-machine.test.ts:130` (REAL, passing)
8. **`recording-executor-replays-and-rejects-overrun`** — the offline double replays scripted observations, records testIds, and over-run rejects (never a silent green)
   - **asserts —** scripted observations replay in order; exhaustion throws.
   - **covers —** `phase-machine.ts:242-266`
   - **proven by —** `phase-machine.test.ts:140` and `:150` (REAL, passing)
