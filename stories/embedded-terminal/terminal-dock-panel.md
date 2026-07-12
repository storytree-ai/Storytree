---
id: "terminal-dock-panel"
tier: capability
story: embedded-terminal
title: "The renderer xterm.js terminal dock — mounts in the collapse/resize dock, wires to the desktopTerminal bridge, degrades honestly"
outcome: "The studio frontend adds an xterm.js terminal that mounts inside a collapse/resize dock (the same affordance ChatDock had), spawns over the `desktopTerminal` bridge on open, pipes bridge data into the terminal and terminal input back to the bridge, resizes with the dock, toggles visibility keeping the terminal mounted, and degrades honestly to a disabled 'terminal unavailable here' state where the bridge is absent — a THIN CLIENT that imports no `@storytree/agent`/`@storytree/drive` and holds no model path."
status: proposed
proof_mode: integration-test
depends_on: []
# Node-borne proof config (ADR-0057 keystone): authoring THIS block is what makes the capability
# inner-loop buildable — no NODE_BUILD_REGISTRY edit. NET-NEW (no editsExisting): the leaf authors a
# vitest jsdom component test that imports a NOT-YET-EXISTING component from a NEW source file under
# apps/studio/src/components (red = module-not-found against the source that does not exist at HEAD),
# then writes that one new component (green). FRONTEND-BUILDER TWO-STAGE (ADR-0070): this `real:` arm
# proves the GEOMETRY/BEHAVIOUR ONLY (spawn-on-open, data↔bridge wiring, resize, visibility toggle,
# honest absent-bridge degradation) over a MOCKED xterm + a MOCKED `desktopTerminal` bridge — the
# terminal's APPEARANCE ("reads and behaves like a real terminal") is the story's operator-attested UAT
# leg 5 (the look is witnessed, never a machine visual verdict; do NOT add a visual assertion here).
# The dock collapse/resize geometry REUSES ChatDock's tested pattern (mirror it in this one self-
# contained component; do NOT modify/fold into ChatDock — it stays DORMANT per ADR-0175). The proof
# command is the studio VITEST suite (`pnpm --filter studio test`), NOT node:test — the studio convention
# (apps/studio/src/components/*.test.tsx are @vitest-environment jsdom, vi.mock the seams,
# @testing-library/react, fake timers). SCOPE = apps/studio/src (the terminal is a studio frontend
# component; the desktop renders the COMPILED studio dist, ADR-0090 d.4). xterm.js is a NEW studio dep
# added as GLUE (the orchestrator adds @xterm/xterm + @xterm/addon-fit to apps/studio/package.json before
# the --real drive; this cap declares NO `addDeps` — resolveAddDepsGroup targets packages/*, never
# apps/*: verified workspacePackageForSource("apps/studio/src/x.ts") → null); `install: true` then picks
# them up in the fresh worktree.
#
# CRITICAL — the real arm declares an explicit `proofCommand` (the vitest-runner-mismatch correction,
# the chat-panel / credential-broker precedent): the studio suite is VITEST + jsdom, NOT node:test.
# resolveProveSpec's DEFAULT real proof command is `node --import tsx --test <testFile>` (node:test),
# which CANNOT run a vitest jsdom `.test.tsx`. So this cap MUST declare a `real.proofCommand` that runs
# the ONE test file under VITEST: `pnpm --filter studio exec vitest run src/components/TerminalDock.test.tsx`
# (cwd is apps/studio, so the path is package-relative). The spine's CONFIRM observation and the leaf's
# run_proof both ride this ONE command (the one-oracle property), so red→green is observed under vitest.
proof:
  command:
    file: pnpm
    args: ["--filter", "studio", "test"]
  scope:
    testGlobs: ["apps/studio/src/**/*.test.tsx", "apps/studio/src/**/*.test.ts"]
    sourceGlobs: ["apps/studio/src/**/*.ts", "apps/studio/src/**/*.tsx"]
  real:
    testFile: "apps/studio/src/components/TerminalDock.test.tsx"
    sourceFile: "apps/studio/src/components/TerminalDock.tsx"
    # RE-PROVE (ADR-0057 §3 expansion C): TerminalDock.tsx + its test ALREADY EXIST at HEAD (signed by
    # the original story build, the contract-6/7/8 re-proves, and the terminal-tabs multi-session +
    # seed re-drives) — this arm is driven `editsExisting` again for APP-OWNED SESSION SURVIVAL
    # (terminal-orchestrator-seat increment 1, owner-directed 2026-07-12, ADR-0189): contract 9
    # (`tdp-reattaches-live-sessions-on-mount` — mounting the dock enumerates still-live sessions over
    # the bridge's new OPTIONAL `list()` and re-attaches a tab per session, replaying each session's
    # `snapshot()` scrollback into its fresh xterm BEFORE any post-mount live chunk, never spawning a
    # duplicate) and the REDEFINED unmount lifecycle (the multi-session-tabs contract
    # `mst-unmount-preserves-sessions`, renamed from `mst-disposes-all-sessions-on-unmount`: unmount
    # disposes RENDERER resources — each xterm/fit — and clears the session table, but calls NO
    # `bridge.dispose`; the ptys stay alive, app-owned — explicit tab-close "×" and app-quit are the
    # ONLY kills). The leaf reads the existing source + 20 contract-titled tests (9 tdp-* after this, 6
    # mst-*, 6 son-*), ADDS the tdp-9 test, REWRITES the one mst unmount test (title AND assertion — the
    # spec in stories/terminal-tabs/multi-session-tabs.md is already re-tensed), then EDITS
    # TerminalDock.tsx — a behaviour-assertion red (the dock at HEAD spawns fresh on every mount and
    # disposes every session on unmount). EVERY OTHER existing contract test keeps its EXACT title and
    # stays green (check:coverage matches titles, ADR-0122 — the recurring dropped-title trap).
    editsExisting: true
    scope:
      testGlobs: ["apps/studio/src/components/TerminalDock.test.tsx"]
      sourceGlobs: ["apps/studio/src/components/TerminalDock.tsx"]
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
        - "src/components/TerminalDock.test.tsx"
