---
id: "accept-to-land-affordance"
tier: capability
story: chat-drive-bridge
title: "The accept-to-land affordance — an explicit, non-spoofable Build button on a proposal carrying a unit id"
outcome: "The chat thin client renders an explicit, non-spoofable Build affordance ONLY on a proposal carrying a `proposedUnitId`; clicking it dispatches the build through the `api` seam and renders the run's progress — the human accept-to-land gate (geometry/behaviour machine-witnessed; appearance operator-attested)."
status: proposed
proof_mode: integration-test
depends_on: [chat-build-dispatch]
# Node-borne proof config (ADR-0057 keystone): authoring THIS block is what makes the capability
# inner-loop buildable — no NODE_BUILD_REGISTRY edit. EDIT-EXISTING (editsExisting: true): ChatPanel.tsx
# already exists at HEAD (the chat-panel capability landed it — it renders the done/error/refused/
# unavailable frames). This increment EDITS it to add the accept-to-land Build affordance: the leaf
# authors a NEW failing vitest jsdom component test (ChatPanel.accept.test.tsx) that renders the panel
# given a `done` frame carrying a `proposedUnitId`, asserts a Build button appears, fires a click, and
# asserts the build-dispatch seam was called with that id — RED at HEAD because ChatPanel renders the
# done proposal as PLAIN TEXT with no Build button and the api client has no build-dispatch method —
# then EDITS ChatPanel.tsx (+ api.ts) to add the button + the dispatch call (green). FRONTEND-BUILDER
# TWO-STAGE (ADR-0070): this `real:` arm proves the GEOMETRY/BEHAVIOUR ONLY (the button appears only on
# a proposedUnitId-bearing frame, clicking it POSTs the accepted id through the api seam, the run's
# progress renders) — the affordance's APPEARANCE inside the native shell is the story's operator-
# attested UAT leg 6 (the look is witnessed, never a machine visual verdict; do NOT add a visual
# assertion here). RUNNER: the studio suite is VITEST + jsdom (NOT node:test — the vitest-runner-mismatch
# trap), so the real arm declares an explicit proofCommand running the ONE test file under vitest (the
# DEFAULT real proof `node --test` cannot run a vitest jsdom .test.tsx). `install: true` because the
# proof runs in a fresh worktree — tsx + tsc + vitest need the lockfile-only install (ADR-0031 §2).
# SCOPE = apps/studio/src (the panel is a studio frontend component; the desktop renders the COMPILED
# studio dist, ADR-0090 d.4 / ADR-0108 d.1). The chat-side build DISPATCH (capability 3, apps/studio/
# server) is a CONSUMED dependency reached over the api/HTTP seam, not a co-edited file.
proof:
  command:
    file: pnpm
    args: ["--filter", "studio", "test"]
  scope:
    testGlobs: ["apps/studio/src/**/*.test.tsx", "apps/studio/src/**/*.test.ts"]
    sourceGlobs: ["apps/studio/src/**/*.ts", "apps/studio/src/**/*.tsx"]
  real:
    testFile: "apps/studio/src/components/ChatPanel.accept.test.tsx"
    sourceFile: "apps/studio/src/components/ChatPanel.tsx"
    scope:
      testGlobs: ["apps/studio/src/components/ChatPanel.accept.test.tsx"]
      sourceGlobs: ["apps/studio/src/components/ChatPanel.tsx"]
    editsExisting: true
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
        - "src/components/ChatPanel.accept.test.tsx"
---

# The accept-to-land affordance — an explicit, non-spoofable Build button on a proposal carrying a unit id

**Outcome —** The chat thin client renders an explicit, non-spoofable Build affordance ONLY on a
proposal carrying a `proposedUnitId`; clicking it dispatches the build through the `api` seam and renders
the run's progress — the human accept-to-land gate (geometry/behaviour machine-witnessed; appearance
operator-attested).

