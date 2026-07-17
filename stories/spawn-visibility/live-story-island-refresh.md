---
id: "live-story-island-refresh"
tier: capability
story: spawn-visibility
title: "The just-authored island appears live — a story-author finish triggers TreeView.reloadTree (two-stage)"
outcome: "When the chat surface sees a spawn-finished event for a story-author, `ChatDock` invokes a `TreeView.reloadTree` callback so the just-authored story's island appears live on the forest map — geometry/behaviour machine-witnessed (the callback fires on the right event, imports no drive/agent code); the island appearing live operator-attested."
# RETIRED with the spawn-visibility story (ADR-0174 + ADR-0175, owner-directed 2026-07-17): the chat spawn
# this made visible is retired with chat-subagent-spawn (interactive orchestrator chat retired for an
# embedded terminal running real Claude Code; spawn/landing do not go to app-guide). Retired in place; body
# kept as history. The `real:` arm is dropped, so this capability is no longer REAL-buildable
# (buildableNodeIds keys on proof.real) — packages/cli/src/node-build.test.ts's REAL-buildable snapshot is
# updated in this pass.
status: retired
proof_mode: integration-test
depends_on: [chat-panel-spawn-render]
decisions: [137, 70, 4]
# Node-borne proof config (ADR-0057 keystone). EDIT-EXISTING (editsExisting: true): ChatDock.tsx +
# ChatPanel.tsx + TreeView.tsx already exist at HEAD. Today ChatDock renders <ChatPanel/> with NO props
# (ChatDock.tsx:48) and reloadTree (TreeView.tsx:1227) only runs on mount / crown-refresh / after a
# build. This increment threads a callback: ChatDock gains an optional `onSpawnFinished`/`onReloadTree`
# prop, ChatPanel surfaces the spawn-finished-for-a-story-author signal up to it, and TreeView passes
# `reloadTree` down at the <ChatDock/> mount (TreeView.tsx:2069). The leaf authors a NEW failing vitest
# jsdom component test (ChatDock.reload.test.tsx) that renders the dock with a spy reloadTree callback,
# scripts a spawn-finished frame for a story-author, and asserts the callback fired once — RED at HEAD
# because ChatDock takes no callback prop and does not observe the frame → the spy never fires (a
# RUNTIME red, never type-only). FRONTEND-BUILDER TWO-STAGE (ADR-0070): this `real:` arm proves the
# GEOMETRY/BEHAVIOUR ONLY (the callback fires on the right event, and NOT on a builder finish / a
# started frame) — the island APPEARING LIVE on the map is the story's operator-attested UAT leg 6 (do
# NOT assert map geometry / the island's look here). RUNNER: the studio suite is VITEST + jsdom, so the
# real arm declares an explicit proofCommand running the ONE test file under vitest. `install: true`
# (fresh worktree, ADR-0031 §2). SCOPE = apps/studio/src. The thin-client wall holds: ChatDock imports
# only React + ChatPanel (no drive/agent); the reload is a plain callback prop, TreeView owns reloadTree.
proof:
  command:
    file: pnpm
    args: ["--filter", "studio", "test"]
  scope:
    testGlobs: ["apps/studio/src/**/*.test.tsx", "apps/studio/src/**/*.test.ts"]
    sourceGlobs: ["apps/studio/src/**/*.ts", "apps/studio/src/**/*.tsx"]
# The `real:` arm was dropped on retirement (explorer-onboarding-arc inc1 / ADR-0175 companion) — see the
# RETIRED note above. proof.command + proof.scope are kept as history.
---

# The just-authored island appears live — a story-author finish triggers TreeView.reloadTree

**Outcome —** When the chat surface sees a spawn-finished event for a story-author, `ChatDock` invokes a
`TreeView.reloadTree` callback so the just-authored story's island appears live on the forest map —
geometry/behaviour machine-witnessed (the callback fires on the right event, imports no drive/agent
code); the island appearing live operator-attested.

**Depends on —** [`chat-panel-spawn-render`](chat-panel-spawn-render.md) — the refresh is the map-side
consequence of the panel seeing a spawn frame: the panel/dock observe the `spawn`-finished frame
(handled by capability 3) and, only for a story-author finish, invoke the reload callback. It owns no
stream/wire logic.

> **Proof status (honest) — `proposed`, EDIT-EXISTING two-stage.** The 2026-07-03 Phase-3 walk found a
> story the spawn just authored did not appear live: `reloadTree`
> (`apps/studio/src/components/TreeView.tsx:1227`) runs on mount / crown-refresh / after a build —
> never on a spawn. Today `ChatDock` renders `<ChatPanel/>` with no props (`ChatDock.tsx:48`), so it has
> no way to signal the map. This capability threads a plain callback: a spawn-finished-for-a-story-author
> signal from the panel, up through `ChatDock`, to the `reloadTree` `TreeView` already owns (passed down
> at the `<ChatDock/>` mount, `TreeView.tsx:2069`). Its GEOMETRY/BEHAVIOUR (the callback fires on the
> right event) is machine-witnessed; the island APPEARING LIVE on the map is the story's operator-attested
> UAT leg 6 (ADR-0070). Status stays `proposed` — `healthy` is only ever DERIVED from signed verdicts
> (ADR-0020), never authored.