---

# The renderer xterm.js terminal dock — mounts in the collapse/resize dock, wires to the desktopTerminal bridge, degrades honestly

**Outcome —** The studio frontend adds an **xterm.js** terminal that mounts inside a **collapse/resize
dock** (the same affordance ChatDock had), **spawns** over the `desktopTerminal` bridge on open, pipes
bridge **data into the terminal** and terminal **input back to the bridge**, **resizes** with the dock,
**toggles visibility** keeping the terminal mounted, and **degrades honestly** to a disabled "terminal
unavailable here" state where the bridge is absent. It is a **thin client**: it imports no
`@storytree/agent` / `@storytree/drive` and holds no model path.

> **Now MULTI-SESSION (ADR-0186 / `terminal-tabs`, PR after #705).** `TerminalDock.tsx` was rewritten
> single-session → **multi-session with a tab strip** by [`terminal-tabs`' multi-session-tabs](../terminal-tabs/multi-session-tabs.md).
> Every behaviour below is **PRESERVED, re-proven PER TAB, not deleted**: the per-session behaviours
> (spawn, input↔pty, data-in, resize, visibility-toggle, refocus, empty-session message) now hold on the
> **active/first tab** (the N=1 case of the tab model), and the per-dock ones (the `headerRight` slot, the
> absent-bridge degrade) exercise the **dock chrome that wraps the tab set**. All eight `tdp-*` contracts
> stay in `TerminalDock.test.tsx` and stay GREEN under the rewritten source — re-proven by
> `multi-session-tabs`'s signed `--real` verdict (this cap's crown source-drifts on the rewrite and is
> re-signed over the multi-session bytes, the ADR-0057 §3 anchored-bytes re-sign). Read "the terminal" /
> "the dock" below as "each tab's terminal" / "the per-dock chrome"; the tab lifecycle itself is
> `multi-session-tabs`'.

**Depends on —** nothing (within `embedded-terminal`). The terminal is a self-contained component whose
ONLY backend seam is the `window.desktopTerminal` bridge (the [`BuildSection`](../../apps/studio/src/components/BuildSection.tsx)
/ ChatPanel precedent — a self-contained component over one seam, a clean jsdom unit). It sits on the
OPPOSITE side of the contextBridge from [`pty-session-manager`](pty-session-manager.md) and imports
nothing from it — they share the bridge WIRE SHAPE as a cross-boundary contract, not a code edge (the
`chat-panel` ↔ `chat-sse-mount` precedent), so there is no in-story edge either way.

> **Proof status (honest) — BUILT & SIGNED (contracts 1–8), now RE-PROVEN PER-TAB under a multi-session
> rewrite.** Contracts 1–5 landed under the original story build's signed `--real` verdict (the xterm.js
> terminal the user sees and types into); contract 6 (the operator-found refocus regression) re-signed via
> an `editsExisting` re-prove; contracts 7 (the optional `headerRight` header slot) and 8 (the empty-session
> honest message) re-signed via a further `editsExisting` re-prove of the SAME source for the 2026-07-12
> terminal-repo-picker UX refinement (PR #705). **Then `terminal-tabs` (ADR-0186) rewrote `TerminalDock.tsx`
> single-session → multi-session with a tab strip:** this cap's anchored source drifts on that rewrite, and
> its eight `tdp-*` behaviours are **re-proven per-tab / per-dock** by
> [`multi-session-tabs`](../terminal-tabs/multi-session-tabs.md)'s signed `--real` verdict over the new
> source (the per-session contracts on the active/first tab, the `headerRight` + degrade contracts on the
> per-dock chrome) — the anchored bytes re-sign, so the crown is never left stale. **Then re-driven
> `editsExisting` again for ADR-0189 app-owned session survival (contract 9): mount re-attaches to
> still-live sessions with scrollback replayed; unmount preserves sessions (disposing renderer resources
> only — the redefined never-orphan wall, pinned as `mst-unmount-preserves-sessions`).** The pty
> LIFECYCLE it drives (over the bridge) is
> [`pty-session-manager`](pty-session-manager.md); the real `desktopTerminal` bridge
> (`apps/desktop/electron/preload.ts`, including the re-attach `list`/`snapshot` relay) and the real-pty
> Electron-main wiring are the story's
> operator-attested GLUE. Its *appearance inside the native shell* ("reads and behaves like a real
> terminal") is the story's operator-attested UAT leg 5 (ADR-0070 — the look is witnessed, never a machine
> visual verdict), and the `.terminal-dock*` chrome is CSS glue re-attested there; the tab-strip look is
> `terminal-tabs`' operator-attested leg.

## Guidance

WHY THIS IS A CAPABILITY, NOT A CONTRACT: its honest proof is the TERMINAL DOCK AS A WHOLE — a
behavioural React component that, on open, spawns over the `desktopTerminal` bridge, wires the bridge's
data stream into the xterm instance and the xterm's input back to the bridge, resizes the pty as the dock
resizes, toggles visibility in the dock keeping the terminal mounted (state preserved), and renders an
honest disabled state where the bridge is absent. It spans the mount + spawn AND the bidirectional data
wiring AND the resize AND the dock geometry AND the absent-bridge degradation, exercised against its two
mocked seams (xterm + the bridge) — an integration test of the component's behaviour, not a single
isolated assertion.

WHY THIS IS A SEPARATE CAPABILITY FROM `pty-session-manager` (the splitting-rule, ADR-0010): the panel
and the manager sit on OPPOSITE sides of the contextBridge and prove DIFFERENT observables in DIFFERENT
suites. `pty-session-manager` (the backend) proves the pty LIFECYCLE — a manager over an injected pty
(proof scope `apps/desktop`, `node:test`). THIS proves the FRONTEND — a React terminal that spawns, wires
xterm, resizes, and degrades (proof scope `apps/studio/src`, vitest jsdom). They share the bridge wire
shape (`spawn` / `write` / `resize` / `dispose` / `onData` / `onExit`) as a CONTRACT across the boundary,
not a code edge: the panel never imports the manager, the manager never imports the panel — exactly why
the renderer dock is a `studio` unit and the manager is a `desktop` unit.

THE PANEL IS A THIN CLIENT — NO AGENT, NO DRIVE, NO MODEL PATH (ADR-0004 / ADR-0108 d.1). The terminal
sends bytes over the bridge and renders bytes from the bridge; it **never imports `@storytree/agent` and
never imports `@storytree/drive`** (both are on the `apps/studio/src` model-path FORBIDDEN list, enforced
by `apps/studio/src/modelPathBoundary.test.ts`). The agent boundary is the Electron main (the bridge +
the pty wiring) — the renderer is downstream of `window.desktopTerminal`. xterm.js is a third-party
rendering library, NOT a model path — so the terminal adds NO new cross-story `@storytree/*` edge and NO
model-path breach. (This is the interactive surface, never the prove-it-gate leaf — the terminal composes
no signing/build/PR; ADR-0174 / ADR-0091.)

THE BRIDGE IS THE ONLY SEAM (the `desktopApply`-presence + `BuildSection` precedent). The renderer reaches
the pty ONLY through `window.desktopTerminal`, a NEW contextBridge the desktop preload exposes (the story
glue), whose shape mirrors `desktopAuth` / `desktopApply`:
- `spawn(opts?): Promise<{ sessionId }>` — start a pty session (the Electron main drives
  `pty-session-manager.create`).
- `write(sessionId, data): void` · `resize(sessionId, cols, rows): void` · `dispose(sessionId): void` —
  forward to the manager.
- `onData(cb: (sessionId, chunk) => void): void` · `onExit(cb: (sessionId, e) => void): void` — subscribe
  to the `webContents.send` stream the main forwards.
The test `vi.mock`s this bridge (installing a scripted `window.desktopTerminal`) and drives every
observable through it — no real IPC, no real pty, no real Electron. Its **absence**
(`window.desktopTerminal === undefined`, the studio-standalone case) is what drives the honest disabled
state — the same feature-detect the shared `StoreBanner` uses on `window.desktopApply`.

The ADR-0189 re-attach slice adds two OPTIONAL members to the bridge shape (older preloads lack them —
feature-guard, never assume):
- `list?(): Promise<Array<{ sessionId }>>` — the still-live sessions the main scopes to the currently
  selected repo (the per-repo ownership policy lives in the glue).
- `snapshot?(sessionId): Promise<string>` — the session's main-held buffered scrollback, replayed into a
  fresh xterm on re-attach.

RE-ATTACH ON MOUNT, SPAWN ONLY WHEN THERE IS NOTHING TO RE-ATTACH (contract 9 — ADR-0189 app-owned
sessions). On mount with the bridge present and `list` available, the dock enumerates the still-live
sessions and creates ONE TAB PER SESSION — adopting each `sessionId` rather than calling `spawn` — and
replays each session's `snapshot()` into that tab's fresh xterm BEFORE any post-mount live `onData`
chunk for that session is written (hold live chunks per tab until its replay lands, so re-attached
output never interleaves out of order). The first-expand auto-spawn is GATED on the restore having
settled: while `list()` is in flight the dock never auto-spawns, and when the restore yields sessions it
never spawns a duplicate; only a restore that settles EMPTY (or a bridge with no `list` — an older
preload) leaves the existing spawn-on-first-expand behaviour byte-identical to today. Unmounting
disposes each tab's xterm/fit (renderer resources) and clears the session table but calls NO
`bridge.dispose` — the ptys stay alive, app-owned; the explicit per-tab "×" (and app-quit, glue-side)
stay the only kills (the redefined never-orphan wall — `mst-unmount-preserves-sessions` in
[`multi-session-tabs`](../terminal-tabs/multi-session-tabs.md) pins the unmount half; clearing the
table on unmount also keeps a stale bridge callback from writing to a disposed xterm).

XTERM IS MOCKED AT TEST TIME (jsdom lays out no terminal; the SAME discipline `ChatPanel.test.tsx` uses
on `../api`). The test `vi.mock`s the xterm module with a fake `Terminal` (recording `write` / `onData` /
`open` / `resize` / `dispose`), so the wiring (bridge-data → `terminal.write`, `terminal.onData` →
`bridge.write`, dock-resize → `terminal` fit + `bridge.resize`) is observable deterministically with NO
real canvas/DOM-heavy xterm render. `@vitest-environment jsdom`, `@testing-library/react`, fake timers —
no real socket, no live pty, no SDK, no DB, no Electron. The xterm **look/feel** is NOT asserted here —
it is the story's operator-attested UAT leg 5.

REUSE ChatDock's TESTED DOCK PATTERN, DO NOT DISTURB THE DORMANT CHAT (ADR-0175). The collapse/resize
dock geometry (a folded-by-default bottom overlay that expands and drags-to-resize, clamped to the map
frame — `ChatDock.tsx`'s MIN/DEFAULT/max-height + the top-edge drag) is REUSED as the terminal's dock
chrome. Author it as ONE self-contained `TerminalDock` component that MIRRORS that geometry (keeping this
cap's net-new a single source file for a clean `real:` scope), OR extract a shared dock chrome — the
leaf's call; the contracts pin the OBSERVABLE (the same collapse/resize affordance), not the sharing
mechanism. Either way: do NOT fold the terminal into `ChatDock` and do NOT change `ChatDock`/`ChatPanel`
behaviour — they stay in the tree DORMANT for the future `app-guide` (their vitest suites must stay
green). The terminal dock takes the interactive dock SLOT (the TreeView mount swap is operator-attested
glue, the story's leg 1).

DEGRADE HONESTLY WHERE THE BRIDGE IS ABSENT (slow growth, the honest-failure discipline). The terminal
ships inside BOTH the native desktop (bridge present) and the standalone studio (`window.desktopTerminal`
absent — the desktop preload is not loaded). In studio-standalone the terminal must render an honest
disabled "terminal unavailable here" state — never spawn, never hang waiting for a stream that never
arrives, never crash the surrounding studio (the `StoreBanner` store-unreachable / `ChatPanel` no-backend
precedent). A load-bearing observable, not polish.

RE-FOCUS THE TERMINAL AFTER A WINDOW FOCUS CYCLE (contract 6 — the operator-found refocus bug). When the
Electron window loses focus (another window/app steals it) and the user clicks BACK onto the terminal,
keyboard input must still reach the xterm — today it does not (xterm's hidden input textarea is not
re-focused after the window blur/focus cycle). The mounted terminal must be RE-FOCUSED — `term.focus()`
called — on the events that mean "the user is back on the terminal": the browser window's `focus` event,
a `mousedown`/`click` on the dock body, and the document's `visibilitychange` back to visible. Guard it on
the terminal being mounted (a spawned session exists) so an absent-bridge / folded dock never calls focus.
The refocus is a behaviour change of the contract-6 re-prove; the spawn/data/resize/toggle/degrade wiring
and the other existing contracts stay intact. THE JSDOM-PROVABLE PART is that `term.focus()` is invoked on
those events (the mocked xterm records `focus()` calls) — assert exactly that. Whether keystrokes then
*physically* reach the textarea is operator-attested (the story's UAT legs 4/5), NEVER a jsdom/visual
assertion here.

AN OPTIONAL `headerRight` HEADER SLOT (contract 7 — the terminal-repo-picker UX refinement). The terminal
needs an affordance in its OWN header (the toggle bar) so a caller can place a control there — the
downstream `terminal-repo-gate` puts the repo picker as a gear top-right, in the dock's REAL header (which
moves with the bottom-anchored, drag-resized dock, so only the dock itself can host it — an outside overlay
cannot track it). Add an OPTIONAL `headerRight?: React.ReactNode` prop; when provided (and the bridge is
present) render it in the toggle-bar header area, top-right (a passive render slot — the dock does not
interpret it, and nested interactive controls sit as a SIBLING of the toggle `<button>`, never inside it,
to keep valid HTML). When the prop is ABSENT the header renders exactly as before (byte-behaviour-identical
— the `❯_` prompt + fold chevron, nothing extra). The absent-bridge disabled state renders NO `headerRight`
(studio-standalone has no repo control to host). THE JSDOM-PROVABLE PART: with `headerRight` provided the
node renders within the dock; with it absent, no header-right container renders — assert exactly that. The
slot's exact placement/look is `.terminal-dock*` CSS glue, operator-attested (UAT leg 5), NEVER asserted
here.

AN HONEST MESSAGE ON AN EMPTY SESSION (contract 8 — item 1, the main-side fail-close feedback). The
Electron main FAILS CLOSED when no valid repo is selected: `terminal:spawn` returns `{ sessionId: "" }`
rather than a shell in the wrong cwd. Today the dock takes that empty id and leaves a BLANK screen — a
silent block. Instead, when `spawn()` resolves an empty `sessionId`, write an honest one-line message to
the xterm (e.g. `No repository selected — choose one to start the terminal.`) and set up NO live session
(no pending-seed write, input inert) — never a throw, never a hang. This is defence-in-depth: the
downstream gate already withholds the dock until a repo is ready, so this path is rarely reached through
the UI, but it guarantees the block is never a silent blank screen (the owner's item 1). THE
JSDOM-PROVABLE PART: with the bridge's `spawn()` scripted to resolve `{ sessionId: "" }`, the mocked xterm
records a `write` of the honest message and NO session is wired — assert exactly that. The non-empty path
(a real session id) keeps the existing spawn/seed/data behaviour intact.

## No new cross-story edge (the boundary call — ADR-0010 §4 / ADR-0074)

The terminal CONSUMES the `desktopTerminal` bridge shape, but consuming a bridge shape is **not** a
package import and is **not** a new `depends_on`:

- **No `@storytree/*` frontend import.** The terminal imports React + xterm.js (a third-party lib) and
  reaches the pty only through `window.desktopTerminal` — it imports no `@storytree/agent`/`@storytree/drive`
  (the model-path wall) and no other organism. The bridge shape is declared LOCALLY (a small interface
  over `window.desktopTerminal`), the same move `chat-panel` makes for the SSE wire and `boot-read-routes`
  makes for `LocalMe`.
- **No new `@storytree/*` dep in `apps/studio/package.json`.** xterm.js is a third-party dependency (added
  as glue), not an `@storytree/*` edge the boundary scan (`check:boundaries`, ADR-0100) would require a
  declared cross-story edge for. So this cap adds NO new package-import edge.
- **The cross-boundary contract is the bridge shape.** The `spawn`/`write`/`resize`/`dispose`/`onData`/
  `onExit` verbs are the seam both the renderer (here) and the Electron-main glue author to — a CONTRACT
  across the process boundary, enforced by both sides authoring the same shape, not by a code edge.

So `depends_on: []` (within-story) and the story's `desktop`/`studio` `artifact_edges` (co-located
source, no import) are the correct, honest graph — the terminal-chat precedent.

## Integration test

**Goal —** Prove that the terminal dock, over a mocked xterm + a mocked `desktopTerminal` bridge, spawns
on open, pipes bridge data into the terminal and terminal input back to the bridge, resizes with the
dock, toggles visibility keeping the terminal mounted, and renders an honest disabled state where the
bridge is absent. Entirely in jsdom: xterm + the bridge are mocked, fake timers drive transitions, no
real socket/pty/SDK/DB/Electron.

The integration test exercises this capability against its **real collaborator shape** — the two mocked
seams (the `desktopTerminal` bridge + the xterm `Terminal`), scripted as doubles exactly as
`ChatPanel.test.tsx` scripts `../api`. No stubs within the component's own composition (the mount, the
wiring, the dock geometry, the degradation are all real).

The integration test would:

1. Install a scripted `window.desktopTerminal` mock + `vi.mock` the xterm module with a recording fake
   `Terminal`. Render `<TerminalDock/>` in jsdom on fake timers; expand the dock.
2. On open → assert the bridge `spawn` was called once and the fake `Terminal` was `open`ed into the
   dock's container — the spawn-on-open + mount.
3. Drive the bridge's `onData` with two chunks → assert each was written to the fake `Terminal`
   (`terminal.write`) in order — the pty-output → terminal wiring.
4. Fire the fake `Terminal`'s `onData` (user keystrokes) → assert each was forwarded to the bridge's
   `write(sessionId, data)` — the terminal-input → pty wiring.
5. Drag the dock's resize edge (and/or trigger the fit) → assert the terminal fit recomputed and the
   bridge's `resize(sessionId, cols, rows)` was called with the new geometry; assert the dock height
   clamps to the map-frame bounds (ChatDock's tested clamp) — the resize wiring + dock geometry.
6. Collapse then expand the dock → assert the terminal stays MOUNTED across the fold (no re-spawn, the
   session preserved), the fold using the `hidden` attribute so the folded body leaves the a11y tree
   (the ChatDock testable-fold pattern) — the visibility toggle.
7. Render with `window.desktopTerminal` ABSENT (delete the mock) → assert the component renders an honest
   disabled "terminal unavailable here" state, NEVER calls `spawn`, does NOT hang, and does NOT crash —
   the honest absent-bridge degradation.

## Contracts (9)

The test-proven leaf behaviours — each **one isolated automated test** in the `studio` suite (vitest
jsdom, `apps/studio/src/components/TerminalDock.test.tsx`), the xterm + bridge seams mocked/scripted.
Contracts 1–5 are BUILT (the original story build's signed verdict); contract 6 is the operator-found
refocus regression; contracts 7–8 are the terminal-repo-picker UX refinement (an optional `headerRight`
header slot + an honest empty-session message); contract 9 is the ADR-0189 app-owned-session re-drive
(mount re-attaches to still-live sessions, scrollback replayed) — each later rung added by an
`editsExisting` re-prove that keeps every earlier contract test green under its EXACT title. Per
ADR-0122 (`storytree coverage`), each contract id is the lead of a distinctly-named test (the
`it("<id>: …")` convention), so the coverage check reports 9/9. None is an APPEARANCE assertion — the
look is the story's operator-attested UAT leg 5 (ADR-0070).

1. **`tdp-spawns-on-open-and-writes-data`** — opening the terminal spawns over the bridge and pipes bridge data into xterm
   - **asserts —** expanding the dock calls `desktopTerminal.spawn` once and `open`s the (mocked) xterm
     into the container; each `onData` chunk the bridge emits is written to the terminal
     (`terminal.write`) in order — the spawn-on-open + pty-output → terminal wiring. The component's ONLY
     backend seam is the bridge (ADR-0004) — it imports no agent/drive/model code.
   - **covers —** `apps/studio/src/components/TerminalDock.tsx` (spawn-on-open + data-in wiring) *(provisional path)*
2. **`tdp-forwards-input-to-bridge`** — terminal keystrokes are forwarded to the bridge write
   - **asserts —** the fake xterm's `onData` (user keystrokes) is forwarded to `desktopTerminal.write(sessionId, data)`
     — the terminal-input → pty wiring.
   - **covers —** `apps/studio/src/components/TerminalDock.tsx` (input-out wiring) *(provisional path)*
3. **`tdp-resizes-with-the-dock`** — resizing the dock refits the terminal and resizes the pty
   - **asserts —** dragging the dock resize edge (and/or the fit) recomputes the terminal fit and calls
     `desktopTerminal.resize(sessionId, cols, rows)` with the new geometry, and the dock height clamps to
     the map-frame bounds (ChatDock's tested clamp) — the resize wiring + the reused dock geometry.
   - **covers —** `apps/studio/src/components/TerminalDock.tsx` (resize wiring + dock clamp) *(provisional path)*
4. **`tdp-toggles-visibility-keeping-terminal-mounted`** — collapse/expand keeps the terminal mounted, session preserved
   - **asserts —** collapsing then expanding the dock keeps the terminal MOUNTED (no re-spawn — the bridge
     `spawn` is not called again), the folded body leaving the a11y tree via the `hidden` attribute (the
     ChatDock testable-fold pattern) — the visibility toggle with preserved session.
   - **covers —** `apps/studio/src/components/TerminalDock.tsx` (the dock visibility toggle) *(provisional path)*
5. **`tdp-degrades-when-bridge-absent`** — an absent desktopTerminal bridge renders an honest disabled state, never spawns/hangs
   - **asserts —** with `window.desktopTerminal` ABSENT (the studio-standalone case), the component
     renders an honest disabled "terminal unavailable here" state, NEVER calls `spawn`, does NOT hang on a
     stream that never arrives, and does NOT crash the surrounding surface — the honest absent-bridge
     degradation.
   - **covers —** `apps/studio/src/components/TerminalDock.tsx` (the absent-bridge disabled state) *(provisional path)*
6. **`tdp-refocuses-after-window-focus-cycle`** — the mounted terminal re-focuses on window-focus / dock-body interaction / visibilitychange so input survives a window blur→focus cycle
   - **asserts —** with the dock expanded and a session spawned, the (mocked) xterm's `focus()` is called
     when the browser window fires a `focus` event, when the dock body receives a `mousedown`/`click`, and
     when the document `visibilitychange`s back to visible — the refocus wiring that restores keyboard
     input after the Electron window loses+regains focus (the operator-found bug). When the terminal is
     NOT mounted (bridge absent / never expanded) those events call no `focus()` (the mount guard). This
     asserts the `term.focus()` INVOCATION only — that keystrokes then physically reach the textarea is
     the story's operator-attested UAT leg (ADR-0070), never a jsdom assertion.
   - **covers —** `apps/studio/src/components/TerminalDock.tsx` (the window-focus/body/visibility refocus wiring) *(provisional path)*
7. **`tdp-renders-header-right-slot`** — an optional `headerRight` node renders in the dock's toggle-bar header when provided, and nothing extra when absent
   - **asserts —** with the bridge present, rendering `<TerminalDock headerRight={<X/>}/>` renders the
     provided node within the dock (the toggle-bar header area) as a SIBLING of the toggle button (valid
     HTML — never nested in the `<button>`); rendering `<TerminalDock/>` with no `headerRight` renders no
     header-right container (byte-behaviour-identical header). The slot is passive — the dock does not
     interpret the node. This is the affordance the downstream `terminal-repo-gate` uses to place the repo
     control as a gear in the dock's real (moving) header.
   - **covers —** `apps/studio/src/components/TerminalDock.tsx` (the optional headerRight render slot) *(provisional path)*
8. **`tdp-shows-message-on-empty-session`** — an empty sessionId from spawn writes an honest message, never a silent blank screen
   - **asserts —** with the bridge's `spawn()` scripted to resolve `{ sessionId: "" }` (the main-side
     fail-close when no valid repo is selected), the (mocked) xterm records a `write` of an honest one-line
     message (matching e.g. /repository/i) and NO live session is wired (no pending-seed write, terminal
     input inert) — the block is never a silent blank screen (the owner's item 1). The non-empty path (a
     real session id) keeps the existing spawn/seed/data behaviour intact.
   - **covers —** `apps/studio/src/components/TerminalDock.tsx` (the empty-session honest message) *(provisional path)*
9. **`tdp-reattaches-live-sessions-on-mount`** — mounting the dock re-attaches to still-live sessions (scrollback replayed), never spawning a duplicate
   - **asserts —** with the bridge's `list()` scripted to resolve two live session ids and `snapshot(id)`
     scripted per id, MOUNTING the dock creates one tab per live session WITHOUT calling `spawn`; each
     tab's (mocked) xterm receives its `snapshot` bytes — the scrollback replay — BEFORE any post-mount
     live `onData` chunk for that session (a chunk emitted while the snapshot is in flight is held and
     written after it); post-mount input/data route to the re-attached session ids; expanding the dock
     during/after the restore never auto-spawns a duplicate tab. With `list()` resolving `[]` — or the
     method ABSENT (an older preload) — the dock is byte-behaviour-identical to before: first expand
     auto-spawns one fresh session (ADR-0189 app-owned sessions).
   - **covers —** `apps/studio/src/components/TerminalDock.tsx` (the mount-time restore + replay path) *(provisional path)*

## Guidance — the net-new slice that earns the signed verdict

> **Historical (contracts 1–5).** This section describes the ORIGINAL net-new build that signed contracts
> 1–5. Contract 6 is NOT net-new — it re-proves the existing source via `editsExisting` (the regression
> red is a behaviour-assertion failure, not a missing-symbol; the brief in the FIRST `## Guidance` section
> above governs it). Kept as the net-new history of this cap; do not read the "import resolves NOTHING" red
> below as the current build's red.

The brownfield bootstrap rung toward `healthy` (ADR-0057 §3, NET-NEW): author the terminal dock as a new
component, test-first.

- **The new test —** `apps/studio/src/components/TerminalDock.test.tsx` (`@vitest-environment jsdom`,
  vitest + `@testing-library/react`, the studio convention — `vi.hoisted` + `vi.mock` the xterm module
  and install a scripted `window.desktopTerminal`, fake timers, exactly as `ChatPanel.test.tsx` /
  `BuildSection.test.tsx` do; NO real socket/pty/SDK/DB/Electron). Import `{ TerminalDock }` from
  `"./TerminalDock"`. Name each test for its contract id (`tdp-…`) so `storytree coverage
  terminal-dock-panel` reports 5/5 (ADR-0122).
- **The RED the spine observes (before IMPLEMENT) —** the import resolves NOTHING — `TerminalDock.tsx`
  does not exist at HEAD, so the test fails module-not-found (the net-new missing-symbol red, ADR-0057).
  Assert spawn-on-open + data-in, input-out, resize + dock clamp, the visibility toggle, and the honest
  absent-bridge state.
- **The GREEN —** write `apps/studio/src/components/TerminalDock.tsx`: a behavioural React component that
  reaches the pty only through `window.desktopTerminal` (a locally-declared bridge interface), mounts an
  xterm `Terminal` into the dock container, wires bridge-data → `terminal.write` and `terminal.onData` →
  `bridge.write`, refits + `bridge.resize` on dock resize, folds via `hidden` keeping the terminal
  mounted, and renders the honest disabled state where the bridge is absent — the dock geometry mirroring
  `ChatDock`'s tested collapse/resize pattern. NO `@storytree/agent`, NO `@storytree/drive`, NO model path
  (the `modelPathBoundary.test.ts` wall stays green). *(The `@xterm/xterm` + `@xterm/addon-fit` deps are a
  glue prerequisite the orchestrator adds to `apps/studio/package.json` before this drive — this cap
  declares no `addDeps` since apps/* is not an addDeps target; `install: true` picks them up.)* After it,
  the import resolves, the assertions hold, and `pnpm --filter studio test` + `pnpm --filter studio
  typecheck` stay green. WIRING `<TerminalDock/>` into the studio app shell (the `TreeView` dock-slot
  swap) + the live real-pty run + the terminal feel are witnessed under the Story UAT (legs 1, 4, 5),
  not asserted in CI.

Rules:

- **Thin client — no agent, no drive, no model path** (ADR-0004 / ADR-0108 d.1). The terminal's only
  backend seam is `window.desktopTerminal`; it imports no agent/drive/model code and declares the bridge
  shape locally. The `modelPathBoundary.test.ts` guard pins this repo-wide; the terminal must not breach it.
- **Mock xterm + the bridge — assert wiring, never the look** (ADR-0070). Prove the geometry/behaviour
  over the two mocked seams; the xterm appearance ("reads like a real terminal") is the story's UAT leg 5.
  Do NOT author a visual/appearance assertion here; the terminal author signs no visual verdict.
- **Reuse ChatDock's dock pattern, keep it DORMANT** (ADR-0175) — mirror the collapse/resize geometry;
  do NOT fold into or behaviourally change `ChatDock`/`ChatPanel` (their suites must stay green).
- **Fail closed, never hang** — an absent bridge renders an honest disabled state, never a spawn, never a
  hung stream, never a crash (`tdp-degrades-when-bridge-absent`).
- **Renderer terminal only (slow growth)** — render + wire the terminal over the bridge shape. Do NOT
  implement the pty lifecycle (that is `pty-session-manager`'s), do NOT compose the build command to
  inject (the ADR-0174 map-spawn re-point is a separate follow-on), do NOT reach cloud/web terminals
  (DEFERRED, ADR-0174), do NOT add signing/build/PR (the interactive surface, never the gate leaf).
