// Contract for the broken-worktree detector (`packages/cli/worktree-health.mjs`) — the SessionStart
// hook that fails LOUD when the session's `.claude/worktrees/` slot is not a registered git worktree
// (friction `session-worktree-never-created-branch-at-main`; ADR-0033 identity, ADR-0162 heads-up).
//
// The classification is PURE (every git/fs fact injected), so the broken-slot decision — the whole
// point — is proven WITHOUT a real broken worktree or git. One entry spawn proves the wiring:
// `--cwd <main>` (a non-slot cwd) is healthy and stays silent.
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  normPath,
  samePath,
  isWorktreeSlot,
  classifyWorktreeHealth,
  brokenWorktreeContext,
  slotRootOf,
  repairDecision,
  repairBrokenSlot,
  repairedWorktreeContext,
  hookStdout,
  exitCode,
  checkWorktree,
} from "../worktree-health.mjs";

const SCRIPT = fileURLToPath(new URL("../worktree-health.mjs", import.meta.url));
const MAIN = "/repo/storytree";
const SLOT = "/repo/storytree/.claude/worktrees/mystifying-mestorf";

/** Build the classifier input for a cwd, defaulting the surrounding facts to a healthy main-rooted repo. */
function facts(over: Partial<Parameters<typeof classifyWorktreeHealth>[0]>) {
  return classifyWorktreeHealth({
    cwd: MAIN,
    topLevel: MAIN,
    mainRoot: MAIN,
    hasNodeModules: true,
    ...over,
  });
}

test("samePath / normPath: separators and (win32) case fold to one identity key", () => {
  assert.equal(samePath("/a/b/", "/a/b"), true, "trailing slash is irrelevant");
  assert.equal(samePath("/a/b", "/a/c"), false, "different paths differ");
});

test("isWorktreeSlot: only paths under <main>/.claude/worktrees/ are slots", () => {
  assert.equal(isWorktreeSlot(SLOT, MAIN), true);
  assert.equal(isWorktreeSlot(MAIN, MAIN), false, "the main checkout is not a slot");
  assert.equal(isWorktreeSlot("/repo/storytree/apps/studio", MAIN), false, "a normal subdir is not a slot");
});

test("classify: a registered worktree (git resolves the slot to itself) is healthy", () => {
  const v = facts({ cwd: SLOT, topLevel: SLOT });
  assert.equal(v.healthy, true);
  assert.equal(v.kind, "registered");
});

test("classify: the main checkout is healthy (main kind)", () => {
  const v = facts({ cwd: MAIN, topLevel: MAIN });
  assert.equal(v.healthy, true);
  assert.equal(v.kind, "main");
});

test("classify: a non-slot subdir is healthy (never a false alarm)", () => {
  const sub = "/repo/storytree/apps/studio";
  const v = facts({ cwd: sub, topLevel: MAIN });
  assert.equal(v.healthy, true);
  assert.equal(v.kind, "non-worktree", "a subdir resolving up to main is NOT flagged — only slots are");
});

test("slotRootOf: the slot itself and its subdirs map to the slot root; main and its subdirs to null", () => {
  const root = slotRootOf(SLOT, MAIN);
  assert.notEqual(root, null, "the slot root maps to itself");
  assert.equal(slotRootOf(`${SLOT}/packages/cli`, MAIN), root, "a slot SUBDIR maps to its slot root");
  assert.equal(slotRootOf(MAIN, MAIN), null, "main is not in a slot");
  assert.equal(slotRootOf(`${MAIN}/.claude/worktrees`, MAIN), null, "the slots dir itself is not a slot");
  assert.equal(slotRootOf(`${MAIN}/apps/studio`, MAIN), null, "a main subdir is not in a slot");
});

test("classify: a SUBDIR of a registered worktree is healthy — comparing topLevel to cwd was a false BROKEN", () => {
  // git resolves `<slot>/packages/cli` to the SLOT (its worktree root), never to the subdir itself;
  // the classifier must compare topLevel against the slot ROOT (caught live 2026-07-20).
  const v = facts({ cwd: `${SLOT}/packages/cli`, topLevel: SLOT });
  assert.equal(v.healthy, true, "a healthy worktree's subdir must never announce BROKEN");
  assert.equal(v.kind, "registered");
});

test("classify: a SUBDIR of a broken husk is still BROKEN (git resolves past the slot root to main)", () => {
  const v = facts({ cwd: `${SLOT}/leftover`, topLevel: MAIN, hasNodeModules: false });
  assert.equal(v.healthy, false);
  assert.equal(v.kind, "broken");
});