## Guidance

REUSE reloadTree, NEVER RE-FETCH (edit-first, the crown-refresh precedent): the map already knows how to
reload — `reloadTree` (`TreeView.tsx:1227`) is the SAME callback the crown-refresh (`onCrownRefresh`,
`:2085`) and post-build refresh already use. This capability does NOT add a new fetch or a new tree
loader; it wires an EXISTING trigger (`reloadTree`) to a NEW event (a spawn-finished for a story-author).
The reload path, the fetch, the tree render are all `TreeView`'s, untouched. Pass `reloadTree` DOWN to
`<ChatDock/>` at its mount (`TreeView.tsx:2069`), exactly as `onCrownRefresh` is passed to the sibling
that needs it.

ONLY A STORY-AUTHOR FINISH TRIGGERS THE RELOAD (pair the affordance with its fence): the reload fires
ONLY for a `spawn` frame with `phase: "finished"` AND a story-authoring role — a story-author finish
means a NEW story was written to `stories/`, so the tree changed. A BUILDER finish did not author a new
node (it drove an existing one), and a `phase: "started"` frame has authored nothing yet — neither
triggers the reload. Get this wrong — reloading on every spawn frame — and you re-fetch the tree
needlessly on builder spawns and on every started frame (a wasteful re-fetch, not a correctness bug,
but the fence keeps the reload earned by a real tree change).

THE THIN-CLIENT WALL HOLDS (ADR-0004): the reload is a PLAIN CALLBACK PROP — `ChatDock` gains an
optional `onSpawnFinished` / `onReloadTree` prop and invokes it; it imports only React + `ChatPanel`
(never `@storytree/drive` / `@storytree/agent` / a model path). `TreeView` owns `reloadTree` and passes
it down. The signal from `ChatPanel` up to `ChatDock` is a plain React callback over the plain-JSON
`spawn` frame (capability 3's wire shape), never a drive import. The `modelPathBoundary.test.ts` wall
stays green.

GEOMETRY/BEHAVIOUR HERE, THE LIVE ISLAND OPERATOR-ATTESTED (ADR-0070 two-stage): this `real:` arm proves
the callback FIRES on the right event (a story-author finish) and NOT on the wrong ones (a builder
finish, a started frame) — a spy callback over a scripted spawn frame in jsdom. Whether the island
actually APPEARS on the forest map, live, when the reload runs is the story's operator-attested UAT
leg 6 — witnessed by the owner, NEVER a machine map-geometry verdict here. Do NOT assert the island's
presence / position / look in this capability's tests (the tree render is `TreeView`'s, exercised live).

OFFLINE-TESTABLE BY A SPY CALLBACK (the component discipline): `@vitest-environment jsdom`,
`@testing-library/react` to render `<ChatDock/>` with a spy `reloadTree` prop, `vi.mock('../api', …)` to
script the chat stream emitting the `spawn` frames, fake timers. Assert the spy's call count per event.
No real `fetch`/socket/SDK/DB/Electron, no real `TreeView` map render.

## Integration test

**Goal —** Prove `ChatDock` invokes the injected `reloadTree` callback EXACTLY once on a
spawn-finished-for-a-story-author frame, and NOT on a builder finish nor a started frame; that the
callback is a plain prop (no drive/agent import); and that the reload reuses `TreeView`'s existing
`reloadTree` — entirely in jsdom over a scripted seam + a spy callback.

Exercised against its **real in-story collaborator** — the panel's `api` chat-stream seam scripted as a
double, and the real `ChatDock`/`ChatPanel` composition with a spy `reloadTree` prop. No stubs within
the dock's own callback wiring.

The integration test would:

1. Mock `../api` with a scripted chat-stream seam. Render `<ChatDock onReloadTree={spy} />` (the new
   prop) in jsdom on fake timers.
2. Drive the stream to a `spawn` `phase: "finished"` frame with a story-author role → assert the spy
   `reloadTree` fired EXACTLY once (at HEAD the dock takes no callback and does not observe the frame →
   the spy never fires → red).
3. Drive a `spawn` `phase: "finished"` frame with a BUILDER role → assert the spy did NOT fire (a
   builder finish authored no new node).
4. Drive a `spawn` `phase: "started"` frame → assert the spy did NOT fire (nothing authored yet).
5. Assert `ChatDock` imports only React + `ChatPanel` (no drive/agent/model; `modelPathBoundary.test.ts`
   green) — the reload is a plain callback, `TreeView` owns `reloadTree`.

## Contracts (3)

The test-proven leaf behaviours — each **one isolated automated test** in the `studio` suite (vitest
jsdom, `apps/studio/src/components/ChatDock.reload.test.tsx`), the `api` chat-stream seam mocked/scripted
+ a spy callback. Per ADR-0122, each contract id is the lead of a distinctly-named test (3/3). None is a
map-geometry / appearance assertion — the live island is the story's operator-attested UAT leg 6
(ADR-0070).

