---
status: accepted
decided: 2026-07-09
amends: [160, 163, 170, 173]
load_bearing: true
---
# ADR-0175: Repurpose (don't delete) the in-app orchestrator chat infrastructure into the app-guide agent

## Status

accepted (2026-07-09) — decided/directed by the owner in the same 2026-07-09 design conversation as
ADR-0174 (its companion). Design-time alignment IS the ratification (ADR-0110); no second end-of-flow
ask.

**Amends ADR-0163 / ADR-0170 / ADR-0173** — the dogfood arc's chat infra, the continuity mechanism, and
the read-only CI/git inspect surface are **re-aimed** under a new role (`app-guide`), not deleted.
**Amends ADR-0160** — the `spawn_glue_worker` actuator it decided is **retired as redundant** (the ONE
exception to "repurpose, don't delete"); the glue *definition* and write-authority boundary of ADR-0158
are untouched. (Edges recorded as `amends` per the binary edge model, ADR-0139. Librarian pass 2026-07-09
**kept `amends`, not `supersedes`**, for ADR-0160: although its `spawn_glue_worker` actuator is fully
retired, ADR-0160 keeps live residue (the generalised `runSpawnWriteScoped` runner still serving
`spawn_story_author`, the D5.i `spawn_builder` correction, the optionally-surviving `glue-worker` agent
def) and remains the `scoped-glue-actuator` story's PRIMARY deciding ADR — a full supersede would strand
four story `decisions:` links (the `story-decisions` gate). The actuator's retirement is carried as a
reciprocal prose note on ADR-0160.)

## Context

ADR-0174 retires the desktop's in-app **interactive** work-orchestrator (the chat widget) in favour of
an embedded terminal running real Claude Code. That decision leaves a substantial, *working* body of
infrastructure in the tree: the SSE chat transport, the resizable dock, cross-turn continuity, a
read-only CI/git inspection surface, and the SDK session engine behind them. Deleting it would be waste
— and would throw away exactly the machinery a *different*, still-wanted agent needs.

The still-wanted agent is a storytree-native **concierge** that (1) onboards a new user to the product
and gives help/advice, and (2) — its real job — **onboards the user's OWN Claude Code into the
observability layer**: install Claude Code → authenticate → point it at the repo/worktree → wire the
presence hooks (`scripts/presence-hook.sh`, the `SessionStart` declare) → verify a wisp lights on the
map. The whole premise of ADR-0174 is that the observability layer already watches any plain Claude Code
session *through those seams* — which only pays off once the user's Claude Code is actually wired into
them. Something has to do that wiring and hand-hold the setup; that something is a help/setup agent, and
it wants precisely the chat infra ADR-0174 frees up.

## Decision

**The desktop chat infrastructure is NOT deleted — it is repurposed into a future `app-guide` agent.**
`app-guide` is a storytree-native help/setup concierge: it onboards new users, answers help/advice
questions about the product, and onboards the user's own Claude Code into the observability layer
(install → auth → point at the repo/worktree → wire the presence hooks → verify a wisp lights). Its real
job is wiring the user *into* the layer, not doing story-code work. **The build is DEFERRED**; this ADR
is the standing "repurpose, don't delete" marker so the infrastructure is neither ripped out nor left as
unowned dead code.

**Name — `app-guide`, role-not-position (ADR-0078).** "Guide" is a role-noun in the same family as
author / curator / builder — it implies orientation and hand-holding, not merely answering questions.
`app-guide` was chosen over `app-helper` for that reason: a helper answers; a guide *leads you in*.

**Repurposed — re-aimed under `app-guide`, NOT deleted (amends ADR-0163 / ADR-0170 / ADR-0173):**

- **The SSE streaming transport + the chat dock/resize UI** — `apps/desktop/src/backend/chat-sse-mount.ts`,
  `packages/drive/src/chat-stream.ts`, `apps/studio/src/components/{ChatDock,ChatPanel}.tsx`,
  `apps/studio/src/api.ts` (`chatStream`). A help concierge *is* a chat; this is its transport and its
  dock.
- **The SDK session engine** — `packages/agent/src/headless-orchestrator.ts` (the `query()`-driven
  session, `tools: []`) and its composition `packages/drive/src/orchestrate.ts`. **This — not
  `sdk-author.ts` — is the interactive engine** (verified: the chat drove `query()` directly and only
  *type-imported* `SdkQueryFn` from `sdk-author.ts`; `ClaudeAgentAuthor` is the prove-it-gate leaf and
  stays there per ADR-0174). `app-guide` becomes its new caller.
- **Cross-turn continuity (ADR-0170)** — the `resume` / `sessionId` thread through
  `headless-orchestrator` → `orchestrate` / `chat-stream` → `chat-sse-mount` → `ChatPanel`. A help agent
  wants conversation memory across a multi-step setup; this is exactly that, re-aimed.
- **The read-only CI/git inspect surface (ADR-0173)** — `packages/agent/src/inspect-tool-surface.ts` +
  `packages/drive/src/inspect-deps.ts` (`view_ci_run` / `view_pr_checks` / `git_inspect`). A help agent
  that reads CI/git to advise ("your PR is red because …", "your checkout moved under the app") is
  precisely what 0173 built; it re-aims wholesale.

