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
import { execFileSync, spawn as nodeSpawn } from "node:child_process";
import { closeSync, existsSync, openSync, readFileSync, rmSync, writeFileSync, writeSync } from "node:fs";
import { tmpdir } from "node:os";
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
      "storytree desktop — launch + install the Electron desktop client (ADR-0109/0111).",
      "",
      "  storytree desktop launch            build + open the Electron app, detached (log: apps/desktop/.desktop.log)",
      "  storytree desktop install-shortcut  create a Desktop + Start Menu shortcut (Windows only) that opens",
      "                                      the app with NO console window and the storytree icon; re-runnable",
      "",
      "`launch` is a thin wrapper around the existing per-app launcher (`pnpm --filter desktop start`) — same",
      "build+launch pipeline, just detached so it doesn't block the invoking shell/session. `install-shortcut`",
      "points a real Windows .lnk straight at electron.exe, so double-clicking it never opens a background shell.",
    ].join("\n"),
    next: ["storytree desktop launch", "storytree desktop install-shortcut"],
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

// ---------------------------------------------------------------------------
// `storytree desktop install-shortcut` — a reproducible Windows shortcut
// ---------------------------------------------------------------------------
//
// WHY this exists: the old desktop shortcut was a hand-made .lnk that nothing regenerated, so once it
// was lost (a OneDrive sync, a stale worktree target) it was gone for good — and because it launched
// the app through `pnpm`/`node`, a console (conhost) window rode along for the app's whole life. This
// command makes the shortcut a REPRODUCIBLE artifact: re-run it any time to (re)create a Desktop +
// Start Menu .lnk that points STRAIGHT at electron.exe — a Windows GUI-subsystem binary that allocates
// no console — with the committed storytree icon. Idempotent; overwrites an existing shortcut.

/** One shortcut to write — a folder + the WScript.Shell fields. Injectable so tests never touch the shell. */
export interface ShortcutRequest {
  /** A `System.Environment.SpecialFolder` name the writer resolves (respects OneDrive redirection). */
  readonly folder: "Desktop" | "Programs";
  readonly name: string;
  readonly targetPath: string;
  readonly arguments: string;
  readonly workingDirectory: string;
  readonly iconLocation: string;
  readonly description: string;
}

/** Writes the .lnk files and returns their resolved absolute paths. Injected for tests. */
export type CreateShortcutsFn = (requests: readonly ShortcutRequest[]) => string[];

/** Resolves the Electron binary under a checkout's apps/desktop, or null if absent. Injected for tests. */
export type ResolveElectronFn = (desktopDir: string) => string | null;

export interface DesktopInstallShortcutDeps {
  /** The repo root (apps/desktop lives under it). */
  readonly repoRoot: string;
  /** Injected platform (the win32 guard) — defaults to `process.platform`. */
  readonly platform?: NodeJS.Platform;
  /** Injected .lnk writer — defaults to the real PowerShell/WScript.Shell impl. */
  readonly createShortcuts?: CreateShortcutsFn;
  /** Injected Electron-binary resolver — defaults to probing apps/desktop/node_modules/electron. */
  readonly resolveElectron?: ResolveElectronFn;
}

/**
 * Resolve the Electron executable under `<desktopDir>/node_modules/electron`, mirroring electron's own
 * `index.js` (it reads `path.txt`, a path relative to the package root, e.g. `dist\electron.exe`). We
 * target the app-local symlink path rather than the versioned pnpm-store path so it stays valid across
 * Electron version bumps. Returns null when the binary isn't installed yet (a fresh worktree).
 */
function defaultResolveElectron(desktopDir: string): string | null {
  const electronPkg = path.join(desktopDir, "node_modules", "electron");
  const candidates: string[] = [];
  const pathTxt = path.join(electronPkg, "path.txt");
  if (existsSync(pathTxt)) {
    try {
      const rel = readFileSync(pathTxt, "utf8").trim();
      if (rel) candidates.push(path.join(electronPkg, rel));
    } catch {
      /* fall through to the fixed candidate */
    }
  }
  candidates.push(path.join(electronPkg, "dist", "electron.exe"));
  return candidates.find((c) => existsSync(c)) ?? null;
}

