---
status: accepted
decided: 2026-07-11
amends: [174]
load_bearing: true
---
# ADR-0186: The embedded terminal is multi-session with tabs; a map Build seed opens a fresh tab, never the active session

## Status

accepted (2026-07-11) — decided/directed by the owner in a design conversation on 2026-07-11. Design-time
alignment IS the ratification (ADR-0110); no second end-of-flow ask.

**Amends ADR-0174** — its map-spawn clause offered TWO delivery options ("injects it into the embedded
terminal **(or opens a seeded terminal tab pre-filled with it)**"). The `map-terminal-build` build (PR #696)
shipped the FIRST; this ADR chooses the SECOND and makes the terminal multi-session to support it.
**Untouched:** ADR-0020 (the prove-it-gate) · ADR-0091 (the spine is the sole verdict signer) · ADR-0004
(the terminal is the interactive surface only) — this changes only the interactive terminal, never the
proof runtime.

## Context

ADR-0174 embedded a **single-session** local terminal (`stories/embedded-terminal`, PR #690) whose whole
premise is that it runs the user's **real, interactive Claude Code** — their build surface. Its map-spawn
clause then offered two ways to deliver a Build command: inject it into that terminal, or open a *seeded
tab* pre-filled with it. The `map-terminal-build` follow-on (PR #696) shipped the first: a forest-map Build
click writes the composed `pnpm storytree … build <id> --real --store pg` into the dock's **single** pty
session via `bridge.write(sessionId, command)`.

The owner surfaced the flaw (2026-07-11): if that single session is **already running an interactive Claude
Code session** — the *expected* state when you'd want to kick off a build — the write injects the command
into Claude Code's own stdin. It lands in Claude's input box mid-conversation (corrupting whatever the user
was composing) and is semantically wrong: pressing Enter sends it as a *message to Claude*, not a shell
command. The disruptive case is the main intended case, not an edge.

The backend already supports many sessions: `PtySessionManager` (`apps/desktop/src/backend`) tracks a
`Map<sessionId, Session>` and mints a fresh id per `spawn`, and the `desktopTerminal` bridge already
addresses `write`/`resize`/`dispose`/`onData`/`onExit` by `sessionId`. The single-session limit is purely
in the **renderer** — `TerminalDock` holds one `sessionIdRef` / one xterm instance.

## Decision

**The embedded terminal becomes multi-session with a tab strip.** The dock holds N pty sessions, each its
own xterm pane; a tab bar switches between them, opens a new session ("+"), and closes/reaps one. The
existing single-session behaviours (spawn, input↔pty, data-in, resize, absent-bridge degrade) hold
**per tab**. The dock's collapse/resize chrome (ADR-0174) wraps the tab set.

**A forest-map Build seed opens a FRESH tab, never the active session.** A seed (`map-terminal-build` →
this) SPAWNS a new pty session, switches to its tab, and pre-fills the composed command there (still
pre-fill, **never auto-run** — ADR-0174). The user's interactive Claude Code session, in its own tab, is
never touched. This chooses ADR-0174's *second* map-spawn option and **re-points `map-terminal-build`'s
`terminal-dock-seed`** behaviour (seed the active session → open a fresh tab).

**Scope — local terminal only.** Cloud/web terminals stay deferred (ADR-0174). The prove-it-gate leaf
(`sdk-author.ts`) and the spine are untouched — this is the interactive surface.

## Consequences

**Good.**
- A Build click can never corrupt a live Claude Code session — the seed lands in its own fresh shell.
- The terminal gains general multi-session utility: run a seeded build in one tab while Claude Code works
  in another, exactly as any terminal-with-tabs does.
- Delivers what ADR-0174 already sanctioned (the seeded-tab option), so no new outward-facing surface.

**Bad / watch.**
- Multi-session/tab management is real renderer surface: per-tab xterm lifecycle, switch/close, and
  reaping every session on close / app-quit (never orphan a pty). This is the build follow-on.
- It **re-decides** `map-terminal-build`'s `terminal-dock-seed` behaviour (write-to-active → open-a-tab),
  so that cap's verdict is re-proven under the new behaviour, and `TerminalDock.tsx` (the signed
  `terminal-dock-panel` source, embedded-terminal) is substantially edited → re-prove/adopt as the gate
  requires.
- The tab strip's look/feel is operator-attested (ADR-0070 two-stage); the geometry/behaviour is
  machine-proven.

## References

- ADR-0174 — the embedded terminal + the map-spawn clause offering both delivery options (amended: the
  seeded-tab option is chosen and the terminal made multi-session to support it).
- ADR-0110 — design-time alignment is ratification (this ADR is born accepted).
- `stories/map-terminal-build` (PR #696) — the first-option build being re-pointed (its `terminal-dock-seed`
  cap re-decided here). · `stories/embedded-terminal` (PR #690) — the single-session terminal being made
  multi-session.
- ADR-0070 (two-stage frontend proof) · ADR-0158 (glue) · ADR-0004 (the terminal is the interactive
  surface; the prove-it-gate leaf is untouched).
- Code: `apps/studio/src/components/TerminalDock.tsx` (single-session → multi-session + tabs) ·
  `apps/desktop/src/backend/pty-session-manager.ts` (already multi-session) ·
  `apps/desktop/electron/{main.ts,preload.ts}` (the `terminal:*` IPC + `desktopTerminal` bridge, already
  per-session).