**Depends on —** [`chat-build-dispatch`](chat-build-dispatch.md) — the affordance is the thin-client
front of the dispatch: clicking Build calls the dispatch (through the `api`/HTTP seam) with the accepted
unit id and renders the run's progress. It owns no dispatch/validation logic.

> **Proof status (honest) — `proposed`, EDIT-EXISTING two-stage.** This is **ADR-0108 decision 3** made
> concrete — the explicit, non-spoofable human accept-to-land gate — and the keystone of **Phase 4**.
> The `ChatPanel` already renders a `done` proposal as PLAIN TEXT (`apps/studio/src/components/
> ChatPanel.tsx`, the chat-panel capability) and the client now receives a machine-actionable
> `proposedUnitId` on that `done` frame (capabilities 1–2); the chat-side build dispatch exists
> (capability 3). What is MISSING is the human gate: a Build button on a proposal that carries a
> `proposedUnitId`, whose click ACCEPTS the proposed unit and dispatches the build — the human's
> deliberate gesture, NEVER a free-text "yes" the agent parses (ADR-0108 d.3). This capability EDITS the
> panel to add that affordance. Its GEOMETRY/BEHAVIOUR is machine-witnessed; its APPEARANCE inside the
> native shell is the story's operator-attested UAT leg 6 (ADR-0070).

## Guidance

WHY THIS IS A CAPABILITY, NOT A CONTRACT: its honest proof is the ACCEPT AFFORDANCE AS A WHOLE — a
behavioural change to the panel that, given a `done` frame carrying a `proposedUnitId`, surfaces a Build
button; on click, dispatches the build through the `api` seam with the accepted id; and renders the
dispatched run's coarse progress to its terminal state. It spans the conditional render (button appears
ONLY with a `proposedUnitId`), the click → dispatch, and the progress render over the scripted seam — so
it is an integration test of the panel's behaviour over a scripted dispatch seam, not a single isolated
assertion.

THE ACCEPT IS EXPLICIT AND NON-SPOOFABLE (ADR-0108 decision 3 — the load-bearing wall): the human's
gate is a deliberate UI gesture — a Build button / confirm the operator CLICKS. It is NEVER a free-text
"yes" parsed from the conversation. The panel must have NO code path by which typing "yes build it" (or
any prose) into the chat triggers a build — the ONLY trigger is the explicit click on the affordance,
which is shown ONLY when the proposal carries a machine-actionable `proposedUnitId` (the agent's
structural declaration, capability 1). The agent PROPOSES (declares the id); the human ACCEPTS (clicks);
the two are separate acts and the agent cannot manufacture the click. Get this wrong — auto-dispatching
on stream end, or parsing the proposal text for an intent to build — and you have collapsed the human
gate ADR-0108 d.3 requires.

THE BUTTON APPEARS ONLY ON A PROPOSED-UNIT-ID-BEARING FRAME: a `done` frame WITHOUT a `proposedUnitId`
(a proposal the agent did not attach a machine-actionable id to) shows the proposal text and NO Build
button — there is nothing safe to dispatch, so the affordance is absent (never a button that would POST
an empty/unknown id). A `done` frame WITH a `proposedUnitId` shows the proposal text AND the Build
button. This conditional is the contract that ties the accept to the structural signal.

THE CLICK DISPATCHES THROUGH THE `api` SEAM (the thin-client discipline, ADR-0004): clicking Build calls
a NEW `api` method (e.g. `api.dispatchBuild(unitId)` / reuse `api.build` if its shape already POSTs
`{ unitId }` to the build route) that POSTs the ACCEPTED `proposedUnitId` to the chat-side build dispatch
(capability 3, over HTTP). The panel holds NO `fetch` and NO agent/drive/model import — its only path is
the `api` seam (the `BuildSection` / chat-panel discipline). The test mocks `../api` and scripts the
dispatch seam; it never opens a real socket. (Whether the click reuses the existing `/api/build`
POST/poll the studio Build button uses, or a chat-specific dispatch route, is the leaf's wiring call;
the contracts pin the panel's BEHAVIOUR over the seam — an accepted id is POSTed once, the run's progress
renders.)

