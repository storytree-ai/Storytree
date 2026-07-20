#!/usr/bin/env node
// Broken-worktree DETECTOR + REPAIRER — a SessionStart hook that fails LOUD, not open, and
// SELF-HEALS the provable case (friction `session-worktree-never-created-branch-at-main`,
// 2026-07-20; ADR-0033 worktree identity, ADR-0162 SessionStart heads-up injection).
//
// THE BUG THIS CATCHES: a session is assigned `.claude/worktrees/<name>` but that slot is NOT a
// registered git worktree — the branch is checked out at the MAIN repo instead and git resolves the
// slot UP to main. Two variants produce it:
//   - EMPTY husk: the harness pre-created the dir but `git worktree add` fatally refused because the
//     branch was already checked out at main ("fatal: '<branch>' is already used by worktree at
//     '<main>'"), leaving an empty, unregistered dir. Reflog fingerprint (reproduced live 2026-07-20):
//     main shows "checkout: moving from <detached> to claude/<session>" with NO subsequent detach —
//     the harness's create sequence (checkout branch at main → detach → worktree add) died mid-way.
//     THIS VARIANT IS NOW AUTO-REPAIRED — see THE REPAIR below.
//   - POPULATED husk: `git worktree remove` HALF-SUCCEEDED on Windows (worktree-sprawl-cleanup-trap) —
//     it deleted the slot's `.git` file and deregistered it but left the populated dir (node_modules
//     and all). A later session assigned that slot has a full checkout whose git identity resolves to
//     MAIN. `provision-worktree.mjs` sees node_modules and stays silent; this catches it. NOT
//     auto-repaired (merging leftover content is not automatable) — announce + restart.
//
// WHY IT MATTERS — it fails OPEN: `git status`, reads, and CLI reads all succeed against main, so
// nothing looks wrong until the FIRST worktree-identity WRITE (`noticeboard declare --pg` →
// "Identity is derived from the session worktree… run from inside a recognised .claude/worktrees/
// <name>"), typically many tool-calls in, after wasted work and pushing toward risky mid-build git
// surgery. This hook moves that discovery to session start — and, for the empty husk, REMOVES it.
//
// THE REPAIR (the empty-husk self-heal, owner-directed 2026-07-20 "solve this properly"): when the
// fingerprint is provable — the slot is broken AND EMPTY AND the main checkout's HEAD is attached to
// a `claude/*` branch (the harness session namespace; main's resting state in this workflow is
// detached, so a lingering claude/* checkout IS the failed-create residue) — the hook finishes the
// harness's own aborted sequence:
//   1. `git -C <main> checkout --detach`  — frees the branch. Same commit, ZERO working-tree file
//      changes, so it is safe even with a dirty main tree (dirt survives untouched).
//   2. `git -C <main> worktree add <slot> <branch>` — mounts the branch at the slot (git accepts an
//      existing EMPTY dir). On failure, main is checked back out on the branch (leave-as-found).
//   3. Re-classify from the slot; only a `registered` verdict counts as repaired.
// node_modules are then provisioned by `provision-worktree.mjs`, which runs AFTER this hook in
// `.claude/settings.json` — repair first, provision second. Every guard failing → the loud announce.
//
// REACHING THE EMPTY HUSK AT ALL (the fix that makes the repair reachable): a cwd-relative hook
// command (`node packages/cli/worktree-health.mjs`) is INERT in an empty slot — the script isn't
// there (MODULE_NOT_FOUND before any logic). But `git rev-parse --show-toplevel` from the empty slot
// resolves UP to the main checkout — the bug's own fingerprint is the escape hatch — so
// `.claude/settings.json` invokes this script THROUGH git:
//   bash -c 't="$(git rev-parse --show-toplevel 2>/dev/null)" && node "$t/packages/cli/worktree-health.mjs" --hook || true'
// Healthy worktree → $t is the worktree (its own copy runs, as before). Empty husk → $t is MAIN
// (main's copy runs, cwd still the slot). Not a repo at all → `|| true` keeps the hook silent.
//
// Constraints (mirror provision-worktree.mjs): BARE NODE, zero non-builtin deps (may run before
// node_modules exists); FAIL-SAFE — `--hook` forces exit 0 on every path so a broken probe never
// breaks the session; and stdout is reserved for the agent-visible `additionalContext` JSON alone
// (human/diagnostic text → stderr), so a healthy session emits nothing. The repair is also available
// standalone: `node worktree-health.mjs --cwd <slot> --repair` (the doctor stays read-only without it).
import { existsSync, readdirSync, realpathSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import process from "node:process";

/** The harness session-branch namespace — the same load-bearing `claude/` prefix worktree-create.ts
 *  mints and CI recognises. Repair only ever detaches main off a branch in THIS namespace. */
const SESSION_BRANCH_RE = /^claude\//;

/**
 * Normalise a path for identity comparison: absolute, symlink-resolved when it exists, forward-slashed,
 * trailing-slash-stripped, and lower-cased on win32 (where the filesystem is case-insensitive but the
 * git/`process.cwd()` casings can differ). Two paths are the SAME location iff their norms are equal.
 */
export function normPath(p) {
  let r = resolve(p);
  try {
    r = realpathSync.native(r);
  } catch {
    // Path may not exist (e.g. a git-reported root that moved) — resolve() is still a fair comparison key.
  }
  r = r.replace(/\\/g, "/").replace(/\/+$/, "");
  return process.platform === "win32" ? r.toLowerCase() : r;
}

/** True when `a` and `b` denote the same filesystem location (see {@link normPath}). */
export function samePath(a, b) {
  return normPath(a) === normPath(b);
}

/**
 * The slot ROOT `cwd` belongs to — `<mainRoot>/.claude/worktrees/<name>` (normalised) when cwd is
 * that slot or anything under it, else null. The classifier compares git's topLevel against THIS,
 * not against cwd: a SUBDIRECTORY of a healthy registered worktree (e.g. `<slot>/packages/cli`)
 * resolves to the slot root, not to itself — comparing against cwd flagged exactly that shape as a
 * false BROKEN (caught live 2026-07-20 smoking the hook from a worktree subdir).
 */
export function slotRootOf(cwd, mainRoot) {
  const slotsRoot = normPath(join(mainRoot, ".claude", "worktrees")) + "/";
  const n = normPath(cwd);
  if (!n.startsWith(slotsRoot)) return null;
  const name = n.slice(slotsRoot.length).split("/")[0];
  return name === undefined || name === "" ? null : slotsRoot + name;
}

/** True when `cwd` lives inside `<mainRoot>/.claude/worktrees/` — i.e. it is (meant to be) a worktree slot. */
export function isWorktreeSlot(cwd, mainRoot) {
  return slotRootOf(cwd, mainRoot) !== null;
}

/** Run a git query from `cwd`; return trimmed stdout, or null on any failure (git absent, not a repo, error). */
function git(cwd, args) {
  try {
    const res = spawnSync("git", args, { cwd, encoding: "utf8" });
    if (res.status !== 0 || typeof res.stdout !== "string") return null;
    const out = res.stdout.trim();
    return out === "" ? null : out;
  } catch {
    return null;
  }
}

/**
 * Run a git COMMAND (mutation) from `cwd`; unlike {@link git} (query → stdout-or-null), this reports
 * success/failure + stderr so the repair can act on, log, and fall back from a refused step. Never throws.
 * @returns {{ ok: boolean, stdout: string, stderr: string }}
 */
export function gitRun(cwd, args) {
  try {
    const res = spawnSync("git", args, { cwd, encoding: "utf8" });
    return {
      ok: res.status === 0,
      stdout: typeof res.stdout === "string" ? res.stdout.trim() : "",
      stderr: typeof res.stderr === "string" ? res.stderr.trim() : "",
    };
  } catch (err) {
    return { ok: false, stdout: "", stderr: String(err) };
  }
}

/**
 * The git-derived facts a health verdict needs, gathered from `cwd`:
 *   - topLevel: `git rev-parse --show-toplevel` — the working-tree root git resolves cwd to. For a
 *     registered worktree it IS the worktree; for a broken slot it resolves UP to the main checkout.
 *   - mainRoot: the parent of the common git dir (`--git-common-dir`) — always the primary checkout.
 * Returns nulls when cwd is not inside any git repo (both queries fail) — treated as "unknown → healthy".
 */
export function probeGit(cwd) {
  const topLevel = git(cwd, ["rev-parse", "--show-toplevel"]);
  const commonDir = git(cwd, ["rev-parse", "--path-format=absolute", "--git-common-dir"]);
  const mainRoot = commonDir === null ? null : dirname(commonDir);
  return { topLevel, mainRoot };
}

/**
 * PURE health classification (no I/O — every input injected, so the decision is unit-tested without
 * git or a real worktree). A session is UNHEALTHY only when its cwd is a worktree SLOT
 * (`<mainRoot>/.claude/worktrees/<name>`) that git does NOT resolve to itself — the exact broken-slot
 * fingerprint. Every other shape is healthy/none-of-our-business and stays silent:
 *   - unknown        git said nothing (not a repo / git absent) — never break a non-repo session.
 *   - main           cwd IS the primary checkout — a legitimate non-worktree session.
 *   - non-worktree   cwd is elsewhere (a subdir, another checkout) — not a slot, not our concern.
 *   - registered     cwd is in a slot whose ROOT git resolves as the working tree — a real, healthy
 *                    worktree (the slot itself, or any subdirectory of it).
 *   - broken         cwd is in a slot but git resolves PAST the slot root to `topLevel` (main) — the
 *                    failure we announce.
 *
 * @param {{ cwd: string, topLevel: string|null, mainRoot: string|null, hasNodeModules: boolean }} info
 * @returns {{ healthy: boolean, kind: "unknown"|"main"|"non-worktree"|"registered"|"broken",
 *            cwd: string, topLevel: string|null, hasNodeModules: boolean }}
 */
export function classifyWorktreeHealth(info) {
  const { cwd, topLevel, mainRoot, hasNodeModules } = info;
  const base = { cwd, topLevel, hasNodeModules };
  if (topLevel === null || mainRoot === null) return { healthy: true, kind: "unknown", ...base };
  const slotRoot = slotRootOf(cwd, mainRoot);
  if (slotRoot === null) {
    return { healthy: true, kind: samePath(cwd, mainRoot) ? "main" : "non-worktree", ...base };
  }
  if (samePath(slotRoot, topLevel)) return { healthy: true, kind: "registered", ...base };
  return { healthy: false, kind: "broken", ...base };
}

/**
 * PURE repair decision (no I/O — the safety fences, unit-tested without git). Repair is attempted
 * ONLY for the provable empty-husk fingerprint; every other broken shape stays announce-only:
 *   - kind must be "broken"           — never touch a healthy or non-slot session.
 *   - slot must be EMPTY              — the populated husk carries content we must not merge over.
 *   - main HEAD must be ON a branch   — a detached main means no orphaned branch to mount.
 *   - the branch must be `claude/*`   — the harness session namespace; never move main off a human
 *                                       branch (`main`, a feature branch someone is inspecting).
 * The detach step this gates is inherently gentle — same commit, zero working-tree file changes —
 * but the fences keep the repair from firing anywhere its diagnosis isn't certain.
 *
 * @param {{ kind: string, slotEmpty: boolean, mainBranch: string|null }} facts
 * @returns {{ repair: boolean, reason: string }}
 */
export function repairDecision({ kind, slotEmpty, mainBranch }) {
  if (kind !== "broken") return { repair: false, reason: "not-broken" };
  if (!slotEmpty) return { repair: false, reason: "slot-not-empty (populated husk — content must not be merged over)" };
  if (mainBranch === null) return { repair: false, reason: "main-detached (no orphaned session branch to mount)" };
  if (!SESSION_BRANCH_RE.test(mainBranch)) {
    return { repair: false, reason: `main-on-non-session-branch "${mainBranch}" (only claude/* is harness-owned)` };
  }
  return { repair: true, reason: "empty-husk-with-session-branch-at-main" };
}

/**
 * Attempt the empty-husk repair for a broken slot: gather the live facts (slot emptiness, main's
 * HEAD branch), run {@link repairDecision}, and when it approves execute the harness's own aborted
 * sequence — detach main (frees the branch; same commit, working tree untouched), `git worktree add`
 * the branch at the slot, then RE-CLASSIFY with real probes: only a `registered` verdict counts.
 * A failed add checks main back out on the branch (leave-as-found). Never throws.
 *
 * Every I/O is injectable so the orchestration is proven without git: `probe` (git facts), `run`
 * (git mutations), `listDir` (slot emptiness), `check` (the re-classify).
 *
 * @param {string} cwd The slot path.
 * @param {{ kind: string }} verdict The classification that triggered the attempt.
 * @param {{ probe?: typeof probeGit, run?: typeof gitRun, listDir?: (d: string) => string[],
 *           check?: typeof checkWorktree }} [opts]
 * @returns {{ repaired: true, verdict: ReturnType<typeof classifyWorktreeHealth>, branch: string, mainRoot: string }
 *         | { repaired: false, reason: string }}
 */
export function repairBrokenSlot(cwd, verdict, opts = {}) {
  const { probe = probeGit, run = gitRun, listDir = readdirSync, check = checkWorktree } = opts;
  const { mainRoot } = probe(cwd);
  if (mainRoot === null) return { repaired: false, reason: "no-git (cannot locate the main checkout)" };
  const slotRoot = slotRootOf(cwd, mainRoot);
  if (slotRoot === null || !samePath(cwd, slotRoot)) {
    // Repair mounts the branch AT cwd — only ever correct when cwd IS the slot root (an empty
    // subdir of a populated husk would otherwise pass the emptiness fence and be mounted wrongly).
    return { repaired: false, reason: "cwd-is-not-the-slot-root (repair only mounts at the slot itself)" };
  }
  let slotEmpty;
  try {
    slotEmpty = listDir(cwd).length === 0;
  } catch {
    slotEmpty = false; // unreadable slot — treat as populated, never repair blind
  }
  const head = run(mainRoot, ["symbolic-ref", "--short", "-q", "HEAD"]);
  const mainBranch = head.ok && head.stdout !== "" ? head.stdout : null;
  const decision = repairDecision({ kind: verdict.kind, slotEmpty, mainBranch });
  if (!decision.repair) return { repaired: false, reason: decision.reason };

  const branch = /** @type {string} */ (mainBranch);
  const detach = run(mainRoot, ["checkout", "--detach"]);
  if (!detach.ok) return { repaired: false, reason: `detach-failed: ${detach.stderr}` };
  const add = run(mainRoot, ["worktree", "add", cwd, branch]);
  if (!add.ok) {
    run(mainRoot, ["checkout", branch]); // leave-as-found; best-effort, the add error stays the reason
    return { repaired: false, reason: `worktree-add-failed: ${add.stderr}` };
  }
  const after = check(cwd);
  if (after.kind !== "registered") {
    return { repaired: false, reason: `post-repair-classify: ${after.kind} (expected registered)` };
  }
  return { repaired: true, verdict: after, branch, mainRoot };
}

/**
 * The `SessionStart` `additionalContext` payload for a broken slot — the agent-visible heads-up (stdout,
 * `--hook`) naming the slot, where git actually resolves it, and the DO-NOT-build-here remedy. Pure /
 * string-returning so it is unit-tested without a session. Mirrors provision-worktree's
 * `unprovisionedContext` shape (the one channel the agent reads). When auto-repair was considered but
 * declined/failed, `noRepairReason` names why, so the agent (and the human log) see the fence that held.
 *
 * @param {{ cwd: string, topLevel: string|null, hasNodeModules: boolean }} v
 * @param {string|null} [noRepairReason]
 */
export function brokenWorktreeContext(v, noRepairReason = null) {
  const nm = v.hasNodeModules ? "present" : "MISSING";
  const why = noRepairReason === null ? "" : ` Auto-repair was NOT possible here (${noRepairReason}).`;
  const text =
    `BROKEN WORKTREE — this session's directory (${v.cwd}) is a .claude/worktrees/ slot but is NOT a ` +
    `registered git worktree: git resolves it UP to the MAIN checkout (${v.topLevel ?? "unknown"}), and its ` +
    `own node_modules are ${nm}. Provisioning did not create the worktree — most likely 'git worktree add' ` +
    `refused because the branch was already checked out at main (ADR-0033 worktree identity), or a prior ` +
    `'git worktree remove' half-succeeded and left this husk. This fails OPEN: git status, reads and CLI ` +
    `reads all succeed against MAIN, so it would otherwise surface only at your first worktree-identity ` +
    `WRITE. DO NOT build, edit, or run the gate here — writes land in MAIN, worktree-identity writes ` +
    `(e.g. 'storytree noticeboard declare --pg') will FAIL, and the gate's check:declared cannot pass.` +
    why +
    ` Fix: RESTART the session so the harness recreates the worktree cleanly — do NOT attempt mid-build git ` +
    `surgery on the shared main checkout. If it recurs, escalate: the worktree-creation harness is leaving ` +
    `the branch checked out at main.`;
  return JSON.stringify({ hookSpecificOutput: { hookEventName: "SessionStart", additionalContext: text } });
}

/**
 * The `SessionStart` `additionalContext` payload for a REPAIRED slot — tells the agent the husk was
 * healed in place and the session may proceed normally (no restart, no surgery). Pure, unit-tested.
 *
 * @param {{ verdict: { cwd: string }, branch: string, mainRoot: string }} r
 */
export function repairedWorktreeContext(r) {
  const text =
    `WORKTREE AUTO-REPAIRED — this session's slot (${r.verdict.cwd}) was an empty, unregistered ` +
    `.claude/worktrees/ husk: worktree creation had died mid-sequence, leaving session branch ` +
    `${r.branch} checked out at the MAIN checkout (${r.mainRoot}). The SessionStart health hook ` +
    `finished the sequence: main was detached IN PLACE (same commit, its working tree untouched) and ` +
    `${r.branch} is now mounted HERE — this directory is a REGISTERED worktree and your session ` +
    `identity (noticeboard declare, check:declared) is valid. node_modules are provisioned by the ` +
    `provision hook that runs next; if a pnpm/tsx command still fails with ERR_MODULE_NOT_FOUND, run ` +
    `'pnpm install' here once. No other action needed — do NOT restart, do NOT touch the main checkout.`;
  return JSON.stringify({ hookSpecificOutput: { hookEventName: "SessionStart", additionalContext: text } });
}

/**
 * What the entry writes to STDOUT for a verdict: in `--hook` mode, the repaired heads-up after a
 * successful repair, the broken heads-up for an unrepaired broken slot (with the no-repair reason),
 * and "" for a healthy session — every non-hook (doctor) invocation keeps stdout empty. Pure, so the
 * emit gating is unit-tested without a session.
 *
 * @param {{ healthy: boolean, cwd: string, topLevel: string|null, hasNodeModules: boolean }} verdict
 * @param {boolean} hookMode
 * @param {{ verdict: { cwd: string }, branch: string, mainRoot: string } | null} [repaired]
 * @param {string|null} [noRepairReason]
 */
export function hookStdout(verdict, hookMode, repaired = null, noRepairReason = null) {
  if (!hookMode) return "";
  if (repaired !== null) return repairedWorktreeContext(repaired);
  return verdict.healthy ? "" : brokenWorktreeContext(verdict, noRepairReason);
}

/**
 * The process exit code for a verdict. In `--hook` mode ALWAYS 0 — a broken-slot signal must never
 * break the session (it is a heads-up, not a gate). Standalone (the doctor: `node worktree-health.mjs`)
 * a broken verdict exits 1 so a human/script gets a real signal; healthy — including healthy BECAUSE
 * `--repair` just healed it — exits 0.
 *
 * @param {{ healthy: boolean }} verdict
 * @param {boolean} hookMode
 */
export function exitCode(verdict, hookMode) {
  return hookMode ? 0 : verdict.healthy ? 0 : 1;
}

/** A one-line human summary of a verdict for the diagnostic log (stderr in hook mode, stdout for the doctor). */
export function humanSummary(v) {
  if (v.healthy) return `[worktree-health] OK — ${v.kind} checkout at ${v.cwd}.`;
  return (
    `[worktree-health] BROKEN — ${v.cwd} is an unregistered worktree slot; git resolves it to ` +
    `${v.topLevel ?? "unknown"} (main). Its node_modules are ${v.hasNodeModules ? "present" : "MISSING"}. ` +
    `Do NOT build here — restart the session (see the SessionStart heads-up).`
  );
}

/** Gather the live facts for `cwd` and classify. Injectable `probe`/`nodeModules` keep the entry testable. */
export function checkWorktree(cwd, opts = {}) {
  const { probe = probeGit, nodeModules = (d) => existsSync(join(d, "node_modules")) } = opts;
  const { topLevel, mainRoot } = probe(cwd);
  return classifyWorktreeHealth({ cwd, topLevel, mainRoot, hasNodeModules: nodeModules(cwd) });
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
  const repairMode = hookMode || argv.includes("--repair");
  const ci = argv.indexOf("--cwd");
  const cwd = ci !== -1 && argv[ci + 1] ? resolve(argv[ci + 1]) : process.cwd();
  let verdict = checkWorktree(cwd);
  /** @type {{ verdict: ReturnType<typeof classifyWorktreeHealth>, branch: string, mainRoot: string } | null} */
  let repaired = null;
  /** @type {string|null} */
  let noRepairReason = null;
  if (!verdict.healthy && repairMode) {
    const outcome = repairBrokenSlot(cwd, verdict);
    if (outcome.repaired) {
      repaired = outcome;
      verdict = outcome.verdict;
    } else {
      noRepairReason = outcome.reason;
    }
  }
  // Diagnostics → stderr in hook mode (stdout is the agent channel); → stdout for the standalone doctor.
  const diag = hookMode ? process.stderr : process.stdout;
  if (repaired !== null) {
    diag.write(`[worktree-health] REPAIRED — mounted ${repaired.branch} at ${cwd}; main detached in place.\n`);
  } else if (noRepairReason !== null) {
    diag.write(`[worktree-health] auto-repair declined/failed: ${noRepairReason}\n`);
  }
  diag.write(humanSummary(verdict) + "\n");
  const out = hookStdout(verdict, hookMode, repaired, noRepairReason);
  if (out) process.stdout.write(out + "\n");
  process.exit(exitCode(verdict, hookMode));
}
