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
    # ┌─ THE ONE AND ONLY TEST TO ADD ─────────────────────────────────────────────────────────────────┐
    # │ `it('tdp-ctrl-c-copies-selection-ctrl-v-pastes: …')` — the Ctrl+C-COPY / Ctrl+V-PASTE keyboard   │
    # │ handler (`term.attachCustomKeyEventHandler` in `initTab`), and NOTHING ELSE. IF YOU FIND YOURSELF │
    # │ WRITING A TEST ABOUT ResizeObserver, fit, resize, snapshot, tabs, OR seeds — STOP: that is the    │
    # │ WRONG contract. Every one of those is ALREADY BUILT and its test ALREADY EXISTS in this file      │
    # │ (freeze list below). This drive is ONLY the Ctrl+C-copy / Ctrl+V-paste handler.                   │
    # └────────────────────────────────────────────────────────────────────────────────────────────────┘
    #
    # RE-PROVE (ADR-0057 §3 expansion C): TerminalDock.tsx + its test ALREADY EXIST at HEAD. THIS CAP IS
    # ALL-BUILT EXCEPT CONTRACT 12. Contracts 1–8 (original build + the 6/7/8 re-proves + the terminal-tabs
    # multi-session/seed re-drives), contract 9 `tdp-reattaches-live-sessions-on-mount` (the ADR-0190 replay
    # re-tense — restore-at-dims → write → fit → forward, BUILT+SIGNED @ 60280a0c), contract 10
    # `tdp-fits-before-spawn-and-passes-initial-dims` (@ a90e30b), contract 11
    # `tdp-refits-on-expand-activation-and-resize` (@ 9439df5), and contract 13
    # `tdp-refits-on-container-resize` (the container-size-change / ResizeObserver refit, @ eee0314) are ALL
    # BUILT AND SIGNED. Contract 12
    # `tdp-ctrl-c-copies-selection-ctrl-v-pastes` is the ONE unbuilt behaviour: the owner-reported defect
    # that Ctrl+C in the embedded terminal never copies a selection (xterm consumes the keydown and always
    # forwards \x03 / SIGINT to the pty) and Ctrl+V is not explicitly handled. This drive closes contract 12
    # and nothing else.
    #
    # WRONG-CONTRACT WARNING (observed-defect tally now 3): a prior --real drive @ eee0314, briefed for
    # contract 12, instead built the container-size-change / ResizeObserver refit — the slice this spec USED
    # TO name "A LATER SLICE, NOT YET CONTRACTED". That green PASS is real and is now ADOPTED as contract 13
    # (`tdp-refits-on-container-resize`). DO NOT build it again: a `tdp-refits-on-container-resize` test
    # ALREADY EXISTS in TerminalDock.test.tsx and MUST stay BYTE-IDENTICAL, as must its `ResizeObserver` impl
    # in TerminalDock.tsx and its `FakeResizeObserver` mock. The prior "later slice" language that steered
    # that drive has been removed from this spec — do not re-derive it.
    #
    # THE DEFECT (Windows Terminal convention): Ctrl+C WITH an active selection = copy to the clipboard, NO
    # SIGINT; Ctrl+C WITHOUT a selection = interrupt as before (the \x03 reaches the pty); Ctrl+V = paste the
    # clipboard into the terminal. This is renderer keyboard wiring in TerminalDock.tsx (the handler attaches
    # per-tab in `initTab`, for EVERY tab's Terminal) — squarely this cap's seam, provable over the mocked
    # xterm.
    #
    # THE ONLY PERMITTED TEST-FILE CHANGE — ADD ONE NEW TEST (+ its ADDITIVE mock extensions). The sole edit
    # to TerminalDock.test.tsx is ADDING one new `it('tdp-ctrl-c-copies-selection-ctrl-v-pastes: …')` block,
    # plus the ADDITIVE mock extensions it needs: the FakeTerminal gains `attachCustomKeyEventHandler`
    # (capturing the handler), test-controlled `hasSelection()`/`getSelection()`, and a recording `paste()`;
    # the test stubs `navigator.clipboard` with `vi.fn` `writeText`/`readText`. Every EXISTING test's title
    # AND body stays BYTE-IDENTICAL — do NOT rename any id, do NOT touch any other test's body, do NOT build a
    # different contract. Adding/renaming an EXISTING test, or building a different contract, IS the exact
    # defect this brief exists to prevent — 7 observed instances of id/title drift, and 3 observed instances
    # of building a DIFFERENT contract than briefed (the latest @ eee0314 → contract 13, above). The mock
    # extensions are PURELY ADDITIVE (new members on
    # FakeTerminal, a new navigator.clipboard stub) — they must not change what any existing test observes.
    #
    # THE RED THE SPINE MUST OBSERVE (write this new test, watch it fail, THEN implement): at HEAD
    # TerminalDock.tsx never calls `attachCustomKeyEventHandler`, so the test's captured handler is undefined
    # and the assertions cannot even run — that IS the red. Assert, by INVOKING the captured handler with
    # synthetic KeyboardEvent-shaped objects:
    #   (a) keydown Ctrl+C (ctrlKey, no shift/alt/meta) while `term.hasSelection()` is true → the handler
    #       writes `term.getSelection()` to the clipboard via `navigator.clipboard.writeText` and RETURNS
    #       FALSE, and `bridge.write` is NOT called with '\x03' (the interrupt is suppressed — the copy path);
    #   (b) keydown Ctrl+C with NO selection → the handler RETURNS TRUE (xterm's normal path forwards \x03 to
    #       the pty) and the clipboard is untouched — the interrupt behaviour is preserved;
    #   (c) keydown Ctrl+V → the handler reads `navigator.clipboard.readText` and pastes it through the
    #       terminal via `term.paste(text)` (so bracketed-paste is honoured and the bytes flow to the pty via
    #       the existing onData→bridge.write wiring) and RETURNS FALSE — assert `term.paste` called with the
    #       clipboard text;
    #   (d) a non-keydown event (keyup/keypress) or any other key → RETURNS TRUE (untouched);
    #   (e) `navigator.clipboard` ABSENT → the handler RETURNS TRUE and never throws (jsdom/older-runtime
    #       feature-guard).
    # Then EDIT TerminalDock.tsx (`initTab`, for EVERY tab's Terminal) to attach the handler via
    # `term.attachCustomKeyEventHandler`. No new dep.
    #
    # WHETHER THE OS CLIPBOARD PHYSICALLY HOLDS THE TEXT is the story's operator-attested UAT leg (ADR-0070),
    # never asserted here — the jsdom test asserts only the handler's return values, the clipboard `vi.fn`
    # calls, and that no '\x03' reaches `bridge.write`.
    #
    # FREEZE EVERYTHING ELSE BY NAME: contracts 1–8, contract 9 (`tdp-reattaches-live-sessions-on-mount` @
    # 60280a0c, plus its companion `tdp-restores-snapshot-at-recorded-size-then-fits`), contract 10
    # (`tdp-fits-before-spawn-and-passes-initial-dims` @ a90e30b), contract 11
    # (`tdp-refits-on-expand-activation-and-resize` @ 9439df5), and contract 13
    # (`tdp-refits-on-container-resize` @ eee0314, with its `FakeResizeObserver` mock) STAND — their test
    # bodies are UNTOUCHED; the terminal-tabs `mst-*` and `son-*` tests SHARE this file and stay GREEN under
    # their EXACT titles.
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

