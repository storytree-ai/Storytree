---
status: accepted
decided: 2026-07-13
amends: [186, 189]
arc: terminal-orchestrator-seat-arc
---
# ADR-0190: Terminal re-attach replays serialized screen state and the session chrome follows VS Code

## Status

accepted (2026-07-13) — decided/directed by the owner in conversation on 2026-07-13, walking the
increment-1 build (ADR-0070 survival-UX attestation: "works sort of — only when I go back the terminal
is all jumbled… can't we grab what VS Code does with terminals?"). Design-time alignment IS the
ratification (ADR-0110); no second end-of-flow ask.

**Amends ADR-0189** — its replay mechanism, not its ownership model. App-owned sessions, re-attach on
mount, and the explicit-kill surface all stand; what changes is WHAT re-attach replays: ADR-0189's
"bounded scrollback ring, replay the tail" is retired in favour of serialized screen state (§Decision 1).
**Amends ADR-0186** — its numbered tab-strip presentation. The multi-session tabs model (one pty per
tab, seed opens a new tab) stands; the strip's presentation is remolded into a VS Code-style session
panel (§Decision 3).

## Context

Increment 1 (ADR-0189, PR #714) made pty sessions app-owned: navigating off the forest page no longer
kills them, and the dock re-attaches on return. The owner walked it and did NOT sign: the session
survives, but the re-attached scrollback renders **jumbled**, and the numbered tab buttons look rough.

The jumble is structural, not cosmetic. The inc-1 replay stores the session's RAW output bytes in a
byte-bounded ring and writes the tail into a fresh xterm on re-attach. A TUI app (Claude Code's ink UI —
the resident tenant this arc exists for) paints by continuous cursor-relative redraws: carriage returns,
cursor-up, erase-line, all relative to the screen state at emit time. Replaying that history into a
fresh terminal — different size (the dock's xterm mounts at the 80×24 default; `fit()` only runs on a
manual drag today), no prior screen rows, and a ring trim that can cut mid-escape-sequence — reconstructs
interleaved fragments, not the screen. Replaying more history cannot fix this; replaying the *state* can.

VS Code solved exactly this, in the open, with components we already ship: xterm.js and node-pty are
both maintained by the VS Code team. Their pty host feeds every output byte through a **headless xterm**
(`@xterm/headless`) so the host always holds the parsed screen state, and reconnection replays a
**serialization of that state** (`@xterm/addon-serialize`) — a compact ANSI string that reconstructs
content, colors, cursor, and scrollback exactly, at known dimensions. Their session chrome (the tabs
list beside the terminal, per-row kill/actions, a "+" spawn) is likewise a worked-out design we can
adopt; their workbench code itself is not liftable wholesale, but the pattern is the reference.

## Decision

1. **The Electron main holds each session's parsed screen state, and `snapshot` returns its
   serialization.** `PtySessionManager` runs a headless xterm per session (`@xterm/headless`,
   `allowProposedApi`), writes every pty chunk through it, resizes it with the pty, and serves
   `snapshot(sessionId)` from `@xterm/addon-serialize` — `{ data, cols, rows }`, flushed so it reflects
   every chunk received before the call. The raw-byte ring and its byte cap are retired; the headless
   terminal's line-bounded scrollback is the retention bound. The manager stays headlessly provable
   (the port seam is untouched; the headless terminal is pure JS under node:test).
2. **Re-attach restores at recorded dims, then lets the live app repaint into the real ones.** The dock
   sizes the fresh xterm to the snapshot's `cols`/`rows`, writes the serialization, then fits to the
   container and forwards the fitted dims to the pty — the resident TUI receives a real resize and
   repaints itself into the new geometry. The dock also gains the missing fit lifecycle: fit on mount,
   on expand, on tab activation, and on container resize (today only the drag handle ever fits, which is
   why a fresh tab runs 80×24 under a wide dock).
3. **The session chrome follows VS Code's terminal UX.** The numbered button strip is replaced by a
   VS Code-style session panel beside the terminal pane: one row per session (label + status), the
   active row highlighted, kill on the row, "+" to spawn. Appearance lands two-stage (ADR-0159):
   geometry/behaviour machine-proven, the look operator-attested. **Splits are OUT of scope** for this
   increment — the panel is the owner's named want; split panes are a later owner call.

## Consequences

**Good.**
- Re-attach reads as "my session, still there" — the screen comes back exactly as it looked, then the
  live app repaints at the current size; no replayed-history artifacts, no mid-sequence cuts.
- The main-held headless terminal is VS Code's own production pattern for this problem — parsing cost
  sits in the pty host exactly once per byte, and the serialization is bounded by the terminal's
  scrollback, not an unstructured byte cap.
- The chrome inherits a design the owner already trusts from daily VS Code use.

**Bad / watch.**
- `@xterm/headless` + `@xterm/addon-serialize` become desktop-main dependencies (pure JS — esbuild
  bundles them; no native rebuild surface).
- Serialization is state, not history: scrollback beyond the headless terminal's line bound is gone by
  design (same trade VS Code makes). The bound is a line count now, not bytes.
- A resize while detached (none possible today — only the dock resizes ptys) would stale the recorded
  dims; the restore-then-fit handshake covers it because the live app repaints after the final resize.
- The signed caps this touches (`pty-session-manager`, `terminal-dock-panel`, `multi-session-tabs`)
  re-drive through the spine per ADR-0057 — never hand-edits.

## References

- ADR-0189 (app-owned sessions — the ownership model this keeps, the ring replay this retires) ·
  ADR-0186 (multi-session tabs — the model this keeps, the strip this remolds) · ADR-0159 (two-stage
  frontend proof) · ADR-0070 (operator-attested legs) · ADR-0110 (born accepted).
- VS Code's terminal persistence: `src/vs/platform/terminal/node/ptyService.ts` (headless xterm +
  serialize on process reconnection) — MIT, the reference implementation; `@xterm/headless`,
  `@xterm/addon-serialize` (npm, xterm.js team).
- `terminal-orchestrator-seat-arc` increment log 2026-07-13 (#714): the walk verdict this answers.
- Code: `apps/desktop/src/backend/pty-session-manager.ts` · `apps/studio/src/components/TerminalDock.tsx`
  · `apps/desktop/electron/{main.ts,preload.ts}` (snapshot passthrough glue).
