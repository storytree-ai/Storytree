---
id: "multi-turn-transcript"
tier: capability
story: terminal-chat
title: "The chat panel keeps a persistent multi-turn transcript — each send appends the prompt echo then its reply, flowing top-to-bottom in one scrollable surface"
outcome: "Each chat send APPENDS a `› <prompt>` line then its streamed reply into one persistent, scrollable transcript surface — prior exchanges stay visible instead of being replaced, and the surface auto-scrolls to the newest line as it grows — so the panel reads as one continuous terminal scrollback rather than a single replace-on-send exchange."
status: proposed
proof_mode: integration-test
depends_on: []
# Node-borne proof config (ADR-0057 keystone): authoring THIS block is what makes the capability
# inner-loop buildable — no NODE_BUILD_REGISTRY edit. This is BROWNFIELD (editsExisting): the source
# (apps/studio/src/components/ChatPanel.tsx) and its test (ChatPanel.test.tsx) EXIST and are green at
# HEAD — but green on the OLD single-exchange model (`submitted` holds only the current intent; `phase`
# is REPLACED on the next send; no scrollback). The RED the spine observes is authored by REWRITING the
# streaming assertions to the transcript model (a second send must find BOTH exchanges present, newest
# last) — that assertion fails against the replace-on-send code at HEAD (the prior exchange is gone),
# so the edit is a real red→green over existing source. The five existing streaming contracts
# (cp-posts-intent-once-and-shows-busy, cp-renders-the-done-proposal, cp-streams-delta-text,
# cp-renders-error-distinctly, cp-renders-refused-as-busy-retry) are UPDATED to the transcript model,
# NOT bypassed — each still proves its terminal render, now asserted as an APPENDED entry that survives
# the next send. FRONTEND-BUILDER TWO-STAGE (ADR-0070): this `real:` arm proves GEOMETRY/BEHAVIOUR ONLY
# (append-not-replace, prior-exchange-persists, auto-scroll-to-newest over a mocked scroll seam) — the
# terminal FEEL (does the scrollback read like one continuous terminal) is the story's operator-attested
# UAT leg, NOT a machine visual verdict here. The proof command is the studio VITEST suite
# (`pnpm --filter studio test`), NOT node:test; the `real.proofCommand` runs the ONE test file under
# vitest (the chat-panel precedent — resolveProveSpec's node:test default cannot run a jsdom .test.tsx).
# `install: true` (fresh worktree: tsx + tsc + vitest need the lockfile-only install, ADR-0031 §2).
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

# The chat panel keeps a persistent multi-turn transcript

**Outcome —** Each chat send APPENDS a `› <prompt>` line then its streamed reply into one persistent,
scrollable transcript surface — prior exchanges stay visible instead of being replaced, and the surface
auto-scrolls to the newest line as it grows — so the panel reads as one continuous terminal scrollback
rather than a single replace-on-send exchange.

