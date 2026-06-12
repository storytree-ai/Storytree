---
status: accepted
decided: 2026-06-08
---

# ADR-0020: Red-green is enforced spine-side on the owned loop (not by process isolation)

## Status

accepted (2026-06-08) — **resolves** the central open question raised by the
`legacy/Agentic` foundation survey
([`docs/research/agentic-foundation-survey.md`](../research/agentic-foundation-survey.md) §7 OQ1);
**implements** [ADR-0005](0005-orchestration-spine-code-vs-judgment.md)'s spine/leaf split and
[ADR-0007](0007-proof-model.md)'s proof modes against [ADR-0011](0011-own-the-agent-loop-and-context-engineering.md)'s
**single owned loop**; reuses [ADR-0009](0009-concurrency-isolation-id-allocation.md)'s
write-ownership vocabulary. Reaffirms [ADR-0019](0019-library-tier-name-and-defer-dbos.md)'s
**DBOS deferral** for the loop's step recorder.

## Date

2026-06-08

## Context

The V1 (`Agentic`) repo earned a hard-won honesty property: **a unit is never marked proven
without a test observed failing for the right reason first** (red-before-green), and **no single
actor could author the test, implement against it, and sign off the verdict.** The survey
(`agentic-foundation-survey.md`) found that this property in V1 came almost entirely from
**process isolation**:

- separate Rust crates with hard authority walls — `test-builder` writes only `tests/`,
  `build-rust` writes only `src/` and may not touch tests, `test-uat` (a different authority)
  signs the verdict;
- the verdict flows only through a CLI signer (`agentic uat <id> --verdict pass`), pinned to a
  `git rev-parse HEAD` over a clean tree — "a Pass without a commit is forgeable";
- an agent can never self-promote: authoring, implementing, and signing are three authorities.

[ADR-0011](0011-own-the-agent-loop-and-context-engineering.md) collapses the per-node runtime to
**one owned, streamed agent loop** on the Messages API. That is the right call for context
engineering — but it **removes the walls.** A single agent, in one context window, can write a
test and its implementation in the same turn, observe nothing red, and present a green the loop
might mistake for proof. The honesty property is not free anymore; it must be **re-established in
the spine**, because the leaf (the model) now spans both authoring and implementing.

This is the load-bearing risk the survey flagged: *build the phase gate first, not last.* It needs
a decision before the foundation build starts.

## Decision

**Red-before-green is enforced by the deterministic spine ([ADR-0005](0005-orchestration-spine-code-vs-judgment.md))
as a phase machine over the owned loop — re-expressing V1's process isolation as spine-owned
phasing, write-scoping, and executor-owned observation.** Four mechanisms, all code, none
delegated to the model:

1. **A spine-driven phase machine.** The orchestrator advances a unit through ordered phases —
   `AUTHOR_TEST → CONFIRM_RED → IMPLEMENT → CONFIRM_GREEN → GATE` — and **owns the transitions.**
   The leaf agent acts *inside* a phase; it never decides it is done, never advances itself, and
   never sees the next phase's tools until the spine opens them. (This is the V1 `run_sequence` /
   `run_loop` step machine, re-tiered.)

2. **Per-phase write-scoping ([ADR-0009](0009-concurrency-isolation-id-allocation.md) write-ownership).**
   The spine restricts which paths the agent may write in each phase: **test paths only** in
   `AUTHOR_TEST`, **source paths only** in `IMPLEMENT`. A write outside the phase's allowed set is
   a **fail-closed refusal** (the write is rejected, the phase does not advance). This re-creates
   V1's crate authority walls as one agent's *time-sliced* write-ownership — the same invariant
   ("the author of the test is not, at that moment, the author of the code"), enforced by the
   spine instead of by separate processes.

3. **Executor-owned observation — the model never reports the verdict.** The red and the green are
   **observed by a `TestExecutor` the spine runs**, not claimed by the agent. `CONFIRM_RED`
   requires a recorded RED for the *new* test, of the *right kind* (compile-red = missing symbol;
   runtime-red = assertion/panic — never a syntax error or a wrong-test red), and the red
   diagnostic is captured as evidence that "reads the contract back." `CONFIRM_GREEN` requires a
   recorded GREEN for that test **with no regression** of any baseline-green test. These
   observations are the trust anchor; a model sentence asserting "tests pass" is never one.

4. **The verdict is a signed event, and proof is non-authorable.** The `GATE` phase runs the
   prove-it-gate ([ADR-0007](0007-proof-model.md)): it signs the verdict against the **commit SHA
   + a clean `git status --porcelain`**, attributes it to a resolved signer (the V1 signer chain,
   ported), and **appends it to the event store** ([ADR-0017](0017-cross-cutting-knowledge-tier.md)).
   `healthy` / proven is reachable **only** through this signed event — enforcement lives in the
   gate and the loader, never hoped for in the `Status` enum. **An agent can never self-attest**;
   `operator-attested` ([ADR-0007](0007-proof-model.md)) remains a distinct, human-anchored signed
   mode.