THE RUN'S PROGRESS RENDERS IN THE CONVERSATION (the streamed-back half, ADR-0108 d.7): after the click,
the panel renders the dispatched run's coarse progress (the worker's transcript lines, read back via the
`api` seam — the poll the desktop mount reuses) to a terminal state (the signed verdict / opened PR on
success, an honest failed-build state on failure). The build's journey shows in the SAME conversation —
proposal → accept → progress → landed. The panel renders what the dispatch seam surfaces; it owns no
build logic.

PROOF INTEGRITY — THE CLICK AUTHORIZES, THE SPINE SIGNS (ADR-0091): clicking Build sends a build INTENT
(an accepted unit id); the spine inside the worker observes RED→GREEN and SIGNS; CI re-proves green
before the trunk (ADR-0022 — "clicking Build IS the approval to land"). The panel holds no signing key
and hands in no verdict. The human's click is the accept-to-land gate (ADR-0108 d.3); the agent signed
nothing.

THE TWO-STAGE PROOF (frontend-builder, ADR-0070): this `real:` arm proves the GEOMETRY/BEHAVIOUR ONLY —
the button appears only on a `proposedUnitId`-bearing frame, clicking it POSTs the accepted id through
the seam exactly once, and the run's progress renders — over a scripted seam on fake timers. The
affordance's APPEARANCE inside the native shell (does the gate read as a deliberate, legible accept; does
the progress feel alive; ADR-0113 §9) is the story's operator-attested UAT leg 6 — witnessed by the
owner, NEVER a machine visual verdict here. Do NOT author a visual/appearance assertion in this
capability's tests; the panel author does not sign a visual verdict.

OFFLINE-TESTABLE BY MOCKING THE SEAM (the chat-panel discipline): `@vitest-environment jsdom`,
`vi.mock('../api', …)` to script the dispatch + progress seam, `@testing-library/react` for
render/`fireEvent`, fake timers to drive the progress transitions deterministically. No real `fetch`, no
real socket, no live SDK, no DB, no Electron. The accepted-id POST and the progress render are scripted
by the seam mock.

## Integration test

**Goal —** Prove that the chat panel, given a `done` frame carrying a `proposedUnitId`, surfaces an
explicit Build button; that clicking it POSTs the ACCEPTED id through the `api` dispatch seam exactly
once and renders the dispatched run's progress; that a `done` frame WITHOUT a `proposedUnitId` shows NO
Build button; and that there is NO path by which free text triggers a build. Entirely in jsdom: the `api`
dispatch/progress seam is mocked (scripted), fake timers drive the transitions, no real
`fetch`/socket/SDK/DB/Electron.

The integration test exercises this capability against its **real in-story collaborator** — the panel's
`api` dispatch seam — scripted as a double, exactly as the chat-panel tests script `api.chatStream`. No
stubs within the panel's own composition (the conditional render, the click handler, the progress render
are all real).

The integration test would:

1. Mock `../api` (`vi.hoisted` + `vi.mock`) with a scripted chat-stream seam AND a scripted build
   dispatch/progress seam. Render `<ChatPanel />` in jsdom on fake timers.
2. Drive the chat stream to a terminal `done` frame carrying a `proposedUnitId` → assert the panel
   renders the proposal text AND an explicit Build button (the accept affordance appears because the
   frame carries a machine-actionable id).
3. Click Build → assert the dispatch seam was called EXACTLY once with the `proposedUnitId` from the
   frame (the accepted id), and the panel flips into a dispatched/building state — proving the click is
   the trigger and the accepted id is the proposed id.
