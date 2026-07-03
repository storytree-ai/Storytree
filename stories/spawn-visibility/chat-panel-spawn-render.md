---
id: "chat-panel-spawn-render"
tier: capability
story: spawn-visibility
title: "The chat panel renders the spawn line — the spawn variant on the wire union + the transcript render (two-stage)"
outcome: "The studio chat surface carries the `spawn` variant on its `ChatEvent` wire union + `isChatEvent` guard and the `ChatPanel` renders it as a spawn line (\"🔧 spawning story-author for <id>…\" → \"✓ story-author finished\") — geometry/behaviour machine-witnessed over a scripted seam; the on-screen appearance operator-attested."
status: proposed
proof_mode: integration-test
depends_on: [chat-spawn-trace-events]
decisions: [137, 70, 4, 138]
# Node-borne proof config (ADR-0057 keystone). EDIT-EXISTING (editsExisting: true): api.ts + ChatPanel.tsx
# already exist at HEAD (the chat-drive-bridge / chat-panel capabilities — the ChatEvent union at
# api.ts:88, the isChatEvent guard at :91, the ChatPanel render). This increment EDITS api.ts to add a
# `spawn` variant to the ChatEvent union + the isChatEvent guard (wire shape only — plain JSON, NOT
# imported from @storytree/drive; the studio rides the wire shape with a locally-declared type, the
# api.ts thin-client discipline) and EDITS ChatPanel.tsx to render the spawn line. The leaf authors a
# NEW failing vitest jsdom component test (ChatPanel.spawn.test.tsx) that scripts an api stream emitting
# a `spawn` frame and asserts the spawn line renders — RED at HEAD because isChatEvent rejects the
# `spawn` frame (defensively ignored) and ChatPanel has no spawn render → the query for the line finds
# nothing (a RUNTIME red, never type-only). FRONTEND-BUILDER TWO-STAGE (ADR-0070): this `real:` arm
# proves the GEOMETRY/BEHAVIOUR ONLY (the frame is accepted, the line renders and resolves) — the
# on-screen APPEARANCE inside the native shell is the story's operator-attested UAT leg 5 (do NOT add a
# visual assertion here). RUNNER: the studio suite is VITEST + jsdom (NOT node:test — the
# vitest-runner-mismatch trap), so the real arm declares an explicit proofCommand running the ONE test
# file under vitest. `install: true` (fresh worktree needs the lockfile-only install, ADR-0031 §2).
# SCOPE = apps/studio/src (the panel is a studio frontend component; the desktop renders the COMPILED
# studio dist). The drive-side trace threading (capability 1) is a CONSUMED dependency reached over the
# api/HTTP wire shape, not a co-edited file.
proof:
  command:
    file: pnpm
    args: ["--filter", "studio", "test"]
  scope:
    testGlobs: ["apps/studio/src/**/*.test.tsx", "apps/studio/src/**/*.test.ts"]
    sourceGlobs: ["apps/studio/src/**/*.ts", "apps/studio/src/**/*.tsx"]
  real:
    testFile: "apps/studio/src/components/ChatPanel.spawn.test.tsx"
    sourceFile: "apps/studio/src/components/ChatPanel.tsx"
    scope:
      testGlobs: ["apps/studio/src/components/ChatPanel.spawn.test.tsx"]
      sourceGlobs: ["apps/studio/src/components/ChatPanel.tsx", "apps/studio/src/api.ts"]
    editsExisting: true
    install: true
    typecheck:
      file: pnpm
      args: ["--filter", "studio", "typecheck"]
    # The studio suite is vitest (jsdom), not node:test — so the default `node --test` real proof cannot
    # run this `.test.tsx`. Run the ONE test file under vitest (cwd = apps/studio).
    proofCommand:
      file: pnpm
      args:
        - "--filter"
        - "studio"
        - "exec"
        - "vitest"
        - "run"
        - "src/components/ChatPanel.spawn.test.tsx"
---

# The chat panel renders the spawn line — the spawn variant on the wire union + the transcript render

