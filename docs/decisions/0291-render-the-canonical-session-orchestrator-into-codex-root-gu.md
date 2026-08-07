---
status: accepted
decided: 2026-08-03
amends: [51]
---
# ADR-0291: Render the canonical session orchestrator into Codex root guidance

## Status

accepted (2026-08-03) — owner direction: Storytree has one canonical set of Library guidance which
procedurally generates both Claude-facing and Codex-facing project/session guidance. Design-time
alignment IS the ratification (ADR-0110); no second end-of-flow ask.

**Amends** ADR-0051 by adding Codex's native root main-session projection beside the existing
CLAUDE.md projection. It does not change the specialist-agent population governed by ADR-0052.

## Context

ADR-0051 made the Library `session-orchestrator` agent canonical, but projected its digest only into
a marked region of `CLAUDE.md`. ADR-0052 and its later amendments already render the delegatable
population into `.claude/agents`, `.cursor/agents`, `.codex/agents`, `.gemini/agents`, and
`.opencode/agent`; the
session-orchestrator is deliberately excluded because it owns a root main-session surface. Codex
therefore had native specialist agents but no native root project/session guidance.
*(Directory list corrected in place 2026-08-08, per
[ADR-0139](0139-the-accepted-adr-set-carries-no-stale-prose-correct-in-place.md): OpenCode's
`.opencode/agent` joined as the fifth specialist target — the decision below is unchanged.)*

Copying the discipline into a hand-authored `AGENTS.md` would recreate the drift ADR-0051 removed.
Adding the session-orchestrator to `.codex/agents` would confuse the outer loop with a delegatable
specialist. The existing digest renderer and offline seed loader already provide the needed mechanism.

## Decision

1. **One behavioral source.** The seed-canonical Library `session-orchestrator` artifact remains the
   sole authored operating discipline. Its resident behavioral prose uses harness-neutral terms;
   harness names belong only where a projection wrapper must identify its native file.
2. **Two dedicated root projections.** Claude Code retains the marked partial projection inside
   `CLAUDE.md` (the surrounding repository tour remains hand-authored, as ADR-0051 decided). Codex
   receives a fully generated root `AGENTS.md`. Both use the exact same `renderAgentDigest` result.
3. **No specialist duplication.** `session-orchestrator` remains excluded from every generated
   specialist directory, including `.codex/agents`; those files continue through `build:agents`.
4. **One offline drift gate.** `build:guidance` renders both root projections and `check:guidance`
   fails on a stale Claude region or a missing/stale Codex file. `build:claude` / `check:claude`
   remain compatibility aliases. The root manifest and CI name the new generated surface.
5. **Harness-aware telemetry.** The post-session onboarding monitor recognizes both the existing
   Claude transcript shape and Codex rollout JSONL. Unknown shapes fail closed instead of reporting
   a misleading zero-cost healthy session; existing Claude command behavior remains compatible.

## Consequences

Codex sessions now receive the same canonical outer-loop discipline through their native root file,
and a Library edit cannot update one harness without making the shared drift gate red. The generated
Codex wrapper is intentionally small: it projects the behavioral digest, not a second copy of
CLAUDE.md's hand-authored package tour. That preserves ADR-0051's partial-generation boundary and
keeps repository orientation pull-based.

The compatibility aliases are narrow deliberate residue: external automation may still invoke
`check:claude`, but the repository gate and CI use the truthful harness-neutral name. Supporting a
new transcript shape adds an adapter, not a new telemetry model; both normalize into the existing
`TraceToolCall` budget core.

## References

- [ADR-0051](0051-the-agent-renderer-shapes-claude-md-and-the-leaf-prompt-from.md) — canonical
  session-orchestrator renderer and the Claude root projection this amends.
- [ADR-0052](0052-render-delegatable-agents-to-claude-agents-subagent-files.md) — separate
  specialist-agent projections; the session orchestrator remains excluded.
- [ADR-0162](0162-manage-session-onboarding-cost-optimize-the-cost-centers-the.md) — post-session
  onboarding monitor, now harness-aware.
- `packages/cli/src/build-claude-md.ts` · `packages/cli/src/claude-region.ts` ·
  `packages/cli/src/onboarding-transcript.ts` · `apps/studio/data/knowledge.json`.
