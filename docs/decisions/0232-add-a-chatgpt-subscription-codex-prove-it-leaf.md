---
status: accepted
decided: 2026-07-23
supersedes: [198]
amends: [30, 130]
load_bearing: true
---
# ADR-0232: Add a ChatGPT-subscription Codex prove-it leaf

## Status

accepted (2026-07-23) — decided/directed by the owner in conversation on 2026-07-23. Design-time alignment IS the ratification (ADR-0110); no second end-of-flow ask.

**Supersedes [ADR-0198](0198-retire-the-cursor-leaf-claude-agent-sdk-is-the-only-live-pro.md)** —
its Cursor retirement and metered-API ban stand, but its Claude-only live-leaf conclusion is
re-decided. ADR-0198 is flipped to `superseded`.

**Amends [ADR-0030](0030-all-in-on-claude-agent-sdk.md)** — a second capable rented harness enters
through the existing runtime-neutral `PhaseAuthor` seam; the deterministic spine and owned-loop
pivot remain unchanged.

**Amends [ADR-0130](0130-remove-the-inner-loop-usd-budget-ceilings-subscription-funde.md)** — the
no-USD-ceiling default extends to Codex subscription runs, but Codex never treats API/list-price
estimates as spend and refuses the Claude-specific `--budget` control.

## Context

Production live/real builds are hard-wired to `ClaudeAgentAuthor` on the Claude Agent SDK.
`PhaseAuthor` already separates that rented harness from the prove-it spine: the leaf only authors
inside `AUTHOR_TEST` and `IMPLEMENT`; the spine independently observes RED/GREEN, signs the verdict,
and remains the sole proof authority.

ADR-0198 deliberately retired the metered Cursor SDK path after unexpected API charges and required
an explicit funding decision before another live harness could enter. That funding path now exists:
local Codex can reuse ChatGPT-managed authentication and draw from the owner's Codex/ChatGPT
subscription quota. The owner directed that this be admitted with `gpt-5.6-terra` as the default
Codex inner-loop model. This is not permission to use the OpenAI Responses API or an OpenAI Platform
API key.

The security asymmetry is material. Claude's leaf exposes a deliberately small tool set and applies
a `PreToolUse` write predicate to `Write`/`Edit`; Codex has shell, unified exec, and `apply_patch`.
Model-visible instructions or a post-run diff cannot be the write boundary. Admission therefore
requires a fail-closed authentication preflight and two independent write walls: the Codex process
runs only against a disposable replica in the OS workspace sandbox, never the real build workspace,
and a vetted `PreToolUse` policy denies shell and checks every replica patch/write target against
the current phase. Only the spine can promote one exact replica file into the real workspace.

## Decision

1. **Admit `CodexPhaseAuthor` as an opt-in live leaf.** `node build` and `story build` accept
   `--runtime claude|codex`. Claude remains the compatibility default. Runtime selection changes
   only the author behind `PhaseAuthor`; dry runs and the deterministic spine do not change.

2. **Use the official local Codex CLI/SDK distribution, not the Responses API.** The leaf pins the
   official Codex package, starts one non-interactive Codex turn per authoring phase, and selects
   `gpt-5.6-terra` unless the operator explicitly supplies another Codex model.

3. **Prove subscription authentication before every slice.** The leaf runs the official
   `codex login status` preflight in an environment with `OPENAI_API_KEY`, `CODEX_API_KEY`, and
   `CODEX_ACCESS_TOKEN` removed. Only an explicit ChatGPT-managed login is accepted. API-key login,
   missing/ambiguous status, expired auth, and subscription quota exhaustion fail the slice
   honestly. There is no API-key or metered fallback.

4. **Enforce phase ownership before writes land.** Each Codex turn ignores user runtime config,
   runs without network, and receives a disposable copy of the build workspace inside Codex's
   `workspace-write` OS sandbox. The real workspace is outside the Codex process boundary. A vetted
   `PreToolUse` hook independently denies shell/unified exec, subagents, MCP tools, and unknown local
   tools; `apply_patch`/write calls in the replica proceed only when every normalized path passes the
   current phase predicate. After the turn, the spine requires a reported change at the one exact
   test/source target, rechecks the phase predicate, copies only that file into the real workspace,
   and discards the replica. A hook-bypass write can therefore damage only a disposable copy and can
   never land by itself.

5. **Keep proof and feedback out of the leaf's authority.** Codex receives the same rendered
   red-builder/green-builder roles, but no shell-based proof tool. The spine still runs the
   registered command out of band at `CONFIRM_RED` and `CONFIRM_GREEN`; a Codex claim, command
   result, or final response never moves the phase machine or signs green.

6. **Normalize accounting without inventing spend.** Codex records the runtime, one phase turn,
   and the CLI's input/cache-write/cache-read/output/reasoning token usage. It records no USD cost.
   Claude accounting remains compatible. `--runtime codex --budget` is refused because the
   existing USD control is Claude-SDK-specific and a list-price estimate is not subscription spend.

7. **Keep Cursor retired.** No `@cursor/sdk`, `CURSOR_API_KEY`, or Cursor live leaf returns. Cursor
   IDE agent files remain an outer-loop convenience under ADR-0178.

## Consequences

**Good.**

- Subscription exhaustion in one provider no longer removes the live prove-it path.
- The `PhaseAuthor` seam proves its intended pivot value without moving any proof authority into a
  model harness.
- API-key billing is excluded structurally: no accepted auth preflight, no inherited key variables,
  and no fallback branch.
- Codex shell and patch capabilities cannot write the real build workspace; only the spine's exact,
  phase-checked replica promotion can land a file.

**Cost / watch.**

- The official Codex package and its platform binary become an agent-package dependency.
- Codex is intentionally blinder than a normal interactive session: shell, MCP, subagents, network,
  and arbitrary workspace writes are denied. A capability that genuinely needs one of those paths
  must earn a separately proved, narrowly bounded adapter.
- Codex subscription quota and local login availability are external runtime dependencies. Their
  failure halts authoring but cannot forge a proof or spill into API spend.
- The existing `--model` flag is runtime-relative. Callers selecting Codex must supply a Codex model
  slug; post-green Claude curation keeps its own Claude model selection and never receives that
  Codex slug.

## References

- [ADR-0020](0020-prove-it-gate-build-the-spine-side-red-green-machine.md)
- [ADR-0030](0030-all-in-on-claude-agent-sdk.md)
- [ADR-0110](0110-collapse-the-redundant-end-of-flow-adr-ratification-record-th.md)
- [ADR-0130](0130-remove-the-inner-loop-usd-budget-ceilings-subscription-funde.md)
- [ADR-0139](0139-the-accepted-adr-set-carries-no-stale-prose-correct-in-place.md)
- [ADR-0178](0178-render-delegatable-library-agents-to-native-cursor-subagent.md)
- [ADR-0198](0198-retire-the-cursor-leaf-claude-agent-sdk-is-the-only-live-pro.md)
- `packages/agent/src/phase-author.ts`
- `packages/agent/src/codex-author.ts`
- `packages/orchestrator/src/resolve-prove-spec.ts`