/** Single-quote a value for a PowerShell literal string (doubling embedded single quotes). */
function psSingleQuote(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

/**
 * The real shortcut writer: generate a temp .ps1 that drives `WScript.Shell.CreateShortcut` and run it
 * under `powershell`. The script resolves each destination via `[Environment]::GetFolderPath(...)` so
 * a OneDrive-redirected Desktop/Start Menu is honoured, and echoes each written path back on stdout.
 */
function defaultCreateShortcuts(requests: readonly ShortcutRequest[]): string[] {
  const lines: string[] = [
    "$ErrorActionPreference = 'Stop'",
    "$ws = New-Object -ComObject WScript.Shell",
  ];
  for (const r of requests) {
    lines.push(
      `$dir = [Environment]::GetFolderPath(${psSingleQuote(r.folder)})`,
      "if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }",
      `$lnk = Join-Path $dir ${psSingleQuote(r.name)}`,
      "$s = $ws.CreateShortcut($lnk)",
      `$s.TargetPath = ${psSingleQuote(r.targetPath)}`,
      `$s.Arguments = ${psSingleQuote(r.arguments)}`,
      `$s.WorkingDirectory = ${psSingleQuote(r.workingDirectory)}`,
      `$s.IconLocation = ${psSingleQuote(r.iconLocation)}`,
      `$s.Description = ${psSingleQuote(r.description)}`,
      "$s.Save()",
      "Write-Output $lnk",
    );
  }
  const scriptPath = path.join(tmpdir(), `storytree-install-shortcut-${process.pid}.ps1`);
  // Lead with a UTF-8 BOM (U+FEFF, bytes EF BB BF). Windows PowerShell 5.1 otherwise reads a BOM-less
  // file as ANSI and mojibakes any non-ASCII byte -- which would corrupt a checkout path containing
  // Unicode. The BOM makes both PowerShell 5.1 and 7 decode the script as UTF-8. (See the Windows
  // dev-env trap: PS 5.1 mojibakes UTF-8 without a BOM.)
  writeFileSync(scriptPath, "\uFEFF" + lines.join("\r\n"), "utf8");
  try {
    const out = execFileSync(
      "powershell",
      ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", scriptPath],
      { encoding: "utf8" },
    );
    return out
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
  } finally {
    try {
      rmSync(scriptPath, { force: true });
    } catch {
      /* best-effort cleanup of the temp script */
    }
  }
}

/**
 * `storytree desktop install-shortcut` — (re)create the Desktop + Start Menu shortcut. Windows-only:
 * it writes a native .lnk pointing directly at electron.exe (so no console window ever appears) with
 * the committed app icon. Safe to re-run — it's how you recover the shortcut after it goes missing.
 */
export function desktopInstallShortcut(deps: DesktopInstallShortcutDeps): Envelope {
  const platform = deps.platform ?? process.platform;
  if (platform !== "win32") {
    return {
      ok: false,
      body: [
        "storytree desktop install-shortcut is Windows-only — it writes a Windows .lnk via the shell.",
        `this platform is ${platform}. (on macOS the packaged .app is the shortcut; on Linux, a .desktop entry.)`,
      ].join("\n"),
      next: ["storytree desktop launch"],
    };
  }

  const desktopDir = path.join(deps.repoRoot, "apps", "desktop");
  if (!existsSync(desktopDir)) {
    return {
      ok: false,
      body: `no apps/desktop under ${deps.repoRoot} — is this the storytree repo root?`,
      next: [],
    };
  }

  const resolveElectron = deps.resolveElectron ?? defaultResolveElectron;
  const electronExe = resolveElectron(desktopDir);
  if (electronExe === null) {
    return {
      ok: false,
      body: [
        "couldn't find the Electron binary under apps/desktop/node_modules/electron.",
        "run `pnpm install` in this checkout first, then re-run install-shortcut.",
      ].join("\n"),
      next: ["pnpm install", "storytree desktop install-shortcut"],
    };
  }

  const iconPath = path.join(desktopDir, "build", "icon.ico");
  const iconMissing = !existsSync(iconPath);
  const builtMainMissing = !existsSync(path.join(desktopDir, "dist", "main.cjs"));

  // The shortcut launches electron.exe DIRECTLY with the app dir as its argument. electron.exe is a
  // GUI-subsystem binary, so Windows allocates no console for it (nor for the tsx sidecar it spawns
  // with piped stdio) — that is the whole fix for the "background shell" that rode along with the old
  // pnpm/node launch chain. WorkingDirectory anchors relative lookups (the compiled studio bundle).
  const request = (folder: "Desktop" | "Programs"): ShortcutRequest => ({
    folder,
    name: "storytree.lnk",
    targetPath: electronExe,
    arguments: `"${desktopDir}"`,
    workingDirectory: desktopDir,
    iconLocation: iconMissing ? electronExe : iconPath,
    description: "storytree — grow software as a living tree of stories",
  });

  const createShortcuts = deps.createShortcuts ?? defaultCreateShortcuts;
  let written: string[];
  try {
    written = createShortcuts([request("Desktop"), request("Programs")]);
  } catch (err) {
    return {
      ok: false,
      body: `failed to write the shortcut(s): ${err instanceof Error ? err.message : String(err)}`,
      next: [],
    };
  }

  const body = [
    "installed the storytree desktop shortcut (Desktop + Start Menu):",
    ...written.map((p) => `  ${p}`),
    "",
    "it opens Electron directly — NO background console window — with the storytree icon.",
    "re-run this any time the shortcut goes missing (a OneDrive sync, a cleaned worktree); it's idempotent.",
    "the shortcut runs the LAST-BUILT app; after pulling code, rebuild once (`pnpm --filter desktop start`)",
    "or use the in-app update banner.",
  ];
  if (builtMainMissing) {
    body.push(
      "",
      "note: apps/desktop/dist/main.cjs isn't built yet — run `pnpm --filter desktop start` once so the",
      "shortcut has something to open (it also builds the Electron main).",
    );
  }
  if (iconMissing) {
    body.push(
      "",
      `note: ${path.relative(deps.repoRoot, iconPath)} was missing — used the Electron icon as a fallback.`,
    );
  }
  return { ok: true, body: body.join("\n"), next: [] };
}
