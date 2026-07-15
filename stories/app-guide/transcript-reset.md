---
id: "transcript-reset"
tier: capability
story: terminal-chat
title: "A reset control clears the transcript to idle and aborts the in-flight SSE stream"
outcome: "A reset control clears the whole transcript back to the idle empty state AND aborts any in-flight SSE stream — via an AbortController threaded through `api.chatStream` into the fetch — so the operator recovers a fresh terminal without reloading the app."
status: proposed
proof_mode: integration-test
depends_on: [multi-turn-transcript, auto-grow-input]
# Node-borne proof config (ADR-0057 keystone): authoring THIS block is what makes the capability
# inner-loop buildable — no NODE_BUILD_REGISTRY edit. BROWNFIELD (editsExisting): the panel has NO reset
# at HEAD, and `api.chatStream(intent, onEvent)` takes NO signal (apps/studio/src/api.ts:104). The RED the
# spine observes: (1) an assertion that clicking a reset control clears the transcript to idle fails (no
# reset control exists), and (2) an assertion that reset ABORTS the in-flight stream — the AbortSignal
# threaded into api.chatStream is passed to fetch and the stream stops — fails against the signalless
# chatStream at HEAD. The isolatable red→green is BOTH the ChatPanel reset (clear-to-idle) AND the api.ts
# signal threading (api.chatStream(intent, onEvent, signal?) → fetch({ signal })), proven together in the
# studio suite by scripting the seam with the signal. Sequenced AFTER multi-turn-transcript + auto-grow-
# input: it edits the SAME component file (ChatPanel.tsx) plus api.ts, so in the shared --real worktree it
# builds on their committed versions (ADR-0057 §3 expansion D). THIN-CLIENT WALL HOLDS: threading an
# AbortSignal into api.chatStream and onto fetch stays inside apps/studio/src — no agent/drive/model
# import (modelPathBoundary.test.ts stays green). FRONTEND-BUILDER TWO-STAGE (ADR-0070): clear-to-idle +
# abort-in-flight are machine-proven; the terminal FEEL of a clean reset is the story's operator-attested
# UAT leg. Studio VITEST suite, one-file real proofCommand (chat-panel precedent). `install: true`
# (ADR-0031 §2).
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
    editsExisting: true
    scope:
      testGlobs: ["apps/studio/src/components/ChatPanel.test.tsx"]
      sourceGlobs: ["apps/studio/src/components/ChatPanel.tsx", "apps/studio/src/api.ts"]
    install: true
    typecheck:
      file: pnpm
      args: ["--filter", "studio", "typecheck"]
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

# A reset control clears the transcript to idle and aborts the in-flight SSE stream

**Outcome —** A reset control clears the whole transcript back to the idle empty state AND aborts any
in-flight SSE stream — via an `AbortController` threaded through `api.chatStream` into the `fetch` — so the
operator recovers a fresh terminal without reloading the app.

**Depends on —**
- [`multi-turn-transcript`](multi-turn-transcript.md) — reset CLEARS the transcript that capability
  introduces (it consumes the transcript state to clear it), and edits the SAME component file. A real
  data-flow + file-sequencing edge.