> **Now MULTI-SESSION (ADR-0186 / `terminal-tabs`, PR after #705; presentation remolded to a session panel
> under ADR-0190 §3).** `TerminalDock.tsx` was rewritten single-session → **multi-session** by
> [`terminal-tabs`' multi-session-tabs](../terminal-tabs/multi-session-tabs.md) (a tab strip at ADR-0186,
> remolded to a VS Code-style **session panel** under ADR-0190). Every behaviour below is **PRESERVED,
> re-proven PER SESSION, not deleted**: the per-session behaviours (spawn, input↔pty, data-in, resize,
> visibility-toggle, refocus, empty-session message) now hold on the **active/first session** (the N=1 case
> of the multi-session model), and the per-dock ones (the `headerRight` slot, the absent-bridge degrade)
> exercise the **dock chrome that wraps the panel + pane**. All `tdp-*` contracts stay in
> `TerminalDock.test.tsx` and stay GREEN under the rewritten source — re-proven by `multi-session-tabs`'s
> signed `--real` verdict (this cap's crown source-drifts on the rewrite and is re-signed over the
> multi-session bytes, the ADR-0057 §3 anchored-bytes re-sign). Read "the terminal" / "the dock" below as
> "each session's terminal" / "the per-dock chrome"; the multi-session lifecycle itself is
> `multi-session-tabs`'.

