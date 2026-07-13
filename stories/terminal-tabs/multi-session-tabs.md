---
id: "multi-session-tabs"
tier: capability
story: terminal-tabs
title: "TerminalDock becomes multi-session with a VS Code-style session panel — N sessions, each its own xterm pane, created/switched/closed via panel rows, the single-session behaviours held per session, explicit per-row close the only renderer kill"
outcome: "The existing single-session `TerminalDock` becomes MULTI-SESSION with a VS Code-style session panel: it holds N pty sessions, each its OWN xterm `Terminal` pane + `sessionId` over the already-per-session `desktopTerminal` bridge; a session panel BESIDE the terminal pane (down the right side of the dock body) lists one ROW per session (a readable label, an ordinal at minimum, the active row marked), a per-row \"×\" disposes+reaps that session, and a \"+\" in the panel opens a fresh session — clicking a row activates that session's pane. The eight `terminal-dock-panel` behaviours (spawn, input↔pty, data-in, resize, visibility-toggle, refocus, absent-bridge degrade, empty-session message) hold PER SESSION — scoped to the active/first session — while the dock chrome (collapse/resize, the toggle, the `headerRight` slot) stays PER-DOCK, wrapping the panel + pane. The per-row \"×\" disposes exactly that session; dock unmount disposes RENDERER resources only — sessions are app-owned and survive it (ADR-0189, redefining the ADR-0186 never-orphan wall). The panel replaces the numbered tab-button strip (ADR-0190 §3); split panes are OUT of scope."
status: proposed
proof_mode: integration-test
depends_on: []
# Node-borne proof config (ADR-0057 keystone): authoring THIS block is what makes the capability
# inner-loop buildable — no NODE_BUILD_REGISTRY edit. EDIT-EXISTING (editsExisting): the multi-session
# substrate IS BUILT and signed (the original tab-strip drive; re-signed under the terminal-dock-panel
# ADR-0189 restore re-drive; the ADR-0189 unmount-reversal already signed on top).
#
# THE CURRENT RE-DRIVE (ADR-0190 §3 — the session-chrome remold, PRESENTATION only). The substrate at
# HEAD renders a NUMBERED tab-button strip between the dock header and the body (the ADR-0186 build; the
# ADR-0189 unmount reversal already signed on top — sessions are app-owned, unmount preserves them). The
# owner walked increment 1 and found the numbered strip rough; ADR-0190 adopts VS Code's terminal UX: a
# SESSION PANEL beside the terminal pane (down the RIGHT of the dock body) — one ROW per session (a
# readable label, ordinal at minimum), the active row visibly marked, a per-row "×" kill, and the "+"
# spawn control in the panel; clicking a row activates that session's pane. This REVERSES no behaviour —
# the six `mst-*` contracts all STAND with their EXACT ids (new-tab still spawns an independent session,
# switch still shows the selected pane, "×" still disposes exactly that session, I/O still scopes per
# session, unmount still preserves sessions); only their DOM HOOKS/SELECTORS re-tense from numbered
# `<button>`s in a strip to ROWS in the panel, and `mst-chrome-stays-per-dock` re-tenses "one strip
# between header and body" → "one panel per dock, beside the pane". Because the behaviour did not reverse,
# this is NOT an id rename (the `mst-disposes-all-sessions-on-unmount` → `mst-unmount-preserves-sessions`
# rename precedent applies ONLY when a behaviour reverses; inventing/renaming an id otherwise is the
# recurring 7×-observed defect). The leaf REWRITES each `mst-*` test's DOM queries (find/click a panel ROW
# + its "×", the panel "+") to the new markup while KEEPING each test's EXACT title, then EDITS
# TerminalDock.tsx to render the panel instead of the strip. The `tdp-*` (terminal-dock-panel) and `son-*`
# (seed-opens-new-tab) tests SHARE this file — the panel remold must keep ALL of them GREEN under their
# EXACT titles (the seed still opens a fresh session/row; the per-session tdp behaviours still hold on the
# active session). SPLIT PANES are OUT of scope (ADR-0190). The look (does the panel read as VS Code-style
# session tabs) is the story's operator-attested UAT leg (ADR-0159 / ADR-0070 two-stage) — machine-prove
# the panel geometry/behaviour here, never the look.
#
# FRONTEND-BUILDER TWO-STAGE (ADR-0070): this `real:` arm proves GEOMETRY/BEHAVIOUR ONLY over the SAME
# mocked xterm + mocked `desktopTerminal` bridge the suite uses — the look is the story's
# operator-attested UAT leg. The proof command is the studio VITEST suite, NOT node:test; the
# `real.proofCommand` runs the ONE test file under vitest (the node:test default cannot run a jsdom
# .test.tsx). `install: true` (fresh worktree, ADR-0031 §2). editsExisting + a single literal sourceFile
# === the one sourceGlob; the explicit vitest proofCommand is required regardless (runner mismatch).
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
    editsExisting: true
    scope:
      testGlobs: ["apps/studio/src/components/TerminalDock.test.tsx"]
      sourceGlobs: ["apps/studio/src/components/TerminalDock.tsx"]
    install: true
    typecheck:
      file: pnpm
      args: ["--filter", "studio", "typecheck"]
    # The studio suite is vitest (jsdom), not node:test — so the default `node --test` real proof cannot
    # run this `.test.tsx`. Run the ONE test file under vitest (`--filter studio exec` → cwd apps/studio).
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