4. Script the dispatch seam to surface coarse progress to a terminal `passed` state → assert the panel
   renders the run's progress and the terminal outcome in the conversation (the streamed-back half).
5. Drive the chat stream to a terminal `done` frame WITHOUT a `proposedUnitId` → assert NO Build button
   is rendered (nothing safe to dispatch) — the proposal text shows, the affordance is absent.
6. Assert there is NO code path by which free text triggers a build: typing prose (e.g. "yes, build it")
   into the chat input and submitting drives the chat stream (a propose call), NEVER the dispatch seam —
   the build seam is reached ONLY by the explicit Build click (ADR-0108 d.3). The thin client imports no
   agent/drive/model (the `modelPathBoundary.test.ts` wall stays green).
7. A dispatched build that FAILS (the dispatch seam surfaces a failed terminal state) → the panel renders
   an honest failed-build state in the conversation, never a forged success.

## Contracts (4)

The test-proven leaf behaviours — each **one isolated automated test** in the `studio` suite (vitest
jsdom, `apps/studio/src/components/ChatPanel.accept.test.tsx`), the `api` dispatch/progress seam
mocked/scripted. Per ADR-0122 (`storytree coverage`), each contract id is the lead of a distinctly-named
test, so the coverage check reports 4/4. None of these is an APPEARANCE assertion — the look is the
story's operator-attested UAT leg 6 (ADR-0070).