test("classify: a slot git resolves UP to main is BROKEN (the caught bug)", () => {
  const v = facts({ cwd: SLOT, topLevel: MAIN, hasNodeModules: false });
  assert.equal(v.healthy, false);
  assert.equal(v.kind, "broken");
  assert.equal(v.topLevel, MAIN, "the verdict carries where git actually resolved — main");
});

test("classify: a POPULATED broken slot (node_modules present) is still BROKEN — provision would miss it", () => {
  const v = facts({ cwd: SLOT, topLevel: MAIN, hasNodeModules: true });
  assert.equal(v.healthy, false, "node_modules present must NOT mask a broken git identity");
  assert.equal(v.kind, "broken");
});

test("classify: unknown git facts (not a repo / git absent) are treated as healthy — never break a session", () => {
  assert.equal(facts({ cwd: SLOT, topLevel: null, mainRoot: null }).kind, "unknown");
  assert.equal(facts({ cwd: SLOT, topLevel: MAIN, mainRoot: null }).healthy, true, "no mainRoot ⇒ unknown");
});

test("brokenWorktreeContext: a valid SessionStart payload naming the slot, main, and the DO-NOT-build remedy", () => {
  const parsed = JSON.parse(brokenWorktreeContext({ cwd: SLOT, topLevel: MAIN, hasNodeModules: false }));
  assert.equal(parsed.hookSpecificOutput.hookEventName, "SessionStart");
  const ctx: string = parsed.hookSpecificOutput.additionalContext;
  assert.ok(ctx.includes(SLOT), "names the broken slot");
  assert.ok(ctx.includes(MAIN), "names where git resolves (main)");
  assert.match(ctx, /RESTART the session/, "gives the remedy");
  assert.match(ctx, /check:declared/, "warns the identity/gate consequence");
  assert.match(ctx, /MISSING/, "reports node_modules state");
});

test("hookStdout: emits the signal only for a broken slot in hook mode, silent otherwise", () => {
  const broken = facts({ cwd: SLOT, topLevel: MAIN });
  const healthy = facts({ cwd: SLOT, topLevel: SLOT });
  assert.equal(hookStdout(healthy, true), "", "a healthy session ⇒ no context noise");
  assert.equal(hookStdout(broken, false), "", "non-hook (doctor) ⇒ no stdout signal");
  assert.equal(hookStdout(broken, true), brokenWorktreeContext(broken), "hook + broken ⇒ the payload");
});

test("exitCode: --hook never breaks the session; the doctor propagates broken as exit 1", () => {
  assert.equal(exitCode({ healthy: false }, true), 0, "hook mode exits 0 even when broken");
  assert.equal(exitCode({ healthy: false }, false), 1, "standalone doctor exits 1 when broken");
  assert.equal(exitCode({ healthy: true }, false), 0);
});

test("checkWorktree: composes an injected probe + node_modules check into a verdict", () => {
  const v = checkWorktree(SLOT, {
    probe: () => ({ topLevel: MAIN, mainRoot: MAIN }),
    nodeModules: () => true,
  });
  assert.equal(v.kind, "broken", "a slot probed as resolving to main is broken");
  assert.equal(v.hasNodeModules, true);
});

test("entry --hook: a healthy cwd exits 0 with a SILENT agent channel (nothing on stdout)", () => {
  // MAIN of THIS repo: the package root's grandparent is the repo root (a non-slot cwd → healthy).
  const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));
  const res = spawnSync(process.execPath, [SCRIPT, "--hook", "--cwd", repoRoot], { encoding: "utf8" });
  assert.equal(res.status, 0, `--hook must exit 0; stderr: ${res.stderr}`);
  assert.equal(res.stdout.trim(), "", "hook mode: a healthy session writes NO additionalContext to stdout (the agent channel)");
  assert.match(res.stderr, /\[worktree-health\] OK/, "the human summary goes to stderr in hook mode");
});

test("entry (doctor): a healthy cwd exits 0 and prints the OK summary to stdout", () => {
  const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));
  const res = spawnSync(process.execPath, [SCRIPT, "--cwd", repoRoot], { encoding: "utf8" });
  assert.equal(res.status, 0, `a healthy cwd must exit 0; stderr: ${res.stderr}`);
  assert.match(res.stdout, /\[worktree-health\] OK/, "doctor mode prints the verdict to stdout");
});

