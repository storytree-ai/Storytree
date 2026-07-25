---
id: "embedded-terminal"
tier: story
title: "The desktop app embeds a real local terminal — run Claude Code in-app, watched by the existing seams"
outcome: "The desktop app embeds a real local terminal — xterm.js in the renderer over a node-pty pseudo-terminal in the Electron main — docked with the same collapse/resize affordance the retired chat had, so the user runs REAL Claude Code in-app as their interactive build surface, and the observability layer watches that session through the existing presence-hook / noticeboard-claim / store-verdict seams exactly as it watches any Claude Code session — no new observer code required."
status: proposed
proof_mode: UAT
# uat_witness ABSENT → human (ADR-0040 fail-closed signpost). RE-ADJUDICATED 2026-07-26 (ADR-0209 §8
# corpus-wide migration, owner-directed 2026-07-25): the whole-story UAT resolves to SIX `machine` legs
# and TWO `human` legs; no leg is model-judged (nothing here turns on semantic judgment of prose or
# artifacts, so the model rung genuinely does not apply). The native-module, live-store and structural
# legs are `machine` — a real node-pty, a real xterm and a real claim row are all machine-observable
# through the EXISTING Electron `_electron` harness plus one live-gated spec; unharnessed, native, live
# and expensive are COSTS, never judgment gaps (`human-witness-is-a-judgment-gap-not-cost`). Exactly two
# legs stay `human`: driving the REAL PAID Claude Code subscription interactively (the owner's honesty
# wall — metered spend the proof spine must never burn unattended) and the terminal's FEEL (ADR-0070
# stage 2 — "reads like a real terminal" has no compiler, and ADR-0209 keeps look/feel on the human
# rung, never model-judged). The machine-driven story UAT node stays WITHHELD; the crown derives from
# the two capabilities' signed verdicts plus those two attestations.
# Capabilities, roots-first. TWO machine-provable caps on OPPOSITE sides of the contextBridge, each its
# own suite (the chat-sse-mount ↔ chat-panel precedent): pty-session-manager (the backend pty lifecycle,
# apps/desktop node:test over an injected fake pty) and terminal-dock-panel (the renderer xterm dock,
# apps/studio vitest over a mocked xterm + mocked bridge). They share the desktopTerminal WIRE SHAPE as a
# cross-boundary contract, not a code edge — so neither depends_on the other (both roots). The Electron
# main pty wiring + the preload bridge + the node-pty/xterm deps + the TreeView dock-slot swap are
# operator-attested GLUE within this story (ADR-0158), witnessed under the Story UAT, NOT capabilities.
capabilities: [pty-session-manager, terminal-dock-panel]
# Story-level cross-story edges (ADR-0010 §4 / ADR-0074). This story OWNS NO package — it is a VIRTUAL
# story (like app-guide / headless-orchestrator): its net-new code is CO-LOCATED inside two surface
# packages other stories own. So both edges are declared `depends_on` AND annotated `artifact_edges`
# (ADR-0166 — deliberate non-import / co-located-source edges, not @storytree/* package imports):
#   - desktop — the pty-session-manager module lives in apps/desktop/src/backend/, and the terminal's
#               Electron-main pty wiring + the `desktopTerminal` preload bridge + the node-pty dep are
#               desktop-surface glue. This story extends the `desktop` surface's package with co-located
#               source; it adds no NEW @storytree/* runtime import, so it is an artifact edge, not a
#               package-import edge. (Boundaries Rule 4 SKIPS a virtual story; artifact_edges keeps the
#               non-blocking ADR-0115 drift report clean — the app-guide precedent.)
#   - studio  — the xterm.js TerminalDock component lives in apps/studio/src/components/. The desktop
#               renders the COMPILED studio dist (ADR-0090 d.4), so the renderer terminal is a `studio`
#               frontend component, exactly as app-guide's caps edit apps/studio/src. Co-located
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
# terminal is the INTERACTIVE surface only; the prove-it-gate runtime binding is UNTOUCHED, and the
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
  Signed `--real` verdicts still come **only** from the deterministic spine driving the selected
  `PhaseAuthor` — `ClaudeAgentAuthor` is the compatibility default and `--runtime codex` opts into
  `CodexPhaseAuthor` — through the `AUTHOR_TEST → CONFIRM_RED → IMPLEMENT → CONFIRM_GREEN → GATE`
  walk (`packages/orchestrator/src/prove-it-gate.ts` etc.) — i.e. `story build --real` /
  `node build --real`. The selected live leaf is **entirely separate** from the interactive surface and
  is
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

