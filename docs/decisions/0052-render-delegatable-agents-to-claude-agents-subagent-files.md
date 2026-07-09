---
status: accepted
decided: 2026-06-14
amends: [51]
---
# ADR-0052: Render delegatable agents to harness-native subagent files

## Status

accepted (flipped from proposed 2026-06-21 under [ADR-0084](0084-agents-may-flip-an-adr-green.md)) —
owner steer 2026-06-14: after ADR-0051 wired the agent renderer, the question was whether the
harness's *spawned subagents* are the authored agents. They were not: ADR-0051 renders the
`session-orchestrator` into CLAUDE.md and `red-builder` / `green-builder` into the SDK leaf, but a
Claude Code session spawning a subagent (the Agent/Task tool) still got a generic agent. The owner
accepted this in conversation 2026-06-21 (recorded under [ADR-0084](0084-agents-may-flip-an-adr-green.md));
the harness-native subagent rendering is built and enforced by `check:agents`.

**Amends** [ADR-0051](0051-the-agent-renderer-shapes-claude-md-and-the-leaf-prompt-from.md) — it built
the one renderer and listed "one population, many rendered surfaces"; this adds one more surface
(`.claude/agents/*.md`) on top of the same renderer, for the harness-native delegation path.

**Correction ([ADR-0178](0178-render-delegatable-library-agents-to-native-cursor-subagent.md), per
[ADR-0139](0139-the-accepted-adr-set-carries-no-stale-prose-correct-in-place.md)):** this ADR's
one-authored-population/generated-surface decision now applies to both supported project-subagent
directories. Claude Code consumes `.claude/agents/*.md`; Cursor's native contract consumes
`.cursor/agents/*.md` while its IDE may also read the Claude directory as a compatibility source.
Both directories are generated and drift-gated from the same delegatable Library agents.

**Correction ([ADR-0156](0156-subagent-prompts-are-essentials-only-the-cli-serves-ceremony.md), per
[ADR-0139](0139-the-accepted-adr-set-carries-no-stale-prose-correct-in-place.md)):** this ADR's
DECISION stands in full — delegatable agents are still generated, drift-gated, harness-native
spawnable files derived from the same renderer. Overtaken is only
Decision 1's render-function *sub-choice*: the agent-file surface (and `storytree agents <name>`) no
longer render the FULL inline body (`renderAgentFile` wrapping `renderAgentPrompt`). ADR-0156
re-decides it to an **essentials-only** view (the agent's own prose + a floor checklist + an escape
hatch + per-step doors that pull ceremony/principle bodies from the CLI just-in-time), completing
ADR-0053 over this surface. Decision 1 is corrected out in place below.

## Context

ADR-0051 deliberately favours the harness-AGNOSTIC, pull-based model (ADR-0030): context is rendered
into CLAUDE.md (the main session) and into the SDK leaf, and any role is *pullable* via
`storytree agents <name>`. But the pull model alone does not register `story-author` as a native
project subagent. Claude Code binds project subagents from `.claude/agents/<id>.md`; Cursor's native
project contract is `.cursor/agents/<id>.md` (ADR-0178). Without generated project files the authored
"story-writer" roles (story-author, the curators, the investigators) could be *printed* but not
delegated to by the corresponding harness. That is the gap this decision closes, complementary to
(not a replacement for) ADR-0051's surfaces.

## Decision

1. **Harness-native project files are generated surfaces of the SAME renderer.** `renderAgentFile`
   wraps the essentials renderer in Claude Code subagent frontmatter; `renderCursorAgentFile` wraps
   the same essentials in Cursor-native frontmatter. Both carry a generated marker.
   *(The original wording said `renderAgentFile` wraps `renderAgentPrompt` — the FULL-body inline path —
   with "no new render logic"; that render-function sub-choice is re-decided by
   [ADR-0156](0156-subagent-prompts-are-essentials-only-the-cli-serves-ceremony.md) (per
   [ADR-0139](0139-the-accepted-adr-set-carries-no-stale-prose-correct-in-place.md)): project-subagent
   surfaces now render the ESSENTIALS view, not the full inline. The "generated surfaces of the same
   renderer" decision — the load-bearing point here — is untouched.)*

2. **Only the DELEGATABLE agents render here.** The three with a dedicated runtime surface are
   excluded: `session-orchestrator` (→ CLAUDE.md, ADR-0051 §3) and `red-builder` / `green-builder`
   (→ the SDK leaf, §4). Every other Library agent selected by `delegatableAgentIds` becomes a
   spawnable project subagent; the generated files, not a hand-maintained list in this ADR, are the
   current roster.

3. **Generated, drift-gated, like CLAUDE.md.** `pnpm build:agents` regenerates both directories from
   the SEED corpus (offline, CI-safe); `pnpm check:agents` fails on stale / missing / orphaned files
   in either target and joins `pnpm gate` + a CI step, mirroring `check:claude`. Both directories are
   fully generated (write prunes orphans). A dangling agent ref fails the build closed. The repository
   manifest allow-lists both generated roots.

4. **Emit only explicit harness policy.** Claude `tools` frontmatter is omitted (the subagent inherits
   the full surface; the prose Tools section carries the guidance). Cursor files declare
   `model: inherit`; `readonly` and `is_background` remain omitted until structured Library policy
   can justify those execution semantics. Dedicated-surface agents remain excluded.

## Consequences

- Good: Claude and Cursor sessions can delegate to the same authored story-writers. One source (the
  Library `agent` tier) feeds CLAUDE.md, the SDK leaf, `.claude/agents`, and `.cursor/agents`; none are
  hand-maintained.
- Cost / sharp edges: multiple generated surfaces must stay green (`check:agents` in the gate + CI).
  The files render from the SEED, so live `--pg` agent edits don't show until a DB→seed export runs (the
  gap CLAUDE.md already names). Neither generated directory may be hand-edited (the marker + drift
  gate enforce this). These harness-native surfaces sit alongside ADR-0030's harness-agnostic pull
  model — a deliberate, additive convenience, not a reversal.

## References

- [ADR-0051](0051-the-agent-renderer-shapes-claude-md-and-the-leaf-prompt-from.md) — the agent renderer (amended).
- [ADR-0178](0178-render-delegatable-library-agents-to-native-cursor-subagent.md) — the Cursor-native
  generated surface (amends this decision).
- [ADR-0029](0029-agents-as-library-artifact-category.md) — the `agent` knowledge kind.
- [ADR-0030](0030-all-in-on-claude-agent-sdk.md) — harness-agnostic, pull-based context.
- `packages/library/src/store/render-agent.ts`, `packages/cli/src/build-agents.ts`,
  `.claude/agents/`, `.cursor/agents/`.