**Depends on —** nothing (within `terminal-chat`). The transcript is the load-bearing state change to the
existing `ChatPanel` component; the auto-grow input and the reset are SIBLINGS that consume the same
component but prove different observables (see the story's splitting-rule notes). Its only backend seam is
the studio `api` streaming client (`api.chatStream`) — unchanged by this capability (the transcript is
purely a renderer-side state shape over the same stream).

> **Proof status (honest) — BROWNFIELD, `proposed`.** The `ChatPanel` component EXISTS and is green at
> HEAD (PRs #451 / the chat-panel capability), but green on the OLD **single-exchange** model: `submitted`
> holds only the ONE current intent, `phase` is REPLACED on the next send, and there is NO scrollback —
> a second send discards the first exchange. The owner's live ADR-0137 Phase-3 UAT walk (2026-07-03)
> flagged this: "the input feels separate from the output; it should be one terminal." This capability is
> the state-shape change that makes the panel a persistent multi-turn transcript.

## Guidance

WHY THIS IS A CAPABILITY, NOT A CONTRACT: its honest proof is the TRANSCRIPT AS A WHOLE — a behavioural
React component that, across MULTIPLE sends, accumulates an ordered list of exchanges (each a `› <prompt>`
echo + its streamed reply: `done` / `error` / `refused`), keeps every prior exchange rendered as the new
one streams, and auto-scrolls the transcript surface to the newest line. It spans the intake (the submit),
the per-exchange streaming consumption (the same `delta`/terminal-frame parse the panel already does), the
APPEND-not-replace accumulation, AND the scroll-to-newest side effect — exercised across several scripted
exchanges against the real `api` streaming seam. That is an integration test of the panel's multi-turn
behaviour over a scripted stream, not a single isolated assertion.

WHY THIS IS A SEPARATE CAPABILITY FROM `auto-grow-input` AND `transcript-reset` (the splitting-rule,
ADR-0010): all three edit the SAME `ChatPanel` component (a shared precondition) but prove DIFFERENT
observables. THIS proves "a second send finds the first exchange still present, newest last, and the
surface scrolled to it" (the scrollback). `auto-grow-input` proves "the input textarea's height tracks its
content up to a cap, then scrolls internally" (the input geometry). `transcript-reset` proves "reset clears
the transcript to idle AND aborts the in-flight stream" (the teardown). Distinct observable, distinct
isolatable red→green in the same suite. They are separate capabilities, not one, because each has its own
falsifiable red the spine can observe independently — but they share the one component and the one test
file, so they are SIBLINGS under one story (the terminal-feel journey), sequenced by `depends_on`.

THE STATE-SHAPE CHANGE (the heart of the red→green): replace the single-exchange state
(`submitted: string` + a `phase` that is overwritten per send) with an ORDERED LIST of exchanges. The
minimal honest shape (the leaf owns the exact typing): a `transcript` array where each entry carries its
prompt echo and its terminal outcome (`done`/`error`/`refused`/`unavailable`), plus at most one in-flight
"busy" entry at the tail whose streamed text accumulates from `delta` frames as they arrive (the existing
live-token behaviour, now the newest transcript entry rather than the whole panel). On a new send: PUSH a
new `› <prompt>` entry + its in-flight reply; the prior entries stay. On the stream's terminal frame:
settle the tail entry to its terminal render. The prior single-exchange behaviour is a SPECIAL CASE of this
(a one-entry transcript), so no terminal-render logic is lost — it is re-homed per entry.

AUTO-SCROLL TO THE NEWEST LINE (a load-bearing observable, testable without layout). jsdom does not lay out
`scrollHeight`/`scrollTop`, so the scroll-to-newest is proven the SAME way the auto-grow height is: the
component runs an explicit scroll-recompute (e.g. a `ref.current.scrollTop = ref.current.scrollHeight` in a
layout effect keyed on the transcript length) that the test drives via a MOCKED/spied ref — assert the
recompute FIRES when a new entry is appended and when tokens stream into the tail entry, not the pixel
result. The visual "it actually scrolls smoothly / the newest line is in view" is part of the story's
operator-attested UAT leg. Pin the BEHAVIOUR (the recompute fires on append), not the geometry.

INPUT ROW PINNED FLUSH AT THE BOTTOM, ONE SCROLLABLE SURFACE (`.chat-outcome`). The transcript scrolls
inside `.chat-outcome` (the existing outcome container, now the scrollback), and the input `.chat-form`
stays pinned below it — the existing layout already has this shape (outcome above, form below); the change
is that `.chat-outcome` now holds the GROWING ordered transcript and OWNS the scroll (an
`overflow-y: auto` surface with the input flush at its bottom edge). The exact CSS is in
`apps/studio/src/index.css` (`.chat-*`, ~lines 2426–2686); adjusting `.chat-outcome` to be the scroll
container + `.chat-echo`/reply entries to stack per exchange is part of the green, and the terminal LOOK of
that stack is operator-attested (do NOT author a pixel/appearance assertion here).

THE PANEL STAYS A THIN CLIENT — NO AGENT, NO DRIVE, NO MODEL PATH (ADR-0004 / ADR-0108 d.1). This is a
renderer-side state-shape change only. It imports no `@storytree/agent` / `@storytree/drive` and holds no
model path (the `modelPathBoundary.test.ts` wall must stay green); it parses the SAME SSE `data:` frames as
plain JSON against the SAME locally-declared wire shape in `api.ts`. The wire shape is UNCHANGED — only the
renderer's accumulation of it changes.

THE ACCEPT-TO-LAND AFFORDANCE AND BUILD-PROGRESS SURVIVE (do NOT regress ADR-0108 d.3/d.7). The existing
`done`-with-`proposedUnitId` Build button and the polled build-progress transcript are part of the panel's
current behaviour. In the transcript model they belong to their `done` exchange entry (the button + its
build progress render under that entry). Keep those behaviours green — the accept affordance is still the
ONLY build trigger (no prose auto-dispatch), now scoped to its transcript entry.

TWO-STAGE PROOF (frontend-builder, ADR-0070). This `real:` arm proves GEOMETRY/BEHAVIOUR ONLY — append not
replace, prior exchanges persist across sends, the scroll-recompute fires on append — over a scripted `api`
seam on fake timers. The terminal FEEL (does the growing scrollback read like one continuous terminal) is
the story's operator-attested UAT leg, witnessed by the owner in the desktop app, NEVER a machine visual
verdict here. Do NOT author a visual/appearance assertion in this capability's tests.

OFFLINE-TESTABLE BY MOCKING THE SEAM (the SAME discipline the existing `ChatPanel.test.tsx` uses):
`@vitest-environment jsdom`, `vi.mock('../api', …)` to script the streaming seam across MULTIPLE sends,
`@testing-library/react` for render/`fireEvent`, fake timers to drive the streaming transitions. No real
`fetch`/socket/SDK/DB/Electron. The scroll ref is spied, not laid out.

## Integration test

**Goal —** Prove that the chat panel, across MULTIPLE scripted sends, APPENDS each `› <prompt>` echo + its
streamed reply into one ordered transcript surface, keeps every prior exchange rendered while the newest
streams and settles, and fires an auto-scroll-to-newest recompute on each append — never replacing or
discarding a prior exchange. Entirely in jsdom: the `api` streaming seam is mocked (scripted per send),
fake timers drive the streaming transitions, the scroll ref is spied, no real `fetch`/socket/SDK/DB/Electron.

The integration test exercises this capability against its **real in-story collaborator** — the panel's
single seam, the `api.chatStream` streaming method — scripted as a double across several sends, exactly as
the existing `ChatPanel.test.tsx` scripts a single send. No stubs within the panel's own composition (the
render, the accumulation, the frame-to-entry mapping, the scroll recompute are all real).

The integration test would:

1. Mock `../api` with a scripted `chatStream` seam. Render `<ChatPanel />` in jsdom on fake timers with a
   spy on the transcript surface's scroll recompute (an injected/spied ref, or a `scrollTop` setter spy).
2. **First send** → the seam emits `delta` frames then a terminal `done` → assert the transcript holds ONE
   exchange: `› <intent-1>` echo + the settled `done` proposal, and the scroll recompute fired.
3. **Second send** (a different intent) → the seam emits a terminal `error` → assert the transcript now
   holds TWO exchanges in order: exchange 1 (`done`, still present and unchanged) ABOVE exchange 2
   (`› <intent-2>` + the `error` state), newest last — the append-not-replace journey — and the scroll
   recompute fired again on the append.
4. **A `refused` third send** → assert exchange 3 appends its distinct "busy — try again" state below the
   first two, all three still rendered — the transcript never drops a prior exchange for any terminal kind.
5. **Delta streaming into the tail** → while the newest exchange streams `delta` frames, assert the live
   tokens render in the TAIL entry (the newest) while prior settled entries are untouched, and the scroll
   recompute fires as tokens arrive (the newest line stays in view).
6. **The five updated streaming contracts** — each existing terminal-render assertion
   (busy/done/delta/error/refused) is RE-EXPRESSED as an appended transcript entry that survives a
   subsequent send (the update, not a bypass) — proving no terminal-render behaviour was lost in the
   state-shape change.

## Contracts (5)

The test-proven leaf behaviours — each **one isolated automated test** in the `studio` suite (vitest jsdom,
`apps/studio/src/components/ChatPanel.test.tsx`), the `api` streaming seam mocked/scripted across multiple
sends. These are the FIVE existing streaming contracts UPDATED to the transcript model (not bypassed): each
retains its terminal-render assertion and ADDS the append-and-persist guarantee. Per ADR-0122
(`storytree coverage`), each contract id is the lead of a distinctly-named test, so `storytree coverage
multi-turn-transcript` reports 5/5. None of these is an APPEARANCE assertion — the terminal feel is the
story's operator-attested UAT leg (ADR-0070).

1. **`mtt-appends-not-replaces`** — a second send appends a new exchange without discarding the first
   - **asserts —** after a first send settles to a terminal frame and a second send is made, BOTH exchanges
     are present in the transcript, in order (first above second, newest last); the first exchange's echo +
     terminal render are unchanged. Replaces the old single-exchange "replace on send" behaviour — this
     assertion fails against the replace-on-send code at HEAD (the first exchange is gone), the brownfield
     red.
   - **covers —** `apps/studio/src/components/ChatPanel.tsx` (the ordered-transcript accumulation on submit)
2. **`mtt-echoes-each-prompt`** — each send appends its `› <prompt>` echo line above its reply
   - **asserts —** each exchange in the transcript renders a `› <the submitted intent>` prompt echo line
     ABOVE that exchange's reply, per send (not just the current one) — the terminal prompt-echo per turn.
     (Subsumes and generalises the old single-exchange `cp-echoes-the-submitted-intent`.)
   - **covers —** `apps/studio/src/components/ChatPanel.tsx` (the per-entry prompt-echo render)
3. **`mtt-renders-each-terminal-kind-as-an-entry`** — done / error / refused each settle their own transcript entry
   - **asserts —** a `done` (proposal), an `error` (distinct failure), and a `refused` (distinct busy-retry)
     each settle their OWN transcript entry, all three rendered distinctly and all surviving subsequent
     sends — the terminal-render behaviours of the old `cp-renders-the-done-proposal` /
     `cp-renders-error-distinctly` / `cp-renders-refused-as-busy-retry`, re-homed per entry.
   - **covers —** `apps/studio/src/components/ChatPanel.tsx` (the per-entry terminal-frame → render mapping)
4. **`mtt-streams-delta-into-the-tail-entry`** — delta frames render live in the newest (tail) entry, priors untouched
   - **asserts —** while the newest exchange streams `delta` frames, the accumulating tokens render in the
     TAIL transcript entry (the newest) while every prior settled entry is untouched — the existing live-token
     behaviour (`cp-streams-delta-text`), now scoped to the newest entry in a multi-turn transcript.
   - **covers —** `apps/studio/src/components/ChatPanel.tsx` (the tail-entry delta accumulation)
5. **`mtt-auto-scrolls-to-newest`** — appending an exchange (and streaming into it) fires a scroll-to-newest recompute
   - **asserts —** appending a new exchange, and streaming `delta` frames into the tail entry, each FIRE the
     transcript surface's scroll-to-newest recompute (driven via a spied ref / `scrollTop` setter — the
     recompute is observed, not the laid-out pixels, since jsdom has no layout). The newest line is kept in
     view. (The empty-intent guard — no seam call on a blank/whitespace intent, and no transcript entry
     appended — is asserted within this contract's sibling case, sharing the component surface; it is part
     of the intake's fail-closed behaviour, not a separately-coverable name.)
   - **covers —** `apps/studio/src/components/ChatPanel.tsx` (the scroll-to-newest layout effect + the
     empty-intent guard)

## Guidance — the net-new slice that earns the signed verdict

The BROWNFIELD rung toward `healthy` (ADR-0057 §3, editsExisting): rewrite the streaming assertions to the
transcript model (the red the spine observes against the replace-on-send code at HEAD), then change the
component's state shape (the green).

- **The edited test —** `apps/studio/src/components/ChatPanel.test.tsx`. Rewrite the five streaming
  contracts to script MULTIPLE sends and assert the append-and-persist + scroll-to-newest behaviour. Name
  each test for its `mtt-…` contract id so `storytree coverage multi-turn-transcript` reports 5/5 (ADR-0122).
- **The RED the spine observes —** with the assertions rewritten to the transcript model, the test fails
  against the code at HEAD: the replace-on-send `phase`/`submitted` shape discards the first exchange, so
  `mtt-appends-not-replaces` (and the per-entry assertions) fail on the second send. A real brownfield
  red→green over existing source.
- **The GREEN —** change `apps/studio/src/components/ChatPanel.tsx` to hold an ordered `transcript` of
  exchanges (each with its prompt echo + terminal outcome, one in-flight tail entry accumulating deltas),
  append-not-replace on each send, and add a scroll-to-newest layout effect keyed on the transcript length.
  Adjust `.chat-outcome` in `apps/studio/src/index.css` to be the scroll container with the input flush at
  its bottom. Keep the accept-to-land affordance + build progress (ADR-0108 d.3/d.7), the thin-client wall
  (`modelPathBoundary.test.ts`), and typecheck green. The terminal FEEL is the story's operator-attested UAT
  leg — no visual assertion here.

Rules:

- **Append, never replace** — each send pushes a new exchange; prior exchanges stay rendered
  (`mtt-appends-not-replaces`). The single-exchange model is a one-entry special case.
- **Echo each prompt as a `› <prompt>` line** per turn (`mtt-echoes-each-prompt`).
- **Render every terminal kind distinctly, per entry** — done / error / refused each settle their own entry
  (`mtt-renders-each-terminal-kind-as-an-entry`); deltas stream into the newest entry only
  (`mtt-streams-delta-into-the-tail-entry`).
- **Auto-scroll to the newest line** via an observed recompute, not laid-out pixels
  (`mtt-auto-scrolls-to-newest`) — jsdom has no layout.
- **Stay a thin client** — no agent/drive/model import; the wire shape is unchanged, only its accumulation
  (the `modelPathBoundary.test.ts` wall stays green).
- **Appearance is operator-attested, not asserted here** (ADR-0070) — prove behaviour only; the terminal
  feel is the story's UAT leg.