`app-guide`'s tool scope becomes **read / advise / setup** — read-only orientation + inspection, plus
**narrow setup-scoped writes** for config and hooks (wiring the user's Claude Code) — **NOT**
write-scoped story-code execution. The read-only orientation surface (`orientation-tools.ts`) carries
over; the **spawn** and **landing** surfaces (which drove story work) do not belong to a help agent and
retire with the interactive orchestrator under ADR-0174, not into `app-guide`.

**THE ONE EXCEPTION — retired as redundant, not repurposed: the `spawn_glue_worker` actuator + the
`glue-worker` chat-spawn (amends ADR-0160).** The scoped-glue actuator existed *only* because the chat
could not edit code the way a real editor can (ADR-0160 §Context: the chat surface had "no rung for a
minimal scoped edit"). The embedded terminal's Claude Code makes glue edits natively — so the actuator's
entire reason for being is gone. Concretely retired: the `spawn_glue_worker` MCP tool registration
(`packages/agent/src/spawn-tool-surface.ts`) and its production composition
(`packages/drive/src/spawn-deps.ts`, `spawnGlueWorker`) — whose **only** spawn-site is the desktop chat
sidecar (`apps/desktop/electron/backend-entry.ts`; verified: no other actuator mounts it). **The glue
*concept* is UNTOUCHED** — ADR-0158's "glue is un-asserted code within a story, proven transitively"
stands entirely; only the *chat's actuator* for it retires, because the terminal supersedes the need for
a chat-driven scoped-write rung. **The glue-worker *agent definition* may optionally survive as a fenced
subagent** (`.claude/agents/glue-worker.md`, rendered from the Library `glue-worker` artifact): real
Claude Code can spawn it via its own Agent/Task tool. Whether to keep it is left open — noted, not forced
by this ADR.

## Consequences

**Good.**
- **No waste.** A working SSE / dock / continuity / inspect / engine stack is redeployed to a role that
  genuinely needs it, instead of being deleted and half-rebuilt later. ADR-0174 removes a *runtime*;
  this ADR preserves the *infrastructure*.
- **The observability layer gets its missing on-ramp.** ADR-0174's premise (watch any plain Claude Code
  session through the seams) needs the user's Claude Code wired into those seams; `app-guide` is the
  thing that does the wiring — this repurposing closes that loop.
- **The retirement is surgical.** Exactly one actuator (`spawn_glue_worker`) is retired *as redundant*,
  and only because the terminal makes it so; the glue *definition* (ADR-0158) and every other piece of
  chat infra are preserved.

**Bad / watch.**
- **Deferred, not built — a standing marker can rot.** Until `app-guide` is built, the repurposed
  modules sit without an active caller. This ADR keeps them *owned* (their future is named) so a later
  cleanup pass does not delete them as orphans — but the deferral must actually convert to a build, or
  the marker ages.
- **`app-guide`'s setup-scoped writes are a new fence to design.** "Narrow writes for config/hooks" is a
  real write scope; when built it needs the same fail-closed path-fence discipline the retired glue
  actuator used (ADR-0160 D2), not an unbounded editor. Flagged here; owned by the build.
- **The `spawn_glue_worker` retirement touches shared spawn code.** `spawn_glue_worker` shares the
  `runSpawnWriteScoped` core and `spawn-tool-surface.ts` with `spawn_story_author`; the actual removal
  (ADR-0174's build, not this ADR's) must not disturb the story-author spawn. Here we only *mark* the
  glue actuator as the one piece that does not come back as `app-guide`.

## References

- ADR-0174 — retire the in-app *interactive* orchestrator for an embedded terminal (the companion
  decision this one follows from; it confirms `sdk-author.ts` / `ClaudeAgentAuthor` is the prove-it-gate
  leaf and untouched — hence the app-guide engine is `headless-orchestrator.ts`, not `sdk-author.ts`).
- ADR-0078 — role-not-position naming (`app-guide` over `app-helper`).
- ADR-0163 — the dogfood arc (amended: its chat infra is re-aimed to `app-guide` rather than matured
  toward an independent in-app work-orchestrator).
- ADR-0170 — chat continuity via SDK resume (amended: re-aimed as `app-guide`'s conversation memory).
- ADR-0173 — the read-only CI/git inspect surface (amended: re-aimed as `app-guide`'s advise-from-CI/git
  surface).
- ADR-0160 — the scoped-glue actuator (amended: its `spawn_glue_worker` actuator retires as redundant —
  the one exception; the glue-worker agent def may survive as a fenced subagent).
- ADR-0158 — glue is un-asserted code within a story (UNTOUCHED: only 0160's actuator retires, never the
  glue definition).
- ADR-0051 / ADR-0055 — one-definition rendered agents (an `app-guide` agent would be authored + rendered
  the same way; the `glue-worker` artifact that may survive is rendered).
- Code (repurposed into `app-guide`): `packages/agent/src/headless-orchestrator.ts` (engine) ·
  `packages/agent/src/{orientation-tools,inspect-tool-surface}.ts` (read / advise) ·
  `packages/drive/src/{chat-stream,orchestrate,inspect-deps}.ts` ·
  `apps/desktop/src/backend/chat-sse-mount.ts` ·
  `apps/studio/src/components/{ChatDock,ChatPanel}.tsx` + `apps/studio/src/api.ts`.
- Code (retired as redundant — the one exception): `packages/agent/src/spawn-tool-surface.ts`
  (`spawn_glue_worker` registration) · `packages/drive/src/spawn-deps.ts` (`spawnGlueWorker`
  composition) · sole spawn-site `apps/desktop/electron/backend-entry.ts`. Possibly surviving:
  `.claude/agents/glue-worker.md` (fenced subagent).
