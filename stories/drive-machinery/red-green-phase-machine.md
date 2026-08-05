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
> (`packages/orchestrator/src/phase-machine.test.ts` — 23/23, I ran the file 2026-08-06).
> Brownfield `mapped`, not `healthy`: the gate never drove these proofs.

## Guidance

The honesty floor (ADR-0020 §1–§3). ADR-0011 collapsed the per-node runtime to ONE owned loop,
which removed V1's process-isolation walls (separate crates authored the test, the code, and
signed the verdict); this module re-establishes that property in the deterministic spine. Four
pieces, one file (`packages/orchestrator/src/phase-machine.ts`):

- the **phase ladder** `AUTHOR_TEST → CONFIRM_RED → IMPLEMENT → CONFIRM_GREEN → GATE`
  (`phase-machine.ts:20-25`) — the spine owns every transition; the model never decides it is done;
- **`nextPhase`** (`phase-machine.ts:113-167`), the OBSERVATION gates: `CONFIRM_RED → IMPLEMENT`
  requires an observed red (a green here is the forged/early pass ADR-0020 §3 stops) **of the RIGHT
  KIND** — when the node declares an `ExpectedRed` and the observed kind was MEASURED, a red of the
  other kind is refused fail-closed (`wrongKindRefusal`, `:170-212`). `editsExisting` (ADR-0057 §3 C)
  declares `assertion`; everything else — net-new, and ADR-0098 R2 `refactorForTests` — declares
  `structural`. The kind gate arms ONLY on `kindBasis: "oracle-count"` (a kind MEASURED from the
  assert-oracle count): a kind INFERRED from output text never refuses, because
  `defaultClassifyKind` silently mis-read Node's own `Cannot find module` for as long as nothing
  consumed its answer, and refusing real work on that heuristic would trade a quiet wrong advance for
  a loud wrong refusal. `CONFIRM_GREEN → GATE` requires an observed green; everything else refuses
  with a reason;
- **`advancePhase`** (`phase-machine.ts:220-232`), the two authoring-complete advances — these
  carry no observation, and `nextPhase` refuses to govern them (the split is itself load-bearing:
  an agent cannot drive an observation gate with an authoring signal or vice versa);
- **`PathWriteScope`** + the dependency-free tiny glob matcher (`phase-machine.ts:243-329`),
  ADR-0020 §2's write-ownership predicate: TEST paths writable only in AUTHOR_TEST, SOURCE paths
  only in IMPLEMENT, everything else denied — a path matching both globs stays test-owned (the
  stricter owner), and the CONFIRM/GATE phases are observe-only;
- the **`TestExecutor` seam** + the `RecordingTestExecutor` offline double
  (`phase-machine.ts:336-370`) — the seam the spine observes red/green through; the double rejects
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

## Contracts (9)

1. **`confirm-red-requires-observed-red`** — CONFIRM_RED advances only on an observed red; a green is a forged/early pass
   - **asserts —** red → `IMPLEMENT`; green → `{ ok:false }` with the forged-pass reason.
   - **covers —** `packages/orchestrator/src/phase-machine.ts:119-132`
   - **proven by —** `packages/orchestrator/src/phase-machine.test.ts:15` and `:20` (REAL, passing)
2. **`confirm-green-requires-observed-green`** — CONFIRM_GREEN advances only on an observed green
   - **asserts —** green → `GATE`; red → `{ ok:false }`.
   - **covers —** `phase-machine.ts:134-141`
   - **proven by —** `phase-machine.test.ts:102` and `:107` (REAL, passing)
3. **`authoring-phases-are-not-observation-gates`** — AUTHOR_TEST/IMPLEMENT refuse `nextPhase`; GATE is terminal; a forged transition is refused
   - **asserts —** each returns `{ ok:false }` with a pointed reason.
   - **covers —** `phase-machine.ts:143-159`
   - **proven by —** `phase-machine.test.ts:112`, `:118`, `:122` (REAL, passing)
4. **`advance-phase-authoring-complete-only`** — exactly the two authoring-complete advances are legal
   - **asserts —** `AUTHOR_TEST → CONFIRM_RED` and `IMPLEMENT → CONFIRM_GREEN` succeed; every other source phase refuses.
   - **covers —** `phase-machine.ts:220-232`
   - **proven by —** `phase-machine.test.ts:128` and `:133` (REAL, passing)
5. **`full-legal-path-composes`** — the only path to GATE is the whole ladder
   - **asserts —** chaining `advancePhase`/`nextPhase` with right-kind observations reaches GATE.
   - **covers —** `phase-machine.ts:113-232`
   - **proven by —** `phase-machine.test.ts:139` (REAL, passing)
6. **`path-write-scope-ownership`** — test paths writable only in AUTHOR_TEST; source only in IMPLEMENT; unmatched and both-globbed paths fail closed; Windows separators match
   - **asserts —** the §2 ownership table holds for every phase × path-class combination.
   - **covers —** `phase-machine.ts:263-287`
   - **proven by —** `phase-machine.test.ts:171`, `:180`, `:188`, `:194`, `:201` (REAL, passing)
7. **`tiny-glob-match`** — `**` spans segments, `*` stays within a segment
   - **asserts —** the dependency-free matcher's two wildcard behaviours.
   - **covers —** `phase-machine.ts:297-329`
   - **proven by —** `phase-machine.test.ts:206` (REAL, passing)
8. **`recording-executor-replays-and-rejects-overrun`** — the offline double replays scripted observations, records testIds, and over-run rejects (never a silent green)
   - **asserts —** scripted observations replay in order; exhaustion throws.
   - **covers —** `phase-machine.ts:346-370`
   - **proven by —** `phase-machine.test.ts:216` and `:226` (REAL, passing)
9. **`confirm-red-refuses-a-measured-wrong-kind-red`** — a red is evidence only if it is the red the node declared: a MEASURED red of the other kind is refused fail-closed, and a kind merely inferred from output text never refuses
   - **asserts —** a measured `compile` red satisfies a net-new node and is refused for `editsExisting`, and the mirror for a measured `runtime` red; `kindBasis: "output-text"` advances whatever is declared; no declared `ExpectedRed`, or no `kind` at all, leaves the prior behaviour exactly; a GREEN at CONFIRM_RED is still the forged pass whatever is declared.
   - **covers —** `phase-machine.ts:127-131`, `:170-212`
   - **proven by —** `phase-machine.test.ts:42`, `:57`, `:68`, `:83`, `:93` (REAL, passing)
