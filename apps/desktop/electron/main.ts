import { app, BrowserWindow, ipcMain, session } from "electron";
import { spawn, execFileSync, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

import { CredentialBroker } from "../src/credential/broker.js";
import { NapiKeychain } from "../src/keychain/napi-adapter.js";
import { capturedFromInput } from "../src/oauth/login.js";
import type { CredentialKind } from "../src/credential/kinds.js";
import { serveStudio } from "./static-server.js";
import { describeSidecarExit, tailText } from "../src/backend/sidecar-startup.js";
import { rebuildSteps, runRebuild, spawnStepRunner, type RebuildResult } from "../src/apply/rebuild.js";
import { resolveRuntimeRoot, RUNTIME_ROOT_ENV } from "../src/apply/runtime-root.js";
import { PtySessionManager } from "../src/backend/pty-session-manager.js";
import type { PtyPort, PtyHandle, PtySpawnOptions } from "../src/backend/pty-session-manager.js";
import { spawn as ptySpawn } from "node-pty";

// The app root (the dir holding this package's package.json) via Electron's own API — robust
// whether the entry runs from `dist/` (the bundled main.cjs) or anywhere else, and free of the
// `import.meta.url` that goes empty under a CJS bundle. Resolves to apps/desktop.
const appRoot = app.getAppPath();
// The checkout the Electron shell launched from (apps/desktop → apps → repo root) — the fallback root
// when no pinned runtime worktree is configured.
const launchRoot = join(appRoot, "..", "..");

// ADR-0181 — RESOLVE THE RUNTIME ROOT the desktop serves from, FAIL-CLOSED. The desktop must serve a
// pinned, CI-proven `main`, not whatever branch the launch checkout happens to sit on (the observed
// 2026-07-08 bug: it served a dirty feature branch). STORYTREE_DESKTOP_RUNTIME points at a dedicated
// worktree kept on `main`; when set it is authoritative and must EXIST + be on `main`, else we refuse
// (requireRuntime() below blocks serving, so the launch shows the misconfiguration instead of stray
// code). When UNSET we fall back to the launch checkout (today's dev-convenience behaviour). A sync
// `existsSync` + `git` read are the real probes over which the pure resolveRuntimeRoot decides.
function branchOfSync(path: string): string | null {
  try {
    const out = execFileSync("git", ["rev-parse", "--abbrev-ref", "HEAD"], {
      cwd: path,
      windowsHide: true,
      encoding: "utf8",
    }).trim();
    return out.length > 0 ? out : null;
  } catch {
    return null;
  }
}
const runtime = resolveRuntimeRoot(
  { configured: process.env[RUNTIME_ROOT_ENV] ?? null, launchRoot },
  { exists: (p) => existsSync(p), branchOf: branchOfSync },
);
if (runtime.ok) {
  console.error(`[main] serving runtime root ${runtime.root} (source: ${runtime.source})`);
} else {
  console.error(`[main] FAIL-CLOSED — will not serve stray code: ${runtime.error}`);
}
// The root everything else serves/builds from — the runtime worktree, or the launch checkout in the
// dev fallback. When resolution REFUSED (configured-but-invalid) this is launchRoot, but requireRuntime()
// blocks serving before any of these paths are used, so stray code never renders.
const serveRoot = runtime.ok ? runtime.root : launchRoot;
// Enforce the ff-to-main advance in the rebuild only when we are actually serving a pinned runtime
// worktree; the pure dev fallback rebuilds the launch checkout in place (ADR-0164 behaviour), no advance.
const ffToMain = runtime.ok && runtime.source === "runtime";

// The COMPILED studio bundle — built by `pnpm --filter studio build` (Vite → apps/studio/dist) IN THE
// SERVE ROOT. The desktop client carries NO source, NO build engine, NO stories: only this compiled UI
// (ADR-0090 d.4 / ADR-0109 §1). It does NOT import @storytree/agent. Served over http://127.0.0.1 (not
// file://) so its absolute /assets/ paths resolve.
const STUDIO_DIST = join(serveRoot, "apps", "studio", "dist");

// The thick-local backend SIDECAR entry (ADR-0119 §1), from the SERVE ROOT. A RAW-TS file run under
// `tsx` in a child Node process — NOT bundled into this CJS main (esbuild empties its `import.meta`
// under CJS, breaking the corpus paths + the build path). The main spawns it, reads its `127.0.0.1`
// port off stdout, and the studio dist server PROXIES `/api/*` to it. Excluded from `build:electron`.
const BACKEND_ENTRY = join(serveRoot, "apps", "desktop", "electron", "backend-entry.ts");
// The dir the sidecar + the rebuild run in — the serve root's desktop package (so `tsx` resolves the
// serve root's node_modules, and `--filter studio`/`--filter desktop` resolve the serve-root workspace).
const sidecarCwd = join(serveRoot, "apps", "desktop");

// The credential lives in the OS keychain, reached only through the broker in THIS (main)
// process. The renderer never holds it (ADR-0109 §Decision 4).
const broker = new CredentialBroker(new NapiKeychain());

let studioUrl: string | null = null;
let backendChild: ChildProcess | null = null;
let backendPort: number | null = null;
let startupInFlight: Promise<void> | null = null;
let brokerLoginInFlight: Promise<string> | null = null;

const RETRY_URL = "storytree-retry://start";
const HOSTED_STUDIO_URL = (
  process.env.STORYTREE_STUDIO_URL ?? "https://storytree-studio-iuknr3zuya-ts.a.run.app"
).replace(/\/+$/, "");

type SidecarBrokerRequest =
  | { type: "broker:identity"; requestId: string }
  | { type: "broker:post"; requestId: string; path: string; body: unknown };

function isSidecarBrokerRequest(value: unknown): value is SidecarBrokerRequest {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record["requestId"] === "string" &&
    (record["type"] === "broker:identity" ||
      (record["type"] === "broker:post" && typeof record["path"] === "string"))
  );
}