**Outcome —** The studio chat surface carries the `spawn` variant on its `ChatEvent` wire union +
`isChatEvent` guard and the `ChatPanel` renders it as a spawn line ("🔧 spawning story-author for
`<id>`…" → "✓ story-author finished") — geometry/behaviour machine-witnessed over a scripted seam; the
on-screen appearance operator-attested.

**Depends on —** [`chat-spawn-trace-events`](chat-spawn-trace-events.md) — the panel render consumes the
wire shape that capability produces: the `spawn` frame (`{ phase, role, unitId, ok? }`) arrives over
the SSE wire (threaded onto the `ChatStreamEvent` → SSE frame chain), so the panel's `ChatEvent` union +
render couple directly to that frame shape.

> **Proof status (honest) — `proposed`, EDIT-EXISTING two-stage.** The chat panel already renders the
> `delta`/`done`/`error`/`refused` frames (`apps/studio/src/components/ChatPanel.tsx`, the chat-panel
> capability) and the wire union already declares them (`apps/studio/src/api.ts:88`, `isChatEvent` at
> `:91`). What is MISSING is the `spawn` variant: today `isChatEvent` REJECTS a `spawn` frame
> (defensively ignored) and the panel has no spawn render. This capability EDITS the wire union + guard
> to accept it and EDITS the panel to render the spawn line. Its GEOMETRY/BEHAVIOUR is machine-witnessed;
> its APPEARANCE inside the native shell is the story's operator-attested UAT leg 5 (ADR-0070). Status
> stays `proposed` — `healthy` is only ever DERIVED from signed verdicts (ADR-0020), never authored.

## Guidance

THE WIRE SHAPE IS PLAIN JSON, LOCALLY DECLARED (ADR-0004 / the api.ts discipline): the `spawn` frame's
type is added to the studio's LOCAL `ChatEvent` discriminated union (`apps/studio/src/api.ts:88`) and
its `isChatEvent` guard (`:91`) — NOT imported from `@storytree/drive` (forbidden in `apps/studio/src`).
The frames are plain JSON, so the studio rides the wire shape with a locally-declared type (the same
move the existing delta/done/error/refused frames make; re-cite the producer at
`packages/drive/src/chat-stream.ts` / `apps/desktop/src/backend/chat-sse-mount.ts`). Extend
`isChatEvent` to accept `t === 'spawn'` and declare a `ChatSpawnEvent`
(`{ type: 'spawn'; phase: 'started' | 'finished'; role: string; unitId: string; ok?: boolean }`). Get
this wrong — importing the drive type — and you breach the model-path wall
(`modelPathBoundary.test.ts`).

RENDER THE LINE, NON-TERMINAL (the transcript discipline): a `spawn` frame is NON-TERMINAL, like a
`delta` — it appends a line to the live transcript, it does not end the stream. A `phase: "started"`
frame renders "🔧 spawning `<role>` for `<unitId>`…"; the matching `phase: "finished"` resolves it to
"✓ `<role>` finished" (or an honest "✗ `<role>` failed" on `ok: false`). The panel already accumulates
`delta` text into a live render — the spawn line rides the same accumulation, interleaved in arrival
order. Do NOT treat a `spawn` frame as terminal (it must not replace the `done` proposal) and do NOT
drop it (a rejected frame is the RED).

GEOMETRY/BEHAVIOUR HERE, APPEARANCE OPERATOR-ATTESTED (ADR-0070 two-stage): this `real:` arm proves the
BEHAVIOUR ONLY — the `spawn` frame is accepted by the guard, the started line renders, the finished
line resolves it, over a scripted `api` seam. The line's LOOK inside the native shell (does it read as
a distinct spawn signal; is it legible against the transcript; ADR-0113 §9) is the story's
operator-attested UAT leg 5 — witnessed by the owner, NEVER a machine visual verdict here. Do NOT
author a visual/appearance assertion in this capability's tests.

OFFLINE-TESTABLE BY MOCKING THE SEAM (the chat-panel discipline): `@vitest-environment jsdom`,
`vi.mock('../api', …)` to script the chat stream (emitting the `spawn` frames), `@testing-library/react`
for render, fake timers to drive the started→finished transition deterministically. No real
`fetch`/socket/SDK/DB/Electron. The thin client imports no agent/drive/model (the
`modelPathBoundary.test.ts` wall stays green).

## Integration test

**Goal —** Prove the studio wire union + guard accept a `spawn` frame and the panel renders the spawn
line (started → finished) off a scripted `api` stream; that a `spawn` frame does NOT terminate the
stream (the `done` proposal still renders after); and that the thin client imports no
agent/drive/model — entirely in jsdom over a scripted seam.

Exercised against its **real in-story collaborator** — the panel's `api` chat-stream seam, scripted as a
double (exactly as the chat-panel tests script `api.chatStream`). No stubs within the panel's own render
(the guard, the accumulation, the spawn-line render are all real).

The integration test would:

1. Mock `../api` with a scripted chat-stream seam. Render `<ChatPanel/>` in jsdom on fake timers.
2. Drive the stream to emit a `spawn` frame (`phase: "started"`, `role: "story-author"`, a `unitId`) →
   assert the panel renders a "🔧 spawning story-author for `<id>`…" line (the guard accepted the
   frame; at HEAD `isChatEvent` rejects it → the line is absent → red).
3. Drive a matching `phase: "finished"` frame → assert the line resolves to "✓ story-author finished".
4. Drive a terminal `done` frame after the spawn frames → assert the proposal still renders (the spawn
   frame did not terminate the stream; it is non-terminal like a delta).
5. Assert the panel imports no agent/drive/model (`modelPathBoundary.test.ts` stays green) — the `spawn`
   type is a locally-declared wire shape, never a `@storytree/drive` import.

## Contracts (3)

