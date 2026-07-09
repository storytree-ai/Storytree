---
status: accepted
decided: 2026-07-05
amends: [158]
load_bearing: true
---
# ADR-0160: The desktop chat's scoped glue actuator is a fenced write-scoped glue-subagent that honours a task prompt

## Status

accepted (2026-07-05) — decided/directed by the owner in conversation on 2026-07-05. This is the build
ADR ADR-0158 D4 called for ("a structural fork for `story-author` + its own build ADR … choosing shape
(a) or (b)"); the owner directed the fix direction and handed the shape choice to this ADR. Design-time
alignment IS the ratification (ADR-0110); no second end-of-flow ask. This ADR **amends ADR-0158** —
it resolves 0158 D4's deliberately-open shape fork in favour of shape (a), and leaves 0158 D1/D2/D3
(the glue definition + the write-authority boundary) intact.

> **Amended by [ADR-0175](0175-repurpose-don-t-delete-the-in-app-orchestrator-chat-infrastr.md)**
> — the **`spawn_glue_worker` actuator this ADR decided (D1) is retired as redundant**: the embedded
> terminal (ADR-0174) makes glue edits natively, so the chat's scoped-write rung has no reason to exist.
> Concretely retired are the `spawn_glue_worker` MCP registration and its `spawnGlueWorker` composition
> (whose sole spawn-site was the desktop chat sidecar). **What stands:** the glue *definition* +
> write-authority boundary of **ADR-0158** (D1–D3, untouched — only this actuator retires, never the
> concept); the **generalised `runSpawnWriteScoped` runner (D2)**, still serving `spawn_story_author`;
> and the **D5.i honesty correction** (`spawn_builder`'s phantom `userPrompt` stays dropped). The
> **`glue-worker` agent definition (D4) may optionally survive** as a fenced subagent for real
> Claude Code's Agent/Task tool (ADR-0175 leaves this open). This ADR stays **`accepted`** — its
> actuator is partly overtaken, not wholly re-decided, and it remains the `scoped-glue-actuator`
> story's PRIMARY deciding record — so the edge is `amends`, not `supersedes`.

## Context

ADR-0158 diagnosed the 2026-07-04 desktop full-autonomy over-routing incident: the desktop **chat**
session-orchestrator, handed a scoped glue intent — *"add 3 routes to `backend-entry.ts`"* — routed it
as a whole-story `story build desktop-build-mount --real` (a full billed red→green + an auto-merging PR),
because its actuator surface (`headless-orchestrator.ts`: `tools: []` + a small in-process MCP set —
orient / `spawn_story_author` / `spawn_builder` / `run_gate` / `open_landing_pr`) has **no rung for a
minimal scoped edit**. `spawn_story_author` only writes `stories/**`; `spawn_builder` drives a whole
unit's registered proof (and drops its advertised `userPrompt`); neither can take "add these 3 routes to
this file and stop." The guidance already says *supplement the non-leaf glue with your own subagents* —
it named an affordance the surface lacks (ADR-0158 D4: "the fix is a tooling gap, not the prose").

ADR-0158 D4 left two candidate shapes to weigh here:
  - **(a)** a fenced write-scoped **glue-subagent** (the terminal's Agent/Task equivalent) that HONOURS a
    task prompt; or
  - **(b)** a path-fenced **`edit_file`** tool the chat calls directly, that `run_gate` / `open_landing_pr`
    then land.

**The forces.**
- **ADR-0137 d.1 — "spawn/route, never raw write."** The chat carries `tools: []` by invariant; writes
  happen only *inside spawned subagents* under their own fences (headless-orchestrator.ts:98-99, 256-259).
  Shape (b) puts a raw `Write`/`Edit` verb directly on the chat surface — it breaks that invariant. Shape
  (a) upholds it: the chat spawns; the subagent writes behind a fail-closed fence.
- **The machinery already exists.** `runSpawnStoryAuthor` (`spawn-story-author.ts`) is not story-specific:
  it is a general write-scoped SDK runner taking an **injectable `isWriteAllowed(relPath)` predicate**
  (default `stories/**`), any injected `systemPrompt`, any `userPrompt`, a fail-closed `PreToolUse`
  Write/Edit hook, no `Bash` (a shell write would bypass the fence), and it records every denied write as
  a typed `ScopeViolation`. Shape (a) is a near-exact reuse: the same fence, a **caller-declared path
  scope** instead of `stories/**`, and a glue-worker system prompt. Shape (b) would build a second,
  parallel write path with its own fence.
- **The `spawn_story_author` precedent.** Shape (a) mirrors the one spawn tool the chat already trusts:
  claim-gated (concurrent-session safety), write-fenced, honouring `userPrompt`. One more spawn tool of
  the same shape is the smallest coherent addition.

## Decision

**D1 — The scoped glue actuator is shape (a): a fenced, write-scoped, claim-gated `spawn_glue_worker`
MCP tool that honours a task prompt.** It mounts on the chat's existing (optional) spawn surface as a
third spawn tool alongside `spawn_story_author` / `spawn_builder`. Its parameters:
  - `unitId` — the **owning** story the glue edit lands under (glue lives *within* a story, ADR-0158 D1).
    The spawn is **claim-gated on `unitId`** (the same `claimGatedSpawn` gate the other two spawns use),
    so a concurrent session already holding that story is told who holds it and the spawn does not start.
  - `paths` — the caller-declared source scope the write fence permits (e.g.
    `apps/desktop/electron/backend-entry.ts`). The fence is fail-closed: a write outside `paths` is
    DENIED before it lands and recorded as a `ScopeViolation`. `stories/**` is **not** in a glue worker's
    default scope — that is `spawn_story_author`'s job.
  - `userPrompt` — the scoped task, HONOURED (threaded to the spawned session verbatim), so "add these 3
    routes to `backend-entry.ts` and stop" reaches the worker.

**D2 — It reuses the existing write-fence runner, generalised, not a new write path.** The
`runSpawnStoryAuthor` runner is generalised to a role-neutral write-scoped runner (a
`runSpawnWriteScoped`-shaped core) that both the story-author spawn and the glue-worker spawn call with
their own `isWriteAllowed` predicate + system prompt. No second fence implementation, no raw write verb
on the chat, `Bash` never in the surface (ADR-0137 d.1 held).

**D3 — Landing is the existing gate → PR path; the D3 boundary of ADR-0158 is preserved.** The glue
worker only *edits*; it signs nothing. The chat lands the result through the `run_gate` +
`open_landing_pr` tools it already has: `pnpm gate` re-proves the whole tree (including the owning
story's registered tests), then a NON-DRAFT PR opens and **CI independently re-proves the merge with
main** (ADR-0022) — *without* re-running the owning story's `--real` build. That transitive re-proof at
the gate/story altitude is exactly ADR-0158 D1's "glue is proven transitively." Where a glue edit is
genuinely NOT reachable even transitively (the gate/CI does not exercise it), the honest options remain
ADR-0158 D3's: **(b) operator-attest** the residual or **(c) escalate** it — the actuator does not
license autonomously landing un-proven surface. The actuator closes the *delegation* gap; it does not
widen the *proof* boundary.

**D4 — The glue-worker system prompt is a rendered Library agent, not an inlined fork.** To keep
ADR-0051's one-definition rule (edit the artifact, regenerate; the terminal and the spawned worker move
together), the spawned glue worker's system prompt is rendered from a Library `glue-worker` agent
artifact via `renderAgentPrompt`, fail-closed BEFORE any SDK call when absent — exactly as
`spawn-deps.ts` renders `story-author` today. The worker's discipline is thin and mechanical: make the
minimal scoped edit the task prompt describes within the path fence; if real logic is hiding in the
wiring, say so (ADR-0158 D1's extraction check) rather than burying it; never widen scope.

**D5 — Two honesty corrections ride along (ADR-0158 D4), but are separate units.** (i) `spawn_builder`'s
schema advertises a `userPrompt` the production dep discards — now that `spawn_glue_worker` is the real
home for scoped intent, `spawn_builder`'s phantom knob is **dropped from its schema** (a builder drives
the *whole* unit's registered proof; it has no per-run scope). (ii) The seed `session-orchestrator`
"## Tools" section names Edit/Write/gh/the Agent tool the desktop chat lacks, and
`orchestrate-route-supplement` files "visual/UI" inside the glue bucket (ADR-0158 D2: visual/UI is
operator-attested, an orthogonal axis) — these are seed-prose corrections (edit the Library artifact +
regenerate, ADR-0051), owned by the librarian/guidance pass, not enforced by this ADR.

## Consequences

**Good.**
- The chat's guidance ("delegate the glue to a subagent") finally has a target. A scoped glue intent is
  delegated to a path-fenced worker and landed through the gate/CI path — it never reaches for the
  whole-story `--real` build.
- ADR-0137 d.1 holds unbroken: the chat stays `tools: []`; the only new power is one more claim-gated,
  write-fenced spawn — spawn power, not write power.
- One fence implementation, exercised by two roles. The generalisation is a rename + a predicate/prompt
  injection, not a parallel code path.

**Bad / open.**
- A new Library `glue-worker` agent artifact is surface to maintain (rendered, seed-canonical).
- `paths` is a trust surface: a caller that declares an over-broad scope gets an over-broad fence. The
  fence still blocks writes outside `paths` and records violations, and CI re-proves the merge — but the
  scope is only as tight as the `unitId`/`paths` the orchestrator declares.
- Proving the end-to-end (the chat performing the `backend-entry.ts`-style edit without a whole-story
  `--real`) is operator-attested (look/live), not machine-signable — the last leg is the owner's.

## References

- ADR-0158 — glue is un-asserted code within a story; the autonomous chat writes only proof-producing
  work. D4 named this actuator + left shape (a)/(b) open (this ADR resolves it) and D3 is the boundary
  preserved here. (This ADR amends it.)
- ADR-0137 — chat gains SPAWN authority; d.1 "spawn/route, never raw write" (upheld: shape (a), not (b)).
- ADR-0152 — the landing surface (`run_gate` / `open_landing_pr`) this actuator lands through.
- ADR-0051 / ADR-0055 — one-definition rendered agents (the `glue-worker` prompt is rendered, D4).
- ADR-0110 — design-time alignment is ratification (this ADR is born accepted).
- ADR-0022 — CI re-proves the merge and auto-merges (the transitive re-proof, D3).
- Code: `packages/agent/src/spawn-story-author.ts` (the reusable write-fence runner, D2),
  `packages/agent/src/spawn-tool-surface.ts` (`spawn_glue_worker` mounts here; `spawn_builder`'s
  `userPrompt` dropped, D5.i), `packages/drive/src/spawn-deps.ts` (renders `glue-worker` + wires
  `spawnGlueWorker`, D4), `apps/desktop/electron/backend-entry.ts` (the sidecar wires the new dep; the
  glue file the incident targeted).
