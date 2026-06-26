import { app, BrowserWindow, ipcMain } from "electron";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { CredentialBroker } from "../src/credential/broker.js";
import { NapiKeychain } from "../src/keychain/napi-adapter.js";
import { capturedFromInput } from "../src/oauth/login.js";
import type { CredentialKind } from "../src/credential/kinds.js";

const here = dirname(fileURLToPath(import.meta.url));

// The COMPILED studio bundle — built separately by `pnpm --filter studio build` (Vite →
// apps/studio/dist). The desktop client carries NO source, NO build engine, NO stories:
// only this compiled UI (ADR-0090 d.4 / ADR-0109 §1). It does NOT import @storytree/agent.
const STUDIO_INDEX = join(here, "..", "..", "studio", "dist", "index.html");

// The credential lives in the OS keychain, reached only through the broker in THIS (main)
// process. The renderer never holds it (ADR-0109 §Decision 4).
const broker = new CredentialBroker(new NapiKeychain());

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1280,
    height: 860,
    title: "storytree",
    webPreferences: {
      preload: join(here, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  void win.loadFile(STUDIO_INDEX);
}

// Auth IPC — the renderer asks the MAIN process to broker the credential. The raw token
// flows renderer → main → keychain on store, and NEVER flows back: `status` answers only a
// boolean, so the credential never re-enters the renderer.
ipcMain.handle("auth:status", async (_e, kind: CredentialKind): Promise<boolean> => {
  return (await broker.read(kind)) !== null;
});
ipcMain.handle("auth:store", async (_e, kind: CredentialKind, rawToken: string): Promise<void> => {
  const captured = capturedFromInput(kind, rawToken);
  await broker.store(captured.kind, captured.token);
});
ipcMain.handle("auth:sign-out", async (_e, kind: CredentialKind): Promise<boolean> => {
  return broker.clear(kind);
});

void app.whenReady().then(() => {
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
