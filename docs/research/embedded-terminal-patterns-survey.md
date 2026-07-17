# Embedded-terminal patterns survey — what the desktop dock still needs

*2026-07-17 · terminal-orchestrator-seat-arc · a three-subagent research pass (VS Code source
internals · Electron-terminal ecosystem · local change-map audit) triggered by the owner's
rendering-artifact report that landed the WebGL renderer (#752). This is the durable synthesis; the
arc's increment log tracks what has landed against it.*

## Where we stand

The dock already implements the hard parts of the mature pattern: main-process pty ownership
(node-pty reached only in the Electron main), per-session headless screen models
(`@xterm/headless` + `@xterm/addon-serialize` — VS Code's own pty-host persistence design,
ADR-0190), app-owned sessions with re-attach (ADR-0189), fit-addon lifecycle incl. fit-before-spawn
and a ResizeObserver, a WebGL renderer with context-loss fallback (#752), and hand-rolled
Ctrl+C-copy / Ctrl+V-paste. What's missing is the second ring every serious embedder converged on.

**Version topology (load-bearing):** the renderer runs `@xterm/xterm ^5.5.0` (addons: fit 0.10,
webgl 0.18) while the main runs `@xterm/headless ^6.0.0` (addon-serialize 0.14). The addon lines
split by core major: 5.x-peer addons are fit 0.10 / webgl 0.18 / **unicode11 0.8** / web-links 0.11
/ search 0.15 / clipboard 0.1 / serialize 0.13; the 0.x+1 releases are the 6.0-era line (they no
longer declare peerDependencies, so npm will NOT warn on a mismatch — pin deliberately).

## The gap list (verified, prioritized as arc increments)

### Increment A — rendering correctness under the real workload

1. **Unicode 11 width tables, BOTH cores.** xterm defaults to Unicode 6 widths; VS Code defaults
   the setting to `'11'` and lazy-loads `@xterm/addon-unicode11`, then
   `term.unicode.activeVersion = '11'`. Wrong widths on emoji/spinner/box glyphs (Claude Code's
   staple output) draw the next glyph into an overlapping cell — a co-culprit of the
   owner-reported edge artifacts. **Parity is the point:** load it on the renderer terminal
   (`TerminalDock.tsx` `initTab`, addon 0.8.0) *and* the headless snapshot terminal
   (`pty-session-manager.ts` `create`, addon 0.9.0, using the default-import-then-destructure UMD
   form documented at the top of that file) — one-sided width tables make re-attach replays
   re-wrap differently than live rendering.
2. **Scrollback alignment.** Renderer terminal is constructed with defaults → 1,000 lines; the
   main's headless model keeps 5,000 (`DEFAULT_SCROLLBACK_LINES`, `pty-session-manager.ts`). A
   re-attach can replay more than the renderer can hold. Pass `scrollback: 5000` in the renderer
   constructor (duplicated literal with a pointer comment — the thin-client boundary forbids
   importing the desktop constant). Have the test's `FakeTerminal` capture constructor options;
   that seam also pins items 3–4.
3. **`windowsPty` on the renderer terminal.** The single most important xterm option we don't set
   on Windows: `windowsPty: { backend: 'conpty', buildNumber }` activates ConPTY-specific
   heuristics — without it, a row-increase resize can *lose data* (ConPTY emits empty rows instead
   of restoring scrollback), and reflow stays enabled where it shouldn't be (it should only run on
   conpty ≥ build 21376). The renderer needs the OS build number from the main: extend the spawn
   result or add an optional bridge method (feature-guarded like `list?`/`snapshot?`).
4. **Claude-Code-aware spawn env.** Claude Code's own anti-flicker (DEC 2026 synchronized output)
   shipped in xterm **6.0** — our 5.5 renderer ignores BSU/ESU, so Claude's batching is inert in
   the dock and every intermediate repaint renders. Until the xterm-6 upgrade (increment E), spawn
   ptys with `CLAUDE_CODE_NO_FLICKER=1` (alt-screen atomic updates; shipped in Claude Code 2.1.88)
   and consider `CLAUDE_CODE_DISABLE_MOUSE=1`. Also ensure the ConPTY session is UTF-8 (the
   Windows mojibake class, anthropics/claude-code#34247).

### Increment B — throughput: batching + flow control

Today the main relays **one IPC message per pty chunk** (`main.ts` `terminal:spawn` data sink) with
zero backpressure; xterm's write buffer is unbounded until its 50 MB OOM guard. A `pnpm gate` in
the dock is exactly the fast-producer case. The proven combination (VS Code source, verified):

- **Batching:** `TerminalDataBufferer` pattern — coalesce chunks per session in a **5 ms** window,
  flush as one joined string. (Hyper measured batching alone lifting a `find ~` from ~3 FPS to
  12–16; batching + WebGL cut wall time ~36s → ~15s.)
- **Flow control:** ack-based watermarks — renderer acks consumed chars from xterm's
  `write(data, callback)` (fires on parse-complete, the correct backpressure signal); main pauses
  the pty (`proc.pause()`) past **100,000** unacked chars, resumes (`proc.resume()`) below
  **5,000**; acks batched in **5,000-char** grains (`FlowControlConstants`). Out-of-band
  pause/resume, not node-pty's in-band experimental `handleFlowControl`. Include VS Code's
  `clearUnacknowledgedChars`-style reset on re-attach so a dropped renderer can't wedge the pty.
- Ordering must be preserved through the `heldChunks` snapshot-replay path and the
  `[process exited]` write; the e2e's `snapshot()` observable is immune to batching unless chunks
  drop.
- Wire shape: batching alone can keep `(sid, chunk)` byte-identical (join before send); the ack
  adds one renderer→main channel (preload + `DesktopTerminalBridge`, optional/feature-guarded).

### Increment C — ConPTY-aware resize

ConPTY reprints the screen on resize and xterm upstream **closed the clean-scrollback-resize issue
as out-of-scope** (xterm.js#3513; the 6.0 reflow alignment PR #5321 was reverted) — mangled
scrollback on aggressive resize is structural; the job is minimizing it:

- **Debounce the pty-side resize** (Tabby: 100 ms audit; VS Code adds a 1000 ms `DelayedResizer`
  for early-resize cases). Keep xterm-side `fit()` live so the pane feels responsive; coalesce
  only the `bridge.resize` forward in the `term.onResize` wiring. **Do not debounce the ADR-0190
  re-attach sequence** — it depends on the synchronous resize forward.
- **node-pty `clear()`** when the frontend clears (documented ConPTY state-sync; verify our
  `node-pty ^1.0.0` exposes it — recent 1.1.0-betas are the recommended line, winpty is removed).
- Add `clear()`/`pause()`/`resume()` to the `PtyHandle` interface → the real port in `main.ts`
  AND the test's `FakePtyHandle` must both implement them.
- Optional escape hatch: `useConptyDll: true` (bundled Windows-Terminal conpty.dll) — VS Code
  ships it behind a setting for OS-ConPTY hangs; still experimental, hold as a one-liner, not a
  default.

### Increment D — UX table stakes (independent, renderer-mostly)

5. **Clickable links** — `@xterm/addon-web-links` (0.11.0) with the handler routed to a new
   feature-guarded bridge method → `shell.openExternal` in main **behind an http/https scheme
   allowlist**. This is a real security boundary: electerm shipped a CVE-class advisory
   (GHSA-fwf6-j56g-m97c) for unvalidated `openExternal` from terminal output. Never `window.open`.
6. **Tab titles** — `term.onTitleChange` (OSC 0/2) → panel row labels, debounced. Keep the
   `tab N` aria-labels and `.terminal-dock-panel-row` class stable: the whole renderer suite and
   the e2e select by them; put the dynamic title in visible text only (e.g. "1: claude").
7. **Find-in-scrollback** — `@xterm/addon-search` (0.15.0), per-tab instance stored on the
   `TabRecord` like `fit`, driven for the active tab; chrome must not collide with the
   `headerRight` slot contract (no container when unused).
8. **Clipboard completeness** — `@xterm/addon-clipboard` (0.1.0) for OSC 52 **write-only** (read
   is a paste-exfiltration vector — leave it disabled), plus Windows-convention right-click
   copyPaste on the pane (`contextMenu` → selection? copy : paste via the existing `term.paste`
   path, `preventDefault` the browser menu). Complements, not replaces, the signed Ctrl+C/V
   contract.

### Increment E — the xterm 6 upgrade (owner decision)

Upgrading the renderer to `@xterm/xterm 6.x` buys native **DEC 2026 synchronized output** (Claude
Code's flicker fix working as designed, no alt-screen trade-off), unifies the split majors with the
headless side, and moves every addon to its current line. It's a dependency major with rendering
surface — its own increment, after A–D bed in, with the owner attesting the result.

## Deliberately not adopted (for the record)

- **Shell integration (OSC 133/633)** — VS Code's command tracking/navigation. Claude Code emits
  none of it (feature requests closed), so it would only serve plain build shells; revisit if the
  dock grows command-block UX. Minimal PowerShell-side adoption is documented (Windows Terminal
  devblog) if wanted later.
- **`@xterm/addon-unicode-graphemes`** — least-hardened addon, fresh regressions upstream; stay on
  unicode11 until the 6.x era stabilizes it.
- **Copy-on-select / bell UX** — cheap, but preference-grade; owner call when wanted
  (`onBell` → tab badge is the modern pattern, no audio).
- **VS Code's 100-line revive cap** — VS Code serializes only ~100 lines on revive for startup
  speed; our 5,000-line ring is deliberate (the dock IS the session record) — keep ours.

## Verified constants (VS Code source, fetched 2026-07-17)

| Constant | Value | Where |
|---|---|---|
| Flow-control high watermark | 100,000 unacked chars → `pause()` | `terminalProcess.ts` |
| Flow-control low watermark | 5,000 → `resume()` | `terminalProcess.ts` |
| Ack grain | 5,000 chars, from `write()` parse callback | `terminalInstance.ts` / `AckDataBufferer` |
| Data buffer flush | 5 ms, join to one message | `terminalDataBuffering.ts` |
| ConPTY delayed resize | 1000 ms re-fire | `terminalProcess.ts` `DelayedResizer` |
| ConPTY kill→spawn spacing | ~250 ms | `terminalProcess.ts` |
| Unicode version default | `'11'` via addon | `terminalConfiguration.ts` |
| GPU chain | webgl → dom (canvas retired); `clearTextureAtlas()` on OS resume | `xtermTerminal.ts` |
| windowsPty reflow gate | conpty && buildNumber ≥ 21376 | xterm `xterm.d.ts` |

## Sources

VS Code source (terminal.ts, terminalDataBuffering.ts, terminalProcess.ts,
terminalProcessManager.ts, terminalInstance.ts, xtermTerminal.ts, ptyService.ts,
terminalConfiguration.ts) · xterm.js typings + flow-control guide (xtermjs.org/docs/guides/flowcontrol)
· xterm.js #3513 / #5321 / #5453 (resize + DEC 2026) · node-pty typings + #842 (winpty removal) ·
Hyper PR vercel/hyper#3336 (batching numbers) · Tabby baseTerminalTab.component.ts (write-lock,
100 ms resize audit) · anthropics/claude-code #1913 / #18084 / #51828 / #34247 +
code.claude.com/docs/en/terminal-config (`CLAUDE_CODE_NO_FLICKER`, 2.1.88) · electerm advisory
GHSA-fwf6-j56g-m97c (openExternal) · npm registry addon peer-dependency matrix (2026-07-17).
