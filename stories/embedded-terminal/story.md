---
id: "embedded-terminal"
tier: story
title: "The desktop app embeds a real local terminal — run Claude Code in-app, watched by the existing seams"
outcome: "The desktop app embeds a real local terminal — xterm.js in the renderer over a node-pty pseudo-terminal in the Electron main — docked with the same collapse/resize affordance the retired chat had, so the user runs REAL Claude Code in-app as their interactive build surface, and the observability layer watches that session through the existing presence-hook / noticeboard-claim / store-verdict seams exactly as it watches any Claude Code session — no new observer code required."
status: proposed
proof_mode: UAT
# uat_witness ABSENT → human (ADR-0040 fail-closed signpost): the whole-story UAT — "a real terminal
# runs real Claude Code in-app and a wisp lights for it" — is native-module + subscription + appearance
# + live-store, all operator-attested (ADR-0070 / ADR-0174). The machine-driven story UAT node stays
# WITHHELD; the crown derives from the two capabilities' signed verdicts plus the operator's attestation
# of the real-pty / terminal-feel / wisp-lights legs.
# Capabilities, roots-first. TWO machine-provable caps on OPPOSITE sides of the contextBridge, each its
# own suite (the chat-sse-mount ↔ chat-panel precedent): pty-session-manager (the backend pty lifecycle,
# apps/desktop node:test over an injected fake pty) and terminal-dock-panel (the renderer xterm dock,
# apps/studio vitest over a mocked xterm + mocked bridge). They share the desktopTerminal WIRE SHAPE as a
# cross-boundary contract, not a code edge — so neither depends_on the other (both roots). The Electron
# main pty wiring + the preload bridge + the node-pty/xterm deps + the TreeView dock-slot swap are
# operator-attested GLUE within this story (ADR-0158), witnessed under the Story UAT, NOT capabilities.
capabilities: [pty-session-manager, terminal-dock-panel]
# Story-level cross-story edges (ADR-0010 §4 / ADR-0074). This story OWNS NO package — it is a VIRTUAL
# story (like terminal-chat / headless-orchestrator): its net-new code is CO-LOCATED inside two surface
# packages other stories own. So both edges are declared `depends_on` AND annotated `artifact_edges`
# (ADR-0166 — deliberate non-import / co-located-source edges, not @storytree/* package imports):
#   - desktop — the pty-session-manager module lives in apps/desktop/src/backend/, and the terminal's
#               Electron-main pty wiring + the `desktopTerminal` preload bridge + the node-pty dep are
#               desktop-surface glue. This story extends the `desktop` surface's package with co-located
#               source; it adds no NEW @storytree/* runtime import, so it is an artifact edge, not a
#               package-import edge. (Boundaries Rule 4 SKIPS a virtual story; artifact_edges keeps the
#               non-blocking ADR-0115 drift report clean — the terminal-chat precedent.)
#   - studio  — the xterm.js TerminalDock component lives in apps/studio/src/components/. The desktop
#               renders the COMPILED studio dist (ADR-0090 d.4), so the renderer terminal is a `studio`
#               frontend component, exactly as terminal-chat's caps edit apps/studio/src. Co-located
#               source, no NEW @storytree/* frontend import (xterm.js is a third-party dep, not a
#               cross-story edge) → an artifact edge.
# NO edge to notice-board / drive-machinery / forest-world: the observability layer watches the
# terminal's Claude Code through the ALREADY-EXISTING hook/CLI/store seams with ZERO new coupling — the
# whole ADR-0174 premise ("nothing new is required to observe it"). This story builds a terminal, not an
# observer; it consumes only the two surfaces its code sits in.
depends_on: [desktop, studio]
artifact_edges: [desktop, studio]
# Deciding ADRs (ADR-0037 §2): 0174 (the WHAT — embed a real local terminal, retire the in-app
# INTERACTIVE orchestrator/chat as the build surface; local pty NOW, cloud DEFERRED); 0175 (the chat
# SSE/dock/continuity/inspect infra stays DORMANT for a future app-guide, NOT deleted); 0070 (the
# two-stage frontend-builder proof — geometry/behaviour machine-proven, appearance operator-attested);
# 0158 (glue is un-asserted code WITHIN a story — the main pty wiring / preload bridge / deps / mount
# swap); 0010 (the organism model + the splitting-rule that tiers the two caps across the bridge); 0057
# (the spec-borne proof config making each cap inner-loop buildable); 0004 (the agent boundary — the
# terminal is the INTERACTIVE surface only; the prove-it-gate leaf sdk-author.ts is UNTOUCHED, and the
# renderer never imports @storytree/agent); 0142 (the presence claim + story wisp — the CLI seam that
# lights a wisp for the terminal's Claude Code session).
decisions: [174, 175, 70, 158, 10, 57, 4, 142]
---

