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
retired, ADR-0160 keeps live residue and remains the `scoped-glue-actuator` story's PRIMARY deciding
ADR — a full supersede would strand four story `decisions:` links (the `story-decisions` gate). The
actuator's retirement is carried as a reciprocal prose note on ADR-0160. **The residue narrowed on
2026-07-31** and the `amends` edge still holds: the D5.i `spawn_builder` correction and the
`spawn_story_author` caller named here originally both retired with the spawn surface (see the
execution-status block below), but ADR-0160 D2's generalised **`runSpawnWriteScoped` write-fence core
survives them** — deliberately kept, caller-less for now, as the discipline this ADR aims
`app-guide`'s setup-scoped writes at — alongside the optionally-surviving `glue-worker` agent def. The
stranded-links ground is untouched either way.)

**Story rename (2026-07-16, owner-directed).** The story node this ADR reserves the `app-guide` role for
was formerly `terminal-chat`; on owner direction it was renamed `terminal-chat` → `app-guide` to end the
name collision with the `embedded-terminal` story (ADR-0174's real terminal) and to carry the concierge
re-aim in its id. The node now lives at `stories/app-guide/` (status `proposed`); **this ADR's reserved
role-name is now the story id.** This is a rename/re-aim, not a re-decision — the "repurpose, don't
delete" decision below is unchanged.

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
job is wiring the user *into* the layer, not doing story-code work. **The journey now lives in the work
hierarchy as the proposed story node `stories/app-guide`** (formerly `terminal-chat`, renamed on owner
direction — see Status): the re-aimed chat-panel UX capabilities are its **first slice**, and the full
help/setup agent wiring (install → auth → point-at-repo → presence-hook wiring → verify a wisp) remains
ahead of the crown as the deferred build. **This ADR's role — "repurpose, don't delete" — STANDS**; what
changed since it was written is that the standing marker has converted into a named, proposed story, so
the infrastructure is neither ripped out nor left as unowned dead code but owned by a live node.

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

> **Execution status of that retirement (the code half) — COMPLETE.** The stories/**-only reconcile
> deliberately left the code mounted, deferring it to a separate thin PR
> (`stories/headless-orchestrator/story.md`: "NOT retired here: the code itself"). Both slices have
> now landed, and the same two facts made each unambiguous: neither surface had a **reachable
> caller** (`ChatDock`, the only mount of `ChatPanel` and so the only path to POST `/api/chat`, is
> imported by nothing in the production tree — `TerminalDock` took its dock slot; and `storytree
> orchestrate`, the other `orchestrate()` caller, passes neither surface's deps), so each was composed
> at every sidecar boot with no UI path to it.
> - **LANDING — DONE (2026-07-30, PR #1035).** `packages/agent/src/landing-tool-surface.ts` and
>   `packages/drive/src/landing-deps.ts` (+ their tests) are deleted, along with the `landing?` thread
>   through `headless-orchestrator` → `orchestrate` → `chat-stream` → `chat-sse-mount` and the sidecar
>   composition in `apps/desktop/electron/backend-entry.ts`. Held gone by
>   `apps/desktop/src/backend/landing-surface-retired.test.ts`. Beyond the dead caller, its
>   `open_landing_pr` fresh-branch-after-merge behaviour had become **doctrinally dead** under
>   **ADR-0271** (sessions end where their PR merges), which settled the open question ADR-0163 D3
>   Gap B1 had recorded. The exec seam (`ExecFn` / `ExecResult`) that lived in `landing-deps` was
>   rehomed to `inspect-deps.ts`, its only remaining consumer — the surface this ADR *keeps*.
> - **SPAWN — DONE (2026-07-31).** `packages/agent/src/{spawn-tool-surface,claim-gated-spawn}.ts`,
>   `packages/drive/src/{spawn-deps,spawn-builder,spawn-trace}.ts` and
>   `apps/desktop/src/backend/spawn-turns.ts` (+ their tests) are deleted, along with the `spawn?`
>   thread through the same four links, the `ChatStreamSpawnEvent` frame that carried the boundary
>   traces out (`chat-spawn-trace-events`), and the sidecar composition. Held gone by
>   `apps/desktop/src/backend/spawn-surface-retired.test.ts`. `spawn_glue_worker` had already gone
>   ahead of its two siblings as the exception below. Two pieces are deliberately **KEPT**: the
>   role-neutral write-fence core `runSpawnWriteScoped` (see the Status note on ADR-0160's live
>   residue, and the Consequences note aiming `app-guide`'s setup-scoped writes at this same
>   discipline) — renamed to `spawn-write-scoped.ts` once its `runSpawnStoryAuthor` wrapper went with
>   the tool it served; and `spawn-claim.ts` (`resolveSpawnClaim`), which belongs to the LIVE
>   `wisp-as-story-claim` story this ADR does not retire.
> - **The spec-and-manifest half was already complete** before either code slice — done in the
>   same 2026-07-17 reconcile commit that flipped the capabilities to `retired`, not deferred with the
>   code. The retired capabilities' `real:` arms are dropped, `packages/cli/src/node-build.test.ts`'s
>   REAL-buildable snapshot excludes every retired spawn node, and `repo-manifest.json`'s
>   `hostedStories.register` carries no `headless-orchestrator` / `chat-subagent-spawn` /
>   `spawn-visibility` entry. (An earlier revision of this block listed those three as outstanding;
>   corrected in place per ADR-0139 after checking the files rather than the prose.)
> - **Remaining, and owned by `app-guide` rather than by this retirement:** the studio client still
>   carries the `spawn` variant on its `ChatEvent` wire union (`apps/studio/src/api.ts`) and the
>   spawn-line render in `ChatPanel.tsx` / `ChatDock.tsx`. Nothing emits that frame any more, so a
>   thin client simply never receives one. Those files are the proof-bound sources of three LIVE
>   `app-guide` capabilities (`multi-turn-transcript`, `auto-grow-input`, `transcript-reset`) — the
>   chat-panel UX this ADR *re-aims* — so the render is cleaned up by that story's build, not by
>   unmounting a surface it co-owns.

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
- **Proposed, not built — a proposed story that never builds can rot.** Until `app-guide` is built, the
  repurposed modules sit without an active caller. The ownership is now concrete — the `stories/app-guide`
  node exists as `proposed` (its first slice, the chat-panel UX caps, authored), so the modules are named
  work in the hierarchy, not an unnamed deferred marker — but the rot risk has re-tensed accordingly: it
  is now "a proposed story that never builds," and the proposal must actually convert to a built,
  crowned story or the node ages.
- **`app-guide`'s setup-scoped writes are a new fence to design.** "Narrow writes for config/hooks" is a
  real write scope; when built it needs the same fail-closed path-fence discipline the retired glue
  actuator used (ADR-0160 D2), not an unbounded editor. Flagged here; owned by the build. **That
  discipline is still in the tree, not merely a citation:** the role-neutral `runSpawnWriteScoped`
  core (`packages/agent/src/spawn-write-scoped.ts`) outlived both spawn roles that called it and is
  held there for this — a caller injects its own scope predicate; there is no default and no second
  fence.
- **The `spawn_glue_worker` retirement touched shared spawn code — and then the sharers retired too.**
  `spawn_glue_worker` shared the `runSpawnWriteScoped` core and `spawn-tool-surface.ts` with
  `spawn_story_author`, so its removal had to leave the story-author spawn undisturbed; it did.
  `spawn_story_author` and `spawn_builder` then retired in their own right (2026-07-31, the execution
  block above), taking `spawn-tool-surface.ts` with them. What that leaves is the shared **core**,
  standing alone: `runSpawnWriteScoped` in `packages/agent/src/spawn-write-scoped.ts`, kept precisely
  because the next bullet needs it. A caller-less runner is a small carrying cost accepted with eyes
  open — the alternative was deleting the one proven fail-closed write fence and rebuilding it for
  `app-guide`.

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
- `stories/app-guide/story.md` — the proposed story node that now owns this journey (its first slice: the
  re-aimed chat-panel UX capabilities). Formerly `terminal-chat`, renamed on owner direction (see Status).
- Code (repurposed into `app-guide`): `packages/agent/src/headless-orchestrator.ts` (engine) ·
  `packages/agent/src/{orientation-tools,inspect-tool-surface}.ts` (read / advise) ·
  `packages/drive/src/{chat-stream,orchestrate,inspect-deps}.ts` ·
  `apps/desktop/src/backend/chat-sse-mount.ts` ·
  `apps/studio/src/components/{ChatDock,ChatPanel}.tsx` + `apps/studio/src/api.ts`.
- Code (RETIRED — deleted, held gone by the two negative guards): the SPAWN surface —
  `packages/agent/src/{spawn-tool-surface,claim-gated-spawn}.ts` ·
  `packages/drive/src/{spawn-deps,spawn-builder,spawn-trace}.ts` ·
  `apps/desktop/src/backend/spawn-turns.ts`; and the LANDING surface —
  `packages/agent/src/landing-tool-surface.ts` · `packages/drive/src/landing-deps.ts`. Both threads
  through `headless-orchestrator` → `orchestrate` → `chat-stream` → `chat-sse-mount` and both sidecar
  compositions in `apps/desktop/electron/backend-entry.ts` are gone with them. Guards:
  `apps/desktop/src/backend/{spawn,landing}-surface-retired.test.ts`.
  `spawn_glue_worker` (the one exception, retired as redundant ahead of its siblings) lived in the
  first two of those spawn files. Possibly surviving: `.claude/agents/glue-worker.md` (fenced
  subagent).
- Code (KEPT out of the spawn retirement): `packages/agent/src/spawn-write-scoped.ts`
  (`runSpawnWriteScoped` — ADR-0160 D2's role-neutral write fence, aimed at `app-guide`'s future
  setup-scoped writes) · `packages/agent/src/spawn-claim.ts` (`resolveSpawnClaim` — the
  `take-claim-at-spawn` capability of the LIVE `wisp-as-story-claim` story, which this ADR does not
  retire: the claim ledger and map wisps stay load-bearing for terminal Claude Code).
