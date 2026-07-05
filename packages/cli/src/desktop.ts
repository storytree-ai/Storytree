/**
 * `storytree desktop` — launch the Electron desktop client (ADR-0109/0111).
 *
 * `desktop launch` is a thin wrapper around the EXISTING per-app launcher (`pnpm --filter desktop
 * start` — the canonical entrypoint `surface-coverage-gate.ts`'s `PER_APP_ENTRYPOINTS` already
 * names, ADR-0154). It does not reimplement the build+launch pipeline (esbuild the electron
 * main/preload, then `electron .`) — it spawns that SAME command DETACHED (mirroring
 * `scripts/studio.mjs`'s detached-launch pattern for the studio dev server), so invoking it from an
 * agent session or a script returns immediately instead of blocking on the long-running GUI
 * process. `platformShellCommand` (the house win32 `pnpm` rewrap, `@storytree/orchestrator`) keeps
 * the spawned command correct cross-platform.
 */
import { spawn as nodeSpawn } from "node:child_process";
import { closeSync, existsSync, openSync, writeSync } from "node:fs";
import path from "node:path";

import { platformShellCommand, type ShellCommand } from "@storytree/orchestrator";

import type { Envelope } from "./envelope.js";

/** The slice of a spawned child process this command touches — injectable for tests. */
export interface SpawnedProcess {
  readonly pid: number | undefined;
  unref(): void;
}

/** The slice of node:child_process's `spawn` this command touches — injectable for tests. */
export type DesktopSpawnFn = (
  command: string,
  args: readonly string[],
  options: {
    cwd: string | undefined;
    detached: boolean;
    windowsHide: boolean;
    stdio: readonly [string, number, number];
  },
) => SpawnedProcess;

export interface DesktopLaunchDeps {
  /** The repo root (apps/desktop lives under it). Defaults to the real repo root. */
  readonly repoRoot: string;
  /** Injected spawn — defaults to node:child_process's real spawn. */
  readonly spawn?: DesktopSpawnFn;
  /** Injected platform (the win32 `pnpm` rewrap seam) — defaults to `process.platform`. */
  readonly platform?: NodeJS.Platform;
}

export function desktopHelp(): Envelope {
  return {
    ok: true,
    body: [
      "storytree desktop — launch the Electron desktop client (ADR-0109/0111).",
      "",
      "  storytree desktop launch   build + open the Electron app, detached (log: apps/desktop/.desktop.log)",
      "",
      "a thin wrapper around the existing per-app launcher (`pnpm --filter desktop start`) — same",
      "build+launch pipeline, just detached so it doesn't block the invoking shell/session.",
    ].join("\n"),
    next: ["storytree desktop launch"],
  };
}

/**
 * `storytree desktop launch` — spawn the existing `pnpm --filter desktop start` launcher DETACHED
 * and report back immediately. Never blocks: the Electron app (and its `build:electron` esbuild
 * step) runs in a background process group, stdout/stderr appended to a log file the operator can
 * tail if the window doesn't appear (e.g. a missing `pnpm install` in a fresh worktree, or a missing
 * `apps/studio/dist` — the desktop client serves the COMPILED studio bundle, built separately).
 */
export function desktopLaunch(deps: DesktopLaunchDeps): Envelope {
  const desktopDir = path.join(deps.repoRoot, "apps", "desktop");
  if (!existsSync(desktopDir)) {
    return {
      ok: false,
      body: `no apps/desktop under ${deps.repoRoot} — is this the storytree repo root?`,
      next: [],
    };
  }

  const cmd: ShellCommand = { file: "pnpm", args: ["--filter", "desktop", "start"], cwd: deps.repoRoot };
  const { file, args, cwd } = platformShellCommand(cmd, deps.platform ?? process.platform);

  const logFile = path.join(desktopDir, ".desktop.log");
  const logFd = openSync(logFile, "a");
  writeSync(logFd, `\n--- desktop launch ${new Date().toISOString()} — ${[file, ...args].join(" ")} ---\n`);
  const spawnFn = deps.spawn ?? (nodeSpawn as unknown as DesktopSpawnFn);
  const child = spawnFn(file, args, {
    cwd,
    detached: true,
    windowsHide: true,
    stdio: ["ignore", logFd, logFd],
  });
  closeSync(logFd);
  child.unref();

  return {
    ok: true,
    body: [
      `launched the desktop app, detached (pid ${child.pid ?? "?"}) — building then opening the Electron window.`,
      `log: ${path.relative(deps.repoRoot, logFile)}`,
      "if apps/studio/dist is missing (a fresh worktree), build it first: pnpm --filter studio build",
    ].join("\n"),
    next: [],
  };
}
