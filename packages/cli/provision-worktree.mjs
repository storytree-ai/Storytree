#!/usr/bin/env node
// Fresh-worktree pre-provisioner (ADR-0162 inc 3 — BOOT: kill the mid-onboarding `pnpm install`).
//
// A git worktree created under `.claude/worktrees/<name>` has NO node_modules of its own, so the
// gate / `pnpm storytree …` / tsx all fail until someone runs `pnpm install` in it — a mandatory
// +15–35 s tax on the ~1-in-5 sessions that start fresh (ADR-0162 Context §3). Historically the
// agent discovered that failure MID-work: a tool-call fails, it reads the error, runs install, waits.
// This script moves that install to a SessionStart hook (`.claude/settings.json`) so the worktree is
// ready BEFORE first use — off the agent's onboarding tool-call path entirely.
//
// Constraints that shape it:
//   - BARE NODE, ZERO non-builtin deps — it runs BEFORE node_modules exists, so it cannot use tsx or
//     import any @storytree/* package (mirrors `scripts/check-manifest.mjs`, not `launch.mjs`).
//   - IDEMPOTENT + fast-path — a provisioned worktree is a near-zero no-op, so it is safe to run at
//     EVERY SessionStart (the primary checkout + reused worktrees, ~80 % of sessions, pay nothing).
//   - FAIL-SAFE as a hook — `--hook` forces exit 0 on every path (the presence-hook.sh contract), so a
//     failed/slow install never breaks the session; the agent falls back to a manual `pnpm install`
//     exactly as today. Standalone (no `--hook`) it propagates the real exit code so a caller — and the
//     test — can detect an install failure.
import { existsSync, realpathSync } from "node:fs";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import process from "node:process";

/**
 * The worktree that physically CONTAINS this file (`../../` from `packages/cli/`), derived from
 * `import.meta.url` so it is correct regardless of the caller's cwd — the SessionStart hook, a manual
 * `node packages/cli/provision-worktree.mjs`, or an invocation from a subdirectory all resolve the
 * same root. This is exactly the worktree we want provisioned.
 */
export function thisWorktreeRoot() {
  return resolve(fileURLToPath(new URL("../../", import.meta.url)));
}

/**
 * pnpm writes `node_modules/.modules.yaml` only when an install COMPLETES; its presence is the
 * "this worktree is provisioned" marker. Absence means either a brand-new worktree (no node_modules
 * at all) or an install killed mid-flight (e.g. by the hook timeout) — both correctly re-provision, so
 * a truncated install self-heals on the next session. We check the worktree's OWN node_modules, never
 * the primary checkout's that Node module-resolution would otherwise walk up into.
 */
export function needsProvision(root) {
  return !existsSync(join(root, "node_modules", ".modules.yaml"));
}

/**
 * Default installer: `pnpm install` at the worktree root, non-interactive. Prefer `pnpm` on PATH;
 * fall back to `corepack pnpm` (corepack ships with Node, reads `packageManager` from package.json) so
 * a worktree whose hook shell lacks the pnpm shim still provisions. Returns `{ ok, code }`; never throws.
 */
export function runPnpmInstall(root) {
  const win = process.platform === "win32";
  const opts = { cwd: root, stdio: "inherit", env: { ...process.env, COREPACK_ENABLE_DOWNLOAD_PROMPT: "0" } };
  // Windows resolves the `pnpm.cmd` / `corepack.cmd` shims only through a shell. Pass each command as a
  // single STATIC string (no interpolation, so shell:true carries no injection surface) — that also
  // avoids Node's DEP0190 warning, which only fires for an args-array combined with shell:true. POSIX
  // spawns the binary directly, no shell. The commands are literals, so the split is safe.
  const run = win
    ? (cmd) => spawnSync(cmd, { ...opts, shell: true })
    : (cmd) => {
        const [bin, ...a] = cmd.split(" ");
        return spawnSync(bin, a, opts);
      };
  let res = run("pnpm install");
  if (res.error && /** @type {NodeJS.ErrnoException} */ (res.error).code === "ENOENT") {
    res = run("corepack pnpm install");
  }
  if (res.error) return { ok: false, code: typeof res.status === "number" ? res.status : 1 };
  return { ok: res.status === 0, code: res.status ?? 1 };
}

/**
 * Provision a worktree unless it already is. Idempotent: a provisioned root is a no-op fast path
 * (`install` is never called). `install` is injectable so the contract is proven without spawning a
 * real pnpm. Returns a result object; the entry runner decides how to exit.
 *
 * @param {{ root?: string, install?: (root: string) => { ok: boolean, code: number }, log?: (msg: string) => void }} [opts]
 */
export function provisionWorktree(opts = {}) {
  const { install = runPnpmInstall, log = () => {} } = opts;
  const target = opts.root ?? thisWorktreeRoot();
  if (!needsProvision(target)) {
    return { provisioned: false, ok: true, code: 0, reason: "already-provisioned" };
  }
  log(`[provision-worktree] fresh worktree at ${target} — running pnpm install (one-time)…`);
  const r = install(target);
  if (r.ok) {
    log("[provision-worktree] pnpm install complete — worktree ready.");
    return { provisioned: true, ok: true, code: 0, reason: "installed" };
  }
  log(`[provision-worktree] pnpm install FAILED (exit ${r.code}); run 'pnpm install' here manually.`);
  return { provisioned: true, ok: false, code: r.code || 1, reason: "install-failed" };
}

/**
 * The process exit code for a provision result. In `--hook` mode ALWAYS 0 — a slow/failed install
 * must never break the session (presence-hook.sh's always-exit-0 contract); the agent falls back to a
 * manual `pnpm install`. Standalone, the real code propagates so an install failure is detectable.
 *
 * @param {{ code: number }} result
 * @param {boolean} hookMode
 */
export function exitCode(result, hookMode) {
  return hookMode ? 0 : result.code;
}

/** True when this module is the process entry (invoked directly), false when imported (e.g. the test). */
function isEntry() {
  if (!process.argv[1]) return false;
  try {
    return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

if (isEntry()) {
  const argv = process.argv.slice(2);
  const hookMode = argv.includes("--hook");
  const ri = argv.indexOf("--root");
  const root = ri !== -1 ? argv[ri + 1] : undefined;
  const res = provisionWorktree({ root, log: (m) => process.stderr.write(m + "\n") });
  process.exit(exitCode(res, hookMode));
}