**Per-tier collaborator rules ([ADR-0002](0002-work-hierarchy-story-capability-contract.md) /
[ADR-0007](0007-proof-model.md)).** The same phase machine runs at every tier; only the executor's
collaborator-realness rule changes — `contract` = one isolated test (stubs only at a declared
cross-story seam), `capability` = integration test against **real in-story collaborators**,
`story` = an integrated UAT. The phasing discipline is tier-invariant; the proof bar is the tier.

**DBOS stays deferred ([ADR-0019](0019-library-tier-name-and-defer-dbos.md)).** The survey assumed
the phase machine / `run_loop` would be **DBOS-durable steps**. Per the owner (2026-06-08), **DBOS
lands later.** The phase machine and its step records therefore live on **plain Postgres — the
event store** — first: each phase transition and each RED/GREEN observation is an appended event,
so the loop is fully observable and a crashed session **replays best-effort from the log**. There
is no DBOS durable-resume yet; that is an acceptable cost for the single-operator, local-first
posture now, and the upgrade to DBOS-durable steps is a later, additive change (the events already
record what a durable workflow would).

## Consequences

- **The build order is fixed:** the phase machine + write-scoping + executor-owned RED/GREEN come
  **before** any agent is asked to author real units — it is the honesty floor, not a finishing
  touch. (Survey build-order steps 5–7.)
- **The leaf's tool surface becomes phase-dependent.** The owned loop (`packages/agent`) must let
  the spine (`packages/orchestrator`) open/close write capabilities per phase. The model call
  stays behind ADR-0011's thin seam; the *write* path gains a spine-controlled scope check.
- **Evidence moves from git-committed JSONL to the Postgres event store**
  ([ADR-0017](0017-cross-cutting-knowledge-tier.md)) — append-only, atomic, partial-write-tolerant
  — but the **commit-SHA + clean-tree anchor is preserved**: the row's trust still derives from
  *which* tree was attested and *who* signed it, not from where the row lives.
- **Reward-hacking guards port as spine/lint rules** (no shared single-route assertion helper, no
  `assert(true)` / skipped-test equivalents, assert terminal effect not signature shape) — the
  environment-specific V1 plumbing (cargo stdout parsing, rustc-ICE handling) is **not** ported.
- **No new services.** This is phasing discipline over the existing spine + leaf + store, not a new
  subsystem; the V1 `session-orchestrator` apparatus (~3,800 lines of git/worktree/merge ceremony)
  stays left behind per the survey.

## What this does NOT decide

- The **exact phase API** between `packages/orchestrator` and `packages/agent` (how the spine opens
  per-phase write scope) — lands when the packages are built.
- The **`TestExecutor` / `UatExecutor` interface shape** and how a "right-kind red" is classified in
  TS — a build detail (the V1 `UatExecutor` + `StubExecutor` + `RecordingExecutor` traits are the
  reference).
- The **signer persistence + `operator-attested` human-confirmation** question
  ([ADR-0007](0007-proof-model.md) open-q §1) — still open; only that an agent cannot self-attest.
- **When DBOS lands** ([ADR-0019](0019-library-tier-name-and-defer-dbos.md)) — only that the step
  recorder is plain-Postgres first.

## References

- [`docs/research/agentic-foundation-survey.md`](../research/agentic-foundation-survey.md) (the
  survey this resolves — §3 the loop, §4 the TDD discipline, §7 OQ1).
- [ADR-0005](0005-orchestration-spine-code-vs-judgment.md) (spine/leaf),
  [ADR-0007](0007-proof-model.md) (proof modes),
  [ADR-0011](0011-own-the-agent-loop-and-context-engineering.md) (the single owned loop),
  [ADR-0009](0009-concurrency-isolation-id-allocation.md) (write-ownership),
  [ADR-0002](0002-work-hierarchy-story-capability-contract.md) (the tiers),
  [ADR-0017](0017-cross-cutting-knowledge-tier.md) (event store),
  [ADR-0019](0019-library-tier-name-and-defer-dbos.md) (DBOS deferred).
- V1 references: `legacy/Agentic/agents/{test/test-builder,build/build-rust,test/test-uat}/`,
  `legacy/Agentic/crates/agentic-runtime/tests/loop_halt_no_false_pass.rs`,
  `legacy/Agentic/docs/decisions/0014-gate-signing-walk-ancestry.md`.
- Owner decision, 2026-06-08 ("red-green now, DBOS later").
