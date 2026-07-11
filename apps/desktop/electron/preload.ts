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
    ipcRenderer.on("terminal:data", (_e, sessionId: string, chunk: string) => cb(sessionId, chunk));
  },
  onExit: (cb: (sessionId: string, e: { exitCode: number }) => void): void => {
    ipcRenderer.on("terminal:exit", (_e, sessionId: string, exit: { exitCode: number }) => cb(sessionId, exit));
  },
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
