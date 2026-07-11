import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { InMemoryStore } from "@storytree/storage-protocol";

import {
  desktopHelp,
  desktopInstallShortcut,
  desktopLaunch,
  type CreateShortcutsFn,
  type DesktopSpawnFn,
  type ShortcutRequest,
  type SpawnedProcess,
} from "./desktop.js";
import { run } from "./commands.js";

/**
 * Offline tests for `storytree desktop launch` — a fake `spawn` records what it was called with and
 * returns a fake handle; no real Electron process is ever spawned. `repoRoot` points at a scratch
 * temp dir (with a bare `apps/desktop` under it) so the test never touches the real checkout.
 */

function fakeSpawn(): {
  spawn: DesktopSpawnFn;
  calls: Array<{ command: string; args: string[]; options: { cwd: string | undefined; detached: boolean; windowsHide: boolean } }>;
} {
  const calls: Array<{ command: string; args: string[]; options: { cwd: string | undefined; detached: boolean; windowsHide: boolean } }> = [];
  const spawn: DesktopSpawnFn = (command, args, options) => {
    calls.push({ command, args: [...args], options: { cwd: options.cwd, detached: options.detached, windowsHide: options.windowsHide } });
    const handle: SpawnedProcess = { pid: 4242, unref: () => {} };
    return handle;
  };
  return { spawn, calls };
}

function scratchRepo(): string {
  const dir = mkdtempSync(path.join(tmpdir(), "desktop-launch-"));
  mkdirSync(path.join(dir, "apps", "desktop"), { recursive: true });
  return dir;
}

test("desktopHelp: names the launch subcommand and the underlying pnpm launcher", () => {
  const env = desktopHelp();
  assert.equal(env.ok, true);
  assert.match(env.body, /storytree desktop launch/);
  assert.match(env.body, /pnpm --filter desktop start/);
});

test("desktopHelp: names the install-shortcut subcommand and its no-console-window promise", () => {
  const env = desktopHelp();
  assert.equal(env.ok, true);
  assert.match(env.body, /storytree desktop install-shortcut/);
  assert.match(env.body, /no background shell|NO console window/i);
  assert.ok(env.next?.includes("storytree desktop install-shortcut"));
});