# The desktop app embeds a real local terminal — run Claude Code in-app, watched by the existing seams

**Outcome —** The desktop app embeds a **real local terminal** — xterm.js in the renderer over a
**node-pty** pseudo-terminal in the Electron **main** process — docked with the SAME collapse/resize
affordance the retired chat had, so the user runs **real Claude Code in-app** as their interactive build
surface, and the observability layer watches that session through the **existing** presence-hook /
noticeboard-claim / store-verdict seams exactly as it watches any Claude Code session — **no new observer
code required**.

This story is the build follow-on of **[ADR-0174](../../docs/decisions/0174-interactive-builds-run-in-an-in-app-terminal-not-the-in-app.md)**
(owner-directed 2026-07-09, born accepted per ADR-0110 — design-time alignment IS the ratification): the
desktop's value is the **observability layer over Claude Code** (the forest map, the wisps, session
presence, signed verdicts), **not** a re-implementation of Claude Code. The app grew a *second* in-app
**interactive** orchestrator (the SSE chat widget) that re-implemented, at strictly-worse fidelity,
affordances real Claude Code already ships — a permanent maintenance treadmill. ADR-0174 retires that
chat as the interactive build surface and gives the app a **terminal**: let the user run the real thing,
and keep the app pointed at what it is uniquely good at — **watching**.

## The journey (why this is ONE story — the journey-principle)

