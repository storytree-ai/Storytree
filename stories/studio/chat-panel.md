---
id: "chat-panel"
tier: capability
story: studio
title: "The renderer chat panel — a thin client that POSTs /api/chat and renders the streamed done/error/refused frames"
outcome: "The studio frontend adds a chat panel that POSTs the operator's intent to `/api/chat`, streams the SSE response, and renders the session's terminal outcome — the `done` proposal, a distinct `error` state, and a distinct `refused` (busy) state — disabling input while a session streams and degrading honestly to a disabled 'no backend' state where the chat route is unavailable. A THIN CLIENT: it never imports `@storytree/agent` / `@storytree/drive` and holds no model path; it parses SSE `data:` frames as plain JSON."
status: proposed
proof_mode: integration-test
depends_on: []
# Node-borne proof config (ADR-0057 keystone): authoring THIS block is what makes the capability
# inner-loop buildable — no NODE_BUILD_REGISTRY edit. NET-NEW (no editsExisting): the leaf authors a
# vitest jsdom component test that imports a NOT-YET-EXISTING component from a NEW source file under
# apps/studio/src/components (red = module-not-found against the source that does not exist at HEAD),
# then writes that one new component (green). FRONTEND-BUILDER TWO-STAGE (ADR-0070): this `real:` arm
# proves the GEOMETRY/BEHAVIOUR ONLY (POSTs the intent, busy state, renders done/error/refused/no-backend) —
# the panel's APPEARANCE inside the native shell is the `desktop` story's operator-attested UAT leg 7
# (the look is witnessed, never a machine visual verdict; do NOT add a visual assertion here).
# The proof command is the studio VITEST suite (`pnpm --filter studio test`), NOT node:test — the
# studio convention (apps/studio/src/components/*.test.tsx are @vitest-environment jsdom, vi.mock the
# api seam, @testing-library/react, fake timers). The scope narrows the gate's red→green diff to the
# one net-new component + its test; the command runs the suite (mirroring chat-sse-mount's whole-suite
# command + narrowed scope). `install: true` because the proof runs in a fresh worktree — tsx + tsc +
# vitest need the lockfile-only install (ADR-0031 §2). SCOPE = apps/studio/src (the panel is a studio
# frontend component; the desktop renders the COMPILED studio dist, ADR-0090 d.4 / ADR-0108 d.1) — NOT
# apps/desktop. The chat SSE BACKEND (chat-sse-mount, the route it POSTs) is already green at its own
# scope; THIS proves the renderer panel.
#
# CRITICAL — the real arm declares an explicit `proofCommand` (the vitest-runner-mismatch correction):
# the studio suite is VITEST + jsdom (`@testing-library/react`), NOT node:test. resolveProveSpec's
# DEFAULT real proof command is `node --import tsx --test <testFile>` (node:test), which CANNOT run a
# vitest jsdom `.test.tsx` (no `describe`/`it` from node:test, no jsdom env). So unlike a node:test
# package cap (e.g. studio-members/builder-role, where the single-file default is legal), this cap MUST
# declare a `real.proofCommand` that runs the one test file under VITEST: `pnpm --filter studio exec
# vitest run src/components/ChatPanel.test.tsx` (verified single-file invocation; cwd is apps/studio, so
# the path is package-relative). The spine's CONFIRM observation and the leaf's run_proof both ride this
# ONE command (the one-oracle property), so red→green is observed under the same vitest runner.
proof:
  command:
    file: pnpm
    args: ["--filter", "studio", "test"]
  scope:
    testGlobs: ["apps/studio/src/**/*.test.tsx", "apps/studio/src/**/*.test.ts"]
    sourceGlobs: ["apps/studio/src/**/*.ts", "apps/studio/src/**/*.tsx"]
  real:
    testFile: "apps/studio/src/components/ChatPanel.test.tsx"
    sourceFile: "apps/studio/src/components/ChatPanel.tsx"
    scope:
      testGlobs: ["apps/studio/src/components/ChatPanel.test.tsx"]
      sourceGlobs: ["apps/studio/src/components/ChatPanel.tsx"]
    install: true
    typecheck:
      file: pnpm
      args: ["--filter", "studio", "typecheck"]
    # The studio suite is vitest (jsdom), not node:test — so the default `node --test` real proof
    # cannot run this `.test.tsx`. Run the ONE test file under vitest (cwd = apps/studio).
    proofCommand:
      file: pnpm
      args:
        - "--filter"
        - "studio"
        - "exec"
        - "vitest"
        - "run"
        - "src/components/ChatPanel.test.tsx"