- [`auto-grow-input`](auto-grow-input.md) — edits the SAME component file (`ChatPanel.tsx`); in the shared
  `--real` worktree it builds on that capability's committed version (a later node builds on earlier
  committed source, ADR-0057 §3 expansion D). The reset also returns the input to its one-row resting
  height (the grow capability's base), so the two touch the same input.

> **Proof status (honest) — BROWNFIELD, `proposed`.** The panel has NO reset at HEAD, and
> `api.chatStream(intent, onEvent)` takes NO abort signal (`apps/studio/src/api.ts:104`). The owner's live
> ADR-0137 Phase-3 UAT walk (2026-07-03) flagged it: "there is no reset; add one." This capability adds a
> reset control that clears the transcript AND aborts the in-flight stream.

## Guidance

WHY THIS IS A CAPABILITY, NOT A CONTRACT: its honest proof is the RESET AS A WHOLE — a control that, on
click, (a) clears the accumulated transcript back to the idle empty state (input re-enabled, resting
height, no scrollback), AND (b) ABORTS any in-flight SSE stream so a mid-stream reset does not leave a
zombie fetch delivering frames into a cleared panel. It spans the renderer clear AND the abort path
threaded through the `api` seam into `fetch` — two coupled behaviours across the panel and the `api`
client, not a single isolated assertion.

THE TWO HALVES — CLEAR + ABORT (both load-bearing). A reset that only clears state but leaves the fetch
running is a DEFECT: the in-flight stream would keep resolving and could push a terminal frame into the
freshly-cleared transcript (a ghost reply), or hold the single-session guard. So reset must ALSO abort. The
abort path: the panel holds an `AbortController` for the current send, passes its `signal` into
`api.chatStream(intent, onEvent, signal?)`, and `api.chatStream` passes it to `fetch(url, { signal })`; on
reset the panel calls `controller.abort()`, which rejects the fetch and stops the stream. The test scripts
the seam to observe the signal — assert the signal is passed AND that aborting it stops the stream from
settling into the cleared transcript.

THE `api.chatStream` SIGNATURE CHANGE STAYS INSIDE THE THIN-CLIENT WALL (ADR-0004 / modelPathBoundary).
Adding an optional third parameter `signal?: AbortSignal` to `api.chatStream(intent, onEvent, signal?)` and
forwarding it to `fetch` is entirely within `apps/studio/src` — it adds NO agent/drive/model import and
touches no wire shape (the SSE frames are unchanged). The `modelPathBoundary.test.ts` wall stays green. The
optional signal keeps the existing two-arg callers (the transcript capability's sends) working unchanged;
the panel opts into passing it.

RESET RETURNS THE WHOLE PANEL TO IDLE — TRANSCRIPT, INPUT, BUILD PHASE. Clearing to idle means: the
transcript is emptied (back to the resting empty scrollback), the input is cleared + re-enabled + returned
to its one-row resting height (the auto-grow base), and any in-flight build-progress/accept phase is reset
too (ADR-0108 d.3/d.7 state). A reset mid-build should also stop cleanly — the reset is the "fresh terminal"
recovery. The test pins the clear-to-idle across these; the exact affordance placement/look of the reset
control is operator-attested (no appearance assertion here).

OPTIONAL BACKEND RESET IS A SEPARATE (STRETCH) CAPABILITY. Clearing the FRONTEND transcript + aborting the
local fetch does NOT clear the backend's single-session guard (`compositionInFlight` in
`packages/drive/src/orchestrate.ts`): an aborted fetch stops the CLIENT reading, but the server-side
composition may still be marked in-flight until it finishes. Recovering a genuinely WEDGED backend session
without an app restart is the OPTIONAL/STRETCH [`backend-chat-reset-route`](backend-chat-reset-route.md)
capability (a `POST /api/chat/reset` on the sidecar) — deliberately SEPARATE and marked optional so it can
be HELD without blocking this thin-client reset. This capability's reset is honest on its own: it clears
the panel and stops the client stream; the frontend "New chat" affordance works. Wiring the frontend reset
to ALSO call the backend route is the stretch integration, not required here (slow growth).

TWO-STAGE PROOF (frontend-builder, ADR-0070). This `real:` arm proves clear-to-idle + abort-in-flight over
a scripted seam. The terminal FEEL of a clean reset (does the panel truly read as a fresh terminal after
reset) is the story's operator-attested UAT leg — witnessed by the owner, NEVER a machine visual verdict.

OFFLINE-TESTABLE BY MOCKING THE SEAM (the SAME discipline the existing `ChatPanel.test.tsx` uses):
`@vitest-environment jsdom`, `vi.mock('../api', …)` with a `chatStream` seam that captures the passed
`signal`, `@testing-library/react` + `fireEvent`, fake timers. The abort is observed by asserting the
captured signal's `aborted` flag flips on reset AND that a post-abort terminal frame does not render into
the cleared transcript. No real `fetch`/socket/SDK/DB/Electron.

## Integration test

**Goal —** Prove that a reset control, on click, clears the whole transcript back to the idle empty state
(input cleared + re-enabled + resting height) AND aborts any in-flight SSE stream (the `AbortSignal`
threaded through `api.chatStream` into `fetch` is aborted, and a mid-stream reset leaves no ghost reply in
the cleared transcript). Entirely in jsdom: the `api` seam is mocked and captures the signal, fake timers
drive the stream, no real `fetch`/socket/SDK/DB/Electron.

The integration test exercises this capability against its **real in-story collaborators** — the real
transcript state (from `multi-turn-transcript`), the real reset handler, and the `api.chatStream` seam
(scripted, capturing the passed `AbortSignal`). No stubs within the panel's own composition.

The integration test would:

1. Render `<ChatPanel />`; script the `chatStream` seam to CAPTURE the `signal` argument and to stream on
   fake timers.
2. Make one or more sends so the transcript holds settled exchanges; click the reset control → assert the
   transcript is cleared to the idle empty state (no exchanges, input cleared + re-enabled + one-row resting
   height).
3. Start a send (the seam is mid-stream, not yet terminal) and click reset → assert the captured `signal`
   is `aborted` (the abort was threaded through) AND that when the mid-stream seam later tries to deliver a
   terminal frame, it does NOT render into the cleared transcript (no ghost reply) — the abort actually
   stopped the stream.
4. Assert `api.chatStream` was CALLED with the `signal` (the third argument) on a normal send — the signal
   is threaded even when reset is never clicked (so abort is always available).

## Contracts (3)

The test-proven leaf behaviours — each **one isolated automated test** in the `studio` suite (vitest jsdom,
`apps/studio/src/components/ChatPanel.test.tsx`), the `api` streaming seam mocked/scripted and capturing the
signal. Per ADR-0122 (`storytree coverage`), each contract id is the lead of a distinctly-named test, so
`storytree coverage transcript-reset` reports 3/3. None is an APPEARANCE assertion — the reset's look/feel
is the story's operator-attested UAT leg (ADR-0070).

1. **`tr-clears-transcript-to-idle`** — clicking reset empties the transcript back to the idle empty state
   - **asserts —** after one or more settled exchanges, clicking the reset control clears the transcript to
     the idle empty state — no exchanges rendered, the input cleared + re-enabled + returned to its one-row
     resting height, any build/accept phase reset. Fails against the code at HEAD (no reset control exists)
     — the brownfield red.
   - **covers —** `apps/studio/src/components/ChatPanel.tsx` (the reset handler → clear-to-idle)
2. **`tr-aborts-in-flight-stream`** — reset aborts the in-flight SSE stream, leaving no ghost reply
   - **asserts —** clicking reset MID-STREAM aborts the in-flight stream: the `AbortSignal` the panel passed
     into `api.chatStream` is `aborted`, and a terminal frame the aborted seam later tries to deliver does
     NOT render into the cleared transcript (no ghost reply, no zombie fetch settling into a fresh panel).
   - **covers —** `apps/studio/src/components/ChatPanel.tsx` (the AbortController + reset-aborts path)
3. **`tr-threads-abort-signal-through-api`** — api.chatStream accepts and forwards an AbortSignal to fetch
   - **asserts —** `api.chatStream(intent, onEvent, signal?)` accepts an optional `AbortSignal` and forwards
     it to the underlying `fetch({ signal })` (the seam is called WITH the signal on a normal send) —
     threading the abort inside the thin-client wall (no agent/drive/model import). Fails against the
     signalless `api.chatStream(intent, onEvent)` at HEAD (`apps/studio/src/api.ts:104`) — the brownfield
     red on the api client. (The existing two-arg callers stay working — the parameter is optional.)
   - **covers —** `apps/studio/src/api.ts` (the `chatStream` signal parameter → `fetch({ signal })`)
     and `apps/studio/src/components/ChatPanel.tsx` (the panel passing its controller's signal)

## Guidance — the net-new slice that earns the signed verdict

The BROWNFIELD rung toward `healthy` (ADR-0057 §3, editsExisting): author the reset + abort assertions (the
red against the no-reset / signalless code at HEAD), then add the reset control + the signal threading (the
green).

- **The edited test —** `apps/studio/src/components/ChatPanel.test.tsx`. Add the `tr-…` clear-to-idle /
  abort / signal-threading tests, scripting the seam to capture the signal. Name each for its contract id so
  `storytree coverage transcript-reset` reports 3/3 (ADR-0122).
- **The RED the spine observes —** with the reset assertions authored, the test fails against the code at
  HEAD: no reset control (`tr-clears-transcript-to-idle` fails) and `api.chatStream` takes no signal
  (`tr-threads-abort-signal-through-api` fails). A real brownfield red→green over existing source.
- **The GREEN —** in `apps/studio/src/components/ChatPanel.tsx`, add a reset control + a handler that clears
  the transcript to idle and calls `controller.abort()` on the current send's `AbortController`; hold the
  controller per send and pass `controller.signal` into `api.chatStream`. In `apps/studio/src/api.ts`, add
  an optional `signal?: AbortSignal` third parameter to `chatStream` and forward it to `fetch(url, { signal
  })`. Keep the thin-client wall (`modelPathBoundary.test.ts`) and typecheck green. The reset's look/feel is
  the story's operator-attested UAT leg — no visual assertion here.

Rules:

- **Clear AND abort** — reset both empties the transcript to idle (`tr-clears-transcript-to-idle`) and
  aborts the in-flight stream (`tr-aborts-in-flight-stream`); a clear-only reset that leaves a zombie fetch
  is a defect.
- **Thread the abort inside the thin-client wall** — `api.chatStream(intent, onEvent, signal?)` forwards
  the signal to `fetch`; no agent/drive/model import (`tr-threads-abort-signal-through-api`,
  `modelPathBoundary.test.ts` stays green).
- **Optional param, existing callers unchanged** — the signal is optional so the transcript capability's
  sends keep working; the panel opts into passing it.
- **Backend reset is a separate stretch** — clearing `compositionInFlight` is the optional
  [`backend-chat-reset-route`](backend-chat-reset-route.md); this reset is honest without it.
- **Appearance is operator-attested, not asserted here** (ADR-0070) — prove clear+abort behaviour only; the
  reset feel is the story's UAT leg.
