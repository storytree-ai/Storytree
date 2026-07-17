import { contextBridge, ipcRenderer } from "electron";
import type { CredentialKind } from "../src/credential/kinds.js";

// The ONLY bridge the renderer (the compiled studio UI) is given. It can ask whether a
// credential is held, hand one in to be stored in the keychain, and sign out — but it can
// NEVER read the raw token back: `status` returns a boolean only. The credential stays in
// the main process / OS keychain, the safety boundary of ADR-0109 §Decision 4.
contextBridge.exposeInMainWorld("desktopAuth", {
  status: (kind: CredentialKind): Promise<boolean> => ipcRenderer.invoke("auth:status", kind),
  store: (kind: CredentialKind, token: string): Promise<void> => ipcRenderer.invoke("auth:store", kind, token),
  signOut: (kind: CredentialKind): Promise<boolean> => ipcRenderer.invoke("auth:sign-out", kind),
});

// The apply-a-landed-fix bridge (ADR-0164 Phase 1). The renderer asks the MAIN process (Rail 1 — the
// supervisor) to rebuild the studio + electron bundles and relaunch onto them. Its mere PRESENCE
// (`window.desktopApply`) is how the shared StoreBanner feature-detects the desktop app and shows the
// "Rebuild & relaunch" button — the hosted studio has no such bridge, so it keeps the plain manual
// instructions. Resolves with the rebuild result: `{ ok: true }` (the app is relaunching) or a typed
// failure the banner surfaces (the app stayed on the old build — fail-closed).
contextBridge.exposeInMainWorld("desktopApply", {
  rebuildAndRelaunch: (): Promise<RebuildRelaunchResult> => ipcRenderer.invoke("apply:rebuild-relaunch"),
});

/** The result shape the renderer sees — mirrors electron/../src/apply/rebuild.ts's `RebuildResult`. */
type RebuildRelaunchResult =
  | { ok: true }
  | { ok: false; step: string; code: number; output: string };

// The embedded-terminal bridge (ADR-0174). Its mere PRESENCE (`window.desktopTerminal`) is how the
// renderer's TerminalDock feature-detects the desktop app (the hosted/dev studio — a plain browser —
// has no such bridge, so the dock renders its honest "unavailable" state). It mirrors the
// `DesktopTerminalBridge` the TerminalDock declares EXACTLY: `spawn` starts a pty session (main drives
// `pty-session-manager.create`), `write`/`resize`/`dispose` forward to the manager, and `onData`/`onExit`
// subscribe to the `webContents.send` stream the main relays. The raw pty lives in main only.
//
// SINGLE-CONSUMER RELAYS (ADR-0189): sessions are app-owned — the dock unmounts on a route change and a
// FRESH dock re-attaches later, so `onData`/`onExit` must not stack one `ipcRenderer.on` listener per
// mount (N route trips would write every chunk N times). ONE ipc listener per channel is registered here
// at preload eval, and each `onData(cb)`/`onExit(cb)` call REPLACES the callback it fans out to — the
// remounting dock swaps itself in; the unmounted dock's stale callback is simply dropped.
// The Windows OS build number (e.g. 26100 from "10.0.26100") — the renderer's xterm needs it for
// ConPTY-specific heuristics (`windowsPty`: without them a row-increase resize can LOSE data, and
// reflow runs on conpty builds where it must not, < 21376). Computed here SYNCHRONOUSLY (Electron's
// process API is available in the preload) so it exists before the renderer constructs its first
// Terminal — an async main round-trip would race the dock's initTab. win32-only: the member's very
// PRESENCE is the renderer's platform signal (feature-guarded like `list`/`snapshot`), so it is
// omitted entirely on any other OS or when the build can't be parsed.
const windowsBuildNumber: number | undefined = (() => {
  if (process.platform !== "win32") return undefined;
  const build = Number(process.getSystemVersion().split(".")[2]);
  return Number.isFinite(build) && build > 0 ? build : undefined;
})();

