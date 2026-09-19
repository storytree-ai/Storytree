---
id: "red-green-phase-machine"
tier: capability
story: drive-machinery
title: "The ADR-0020 red-green phase machine"
outcome: "A unit advances through the spine-owned phase ladder only via fail-closed transitions the spine itself legitimizes."
status: proposed
proof_mode: integration-test
depends_on: []
---

# The ADR-0020 red-green phase machine

**Outcome —** A unit advances through the spine-owned phase ladder only via fail-closed transitions the spine itself legitimizes.

> **Proof status (honest) — `proposed`.** Fully covered by a real, passing, offline suite
> (`packages/orchestrator/src/phase-machine.test.ts` — 19/19, run 2026-09-19 after ADR-0580 D1 removed
> the kind-gate cases).
> This greenfield capability has no current signed pass; the standing suite and absence of a
> gate-driven proof do not make it brownfield (ADR-0395).

## Guidance

The honesty floor (ADR-0020 §1–§3). ADR-0011 collapsed the per-node runtime to ONE owned loop,
which removed V1's process-isolation walls (separate crates authored the test, the code, and
signed the verdict); this module re-establishes that property in the deterministic spine. Four
pieces, one file (`packages/orchestrator/src/phase-machine.ts`):

- the **phase ladder** `AUTHOR_TEST → CONFIRM_RED → IMPLEMENT → CONFIRM_GREEN → GATE`
  (`phase-machine.ts:22-27`) — the spine owns every transition; the model never decides it is done;
- **`nextPhase`** (`phase-machine.ts:104-149`), the OBSERVATION gates: `CONFIRM_RED → IMPLEMENT`
  requires an observed red (a green here is the forged/early pass ADR-0020 §3 stops), and ANY red
  advances, whatever its kind — ADR-0580 D1 removed the measured kind gate with the assert-oracle
  guard. Whether each new test's red is an assertion is checked per test, on a route observed per
  test, by [`prove-it-gate`](prove-it-gate.md)'s review (ADR-0573 C5). `CONFIRM_GREEN → GATE`
  requires an observed green; everything else refuses with a reason;
- **`advancePhase`** (`phase-machine.ts:157-169`), the two authoring-complete advances — these
  carry no observation, and `nextPhase` refuses to govern them (the split is itself load-bearing:
  an agent cannot drive an observation gate with an authoring signal or vice versa);
- **`PathWriteScope`** + the dependency-free tiny glob matcher (`phase-machine.ts:200-266`),
  ADR-0020 §2's write-ownership predicate: TEST paths writable only in AUTHOR_TEST, SOURCE paths
  only in IMPLEMENT, everything else denied — a path matching both globs stays test-owned (the
  stricter owner), and the CONFIRM/GATE phases are observe-only;
- the **`TestExecutor` seam** + the `RecordingTestExecutor` offline double
  (`phase-machine.ts:273-307`) — the seam the spine observes red/green through; the double rejects
  on over-run rather than handing back a silent green.

At the first-loss boundary, `TestObservation` exposes optional
`originalProcessResult?: { stdout: string; stderr: string; exitCode: number | null }` when its live
shell implementation actually spawned a command. `exitCode: null` preserves a signal-terminated
child as observed data. The phase machine neither constructs, interprets, persists, nor requires
that detail. Its transition is determined only by `result`; recording doubles and other executors
remain valid without it. The optional
`perTest` report (ADR-0573) rides the same way and never changes what `nextPhase` decides;
[`prove-it-gate`](prove-it-gate.md) is what reviews it.

Enforcement lives elsewhere by design: [`phase-scoped-write-wall`](phase-scoped-write-wall.md)
wires the predicate into the tool surface; [`shell-test-observer`](shell-test-observer.md) is the
live `TestExecutor`; [`prove-it-gate`](prove-it-gate.md) drives the ladder.

## Integration test

**Goal —** The ladder composes end-to-end against real in-story collaborators: the e2e gate walk
(`packages/orchestrator/src/prove-it-gate.e2e.test.ts:160`) advances a unit through every phase
with `advancePhase`/`nextPhase` deciding each transition off REAL observations from a spawned test
process, and the in-file composition test (`phase-machine.test.ts:87`) walks the full legal path
`AUTHOR_TEST → … → GATE` through the same two functions.

