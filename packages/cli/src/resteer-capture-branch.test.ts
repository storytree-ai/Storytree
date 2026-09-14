import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";

import { InMemoryStore } from "@storytree/storage-protocol";
import { Resteer, UNATTRIBUTABLE_CAPTURE_STAMP } from "@storytree/library";

import { run } from "./commands.js";
import { resteerCaptureBranch } from "./resteer-capture-branch.js";

/**
 * What a re-steer capture stamps as `provenance.branch` (ADR-0568; `follow-the-research-arc`,
 * increment `resteer-detached-head-stamp`).
 *
 * TWO HALVES, and neither is enough alone. The FAKE-GIT cases walk every branch of the rule cheaply,
 * but a fake can only answer what its author believed git says — and the defect this exists for was
 * exactly such a belief (that `--abbrev-ref HEAD` names a branch) turning out false in a detached
 * checkout. So the rule is also run against REAL git, in a throwaway repository, over every checkout
 * shape it distinguishes. Never against the checkout this suite runs in: CI runs from a detached
 * primary checkout and a laptop from a linked worktree, so an expectation read off the live repo would
 * mean something different in each and quietly assert nothing in one of them.
 */

/** A described checkout, answered the way `deriveIdentity` and the stamp's own probe read it. */
interface FakeCheckout {
  readonly toplevel: string;
  readonly gitDir: string;
  readonly commonDir: string;
  readonly branch: string;
}

function fakeGit(checkout: FakeCheckout): (args: string[]) => string {
  return (args) => {
    const read = args.join(" ");
    if (read === "rev-parse --show-toplevel") return checkout.toplevel;
    if (read === "rev-parse --path-format=absolute --git-dir") return checkout.gitDir;
    if (read === "rev-parse --path-format=absolute --git-common-dir") return checkout.commonDir;
    if (read === "rev-parse --abbrev-ref HEAD") return checkout.branch;
    if (read === "rev-parse --git-dir") return checkout.gitDir;
    throw new Error(`unexpected git read: ${read}`);
  };
}

const LOBBY = "C:/code/storytree";

/** The shared primary checkout: its git dir IS the common dir. */
function primaryCheckout(branch: string): FakeCheckout {
  return { toplevel: LOBBY, gitDir: `${LOBBY}/.git`, commonDir: `${LOBBY}/.git`, branch };
}

/** A harness slot under `.claude/worktrees/` — the first rule `deriveIdentity` applies. */
function claudeSlot(branch: string): FakeCheckout {
  return {
    toplevel: `${LOBBY}/.claude/worktrees/gentle-slot-1a2b3c`,
    gitDir: `${LOBBY}/.git/worktrees/gentle-slot-1a2b3c`,
    commonDir: `${LOBBY}/.git`,
    branch,
  };
}

test("resteer-capture-branch: a linked worktree on a named branch stamps that branch", () => {
  assert.equal(
    resteerCaptureBranch(fakeGit(claudeSlot("claude/gentle-slot-1a2b3c"))),
    "claude/gentle-slot-1a2b3c",
  );
  // The second identity rule — any other registered linked worktree, a Codex one here — answers alike.
  const codex: FakeCheckout = {
    toplevel: "C:/Users/someone/.codex/worktrees/3c42/storytree",
    gitDir: `${LOBBY}/.git/worktrees/storytree3`,
    commonDir: `${LOBBY}/.git`,
    branch: "codex/some-lane",
  };
  assert.equal(resteerCaptureBranch(fakeGit(codex)), "codex/some-lane");
});

test("resteer-capture-branch: a DETACHED linked worktree stamps the named marker, never the literal HEAD", () => {
  assert.equal(
    resteerCaptureBranch(fakeGit(claudeSlot("HEAD"))),
    UNATTRIBUTABLE_CAPTURE_STAMP.detachedHead,
  );
});

test("resteer-capture-branch: the PRIMARY CHECKOUT names no session, whatever branch it happens to be on", () => {
  // Detached — the measured shape: every `HEAD` row in the store was captured here.
  assert.equal(
    resteerCaptureBranch(fakeGit(primaryCheckout("HEAD"))),
    UNATTRIBUTABLE_CAPTURE_STAMP.primaryCheckout,
  );
  // On the trunk.
  assert.equal(
    resteerCaptureBranch(fakeGit(primaryCheckout("main"))),
    UNATTRIBUTABLE_CAPTURE_STAMP.primaryCheckout,
  );
  // The DISCRIMINATING case: a session branch left checked out in the lobby by an aborted worktree
  // create (ADR-0033). It reads exactly like an attributable stamp, and it is the one that would
  // silently credit ANOTHER session's branch with this intervention — so the lobby is refused on
  // WHERE the command ran, never on what the branch happens to be called.
  assert.equal(
    resteerCaptureBranch(fakeGit(primaryCheckout("claude/some-other-session"))),
    UNATTRIBUTABLE_CAPTURE_STAMP.primaryCheckout,
  );
});

