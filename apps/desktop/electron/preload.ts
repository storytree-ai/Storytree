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