1. **`atl-build-button-on-proposed-id`** — a `done` frame carrying a `proposedUnitId` surfaces a Build button
   - **asserts —** when the chat stream terminates with a `done` frame carrying a `proposedUnitId`, the
     panel renders the proposal text AND an explicit Build button — the accept affordance appears because
     the proposal carries a machine-actionable id (capability 1's structural signal).
   - **covers —** `apps/studio/src/components/ChatPanel.tsx` (the conditional Build affordance) *(provisional path)*
2. **`atl-no-button-without-proposed-id`** — a `done` frame without a `proposedUnitId` shows no Build button
   - **asserts —** when the `done` frame carries NO `proposedUnitId`, the panel renders the proposal text
     and NO Build button — there is nothing safe to dispatch, so the affordance is absent (never a button
     that would POST an empty/unknown id).
   - **covers —** `apps/studio/src/components/ChatPanel.tsx` (the absent-affordance branch) *(provisional path)*
3. **`atl-click-dispatches-accepted-id`** — clicking Build POSTs the accepted id once and renders progress
   - **asserts —** clicking Build calls the `api` dispatch seam EXACTLY once with the frame's
     `proposedUnitId` (the accepted id) and the panel renders the dispatched run's coarse progress to its
     terminal state — the human's explicit accept dispatches the build and the build's journey shows in
     the conversation. A failed dispatched build renders an honest failed state (no forged success).
   - **covers —** `apps/studio/src/components/ChatPanel.tsx` (the click → dispatch + progress render) *(provisional path)*
4. **`atl-no-free-text-build-path`** — only the explicit click triggers a build, never parsed prose
   - **asserts —** typing prose into the chat input and submitting drives the chat-STREAM seam (a propose
     call), NEVER the build dispatch seam — there is no code path by which a free-text "yes" triggers a
     build; the dispatch is reached ONLY by the explicit Build click (ADR-0108 d.3, the non-spoofable
     human gate). The panel imports no agent/drive/model (ADR-0004).
   - **covers —** `apps/studio/src/components/ChatPanel.tsx` (the submit-vs-click separation) *(provisional path)*

## Guidance — the edit-existing slice that earns the signed verdict

The brownfield rung toward `healthy` (ADR-0057 §3, EDIT-EXISTING): `ChatPanel.tsx` already landed (the
chat-panel capability) and renders the `done`/`error`/`refused`/`unavailable` frames. This increment
EDITS it to add the accept-to-land Build affordance, test-first.

- **The new test —** `apps/studio/src/components/ChatPanel.accept.test.tsx` (`@vitest-environment jsdom`,
  vitest + `@testing-library/react`, the studio convention — `vi.hoisted` + `vi.mock('../api', …)` to
  script the streaming + dispatch seams, fake timers; the SAME discipline `ChatPanel.test.tsx` /
  `BuildSection.test.tsx` use; NO real `fetch`/socket/SDK/DB/Electron). Import `{ ChatPanel }` from
  `"./ChatPanel"`. Name each test for its contract id (`atl-…`) so `storytree coverage` reports 4/4
  (ADR-0122). (A separate test FILE from `ChatPanel.test.tsx` keeps the gate's red→green diff scoped to
  this increment.)
- **The RED the spine observes (before IMPLEMENT) —** `ChatPanel.tsx` EXISTS, so the red is a RUNTIME
  assertion, not module-not-found: render the panel given a `done` frame carrying a `proposedUnitId` and
  assert a Build button is present (and, on click, the dispatch seam is called with the id). At HEAD the
  panel renders the `done` proposal as PLAIN TEXT with no Build button → the query for the button finds
  nothing → red. ASSERT THE BUTTON + THE DISPATCH CALL, never just that the proposal rendered (that is
  green at HEAD and fails CONFIRM_RED).
- **The GREEN —** EDIT `apps/studio/src/components/ChatPanel.tsx`: extend the `done` Phase to carry the
  optional `proposedUnitId` (threaded from the `ChatEvent` done frame — re-declare the wire field on the
  local `ChatEvent`/`done` type, the chat-panel's local-type discipline), render a Build button ONLY when
  `proposedUnitId` is present, and on click call a NEW `api` dispatch method (add to
  `apps/studio/src/api.ts`, or reuse `api.build` if its shape already POSTs `{ unitId }`) with the
  accepted id, then render the run's progress (reuse the poll the studio Build section uses, surfaced
  through the seam). NO `@storytree/agent`, NO `@storytree/drive`, NO model path (the
  `modelPathBoundary.test.ts` wall must stay green). After it, the button-present + click-dispatches +
  no-button-without-id + no-free-text-path assertions hold, and `pnpm --filter studio test` +
  `pnpm --filter studio typecheck` stay green. WIRING the dispatched build's live run to a real signed
  verdict + opened PR, and the affordance's appearance, are witnessed under the story's UAT legs 5–6
  (operator-attested, ADR-0070), not asserted in CI.

Rules:

- **Explicit, non-spoofable accept** — the ONLY build trigger is the human's click on the Build button,
  shown ONLY on a `proposedUnitId`-bearing frame; NEVER a free-text "yes" parsed from the conversation
  (`atl-no-free-text-build-path`, ADR-0108 d.3). No auto-dispatch on stream end.
- **Thin client — no agent, no drive, no model path** (ADR-0108 d.1 / ADR-0004). The panel's only seam
  to the dispatch is the `api` method; it imports no agent/drive/model code. The
  `modelPathBoundary.test.ts` guard pins this; the edit must not breach it.
- **The click sends an INTENT, not a verdict** — POST the accepted unit id; hold no signing key, no
  verdict path (ADR-0091). The spine signs; CI lands ("clicking Build IS the approval to land",
  ADR-0022).
- **Button only on a structural signal** — render Build ONLY when `proposedUnitId` is present
  (`atl-build-button-on-proposed-id` / `atl-no-button-without-proposed-id`); never a button that would
  POST an empty/unknown id.
- **Appearance is operator-attested, not asserted here** (ADR-0070) — prove geometry/behaviour only; the
  look + the legibility of the gate inside the native shell is the story's UAT leg 6. Do not author a
  visual verdict.
- **Edit, don't fork** — the existing `done`/`error`/`refused`/`unavailable` rendering is untouched
  except for the additive `proposedUnitId` carry + the conditional Build affordance + the progress
  render. The panel's existing behaviour stays green.