The test-proven leaf behaviours — each **one isolated automated test** in the `studio` suite (vitest
jsdom, `apps/studio/src/components/ChatPanel.spawn.test.tsx`), the `api` chat-stream seam
mocked/scripted. Per ADR-0122 (`storytree coverage`), each contract id is the lead of a distinctly-named
test, so the coverage check reports 3/3. None of these is an APPEARANCE assertion — the look is the
story's operator-attested UAT leg 5 (ADR-0070).

1. **`cps-wire-union-accepts-the-spawn-frame`** — the `spawn` variant is on the union + guard
   - **asserts —** the studio `ChatEvent` union carries a `ChatSpawnEvent`
     (`{ type: 'spawn'; phase; role; unitId; ok? }`) and `isChatEvent` accepts a `spawn` frame
     (`t === 'spawn'`) — a `spawn` frame off the wire is no longer defensively ignored. Locally
     declared plain JSON, NOT imported from `@storytree/drive` (the api.ts thin-client discipline).
   - **covers —** `apps/studio/src/api.ts` (the union widening + the `isChatEvent` arm)
   - **proven by —** `apps/studio/src/components/ChatPanel.spawn.test.tsx` (net-new, vitest jsdom).
2. **`cps-panel-renders-the-spawn-line`** — the started line renders and the finished line resolves it
   - **asserts —** a `spawn` `phase: "started"` frame renders a "🔧 spawning `<role>` for `<unitId>`…"
     line in the transcript, and the matching `phase: "finished"` frame resolves it to
     "✓ `<role>` finished" (or an honest failed line on `ok: false`) — the geometry/behaviour, over the
     scripted seam. (The line's look is the story's UAT leg 5, not asserted here.)
   - **covers —** `apps/studio/src/components/ChatPanel.tsx` (the spawn-line render)
   - **proven by —** `apps/studio/src/components/ChatPanel.spawn.test.tsx`.
3. **`cps-spawn-frame-is-non-terminal`** — a spawn frame appends, never terminates
   - **asserts —** a `spawn` frame does NOT end the stream — a terminal `done` frame after one still
     renders its proposal (the spawn line rode the transcript like a delta, interleaved in arrival
     order); and the thin client imports no agent/drive/model (`modelPathBoundary.test.ts` green).
   - **covers —** `apps/studio/src/components/ChatPanel.tsx` (the non-terminal accumulation)
   - **proven by —** `apps/studio/src/components/ChatPanel.spawn.test.tsx`.

## Guidance — the edit-existing slice that earns the signed verdict

The brownfield rung toward `healthy` (ADR-0057 §3, EDIT-EXISTING): `api.ts` + `ChatPanel.tsx` already
landed. This increment EDITS them to accept + render the `spawn` frame, test-first.

- **The new test —** `apps/studio/src/components/ChatPanel.spawn.test.tsx` (`@vitest-environment jsdom`,
  vitest + `@testing-library/react`, the studio convention — `vi.hoisted` + `vi.mock('../api', …)` to
  script the stream, fake timers; the SAME discipline `ChatPanel.test.tsx` / `ChatPanel.accept.test.tsx`
  use; NO real `fetch`/socket/SDK/DB/Electron). Import `{ ChatPanel }` from `"./ChatPanel"`. Name each
  test for its contract id (`cps-…`) so `storytree coverage` reports 3/3 (ADR-0122). (A separate test
  FILE keeps the gate's red→green diff scoped to this increment.)
- **The RED the spine observes (before IMPLEMENT) —** `ChatPanel.tsx` EXISTS, so the red is a RUNTIME
  assertion: render the panel, drive a `spawn` frame, assert the spawn line is present. At HEAD
  `isChatEvent` rejects the frame → the panel never sees it → the line is absent → red. ASSERT THE LINE,
  never just that the panel rendered (green at HEAD, fails CONFIRM_RED).
- **The GREEN —** EDIT `apps/studio/src/api.ts` (add `ChatSpawnEvent` to the union + the `isChatEvent`
  arm) and `apps/studio/src/components/ChatPanel.tsx` (accumulate + render the spawn line). NO
  `@storytree/agent`, NO `@storytree/drive`, NO model path. After it, the wire-accepts + line-renders +
  non-terminal assertions hold, and `pnpm --filter studio test` + `pnpm --filter studio typecheck` stay
  green. The line's APPEARANCE inside the native shell is witnessed under the story's UAT leg 5
  (operator-attested, ADR-0070), not asserted in CI.

Rules:

- **Plain-JSON wire shape, no drive import** — the `spawn` type is locally declared in `api.ts`
  (`cps-wire-union-accepts-the-spawn-frame`, ADR-0004); the `modelPathBoundary.test.ts` guard stays
  green.
- **Non-terminal** — a `spawn` frame appends a line and never terminates the stream
  (`cps-spawn-frame-is-non-terminal`); the `done` proposal still renders after.
- **Appearance is operator-attested, not asserted here** (ADR-0070) — prove geometry/behaviour only;
  the line's look is the story's UAT leg 5. Do not author a visual verdict.
- **Edit, don't fork** — the existing delta/done/error/refused rendering is untouched except for the
  additive `spawn` variant + its line render. The panel's existing behaviour stays green.