test("entry --hook END-TO-END: a REAL unregistered slot (git resolves to main) is caught + announced", (t) => {
  // Build a throwaway repo and an UNREGISTERED `.claude/worktrees/<name>` slot inside it — exactly the
  // broken shape: the dir exists, git was never `worktree add`-ed, so git resolves the slot UP to this
  // repo's root. This exercises the real git reads (probeGit → classify → emit), not injected facts.
  const gitv = spawnSync("git", ["--version"], { encoding: "utf8" });
  if (gitv.status !== 0) return t.skip("git not available");
  const main = mkdtempSync(join(tmpdir(), "st-wt-health-"));
  try {
    const runGit = (args: string[]) => spawnSync("git", args, { cwd: main, encoding: "utf8" });
    runGit(["init", "-q"]);
    runGit(["config", "user.email", "t@t.com"]);
    runGit(["config", "user.name", "t"]);
    runGit(["commit", "-q", "--allow-empty", "-m", "init"]);
    const slot = join(main, ".claude", "worktrees", "phantom-slot");
    mkdirSync(slot, { recursive: true }); // an empty, unregistered slot — the bug

    const res = spawnSync(process.execPath, [SCRIPT, "--hook", "--cwd", slot], { encoding: "utf8" });
    assert.equal(res.status, 0, `--hook must never break the session (exit 0); stderr: ${res.stderr}`);
    assert.notEqual(res.stdout.trim(), "", "a broken slot MUST emit the agent-visible additionalContext");
    const parsed = JSON.parse(res.stdout.trim());
    assert.equal(parsed.hookSpecificOutput.hookEventName, "SessionStart");
    assert.match(parsed.hookSpecificOutput.additionalContext, /BROKEN WORKTREE/, "the heads-up flags the break");
    assert.match(res.stderr, /\[worktree-health\] BROKEN/, "the diagnostic line goes to stderr");
  } finally {
    rmSync(main, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// Auto-repair — the empty-husk self-heal (owner-directed 2026-07-20 "solve this properly").
// The fingerprint: a BROKEN slot that is EMPTY while the main checkout's HEAD sits on a `claude/*`
// session branch — the residue of the harness's aborted create sequence (checkout branch at main →
// detach → worktree add, died before the detach). The repair finishes that sequence.
// ---------------------------------------------------------------------------

test("repairDecision: ONLY broken + empty slot + claude/* branch at main approves a repair", () => {
  const approve = repairDecision({ kind: "broken", slotEmpty: true, mainBranch: "claude/phantom-1a2b3c" });
  assert.equal(approve.repair, true, "the provable fingerprint is repaired");
  assert.equal(repairDecision({ kind: "registered", slotEmpty: true, mainBranch: "claude/x" }).repair, false, "healthy is never repaired");
  assert.equal(repairDecision({ kind: "broken", slotEmpty: false, mainBranch: "claude/x" }).repair, false, "a POPULATED husk is never repaired (content must not be merged over)");
  assert.equal(repairDecision({ kind: "broken", slotEmpty: true, mainBranch: null }).repair, false, "a detached main has no orphaned branch to mount");
  assert.equal(repairDecision({ kind: "broken", slotEmpty: true, mainBranch: "main" }).repair, false, "never move main off a human branch");
  assert.equal(repairDecision({ kind: "broken", slotEmpty: true, mainBranch: "feature/x" }).repair, false, "only the claude/* harness namespace qualifies");
});

test("repairBrokenSlot: an approved fingerprint runs read-HEAD → detach → worktree add → re-classify", () => {
  const calls: string[][] = [];
  const registered = facts({ cwd: SLOT, topLevel: SLOT });
  const out = repairBrokenSlot(
    SLOT,
    { kind: "broken" },
    {
      probe: () => ({ topLevel: MAIN, mainRoot: MAIN }),
      run: (_dir, args) => {
        calls.push(args);
        if (args[0] === "symbolic-ref") return { ok: true, stdout: "claude/phantom", stderr: "" };
        return { ok: true, stdout: "", stderr: "" };
      },
      listDir: () => [],
      check: () => registered,
    },
  );
  assert.equal(out.repaired, true, "an approved + successful sequence reports repaired");
  if (out.repaired) {
    assert.equal(out.branch, "claude/phantom", "carries the mounted branch");
    assert.equal(out.verdict.kind, "registered", "the post-repair verdict is the real re-classification");
  }
  assert.deepEqual(
    calls.map((a) => a[0]),
    ["symbolic-ref", "checkout", "worktree"],
    "exactly: read main HEAD, detach, worktree add — nothing else",
  );
  assert.deepEqual(calls[2], ["worktree", "add", SLOT, "claude/phantom"], "the add mounts THE orphaned branch at THE slot");
});

test("repairBrokenSlot: a failed worktree add restores main to the branch (leave-as-found) and reports why", () => {
  const calls: string[][] = [];
  const out = repairBrokenSlot(
    SLOT,
    { kind: "broken" },
    {
      probe: () => ({ topLevel: MAIN, mainRoot: MAIN }),
      run: (_dir, args) => {
        calls.push(args);
        if (args[0] === "symbolic-ref") return { ok: true, stdout: "claude/phantom", stderr: "" };
        if (args[0] === "worktree") return { ok: false, stdout: "", stderr: "disk full" };
        return { ok: true, stdout: "", stderr: "" };
      },
      listDir: () => [],
      check: () => facts({}),
    },
  );
  assert.equal(out.repaired, false);
  if (!out.repaired) assert.match(out.reason, /worktree-add-failed: disk full/, "the add's stderr is the reason");
  assert.deepEqual(calls[calls.length - 1], ["checkout", "claude/phantom"], "main is checked back out on the branch");
});

test("repairBrokenSlot: a cwd that is NOT the slot root is declined — repair only mounts at the slot itself", () => {
  // An EMPTY subdir of a populated husk would pass the emptiness fence; the slot-root fence must
  // decline it (mounting the branch at `<husk>/some-empty-dir` would be the wrong worktree).
  const out = repairBrokenSlot(
    `${SLOT}/some-empty-dir`,
    { kind: "broken" },
    {
      probe: () => ({ topLevel: MAIN, mainRoot: MAIN }),
      run: () => {
        throw new Error("must not run any git mutation for a non-slot-root cwd");
      },
      listDir: () => [],
      check: () => facts({}),
    },
  );
  assert.equal(out.repaired, false);
  if (!out.repaired) assert.match(out.reason, /cwd-is-not-the-slot-root/);
});

test("repairBrokenSlot: an unreadable slot dir is treated as populated — never repair blind", () => {
  const out = repairBrokenSlot(
    SLOT,
    { kind: "broken" },
    {
      probe: () => ({ topLevel: MAIN, mainRoot: MAIN }),
      run: (_dir, args) =>
        args[0] === "symbolic-ref" ? { ok: true, stdout: "claude/x", stderr: "" } : { ok: true, stdout: "", stderr: "" },
      listDir: () => {
        throw new Error("EACCES");
      },
      check: () => facts({}),
    },
  );
  assert.equal(out.repaired, false);
  if (!out.repaired) assert.match(out.reason, /slot-not-empty/, "readdir failure falls to the populated fence");
});

test("repairedWorktreeContext: a valid SessionStart payload — repaired, restart remedy lifted, identity valid", () => {
  const parsed = JSON.parse(repairedWorktreeContext({ verdict: { cwd: SLOT }, branch: "claude/phantom", mainRoot: MAIN }));
  assert.equal(parsed.hookSpecificOutput.hookEventName, "SessionStart");
  const ctx: string = parsed.hookSpecificOutput.additionalContext;
  assert.ok(ctx.includes(SLOT), "names the repaired slot");
  assert.ok(ctx.includes("claude/phantom"), "names the mounted branch");
  assert.match(ctx, /AUTO-REPAIRED/, "flags the heal");
  assert.match(ctx, /do NOT restart/, "the old restart remedy is explicitly lifted");
});

test("hookStdout: a repaired outcome emits the repaired payload; a declined repair threads its reason", () => {
  const broken = facts({ cwd: SLOT, topLevel: MAIN });
  const repaired = { verdict: { cwd: SLOT }, branch: "claude/phantom", mainRoot: MAIN };
  assert.equal(
    hookStdout(facts({ cwd: SLOT, topLevel: SLOT }), true, repaired),
    repairedWorktreeContext(repaired),
    "hook + repaired ⇒ the repaired payload",
  );
  const declined = hookStdout(broken, true, null, "slot-not-empty (populated husk)");
  assert.match(
    JSON.parse(declined).hookSpecificOutput.additionalContext,
    /Auto-repair was NOT possible here \(slot-not-empty/,
    "hook + declined ⇒ the broken payload names the fence that held",
  );
  assert.equal(hookStdout(broken, false, repaired), "", "the doctor never writes the agent channel");
});

test("entry --hook END-TO-END: THE BUG — an empty husk with a claude/* branch at main is AUTO-REPAIRED", (t) => {
  // Reproduce the harness's aborted create sequence in a throwaway repo: session branch checked out
  // at MAIN, slot pre-created empty, `git worktree add` never happened. The hook must finish the
  // sequence: detach main in place, mount the branch at the slot, announce the heal.
  const gitv = spawnSync("git", ["--version"], { encoding: "utf8" });
  if (gitv.status !== 0) return t.skip("git not available");
  const main = mkdtempSync(join(tmpdir(), "st-wt-repair-"));
  try {
    const runGit = (args: string[]) => spawnSync("git", args, { cwd: main, encoding: "utf8" });
    runGit(["init", "-q"]);
    runGit(["config", "user.email", "t@t.com"]);
    runGit(["config", "user.name", "t"]);
    runGit(["commit", "-q", "--allow-empty", "-m", "init"]);
    runGit(["checkout", "-q", "-b", "claude/phantom-session"]);
    const slot = join(main, ".claude", "worktrees", "phantom-session-slot");
    mkdirSync(slot, { recursive: true }); // empty, unregistered — the husk

    const res = spawnSync(process.execPath, [SCRIPT, "--hook", "--cwd", slot], { encoding: "utf8" });
    assert.equal(res.status, 0, `--hook must exit 0; stderr: ${res.stderr}`);
    const parsed = JSON.parse(res.stdout.trim());
    assert.equal(parsed.hookSpecificOutput.hookEventName, "SessionStart");
    assert.match(parsed.hookSpecificOutput.additionalContext, /AUTO-REPAIRED/, "the agent is told it was healed");
    assert.match(res.stderr, /\[worktree-health\] REPAIRED/, "the diagnostic names the repair");
    // The slot is now a REGISTERED worktree on the session branch…
    const top = spawnSync("git", ["rev-parse", "--show-toplevel"], { cwd: slot, encoding: "utf8" });
    assert.equal(samePath(top.stdout.trim(), slot), true, "git now resolves the slot to ITSELF");
    const br = spawnSync("git", ["branch", "--show-current"], { cwd: slot, encoding: "utf8" });
    assert.equal(br.stdout.trim(), "claude/phantom-session", "the orphaned branch is mounted at the slot");
    // …and main is detached at the same commit (the branch freed in place, working tree untouched).
    const mainHead = spawnSync("git", ["symbolic-ref", "-q", "HEAD"], { cwd: main, encoding: "utf8" });
    assert.notEqual(mainHead.status, 0, "main HEAD is detached (the branch was freed in place)");
  } finally {
    rmSync(main, { recursive: true, force: true });
  }
});

test("entry --hook END-TO-END: a POPULATED husk is NOT repaired — the loud announce stands, main untouched", (t) => {
  const gitv = spawnSync("git", ["--version"], { encoding: "utf8" });
  if (gitv.status !== 0) return t.skip("git not available");
  const main = mkdtempSync(join(tmpdir(), "st-wt-norepair-"));
  try {
    const runGit = (args: string[]) => spawnSync("git", args, { cwd: main, encoding: "utf8" });
    runGit(["init", "-q"]);
    runGit(["config", "user.email", "t@t.com"]);
    runGit(["config", "user.name", "t"]);
    runGit(["commit", "-q", "--allow-empty", "-m", "init"]);
    runGit(["checkout", "-q", "-b", "claude/phantom-session"]);
    const slot = join(main, ".claude", "worktrees", "phantom-populated");
    mkdirSync(join(slot, "node_modules"), { recursive: true }); // leftover content — the half-removed husk

    const res = spawnSync(process.execPath, [SCRIPT, "--hook", "--cwd", slot], { encoding: "utf8" });
    assert.equal(res.status, 0);
    const parsed = JSON.parse(res.stdout.trim());
    assert.match(parsed.hookSpecificOutput.additionalContext, /BROKEN WORKTREE/, "still the loud announce");
    assert.match(parsed.hookSpecificOutput.additionalContext, /Auto-repair was NOT possible/, "and it names the fence");
    const br = spawnSync("git", ["branch", "--show-current"], { cwd: main, encoding: "utf8" });
    assert.equal(br.stdout.trim(), "claude/phantom-session", "main was left EXACTLY as found");
  } finally {
    rmSync(main, { recursive: true, force: true });
  }
});