---

# The renderer chat panel — a thin client that POSTs /api/chat and renders the streamed done/error/refused frames

**Outcome —** The studio frontend adds a chat panel that POSTs the operator's intent to `/api/chat`,
streams the SSE response, and renders the session's terminal outcome — the `done` proposal, a distinct
`error` state, and a distinct `refused` (busy) state — disabling input while a session streams and
degrading honestly to a disabled "no backend" state where the chat route is unavailable. It is a **thin
client**: it never imports `@storytree/agent` / `@storytree/drive` and holds no model path; it parses
SSE `data:` frames as plain JSON.

**Depends on —** nothing (within `studio`). The panel is a self-contained behavioural component whose
ONLY backend seam is the studio `api` client (`apps/studio/src/api.ts`) — exactly the
[`BuildSection`](../../apps/studio/src/components/BuildSection.tsx) precedent (a presentational +
self-contained component, no app-data context, no router, the `api` client its single seam, so it is a
clean jsdom unit). It does NOT depend on `dev-server-persistence-backbone`: the chat route is not a
persistence-backbone handler — it is the desktop's [`chat-sse-mount`](../desktop/chat-sse-mount.md)
dispatcher (and, as a follow-on, possibly the studio dev server — see "Where /api/chat lives" below).
The panel only knows the WIRE SHAPE, not who serves it.

> **Proof status (honest) — NOT BUILT, `proposed`.** This precedes the code. It is the realization of
> the renderer chat **panel** the `desktop` story names as a `studio` frontend component: *"the renderer
> chat panel (the thin client that POSTs the intake and renders the SSE stream) is a `studio` frontend
> component (`apps/studio/src`) — the desktop renders the COMPILED studio dist, so a renderer panel is
> studio's surface, not the desktop's"* (`stories/desktop/story.md`, "Open modeling calls" #1 /
> "Renderer chat panel placement", the story-author's settled layout call). The chat SSE BACKEND it talks
> to is already BUILT and GREEN: the streaming CORE
> ([`chat-session-stream`](../headless-orchestrator/chat-session-stream.md), `startChatStream` in
> `@storytree/drive`, ADR-0108 Phase 2) and the desktop-side MOUNT
> ([`chat-sse-mount`](../desktop/chat-sse-mount.md), `POST /api/chat` → SSE, PR #439, signed verdict /
> ADR-0122 coverage 4/4). THIS capability adds the renderer panel those two halves were waiting on. Its
> *appearance inside the native shell* is the `desktop` story's operator-attested UAT leg 7 (ADR-0070 —
> the look is witnessed, never a machine visual verdict).

## Guidance

WHY THIS IS A CAPABILITY, NOT A CONTRACT: its honest proof is the CHAT PANEL AS A WHOLE — a behavioural
React component that, given the operator's typed intent, POSTs it to `/api/chat`, consumes the SSE event
stream, drives a busy state while a session is in flight, and renders THREE distinct terminal outcomes (a
`done` proposal, an `error`, a `refused`) plus an honest disabled "no backend" state. It spans the intake
(the submit + the empty-intent guard) AND the streaming consumption (parsing `data:` frames into typed
events) AND the per-terminal-state rendering, exercised against its single real collaborator (the `api`
streaming seam, scripted in the test) — so it is an integration test of the panel's behaviour over a
scripted stream, not a single isolated assertion.