These pieces have **no isolatable red→green seam at the CAPABILITY tier** — a `node:test` that spawned a
real node-pty (a native module) or drove a real Electron window would be the live-native trap the machine
caps deliberately avoid (the pty-session-manager is Electron-free and pty-native-free by construction; the
terminal-dock-panel mocks xterm + the bridge). They are witnessed under the **Story UAT**, exactly as the
`desktop` story models its `backend-entry.ts` sidecar wiring and its `desktopAuth` preload:

> **Glue-ness is a TIERING call, not a witness kind (corrected 2026-07-26, ADR-0209 §8).** This section
> previously read as if "glue" implied `witness: human`. It does not. A piece is glue because it has no
> isolatable capability-tier red→green; the Story-UAT leg that witnesses it is classified on its own
> merits, and the integrated Electron `_electron` Playwright harness (`apps/desktop/e2e/`) DOES drive a
> real node-pty and a real renderer end-to-end. So most of this glue is witnessed by `machine` UAT legs
> (1, 4, 6, 8) — "no CI leg exists for it yet" was never a reason to call a claim human
> (`human-witness-is-a-judgment-gap-not-cost`).

- **The real node-pty adapter + the pty IPC in the Electron main** (`apps/desktop/electron/main.ts`): the
  concrete `node-pty` implementation of the pty-session-manager's injected `PtyPort`, the
  `ipcMain.handle("terminal:spawn" | "terminal:write" | "terminal:resize" | "terminal:dispose")`
  handlers driving the manager, and the `webContents.send("terminal:data" | "terminal:exit", …)` stream
  back to the renderer. The manager (cap 1) is the provable core; this is the real-pty binding.
  *(ADR-0189 adds the re-attach slice: `ipcMain.handle("terminal:list")` — the manager's live sessions
  FILTERED to the currently-selected repo's cwd, the per-repo ownership policy — and
  `ipcMain.handle("terminal:snapshot")` relaying the manager's serialized screen state
  `{ data, cols, rows }` (ADR-0190 — the headless-terminal serialization, replacing the ADR-0189 raw
  buffered scrollback); window-close / app-quit keep `disposeAllTerminals` — with unmount no longer a
  kill, the app lifecycle is the reap.)*
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
  module kept external from the CJS main bundle); `@xterm/headless` (+ `@xterm/addon-serialize`) added to
  `apps/desktop/package.json` `dependencies` (ADR-0190 — the pure-JS headless screen model the manager
  serializes for `snapshot`; no native rebuild surface, esbuild bundles them); and `@xterm/xterm`
  (+ `@xterm/addon-fit`) added to `apps/studio/package.json` `dependencies` (a new studio frontend dep).
  *(None of these deps can be declared via a cap `real.addDeps` arm — `resolveAddDepsGroup` only targets
  `packages/*`, never `apps/*`; verified `workspacePackageForSource("apps/studio/src/x.ts") → null`. So the
  deps are a glue prerequisite the orchestrator supplements BEFORE driving each cap's `--real` build; each
  cap's `install: true` then picks them up in the fresh worktree.)*
- **The dock-slot swap in `apps/studio/src/components/TreeView.tsx`**: mounting the terminal in the
  `.world-frame` where `<ChatDock onReloadTree={…}/>` used to sit. The terminal dock takes the interactive
  dock slot; ChatDock's component + tests stay in the tree DORMANT (ADR-0175). *(RESOLVED by the build,
  recorded 2026-07-26: the disposition chosen was **UNMOUNT** — `TreeView` mounts `<TerminalRepoGate …
  repoControl={<RepoPicker/>}/>` and imports only `TerminalDockSeed` as a type; `<ChatDock/>` is rendered
  nowhere in `apps/studio/src` outside `ChatDock*.test.tsx`, whose vitest suites stay green. The old "Open
  modeling calls" item asking unmount-vs-hide-vs-flag is closed below.)* There is no isolatable red→green
  in mounting an already-proven component, so it stays glue at the capability tier — but the mount IS
  observable in the integrated harness, so UAT leg 1 asserts it in CI rather than attesting it.

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
OWNS no package (a VIRTUAL story — the app-guide / headless-orchestrator precedent): its net-new code
is co-located inside two SURFACE packages other stories own.

- **`desktop`** — the surface this terminal SHIPS ON. The [`pty-session-manager`](pty-session-manager.md)
  module lives in `apps/desktop/src/backend/`, and the real-pty Electron-main wiring + the
  `desktopTerminal` preload bridge + the `node-pty` dep are `desktop`-surface glue (above). This story
  extends the `desktop` surface's package with co-located source; it adds **no new `@storytree/*` runtime
  import**, so the edge is an **artifact edge** (ADR-0166), declared in `depends_on` and annotated in
  `artifact_edges`. (The blocking boundary Rule 4 skips a virtual story; the annotation keeps the
  non-blocking ADR-0115 drift report clean, the app-guide pattern.)
- **`studio`** — the renderer surface the xterm component lives in. The desktop renders the **compiled**
  studio dist (ADR-0090 d.4), so the [`terminal-dock-panel`](terminal-dock-panel.md) is a `studio`
  frontend component (`apps/studio/src/components/TerminalDock.tsx`), exactly as `app-guide`'s caps
  edit `apps/studio/src`. It is a **thin client** — no `@storytree/agent` / `@storytree/drive` / model
  import (the `apps/studio/src` `modelPathBoundary.test.ts` wall); `xterm.js` is a third-party dep, not a
  cross-story `@storytree/*` edge — so this edge is also an **artifact edge**, declared and annotated.

**No edge to `notice-board` / `drive-machinery` / `forest-world`.** The observability layer watches the
terminal's Claude Code through the ALREADY-EXISTING seams — the presence hook (`scripts/presence-hook.sh`
declares a session on `SessionStart`), the CLI seam (`storytree noticeboard declare --node <story> --pg`
takes the work-time claim and lights the story wisp, ADR-0142), the store seam (`story build --real
--store pg` writes verdicts) — with **zero new coupling**. This story adds no observer code, so it draws
no edge to the observer organisms (ADR-0174: "nothing new is required to observe it").

