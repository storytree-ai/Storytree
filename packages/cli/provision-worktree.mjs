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
//     failed/slow install never breaks the session. Standalone (no `--hook`) it propagates the real exit
//     code so a caller — and the test — can detect an install failure.
//   - SELF-HEALING, not fail-SILENT (the friction this closes): the old hook swallowed a failed install
//     to stderr + exit 0, so an under-provisioned worktree was INVISIBLE — the agent discovered it later
//     as a cryptic `ERR_MODULE_NOT_FOUND 'tsx'` and had to diagnose "fresh worktree, run pnpm install"
//     mid-work. Now: (a) a failed attempt RETRIES once from the warm pnpm store (a truncated install
//     leaves `node_modules/.pnpm` populated, so the retry finishes fast), and (b) if the worktree is
//     STILL unprovisioned, `--hook` EMITS a `SessionStart` `additionalContext` JSON on STDOUT — the one
//     hook channel the agent actually reads — telling it up front to run `pnpm install`. The mid-work
//     rediscovery cost is gone: either it self-heals, or the agent is told before its first tool-call.
//     (Residual: a hard SessionStart TIMEOUT kills this process before it can emit — that case still
//     self-heals on the NEXT session, whose retry runs against a now-warm store.)
//   - CURRENT, not merely PRESENT (the second friction this closes): the original marker asked only
//     "did an install ever COMPLETE here?" (`node_modules/.modules.yaml` exists), so a worktree
//     provisioned once and then reused stayed a no-op forever while `main` moved under it. When a new
//     workspace package or third-party dependency lands and the session merges `main` in, node_modules
//     is now stale against the lockfile it is supposed to satisfy — and the failure surfaces as an
//     OPAQUE error naming the wrong culprit (`TS2307` on a dependency this session never touched,
//     `ERR_MODULE_NOT_FOUND`, `tsc is not recognized`). `lockfileAdvanced` closes that: the install is
//     re-run when the lockfile has moved past the one node_modules was built from. At one or two live
//     worktrees this was a rare annoyance; at the ~49 registered here it is routine.
import { existsSync, readFileSync, realpathSync } from "node:fs";
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
 * pnpm keeps TWO lockfiles: the WANTED one (`pnpm-lock.yaml`, tracked by git — what this checkout now
 * says node_modules should contain) and the CURRENT one (`node_modules/.pnpm/lock.yaml`, pnpm's own
 * byte copy of the lockfile the last COMPLETED install actually ran against). They are the same file
 * on a worktree installed against today's lockfile, and they DIVERGE exactly when the lockfile has
 * advanced underneath a provisioned worktree — the friction this closes.
 *
 * Verified empirically before it was relied on (both halves matter):
 *   - STABLE: across all 39 provisioned worktrees registered on the dev box, wanted == current, byte
 *     for byte. So this does NOT fire spuriously — including on Windows, where a `core.autocrlf`
 *     checkout could in principle have skewed the two (it does not here; the CRLF fold below is belt
 *     and braces, and cannot mask a real dependency change, which alters content and not just newlines).
 *   - CONVERGENT: planting an older lockfile as the current one and running `pnpm install` rewrote it
 *     back to match in ~2 s. A reinstall therefore CLEARS the condition that triggered it — this can
 *     never latch into reinstall-every-session, and a false positive costs about two seconds.
 *
 * FAILS OPEN by construction: a missing/unreadable file on either side returns false (no reinstall).
 * Absence is not evidence of staleness, and an unreadable marker must not be able to spin the hook.
 */
export function lockfileAdvanced(root) {
  const wanted = join(root, "pnpm-lock.yaml");
  const current = join(root, "node_modules", ".pnpm", "lock.yaml");
  if (!existsSync(wanted) || !existsSync(current)) return false;
  try {
    const a = readFileSync(wanted);
    const b = readFileSync(current);
    // Fast path: identical bytes (the overwhelmingly common case) — no string allocation at all.
    if (a.equals(b)) return false;
    // Differ: fold CRLF before calling it an advance, so a line-ending skew alone is never "stale".
    const fold = (/** @type {Buffer} */ buf) => buf.toString("utf8").replace(/\r\n/g, "\n");
    return fold(a) !== fold(b);
  } catch {
    return false;
  }
}

