// The fresh-worktree install: run at every session start (.claude/settings.json and
// .codex/hooks.json), it gives a 0.3 worktree that cannot run its own code a `pnpm install`, retried
// once, and tells the agent plainly if it still cannot. Ported from storytree 0.2's
// packages/cli/provision-worktree.mjs (ADR-0636 D1, b4 folded into b5; ADR-0633 D2).
//
// Three conditions call for an install, and each is named in what the agent is told, because all
// three look the same at the first tool call (a module that will not resolve) and have different
// causes:
//   - FRESH: no install ever completed here. pnpm writes node_modules/.modules.yaml only when an
//     install completes, so an install killed midway is fresh too, and heals next session.
//   - STALE: pnpm-lock.yaml has moved past the lockfile the last install ran against, which pnpm
//     keeps as node_modules/.pnpm/lock.yaml. It happens when main is merged in after a dependency
//     landed, and the error it causes blames a package this session never touched.
//   - UNLINKED: an install reported success but no workspace package got a node_modules of its own
//     (0.2 met this: "Already up to date", exit 0, and nothing could run). The root's node_modules
//     holds no .bin in a pnpm workspace even when healthy, so the packages are where to look.
// Anything else is left alone at no cost, so the hook is safe to run at every session start.
//
// It runs before node_modules exists, so it uses Node built-ins only. With --hook it always exits 0
// (a failed install must never break the session) and writes to stdout only the heads-up for the
// agent, as SessionStart additionalContext; pnpm's own output goes to stderr.
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, realpathSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const WORKSPACE_GROUPS = ["packages", "apps"];

/** Which condition calls for an install, or undefined when the worktree is installed and current. */
function conditionOf(root) {
  const modules = path.join(root, "node_modules");
  if (!existsSync(path.join(modules, ".modules.yaml"))) return "fresh";
  if (lockfileAdvanced(root)) return "stale";
  if (unlinked(root)) return "unlinked";
  return undefined;
}

/** True when pnpm-lock.yaml differs from the one the last install ran against. Unreadable is not stale. */
function lockfileAdvanced(root) {
  try {
    const wanted = readFileSync(path.join(root, "pnpm-lock.yaml"), "utf8");
    const installed = readFileSync(path.join(root, "node_modules", ".pnpm", "lock.yaml"), "utf8");
    const fold = (text) => text.replace(/\r\n/g, "\n");
    return fold(wanted) !== fold(installed);
  } catch {
    return false;
  }
}

/** True when the workspace has packages and not one of them has its own node_modules. */
function unlinked(root) {
  let packages = 0;
  for (const group of WORKSPACE_GROUPS) {
    let entries;
    try {
      entries = readdirSync(path.join(root, group), { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const pkg = path.join(root, group, entry.name);
      if (!entry.isDirectory() || !existsSync(path.join(pkg, "package.json"))) continue;
      packages++;
      if (existsSync(path.join(pkg, "node_modules"))) return false;
    }
  }
  return packages > 0;
}

/** `pnpm install` in root, falling back to `corepack pnpm`. Never throws. */
export function pnpmInstall(root) {
  const options = { cwd: root, stdio: ["ignore", 2, 2], env: { ...process.env, COREPACK_ENABLE_DOWNLOAD_PROMPT: "0" } };
  // Windows finds the pnpm.cmd and corepack.cmd shims only through a shell; the commands are fixed
  // strings, so the shell is given nothing from outside.
  const run =
    process.platform === "win32"
      ? (command) => spawnSync(command, { ...options, shell: true })
      : (command) => spawnSync(command.split(" ")[0], command.split(" ").slice(1), options);
  let result = run("pnpm install");
  if (result.error?.code === "ENOENT") result = run("corepack pnpm install");
  return { ok: !result.error && result.status === 0, code: result.status ?? 1 };
}

/**
 * Install root's dependencies if it is fresh, stale or unlinked, trying `retries` more times after a
 * failure (a failed install leaves the store warm, so the retry is quick).
 * @returns {{ ok: boolean, condition?: "fresh" | "stale" | "unlinked", code: number }}
 */
export function provision({ root = repoRoot, install = pnpmInstall, retries = 1, log = () => {} } = {}) {
  const condition = conditionOf(root);
  if (condition === undefined) return { ok: true, code: 0 };
  const attempts = retries + 1;
  let last = { ok: false, code: 1 };
  for (let attempt = 1; attempt <= attempts; attempt++) {
    log(`provision-worktree: ${condition} worktree at ${root}; pnpm install (attempt ${attempt} of ${attempts})`);
    last = install(root);
    if (last.ok) return { ok: true, condition, code: 0 };
  }
  log(`provision-worktree: pnpm install failed ${attempts} times (exit ${last.code})`);
  return { ok: false, condition, code: last.code || 1 };
}

const WHAT_HAPPENED = {
  fresh: "is FRESH: no pnpm install has completed in it, and the automatic one at session start failed",
  stale:
    "is STALE: pnpm-lock.yaml has moved past the one its node_modules was installed from (a dependency " +
    "landed on main since), and the automatic refresh at session start failed",
  unlinked:
    "is UNLINKED: a pnpm install reported success but linked no workspace package, and the automatic " +
    'reinstall at session start failed. A later install may again print "Already up to date"; check ' +
    "that the packages have a node_modules afterwards",
};

/** What the hook writes to stdout for a result: the agent's heads-up when the install failed, else "". */
export function hookOutput(result, root) {
  if (result.ok) return "";
  const additionalContext =
    `This worktree (${root}) ${WHAT_HAPPENED[result.condition]}. Run \`pnpm install\` in ${root} before ` +
    "any pnpm, tsx or test command: until then they fail with errors such as ERR_MODULE_NOT_FOUND or " +
    "TS2307 that name the wrong cause.";
  return JSON.stringify({ hookSpecificOutput: { hookEventName: "SessionStart", additionalContext } });
}

function isEntry() {
  try {
    return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

if (isEntry()) {
  const args = process.argv.slice(2);
  const hook = args.includes("--hook");
  const at = args.indexOf("--root");
  const root = at === -1 ? repoRoot : path.resolve(args[at + 1]);
  const result = provision({ root, log: (line) => process.stderr.write(`${line}\n`) });
  const output = hook ? hookOutput(result, root) : "";
  if (output) process.stdout.write(`${output}\n`);
  process.exitCode = hook ? 0 : result.code;
}