## UAT Test Criteria

The integrated acceptance walkthrough that proves the whole embedded terminal meets its outcome
end-to-end. Minimal-first (one coherent journey: open the app → a real terminal sits in the dock → run
Claude Code in it → the map lights a wisp for it), defect-driven thereafter (each real failure earns a
permanent regression case, never speculative breadth).

> **Per-leg witness (ADR-0209 §1 / ADR-0106 / ADR-0070).** **RE-ADJUDICATED 2026-07-26** under the
> ADR-0209 §8 corpus-wide migration (owner-directed 2026-07-25). Three classified kinds are available:
> `machine` (deterministic, spine-observed proof), `model` (rubric-bound semantic judgment by an eligible
> read-only judge), `human` (irreducible operator judgment). This story resolves to **six `machine` legs
> and two `human` legs; no leg is model-judged** — nothing here turns on semantic judgment of prose or
> artifacts, so the model rung genuinely does not apply.
>
> The wiring legs (2, 3) are covered by the two capabilities' signed `--real` verdicts (the pty lifecycle
> over a fake pty; the xterm dock over a mocked xterm + bridge) — those two tags are unchanged.
>
> Legs **1, 4 and 6** are `machine` through the **existing** Electron `_electron` Playwright harness
> (`apps/desktop/e2e/`), which already launches the app offline, satisfies the repo gate by pre-writing
> the userData `repo-selection.json`, spawns a **REAL node-pty**, types into it, and reads the main-held
> serialized screen state back through `desktopTerminal.snapshot` (`session-survival.e2e.mjs` — the
> renderer-independent observable, since xterm paints to a WebGL canvas where available and DOM text
> would pass or fail by GPU availability). A real native module, a real renderer and a real shell are all
> machine-observable there; leg **8** is `machine` too, on a SECOND, live-gated spec (see below). These
> four were previously tagged `human`; that was a conservative mis-tag, not an irreducible judgment
> (`human-witness-is-a-judgment-gap-not-cost` — a machine-observable success that is merely native,
> live, expensive or unharnessed is never labelled `human`). In particular, leg 1 previously justified
> itself as *"operator-attested glue, not a CI leg"* — glue-ness is a capability-TIERING call and the
> absence of a harness is a cost; neither makes a DOM-structural claim irreducible.
>
> Exactly **two** legs stay `human` because their success condition has no compiler *(or, for leg 5, sits
> behind the owner's explicit honesty wall)*: driving the **REAL PAID Claude Code subscription**
> interactively — real metered spend the proof spine must never burn unattended, and a judgment about a
> third-party interactive product's affordances rather than about our pty — and the terminal's **FEEL**
> ("reads as ONE coherent terminal"; ADR-0070 stage 2, and ADR-0209 keeps look, feel and lived experience
> on the human rung, never model-judged). The story-level `uat_witness` is absent → human (the ADR-0040
> fail-closed signpost), so the machine-driven whole-story UAT node stays WITHHELD.
>
> **Nothing here is green.** Per ADR-0209 §6 a substantive criterion change invalidates the old green, so
> every leg below is UNSTAMPED and earns green only under its newly-declared witness. Legs 1, 4, 6 and 8
> carry seed-canonical `uat-criterion` detail artifacts (ADR-0209 §5) because their one-line titles cannot
> convey the stub boundary, the false-pass trap, or the renderer-independent observable; the remaining
> legs are fully specified by their capability contracts or by short, self-contained attestation prose, so
> per the owner's narrower bar they get no artifact.
>
> **Two `machine` legs have no spec at HEAD** (legs 6 and 8 — leg 1's and leg 4's observables are already
> driven by `session-survival.e2e.mjs`). Tagging them `machine` with no spec yet is the correct, honest
> state: the tag states which KIND of witness is right, never that the proof exists. Stub recipes naming
> the harness are recorded in "Open modeling calls".

**Goal —** A desktop user opens the app, finds a real terminal in the dock, runs real Claude Code in it,
and watches a wisp light on the forest map for that Claude Code session — the interactive surface being
the real tool, the observability layer watching it through the existing seams with no new code.

1. **A terminal sits in the dock.** _(witness: machine)_ The member opens the desktop app; with a valid
   repo selected (the `terminal-repo-picker` gate — satisfied in the harness by pre-writing the userData
   `repo-selection.json`, as `session-survival.e2e.mjs` already does), a terminal panel sits in the same
   `.world-frame` dock slot the chat occupied. **Success —** in the real Electron renderer the forest page
   exposes the `[aria-label="expand terminal"]` toggle, expanding it renders a live `.terminal-dock` with
   its session panel, and NO chat dock (`.chat-dock`) is rendered anywhere in the app — the dormant chat
   is not a second interactive surface, while `ChatDock`/`ChatPanel` and their vitest suites stay in the
   tree (ADR-0175). *(Presence, placement and the single-interactive-surface property are DOM-structural
   observables in the integrated harness. Mounting the dock stays glue at the capability tier — no
   isolatable red→green in swapping which already-proven component mounts — but that is a tiering call,
   not a witness kind.)* Detail: `embedded-terminal#uat-1`.
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
4. **A REAL pty hosts a real interactive shell in the member's checkout.** _(witness: machine)_ The dock
   spawns a REAL node-pty in the selected repo; typed input reaches the real shell and its output comes
   back, and a full-screen interactive program (alternate screen buffer, redraw on keypress) drives the
   same session — the property that makes an interactive TUI work at all. **Success —** a line command
   round-trips through the real shell and an interactive full-screen program renders and responds, read
   back from the main-held serialized screen state (`desktopTerminal.snapshot`) — NOT the mocked
   xterm/mocked bridge capability 3 signs. *(`session-survival.e2e.mjs` already spawns the real pty, types
   `echo survival-probe` and reads it back this way, so the native-module half of this leg is harnessed
   today; only the interactive-program assertion is net-new.)* Detail: `embedded-terminal#uat-4`.
5. **Real Claude Code runs interactively in the embedded terminal.** _(witness: human)_ The member types
   `claude` and drives a real session in-app — its own turn knobs, slash commands, permission modes, plan
   mode, MCP and skills all working (ADR-0174: the terminal's Claude Code has all of it for free).
   **Success —** the owner's attestation that real Claude Code, not an imitation of it, is the interactive
   build surface. *(`human` under the owner's explicit honesty wall, and NOT because the harness is
   missing: this burns REAL metered subscription spend that the proof spine must never spawn unattended,
   and "all of Claude Code's affordances work" is a judgment about a third-party interactive product
   rather than about our pty. Leg 4 machine-proves the part with a compiler — that the pty faithfully
   hosts a real interactive program.)*
6. **Scrollback, reflow and keys behave like a real terminal.** _(witness: machine)_ Over the REAL xterm
   and REAL pty in the integrated harness: output beyond the viewport is retained in scrollback (the dock
   constructs xterm at scrollback 5000, aligned with the main-held headless screen model, ADR-0190);
   resizing the dock RESIZES the pty and reflows the session (the serialized screen returns at the new
   geometry with content rewrapped, not truncated); control keys reach the shell (Ctrl+C interrupts a
   running command); and collapsing/expanding the dock keeps the SAME session live. **Success —** the
   terminal's mechanics asserted against a real renderer and a real shell. *(Capability 3's suite pins the
   same WIRING over a MOCKED xterm — `tdp-resizes-with-the-dock`, `tdp-ctrl-c-copies-selection-ctrl-v-pastes`,
   `tdp-toggles-visibility-keeping-terminal-mounted`, `tdp-constructs-with-aligned-scrollback` — but a mock
   cannot exhibit reflow or scrollback retention, so this leg is the real-renderer half, not a
   restatement.)* Detail: `embedded-terminal#uat-6`.
7. **It READS as one coherent terminal.** _(witness: human)_ Colours, glyph rendering, the dock chrome and
   the terminal body read as ONE coherent terminal inside the native shell — not a web widget imitating a
   terminal. **Success —** the owner's two-stage visual verdict (ADR-0070 stage 2). *(Irreducible: "reads
   like a real terminal" is an aesthetic judgment with no compiler, and ADR-0209 keeps look, feel and
   lived experience on the human rung — never model-judged, never machine-asserted. The MECHANICS this leg
   used to carry — scrollback, reflow, keys, the collapse/resize dock — moved to leg 6, where they have
   one.)*