**Depends on —** nothing (within `embedded-terminal`). The terminal is a self-contained component whose
ONLY backend seam is the `window.desktopTerminal` bridge (the [`BuildSection`](../../apps/studio/src/components/BuildSection.tsx)
/ ChatPanel precedent — a self-contained component over one seam, a clean jsdom unit). It sits on the
OPPOSITE side of the contextBridge from [`pty-session-manager`](pty-session-manager.md) and imports
nothing from it — they share the bridge WIRE SHAPE as a cross-boundary contract, not a code edge (the
`chat-panel` ↔ `chat-sse-mount` precedent), so there is no in-story edge either way.

> **Proof status (honest) — BUILT & SIGNED (contracts 1–11 [9 = the ADR-0190 replay re-tense @ 60280a0c;
> 11 = expand + activation refit only]); CONTRACT 12 (Ctrl+C-copies-selection / Ctrl+V-pastes) PENDING (the
> next drive).** Contracts 1–5 landed under the original story build's signed `--real` verdict (the xterm.js
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
> only — the redefined never-orphan wall, pinned as `mst-unmount-preserves-sessions`). Then the ADR-0190
> re-drive (@ a90e30b) UNDER-DELIVERED and the audit corrected this spec to reality: it built ONLY the
> fit-before-spawn slice — now adopted as **contract 10 `tdp-fits-before-spawn-and-passes-initial-dims`**
> (built+signed: a fresh tab fits before spawning and passes the fitted `cols`/`rows` into `bridge.spawn`)
> — and left **contract 9's replay path BYTE-IDENTICAL** (the old `tdp-reattaches-live-sessions-on-mount`
> test stayed green, so coverage falsely read it covered). Contract 9's re-tensed replay
> ({data,cols,rows} restore-at-dims → write → fit → forward) was THEN BUILT+SIGNED @ 60280a0c — the shipped
> `TerminalDock.tsx` does the resize→write(`data`)→flush-held-chunks→fit replay, and the suite carries both
> the re-tensed `tdp-reattaches-live-sessions-on-mount` and a companion
> `tdp-restores-snapshot-at-recorded-size-then-fits` test. **Contract 11 `tdp-refits-on-expand-activation-and-resize`** is
> built+signed @ 9439df5 — but only its EXPAND + TAB-ACTIVATION triggers (an `[expanded, activeId]` fit
> effect); the container-size-change / `ResizeObserver` refit is NOW CONTRACTED AS contract 13
> `tdp-refits-on-container-resize`, built+signed @ eee0314.** The pty
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
feature-guard, never assume); ADR-0190 re-shapes `snapshot` and extends `spawn`:
- `list?(): Promise<Array<{ sessionId }>>` — the still-live sessions the main scopes to the currently
  selected repo (the per-repo ownership policy lives in the glue).
