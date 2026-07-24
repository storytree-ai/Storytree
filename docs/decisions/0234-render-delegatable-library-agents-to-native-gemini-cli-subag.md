---
status: accepted
decided: 2026-07-24
amends: [52, 178]
load_bearing: true
---
# ADR-0234: Render delegatable Library agents to native Gemini CLI subagent files

## Status

accepted (2026-07-24) — decided/directed by the owner in conversation on 2026-07-24. Design-time alignment IS the ratification (ADR-0110); no second end-of-flow ask.

**Amends ADR-0052 and ADR-0178** — their one-Library-population/many-generated-surfaces
decision now includes Gemini CLI's native project-subagent directory alongside Claude, Cursor,
and Codex. It does not change which Library agents are delegatable or make a second prompt corpus.

## Context

Storytree already authors agent roles once in the seed-canonical Library tier. The renderer turns
that population into thin essentials prompts, while `pnpm build:agents` commits and drift-gates the
harness-native views:

- `.claude/agents/*.md` for Claude Code;
- `.cursor/agents/*.md` for Cursor;
- `.codex/agents/*.toml` for Codex.

Gemini CLI discovers project custom subagents in `.gemini/agents/*.md`. Each file starts with YAML
frontmatter containing a required `name` and `description`; its Markdown body becomes the system
prompt. `model`, `tools`, turn limits, and time limits are optional execution policy.

Hand-copying Storytree's roles into that directory would create another editable prompt population.
Pointing Gemini at the Claude view would depend on an undocumented compatibility path when Gemini
has its own native project contract. Reusing the Claude/Cursor `model: sonnet|opus` line would also
be false: those are Library tiers for Claude-compatible harness frontmatter, not Gemini model IDs.

## Decision

1. **The Library `agent` tier remains the sole authored population.** Gemini files use the same
   `delegatableAgentIds` selection and `renderAgentEssentials` body as every other harness view.

2. **Generate Gemini CLI's native project surface.**
   - `renderGeminiAgentFile` emits `.gemini/agents/<id>.md`.
   - Frontmatter carries only the required `name` and `description`.
   - The generated marker and essentials prompt form the Markdown body.
   - Dedicated-surface roles remain excluded by the existing shared selector.

3. **Gemini inherits its spawning session's model and tools.** The generator emits no `model`:
   the Library's `sonnet` / `opus` values are not translated into invented Gemini model IDs. It
   emits no `tools`, turn, or timeout policy until those grants have a structured, harness-neutral
   Library representation.

4. **One build and one drift gate cover all four harnesses.** `pnpm build:agents` writes and
   orphan-prunes Claude, Cursor, Codex, and Gemini targets. `pnpm check:agents` refuses a stale,
   missing, orphaned, dangling, or re-bloated Gemini view through the same pipeline. `.gemini` is an
   admitted root surface in `repo-manifest.json`.

5. **This decision is specifically about Gemini CLI.** It makes no claim that Antigravity's
   desktop or CLI surfaces consume `.gemini/agents`; those products expose different agent
   management contracts and require their own decision if Storytree later targets them.

## Consequences

**Good.**

- Gemini CLI can delegate to the same nine Storytree specialists without prompt duplication.
- Agent-artifact edits regenerate every harness view together, so CI catches drift immediately.
- Gemini model selection remains honest and follows the signed-in session rather than a fabricated
  cross-vendor tier mapping.

**Bad / watch.**

- Every seed-agent change now updates a fourth generated directory.
- Gemini subagents inherit the parent tool surface until Storytree owns structured cross-harness
  grants; prose tool guidance is not an enforceable allow-list.
- Gemini CLI's subagent schema is an external preview-era product contract and must be rechecked
  when upgrading the harness.

## References

- ADR-0052 — the generated Claude subagent surface and single-population rule.
- ADR-0156 — essentials-only subagent prompts.
- ADR-0178 — the first additional native harness view (Cursor).
- ADR-0182 — Claude/Cursor model tiers; deliberately not translated to Gemini.
- [Gemini CLI custom subagent documentation](https://github.com/google-gemini/gemini-cli/blob/main/docs/core/subagents.md).