1. **`lsr-story-author-finish-triggers-reload`** — a story-author finish invokes reloadTree once
   - **asserts —** a `spawn` `phase: "finished"` frame with a story-author role causes `ChatDock` to
     invoke the injected `reloadTree` callback EXACTLY once — the just-authored story's tree change
     triggers a live reload (reusing `TreeView`'s existing `reloadTree`, the crown-refresh callback). At
     HEAD the dock takes no callback → red.
   - **covers —** `apps/studio/src/components/ChatDock.tsx` (the callback prop + the finish observer) +
     `apps/studio/src/components/ChatPanel.tsx` (the signal-up)
   - **proven by —** `apps/studio/src/components/ChatDock.reload.test.tsx` (net-new, vitest jsdom, spy).
2. **`lsr-no-reload-on-builder-or-started`** — the reload is fenced to a story-author finish
   - **asserts —** a `spawn` `phase: "finished"` frame with a BUILDER role does NOT invoke `reloadTree`
     (a builder drove an existing node, authored nothing new), and a `phase: "started"` frame does NOT
     invoke it (nothing authored yet) — the reload is earned by a real tree change, never fired on every
     spawn frame.
   - **covers —** `apps/studio/src/components/ChatDock.tsx` (the role/phase fence)
   - **proven by —** `apps/studio/src/components/ChatDock.reload.test.tsx`.
3. **`lsr-reload-is-a-plain-callback-no-drive-import`** — the thin-client wall holds
   - **asserts —** the reload is a plain React callback prop — `ChatDock` imports only React +
     `ChatPanel` (no `@storytree/drive` / `@storytree/agent` / model path; `modelPathBoundary.test.ts`
     green), and `TreeView` owns `reloadTree` and passes it down at the `<ChatDock/>` mount. The signal
     rides the plain-JSON `spawn` frame, never a drive import.
   - **covers —** `apps/studio/src/components/ChatDock.tsx` (the plain-callback wiring)
   - **proven by —** `apps/studio/src/components/ChatDock.reload.test.tsx`.

## Guidance — the edit-existing slice that earns the signed verdict

The brownfield rung toward `healthy` (ADR-0057 §3, EDIT-EXISTING): `ChatDock.tsx` / `ChatPanel.tsx` /
`TreeView.tsx` already landed. This increment threads a plain callback from a spawn-finished frame to
the existing `reloadTree`, test-first.

- **The new test —** `apps/studio/src/components/ChatDock.reload.test.tsx` (`@vitest-environment jsdom`,
  vitest + `@testing-library/react`, `vi.mock('../api', …)` for the stream, a spy `reloadTree` prop,
  fake timers; the studio convention; NO real `fetch`/socket/SDK/DB/Electron/TreeView-map-render). Name
  each test for its contract id (`lsr-…`) so `storytree coverage` reports 3/3 (ADR-0122).
- **The RED the spine observes (before IMPLEMENT) —** `ChatDock.tsx` EXISTS, so the red is a RUNTIME
  assertion: render the dock with a spy callback, drive a story-author-finish frame, assert the spy
  fired. At HEAD the dock takes no callback and does not observe the frame → the spy never fires → red.
  ASSERT THE SPY FIRED, never just that the dock rendered.
- **The GREEN —** EDIT `apps/studio/src/components/ChatDock.tsx` (an optional `onReloadTree` prop + the
  finish observer, fenced to a story-author role), `apps/studio/src/components/ChatPanel.tsx` (surface
  the spawn-finished signal up), and pass `reloadTree` down at `TreeView.tsx:2069`'s `<ChatDock/>` mount.
  NO drive/agent/model import. After it, the story-author-finish-fires + no-reload-on-builder-or-started
  + plain-callback assertions hold, and `pnpm --filter studio test` + typecheck stay green. The island
  APPEARING LIVE on the map is witnessed under the story's UAT leg 6 (operator-attested, ADR-0070), not
  asserted in CI.

Rules:

- **Reuse reloadTree** — the reload is `TreeView`'s existing crown-refresh callback, wired to a new
  event; never a new fetch/tree loader (`lsr-story-author-finish-triggers-reload`).
- **Fence to a story-author finish** — only a `phase: "finished"` story-author frame reloads; not a
  builder finish, not a started frame (`lsr-no-reload-on-builder-or-started`).
- **Plain callback, no drive import** — `ChatDock` imports only React + `ChatPanel`
  (`lsr-reload-is-a-plain-callback-no-drive-import`, ADR-0004); `modelPathBoundary.test.ts` stays green.
- **The live island is operator-attested, not asserted here** (ADR-0070) — prove the callback fires;
  the island appearing on the map is the story's UAT leg 6. Do not assert map geometry.
- **Edit, don't fork** — the dock's existing chrome + the panel's existing render are untouched except
  for the additive callback prop + the finish observer.