# TerminalDock becomes multi-session with a VS Code-style session panel

**Outcome —** The existing single-session `TerminalDock` becomes **MULTI-SESSION with a VS Code-style
session panel**: it holds **N pty sessions**, each its OWN xterm `Terminal` pane + `sessionId` over the
already-per-session `desktopTerminal` bridge. A **session panel** — beside the terminal pane, down the
**right** of the dock body — lists one **row** per session (a readable label, the active row marked);
clicking a row **switches** the active pane, a **"+"** in the panel opens a fresh session, and a per-row
**"×"** disposes that session and reaps its row. The eight `terminal-dock-panel` behaviours (spawn,
input↔pty, data-in, resize, visibility-toggle, refocus, absent-bridge degrade, empty-session message) hold
**per session** — scoped to the active/first session — while the dock **chrome** (collapse/resize, the
toggle, the `headerRight` slot) stays **per-dock**, wrapping the panel + pane. **The per-row "×" disposes
exactly that session; dock unmount disposes RENDERER resources only** — sessions are app-owned and survive
it, re-attached on the next mount (ADR-0189, redefining the ADR-0186 dock-lifetime never-orphan wall;
explicit "×" and app-quit are the only kills). The panel replaces the numbered tab-button strip (ADR-0190
§3); split panes are OUT of scope.

**Depends on —** nothing (within `terminal-tabs`; the sole in-story root). The dock reaches the pty ONLY
through the `window.desktopTerminal` bridge, which is ALREADY per-session — `PtySessionManager`
(`apps/desktop/src/backend/pty-session-manager.ts`) tracks a `Map<sessionId, Session>` and mints a fresh id
per `spawn`, and the bridge (`apps/desktop/electron/preload.ts`) addresses `write`/`resize`/`dispose`/
`onData`/`onExit` by `sessionId` — so multi-session is a pure RENDERER lift over an unchanged backend. No
`apps/desktop` change; no `pty-session-manager` edit.

> **Proof status (honest) — EDIT-EXISTING, `proposed`; the presentation RE-TENSED to a session panel
> (ADR-0190 §3).** `TerminalDock.tsx` EXISTS and is green at HEAD — the multi-session substrate is BUILT
> and signed (the original tab-strip drive; the ADR-0189 unmount-preservation re-sign on top). This cap's
> current re-drive REMOLDS the PRESENTATION: the numbered tab-button strip is replaced by a VS Code-style
> SESSION PANEL beside the terminal pane (one row per session, active marked, per-row "×", a panel "+").
> The six `mst-*` behaviour contracts all STAND (no behaviour reverses — only their DOM hooks re-tense
> from strip buttons to panel rows; `mst-chrome-stays-per-dock` becomes "one panel per dock"). The
> panel's LOOK/feel (does it read as VS Code-style session tabs, the active row legible, "+"/"×" clear) is
> the story's operator-attested UAT leg (ADR-0159 / ADR-0070 two-stage); this cap pins the STRUCTURE +
> WIRING only. Split panes are OUT of scope (ADR-0190).