async function readHostedIdentity(): Promise<string | null> {
  try {
    const response = await session.defaultSession.fetch(`${HOSTED_STUDIO_URL}/api/me`, {
      credentials: "include",
      redirect: "follow",
    });
    if (!response.ok) return null;
    const body = (await response.json()) as Record<string, unknown>;
    return body["member"] === true && typeof body["email"] === "string" && body["email"].trim() !== ""
      ? body["email"].trim()
      : null;
  } catch {
    return null;
  }
}

async function ensureHostedIdentity(): Promise<string> {
  const existing = await readHostedIdentity();
  if (existing !== null) return existing;
  if (brokerLoginInFlight !== null) return brokerLoginInFlight;

  const login = new Promise<string>((resolveIdentity, rejectIdentity) => {
    const parent = BrowserWindow.getAllWindows().find((candidate) => !candidate.isDestroyed());
    const win = new BrowserWindow({
      width: 980,
      height: 760,
      title: "Sign in to storytree",
      ...(parent !== undefined ? { parent } : {}),
      webPreferences: { session: session.defaultSession, contextIsolation: true, nodeIntegration: false },
    });
    let settled = false;
    const finish = (error: Error | null, identity?: string): void => {
      if (settled) return;
      settled = true;
      clearInterval(poll);
      clearTimeout(timeout);
      if (!win.isDestroyed()) win.close();
      if (error !== null) rejectIdentity(error);
      else resolveIdentity(identity!);
    };
    const poll = setInterval(() => {
      void readHostedIdentity().then((identity) => {
        if (identity !== null) finish(null, identity);
      });
    }, 1000);
    const timeout = setTimeout(
      () => finish(new Error("hosted studio sign-in timed out; UAT verdict was not written")),
      120_000,
    );
    win.once("closed", () => finish(new Error("hosted studio sign-in was cancelled; UAT verdict was not written")));
    void win.loadURL(HOSTED_STUDIO_URL).catch((error: unknown) => finish(new Error(errorMessage(error))));
  });
  brokerLoginInFlight = login.finally(() => {
    brokerLoginInFlight = null;
  });
  return brokerLoginInFlight;
}