test("desktopLaunch: refuses when apps/desktop is absent (not the repo root)", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "desktop-launch-norepo-"));
  try {
    const { spawn } = fakeSpawn();
    const env = desktopLaunch({ repoRoot: dir, spawn, platform: "linux" });
    assert.equal(env.ok, false);
    assert.match(env.body, /no apps\/desktop under/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("desktopLaunch: on POSIX, spawns `pnpm --filter desktop start` directly, detached, in the repo root", () => {
  const dir = scratchRepo();
  try {
    const { spawn, calls } = fakeSpawn();
    const env = desktopLaunch({ repoRoot: dir, spawn, platform: "linux" });
    assert.equal(env.ok, true);
    assert.equal(calls.length, 1);
    assert.deepEqual(calls[0], {
      command: "pnpm",
      args: ["--filter", "desktop", "start"],
      options: { cwd: dir, detached: true, windowsHide: true },
    });
    assert.match(env.body, /launched the desktop app, detached \(pid 4242\)/);
    assert.match(env.body, /log: apps[\\/]desktop[\\/]\.desktop\.log/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("desktopLaunch: on win32, rewraps through cmd.exe (the house pnpm-on-Windows pattern)", () => {
  const dir = scratchRepo();
  try {
    const { spawn, calls } = fakeSpawn();
    const env = desktopLaunch({ repoRoot: dir, spawn, platform: "win32" });
    assert.equal(env.ok, true);
    assert.equal(calls.length, 1);
    const call = calls[0];
    assert.ok(call);
    assert.match(call.command, /cmd\.exe$/i);
    assert.deepEqual(call.args.slice(0, 3), ["/d", "/s", "/c"]);
    assert.deepEqual(call.args.slice(3), ["pnpm", "--filter", "desktop", "start"]);
    assert.equal(call.options.cwd, dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("desktopLaunch: appends a timestamped line to apps/desktop/.desktop.log naming the spawned command", () => {
  const dir = scratchRepo();
  try {
    const { spawn } = fakeSpawn();
    desktopLaunch({ repoRoot: dir, spawn, platform: "linux" });
    const logged = readFileSync(path.join(dir, "apps", "desktop", ".desktop.log"), "utf8");
    assert.match(logged, /--- desktop launch .+ pnpm --filter desktop start ---/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// install-shortcut — a fake .lnk writer + Electron resolver keep it offline (no PowerShell, no Electron)
// ---------------------------------------------------------------------------

function fakeCreateShortcuts(): { createShortcuts: CreateShortcutsFn; calls: ShortcutRequest[] } {
  const calls: ShortcutRequest[] = [];
  const createShortcuts: CreateShortcutsFn = (requests) => {
    calls.push(...requests);
    return requests.map((r) => `C:\\fake\\${r.folder}\\${r.name}`);
  };
  return { createShortcuts, calls };
}

test("desktopInstallShortcut: refuses on non-Windows (it writes a Windows .lnk)", () => {
  const dir = scratchRepo();
  try {
    const { createShortcuts, calls } = fakeCreateShortcuts();
    const env = desktopInstallShortcut({ repoRoot: dir, platform: "linux", createShortcuts });
    assert.equal(env.ok, false);
    assert.match(env.body, /Windows-only/);
    assert.equal(calls.length, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("desktopInstallShortcut: refuses when apps/desktop is absent (not the repo root)", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "desktop-shortcut-norepo-"));
  try {
    const { createShortcuts } = fakeCreateShortcuts();
    const env = desktopInstallShortcut({ repoRoot: dir, platform: "win32", createShortcuts });
    assert.equal(env.ok, false);
    assert.match(env.body, /no apps\/desktop under/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("desktopInstallShortcut: refuses (with a pnpm install hint) when the Electron binary can't be resolved", () => {
  const dir = scratchRepo();
  try {
    const { createShortcuts, calls } = fakeCreateShortcuts();
    const env = desktopInstallShortcut({
      repoRoot: dir,
      platform: "win32",
      createShortcuts,
      resolveElectron: () => null,
    });
    assert.equal(env.ok, false);
    assert.match(env.body, /couldn't find the Electron binary/);
    assert.match(env.body, /pnpm install/);
    assert.equal(calls.length, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("desktopInstallShortcut: writes a Desktop + Start Menu .lnk pointing straight at electron.exe with the app icon", () => {
  const dir = scratchRepo();
  try {
    const desktopDir = path.join(dir, "apps", "desktop");
    // Give the scratch checkout the committed icon + a built main so no advisory notes fire.
    mkdirSync(path.join(desktopDir, "build"), { recursive: true });
    writeFileSync(path.join(desktopDir, "build", "icon.ico"), "ICO");
    mkdirSync(path.join(desktopDir, "dist"), { recursive: true });
    writeFileSync(path.join(desktopDir, "dist", "main.cjs"), "//");

    const fakeElectron = "C:\\fake\\electron\\dist\\electron.exe";
    const { createShortcuts, calls } = fakeCreateShortcuts();
    const env = desktopInstallShortcut({
      repoRoot: dir,
      platform: "win32",
      createShortcuts,
      resolveElectron: () => fakeElectron,
    });

    assert.equal(env.ok, true);
    assert.equal(calls.length, 2);
    assert.deepEqual(
      calls.map((c) => c.folder),
      ["Desktop", "Programs"],
    );
    for (const req of calls) {
      assert.equal(req.name, "storytree.lnk");
      // Targets electron.exe DIRECTLY (GUI-subsystem → no console window) — the whole point.
      assert.equal(req.targetPath, fakeElectron);
      assert.equal(req.arguments, `"${desktopDir}"`);
      assert.equal(req.workingDirectory, desktopDir);
      assert.equal(req.iconLocation, path.join(desktopDir, "build", "icon.ico"));
    }
    assert.match(env.body, /NO background console window/);
    assert.match(env.body, /idempotent/);
    // No advisory notes when the icon + built main are present.
    assert.doesNotMatch(env.body, /wasn't built yet|used the Electron icon as a fallback/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("desktopInstallShortcut: falls back to the Electron icon and warns when icon.ico / dist are absent", () => {
  const dir = scratchRepo();
  try {
    const fakeElectron = "C:\\fake\\electron\\dist\\electron.exe";
    const { createShortcuts, calls } = fakeCreateShortcuts();
    const env = desktopInstallShortcut({
      repoRoot: dir,
      platform: "win32",
      createShortcuts,
      resolveElectron: () => fakeElectron,
    });
    assert.equal(env.ok, true);
    for (const req of calls) assert.equal(req.iconLocation, fakeElectron);
    assert.match(env.body, /used the Electron icon as a fallback/);
    assert.match(env.body, /isn't built yet/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// install-shortcut --runtime — point the installed app at a pinned-main runtime worktree (ADR-0181)
// ---------------------------------------------------------------------------

/** A scratch pinned-main runtime worktree (a dir with apps/desktop under it). */
function scratchRuntime(): string {
  const dir = mkdtempSync(path.join(tmpdir(), "desktop-runtime-"));
  mkdirSync(path.join(dir, "apps", "desktop"), { recursive: true });
  return dir;
}

test("desktopInstallShortcut --runtime: on main → targets <runtime>/apps/desktop and writes the runtime config", () => {
  const repo = scratchRepo();
  const runtime = scratchRuntime();
  const home = mkdtempSync(path.join(tmpdir(), "desktop-home-"));
  try {
    const runtimeDesktop = path.join(runtime, "apps", "desktop");
    const fakeElectron = "C:\\fake\\electron\\dist\\electron.exe";
    const { createShortcuts, calls } = fakeCreateShortcuts();
    const env = desktopInstallShortcut({
      repoRoot: repo,
      platform: "win32",
      createShortcuts,
      resolveElectron: () => fakeElectron,
      runtime,
      branchOf: () => "main",
      homeDir: home,
    });

    assert.equal(env.ok, true);
    assert.equal(calls.length, 2);
    for (const req of calls) {
      // The shortcut points at the RUNTIME worktree's apps/desktop, not the dev checkout's.
      assert.equal(req.arguments, `"${runtimeDesktop}"`);
      assert.equal(req.workingDirectory, runtimeDesktop);
    }
    // The config main.ts reads is written under ~/.storytree, pointing at the runtime worktree.
    const configPath = path.join(home, ".storytree", "desktop.runtime.json");
    assert.deepEqual(JSON.parse(readFileSync(configPath, "utf8")), { path: runtime });
    assert.match(env.body, /pinned-main runtime worktree/);
    assert.match(env.body, /tracks main/);
  } finally {
    rmSync(repo, { recursive: true, force: true });
    rmSync(runtime, { recursive: true, force: true });
    rmSync(home, { recursive: true, force: true });
  }
});

test("desktopInstallShortcut --runtime: a MISSING worktree fails closed with the bootstrap recipe (no config, no shortcut)", () => {
  const repo = scratchRepo();
  const home = mkdtempSync(path.join(tmpdir(), "desktop-home-"));
  try {
    const { createShortcuts, calls } = fakeCreateShortcuts();
    const missing = path.join(tmpdir(), "no-such-runtime-worktree-xyz");
    const env = desktopInstallShortcut({
      repoRoot: repo,
      platform: "win32",
      createShortcuts,
      resolveElectron: () => "C:\\e\\electron.exe",
      runtime: missing,
      branchOf: () => "main",
      homeDir: home,
    });
    assert.equal(env.ok, false);
    assert.match(env.body, /runtime worktree not found/);
    assert.match(env.body, /git worktree add/);
    assert.equal(calls.length, 0); // no shortcut written
    assert.equal(existsSync(path.join(home, ".storytree", "desktop.runtime.json")), false); // no config written
  } finally {
    rmSync(repo, { recursive: true, force: true });
    rmSync(home, { recursive: true, force: true });
  }
});

test("desktopInstallShortcut --runtime: an OFF-main worktree fails closed with a fast-forward hint", () => {
  const repo = scratchRepo();
  const runtime = scratchRuntime();
  const home = mkdtempSync(path.join(tmpdir(), "desktop-home-"));
  try {
    const { createShortcuts, calls } = fakeCreateShortcuts();
    const env = desktopInstallShortcut({
      repoRoot: repo,
      platform: "win32",
      createShortcuts,
      resolveElectron: () => "C:\\e\\electron.exe",
      runtime,
      branchOf: () => "claude/some-feature",
      homeDir: home,
    });
    assert.equal(env.ok, false);
    assert.match(env.body, /is on 'claude\/some-feature', not 'main'/);
    assert.match(env.body, /pull --ff-only/);
    assert.equal(calls.length, 0);
    assert.equal(existsSync(path.join(home, ".storytree", "desktop.runtime.json")), false);
  } finally {
    rmSync(repo, { recursive: true, force: true });
    rmSync(runtime, { recursive: true, force: true });
    rmSync(home, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// Dispatch (through run(), as main wires it)
// ---------------------------------------------------------------------------

test("dispatch: `desktop` help + unknown sub are guidance; `desktop launch` threads the injected spawn seam", async () => {
  const store = new InMemoryStore();

  const help = await run(["desktop"], { store });
  assert.equal(help.ok, true);
  assert.match(help.body, /storytree desktop launch/);

  const unknown = await run(["desktop", "wat"], { store });
  assert.equal(unknown.ok, false);
  assert.match(unknown.body, /unknown desktop command "wat"/);
  assert.match(unknown.body, /install-shortcut/);

  const dir = scratchRepo();
  try {
    const { spawn, calls } = fakeSpawn();
    const env = await run(["desktop", "launch"], { store, desktop: { spawn, repoRoot: dir, platform: "linux" } });
    assert.equal(env.ok, true);
    assert.equal(calls.length, 1);
    assert.equal(calls[0]?.options.cwd, dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }

  const shortcutDir = scratchRepo();
  try {
    const { createShortcuts, calls } = fakeCreateShortcuts();
    const env = await run(["desktop", "install-shortcut"], {
      store,
      desktop: { repoRoot: shortcutDir, platform: "win32", createShortcuts, resolveElectron: () => "C:\\e\\electron.exe" },
    });
    assert.equal(env.ok, true);
    assert.equal(calls.length, 2);
    assert.deepEqual(
      calls.map((c) => c.folder),
      ["Desktop", "Programs"],
    );
  } finally {
    rmSync(shortcutDir, { recursive: true, force: true });
  }
});