The consumer is the desktop user; their goal is **to run real Claude Code inside the app and have the map
watch it**. Finishing "a pty-backed terminal exists" leaves the user immediately needing "a visible
terminal in the dock" and then "run Claude Code in it and see the wisp light" — these are not separate
value deliveries, they are one continuous journey (the journey-principle: if finishing the first unit's
journey leads the consumer straight to needing the next, they are the same journey). The outcome states
the value in one sentence: *the user runs real Claude Code in an embedded local terminal, watched by the
existing seams.* The "watched by the seams" is not a second thing to BUILD — it is the pre-existing
observability layer, exercised in the UAT, requiring zero new code (ADR-0174's central premise). So this
story's **net-new** is the terminal (a backend pty lifecycle + a renderer xterm dock, joined by glue);
the watching rides for free.

## What this story is NOT (the walls — encode from the ADRs)

- **It replaces the interactive orchestrator, NOT the prove-it-gate (ADR-0174 CRITICAL scoping note).**
  Signed `--real` verdicts still come **only** from the deterministic spine driving `ClaudeAgentAuthor`
  (`packages/agent/src/sdk-author.ts`) through the `AUTHOR_TEST → CONFIRM_RED → IMPLEMENT → CONFIRM_GREEN
  → GATE` walk (`packages/orchestrator/src/prove-it-gate.ts` etc.) — i.e. `story build --real` /
  `node build --real`. That leaf is **entirely separate** from the interactive surface and is
  **UNTOUCHED** by this story. Whether a human fires `story build --real` **from this terminal** or a
  headless job fires it, the proof path is identical. This story changes the *interactive runtime*, never
  the *proof runtime* (ADR-0020 / ADR-0030 / ADR-0011 / ADR-0091 all untouched). It also does NOT license
  gate-landing as a substitute for the crown — hand-editing in the terminal + `pnpm gate` + a PR does NOT
  produce a signed `--real` verdict (the caps stay `unregistered` — the known "gate-land skips `--real`
  verdicts" trap; ADR-0174 Consequences).
- **LOCAL pty ONLY (ADR-0174 Scope).** This is the *local* embedded terminal. **Cloud / backing-container
  web terminals** (Cloud-Shell / Gitpod-Ona / Codespaces-style per-user compute running Claude Code
  server-side) are explicitly **DEFERRED as a separate, separately-costed decision** — they raise their
  own hard questions (per-user compute + provisioning, idle-timeout, whose Claude Code billing funds a
  member's session) this story does NOT settle. Consequently hosted studio members stay
  watch-and-comment only until cloud terminals land (ADR-0174 redirects ADR-0117's member-build threads
  to that future decision). Do NOT scope cloud terminals into this story.
- **Repurpose, don't delete the chat infra (ADR-0175).** Retiring the interactive orchestrator leaves its
  SSE transport, dock/resize UI, cross-turn continuity, read-only CI/git inspect surface, and the SDK
  session engine (`packages/agent/src/headless-orchestrator.ts`) in the tree. **ADR-0175** repurposes
  them into a future `app-guide` help/setup agent — so this story does NOT delete them and does NOT
  touch their behaviour. Concretely: `ChatDock.tsx` / `ChatPanel.tsx` stay in the studio bundle,
  behaviourally **DORMANT** (their vitest suites stay green). The terminal dock takes the interactive
  dock SLOT; the chat components are not ripped out.

## Capabilities (2)

Listed roots-first. Both are independent roots (see the within-story graph): they sit on OPPOSITE sides
of the `desktopTerminal` contextBridge and prove different observables in different suites — the
`chat-sse-mount` (desktop) ↔ `chat-panel` (studio) precedent, here inside ONE story.

| # | capability | outcome | proof | depends on |
|---|------------|---------|-------|------------|
| 1 | [`pty-session-manager`](pty-session-manager.md) | The Electron-main pty lifecycle manager spawns / writes-input / resizes / disposes / routes-data for one or more terminal sessions over an INJECTED pty factory, isolating sessions and failing closed on an unknown/disposed id. | integration-test (apps/desktop node:test, red→green over a fake pty) | — |
| 2 | [`terminal-dock-panel`](terminal-dock-panel.md) | The renderer xterm.js terminal mounts in a collapse/resize dock (the same affordance ChatDock had), spawns over the `desktopTerminal` bridge on open, pipes bridge data into the terminal and terminal input back to the bridge, resizes with the dock, and degrades honestly to a disabled "terminal unavailable here" state where the bridge is absent. | integration-test (apps/studio vitest jsdom, red→green over a mocked xterm + mocked bridge) | — |

## Operator-attested glue (un-asserted connective code WITHIN this story — ADR-0158, NOT capabilities)

These pieces have **no isolatable red→green seam** — a `node:test` that spawned a real node-pty (a native
module) or drove a real Electron window would be the live-native trap the machine caps deliberately avoid
(the pty-session-manager is Electron-free and pty-native-free by construction; the terminal-dock-panel
mocks xterm + the bridge). They are witnessed under the Story UAT's operator-attested legs (ADR-0070),
exactly as the `desktop` story models its `backend-entry.ts` sidecar wiring and its `desktopAuth` preload:

- **The real node-pty adapter + the pty IPC in the Electron main** (`apps/desktop/electron/main.ts`): the
  concrete `node-pty` implementation of the pty-session-manager's injected `PtyPort`, the
  `ipcMain.handle("terminal:spawn" | "terminal:write" | "terminal:resize" | "terminal:dispose")`
  handlers driving the manager, and the `webContents.send("terminal:data" | "terminal:exit", …)` stream
  back to the renderer. The manager (cap 1) is the provable core; this is the real-pty binding.
  *(ADR-0189 adds the re-attach slice: `ipcMain.handle("terminal:list")` — the manager's live sessions
  FILTERED to the currently-selected repo's cwd, the per-repo ownership policy — and
  `ipcMain.handle("terminal:snapshot")` relaying the manager's buffered scrollback; window-close /
  app-quit keep `disposeAllTerminals` — with unmount no longer a kill, the app lifecycle is the reap.)*
- **The `desktopTerminal` contextBridge** (`apps/desktop/electron/preload.ts`): a NEW
  `contextBridge.exposeInMainWorld("desktopTerminal", { spawn, write, resize, dispose, onData, onExit })`
  bridging renderer → `ipcRenderer.invoke`/`.on` → main — the EXACT pattern of the existing `desktopAuth`
  / `desktopApply` bridges. Its mere presence (`window.desktopTerminal`) is how the renderer
  feature-detects the desktop host (the `desktopApply`-presence precedent), driving cap 2's honest
  absent-bridge degradation. *(ADR-0189 adds `list` / `snapshot` members, and makes the preload's
  `onData`/`onExit` relays SINGLE-CONSUMER — one `ipcRenderer.on` registered at preload eval whose
  callback each `onData(cb)` call REPLACES — so a dock that unmounts and remounts across route changes
  never stacks duplicate listeners (N-times-repeated output after N route trips).)*
- **The native-module build wiring**: `node-pty` added to `apps/desktop/package.json` `dependencies` and
  `--external:node-pty` added to the `build:electron` esbuild (the `@napi-rs/keyring` precedent — a native
  module kept external from the CJS main bundle); and `@xterm/xterm` (+ `@xterm/addon-fit`) added to
  `apps/studio/package.json` `dependencies` (a new studio frontend dep). *(Neither dep can be declared via
  a cap `real.addDeps` arm — `resolveAddDepsGroup` only targets `packages/*`, never `apps/*`; verified
  `workspacePackageForSource("apps/studio/src/x.ts") → null`. So the deps are a glue prerequisite the
  orchestrator supplements BEFORE driving each cap's `--real` build; each cap's `install: true` then
  picks them up in the fresh worktree.)*
- **The dock-slot swap in `apps/studio/src/components/TreeView.tsx`**: mounting `<TerminalDock/>` in the
  `.world-frame` where `<ChatDock onReloadTree={…}/>` sits today (TreeView.tsx ~L2141). The terminal dock
  takes the interactive dock slot; ChatDock's component + tests stay in the tree DORMANT (ADR-0175). Which
  disposition — unmount ChatDock, hide it, or feature-flag it — is a layout call surfaced in "Open
  modeling calls" below; there is no isolatable red→green in mounting an already-proven component, so it
  is witnessed under UAT leg 1, not asserted in CI.

## Within-story dependency graph

Authored from the intended data-flow; re-derive from the real imports/calls when the units are built
(ADR-0010 §3) and correct if the code disagrees. The graph is acyclic; **both capabilities are roots**
(no in-story edge).

- `pty-session-manager` — a root. A self-contained Electron-main module over an injected `PtyPort`; it
  imports no other in-story unit.
- `terminal-dock-panel` — a root. It consumes the `desktopTerminal` bridge **WIRE SHAPE** (`spawn` /
  `write` / `resize` / `dispose` / `onData` / `onExit`), whose lifecycle SEMANTICS the
  `pty-session-manager` implements — but it imports **nothing** from the manager (they are across the
  contextBridge AND across packages). This is the `chat-panel` ↔ `chat-sse-mount` relationship exactly:
  they share the wire shape as a CONTRACT across the boundary, not a code edge, so there is **no
  `depends_on` edge**. A soft BUILD ordering (author the manager's wire shape first so the panel authors
  to the same verbs) is a convenience, not a data-flow dependency.

The two roots are joined only by the **operator-attested glue** above (the preload bridge + the main pty
wiring) — witnessed integrated under the Story UAT, exactly as the `desktop` story's independent
`credential-broker` and `local-backend-boot` roots are joined by glue.

## Cross-story boundary (ADR-0010 §4 / ADR-0074)

Authored from the intended consumed seams (re-verify against the real imports when built). This story
OWNS no package (a VIRTUAL story — the terminal-chat / headless-orchestrator precedent): its net-new code
is co-located inside two SURFACE packages other stories own.

- **`desktop`** — the surface this terminal SHIPS ON. The [`pty-session-manager`](pty-session-manager.md)
  module lives in `apps/desktop/src/backend/`, and the real-pty Electron-main wiring + the
  `desktopTerminal` preload bridge + the `node-pty` dep are `desktop`-surface glue (above). This story
  extends the `desktop` surface's package with co-located source; it adds **no new `@storytree/*` runtime
  import**, so the edge is an **artifact edge** (ADR-0166), declared in `depends_on` and annotated in
  `artifact_edges`. (The blocking boundary Rule 4 skips a virtual story; the annotation keeps the
  non-blocking ADR-0115 drift report clean, the terminal-chat pattern.)
- **`studio`** — the renderer surface the xterm component lives in. The desktop renders the **compiled**
  studio dist (ADR-0090 d.4), so the [`terminal-dock-panel`](terminal-dock-panel.md) is a `studio`
  frontend component (`apps/studio/src/components/TerminalDock.tsx`), exactly as `terminal-chat`'s caps
  edit `apps/studio/src`. It is a **thin client** — no `@storytree/agent` / `@storytree/drive` / model
  import (the `apps/studio/src` `modelPathBoundary.test.ts` wall); `xterm.js` is a third-party dep, not a
  cross-story `@storytree/*` edge — so this edge is also an **artifact edge**, declared and annotated.

**No edge to `notice-board` / `drive-machinery` / `forest-world`.** The observability layer watches the
terminal's Claude Code through the ALREADY-EXISTING seams — the presence hook (`scripts/presence-hook.sh`
declares a session on `SessionStart`), the CLI seam (`storytree noticeboard declare --node <story> --pg`
takes the work-time claim and lights the story wisp, ADR-0142), the store seam (`story build --real
--store pg` writes verdicts) — with **zero new coupling**. This story adds no observer code, so it draws
no edge to the observer organisms (ADR-0174: "nothing new is required to observe it").

## Story UAT

The integrated acceptance walkthrough that proves the whole embedded terminal meets its outcome
end-to-end. Minimal-first (one coherent journey: open the app → a real terminal sits in the dock → run
Claude Code in it → the map lights a wisp for it), defect-driven thereafter (each real failure earns a
permanent regression case, never speculative breadth).

> **Per-leg witness (ADR-0106 / ADR-0070).** The mechanics legs are covered by the two capabilities'
> signed `--real` verdicts (the pty lifecycle over a fake pty; the xterm dock over a mocked xterm +
> bridge). The experiential legs — a REAL node-pty spawning real Claude Code in-app (a native module +
> the paid subscription), the xterm **look/feel** ("reads and behaves like a real terminal"), and the
> end-to-end "a wisp lights on the map for the terminal's session" (needs a live store + the running
> map) — are `witness: human` (operator-attested, ADR-0070): an automated CI run cannot spawn a real
> native pty, run the paid SDK, or judge the terminal feel. The story-level `uat_witness` is absent →
> human (the ADR-0040 fail-closed signpost), so the machine-driven whole-story UAT node stays WITHHELD;
> the crown derives from the per-cap signed verdicts plus the operator's attestations.

**Goal —** A desktop user opens the app, finds a real terminal in the dock, runs real Claude Code in it,
and watches a wisp light on the forest map for that Claude Code session — the interactive surface being
the real tool, the observability layer watching it through the existing seams with no new code.

1. **A terminal sits in the dock.** _(witness: human)_ The member opens the desktop app; a terminal
   panel sits in the same collapse/resize dock the chat had (the interactive dock slot). **Success —**
   the terminal renders in the dock inside the native shell; ChatDock's dormant chat is not a second
   interactive surface (ADR-0175). *(Mounting the already-proven `TerminalDock` in `TreeView` is
   operator-attested glue, not a CI leg.)*
2. **The pty lifecycle is honest over the whole spawn → I/O → resize → dispose cycle.** _(witness:
   machine)_ Over a fake pty, the pty-session-manager spawns a session, routes the pty's output to the
   session's sink, forwards typed input and resizes to the right session, isolates concurrent sessions,
   and fails closed on an unknown/disposed id. **Success —** [`pty-session-manager`](pty-session-manager.md)'s
   signed verdict (the backend lifecycle, no real native module).
3. **The renderer terminal dock wires to the bridge and degrades honestly.** _(witness: machine)_ Over a
   mocked xterm + mocked `desktopTerminal` bridge, the dock spawns on open, pipes bridge data into the
   terminal and terminal input back to the bridge, resizes with the dock, toggles visibility keeping the
   terminal mounted, and renders a disabled "terminal unavailable here" state where the bridge is absent.
   **Success —** [`terminal-dock-panel`](terminal-dock-panel.md)'s signed verdict (geometry + wiring,
   xterm mocked).
4. **Real Claude Code runs in the embedded terminal.** _(witness: human)_ The member types `claude` (and
   real shell commands) in the embedded terminal; a REAL node-pty spawns a real shell in the member's
   checkout and Claude Code runs interactively in-app — its own turn knobs, slash commands, permission
   modes, plan mode, MCP, and skills all working (ADR-0174: the terminal's Claude Code has all of it for
   free). **Success —** real Claude Code, driven interactively inside the app. *(operator-attested — a
   native pty + a paid subscription session; an agent should not spawn it unattended.)*
5. **It reads and behaves like a real terminal.** _(witness: human)_ Scrollback, colours, resize reflow,
   keys, and the collapse/resize dock read and behave as ONE coherent terminal inside the native shell.
   **Success —** the owner's two-stage visual verdict (ADR-0070): the terminal feel is witnessed, never
   machine-asserted.
6. **The observability layer lights a wisp for the terminal's Claude Code session.** _(witness: human)_
   The Claude Code session running in the embedded terminal declares presence through the existing seams
   (the `SessionStart` presence hook + `storytree noticeboard declare --node <story> --pg`), and a story
   **wisp lights on the forest map** for it (ADR-0142) — with NO new observer code, proving the ADR-0174
   premise end-to-end. **Success —** a plain Claude Code session, launched from the in-app terminal,
   watched by the map exactly as any Claude Code session is. *(operator-attested — needs a live store +
   the running map + a real session.)*

End state — the desktop app embeds a real local terminal that runs real Claude Code in-app as the
interactive build surface, the pty lifecycle and the renderer dock signed under their suites, the real
pty / terminal feel / wisp-lights legs operator-attested — the interactive runtime becoming the real
tool while the prove-it-gate leaf and the observability seams are untouched.

## Proof

The story is proven when that walkthrough passes — the mechanics legs (2, 3) green under the two
capabilities' signed `--real` verdicts (with each cap's contracts green underneath), and the
experiential legs (1, 4, 5, 6) operator-attested. Per ADR-0020, `healthy` is only ever DERIVED from
signed verdicts; nothing here is authored healthy. Both capabilities are proof-wired (each carries a
`proof:` block with a `real:` arm — a NET-NEW red→green: a new module/component tested first against an
injected fake/mock) so the spine can drive their offline suites red→green under its own gate; the story's
machine-driven UAT node is WITHHELD (its `uat_witness` is absent → human, ADR-0040), so driving those
capabilities to signed verdicts is what makes the terminal layer buildable, and the crown additionally
awaits the operator's attestations (legs 1, 4, 5, 6).

