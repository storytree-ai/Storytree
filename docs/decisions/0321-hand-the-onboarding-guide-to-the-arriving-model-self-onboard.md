---
status: accepted
decided: 2026-08-08
arc: onboard-non-claude-models-onto-storytree-arc
---
# ADR-0321: Hand the onboarding guide to the arriving model: self-onboarding of model and harness

## Status

accepted (2026-08-08) — decided/directed by the owner in conversation on 2026-08-08. Design-time alignment IS the ratification (ADR-0110); no second end-of-flow ask.

## Context

The `onboard-non-claude-models-onto-storytree-arc` landed Kimi K3 as a working outer-loop driver
through OpenCode (PR #1206), added the OpenCode subagent projection so the harness reaches parity
with Claude Code and Codex (PR #1210), and wrote `docs/model-onboarding.md` as the playbook. As
written, though, the guide was addressed to a human operator — "read this when someone says *can
we use \<model\> here?*" — and the arc's closing condition was a performed trial: *a second model
onboarded by following the guide alone, with no rediscovery and no edits to the guide's procedure*.

Two problems with that shape. First, the audience is wrong for how the guide will actually be used:
the cheapest way to follow a machine-executable playbook is to hand it to the arriving model
itself — the model is already sitting inside the harness being configured, can run every check, and
only ever needs the human for the credential value and privileged installs. Second, the closing
trial spends a real onboarding (with a real second model's spend and setup) to prove something the
guide's construction already argues: if every step is a command the reader can run and the reader is
a model, the guide either works or fails loudly at the step it names.

## Decision

1. **The guide is addressed to the arriving model.** `docs/model-onboarding.md` is the briefing a
   model receives when someone asks "can we use you here?" The reader does the work: verify its own
   capability bar, identify its harness's conventions, configure them, prove tool-calling against
   this repo, run the gate, land the change through the ordinary ceremony, and record the landing
   on the sponsoring arc.
2. **Onboarding covers the harness the model sits within, not just the model.** A new harness needs:
   its root-instructions convention pointed at `AGENTS.md` (ADR-0291 renders it harness-neutral for
   exactly this), a committed secret-free model pin, a credential in the harness's own store or
   `~/.storytree/secrets.json` (never the repo), and — **if the harness has a native subagent
   directory** — a `build:agents` render target: one renderer function beside
   `renderOpencodeAgentFile` in `packages/library/src/store/render-agent.ts` plus one `targets`
   entry in `packages/cli/src/build-agents.ts`, with **no `model` key** so subagents inherit the
   session model. Hand-written agent files in the repo are refused by construction: `check:agents`
   prunes orphans. A harness with no subagent surface needs none of this — `AGENTS.md` alone
   suffices.
3. **The human's irreducible role is three acts:** hand over the API key value (or point at its
   GCP Secret Manager name), run anything needing a privileged install, and review what lands.
   The model never types a secret into the repo and never invents one it was not given.
4. **The performed-second-onboarding trial is retired as the arc's closing gate.** The arc closes
   on the guide being fit for this use — model-facing, self-serve, with its worked example and
   gotchas intact. A second model arriving later is now an *exercise* of the path, not a gate on
   it; whatever it teaches lands as guide edits through the ordinary edit-first flow.
5. **The inner loop is untouched.** A `PhaseAuthor` leaf for any non-Claude model remains a
   separable, ADR-gated decision on the ADR-0232 template — never something a config change or a
   self-onboarding run does quietly.

## Consequences

A new model's onboarding cost is the model's own working time plus one human credential handoff —
the hour the arc asked for, now spent by the cheap party. The guide carries the discriminating
details (registry-before-hand-rolling, provider-id exactness, the Windows ARM64 TUI trap) because
they were earned in the Kimi K3 run; a self-onboarding model inherits them instead of rediscovering
them. The risk accepted: a model may misjudge its own capability bar — the §4 proof step (a real,
observed tool call against this repo) and the ordinary gate/PR review are the fences, and this ADR
deliberately keeps self-attestation out of the loop-closing criteria. The arc
`onboard-non-claude-models-onto-storytree-arc` closes on this decision plus the landed guide; the
second-model exercise, whenever it happens, is its own increment on whatever arc sponsors it.

## References

- `docs/model-onboarding.md` — the guide this decision re-points at its real reader.
- The arc: `onboard-non-claude-models-onto-storytree-arc` (increments inc-02 / PR #1206,
  `opencode-harness-parity` / PR #1210, `kimi-k3-drives-a-real-unit` / PR #1210).
- [ADR-0030](0030-all-in-on-claude-agent-sdk.md) — the human owns the outer loop; this decision
  changes who performs onboarding work, never who owns the loop a model drives.
- [ADR-0232](0232-add-a-chatgpt-subscription-codex-prove-it-leaf.md) — the template an inner-loop
  `PhaseAuthor` leaf decision still follows.
- [ADR-0291](0291-render-the-canonical-session-orchestrator-into-codex-root-gu.md) — the
  harness-neutral `AGENTS.md` projection that makes the outer loop nearly free.
- ADR-0177 / ADR-0198 (both superseded) — the expensive inner-loop lesson this path exists to
  avoid repeating.