test("resteer-capture-branch: where git cannot answer at all, the stamp says so rather than inventing a name", () => {
  const broken = (): string => {
    throw new Error("fatal: not a git repository");
  };
  assert.equal(resteerCaptureBranch(broken), UNATTRIBUTABLE_CAPTURE_STAMP.gitCouldNotAnswer);
});

test("resteer-capture-branch: against REAL git, every checkout shape stamps what the rule says", (t) => {
  if (spawnSync("git", ["--version"], { encoding: "utf8" }).status !== 0) {
    t.skip("git not available");
    return;
  }
  const root = mkdtempSync(path.join(os.tmpdir(), "resteer-capture-branch-"));
  try {
    const primary = path.join(root, "primary");
    const linked = path.join(root, "linked");
    // Identity and signing are passed per invocation rather than configured: the repo is thrown away,
    // and a `git config` here would be three more spawns on every mutant run of this suite.
    const setup = (cwd: string, ...args: string[]): void => {
      execFileSync(
        "git",
        ["-c", "user.email=test@example.com", "-c", "user.name=Capture Test", "-c", "commit.gpgsign=false", ...args],
        { cwd, stdio: "ignore" },
      );
    };
    // A git runner bound to one directory. The ceiling stops discovery at the throwaway root, so the
    // not-a-checkout case below cannot find some enclosing repository and answer for it instead.
    const gitIn =
      (cwd: string) =>
      (args: string[]): string =>
        (
          execFileSync("git", args, {
            cwd,
            encoding: "utf8",
            stdio: ["ignore", "pipe", "ignore"],
            env: { ...process.env, GIT_CEILING_DIRECTORIES: root },
          }) as string
        ).trim();

    setup(root, "init", "-q", "primary");
    setup(primary, "commit", "-q", "--allow-empty", "-m", "base");
    setup(primary, "checkout", "-q", "-b", "claude/left-in-the-lobby");
    setup(primary, "worktree", "add", "-q", "-b", "claude/linked-session", linked);

    assert.equal(resteerCaptureBranch(gitIn(linked)), "claude/linked-session");
    assert.equal(resteerCaptureBranch(gitIn(primary)), UNATTRIBUTABLE_CAPTURE_STAMP.primaryCheckout);

    setup(linked, "checkout", "-q", "--detach");
    setup(primary, "checkout", "-q", "--detach");
    // The premise the fake cases take on trust, observed: a detached checkout really does answer `HEAD`.
    assert.equal(gitIn(linked)(["rev-parse", "--abbrev-ref", "HEAD"]), "HEAD");
    assert.equal(resteerCaptureBranch(gitIn(linked)), UNATTRIBUTABLE_CAPTURE_STAMP.detachedHead);
    assert.equal(resteerCaptureBranch(gitIn(primary)), UNATTRIBUTABLE_CAPTURE_STAMP.primaryCheckout);

    assert.equal(resteerCaptureBranch(gitIn(root)), UNATTRIBUTABLE_CAPTURE_STAMP.gitCouldNotAnswer);

    // No real branch can ever carry a marker: git refuses every one of them as a branch name, so a
    // stamp that reads as a marker was written as one.
    for (const stamp of Object.values(UNATTRIBUTABLE_CAPTURE_STAMP)) {
      const check = spawnSync("git", ["check-ref-format", "--branch", stamp], { cwd: root, encoding: "utf8" });
      assert.notEqual(check.status, 0, `git accepted ${JSON.stringify(stamp)} as a branch name`);
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("resteer new: with no branch or clock injected, the dispatcher stamps what the capture rule reads here", async () => {
  // The composition root's OWN defaults — the one path every other capture test bypasses by injecting
  // `friction.branch` and `friction.now`. The stamp is compared with the rule run against the SAME
  // checkout at the same moment, never with a particular value, so this asserts the WIRING and means
  // the same thing in a linked worktree on a laptop as in CI's detached primary checkout.
  const store = new InMemoryStore();
  const before = new Date().toISOString().slice(0, 10);
  const res = await run(
    [
      "resteer", "new",
      "--title", "Wired without injection",
      "--doing", "d",
      "--redirect", "r",
      "--evidence", "\"quoted words here\"",
      "--disposition", "taste",
      "--by", "owner",
      "--pg",
    ],
    { store, writable: true },
  );
  const after = new Date().toISOString().slice(0, 10);
  assert.equal(res.ok, true, res.body);

  const doc = Resteer.parse((await store.getDoc("resteer-wired-without-injection"))?.doc);
  assert.equal(doc.provenance?.branch, resteerCaptureBranch());
  // The clock default, bracketed by two reads so a run that straddles midnight UTC still passes.
  assert.ok(
    doc.provenance?.date === before || doc.provenance?.date === after,
    `stamped ${String(doc.provenance?.date)}, clock read ${before}..${after}`,
  );
});
