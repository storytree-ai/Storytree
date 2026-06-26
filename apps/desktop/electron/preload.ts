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