- `snapshot?(sessionId): Promise<{ data, cols, rows }>` — the session's main-held SERIALIZED SCREEN STATE
  (`data`) at its recorded dims (`cols`/`rows`), restored into a fresh xterm on re-attach (ADR-0190,
  pty-session-manager's re-tensed contract 6 — replacing the ADR-0189 raw scrollback string).
- `spawn(opts?)` gains OPTIONAL `cols`/`rows` (ADR-0190): a fresh spawn carries the dock's fitted initial
  dims so a new pty never starts at the 80×24 default under a wide dock (contract 10). Absent (an older
  preload / no fitted dims yet) the main spawns at its existing default — feature-additive, not required.

RE-ATTACH ON MOUNT RESTORES SERIALIZED SCREEN STATE, THEN FITS (contract 9 — ADR-0189 app-owned sessions,
ADR-0190 serialized-screen restore). On mount with the bridge present and `list` available, the dock
enumerates the still-live sessions and creates ONE TAB PER SESSION — adopting each `sessionId` rather than
calling `spawn`. For each adopted tab the dock consumes the bridge `snapshot(sessionId)` — now
`{ data, cols, rows }` (ADR-0190) — and RESTORES it in order: RESIZE the fresh xterm to the snapshot's
`cols`/`rows` (so the serialization lands on a terminal the exact size it was recorded at, reconstructing
the screen faithfully), WRITE `data` into it, THEN `fit()` the xterm to its real container and forward the
fitted dims to the pty via `bridge.resize(sessionId, cols, rows)` — the resident TUI receives a real
resize and repaints itself into the new geometry (no replayed-history artifacts, no mid-sequence cuts).
The restore runs BEFORE any post-mount live `onData` chunk for that session is written (hold live chunks
per tab until its replay lands, so re-attached output never interleaves out of order). The first-expand
auto-spawn is GATED on the restore having settled: while `list()` is in flight the dock never auto-spawns,
and when the restore yields sessions it never spawns a duplicate; only a restore that settles EMPTY (or a
bridge with no `list`/`snapshot` — an older preload) leaves the existing spawn-on-first-expand behaviour
byte-identical to today. Unmounting disposes each tab's xterm/fit (renderer resources) and clears the
session table but calls NO `bridge.dispose` — the ptys stay alive, app-owned; the explicit per-tab "×"
(and app-quit, glue-side) stay the only kills (the redefined never-orphan wall —
`mst-unmount-preserves-sessions` in [`multi-session-tabs`](../terminal-tabs/multi-session-tabs.md) pins
the unmount half; clearing the table on unmount also keeps a stale bridge callback from writing to a
disposed xterm).

FIT THE TERMINAL TO ITS CONTAINER — THREE CONTRACTS, ALL BUILT (ADR-0190, the missing fit lifecycle).
Before this, the ONLY thing that fit the xterm to its container was the manual drag handle (the resize
edge, contract 3) — so a tab that mounts, expands, activates, or whose container changes size kept xterm's
80×24 default, and a FRESH spawn asked the pty for 80×24 even under a wide dock (the defect the owner
walked: fresh tabs are the wrong size). The fit lifecycle splits into THREE contracts:

- **Contract 10 `tdp-fits-before-spawn-and-passes-initial-dims` (BUILT+SIGNED @ a90e30b).** A FRESH tab
  computes the fit BEFORE spawning and passes the fitted `cols`/`rows` into `bridge.spawn({ …, cols, rows })`
  (the ADR-0190 optional `spawn` dims), so the new pty starts at the real terminal size, never 80×24 under
  a wide dock. This is the mount-time fit for a fresh tab; the adopted green test carries this id verbatim.
- **Contract 11 `tdp-refits-on-expand-activation-and-resize` (BUILT+SIGNED @ 9439df5).** The ACTIVE tab's
  xterm `fit()`s its container on dock EXPAND (fold → unfold) and on TAB ACTIVATION (switching to a tab fits
  its now-visible pane) — the impl is an `[expanded, activeId]` effect calling `fit()` — each fit forwarding
  the new dims to the pty through the EXISTING onResize path (`bridge.resize(sessionId, cols, rows)`), the
  same fit-and-forward wiring contract 3's drag-resize uses. Mount-time fit is NOT here: for a FRESH tab it
  is subsumed by contract 10's fit-before-spawn, and for an ADOPTED tab it belongs to contract 9's
  restore-then-fit — contract 11 covers neither.
- **Contract 13 `tdp-refits-on-container-resize` (BUILT+SIGNED @ eee0314) — container-size-change refit.** A
  `ResizeObserver` installed once per dock on the body-row wrapper refits the ACTIVE tab WITHOUT a drag or a
  tab-switch (a window/layout resize), forwarding the fitted dims to the pty via the existing onResize path
  (`bridge.resize(sessionId, cols, rows)`); it is feature-guarded where `ResizeObserver` is undefined and
  disconnected on unmount-cleanup. This closes the last piece of the fit lifecycle — contract 11 stays scoped
  to ONLY its expand + activation triggers, and this container-resize trigger is its own contract 13.

THE JSDOM-PROVABLE PART (all three built contracts): the mocked `FitAddon`/xterm records `fit()` (and the
resulting dims) on the covered events and the scripted bridge records the `resize`/`spawn` dims — assert the
fit fires and that the dims flow to `spawn`/`resize`; whether the glyphs then physically reflow is the
story's operator-attested UAT leg (ADR-0070), never a jsdom/visual assertion. (jsdom lays out no real
geometry, so the test drives the fit-triggering state — the fold/unfold and the active-tab switch — and
reads the fit's computed dims through the mock, exactly as it drives the drag fit; contract 13's
`ResizeObserver` refit drives its observer callback the same way via a `FakeResizeObserver` mock.)

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