let terminalDataCb: ((sessionId: string, chunk: string) => void) | null = null;
let terminalExitCb: ((sessionId: string, e: { exitCode: number }) => void) | null = null;
ipcRenderer.on("terminal:data", (_e, sessionId: string, chunk: string) => {
  terminalDataCb?.(sessionId, chunk);
});
ipcRenderer.on("terminal:exit", (_e, sessionId: string, exit: { exitCode: number }) => {
  terminalExitCb?.(sessionId, exit);
});
contextBridge.exposeInMainWorld("desktopTerminal", {
  spawn: (opts?: unknown): Promise<{ sessionId: string }> => ipcRenderer.invoke("terminal:spawn", opts),
  write: (sessionId: string, data: string): void => {
    ipcRenderer.send("terminal:write", sessionId, data);
  },
  resize: (sessionId: string, cols: number, rows: number): void => {
    ipcRenderer.send("terminal:resize", sessionId, cols, rows);
  },
  dispose: (sessionId: string): void => {
    ipcRenderer.send("terminal:dispose", sessionId);
  },
  onData: (cb: (sessionId: string, chunk: string) => void): void => {
    terminalDataCb = cb;
  },
  onExit: (cb: (sessionId: string, e: { exitCode: number }) => void): void => {
    terminalExitCb = cb;
  },
  // The ADR-0189 re-attach slice: enumerate the still-live sessions (main scopes them to the currently
  // selected repo) and fetch a session's main-held screen state for replay on remount — post-ADR-0190
  // the serialized `{ data, cols, rows }` (the raw-scrollback string is the pre-serialize shape).
  list: (): Promise<Array<{ sessionId: string }>> => ipcRenderer.invoke("terminal:list"),
  snapshot: (
    sessionId: string,
  ): Promise<string | { data: string; cols: number; rows: number }> =>
    ipcRenderer.invoke("terminal:snapshot", sessionId),
  // Flow-control acknowledgement (increment B): the renderer reports chars it has actually
  // PARSED (xterm's write callback) so the main can pause the pty past its high watermark and
  // resume it as the renderer catches up. Fire-and-forget — the manager validates the count
  // fail-closed on the other side.
  ack: (sessionId: string, charCount: number): void => {
    ipcRenderer.send("terminal:ack", sessionId, charCount);
  },
  // ConPTY state-sync (patterns-survey increment C): the renderer cleared its xterm buffer —
  // forward the clear so the pty's own buffer representation (node-pty clear(), a no-op off
  // Windows) and the main-held screen model clear with it; else ConPTY reprints the stale
  // screen on the next resize and a re-attach would replay it. Fire-and-forget.
  clear: (sessionId: string): void => {
    ipcRenderer.send("terminal:clear", sessionId);
  },
  // Clickable links (patterns-survey increment D): the renderer's web-links addon routes a
  // clicked URI here — NEVER window.open — and the MAIN enforces the http/https scheme
  // allowlist right before shell.openExternal (open-link-policy.ts; an unvalidated
  // openExternal from terminal output is the electerm GHSA-fwf6-j56g-m97c CVE class — the
  // renderer's own scheme check is only belt). Fire-and-forget.
  openLink: (url: string): void => {
    ipcRenderer.send("terminal:open-link", url);
  },
  ...(windowsBuildNumber === undefined ? {} : { windowsBuildNumber }),
});

// The repo-picker bridge (terminal-repo-picker story, ADR-0174 follow-on). Its mere PRESENCE
// (`window.desktopRepo`) is how the renderer's RepoPicker feature-detects the desktop host (the hosted/dev
// studio — a plain browser — has no such bridge, so the picker renders its honest "unavailable" state).
// `pick` opens the native directory dialog (main drives `dialog.showOpenDialog` → `repo-selection.select`)
// and resolves the chosen VALIDATED path or null; `get` reads the current persisted selection.
//
// `ready` / `onChanged` are the fail-closed GATE slice the renderer's TerminalRepoGate consumes
// (terminal-repo-gate capability): `ready` reads the current VALID repo cwd (or null when none is
// selected — main resolves it fail-closed through a sentinel, never re-driving the byte-locked
// repo-selection), and `onChanged` fires when the user picks a new repo so the gate reopens the terminal
// there. The real filesystem + dialog live in main only.
contextBridge.exposeInMainWorld("desktopRepo", {
  pick: (): Promise<string | null> => ipcRenderer.invoke("dialog:pickDirectory"),
  get: (): Promise<string | null> => ipcRenderer.invoke("repo:get"),
  ready: (): Promise<string | null> => ipcRenderer.invoke("repo:ready"),
  onChanged: (cb: (cwd: string | null) => void): void => {
    ipcRenderer.on("repo:changed", (_e, cwd: string | null) => cb(cwd));
  },
});