## Guidance

WHY THIS IS A CAPABILITY, NOT A CONTRACT: its honest proof is the MULTI-SESSION LIFECYCLE AS A WHOLE —
a behavioural React component that holds a table of sessions (each `{ sessionId, term, fit, pending }`),
renders a session panel that switches the active pane, spawns a fresh independent session on "+", disposes
exactly one session on a per-row "×" (reaping its row), scopes input/data/resize to the right session,
keeps the dock chrome per-dock, and on unmount disposes RENDERER resources only (the sessions survive,
app-owned — ADR-0189) — while the eight existing single-session behaviours hold per session. It spans the
session table AND the session panel AND the per-session I/O scoping AND the dispose/preserve lifecycle,
exercised over the two mocked seams — an integration test of the component's multi-session behaviour, not
one isolated assertion.

WHY IT IS A SEPARATE CAPABILITY FROM [`seed-opens-new-tab`](seed-opens-new-tab.md) (the splitting-rule,
ADR-0010): THIS proves the TAB SUBSTRATE — given user actions ("+", switch, "×", unmount), does the dock
create/switch/close/dispose independent sessions correctly, per tab? `seed-opens-new-tab` proves the SEED
SEMANTICS — given a `seed` prop, does the dock open a FRESH tab (never the active session) and pre-fill it?
Different trigger (user tab actions vs a `seed` prop), different observable (the tab lifecycle vs the
seed-to-fresh-tab route), different isolatable red. `seed-opens-new-tab` `depends_on` THIS (its "opens a
fresh tab" is meaningless without the tab substrate here), a real one-way precondition + shared-file
sequencing edge — but they are two distinct proofs, not one.

HOLD N SESSIONS IN A TABLE, NOT N REFS (the multi-session shape). Today the dock holds `sessionIdRef` /
`termRef` / `fitRef` / `pendingSeedRef` as single refs. Multi-session replaces them with a **session table**
— an ordered list of `{ sessionId, term, fit, pending }` records + an `activeId` — held in a ref (the live
values the bridge callbacks read) mirrored by state for the render. Each record OWNS its xterm `Terminal`
(a separate `term.open()` into that tab's mount div) and its `sessionId`. The bridge's `onData`/`onExit`
callbacks route a chunk to the record whose `sessionId` matches (the existing `sessionId === …` guard,
generalised to a table lookup) — so a chunk for tab A never writes tab B's pane (`mst-scopes-io-per-tab`).

THE SESSION PANEL SITS BESIDE THE PANE; THE CHROME STAYS PER-DOCK (ADR-0190 §3, the placement wall). The
dock header today is the toggle chevron `<button>` + the optional `headerRight` slot (a sibling of the
toggle, hosting the repo-gate gear, #705). ADR-0190 retires the numbered horizontal tab strip for a VS
Code-style SESSION PANEL rendered down the RIGHT of the dock BODY, beside the terminal pane — one ROW per
session (a readable label, an ordinal at minimum; the active row visibly marked), a per-row "×" to close
that session, and the "+" spawn control in the panel. Clicking a row activates that session's pane (the
pane area shows the active session's xterm; the others stay mounted-but-`hidden`, as before). The toggle +
`headerRight` slot still render **once per dock** (in the header, NOT repeated per row), and the
collapse/resize geometry wraps the WHOLE body (panel + pane) — the folded/expanded state, the
drag-to-resize, and the `maxHeight` clamp are dock-level, unchanged. Assert the chrome is per-dock (one
toggle, one `headerRight` container, ONE session panel) with N rows in the panel
(`mst-chrome-stays-per-dock`, re-tensed from "one strip between header and body" to "one panel per dock").

RE-PROVE THE tdp-* BEHAVIOURS PER SESSION — DON'T DELETE THEM (the honest re-prove, ADR-0057 §3). The
existing `terminal-dock-panel` contracts stay in `TerminalDock.test.tsx` and stay GREEN under the new
source, adapted to the multi-session model: the per-session ones (`tdp-spawns-on-open-and-writes-data`,
`tdp-forwards-input-to-bridge`, `tdp-resizes-with-the-dock`, `tdp-toggles-visibility-keeping-terminal-
mounted`, `tdp-refocuses-after-window-focus-cycle`, `tdp-shows-message-on-empty-session`, and the ADR-0190
re-attach/fit pair `tdp-reattaches-live-sessions-on-mount` / `tdp-fits-terminal-to-container`) exercise the
FIRST/ACTIVE session (the N=1 case); the per-dock ones (`tdp-renders-header-right-slot`,
`tdp-degrades-when-bridge-absent`) exercise the chrome that wraps the panel + pane. They are
`terminal-dock-panel`'s contracts (re-proven here), NOT this cap's — `storytree coverage
multi-session-tabs` counts only the six `mst-*` below; the tdp-* re-proof keeps that cap's crown honest
under the rewritten bytes (the orchestrator re-tenses `terminal-dock-panel.md` — a cross-story edit
flagged in the story's Open modeling calls).

DISPOSE ON "×"; PRESERVE ON UNMOUNT (the never-orphan wall, REDEFINED app-lifetime by ADR-0189). The
per-row "×" (in the session panel, ADR-0190) is the explicit kill: `bridge.dispose` for that row's
`sessionId` (and `fit.dispose()`/`term.dispose()` for its xterm). Dock UNMOUNT is NOT a kill any more —
sessions are APP-owned (they survive a route change and re-attach on the next mount, `terminal-dock-panel`'s
`tdp-reattaches-live-sessions-on-mount`): unmount disposes each session's RENDERER resources (xterm + fit)
and clears the session table (so a stale bridge callback never writes a disposed xterm), but calls NO
`bridge.dispose`. The pty-reap duty moved to the Electron main's app lifecycle (`disposeAllTerminals` on
window-close/app-quit — glue), so nothing is orphaned PAST THE APP; ADR-0186's original dock-lifetime
wall ("dispose all on unmount") is superseded by ADR-0189. Pin both halves: the per-row close dispose
(`mst-close-tab-disposes-its-session`) and the preserve-on-unmount (`mst-unmount-preserves-sessions`,
renamed from `mst-disposes-all-sessions-on-unmount` when the behaviour reversed).

THE DOCK STAYS A THIN CLIENT — NO AGENT, NO DRIVE, NO MODEL PATH (ADR-0004 / ADR-0108 d.1). Multiplying
xterm instances across tabs adds NO new seam — each pane is a `Terminal` over the SAME
`window.desktopTerminal` bridge. It imports no `@storytree/agent`/`@storytree/drive` and holds no model path
(`modelPathBoundary.test.ts` stays green). xterm.js is a third-party rendering library, not a model path.
(This is the interactive surface, never the prove-it-gate leaf — the dock composes no signing/build/PR;
ADR-0174 / ADR-0091.)

REUSE THE EXISTING SEAMS, THE EXISTING HARNESS. Author over the SAME mocked xterm + mocked `desktopTerminal`
bridge `TerminalDock.test.tsx` already installs (the `FakeTerminal` recording `write`/`onData`/`open`/
`resize`/`dispose`, and the scripted `window.desktopTerminal`). The `FakeTerminal.instances` array already
records EVERY instantiated terminal — perfect for asserting a SECOND tab spawns a second instance. The
bridge's `spawn` mock resolves `sess-1` today; to prove independent sessions, the leaf makes it resolve a
FRESH id per call (`sess-1`, `sess-2`, …) so `dispose`/`write` can be asserted against the right session.
Degrade honestly where the bridge is absent (the existing disabled state), unchanged and per-dock.

## Integration test

**Goal —** Prove that `<TerminalDock/>`, over a mocked xterm + mocked `desktopTerminal` bridge, holds N
independent sessions in a VS Code-style session panel: the panel "+" spawns a fresh session/row, clicking
a row shows the right pane (others mounted-but-hidden, sessions preserved), a per-row "×" disposes exactly
that row's session and reaps its row, input/data/resize are scoped per session, the chrome (toggle +
`headerRight`) stays per-dock, and unmount disposes renderer resources only (sessions preserved,
app-owned) — while the `terminal-dock-panel` behaviours hold on the active session. Entirely in jsdom:
xterm + the bridge are mocked, the async spawn resolved under the existing flush, no real
socket/pty/SDK/DB/Electron.

The test exercises this capability against its **real collaborator shape** — the two mocked seams already
in `TerminalDock.test.tsx` (the `FakeTerminal` + a scripted `window.desktopTerminal`, its `spawn` resolving
a fresh id per call). No stubs within the component's own composition (the session table, the session panel,
the per-session I/O routing, the dispose lifecycle are all real).

The test would:

1. Install the scripted `window.desktopTerminal` (spawn → a fresh `sess-N` per call) + `vi.mock` xterm (the
   existing harness). Render `<TerminalDock/>`, expand it → assert ONE session row in the panel, one
   session spawned, one xterm instance (the N=1 base, the tdp-* active-session behaviours holding).
2. **New session** — click the panel "+" → assert a SECOND `spawn`, a second `FakeTerminal` instance, two
   rows in the panel, the new session active (`mst-new-tab-spawns-independent-session`).
3. **Switch** — click session row 1 → assert row 1's pane is shown and row 2's is hidden (`hidden`, not
   unmounted — both `FakeTerminal` instances still present, undisposed; state preserved)
   (`mst-switch-shows-selected-tab-pane`).
4. **Per-session I/O** — drive the bridge `onData` for `sess-2` → assert ONLY session 2's `Terminal.write`
   received it; type into the active session → assert `bridge.write` was called with the ACTIVE session's
   id, not the other's (`mst-scopes-io-per-tab`).
5. **Close** — click row 2's "×" → assert `bridge.dispose('sess-2')` (and that instance's `dispose()`)
   fired, row 2 reaped from the panel, session 1 untouched (its session NOT disposed) and now active
   (`mst-close-tab-disposes-its-session`).