/**
 * Default installer: `pnpm install` at the worktree root, non-interactive. Prefer `pnpm` on PATH;
 * fall back to `corepack pnpm` (corepack ships with Node, reads `packageManager` from package.json) so
 * a worktree whose hook shell lacks the pnpm shim still provisions. Returns `{ ok, code }`; never throws.
 */
export function runPnpmInstall(root) {
  const win = process.platform === "win32";
  // stdin ignored; the child's STDOUT is redirected to our STDERR (fd 2), not inherited. This keeps the
  // hook's OWN stdout pristine — reserved for the `unprovisionedContext` JSON, the one channel the agent
  // reads — so pnpm's progress/errors land in the human log (stderr) and never pollute the agent's
  // context (which would otherwise ingest the entire install dump on every fresh-worktree session).
  const opts = { cwd: root, stdio: ["ignore", 2, 2], env: { ...process.env, COREPACK_ENABLE_DOWNLOAD_PROMPT: "0" } };
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
 * Provision a worktree unless it already is AND is still current. Two conditions call for an install:
 * the worktree is FRESH (no completed install) or STALE (the lockfile advanced past the node_modules
 * that was built from it). Anything else is a no-op fast path (`install` is never called), which is what
 * keeps this safe to run at EVERY SessionStart. A failed attempt RETRIES `retries` more times (default
 * 1) — a truncated install leaves `node_modules/.pnpm` warm, so the retry links fast — before giving up.
 * `install` is injectable so the contract is proven without spawning a real pnpm. Returns a result
 * object; the entry runner decides how to exit AND whether to signal the agent (`unprovisionedContext`).
 *
 * The two paths differ only in their `reason` (and the prose they log/emit), never in what they run: a
 * stale worktree needs exactly the same `pnpm install` a fresh one does. Keeping the reason distinct is
 * what lets the agent-visible signal name the ACTUAL condition instead of the generic one — the whole
 * point of this fix is that the failure used to surface under the wrong culprit's name.
 *
 * @param {{ root?: string, install?: (root: string) => { ok: boolean, code: number }, log?: (msg: string) => void, retries?: number }} [opts]
 */
export function provisionWorktree(opts = {}) {
  const { install = runPnpmInstall, log = () => {}, retries = 1 } = opts;
  const target = opts.root ?? thisWorktreeRoot();
  const fresh = needsProvision(target);
  // Only ask the staleness question when an install DID complete — on a fresh worktree there is no
  // installed state for the lockfile to have advanced past, and `fresh` already forces the install.
  const stale = !fresh && lockfileAdvanced(target);
  if (!fresh && !stale) {
    return { provisioned: false, ok: true, code: 0, reason: "already-provisioned" };
  }
  const condition = fresh
    ? `fresh worktree at ${target}`
    : `worktree at ${target} is STALE — pnpm-lock.yaml has advanced past the node_modules built from it`;
  const attempts = Math.max(1, retries + 1);
  let last = { ok: false, code: 1 };
  for (let i = 1; i <= attempts; i++) {
    log(`[provision-worktree] ${condition} — running pnpm install (attempt ${i}/${attempts})…`);
    last = install(target);
    if (last.ok) {
      log(`[provision-worktree] pnpm install complete — worktree ${fresh ? "ready" : "refreshed"}.`);
      return { provisioned: true, ok: true, code: 0, reason: fresh ? "installed" : "refreshed" };
    }
    if (i < attempts) {
      log(`[provision-worktree] attempt ${i} failed (exit ${last.code}); retrying from the warm store…`);
    }
  }
  log(
    `[provision-worktree] pnpm install FAILED after ${attempts} attempt(s) (exit ${last.code}); ` +
      `signalling the agent to run 'pnpm install' here.`,
  );
  return {
    provisioned: true,
    ok: false,
    code: last.code || 1,
    reason: fresh ? "install-failed" : "refresh-failed",
  };
}

/**
 * The `SessionStart` `additionalContext` payload that tells the AGENT — the one hook output channel it
 * reads (stdout on exit 0; stderr is invisible to it) — that this worktree's dependencies are not usable
 * and how to fix it in one step. Emitted by the `--hook` entry ONLY when the install ultimately failed,
 * so a healthy session stays silent (no context noise). Pure/string-returning so it is unit tested
 * without spawning pnpm or a session.
 *
 * `stale` picks which CONDITION the message names, and that distinction is the point rather than a
 * nicety: the two failures present identically at the tool call (a module that will not resolve) but
 * have different causes, and the stale one is the actively misleading half — it blames a dependency the
 * session never touched. Naming the cause up front is what stops the agent debugging the wrong file.
 *
 * @param {string} root Absolute worktree root, named in the message so the agent runs install in the right place.
 * @param {boolean} [stale] True when node_modules is present but built from an older lockfile.
 */
export function unprovisionedContext(root, stale = false) {
  const symptoms =
    `(Skipping it surfaces later as a cryptic \`ERR_MODULE_NOT_FOUND\`, a \`TS2307\` on a package this ` +
    `session never touched, or \`tsc is not recognized\` — errors that name the wrong culprit.)`;
  const text = stale
    ? `This git worktree's node_modules is STALE: it was installed against an OLDER \`pnpm-lock.yaml\` ` +
      `than the one now checked out here — a new workspace package or third-party dependency landed on ` +
      `\`main\` since this worktree was provisioned — and the automatic refresh (the SessionStart ` +
      `provision hook) did not complete. BEFORE any \`pnpm storytree …\`, \`tsx\`, \`pnpm gate\`, ` +
      `\`pnpm -r\`, or Studio command, run \`pnpm install\` in the worktree root (${root}). It is ` +
      `idempotent and links fast from the warm pnpm store. ${symptoms}`
    : `This git worktree is NOT fully provisioned — its automatic \`pnpm install\` (the SessionStart ` +
      `provision hook) did not complete. BEFORE any \`pnpm storytree …\`, \`tsx\`, \`pnpm gate\`, ` +
      `\`pnpm -r\`, or Studio command, run \`pnpm install\` in the worktree root (${root}). It is ` +
      `idempotent and links fast from the warm pnpm store. ${symptoms}`;
  return JSON.stringify({
    hookSpecificOutput: { hookEventName: "SessionStart", additionalContext: text },
  });
}

/**
 * What the `--hook` entry writes to STDOUT for a provision result: the agent-visible additionalContext
 * when (and only when) the install FAILED in hook mode, else "" — a healthy session and every non-hook
 * invocation stay silent. The result's own `reason` selects which condition the message names, so the
 * caller never has to re-derive staleness. Pure, so the emit gating is unit tested without a session.
 *
 * @param {{ ok: boolean, reason?: string }} result
 * @param {string} root
 * @param {boolean} hookMode
 */
export function hookStdout(result, root, hookMode) {
  if (!hookMode || result.ok) return "";
  return unprovisionedContext(root, result.reason === "refresh-failed");
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
  const target = ri !== -1 ? (argv[ri + 1] ?? thisWorktreeRoot()) : thisWorktreeRoot();
  const res = provisionWorktree({ root: target, log: (m) => process.stderr.write(m + "\n") });
  // The only path the agent sees: when the worktree is STILL unprovisioned, emit the SessionStart
  // additionalContext on STDOUT so it is told up front — never break the session (exit 0 in --hook).
  const out = hookStdout(res, target, hookMode);
  if (out) process.stdout.write(out + "\n");
  process.exit(exitCode(res, hookMode));
}