WHY THIS IS A SEPARATE CAPABILITY, NOT FOLDED INTO `chat-sse-mount` (the splitting-rule, ADR-0010): the
mount and the panel sit on OPPOSITE sides of the HTTP boundary and prove DIFFERENT observables in
DIFFERENT suites. `chat-sse-mount` (a `desktop` capability) proves the BACKEND — a `node:http` dispatcher
that starts a real `orchestrate` session and serialises its events as SSE (proof scope `apps/desktop`,
`node:test`). THIS proves the FRONTEND — a React component that POSTs an intent and renders the streamed
outcome (proof scope `apps/studio/src`, vitest jsdom). They share the wire shape (the `done`/`error`/
`refused` `data:` frames) as a CONTRACT across the boundary, not a code edge: the panel never imports the
mount, and the mount never imports the panel. Distinct surface, distinct suite, distinct isolatable
net-new red→green — exactly why the renderer panel is a `studio` unit and the mount is a `desktop` unit
(the story-author's settled placement, `stories/desktop/story.md` #1).

THE PANEL IS A THIN CLIENT — NO AGENT, NO DRIVE, NO MODEL PATH (ADR-0108 d.1 / ADR-0004). The renderer
chat panel sends the POST and renders the SSE frames; it **never imports `@storytree/agent` and never
imports `@storytree/drive`** (both are on the `apps/studio/src` model-path FORBIDDEN list, enforced by
`apps/studio/src/modelPathBoundary.test.ts`). The agent boundary is the BACKEND process (the desktop
sidecar, ADR-0113 §2 / ADR-0119 §1) — the panel is downstream of the `/api/chat` route (and of
`static-server.ts`'s proxy). Because `@storytree/drive` is forbidden here, the panel does NOT import the
`ChatStreamEvent` type from drive — it **defines the wire-shape type LOCALLY** (a discriminated union
mirroring `done`/`error`/`refused`) and parses each SSE `data:` frame as plain JSON, exactly as
[`boot-read-routes`](../desktop/boot-read-routes.md) defines `LocalMe` locally rather than importing the
studio's `MeInfo`. This is why the panel needs **NO new cross-story `depends_on` edge** and **NO new
package import**: the SSE frames are plain JSON, so the panel rides the existing wire shape with a
locally-declared type. (See "No new cross-story edge" below for the boundary reasoning in full.)

THE STREAMING SEAM IS THE `api` CLIENT (the `BuildSection` precedent). The studio's existing `http<T>`
helper (`api.ts:25`) `JSON.parse`s the WHOLE response body — it cannot consume a streaming
`text/event-stream` response. So the panel's path to the chat route is a NEW streaming method on the
`api` client (e.g. `api.chatStream(intent, onEvent)` or an async-generator `api.chatStream(intent)`),
which `fetch`es `POST /api/chat`, reads the response body stream, splits it on the SSE frame separator
(`\n\n`), parses each `data:` line as JSON, and surfaces each typed event to the panel. The panel itself
holds NO `fetch` — its single seam is that `api` method, so the test mocks `../api` (the `BuildSection` /
`StoreBanner` discipline: `vi.hoisted` + `vi.mock('../api', …)`), drives every terminal outcome by
scripting the seam, and never opens a real socket. (Whether the streaming parse lives in `api.ts` or a
small `lib/` helper is the leaf's implementation call; the panel's contracts pin its BEHAVIOUR over the
seam, and the "POSTs to /api/chat" half is proven at whichever unit owns the `fetch`.)

THE WIRE SHAPE IT RENDERS (pin these — these are the `chat-sse-mount` SSE `data:` frames, the cross-
boundary contract): each SSE frame is `data: <json>\n\n` where `<json>` is one of —
- `{ "type": "done", "proposal": <string>, "costUsd"?: <number>, "turns"?: <number> }` — the terminal
  success: render the `proposal` text.
- `{ "type": "error", "error": <string> }` — the terminal failure (a dead/errored session): render the
  `error` distinctly (a failure state).
- `{ "type": "refused", "reason": <string> }` — the terminal single-session refusal (ADR-0108 d.6):
  render the `reason` distinctly from `error` (a "busy — try again" state, NOT a failure).
The stream ENDS after the terminal frame (the backend `end()`s the response). The panel parses frames as
they arrive (or on stream end — the leaf's call; the contracts pin the terminal render, which is the
journey).

DEGRADE HONESTLY WHERE THE ROUTE IS ABSENT (slow growth, the honest-failure discipline). The desktop
mounts `/api/chat`; the studio's STANDALONE dev server (`apps/studio/server/devApi.ts`) does NOT mount
the chat route today (see "Where /api/chat lives"). So in studio-standalone dev the POST is a 404 / a
fetch error. The panel must DEGRADE HONESTLY — a disabled input with a clear "chat is unavailable here"
state — never HANG on a stream that never arrives and never crash the surrounding studio. (Mirrors how
the studio's other surfaces degrade when their backend is absent — e.g. `StoreBanner`'s honest
store-unreachable copy, `BuildSection`'s graceful 409/down-server error phase.) This is a load-bearing
observable, not polish: the panel ships inside BOTH the native desktop (route present) and the standalone
studio (route absent today), and the absent-route path must be honest.

THE TWO-STAGE PROOF (frontend-builder, ADR-0070). This `real:` arm proves the GEOMETRY/BEHAVIOUR ONLY —
the panel POSTs the intent, shows a busy state while streaming, and renders the four distinct states
(done / error / refused / no-backend) over a scripted seam on fake timers. The panel's APPEARANCE inside
the native shell (does it read as one coherent app, ADR-0113 §9) is the `desktop` story's
operator-attested UAT leg 7 — witnessed by the owner, NEVER a machine visual verdict here. Do NOT author
a visual/appearance assertion in this capability's tests; the panel author does not sign a visual
verdict (ADR-0070 / the story's leg-7 wall).

OFFLINE-TESTABLE BY MOCKING THE SEAM (the SAME discipline `BuildSection.test.tsx` / `StoreBanner.test.tsx`
use): `@vitest-environment jsdom`, `vi.mock('../api', …)` to script the streaming seam, `@testing-library/
react` for render/`fireEvent`, fake timers to drive the streaming transitions deterministically. No real
`fetch`, no real socket, no live SDK, no DB, no Electron. Every terminal outcome is scripted by the seam
mock; the no-backend state is driven by scripting the seam to reject.

## No new cross-story edge (the boundary call — ADR-0010 §4 / ADR-0074)

The panel CONSUMES the `/api/chat` SSE wire shape (`chat-sse-mount`'s `done`/`error`/`refused` frames),
but consuming a WIRE SHAPE over HTTP is **not** a package import and is **not** a new `depends_on` edge:

- **No `@storytree/drive` import.** The `ChatStreamEvent` type lives in `@storytree/drive`, which is on
  the `apps/studio/src` model-path FORBIDDEN list (`modelPathBoundary.test.ts`, ADR-0004 / ADR-0090 d.2).
  The panel parses SSE `data:` frames as plain JSON against a LOCALLY-DEFINED discriminated union — never
  importing the type. (Same move `boot-read-routes` makes for `LocalMe`: re-declare the wire shape
  locally rather than couple to the producer's source.)
- **No new package dep in `apps/studio/package.json`.** Because the frames are plain JSON parsed against a
  local type, the panel adds NO `@storytree/*` runtime import the boundary scan (`check:boundaries`,
  ADR-0100 — it walks `apps/*` deps) would require a declared edge for. The studio already declares
  `@storytree/drive` (its SERVER lazy-imports the build/orchestrate drivers), but the FRONTEND must not
  import it (the model-path wall) — so the panel rides nothing new.
- **The cross-boundary contract is the wire shape, owned by `chat-sse-mount`.** The
  `done`/`error`/`refused` `data:` frame shape is `chat-sse-mount`'s declared output (its
  `csm-streams-events-as-sse` / `csm-fails-closed-on-dead-session` / refused contracts). The panel is a
  CONSUMER of that contract across the HTTP boundary — the dependency is on the SHAPE, enforced by both
  sides authoring to the same frame, not by a code edge. This is the "declare the edge, never work around
  it" pattern applied honestly: there is no package edge to declare because there is no package import —
  the HTTP wire is the seam.

So `depends_on: []` (within-story) and no frontmatter cross-story edge is the correct, honest graph. If a
future change makes the panel import a `@storytree/*` package (it should not — that would breach the
model-path wall), THAT would require a declared edge; the JSON-over-HTTP path does not.

## Where /api/chat lives (a follow-on, NOT pulled into this capability)

The panel POSTs `/api/chat`. WHO serves that route depends on the host:
- **Inside the native desktop:** the [`chat-sse-mount`](../desktop/chat-sse-mount.md) dispatcher (mounted
  by the Electron sidecar) serves it. This is where the chat panel ships FIRST and is exercised live (the
  `desktop` story's UAT leg 7).
- **In the standalone studio dev server (`apps/studio/server/devApi.ts`):** the chat route is NOT mounted
  today. Whether the studio dev server SHOULD also mount `/api/chat` (re-composing `startChatStream` the
  way the desktop sidecar does, so a studio-dev session can chat too) is a SEPARATE follow-on — it is a
  `studio`/`dev-server-persistence-backbone`-adjacent server concern, not this panel's net-new. This
  capability deliberately does NOT pull it in (slow growth: the panel's net-new is the renderer + its
  honest absent-route degradation; the dev-server mount rides separately). Until that follow-on lands,
  the panel's "no backend" state IS the honest studio-standalone behaviour (proven by the
  `cp-degrades-when-route-absent` contract).

## Integration test

**Goal —** Prove that the chat panel, given the operator's typed intent, POSTs it to `/api/chat` (through
the `api` streaming seam) EXACTLY once, drives a busy state while the session streams, and renders the
correct terminal outcome for each of the three SSE terminal frames — a `done` proposal, a distinct
`error` failure, and a distinct `refused` (busy) state — plus an honest disabled "no backend" state when
the seam rejects (the route is absent). Entirely in jsdom: the `api` streaming seam is mocked (scripted),
fake timers drive the streaming transitions, no real `fetch`/socket/SDK/DB/Electron.

The integration test exercises this capability against its **real in-story collaborator** — the panel's
single seam, the `api` streaming method — scripted as a double exactly as `BuildSection.test.tsx` scripts
`api.build`/`api.buildStatus`. No stubs within the panel's own composition (the render, the busy state,
the frame-to-state mapping are all real).

The integration test would:

1. Mock `../api` (`vi.hoisted` + `vi.mock`) with a scripted `chatStream` seam. Render `<ChatPanel />` in
   jsdom on fake timers.
2. Type an intent and submit → assert the seam was called EXACTLY once with the typed intent, and the
   panel flips into a busy/streaming state (input disabled, a "working" affordance) — proving the POST
   fires once and the panel does not accept a second concurrent submit.
3. Script the seam to emit a terminal `done` frame → assert the panel renders the `proposal` text and
   leaves the busy state (input re-enabled) — the success journey.
4. Script the seam to emit a terminal `error` frame → assert the panel renders the failure distinctly (an
   error state carrying the `error` text), NOT a proposal — the honest-failure path.
5. Script the seam to emit a terminal `refused` frame → assert the panel renders a DISTINCT "busy — try
   again" state carrying the `reason`, visibly different from the `error` state — so the operator can
   retry rather than read a failure (the single-session refusal, ADR-0108 d.6, surfaced to the user).
6. Submit a blank/whitespace-only intent → assert NO seam call (the empty-intent guard fires client-side)
   — never a POST of an empty intent.
7. Script the seam to REJECT (a 404 / fetch error — the route is absent, the studio-standalone case) →
   assert the panel renders an honest disabled "chat is unavailable" state and does NOT hang on a stream
   that never arrives and does NOT crash — the honest absent-route degradation.

## Contracts (5)

The test-proven leaf behaviours — each **one isolated automated test** in the `studio` suite (vitest
jsdom, `apps/studio/src/components/ChatPanel.test.tsx`), the `api` streaming seam mocked/scripted. None
exist yet; each is the assertion a contract test WILL prove against the real chat-panel code once authored
(provisional path — re-cite at real `file:line` when built). Per ADR-0122 (`storytree coverage`), each
contract id is the lead of a distinctly-named test, so the coverage check reports 5/5. None of these is an
APPEARANCE assertion — the look is the `desktop` story's operator-attested UAT leg 7 (ADR-0070).

1. **`cp-posts-intent-once-and-shows-busy`** — submitting an intent POSTs to /api/chat once and shows a busy state
   - **asserts —** typing an intent and submitting calls the `api` streaming seam EXACTLY once with the
     typed intent and flips the panel into a busy/streaming state (input disabled, a "working"
     affordance) until the stream terminates — a double-submit cannot fire a second concurrent POST. The
     panel's ONLY path to the chat route is the `api` seam (ADR-0004) — it imports no agent/drive/model
     code.
   - **covers —** `apps/studio/src/components/ChatPanel.tsx` (the submit + POST-once + busy state)
     *(provisional path)*
2. **`cp-renders-the-done-proposal`** — a terminal done frame renders the proposal and ends the busy state
   - **asserts —** when the scripted seam emits a terminal `done` frame, the panel renders the `proposal`
     text and leaves the busy state (input re-enabled) — the success journey, the streamed proposal shown
     to the operator.
   - **covers —** `apps/studio/src/components/ChatPanel.tsx` (the `done` → proposal render) *(provisional path)*
3. **`cp-renders-error-distinctly`** — a terminal error frame renders a distinct failure state
   - **asserts —** when the scripted seam emits a terminal `error` frame, the panel renders a distinct
     failure state carrying the `error` text — NOT a proposal, and visibly distinct from the `refused`
     state below. The honest-failure path (a dead/errored session), forwarded from the consumed core.
   - **covers —** `apps/studio/src/components/ChatPanel.tsx` (the `error` → failure-state render) *(provisional path)*
4. **`cp-renders-refused-as-busy-retry`** — a terminal refused frame renders a distinct "busy — try again" state
   - **asserts —** when the scripted seam emits a terminal `refused` frame (the single-session guard,
     ADR-0108 d.6), the panel renders a DISTINCT "busy — try again" state carrying the `reason`, visibly
     different from the `error` state — so the operator retries rather than reads a failure. (The
     blank-intent client-side guard — no seam call on an empty/whitespace intent — is asserted within
     this contract's sibling case, sharing the same component surface; it is part of the intake's
     fail-closed behaviour, not a separately-coverable name.)
   - **covers —** `apps/studio/src/components/ChatPanel.tsx` (the `refused` → busy-retry render + the
     empty-intent guard) *(provisional path)*
5. **`cp-degrades-when-route-absent`** — a rejected seam (absent route) renders an honest disabled state, never hangs
   - **asserts —** when the scripted seam REJECTS (a 404 / fetch error — the studio-standalone case where
     `/api/chat` is not mounted), the panel renders an honest disabled "chat is unavailable" state and
     does NOT hang on a never-arriving stream and does NOT crash the surrounding surface — the honest
     absent-route degradation.
   - **covers —** `apps/studio/src/components/ChatPanel.tsx` (the rejected-seam → honest disabled state)
     *(provisional path)*

## Guidance — the net-new slice that earns the signed verdict

The brownfield bootstrap rung toward `healthy` (ADR-0057 §3, NET-NEW): author the chat panel as a new
component, test-first.

- **The new test —** `apps/studio/src/components/ChatPanel.test.tsx` (`@vitest-environment jsdom`,
  vitest + `@testing-library/react`, the studio package convention — `vi.hoisted` + `vi.mock('../api', …)`
  to script the streaming seam, fake timers, exactly as `BuildSection.test.tsx` / `StoreBanner.test.tsx`
  do; NO real `fetch`/socket/SDK/DB/Electron). Import `{ ChatPanel }` from `"./ChatPanel"`. Name each
  test for its contract id (`cp-…`) so `storytree coverage chat-panel` reports 5/5 (ADR-0122).
- **The RED the spine observes (before IMPLEMENT) —** the import resolves NOTHING — `ChatPanel.tsx` does
  not exist at HEAD, so the test fails module-not-found (the net-new missing-symbol red, ADR-0057).
  Assert the POST-once + busy state, the three terminal renders (done/error/refused), the blank-intent
  guard, and the honest no-backend state.
- **The GREEN —** write `apps/studio/src/components/ChatPanel.tsx`: a behavioural React component whose
  single backend seam is the `api` streaming method (add `api.chatStream` to `apps/studio/src/api.ts`, or
  a small `lib/` helper — the leaf's call; whichever owns the `fetch` owns the "POSTs to /api/chat" half).
  It defines the wire-shape type LOCALLY (a `done`/`error`/`refused` discriminated union), parses SSE
  `data:` frames as plain JSON, drives a busy state while streaming, renders the four states, guards the
  empty intent client-side, and degrades honestly when the seam rejects. NO `@storytree/agent`, NO
  `@storytree/drive`, NO model path (the `modelPathBoundary.test.ts` wall must stay green). After it, the
  import resolves, the assertions hold, and `pnpm --filter studio test` + `pnpm --filter studio typecheck`
  stay green. WIRING the panel into the studio's app shell (where it mounts in the layout) + the live SDK
  chat run + the appearance are witnessed under the `desktop` Story UAT leg 7 (operator-attested,
  ADR-0070), not asserted in CI.

Rules:

- **Thin client — no agent, no drive, no model path** (ADR-0108 d.1 / ADR-0004). The panel's only seam to
  the chat route is the `api` streaming method; it imports no agent/drive/model code and defines the wire
  shape locally. The `modelPathBoundary.test.ts` guard pins this repo-wide; the panel must not breach it.
- **Parse SSE `data:` frames as plain JSON** against a locally-declared `done`/`error`/`refused` union —
  never import `ChatStreamEvent` from drive (it is forbidden in `apps/studio/src`).
- **Render the three terminal states DISTINCTLY** — `done` (proposal), `error` (failure), `refused`
  (busy — try again, NOT a failure). The test pins all three (`cp-renders-the-done-proposal`,
  `cp-renders-error-distinctly`, `cp-renders-refused-as-busy-retry`).
- **Fail closed, never hang** — a blank intent is guarded client-side with no POST
  (`cp-renders-refused-as-busy-retry`'s sibling case); an absent route renders an honest disabled state,
  never a hung stream (`cp-degrades-when-route-absent`); a double-submit cannot fire a second POST
  (`cp-posts-intent-once-and-shows-busy`).
- **Appearance is operator-attested, not asserted here** (ADR-0070) — prove geometry/behaviour only; the
  look inside the native shell is the `desktop` story's UAT leg 7. Do not author a visual verdict.
- **Renderer panel only (slow growth)** — render the chat over the `/api/chat` wire shape. Do NOT mount
  the chat route (that is `chat-sse-mount`'s, and the studio-dev-server mount is a separate follow-on), do
  NOT import the agent/drive, do NOT add signing/build/PR (read/propose only, inherited from the consumed
  core, ADR-0091).