async function handleSidecarBrokerRequest(child: ChildProcess, message: unknown): Promise<void> {
  if (!isSidecarBrokerRequest(message) || !child.connected) return;
  try {
    if (message.type === "broker:identity") {
      child.send?.({ type: "broker:response", requestId: message.requestId, ok: true, value: await ensureHostedIdentity() });
      return;
    }
    if (message.path !== "/api/write-broker") {
      throw new Error(`unsupported broker path "${message.path}"`);
    }
    await ensureHostedIdentity();
    const response = await session.defaultSession.fetch(`${HOSTED_STUDIO_URL}${message.path}`, {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(message.body),
    });
    const text = await response.text();
    let body: unknown = null;
    try {
      body = text === "" ? null : JSON.parse(text);
    } catch {
      body = { error: text };
    }
    child.send?.({
      type: "broker:response",
      requestId: message.requestId,
      ok: true,
      value: { status: response.status, body },
    });
  } catch (error) {
    child.send?.({
      type: "broker:response",
      requestId: message.requestId,
      ok: false,
      error: errorMessage(error),
    });
  }
}

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (char) => {
    switch (char) {
      case "&": return "&amp;";
      case "<": return "&lt;";
      case ">": return "&gt;";
      case '"': return "&quot;";
      default: return "&#39;";
    }
  });
}