6. **Chrome per-dock** — assert exactly ONE toggle button and ONE `headerRight` container regardless of
   session count, the session panel a distinct element beside the pane (down the right of the dock body)
   (`mst-chrome-stays-per-dock`).
7. **Unmount** — unmount the dock with two sessions open → assert each xterm instance (and fit addon) was
   disposed and NO `bridge.dispose` fired for EITHER session id — the sessions live on, app-owned
   (`mst-unmount-preserves-sessions`, ADR-0189).

## Contracts (6)

The test-proven leaf behaviours — each **one isolated automated test** in the `studio` suite (vitest jsdom,
`apps/studio/src/components/TerminalDock.test.tsx`), the xterm + bridge seams mocked/scripted. Each is the
assertion a contract test proves against the multi-session dock (provisional path — re-cite at real
`file:line` when re-driven). Per ADR-0122, each contract id leads a distinctly-named test, so `storytree
coverage multi-session-tabs` reports 6/6. None is an APPEARANCE assertion — the session panel's look is the
story's operator-attested UAT leg (ADR-0159 / ADR-0070). (The `tdp-*` `terminal-dock-panel` behaviours are
re-proven per-session in the SAME file but remain that cap's contracts, not counted here.)

1. **`mst-new-tab-spawns-independent-session`** — the panel "+" opens a fresh, independent session/row
   - **asserts —** with the dock expanded (one session row), clicking the panel "+" calls `bridge.spawn`
     AGAIN (a second session id), instantiates a SECOND xterm `Terminal`, adds a second ROW to the session
     panel, and makes it active — two independent sessions, not a re-use of the first.
   - **covers —** `apps/studio/src/components/TerminalDock.tsx` (the session table + the panel "+" new-session path) *(provisional path)*