## Contracts (13)

The test-proven leaf behaviours — each **one isolated automated test** in the `studio` suite (vitest
jsdom, `apps/studio/src/components/TerminalDock.test.tsx`), the xterm + bridge seams mocked/scripted.
Contracts 1–5 are BUILT (the original story build's signed verdict); contract 6 is the operator-found
refocus regression; contracts 7–8 are the terminal-repo-picker UX refinement (an optional `headerRight`
header slot + an honest empty-session message); contract 9 is the app-owned-session re-attach (ADR-0189)
whose replay is RE-TENSED under ADR-0190 (restore serialized screen state at recorded dims → write → fit →
forward) — BUILT+SIGNED @ 60280a0c; contract 10
(`tdp-fits-before-spawn-and-passes-initial-dims`) is the fit-before-spawn slice BUILT+SIGNED @ a90e30b
(adopted from the drive's real green test, id verbatim); contract 11
(`tdp-refits-on-expand-activation-and-resize`) is the refit-on-expand-and-activation slice BUILT+SIGNED @
9439df5 (its EXPAND + TAB-ACTIVATION triggers only); contract 13
(`tdp-refits-on-container-resize`) is the container-size-change / `ResizeObserver` refit slice BUILT+SIGNED
@ eee0314 (adopted from the drive's real green test, id verbatim); contract
12 (`tdp-ctrl-c-copies-selection-ctrl-v-pastes`) is the owner-reported Ctrl+C-copies-selection /
Ctrl+V-pastes keyboard wiring — UNBUILT and the NEXT drive. Per
ADR-0122 (`storytree coverage`), each contract id is the lead of a distinctly-named test (the
`it("<id>: …")` convention); contracts 1–11 and 13 are present and green, so the coverage check reports
12/13 until contract 12's new test lands (`tdp-ctrl-c-copies-selection-ctrl-v-pastes`). None is an APPEARANCE
assertion — the look is the story's operator-attested UAT leg 5 (ADR-0070).

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
9. **`tdp-reattaches-live-sessions-on-mount`** — mounting the dock re-attaches to still-live sessions, restoring serialized screen state at recorded dims then fitting, never spawning a duplicate — **BUILT+SIGNED @ 60280a0c (the re-tensed replay; a companion `tdp-restores-snapshot-at-recorded-size-then-fits` test rides the same source)**
   - **asserts —** with the bridge's `list()` scripted to resolve two live session ids and `snapshot(id)`
     scripted per id to `{ data, cols, rows }` (ADR-0190), MOUNTING the dock creates one tab per live
     session WITHOUT calling `spawn`; for each adopted tab the (mocked) xterm is RESIZED to the snapshot's
     `cols`/`rows`, then `data` is written, then the tab is `fit()`ted and `bridge.resize` is called with
     the fitted dims — the restore-then-fit order (ADR-0190), all BEFORE any post-mount live `onData`
     chunk for that session (a chunk emitted while the snapshot is in flight is held and written after
     it); post-mount input/data route to the re-attached session ids; expanding the dock during/after the
     restore never auto-spawns a duplicate tab. An older preload (a STRING `snapshot`, or `snapshot`/`list`
     ABSENT) is feature-guarded and never crashes; with `list()` resolving `[]` the dock is
     byte-behaviour-identical to before: first expand auto-spawns one fresh session (ADR-0189 app-owned
     sessions). Asserts the restore ORDER + the fit-and-forward, never the visual reflow (the story's UAT
     leg).
   - **Status —** BUILT+SIGNED @ 60280a0c: the shipped `TerminalDock.tsx` does the
     resize→write(`data`)→flush-held-chunks→fit replay, and the suite carries the re-tensed
     `tdp-reattaches-live-sessions-on-mount` assertions above plus a companion
     `tdp-restores-snapshot-at-recorded-size-then-fits` test. (History: this title was previously GREEN over
     the OLD raw-string replay `snapshot(...).then(text => term.write(text))` — a false-covered frame; the
     re-tense closed it.)
   - **covers —** `apps/studio/src/components/TerminalDock.tsx` (the mount-time restore + serialized-screen replay + fit path) *(provisional path)*

10. **`tdp-fits-before-spawn-and-passes-initial-dims`** — a fresh tab fits before spawning and passes the fitted cols/rows into bridge.spawn, so a new pty never starts at 80×24 under a wide dock — **BUILT+SIGNED @ a90e30b** (id adopted verbatim from the drive's real green test)
   - **asserts —** with the bridge present, opening a FRESH tab computes the fit (the mocked `FitAddon`
     yields `cols`/`rows`) BEFORE calling `spawn`, and passes those fitted dims into
     `desktopTerminal.spawn({ …, cols, rows })` (the ADR-0190 optional `spawn` dims), so the new pty starts
     at the real terminal size, never the 80×24 default under a wide dock — the defect this closes. Asserts
     the fit-then-spawn ORDER + the dims flowing into `spawn` only; whether glyphs physically reflow is the
     story's operator-attested UAT leg (ADR-0070), never a jsdom assertion. This is the mount-time fit for a
     FRESH tab; the standing refit lifecycle is contract 11 and the adopted-tab restore-then-fit is contract
     9 — this contract covers NEITHER.
   - **covers —** `apps/studio/src/components/TerminalDock.tsx` (the fit-before-spawn + fitted-spawn dims) — built @ a90e30b

11. **`tdp-refits-on-expand-activation-and-resize`** — the active tab's xterm refits on dock expand and tab activation, each forwarding the fitted dims to the pty via the existing onResize path — **BUILT+SIGNED @ 9439df5**
   - **asserts —** with the bridge present and a session active, the (mocked) xterm/`FitAddon` records a
     `fit()` on dock EXPAND (fold→unfold) and on TAB ACTIVATION (switching to a tab fits its now-visible
     pane) — the impl is an `[expanded, activeId]` effect calling `fit()` — each fit forwarding the new dims
     to `desktopTerminal.resize(sessionId, cols, rows)` via the existing onResize path (the same
     fit-and-forward wiring contract 3's drag-resize uses; the id's "-and-resize" nods to that shared path).
     MOUNT-time fit is NOT covered here: for a FRESH tab it is subsumed by contract 10
     (`tdp-fits-before-spawn-and-passes-initial-dims`) and for an ADOPTED tab it belongs to contract 9's
     restore-then-fit, so this contract covers neither. A container-size-change (`ResizeObserver`) refit is
     its own contract 13 (`tdp-refits-on-container-resize`, built @ eee0314), NOT covered by this contract.
     Asserts the `fit()` INVOCATION + the dims flowing to
     `resize` only; the visual reflow is the story's UAT leg (ADR-0070).
   - **covers —** `apps/studio/src/components/TerminalDock.tsx` (the expand + activation refit effect) — built @ 9439df5

12. **`tdp-ctrl-c-copies-selection-ctrl-v-pastes`** — Ctrl+C with a selection copies it to the clipboard instead of interrupting; Ctrl+C with no selection still reaches the pty; Ctrl+V pastes the clipboard — **the owner-reported keyboard-wiring defect, UNBUILT (the NEXT drive)**
   - **asserts —** the dock attaches an xterm custom key handler (`term.attachCustomKeyEventHandler`) on
     EVERY tab's Terminal (in `initTab`); INVOKING the captured handler with synthetic KeyboardEvent-shaped
     objects: (a) keydown Ctrl+C (ctrlKey, no shift/alt/meta) while `term.hasSelection()` is true writes
     `term.getSelection()` to the clipboard via `navigator.clipboard.writeText` and returns FALSE, and
     `desktopTerminal.write` is NOT called with '\x03' (the interrupt is suppressed — the copy path); (b)
     keydown Ctrl+C with NO selection returns TRUE (xterm's normal path forwards \x03 to the pty) and the
     clipboard is untouched (the interrupt behaviour preserved); (c) keydown Ctrl+V reads
     `navigator.clipboard.readText` and pastes it through the terminal via `term.paste(text)` (bracketed-paste
     honoured; the bytes flow to the pty via the existing onData→`bridge.write` wiring) and returns FALSE —
     assert `term.paste` called with the clipboard text; (d) a non-keydown event (keyup/keypress) or any
     other key returns TRUE (untouched); (e) `navigator.clipboard` ABSENT returns TRUE and never throws
     (jsdom/older-runtime feature-guard). Whether the OS clipboard then physically holds the text is the
     story's operator-attested UAT leg (ADR-0070), never asserted here — the jsdom test asserts only the
     handler return values, the clipboard `vi.fn` calls, and that no '\x03' reaches `desktopTerminal.write`.
   - **covers —** `apps/studio/src/components/TerminalDock.tsx` (the per-tab custom-key-handler: Ctrl+C-copies-selection / Ctrl+V-pastes wiring) *(provisional path)*

13. **`tdp-refits-on-container-resize`** — a `ResizeObserver` firing for the dock body refits the active terminal and forwards the new dims to the bridge, with no drag and no tab switch — **BUILT+SIGNED @ eee0314** (id adopted verbatim from the drive's real green test)
   - **asserts —** with the bridge present and a session active, a `ResizeObserver` is installed once per
     dock on the body-row wrapper; the observer firing (a bare container-size change — no drag, no
     tab-switch, e.g. a window/layout resize) recomputes the fit and refits the ACTIVE tab's xterm, forwarding
     the fitted dims to `desktopTerminal.resize(sessionId, cols, rows)` via the existing onResize path (the
     same fit-and-forward wiring contract 3's drag-resize and contract 11's expand/activation fit use). The
     observer is feature-guarded where `ResizeObserver` is undefined (never a throw in an older runtime) and
     is disconnected on unmount-cleanup. This closes the last piece of the fit lifecycle; it covers ONLY the
     container-size-change trigger — the expand + activation triggers are contract 11, the fit-before-spawn is
     contract 10, and the adopted-tab restore-then-fit is contract 9, so this contract covers none of those.
     Asserts the `fit()` INVOCATION + the dims flowing to `resize` only; the visual reflow is the story's
     operator-attested UAT leg (ADR-0070), never a jsdom assertion.
   - **covers —** `apps/studio/src/components/TerminalDock.tsx` (the once-per-dock ResizeObserver refit on the body-row) — built @ eee0314

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
- **Fit the terminal across its lifecycle, forward the dims — four non-overlapping contracts** (ADR-0190).
  A fresh tab fits BEFORE spawn and passes the fitted dims into `bridge.spawn`
  (`tdp-fits-before-spawn-and-passes-initial-dims`, built @ a90e30b). The standing refit on expand +
  tab-activation, each forwarding to `bridge.resize`, is `tdp-refits-on-expand-activation-and-resize`
  (built @ 9439df5). The adopted-tab restore path fits AFTER resizing to the snapshot dims and writing the
  serialized screen (`tdp-reattaches-live-sessions-on-mount`, built @ 60280a0c). The container-size-change
  (`ResizeObserver`) refit of the active tab, forwarding to `bridge.resize`, is
  `tdp-refits-on-container-resize` (built @ eee0314). Mount-time fit lives with the fresh-spawn OR the
  restore — never double-covered by a refit contract; each trigger is its OWN contract. Assert the
  invocation + dims, never the visual reflow.
- **Renderer terminal only (slow growth)** — render + wire the terminal over the bridge shape. Do NOT
  implement the pty lifecycle (that is `pty-session-manager`'s), do NOT compose the build command to
  inject (the ADR-0174 map-spawn re-point is a separate follow-on), do NOT reach cloud/web terminals
  (DEFERRED, ADR-0174), do NOT add signing/build/PR (the interactive surface, never the gate leaf).
