import test from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { InMemoryStore } from "@storytree/storage-protocol";

import { desktopHelp, desktopLaunch, type DesktopSpawnFn, type SpawnedProcess } from "./desktop.js";
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
});
