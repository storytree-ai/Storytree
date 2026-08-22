import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { InMemoryStore } from "@storytree/storage-protocol";

import type { DetachedSpawn } from "@storytree/drive";

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

interface FakeSpawnResult {
  spawn: DesktopSpawnFn;
  calls: Array<{ command: string; args: string[]; options: { cwd: string | undefined; detached: boolean; windowsHide: boolean } }>;
}

function fakeSpawn(): FakeSpawnResult {
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

/**
 * The registrar every test that does not care about registration passes. It must be INJECTED rather
 * than left to the default: the real one derives THIS worktree's identity and writes a record under
 * `~/.storytree/spawns`, so an un-injected test would file pid 4242 as live work in the operator's
 * own inventory and leave it there — `storytree own` reporting a leaked desktop app that never ran.
 */
const noRegister = (): string | null => null;

interface FakeRegisterResult { register: (s: DetachedSpawn) => string | null; calls: DetachedSpawn[] }

/** Records what the launcher asked to register, so the attribution can be asserted on. */
function fakeRegister(): FakeRegisterResult {
  const calls: DetachedSpawn[] = [];
  return {
    register: (s) => {
      calls.push(s);
      return "/fake/registry/4242.json";
    },
    calls,
  };
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
    const env = desktopLaunch({ repoRoot: dir, spawn, platform: "linux", register: noRegister });
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
    const env = desktopLaunch({ repoRoot: dir, spawn, platform: "linux", register: noRegister });
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
    const env = desktopLaunch({ repoRoot: dir, spawn, platform: "win32", register: noRegister });
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
    desktopLaunch({ repoRoot: dir, spawn, platform: "linux", register: noRegister });
    const logged = readFileSync(path.join(dir, "apps", "desktop", ".desktop.log"), "utf8");
    assert.match(logged, /--- desktop launch .+ pnpm --filter desktop start ---/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("desktopLaunch: REGISTERS the detached child, so `storytree own` can see and stop it", () => {
  // The gap this closes (`shared-box-session-ownership-arc` inc 2): `main.ts` registers the CLI
  // INVOCATION, whose row dies seconds from now — while the Electron app it started runs for hours.
  // Without a row of its own, the session can report itself inert while holding a GUI process
  // nothing on this shared box can attribute back to it.
  const dir = scratchRepo();
  try {
    const { spawn } = fakeSpawn();
    const { register, calls } = fakeRegister();
    const env = desktopLaunch({ repoRoot: dir, spawn, platform: "linux", register });
    assert.equal(env.ok, true);
    assert.equal(calls.length, 1, "the detached child must be registered exactly once");
    const registered = calls[0];
    assert.ok(registered);
    // The CHILD's pid — not this process's. Registering the launcher would inventory something that
    // is already gone and miss the thing that is still running.
    assert.equal(registered.pid, 4242);
    assert.match(registered.command, /desktop app \(electron\)/);
    assert.equal(registered.cwd, dir);
    // Told to the operator, because a row they do not know exists is a row they will not act on.
    assert.match(env.body, /storytree own stop/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("desktopLaunch: a registry that declines is SILENT — instrumentation never costs the app", () => {
  const dir = scratchRepo();
  try {
    const { spawn } = fakeSpawn();
    // `null` is what the real registrar returns in the primary checkout, in CI, and on an unwritable
    // home — every one of which must still launch the app, and must not claim a row it never wrote.
    const env = desktopLaunch({ repoRoot: dir, spawn, platform: "linux", register: noRegister });
    assert.equal(env.ok, true);
    assert.match(env.body, /launched the desktop app, detached/);
    assert.doesNotMatch(env.body, /storytree own stop/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// install-shortcut — a fake .lnk writer + Electron resolver keep it offline (no PowerShell, no Electron)
// ---------------------------------------------------------------------------

interface FakeCreateShortcutsResult { createShortcuts: CreateShortcutsFn; calls: ShortcutRequest[] }

function fakeCreateShortcuts(): FakeCreateShortcutsResult {
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
      isPinnedToMain: () => false, // the local `main` branch arm alone accepts (back-compat), no git needed
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

test("desktopInstallShortcut --runtime: an OFF-main worktree (stray branch, not pinned) fails closed with a re-pin hint", () => {
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
      isPinnedToMain: () => false, // a stray feature branch, not reachable from origin/main
      homeDir: home,
    });
    assert.equal(env.ok, false);
    assert.match(env.body, /is on 'claude\/some-feature'/);
    assert.match(env.body, /not pinned to/);
    assert.match(env.body, /checkout --detach origin\/main/);
    assert.equal(calls.length, 0);
    assert.equal(existsSync(path.join(home, ".storytree", "desktop.runtime.json")), false);
  } finally {
    rmSync(repo, { recursive: true, force: true });
    rmSync(runtime, { recursive: true, force: true });
    rmSync(home, { recursive: true, force: true });
  }
});

test("desktopInstallShortcut --runtime: a DETACHED HEAD pinned to origin/main succeeds (the canonical form, ADR-0181)", () => {
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
      branchOf: () => "HEAD", // detached HEAD, as `git worktree add <path> origin/main` produces
      isPinnedToMain: () => true, // ...but pinned to origin/main — must succeed, not fail closed
      homeDir: home,
    });
    assert.equal(env.ok, true);
    assert.equal(calls.length, 2);
    for (const req of calls) {
      assert.equal(req.arguments, `"${runtimeDesktop}"`);
      assert.equal(req.workingDirectory, runtimeDesktop);
    }
    const configPath = path.join(home, ".storytree", "desktop.runtime.json");
    assert.deepEqual(JSON.parse(readFileSync(configPath, "utf8")), { path: runtime });
  } finally {
    rmSync(repo, { recursive: true, force: true });
    rmSync(runtime, { recursive: true, force: true });
    rmSync(home, { recursive: true, force: true });
  }
});

test("desktopInstallShortcut --runtime: a DETACHED HEAD NOT pinned to origin/main fails closed (stray commit rejected)", () => {
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
      branchOf: () => "HEAD", // detached, but on a commit outside origin/main's history
      isPinnedToMain: () => false,
      homeDir: home,
    });
    assert.equal(env.ok, false);
    assert.match(env.body, /not pinned to/);
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
    // `register` is injected HERE too, not just on the direct `desktopLaunch` calls above: dispatch
    // is a second route to the same launcher, and without the seam threaded through it this test
    // wrote pid 4242 into the real `~/.storytree/spawns` — a leaked row in the operator's own
    // inventory, reporting desktop work that never ran.
    const { register, calls: registered } = fakeRegister();
    const env = await run(["desktop", "launch"], {
      store,
      desktop: { spawn, repoRoot: dir, platform: "linux", register },
    });
    assert.equal(env.ok, true);
    assert.equal(calls.length, 1);
    assert.equal(calls[0]?.options.cwd, dir);
    assert.equal(registered.length, 1, "dispatch must thread the registrar, not fall back to the real one");
    assert.equal(registered[0]?.pid, 4242);
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