8. **The existing observability seams watch a session started in the terminal — a wisp lights.**
   _(witness: machine)_ A session started in the embedded terminal takes its claim through the EXISTING
   CLI seam — `storytree noticeboard declare --node embedded-terminal --pg`, run in the terminal's real
   pty (ADR-0142) — and the map paints a wisp for it with NO new observer code, proving the ADR-0174
   premise end-to-end. **Success —** the declare writes a `work`-grade row to `events.node_claim` for that
   session; the desktop's own `/api/activity` read reports it (`claimsToActivity`); and the rendered scene
   carries exactly one claim-wisp keyed to that session (ADR-0212: wisp count encodes SESSIONS, the build
   wisp folded into the claim body). *(Live-gated — it needs the REAL backend sidecar and a reachable
   store, which the offline `_electron` mode stubs away (`STORYTREE_DESKTOP_E2E=1` skips the sidecar and
   `harness.mjs` stubs every `/api/*` call), so this needs a SECOND, live-gated spec that SKIPs on absent
   preconditions rather than failing. Live and expensive are costs, not judgment gaps. The wisp's LOOK is
   `wisp-as-story-claim`'s own leg and is not re-judged here.)* **Corrected 2026-07-26:** this leg
   previously credited the `SessionStart` **presence hook** with declaring. ADR-0200 D3 RETIRED presence
   rows and made the hook's `start` mode pure and offline — it prints the anchor nudge and touches no
   store (`packages/cli/src/ambient-presence-entry.ts`); the claim is taken by the explicit `declare`
   (or `storytree worktree create --node`), and the statusline only heartbeats an existing claim. A
   machine leg written from the old prose would have asserted a write that correctly no longer happens.
   Detail: `embedded-terminal#uat-8`.

End state — the desktop app embeds a real local terminal that runs real Claude Code in-app as the
interactive build surface: the pty lifecycle and the renderer dock signed under their suites, the dock
mount / the real pty / the terminal mechanics / the wisp seam machine-observed in the integrated harness,
and exactly two legs operator-attested — the paid interactive Claude Code session and the terminal's feel
— the interactive runtime becoming the real tool while the prove-it-gate leaf and the observability seams
are untouched.

## Proof

The story is proven when that walkthrough passes — the wiring legs (2, 3) green under the two
capabilities' signed `--real` verdicts (with each cap's contracts green underneath), the integrated legs
(1, 4, 6, 8) green under spine-observed specs in the Electron `_electron` harness plus one live-gated
spec, and the two irreducible legs (5, 7) operator-attested. Per ADR-0209 §6 this re-adjudication leaves
every leg UNSTAMPED — nothing below is green, and two machine legs (6, 8) have no spec at HEAD; a
`machine` tag states which witness is right, never that the proof exists. Per ADR-0020, `healthy` is only ever DERIVED from
signed verdicts; nothing here is authored healthy. Both capabilities are proof-wired (each carries a
`proof:` block with a `real:` arm — a NET-NEW red→green: a new module/component tested first against an
injected fake/mock) so the spine can drive their offline suites red→green under its own gate; the story's
machine-driven UAT node is WITHHELD (its `uat_witness` is absent → human, ADR-0040), so driving those
capabilities to signed verdicts is what makes the terminal layer buildable, and the crown additionally
awaits the four integrated machine legs (1, 4, 6, 8) and the operator's two attestations (legs 5, 7).