2. **`mst-switch-shows-selected-tab-pane`** — clicking a session row shows the selected pane, others hidden but mounted (sessions preserved)
   - **asserts —** with two sessions open, clicking a session row shows its pane and hides the other's
     (`hidden`, not a conditional unmount — both `FakeTerminal` instances remain, undisposed), so a switch
     never re-spawns or loses a session's scrollback.
   - **covers —** `apps/studio/src/components/TerminalDock.tsx` (the activeId switch + per-session pane visibility) *(provisional path)*
3. **`mst-close-tab-disposes-its-session`** — the per-row "×" disposes exactly that row's session and reaps its row
   - **asserts —** clicking a row's "×" calls `bridge.dispose(thatSessionId)` and that xterm instance's
     `dispose()`, removes the row from the session panel, and leaves the OTHER sessions untouched (not
     disposed); if the closed row was active, another becomes active. Exactly one session reaped per "×".
   - **covers —** `apps/studio/src/components/TerminalDock.tsx` (the "×" close+dispose+reap path) *(provisional path)*
4. **`mst-scopes-io-per-tab`** — bridge data, terminal input, and resize are scoped to the right session
   - **asserts —** a bridge `onData` chunk for session B is written to session B's `Terminal` only (never
     session A's); typing into the active session forwards to `bridge.write(activeSessionId, …)` (never
     another session's id); a resize forwards `bridge.resize(activeSessionId, …)` — the per-session I/O
     routing over the session table.
   - **covers —** `apps/studio/src/components/TerminalDock.tsx` (the per-session onData/input/resize routing) *(provisional path)*
