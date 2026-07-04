---
status: accepted
decided: 2026-06-14
amends: [51]
---
# ADR-0052: Render delegatable agents to .claude/agents subagent files

## Status

accepted (flipped from proposed 2026-06-21 under [ADR-0084](0084-agents-may-flip-an-adr-green.md)) —
owner steer 2026-06-14: after ADR-0051 wired the agent renderer, the question was whether the
harness's *spawned subagents* are the authored agents. They were not: ADR-0051 renders the
`session-orchestrator` into CLAUDE.md and `red-builder` / `green-builder` into the SDK leaf, but a
Claude Code session spawning a subagent (the Agent/Task tool) still got a generic agent. The owner
accepted this in conversation 2026-06-21 (recorded under [ADR-0084](0084-agents-may-flip-an-adr-green.md));
the `.claude/agents/*.md` rendering is built and enforced by `check:agents`.

**Amends** [ADR-0051](0051-the-agent-renderer-shapes-claude-md-and-the-leaf-prompt-from.md) — it built
the one renderer and listed "one population, many rendered surfaces"; this adds one more surface
(`.claude/agents/*.md`) on top of the same renderer, for the harness-native delegation path.

**Correction ([ADR-0156](0156-subagent-prompts-are-essentials-only-the-cli-serves-ceremony.md), per
[ADR-0139](0139-the-accepted-adr-set-carries-no-stale-prose-correct-in-place.md)):** this ADR's
DECISION stands in full — delegatable agents are still generated, drift-gated, harness-native
`.claude/agents/*.md` spawnable files, a third surface of the same renderer. Overtaken is only
Decision 1's render-function *sub-choice*: the agent-file surface (and `storytree agents <name>`) no
longer render the FULL inline body (`renderAgentFile` wrapping `renderAgentPrompt`). ADR-0156
re-decides it to an **essentials-only** view (the agent's own prose + a floor checklist + an escape
hatch + per-step doors that pull ceremony/principle bodies from the CLI just-in-time), completing
ADR-0053 over this surface. Decision 1 is corrected out in place below.

## Context

ADR-0051 deliberately favours the harness-AGNOSTIC, pull-based model (ADR-0030): context is rendered
into CLAUDE.md (the main session) and into the SDK leaf, and any role is *pullable* via
`storytree agents <name>`. But the pull model does not make Claude Code instantiate `story-author` as
a subagent — the harness only auto-binds an agent type from a `.claude/agents/<id>.md` file. So the
authored "story-writer" roles (story-author, the curators, the investigators) could be *printed* but
the harness would never delegate to them; a spawned subagent was still generic. That is the gap the
owner asked to close, complementary to (not a replacement for) ADR-0051's surfaces.

## Decision

1. **`.claude/agents/<id>.md` is a third generated surface of the SAME renderer.** `renderAgentFile`
   wraps the renderer in Claude Code subagent frontmatter (`name` / `description`) + a generated
   marker + the assembled prompt.
   *(The original wording said `renderAgentFile` wraps `renderAgentPrompt` — the FULL-body inline path —
   with "no new render logic"; that render-function sub-choice is re-decided by
   [ADR-0156](0156-subagent-prompts-are-essentials-only-the-cli-serves-ceremony.md) (per
   [ADR-0139](0139-the-accepted-adr-set-carries-no-stale-prose-correct-in-place.md)): the surface now
   renders the ESSENTIALS view, not the full inline. The "third generated surface of the same renderer"
   decision — the load-bearing point here — is untouched.)*

2. **Only the DELEGATABLE agents render here.** The three with a dedicated runtime surface are
   excluded: `session-orchestrator` (→ CLAUDE.md, ADR-0051 §3) and `red-builder` / `green-builder`
   (→ the SDK leaf, §4). The rest — `story-author`, `guidance-curator`, `librarian-curator`,
   `corpus-investigator`, `friction-analyst`, `graduation-synthesist` — become spawnable subagents.

3. **Generated, drift-gated, like CLAUDE.md.** `pnpm build:agents` regenerates the files from the
   SEED corpus (offline, CI-safe); `pnpm check:agents` fails on stale / missing / orphaned files and
   joins `pnpm gate` + a CI step, mirroring `check:claude`. The directory is fully generated (write
   prunes orphans). A dangling agent ref fails the build closed. No `repo-manifest.json` change —
   `.claude` is already an allow-listed root dir.

4. **`tools` frontmatter is omitted** (the subagent inherits the full surface; the prose Tools section
   carries the guidance). Mapping the prose grant to a structured allow-list, and whether to also
   emit the dedicated-surface agents, are deferred refinements.

## Consequences

- Good: a Claude Code session can now delegate to the authored story-writers — the original ask. One
  source (the library `agent` tier), now three generated surfaces (CLAUDE.md, SDK leaf,
  `.claude/agents`), none hand-maintained.
- Cost / sharp edges: another generated surface to keep green (`check:agents` in the gate + CI). The
  files render from the SEED, so live `--pg` agent edits don't show until a DB→seed export runs (the
  gap CLAUDE.md already names). `.claude/agents/*.md` must not be hand-edited (the marker + drift gate
  enforce this). This is a harness-NATIVE (Claude-Code-specific) surface alongside ADR-0030's
  harness-agnostic pull model — a deliberate, additive convenience, not a reversal.

## References

- [ADR-0051](0051-the-agent-renderer-shapes-claude-md-and-the-leaf-prompt-from.md) — the agent renderer (amended).
- [ADR-0029](0029-agents-as-library-artifact-category.md) — the `agent` knowledge kind.
- [ADR-0030](0030-all-in-on-claude-agent-sdk.md) — harness-agnostic, pull-based context.
- `packages/cli/src/agents.ts` (`renderAgentFile`, `delegatableAgentIds`), `packages/cli/src/build-agents.ts`, `.claude/agents/`.
