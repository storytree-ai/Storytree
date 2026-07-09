---
status: accepted
decided: 2026-07-09
amends: [52, 177]
load_bearing: true
---
# ADR-0178: Render delegatable Library agents to native Cursor subagent files

## Status

accepted (2026-07-09) — decided/directed by the owner in conversation on 2026-07-09. Design-time
alignment IS the ratification (ADR-0110); no second end-of-flow ask.

**Amends ADR-0052** — its one-population/many-generated-surfaces decision now includes Cursor's
native project-subagent directory alongside Claude's. **Amends ADR-0177** — corrects its overly broad
claim that Cursor does not automatically recognise `.claude/agents`: Cursor IDE accepts that
directory as a compatibility input, but the Cursor SDK documents `.cursor/agents` as its native
project-file contract.

## Context

Storytree already solved subagent authorship for Claude. Library `agent` artifacts are canonical;
`renderAgentEssentials` produces the thin, pull-based prompt; `renderAgentFile` wraps it in
harness-native frontmatter; and `pnpm build:agents` generates `.claude/agents/*.md`. The
`check:agents` gate refuses stale, missing, orphaned, dangling, or re-bloated files. This is the
agent-builder pattern: edit one Library artifact, regenerate every harness surface.

ADR-0177 admits Cursor as the first second live harness and says prompts remain Library-owned rather
than copied into Cursor-specific code. Cursor's current product makes the concrete path clear:

- Cursor IDE discovers project subagents in `.cursor/agents/*.md` and also reads
  `.claude/agents/*.md` as a compatibility source.
- `.cursor/agents` has higher precedence when names collide.
- Local Cursor SDK agents load project files when `local.settingSources` includes `"project"`.
- Cloud Cursor SDK agents load project configuration automatically.
- Cursor's native frontmatter supports `name`, `description`, optional `model`, `readonly`, and
  `is_background`.

Relying only on Claude compatibility would work in the IDE today but would make the Cursor SDK depend
on a compatibility promise its SDK documentation does not use as the canonical file contract. Hand
copying the files would create two editable populations and immediate drift. Defining every subagent
inline in `Agent.create()` would fork the prompts into runtime wiring and bypass the existing
generated-view gate.

## Decision

1. **The Library `agent` tier remains the only authored population.** No `.claude/agents` or
   `.cursor/agents` file is hand-edited. Both are generated views of the same
   `renderAgentEssentials` body and the same `delegatableAgentIds` selection.

2. **Generate both harness-native project surfaces.**
   - `renderAgentFile` remains the backwards-compatible Claude renderer.
   - `renderCursorAgentFile` emits Cursor-native frontmatter and the same generated marker +
     essentials prompt.
   - `pnpm build:agents` writes and orphan-prunes both `.claude/agents/*.md` and
     `.cursor/agents/*.md`.

3. **Cursor files start with the minimum explicit native policy:** `name`, `description`, and
   `model: inherit`. Do not infer `readonly` or `is_background` from prose. Those fields grant
   execution semantics and require structured Library policy before the generator may emit them.

4. **One gate covers both directories.** `pnpm check:agents` fails when either target is stale,
   missing, orphaned, carries dangling references, or violates the essentials size/structure
   contract. Its success output names both targets so CI cannot appear green while checking only the
   legacy Claude view.

5. **The Cursor runtime consumes project files, not inline prompt forks.** A local Cursor SDK caller
   that needs subagents sets `local.settingSources: ["project"]`; cloud callers rely on the cloned
   project configuration. Inline agent definitions remain acceptable for isolated SDK tests only,
   not production role authorship.

6. **Dedicated-surface roles stay dedicated.** `session-orchestrator`, `red-builder`, and
   `green-builder` remain excluded by `delegatableAgentIds`; Cursor does not turn them into generic
   subagents. The first two proof phases continue to receive their rendered Library prompts through
   the `PhaseAuthor` composition.

## Consequences

**Good.**

- Claude and Cursor spawn the same authored specialists with no prompt duplication.
- Cursor IDE compatibility works immediately, while the native `.cursor` view gives the SDK a
  documented, highest-precedence project contract.
- Existing essentials, dangling-reference, orphan, and drift checks extend to the new harness rather
  than being reimplemented.
- Adding another file-based harness later is a renderer/target addition, not a second agent corpus.

**Bad / watch.**

- Every agent-artifact edit now changes two generated directories, increasing review noise.
- Cursor-specific execution policy is intentionally conservative until the Library schema can express
  it structurally; prose `Tools` text is not a safe source for `readonly`.
- A local SDK caller that forgets `settingSources: ["project"]` gets no generated subagents. Runtime
  tests must pin that option when subagent use is introduced.
- Cursor's compatibility discovery and native schema are external product contracts; their shape must
  be re-verified on SDK upgrades.

## References

- ADR-0029 — agents as Library artifacts.
- ADR-0051 — one agent population, multiple rendered surfaces.
- ADR-0052 — generated Claude subagent files (amended here).
- ADR-0156 / ADR-0161 — essentials-only prompts and just-in-time step context.
- ADR-0177 — Cursor behind the leaf-runtime seam (amended/corrected here).
- `packages/library/src/store/render-agent.ts`
- `packages/cli/src/build-agents.ts`
- Cursor subagent documentation: `https://cursor.com/docs/subagents`
- Cursor TypeScript SDK documentation: `https://cursor.com/docs/sdk/typescript`