## Open modeling calls (for the owner / orchestrator)

None is a story-shape fork (ADR-0174 settled the WHAT — embed a local terminal, retire the interactive
chat; owner-directed, no ADR reserved). The first two items are **CLOSED** (kept as the record of how
they resolved); items 3 and 4 are **surfaced for the orchestrator's build** by the 2026-07-26 witness
re-adjudication, not decided here:

1. ~~**The ChatDock dock-slot disposition.**~~ **CLOSED 2026-07-26 — resolved by the build.** The
   disposition chosen was **UNMOUNT**: `TreeView` renders `<TerminalRepoGate … repoControl={<RepoPicker/>}/>`
   in `.world-frame` and imports only `TerminalDockSeed` as a type; `<ChatDock/>` appears nowhere in
   `apps/studio/src` outside `ChatDock.test.tsx` / `ChatDock.reload.test.tsx`, whose suites stay green.
   The ADR-0175 wall held — the components, the SSE transport, continuity and inspect infra are all still
   in the tree, behaviourally untouched. The "not a second interactive surface" property is now asserted
   in CI under UAT leg 1 rather than attested.
2. ~~**The `node-build.test.ts` snapshot companion edit.**~~ **CLOSED — landed.** Both
   `pty-session-manager` and `terminal-dock-panel` are present in the REAL-buildable snapshot regex in
   `packages/cli/src/node-build.test.ts` with their per-story discovery comment.
