#!/usr/bin/env node
// Cross-platform launcher for Storytree's ambient Codex hooks.
//
// Codex Desktop invokes project hooks directly on Windows, where `bash` is not
// necessarily on PATH. This bare-Node shim preserves the existing hook contract:
// use the worktree's installed tsx when possible, otherwise borrow the primary
// checkout's installation, and always fail silent with exit code zero.
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const mode = process.argv[2];

function gitPath(...args) {
  try {
    const result = spawnSync("git", args, {
      cwd: process.cwd(),
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      windowsHide: true,
    });
    return result.status === 0 ? result.stdout.trim() : "";
  } catch {
    return "";
  }
}

function runtimeAt(root) {
  const tsx = join(root, "packages", "cli", "node_modules", "tsx", "dist", "cli.mjs");
  const entry = join(root, "packages", "cli", "src", "ambient-presence-entry.ts");
  return existsSync(tsx) && existsSync(entry) ? { tsx, entry } : null;
}

function findRuntime() {
  const worktree = gitPath("rev-parse", "--show-toplevel");
  if (worktree) {
    const local = runtimeAt(resolve(worktree));
    if (local) return local;
  }

  const commonDir = gitPath("rev-parse", "--path-format=absolute", "--git-common-dir");
  return commonDir ? runtimeAt(resolve(dirname(commonDir))) : null;
}

try {
  if (mode !== "start" && mode !== "sweep") process.exit(0);

  const runtime = findRuntime();
  if (!runtime) process.exit(0);

  spawnSync(process.execPath, [runtime.tsx, runtime.entry, mode], {
    cwd: process.cwd(),
    stdio: mode === "start" ? ["ignore", "inherit", "ignore"] : "ignore",
    timeout: 20_000,
    windowsHide: true,
  });
} catch {
  // Ambient failures never block or add noise to a session.
}

process.exit(0);
