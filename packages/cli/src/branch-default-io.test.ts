import test, { after, before, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { branchNext } from "./branch.js";

/**
 * `builtinRunGit` — `branch.ts`'s DEFAULT git runner, driven against a REAL repository
 * (`a-mocked-seam-leaves-its-default-implementation-unproven`).
 *
 * WHY THIS FILE EXISTS. `branch.test.ts` drives the whole of `branchNext` over an injected `runGit`
 * fake, so every one of its git invocations was answered by a hand-written string and the default
 * had never spawned git once. The pointed part: `worktree.ts` names this file as the precedent its
 * own seam follows — so "I followed the house pattern" was never a defence here, because the house
 * pattern was copied WITHOUT its test discipline.
 *
 * WHAT ONLY A REAL REPOSITORY PROVES. The fake returns exactly the strings its author expected git to
 * produce; that is the same belief the production code holds, so the two can be wrong together and
 * agree. Real git is the external authority: `--abbrev-ref HEAD` really prints `HEAD` when detached,
 * `--fixed-strings --grep` really finds the merge subject, `--is-ancestor` really signals through its
 * EXIT CODE (a throw here, not a value), and `status --porcelain` really prints nothing when clean —
 * the four signals every branch in `branchNext` turns on.
 *
 * `builtinRunGit` is module-private and reachable only by OMITTING `deps.runGit`, which is exactly
 * how production calls it, so that is how these tests call it. The ledger legs (`claims` /
 * `redeclare`) stay null — those are `branch.test.ts`'s, and this file is about the git default.
 */

const git = (args: readonly string[], cwd: string): string =>
  execFileSync("git", [...args], { cwd, encoding: "utf8" }).trim();

let root = "";
let origin = "";
let repo = "";
let entryCwd = "";

/**
 * A working checkout wired to a LOCAL bare origin, built ONCE — `branchNext` really runs
 * `git fetch origin --prune`, so the remote has to exist, but it need not be remote. Real git is
 * spawn-expensive on Windows, so tests share the repository and `beforeEach` resets it instead.
 *
 * The process cwd moves here for the whole file: `branchNext` spawns git in the process cwd, and
 * `node --test` gives this file its own process, so the chdir cannot leak into another test file.
 */
before(() => {
  root = mkdtempSync(path.join(os.tmpdir(), "st-branch-io-"));
  origin = path.join(root, "origin.git");
  repo = path.join(root, "repo");

  execFileSync("git", ["init", "--bare", "-b", "main", origin], { encoding: "utf8" });
  mkdirSync(repo, { recursive: true });
  git(["init", "-b", "main"], repo);
  git(["config", "user.email", "fixture@storytree.test"], repo);
  git(["config", "user.name", "fixture"], repo);
  git(["config", "gc.auto", "0"], repo);
  git(["config", "core.autocrlf", "false"], repo);
  writeFileSync(path.join(repo, "seed.txt"), "seed\n", "utf8");
  git(["add", "-A"], repo);
  git(["commit", "-m", "seed"], repo);
  git(["remote", "add", "origin", origin], repo);
  git(["push", "-u", "origin", "main"], repo);
  git(["fetch", "origin", "--prune"], repo);

  entryCwd = process.cwd();
  process.chdir(repo);
});

/** Back to a clean `main` between tests — cheaper than rebuilding the whole repository. */
beforeEach(() => {
  git(["checkout", "-f", "main"], repo);
  git(["clean", "-fd"], repo);
});

after(() => {
  if (entryCwd !== "") process.chdir(entryCwd);
  try {
    rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  } catch {
    // A temp dir the OS still holds is the OS's problem, never a test failure.
  }
});

/** Land `branch` on origin/main through a real merge commit whose subject NAMES it (the ADR-0022 shape). */
function landBranch(branch: string, opts: { publish: boolean } = { publish: true }): void {
  git(["switch", "-c", branch], repo);
  writeFileSync(path.join(repo, `${branch.replace(/\W+/g, "-")}.txt`), "work\n", "utf8");
  git(["add", "-A"], repo);
  git(["commit", "-m", "work on the unit"], repo);
  if (opts.publish) git(["push", "-u", "origin", branch], repo);
  git(["switch", "main"], repo);
  git(["merge", "--no-ff", branch, "-m", `Merge pull request #7 from storytree-ai/${branch}`], repo);
  git(["push", "origin", "main"], repo);
  // CI merges with --delete-branch; the pruned remote ref is the corroborating signal.
  if (opts.publish) git(["push", "origin", "--delete", branch], repo);
  git(["switch", branch], repo);
}

/** The non-git deps `branchNext` requires. */
const OFFLINE_DEPS = { claims: null, identity: null, redeclare: null } as const;

// ---------------------------------------------------------------------------
// The dead-branch cut — every plumbing signal answered by real git
// ---------------------------------------------------------------------------

test("branchNext over the REAL builtinRunGit: detects a genuinely merged branch and really cuts a fresh one off origin/main", async () => {
  landBranch("claude/landed-unit");
  const originMain = git(["rev-parse", "refs/remotes/origin/main"], repo);

  // No `runGit` in deps — the default spawns real git for every probe.
  const env = await branchNext({ ...OFFLINE_DEPS, generateName: () => "claude/fresh-cut" });

  assert.equal(env.ok, true, `expected the dead branch to be succeeded; got: ${env.body}`);
  assert.match(env.body, /BRANCH DEAD/, "real git's merge evidence must drive the dead verdict");
  assert.match(
    env.body,
    /Merge pull request #7 from storytree-ai\/claude\/landed-unit/,
    "the evidence line quotes the REAL merge subject `--fixed-strings --grep` found",
  );
  assert.match(env.body, /gone \(deleted on merge\)/, "the pruned remote ref is real, not asserted");

  // The filesystem effect, read back from git rather than from the envelope prose.
  assert.equal(git(["rev-parse", "--abbrev-ref", "HEAD"], repo), "claude/fresh-cut", "really switched");
  assert.equal(git(["rev-parse", "HEAD"], repo), originMain, "the fresh branch is cut off origin/main");
});

test("branchNext over the REAL builtinRunGit AND builtinGenerateName: the default name is a free claude/<name>", async () => {
  // Never published, so the dead verdict here rests on the OTHER two signals — the merge subject and
  // the strict-ancestor walk — rather than on the pruned remote ref.
  landBranch("claude/another-landed-unit", { publish: false });

  // Both defaults omitted — the closest this can get to the production call.
  const env = await branchNext({ ...OFFLINE_DEPS });

  assert.equal(env.ok, true, `expected a cut; got: ${env.body}`);
  const fresh = git(["rev-parse", "--abbrev-ref", "HEAD"], repo);
  assert.match(
    fresh,
    /^claude\/[a-z]+-[a-z]+-[0-9a-f]{6}$/,
    "the default generator must produce the harness-shaped claude/<adjective>-<surname>-<hex>",
  );
  assert.notEqual(fresh, "claude/another-landed-unit", "and it must not collide with the dead branch");
  assert.match(env.body, new RegExp(`cut \\+ switched to "${fresh}"`), "the envelope names the branch git really made");
});

// ---------------------------------------------------------------------------
// The refusals — each one turns on a real git answer, not a fixture string
// ---------------------------------------------------------------------------

test("branchNext over the REAL builtinRunGit: an ALIVE branch is refused and NOTHING is cut", async () => {
  git(["switch", "-c", "claude/still-working"], repo);
  writeFileSync(path.join(repo, "in-progress.txt"), "unlanded\n", "utf8");
  git(["add", "-A"], repo);
  git(["commit", "-m", "not landed yet"], repo);

  const env = await branchNext({ ...OFFLINE_DEPS, generateName: () => "claude/must-not-appear" });

  assert.equal(env.ok, false, "an unlanded branch must be refused");
  assert.match(env.body, /is ALIVE — 1 commit\(s\) not yet in origin\/main/, "the count comes from real rev-list");
  assert.equal(
    git(["rev-parse", "--abbrev-ref", "HEAD"], repo),
    "claude/still-working",
    "a refusal must leave the checkout exactly where it was",
  );
  assert.throws(
    () => git(["rev-parse", "--verify", "refs/heads/claude/must-not-appear"], repo),
    "no branch may be created on a refusal",
  );
});

test("branchNext over the REAL builtinRunGit: a dirty tree is refused with git's own porcelain quoted back", async () => {
  git(["switch", "-c", "claude/dirty-tree"], repo);
  writeFileSync(path.join(repo, "seed.txt"), "edited, uncommitted\n", "utf8");

  const env = await branchNext({ ...OFFLINE_DEPS });

  assert.equal(env.ok, false, "a dirty tree must be refused before any switch");
  assert.match(env.body, /the working tree is dirty/);
  assert.match(env.body, /M seed\.txt/, "real `status --porcelain` output is surfaced, not a paraphrase");
  assert.equal(git(["rev-parse", "--abbrev-ref", "HEAD"], repo), "claude/dirty-tree", "still on the same branch");
});

test("branchNext over the REAL builtinRunGit: the trunk and a detached HEAD are refused on git's own answers", async () => {
  // `--abbrev-ref HEAD` really prints "main" here…
  const onMain = await branchNext({ ...OFFLINE_DEPS });
  assert.equal(onMain.ok, false);
  assert.match(onMain.body, /the trunk never dies/, "the trunk refusal reads the real branch name");

  // …and really prints the literal "HEAD" when detached, which is the only signal `branchNext` has
  // for that case. A fake can assert this string; only real git establishes that it IS the string.
  git(["switch", "--detach", "HEAD"], repo);
  assert.equal(git(["rev-parse", "--abbrev-ref", "HEAD"], repo), "HEAD", "real git's detached spelling");
  const detached = await branchNext({ ...OFFLINE_DEPS });
  assert.equal(detached.ok, false);
  assert.match(detached.body, /detached HEAD/, "the detached refusal turns on that exact spelling");
});
