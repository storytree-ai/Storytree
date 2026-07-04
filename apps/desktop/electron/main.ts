import { app, BrowserWindow, ipcMain } from "electron";
import { spawn, type ChildProcess } from "node:child_process";
import { join } from "node:path";

import { CredentialBroker } from "../src/credential/broker.js";
import { NapiKeychain } from "../src/keychain/napi-adapter.js";
import { capturedFromInput } from "../src/oauth/login.js";
import type { CredentialKind } from "../src/credential/kinds.js";
import { serveStudio } from "./static-server.js";
import { describeSidecarExit, tailText } from "../src/backend/sidecar-startup.js";

// The app root (the dir holding this package's package.json) via Electron's own API — robust
// whether the entry runs from `dist/` (the bundled main.cjs) or anywhere else, and free of the
// `import.meta.url` that goes empty under a CJS bundle. Resolves to apps/desktop.
const appRoot = app.getAppPath();

// The COMPILED studio bundle — built separately by `pnpm --filter studio build` (Vite →
// apps/studio/dist). The desktop client carries NO source, NO build engine, NO stories:
// only this compiled UI (ADR-0090 d.4 / ADR-0109 §1). It does NOT import @storytree/agent.
// Served over http://127.0.0.1 (not file://) so its absolute /assets/ paths resolve.
const STUDIO_DIST = join(appRoot, "..", "studio", "dist");

// The thick-local backend SIDECAR entry (ADR-0119 §1). A RAW-TS file run under `tsx` in a child Node
// process — NOT bundled into this CJS main (esbuild empties its `import.meta` under CJS, breaking the
// corpus paths + the build path). The main spawns it, reads its `127.0.0.1` port off stdout, and the
// studio dist server PROXIES `/api/*` to it. It is excluded from `build:electron`'s esbuild entries.
const BACKEND_ENTRY = join(appRoot, "electron", "backend-entry.ts");

// The credential lives in the OS keychain, reached only through the broker in THIS (main)
// process. The renderer never holds it (ADR-0109 §Decision 4).
const broker = new CredentialBroker(new NapiKeychain());

let studioUrl: string | null = null;
let backendChild: ChildProcess | null = null;
let backendPort: number | null = null;

/**
 * Spawn the thick-local backend sidecar as a child Node process via the Electron binary in Node mode
 * (`ELECTRON_RUN_AS_NODE=1`, `--import tsx`) so no separate `node`/`tsx` on PATH is assumed (ADR-0119
 * §1). Resolves with the `127.0.0.1` port it prints on stdout; rejects if it dies before reporting one.
 * The agent boundary (ADR-0004) holds by topology — the sidecar is a main-owned Node process; the
 * renderer never imports `@storytree/agent`.
 */
function startBackend(): Promise<number> {
  return new Promise<number>((resolvePort, rejectPort) => {
    // Pipe (not inherit) the child's stderr so we can CAPTURE it: under Electron on Windows the child's
    // inherited stderr does not reach the launching console, so the real cause (an ERR_MODULE_NOT_FOUND
    // from a stale node_modules, a Postgres auth error) was lost behind a generic exit-1 message. We
    // still echo every chunk live to our own stderr, so nothing is swallowed, AND keep the tail to fold
    // into the rejection so the `[main]` line is self-contained.
    const child = spawn(process.execPath, ["--import", "tsx", BACKEND_ENTRY], {
      cwd: appRoot,
      env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" },
      stdio: ["ignore", "pipe", "pipe"],
    });
    backendChild = child;
    let settled = false;
    let buf = "";
    let errBuf = "";
    const onData = (chunk: Buffer): void => {
      buf += chunk.toString("utf8");
      const m = buf.match(/STORYTREE_BACKEND_PORT=(\d+)/);
      if (m && !settled) {
        settled = true;
        child.stdout?.removeListener("data", onData);
        child.stdout?.resume(); // keep draining so the child never blocks on stdout backpressure
        resolvePort(Number(m[1]));
      }
    };
    child.stdout?.on("data", onData);
    child.stderr?.on("data", (chunk: Buffer) => {
      const text = chunk.toString("utf8");
      process.stderr.write(text); // live pass-through — the sidecar's own logs still stream
      // Bound the retained buffer so a chatty-then-crash child can't grow it without limit; the tail is
      // all describeSidecarExit needs.
      errBuf = tailText(errBuf + text, 40);
    });
    child.once("error", (err) => {
      if (!settled) {
        settled = true;
        rejectPort(err);
      }
    });
    child.once("exit", (code, signal) => {
      if (backendChild === child) backendChild = null;
      if (!settled) {
        settled = true;
        rejectPort(new Error(describeSidecarExit(code, signal, tailText(errBuf, 12))));
      }
    });
  });
}

async function ensureStudioServed(): Promise<string> {
  if (studioUrl === null) {
    if (backendPort === null) {
      try {
        backendPort = await startBackend();
      } catch (err) {
        // Fall back to the Step-1 shell (serveStudio's 503) so the window still opens and shows the
        // store-unavailable banner rather than failing to launch.
        console.error(
          `[main] thick-local backend failed to start: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
    const served = await serveStudio(
      STUDIO_DIST,
      backendPort !== null ? { backendPort } : {},
    );
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

// Reap the backend sidecar on quit so it never outlives the shell (ADR-0119 §1 lifecycle).
app.on("will-quit", () => {
  if (backendChild !== null) {
    backendChild.kill("SIGTERM");
    backendChild = null;
  }
});