function launchPage(title: string, detail: string, retry: boolean): string {
  const action = retry
    ? `<a href="${RETRY_URL}">Retry</a>`
    : `<div class="spinner" aria-hidden="true"></div>`;
  return `data:text/html;charset=utf-8,${encodeURIComponent(`<!doctype html>
<html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width">
<title>${escapeHtml(title)}</title>
<style>
  :root { color-scheme: dark; font-family: system-ui, sans-serif; background: #111827; color: #f9fafb; }
  body { min-height: 100vh; margin: 0; display: grid; place-items: center; }
  main { width: min(38rem, calc(100vw - 3rem)); padding: 2rem; border: 1px solid #374151;
    border-radius: 1rem; background: #1f2937; box-shadow: 0 1rem 3rem #0006; }
  h1 { margin-top: 0; font-size: 1.5rem; }
  pre { white-space: pre-wrap; overflow-wrap: anywhere; color: #d1d5db; font: inherit; line-height: 1.5; }
  a { display: inline-block; margin-top: 1rem; padding: .65rem 1rem; border-radius: .5rem;
    background: #e5e7eb; color: #111827; font-weight: 650; text-decoration: none; }
  .spinner { width: 1.25rem; height: 1.25rem; margin-top: 1rem; border: 2px solid #6b7280;
    border-top-color: #f9fafb; border-radius: 50%; animation: spin .8s linear infinite; }
  @keyframes spin { to { transform: rotate(360deg); } }
</style>
<main><h1>${escapeHtml(title)}</h1><pre>${escapeHtml(detail)}</pre>${action}</main></html>`)}`;
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * Fail closed when the runtime worktree is MISCONFIGURED (ADR-0181): a configured
 * STORYTREE_DESKTOP_RUNTIME that is missing or not on `main`. Rather than serve stray code we surface
 * the actionable error (the `git worktree add` / fast-forward hint) — launchBackendForWindow catches it
 * and renders it on the launch page.
 */
function requireRuntime(): void {
  if (!runtime.ok) throw new Error(runtime.error);
}

/** Fail closed when the compiled studio bundle is absent — the shell cannot render without it. */
function requireStudioDist(): void {
  const indexHtml = join(STUDIO_DIST, "index.html");
  if (existsSync(indexHtml)) return;
  throw new Error(
    `the studio UI bundle is missing (${STUDIO_DIST}) — run "pnpm --filter studio build" in the runtime worktree, then Retry`,
  );
}

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
    // cwd + STORYTREE_DESKTOP_RUNTIME point the sidecar at the SERVE ROOT (ADR-0181): it reads the live
    // stories/ + docs/ from the pinned runtime worktree, and `tsx` resolves the serve root's node_modules.
    const child = spawn(process.execPath, ["--import", "tsx", BACKEND_ENTRY], {
      cwd: sidecarCwd,
      env: { ...process.env, ELECTRON_RUN_AS_NODE: "1", [RUNTIME_ROOT_ENV]: serveRoot },
      stdio: ["ignore", "pipe", "pipe", "ipc"],
    });
    backendChild = child;
    child.on("message", (message: unknown) => {
      void handleSidecarBrokerRequest(child, message);
    });
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
      if (backendChild === child) backendChild = null;
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
    if (backendPort === null) throw new Error("backend port is unavailable");
    const served = await serveStudio(STUDIO_DIST, { backendPort });
    studioUrl = served.url;
  }
  return studioUrl;
}

async function safeLoadURL(win: BrowserWindow, url: string): Promise<void> {
  if (win.isDestroyed()) return;
  try {
    await win.loadURL(url);
  } catch (err) {
    if (!win.isDestroyed()) throw err;
  }
}

function launchBackendForWindow(win: BrowserWindow, showStarting = true): Promise<void> {
  if (startupInFlight !== null) return startupInFlight;
  const attempt = (async () => {
    try {
      if (showStarting) {
        await safeLoadURL(win, launchPage("Starting storytree", "Checking the checkout and database…", false));
      }
      requireRuntime();
      requireStudioDist();
      backendPort = await startBackend();
      const url = await ensureStudioServed();
      await safeLoadURL(win, url);
    } catch (err) {
      const reason = errorMessage(err);
      console.error(`[main] thick-local backend failed to start: ${reason}`);
      await safeLoadURL(
        win,
        launchPage(
          "storytree could not start",
          `storytree could not finish launching.\n\n${reason}`,
          true,
        ),
      );
    }
  })();
  startupInFlight = attempt.finally(() => {
    startupInFlight = null;
  });
  return startupInFlight;
}

async function createWindow(): Promise<void> {
  const win = new BrowserWindow({
    width: 1280,
    height: 860,
    title: "storytree",
    // The committed app icon (apps/desktop/build/icon.ico) — window + taskbar. Electron silently
    // ignores a missing path, so a checkout without the asset still opens (just with the default icon).
    icon: join(appRoot, "build", "icon.ico"),
    webPreferences: {
      preload: join(appRoot, "dist", "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  win.webContents.on("will-navigate", (event, url) => {
    if (url !== RETRY_URL) return;
    event.preventDefault();
    void launchBackendForWindow(win);
  });
  // Reap every embedded-terminal pty when the window that hosts them closes (ADR-0174) — a closed
  // renderer must never leave an orphaned child shell running.
  win.on("closed", disposeAllTerminals);
  await safeLoadURL(win, launchPage("Starting storytree", "Checking the checkout and database…", false));
  void launchBackendForWindow(win, false);
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

// ---------- embedded terminal: a real local pty in the desktop (ADR-0174) ----------
//
// The Electron MAIN owns the pty — node-pty is a native module the renderer never touches, so the
// agent boundary (ADR-0004) holds by topology. PtySessionManager (the signed --real capability) drives
// the lifecycle over this injected PtyPort; node-pty is reached ONLY here. The renderer's TerminalDock
// reaches it through the `desktopTerminal` contextBridge (preload) → these IPC channels, and the manager
// fails closed (typed no-op, never a throw) on an unknown/late session id, so a stray IPC can't crash main.
function defaultShell(): string {
  if (process.platform === "win32") return process.env["ComSpec"] ?? "powershell.exe";
  return process.env["SHELL"] ?? "bash";
}

// The real PtyPort: fork a node-pty process and wrap it as the manager's PtyHandle. Minimal by design —
// the manager owns session tracking, data routing, and the fail-closed no-ops.
const ptyPort: PtyPort = {
  spawn(opts: PtySpawnOptions): PtyHandle {
    const proc = ptySpawn(opts.shell ?? defaultShell(), [], {
      cols: opts.cols,
      rows: opts.rows,
      cwd: opts.cwd ?? serveRoot,
      env: opts.env ?? process.env,
    });
    return {
      onData: (cb) => {
        proc.onData((chunk) => cb(chunk));
      },
      onExit: (cb) => {
        proc.onExit((e) => cb({ exitCode: e.exitCode }));
      },
      write: (data) => proc.write(data),
      resize: (cols, rows) => proc.resize(cols, rows),
      kill: () => proc.kill(),
    };
  },
};
const terminalManager = new PtySessionManager(ptyPort);
// Live session ids, so a window close / app quit reaps every child shell (never orphan a pty).
const terminalSessions = new Set<string>();

// Normalize the renderer's untrusted spawn payload into PtySpawnOptions: cols/rows fall back to a
// standard 80×24 (the renderer's xterm re-fits + resizes right after), and env is NOT taken from the
// renderer — the port defaults it to the main-process env.
function normalizeSpawnOpts(raw: unknown): PtySpawnOptions {
  const o = typeof raw === "object" && raw !== null ? (raw as Record<string, unknown>) : {};
  const rawCols = o["cols"];
  const rawRows = o["rows"];
  const cols = typeof rawCols === "number" && rawCols > 0 ? Math.floor(rawCols) : 80;
  const rows = typeof rawRows === "number" && rawRows > 0 ? Math.floor(rawRows) : 24;
  const opts: PtySpawnOptions = { cols, rows };
  if (typeof o["shell"] === "string") opts.shell = o["shell"];
  if (typeof o["cwd"] === "string") opts.cwd = o["cwd"];
  return opts;
}

function disposeAllTerminals(): void {
  for (const id of terminalSessions) terminalManager.dispose(id);
  terminalSessions.clear();
}

// Renderer → main pty IPC. `spawn` streams output back to the REQUESTING webContents (the focused
// window's terminal); write/resize/dispose forward to the manager.
ipcMain.handle("terminal:spawn", (e, opts: unknown): { sessionId: string } => {
  const sender = e.sender;
  const sessionId = terminalManager.create(
    normalizeSpawnOpts(opts),
    (sid, chunk) => {
      if (!sender.isDestroyed()) sender.send("terminal:data", sid, chunk);
    },
    (sid, exit) => {
      terminalSessions.delete(sid);
      if (!sender.isDestroyed()) sender.send("terminal:exit", sid, exit);
    },
  );
  terminalSessions.add(sessionId);
  return { sessionId };
});
ipcMain.on("terminal:write", (_e, id: string, data: string) => {
  terminalManager.write(id, data);
});
ipcMain.on("terminal:resize", (_e, id: string, cols: number, rows: number) => {
  terminalManager.resize(id, cols, rows);
});
ipcMain.on("terminal:dispose", (_e, id: string) => {
  terminalManager.dispose(id);
  terminalSessions.delete(id);
});

// ---------- apply-a-landed-fix: rebuild + relaunch (ADR-0164 Phase 1) ----------
//
// Rail 1: the SUPERVISOR is this Electron MAIN process — it spawns the sidecar and can `app.relaunch()`,
// so it is the only process that can rebuild + relaunch without killing the thing issuing the command.
// The renderer's banner button (surfacing the existing git-HEAD-drift signal, ADR-0164) invokes this;
// the MAIN process executes. The orchestrator/sidecar only ever SIGNALS — it never restarts itself.
//
// FAIL-CLOSED (ADR-0164 Consequences + ADR-0181): when serving a pinned runtime worktree the rebuild
// LEADS with `git fetch` + `git merge --ff-only origin/main` (Rail 2 enforced by construction — only
// merged `main` can ever be applied) + a frozen install, then `pnpm --filter studio build` +
// `build:electron`, all in the serve root, STOPPING on the first failure. On success we relaunch onto
// the freshly-built code; on ANY failure (a non-fast-forward, a broken build) we DO NOT relaunch — the
// app stays on the old working build and the typed error is returned to the banner. A concurrency guard
// makes a double-click a no-op rather than two overlapping builds.
let rebuilding = false;
ipcMain.handle("apply:rebuild-relaunch", async (): Promise<RebuildResult> => {
  if (rebuilding) {
    return { ok: false, step: "rebuild", code: 1, output: "a rebuild is already in progress" };
  }
  rebuilding = true;
  try {
    const result = await runRebuild(spawnStepRunner(), rebuildSteps({ root: serveRoot, ffToMain }));
    if (result.ok) {
      // Relaunch onto the new build, then quit THIS instance — `will-quit` reaps the sidecar. The new
      // instance spawns a fresh sidecar that serves the just-rebuilt studio dist. Only reached on a
      // fully-green rebuild, so the app never relaunches into a half-applied state.
      app.relaunch();
      app.quit();
    }
    return result;
  } finally {
    rebuilding = false;
  }
});

// Give Windows a stable Application User Model ID so the shell treats storytree as its own app —
// the taskbar shows OUR icon (not the generic electron.exe), groups our windows under one button,
// and toast notifications are attributed to "storytree". No-op on macOS/Linux.
app.setAppUserModelId("dev.storytree.desktop");

void app.whenReady().then(async () => {
  await createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) void createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

// Reap the backend sidecar + every embedded-terminal pty on quit so neither outlives the shell
// (ADR-0119 §1 lifecycle; ADR-0174 terminal lifecycle).
app.on("will-quit", () => {
  disposeAllTerminals();
  if (backendChild !== null) {
    backendChild.kill("SIGTERM");
    backendChild = null;
  }
});