3. **Two `machine` legs have no spec at HEAD (a build obligation, not a re-tag).** Legs 6 and 8 are
   correctly classified but undischarged; a `machine` tag is a statement about the RIGHT witness, never a
   claim that proof exists (ADR-0209 §6 — both are UNSTAMPED). Stub recipes, so the tag is cheap rather
   than speculative:
   - **Leg 6** — extend the existing `_electron` harness (`apps/desktop/e2e/`, the `session-survival.e2e.mjs`
     pattern: real pty, repo gate pre-satisfied, read back via `desktopTerminal.snapshot` — never DOM text,
     which the WebGL renderer makes GPU-dependent). Emit more rows than the viewport and assert retention;
     drive the dock's resize edge and assert the serialized screen returns at the new geometry with content
     REWRAPPED; send Ctrl+C to a running command and assert the interrupt; collapse/expand and assert the
     same `sessionId` from `desktopTerminal.list()`.
   - **Leg 8** — a SECOND, live-gated spec: launch WITHOUT `STORYTREE_DESKTOP_E2E` and WITHOUT the
     harness's `/api/*` stubs so the real sidecar spawns (the `desktop#uat-4` precedent), run the declare
     inside the real pty, then assert the claim row, the `/api/activity` payload and exactly one
     claim-wisp for that session id. Gate it on a reachable store and SKIP — never fail — when the
     preconditions are absent (the live-store-test pattern); a SKIP is an honest non-result, not a pass.
4. **Leg 6's reflow assertion may need a main-side capability check first (surfaced, not settled).** The
   renderer-independent observable is the main-held `@xterm/headless` screen model (ADR-0190). Whether
   `snapshot()` after a resize genuinely exhibits REWRAP — rather than the headless model being resized
   without reflowing historical rows — should be probed before the spec is authored; if it does not, the
   honest options are to assert reflow on a different real observable or to narrow leg 6's reflow clause
   to what the seam can actually show. Narrowing the CLAIM is legitimate; silently re-tagging it `human`
   because the observable is awkward is not.
5. **The OS-clipboard round trip has no UAT leg (surfaced, deliberately NOT added).**
   `terminal-dock-panel`'s contract 12 (`tdp-ctrl-c-copies-selection-ctrl-v-pastes`) proves the handler
   over a mocked clipboard, and the cap file used to describe the physical clipboard as "the story's
   operator-attested UAT leg" — but no story leg covers it, and it would be MACHINE-observable in the
   `_electron` harness if one did (that mis-description is corrected in the cap file). Adding a leg for it
   now would be speculative breadth (`uat-proves-the-goal-not-the-surface`) — the goal is running Claude
   Code in a real terminal, not covering the clipboard surface. Recorded so a future copy/paste defect
   earns a permanent regression leg (defect-driven), rather than the gap being hidden on a human rung.