## Contracts (10 → 9 surviving; ADR-0580 D1)

1. **`confirm-red-requires-observed-red`** — CONFIRM_RED advances only on an observed red; a green is a forged/early pass
   - **asserts —** red → `IMPLEMENT`; green → `{ ok:false }` with the forged-pass reason.
   - **covers —** `packages/orchestrator/src/phase-machine.ts:106-114`
   - **proven by —** `packages/orchestrator/src/phase-machine.test.ts:15` and `:20` (REAL, passing)
2. **`confirm-green-requires-observed-green`** — CONFIRM_GREEN advances only on an observed green
   - **asserts —** green → `GATE`; red → `{ ok:false }`.
   - **covers —** `phase-machine.ts:116-123`
   - **proven by —** `phase-machine.test.ts:50` and `:55` (REAL, passing)
3. **`authoring-phases-are-not-observation-gates`** — AUTHOR_TEST/IMPLEMENT refuse `nextPhase`; GATE is terminal; a forged transition is refused
   - **asserts —** each returns `{ ok:false }` with a pointed reason.
   - **covers —** `phase-machine.ts:125-141`
   - **proven by —** `phase-machine.test.ts:60`, `:66`, `:70` (REAL, passing)
4. **`advance-phase-authoring-complete-only`** — exactly the two authoring-complete advances are legal
   - **asserts —** `AUTHOR_TEST → CONFIRM_RED` and `IMPLEMENT → CONFIRM_GREEN` succeed; every other source phase refuses.
   - **covers —** `phase-machine.ts:157-169`
   - **proven by —** `phase-machine.test.ts:76` and `:81` (REAL, passing)
5. **`full-legal-path-composes`** — the only path to GATE is the whole ladder
   - **asserts —** chaining `advancePhase`/`nextPhase` with a red then a green observation reaches GATE.
   - **covers —** `phase-machine.ts:104-169`
   - **proven by —** `phase-machine.test.ts:87` (REAL, passing)
6. **`path-write-scope-ownership`** — test paths writable only in AUTHOR_TEST; source only in IMPLEMENT; unmatched and both-globbed paths fail closed; Windows separators match
   - **asserts —** the §2 ownership table holds for every phase × path-class combination.
   - **covers —** `phase-machine.ts:200-224`
   - **proven by —** `phase-machine.test.ts:119`, `:128`, `:136`, `:142`, `:149` (REAL, passing)
7. **`tiny-glob-match`** — `**` spans segments, `*` stays within a segment
   - **asserts —** the dependency-free matcher's two wildcard behaviours.
   - **covers —** `phase-machine.ts:234-266`
   - **proven by —** `phase-machine.test.ts:154` (REAL, passing)
8. **`recording-executor-replays-and-rejects-overrun`** — the offline double replays scripted observations, records testIds, and over-run rejects (never a silent green)
   - **asserts —** scripted observations replay in order; exhaustion throws.
   - **covers —** `phase-machine.ts:283-307`
   - **proven by —** `phase-machine.test.ts:164` and `:174` (REAL, passing)
9. ~~`confirm-red-refuses-a-measured-wrong-kind-red`~~ — *(RETIRED by ADR-0580 D1, 2026-09-19 — the measured kind gate went with the assert-oracle guard, and CONFIRM_RED now advances on any observed red. Struck history, not a live contract: the id is left un-bolded so the contract parser no longer declares it, and its tests were deleted.)* — a MEASURED red of the kind the node did not declare was refused fail-closed at CONFIRM_RED
10. **`optional-original-process-detail-never-changes-a-transition`** — `originalProcessResult` is transport metadata, never a second phase oracle
    - **asserts —** the same red/green observation transitions identically with and without optional `originalProcessResult` stdout, stderr, and exit-code detail, including `exitCode: null`; `RecordingTestExecutor` and non-shell executors construct observations without it.
    - **covers —** `TestObservation`'s optional detail at `packages/orchestrator/src/phase-machine.ts` and `nextPhase`
    - **proven by —** scoped additions to `packages/orchestrator/src/phase-machine.test.ts`, coupled with the ordinary spawned-command integration cases in `shell-test-executor.test.ts` (pending the capability's normal red→green proof)
