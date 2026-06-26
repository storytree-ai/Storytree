import { app, BrowserWindow, ipcMain } from "electron";
import { join } from "node:path";

import { CredentialBroker } from "../src/credential/broker.js";
import { NapiKeychain } from "../src/keychain/napi-adapter.js";
import { capturedFromInput } from "../src/oauth/login.js";
import type { CredentialKind } from "../src/credential/kinds.js";
import { serveStudio } from "./static-server.js";

// The app root (the dir holding this package's package.json) via Electron's own API — robust
// whether the entry runs from `dist/` (the bundled main.cjs) or anywhere else, and free of the
// `import.meta.url` that goes empty under a CJS bundle. Resolves to apps/desktop.
const appRoot = app.getAppPath();

// The COMPILED studio bundle — built separately by `pnpm --filter studio build` (Vite →
// apps/studio/dist). The desktop client carries NO source, NO build engine, NO stories:
// only this compiled UI (ADR-0090 d.4 / ADR-0109 §1). It does NOT import @storytree/agent.
// Served over http://127.0.0.1 (not file://) so its absolute /assets/ paths resolve.
const STUDIO_DIST = join(appRoot, "..", "studio", "dist");

// The credential lives in the OS keychain, reached only through the broker in THIS (main)
// process. The renderer never holds it (ADR-0109 §Decision 4).
const broker = new CredentialBroker(new NapiKeychain());

let studioUrl: string | null = null;

async function ensureStudioServed(): Promise<string> {
  if (studioUrl === null) {
    const served = await serveStudio(STUDIO_DIST);
    studioUrl = served.url;
  }
  return studioUrl;
}

async function createWindow(): Promise<void> {
  const url = await ensureStudioServed();
  const win = new BrowserWindow({
    width: 1280,
    height: 860,
    title: "storytree",
    webPreferences: {
      preload: join(appRoot, "dist", "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  await win.loadURL(url);
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

void app.whenReady().then(async () => {
  await createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) void createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
