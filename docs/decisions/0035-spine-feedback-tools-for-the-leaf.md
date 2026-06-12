---
status: accepted
decided: 2026-06-11
amends: [30]
---

# ADR-0035: The spine lends the leaf its oracle — bounded feedback tools (option A)

## Status

accepted (2026-06-11, owner: "proceed with A") — **amends [ADR-0030](0030-all-in-on-claude-agent-sdk.md)**
(the leaf brief's "you cannot run tests" becomes "you can run the registered command as feedback");
**reaffirms [ADR-0020](0020-red-green-enforcement-on-the-owned-loop.md)** (proof stays non-authorable,
spine-observed, signed out-of-band); realizes ADR-0030 §2's "one tool core, two adapters" seam
(in-process MCP) for the first time.

*Numbering note:* checked `git log --all` across all remote branches on 2026-06-11 — 0034 is taken
on a worktree branch (`0034-process-artifacts-ways-of-working.md`), nothing above it; the live-DB
ref check is pending (instance stopped) per the ADR-0027-collision lesson. *Reconciled 2026-06-13:*
the live-DB ref check ran (instance up) — zero live library docs reference ADR-0035; no parallel
claim.

## Date

2026-06-11

## Context

The live leaf ([ADR-0030](0030-all-in-on-claude-agent-sdk.md)) authored **blind**: during
IMPLEMENT its only oracle was its own reading of the test it must satisfy but cannot run. The
gate's single CONFIRM_GREEN is a one-bit, one-shot answer delivered after the leaf has stopped —
every dollar spent before that bit arrives is at risk. Observed 2026-06-11 (presence-store, run
`real-mq8ms0yb`): a one-shot blind IMPLEMENT failed CONFIRM_GREEN honestly, $1.13 destroyed with
the worktree; a re-run with a sharpened brief passed at $0.83. The typecheck wall (registry
`real.typecheck`) closed the type-error sub-case; runtime-behavioral mismatch remained a coin flip.

The load-bearing observation: **ADR-0020 never trusted the leaf's epistemic state.** The trust
base is the spine's own `ShellTestExecutor` observations, the phase walls, and the signed verdict
over a clean committed tree. The leaf's *blindness* was never an honesty mechanism — it was pure
cost. Options weighed (design session 2026-06-11): (A) spine-provided feedback tool; (B) SDK
subagents inside the leaf (rejected for now: without a runner, a critic is a second blind read;
also collides with the inherited *no agent-spawns-agent* rule, which would need its own ADR);
(C) a free interactive session as the leaf (rejected: Bash dissolves the write wall, and with no
phase wall the test could be edited between CONFIRM_RED and CONFIRM_GREEN — red and green observed
against different contracts); (D) spine-looped re-IMPLEMENT slices on red (not taken: each retry
is a cold, full-price slice; and once (A) exists, leaf-green-but-spine-red signals divergence — a
bug to surface, not retry through).

## Decision

**Expose the registered proof command (and, on install-bearing nodes, the registered typecheck
command) to the leaf as bounded, fixed-argument feedback tools, in-process via the Agent SDK's
MCP server (`mcp__spine__run_proof`, `mcp__spine__run_typecheck`). The leaf iterates
write→run→fix→stop. The attested observations stay exactly where they were: the spine's own
out-of-band CONFIRM_RED / CONFIRM_GREEN runs, after the leaf has stopped.**

Mechanics, all fail-closed:

1. **A doorbell, not a shell.** Each tool spawns a FIXED command the spine registered
   (`feedbackCommandsFor` in `resolve-prove-spec.ts`); the leaf controls zero arguments. Bash
   stays out of the tool surface; the PreToolUse write wall is untouched.
2. **One oracle, two consumers.** The feedback runner and the CONFIRM observations spawn through
   the SAME `runShellCommand` (same env scrub, same exit-code-as-data) — the leaf iterates against
   exactly what will be observed.
3. **Bounded.** Default 5 feedback runs per authoring slice (shared across commands); past the
   budget the tool refuses without spawning. Every run is recorded
   (`ClaudeAgentAuthor.feedbackRuns`) and surfaced in the build envelope.
4. **Env honesty widened.** The leaf authors the test file the proof command executes, and the
   tool returns that command's OUTPUT to the model — so the child env scrub grows from `NODE_TEST*`
   (the forged-green fix) to secret-shaped names (TOKEN/SECRET/PASSWORD/CREDENTIAL/API_KEY/
   ACCESS_KEY): a test that prints `process.env` finds no credentials. Applies to the CONFIRM
   runs too (symmetry; they never needed credentials).
5. **Both authoring phases get the tool.** In AUTHOR_TEST the leaf confirms its test fails for
   the RIGHT reason (a missing-implementation/assertion red, not a syntax red — directly serving
   ADR-0020 §3's right-kind red). In IMPLEMENT it iterates to green before stopping.
6. **The brittle-test escape.** The brief now instructs: if the leaf concludes the frozen test is
   itself wrong, it stops and says so instead of contorting the implementation — converting a
   blind expensive fail into a cheap diagnosed one.
7. **Pivot-out preserved.** The SDK stays imported in exactly one file (`sdk-author.ts`); the
   runner is injected as a plain function (`FeedbackCommand.run`), mirroring `isWriteAllowed`. The
   owned-loop fallback can grow the same tool natively without touching the seam.

## What does NOT change

- **Proof is non-authorable.** The leaf seeing a green through `run_proof` changes nothing the
  gate consumes; a leaf sentence "tests pass" was never an input and still isn't. The verdict
  derives only from the spine's own runs + the signed GATE event over a clean committed tree.
- **Halted-is-never-a-pass**, phase walls, spine-side commits, promotion + typecheck/regression
  walls (ADR-0031) — all untouched.
- Dry-run mode: the scripted owned loop stays blind (it never needed eyes).

## Consequences

- The leaf brief and system prompt change: "you cannot run tests" → "you can run the registered
  command via `run_proof` (bounded; feedback only, never the verdict); you cannot run shell
  commands."
- Expected cost shape: fewer full-slice retries (the presence-store node cost $1.96 across two
  runs; an iterating leaf should land in one). Per-slice ceilings (`maxTurns` 16, `maxBudgetUsd`
  1) still bound the loop.
- A leaf-green-but-spine-red divergence is now a **bug signal** (env/cwd drift between two spawns
  of the same command), not a retry case.
- **Pre-existing risk, noted not widened:** the leaf-authored test file already executes with the
  spine's privileges at CONFIRM time; the feedback tool lets the leaf trigger it repeatedly and
  read its output. The secret scrub (§4) is the mitigation; a tighter allowlist env or sandboxed
  runner is named-deferred work.
- Subagents (option B) stay deferred; if pursued, they need an ADR amending the inherited
  *no agent-spawns-agent* rule — noting the SDK's hooks DO fire inside subagents (verified against
  the Agent SDK docs 2026-06-11), so the write wall would propagate.

## References

- [ADR-0020](0020-red-green-enforcement-on-the-owned-loop.md) (the honesty floor),
  [ADR-0030](0030-all-in-on-claude-agent-sdk.md) (the SDK leaf + the seam this realizes),
  [ADR-0031](0031-real-pass-promotion-and-worktree-deps.md) (promotion + typecheck wall).
- Claude Agent SDK docs: custom tools (`tool()` + `createSdkMcpServer()` + `mcpServers`), hooks
  (PreToolUse fires for subagent tool calls), subagents (`agents` option) — verified 2026-06-11.
- Observed failure: presence-store `real-mq8ms0yb` (2026-06-11, $1.13 honest fail-closed at
  CONFIRM_GREEN); second run passed $0.83.
- Owner decision, design session 2026-06-11 ("proceed with A").
