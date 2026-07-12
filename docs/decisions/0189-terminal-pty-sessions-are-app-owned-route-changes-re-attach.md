---
status: accepted
decided: 2026-07-12
amends: [174, 186]
load_bearing: true
arc: terminal-orchestrator-seat-arc
---
# ADR-0189: Terminal pty sessions are app-owned: route changes re-attach, only tab-close and app-quit kill

## Status

accepted (2026-07-12) — decided/directed by the owner in conversation on 2026-07-12 (the
`terminal-orchestrator-seat-arc` increment 1 direction). Design-time alignment IS the ratification
(ADR-0110); no second end-of-flow ask.

**Amends ADR-0174 and ADR-0186** — both bound pty lifetime to the DOCK's mount: ADR-0174's embedded
terminal disposed its session on dock unmount, and ADR-0186's "never orphan a pty" wall generalised that
to "dispose EVERY session on tab-close AND on dock unmount". This ADR moves session ownership from
dock-lifetime to APP-lifetime: unmount re-attaches later, it never kills. The never-orphan wall is
REDEFINED, not deleted — nothing outlives the APP (window-close / app-quit still reap every session);
what no longer kills is leaving the page. **Untouched:** ADR-0020 (the prove-it-gate) · ADR-0091 (the
spine is the sole verdict signer) · ADR-0004 (the terminal is the interactive surface only).

## Context

The embedded terminal (ADR-0174, multi-session per ADR-0186) exists to run the owner's **real,
interactive Claude Code session** — the resident session-orchestrator seat the
`terminal-orchestrator-seat-arc` charters. The ptys live in the Electron MAIN
(`apps/desktop/src/backend/pty-session-manager.ts`, driven by the `terminal:*` IPC in
`apps/desktop/electron/main.ts`); the renderer dock (`apps/studio/src/components/TerminalDock.tsx`)
reaches them only over the `desktopTerminal` bridge.

But the dock mounts inside `TreeView`, which renders only for the `#/tree` route — and the dock's
unmount cleanup disposes EVERY session (the ADR-0186 wall, `mst-disposes-all-sessions-on-unmount`).
So navigating to ANY other page — Overview, a doc view, Members — kills every terminal session,
including a live interactive Claude Code session mid-conversation. The app's observability surfaces and
its terminal seat are mutually exclusive: **using the map to watch a build means killing the session
that launched it**. Fold/unfold, tab switches, and resize already survive (panes stay mounted under
`hidden`); the route change is the one ordinary motion that destroys work.

The pty processes themselves never needed to die: they are main-process children, indifferent to the
renderer's route. What was missing was (a) anything holding their recent OUTPUT while no renderer is
attached, and (b) any way for a fresh dock mount to find them again.

## Decision

**Sessions are owned by the app, keyed to the selected repo — not by the dock's mount.**

1. **The main holds each session's scrollback.** `PtySessionManager` appends every routed chunk to a
   per-session ring buffer (byte-capped, generous — thousands of lines) and exposes
   `snapshot(sessionId)` plus `list()` (live sessions, id + spawn cwd). The manager stays lifecycle-only;
   it reports facts.
2. **The dock re-attaches on mount instead of spawning blind.** New optional bridge members
   `list()` / `snapshot(sessionId)` (IPC `terminal:list` / `terminal:snapshot`) let a mounting dock
   enumerate still-live sessions, adopt one tab per session, and replay each session's buffered
   scrollback into a fresh xterm before live output resumes. Only a restore that settles empty
   auto-spawns a fresh session (the existing first-expand behaviour).
3. **Unmount disposes renderer resources only.** Leaving the forest page disposes xterm/fit instances
   and clears the dock's session table — it calls NO `bridge.dispose`. The explicit per-tab "×" and
   window-close / app-quit (`disposeAllTerminals` in main) are the ONLY kills.
4. **Re-attach is scoped per repo.** `terminal:list` filters the manager's sessions to the currently
   selected repo's cwd (the policy lives in the Electron-main glue). A repo change keeps its existing
   deliberate behaviour — `TerminalRepoGate` remounts the dock (`key={cwd}`) — but under this ADR that
   remount no longer kills the old repo's sessions: they stay alive, invisible while another repo is
   selected, and re-attach when their repo is selected again. Only "×" / app-quit end them.
5. **The dock stays forest-page-only.** The lifecycle moves to the app; the dock's mount point does
   not. Lifting the dock above the router was considered and rejected for this increment: its geometry
   is coupled to the map frame (`.world-frame` offsetParent clamp), and the re-parent would force
   re-drives of byte-locked signed sources for a layout refactor with no behaviour of its own.
6. **The preload's data/exit relays become single-consumer.** One `ipcRenderer.on` registered at preload
   eval, whose callback each `onData(cb)`/`onExit(cb)` call REPLACES — a remounting dock swaps itself in;
   listeners never stack (without this, N route trips would write every chunk N times).

## Consequences

**Good.**
- The owner can navigate the whole app — map, docs, Members — while a resident Claude Code session runs
  in the dock, and return to it with scrollback intact: the arc's first outcome (survival across page
  navigation) lands.
- Sessions survive a renderer reload the same way (the webContents persists; the fresh preload/dock
  re-attaches) — recovery gets cheaper for free.
- The kill surface is now EXPLICIT (a "×" the user clicks, or quitting the app) — no implicit
  navigation-shaped kills.

**Bad / watch.**
- Sessions in a non-selected repo are alive but INVISIBLE until that repo is selected again — a user can
  forget them (they still die with the app). If this bites, a future increment can surface an
  all-repos session indicator; do not silently kill them instead.
- A session whose pty EXITS while no dock is attached simply vanishes (its buffer dies with it) — the
  next mount lists only live sessions. Honest, but a crashed resident session leaves no tombstone; the
  arc's later "cheap guided recovery" increment owns that.
- The scrollback ring is bounded: output beyond the cap is trimmed oldest-first; a re-attached xterm
  replays the tail, not infinite history.
- `mst-disposes-all-sessions-on-unmount` (multi-session-tabs) is renamed/reversed to
  `mst-unmount-preserves-sessions`; `terminal-dock-panel` gains `tdp-reattaches-live-sessions-on-mount`;
  `pty-session-manager` gains the ring/list contracts — all three signed caps re-drive `editsExisting`
  through the spine (ADR-0057 anchored-bytes re-sign), and the affected specs are re-tensed.

## References

- ADR-0174 (the embedded terminal; amended: dock-lifetime disposal) · ADR-0186 (multi-session tabs;
  amended: the never-orphan wall redefined app-lifetime) · ADR-0110 (born accepted).
- `terminal-orchestrator-seat-arc` (the charter this is increment 1 of) — the arc names survival across
  page navigation the first outcome to secure.
- Code: `apps/desktop/src/backend/pty-session-manager.ts` (ring buffer + snapshot/list) ·
  `apps/studio/src/components/TerminalDock.tsx` (mount-time re-attach, unmount preserves) ·
  `apps/desktop/electron/{main.ts,preload.ts}` (`terminal:list`/`terminal:snapshot` IPC, repo-scoped
  filter, single-consumer relays) · `apps/studio/src/components/TerminalRepoGate.tsx` (keyed remount,
  unchanged).
- Specs re-tensed: `stories/embedded-terminal/{pty-session-manager,terminal-dock-panel,story}.md` ·
  `stories/terminal-tabs/{multi-session-tabs,seed-opens-new-tab,story}.md`.