## Open modeling calls (for the owner / orchestrator)

None is a story-shape fork (ADR-0174 settled the WHAT — embed a local terminal, retire the interactive
chat; owner-directed, no ADR reserved). Two items are **surfaced for the orchestrator's build**, not
decided here:

1. **The ChatDock dock-slot disposition (a layout call, operator-attested glue).** ADR-0175 keeps the
   chat components in the tree, DORMANT (their vitest suites stay green), for a future `app-guide`. The
   terminal dock takes the interactive dock slot. Whether the orchestrator **unmounts** `<ChatDock/>`
   from `TreeView`, **hides** it, or **feature-flags** it while keeping the code+tests is a layout/glue
   choice witnessed under UAT leg 1 — NOT a machine capability (there is no isolatable red→green in
   swapping which already-proven component mounts in `.world-frame`). The wall to hold: do NOT delete or
   behaviourally alter `ChatDock` / `ChatPanel` / the SSE / continuity / inspect infra (ADR-0175).
2. **The `node-build.test.ts` snapshot companion edit (REQUIRED, outside `stories/**`).** Authoring these
   two `real:`-armed caps makes `buildableNodeIds()` discover them (spec-borne, ADR-0057), which the
   `packages/cli/src/node-build.test.ts` REAL-buildable snapshot regex + its per-story discovery comment
   pin exactly (the known "node-build snapshot trap"). The orchestrator must add `pty-session-manager`
   and `terminal-dock-panel` (alphabetically) to that regex + a per-story comment, or `pnpm -r test` goes
   red. This is a `packages/cli` test edit — outside the story-author's `stories/**` fence — flagged here
   so it lands with the caps. (The `node-pty` / `@xterm/xterm` deps + esbuild `--external` are the other
   required glue prerequisites, listed under "Operator-attested glue" above.)