5. **`mst-unmount-preserves-sessions`** — unmounting the dock disposes renderer resources only; the sessions survive, app-owned
   - **asserts —** with two (or more) sessions open, unmounting the dock disposes each xterm instance (and
     fit addon) and clears the session table, but calls `bridge.dispose` for NEITHER session id — the
     ptys stay alive for the next mount to re-attach (ADR-0189; the re-attach itself is
     `terminal-dock-panel`'s `tdp-reattaches-live-sessions-on-mount`). The explicit per-row "×"
     (`mst-close-tab-disposes-its-session`) and app-quit (glue) are the only kills. *(Renamed from
     `mst-disposes-all-sessions-on-unmount` when ADR-0189 reversed the unmount behaviour — the ADR-0186
     dock-lifetime wall, redefined app-lifetime.)*
   - **covers —** `apps/studio/src/components/TerminalDock.tsx` (the unmount cleanup over the session table) *(provisional path)*
6. **`mst-chrome-stays-per-dock`** — the toggle + headerRight slot render once per dock; the session panel sits beside the pane
   - **asserts —** regardless of session count, the dock renders exactly ONE toggle `<button>` and (when
     `headerRight` is provided) exactly ONE `headerRight` container — siblings of the session panel, never
     repeated per row; the session panel is a distinct element rendered beside the terminal pane (down the
     right of the dock body), and there is exactly ONE panel per dock. The collapse/resize chrome wraps the
     whole body — panel + pane — (dock-level height/clamp unchanged).
   - **covers —** `apps/studio/src/components/TerminalDock.tsx` (the per-dock chrome + the panel placement) *(provisional path)*

## Guidance — the net-new slice that earns the signed verdict

> **Historical + re-tensed (ADR-0190).** This section described the ORIGINAL edit-existing build that
> turned the single-session dock into the multi-session substrate. Under ADR-0190 the CURRENT re-drive is
> the PRESENTATION remold (the numbered tab strip → a VS Code-style session panel) governed by the
> frontmatter comment; the panel language below is the current target. Do NOT read "the single-session
> dock at HEAD" as the current red — at HEAD the dock is already multi-session, and the current red is the
> panel-selector rewrite of the six `mst-*` tests against the numbered strip.

The EDIT-EXISTING rung toward `healthy` (ADR-0057 §3, editsExisting): add the multi-session cases that fail
against the single-session dock at HEAD (the red), then rewrite the dock to a session table + session panel
(the green), keeping the `tdp-*` behaviours green per-session.

- **The edited test —** `apps/studio/src/components/TerminalDock.test.tsx`. Add the six `mst-…` cases over
  the EXISTING mocked xterm + bridge harness (the `spawn` mock resolving a fresh id per call so independent
  sessions are assertable). Name each test for its contract id so `storytree coverage multi-session-tabs`
  reports 6/6 (ADR-0122). Keep the `tdp-…` cases green, adapted to the active/first session.
  **COVERAGE `.tsx` trap (ADR-0122):** the coverage tool parses the test source as `ScriptKind.TS`, so a
  test whose assertions follow an INLINE JSX object prop (e.g. `<TerminalDock headerRight={<X/>}/>`) can read
  as uncovered — hoist any inline object/element prop to a `const` before the assertions
  (`const headerRight = <X/>; render(<TerminalDock headerRight={headerRight}/>)`), the shape the existing
  suite already uses for `seed`.
- **The RED the spine observes —** the new cases drive a multi-session panel — a "+" that spawns a SECOND
  session, a session switch, a per-row "×" — none of which exist on the single-session dock at HEAD (no
  "+", one session), so `mst-new-tab-spawns-independent-session` (and the others) fail — a real
  edit-existing red→green. (Under the ADR-0190 remold the current red is instead the panel-selector
  rewrite of the six `mst-*` tests against the numbered strip at HEAD — see the marker above.)
- **The GREEN —** rewrite `apps/studio/src/components/TerminalDock.tsx`: replace the single
  `sessionIdRef`/`termRef`/`fitRef`/`pendingSeedRef` with a **session table** (an ordered list of
  `{ sessionId, term, fit, pending }` + an `activeId`, in a ref mirrored by state); render a session panel
  beside the pane (down the right of the dock body) ("+" → spawn a fresh session + a row; per-row "×" →
  dispose + reap; click a row → set `activeId`); mount each session's xterm into its own pane, shown when
  active and `hidden` otherwise; route `onData`/`onExit` by a table lookup on `sessionId`; forward
  input/resize to the active session; on unmount dispose each xterm/fit and clear the table, never the
  sessions (ADR-0189). Keep the chrome (toggle, `headerRight`, collapse/resize) at the
  dock level. Keep the thin-client wall (`modelPathBoundary.test.ts`), the `tdp-*` contracts green
  (per active session / per dock), and `pnpm --filter studio typecheck` green. The session panel's LOOK is
  the story's operator-attested UAT leg — no visual assertion here. Split panes are OUT of scope (ADR-0190).

Rules:

- **Presentation is a session PANEL, not a numbered strip (ADR-0190 §3)** — remold the chrome to a VS
  Code-style panel beside the pane (rows down the right of the dock body, the active row marked, a per-row
  "×", the "+" in the panel, clicking a row activates its pane); the six `mst-*` behaviours STAND (no id
  reversal — only their DOM selectors re-tense), and the shared-file `tdp-*` + `son-*` tests must stay
  GREEN under the remold. SPLIT PANES are OUT of scope (ADR-0190).
- **Multi-session over the already-per-session bridge — RENDERER only** — the backend + `desktopTerminal`
  bridge are unchanged; do NOT edit `apps/desktop`. A session table in the renderer, one xterm per session.
- **"×" is the kill; unmount is not** (ADR-0189) — dispose the closed row's session on "×"
  (`mst-close-tab-disposes-its-session`); on unmount dispose renderer resources only, sessions preserved
  (`mst-unmount-preserves-sessions`); the app lifecycle (glue) reaps on window-close/app-quit.
- **Scope I/O per session** — a chunk / keystroke / resize reaches only the intended session
  (`mst-scopes-io-per-tab`); never cross sessions.
- **Chrome per-dock, session panel beside the pane** — one toggle + one `headerRight`, ONE panel with N
  rows (`mst-chrome-stays-per-dock`); the collapse/resize wraps the body (panel + pane).
- **Re-prove tdp-* per-session, don't delete them** — keep the `terminal-dock-panel` contracts green
  (active-session / per-dock); they remain that cap's contracts (the orchestrator re-tenses its spec).
- **Thin client, mock the seams, never assert the look** (ADR-0004 / ADR-0070) — prove the session
  lifecycle over the mocked xterm + bridge; the session panel's appearance is the story's UAT leg.
- **Multi-session substrate only (slow growth)** — create/switch/close/dispose/scope the sessions. Do NOT
  re-route the `seed` (that is [`seed-opens-new-tab`](seed-opens-new-tab.md)), do NOT touch the backend, and
  do NOT sign / build / open a PR (the interactive surface, never the prove-it-gate leaf).
