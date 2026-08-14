import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import type { ClaimDocT, ClaimRequest, ClaimResult } from "@storytree/notice-board";

import {
  createWorktree,
  defaultWorktreeCreateIo,
  type WorktreeCreateIo,
  type WorktreeCreateLedgerLike,
} from "./worktree-create.js";

/**
 * `defaultWorktreeCreateIo` — the PRODUCTION IO of the claim-gated workspace ceremony (ADR-0200 D3),
 * driven against REAL git, a REAL filesystem, and a REAL `pnpm install`
 * (`a-mocked-seam-leaves-its-default-implementation-unproven`).
 *
 * WHY THIS FILE EXISTS. `worktree-create.test.ts` proves the pure `mintWorktreeName` policy and
 * `worktree-create-command.test.ts` proves the ceremony's ordering behind an injected
 * `WorktreeCreateIo` fake — so before this file, a green `pnpm -r test` covered the naming rules and
 * the claim ordering while NOT ONE of the five production IO members had ever executed. That is the
 * most misleading version of the gap: from a test summary, "worktree-create is tested" and
 * "worktree-create's naming policy is tested" are indistinguishable.
 *
 * WHAT ONLY A REAL SUBSTRATE PROVES HERE:
 *   - `primaryRoot()` must answer with the PRIMARY checkout even when the caller stands in a
 *     worktree. Every candidate path is built from it, so if it ever answered with the caller's own
 *     worktree the ceremony would nest `.claude/worktrees/` inside a worktree. Only real git — whose
 *     `--git-common-dir` deliberately resolves through the link — can demonstrate that.
 *   - `addWorktree()` is the one irreversible filesystem act in the ceremony, and it must cut off
 *     `refs/remotes/origin/main` rather than the caller's HEAD.
 *   - `install()` is documented as "never throws" and `createWorktree` relies on that: a thrown
 *     install and a failed install produce different envelopes. A fake asserting `{ok:false}` cannot
 *     show that real pnpm, really failing, does not throw.
 *
 * COST DISCIPLINE. Real git is spawn-expensive on Windows, so ONE repository is built for the whole
 * file, and the members that need no repository at all (`exists`, `install`) run against plain temp
 * directories.
 */

const git = (args: readonly string[], cwd: string): string =>
  execFileSync("git", [...args], { cwd, encoding: "utf8" }).trim();

let root = "";
/** The bare `origin` — a real remote, because `fetchMain` really fetches. */
let origin = "";
/** The primary checkout. */
let primary = "";

/** A primary checkout wired to a LOCAL bare origin, so `fetchMain` is exercised with no network. */
before(() => {
  root = mkdtempSync(path.join(os.tmpdir(), "st-wt-create-io-"));
  origin = path.join(root, "origin.git");
  primary = path.join(root, "main");

  execFileSync("git", ["init", "--bare", "-b", "main", origin], { encoding: "utf8" });
  mkdirSync(primary, { recursive: true });
  git(["init", "-b", "main"], primary);
  git(["config", "user.email", "fixture@storytree.test"], primary);
  git(["config", "user.name", "fixture"], primary);
  git(["config", "gc.auto", "0"], primary);
  git(["config", "core.autocrlf", "false"], primary);
  writeFileSync(path.join(primary, ".gitignore"), ".claude/\n", "utf8");
  writeFileSync(path.join(primary, "seed.txt"), "seed\n", "utf8");
  git(["add", "-A"], primary);
  git(["commit", "-m", "seed"], primary);
  git(["remote", "add", "origin", origin], primary);
  git(["push", "-u", "origin", "main"], primary);
  git(["fetch", "origin", "--prune"], primary);
});

after(() => {
  try {
    rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  } catch {
    // A temp dir the OS still holds is the OS's problem, never a test failure.
  }
});

/** A plain temp directory for the members that need no repository. */
function withTempDir(fn: (dir: string) => void | Promise<void>): () => Promise<void> {
  return async () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), "st-create-fs-"));
    try {
      await fn(dir);
    } finally {
      try {
        rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
      } catch {
        // As above — teardown never fails a test.
      }
    }
  };
}

const sameDir = (a: string, b: string): boolean =>
  path.resolve(a).toLowerCase() === path.resolve(b).toLowerCase();

// ---------------------------------------------------------------------------
// primaryRoot — the path every candidate is built from
// ---------------------------------------------------------------------------

test("defaultWorktreeCreateIo.primaryRoot: real git resolves the PRIMARY checkout — from the primary AND from inside a worktree", () => {
  const wt = path.join(primary, ".claude", "worktrees", "existing-one");
  git(["worktree", "add", "-b", "claude/existing-one", wt, "refs/remotes/origin/main"], primary);

  // `primaryRoot` spawns git in the process cwd, so the production path is only reachable by
  // standing where a real caller stands. This file gets its own process under `node --test`.
  const cwd = process.cwd();
  try {
    process.chdir(primary);
    assert.ok(
      sameDir(defaultWorktreeCreateIo.primaryRoot(), primary),
      "called from the primary, it answers with the primary",
    );

    // THE LOAD-BEARING CASE. Sessions run `worktree create` from the lobby, but nothing stops it
    // being run inside a worktree — and `--git-common-dir` resolves through the worktree link to
    // the primary's `.git`. If this ever answered with the caller's worktree, the ceremony would
    // cut `.claude/worktrees/` INSIDE a worktree, one level deeper on every hop.
    process.chdir(wt);
    assert.ok(
      sameDir(defaultWorktreeCreateIo.primaryRoot(), primary),
      "called from INSIDE a worktree, it still answers with the primary — never the caller's own tree",
    );
  } finally {
    process.chdir(cwd);
  }
});

test(
  "defaultWorktreeCreateIo.primaryRoot: outside a repository it THROWS (the ceremony must refuse, not guess)",
  withTempDir((dir) => {
    const cwd = process.cwd();
    try {
      process.chdir(dir);
      // `createWorktree` catches this into "could not resolve the primary checkout root". A default
      // that returned some ambient path instead would cut a worktree in a directory nobody chose.
      assert.throws(() => defaultWorktreeCreateIo.primaryRoot(), "outside a repo there is no honest answer");
    } finally {
      process.chdir(cwd);
    }
  }),
);

// ---------------------------------------------------------------------------
// exists — the collision probe that forces a suffix re-draw (pure fs)
// ---------------------------------------------------------------------------

test(
  "defaultWorktreeCreateIo.exists: real on-disk presence — a taken basename forces the re-draw, an absent one does not",
  withTempDir((dir) => {
    const taken = path.join(dir, "already-here");
    mkdirSync(taken, { recursive: true });

    assert.equal(defaultWorktreeCreateIo.exists(taken), true, "an existing candidate path is seen");
    assert.equal(defaultWorktreeCreateIo.exists(path.join(dir, "free-name")), false, "a free candidate path reads free");
    // A husk left by a half-removed worktree is still a collision: the mint must re-draw rather than
    // hand `git worktree add` a path that already has bytes in it.
    writeFileSync(path.join(taken, "residue.txt"), "left over\n", "utf8");
    assert.equal(defaultWorktreeCreateIo.exists(taken), true, "a husk collides exactly like a live worktree");
  }),
);

// ---------------------------------------------------------------------------
// fetchMain + addWorktree — the real git the ceremony performs
// ---------------------------------------------------------------------------

test("defaultWorktreeCreateIo.fetchMain: really advances refs/remotes/origin/main from the remote", () => {
  // Move origin's main forward behind the primary's back — a second clone standing in for whatever
  // landed on the trunk while this session was elsewhere.
  const other = path.join(root, "other");
  execFileSync("git", ["clone", origin, other], { encoding: "utf8" });
  git(["config", "user.email", "other@storytree.test"], other);
  git(["config", "user.name", "other"], other);
  writeFileSync(path.join(other, "landed.txt"), "landed on main\n", "utf8");
  git(["add", "-A"], other);
  git(["commit", "-m", "landed"], other);
  git(["push", "origin", "main"], other);

  const before_ = git(["rev-parse", "refs/remotes/origin/main"], primary);
  defaultWorktreeCreateIo.fetchMain(primary);
  const after_ = git(["rev-parse", "refs/remotes/origin/main"], primary);

  assert.notEqual(after_, before_, "the fetch must really move the remote-tracking ref");
  assert.equal(after_, git(["rev-parse", "main"], other), "…to exactly what the remote now holds");
});

test("defaultWorktreeCreateIo.addWorktree: cuts a REAL registered worktree on a new branch off origin/main", () => {
  // Put the primary's HEAD somewhere other than origin/main, so "cut off origin/main" is a claim
  // the test can actually distinguish from "cut off whatever the caller had checked out".
  writeFileSync(path.join(primary, "local-only.txt"), "not pushed\n", "utf8");
  git(["add", "-A"], primary);
  git(["commit", "-m", "local-only work"], primary);
  const originMain = git(["rev-parse", "refs/remotes/origin/main"], primary);
  assert.notEqual(git(["rev-parse", "HEAD"], primary), originMain, "fixture precondition: HEAD has drifted");

  const target = path.join(primary, ".claude", "worktrees", "cut-one");
  defaultWorktreeCreateIo.addWorktree(primary, "claude/cut-one", target);

  assert.equal(existsSync(target), true, "the worktree directory really exists");
  assert.equal(
    git(["rev-parse", "HEAD"], target),
    originMain,
    "the cut is off refs/remotes/origin/main, NOT the caller's HEAD",
  );
  assert.equal(git(["rev-parse", "--abbrev-ref", "HEAD"], target), "claude/cut-one", "on the requested branch");
  assert.ok(
    git(["worktree", "list", "--porcelain"], primary).includes("refs/heads/claude/cut-one"),
    "git registers it — a real worktree, not a bare directory copy",
  );

  // The branch name is taken now; a second add on the same branch must THROW so `createWorktree`
  // can report "git worktree add FAILED" with the claims standing, rather than silently continuing.
  assert.throws(
    () =>
      defaultWorktreeCreateIo.addWorktree(
        primary,
        "claude/cut-one",
        path.join(primary, ".claude", "worktrees", "cut-two"),
      ),
    "a refused add must surface as a throw",
  );
});

// ---------------------------------------------------------------------------
// registeredWorktrees — the resume probe's only view of what git already holds
// ---------------------------------------------------------------------------

test("defaultWorktreeCreateIo.registeredWorktrees: real `git worktree list --porcelain` yields each cut tree WITH its branch", () => {
  // Resume adopts a partial ceremony only when a registered worktree sits at the claimed session's
  // path AND carries the claimed branch. Both halves come from here, so a fake asserting a shape can
  // never show that real porcelain parses into it — hence a real cut.
  const target = path.join(primary, ".claude", "worktrees", "registry-probe");
  defaultWorktreeCreateIo.addWorktree(primary, "claude/registry-probe", target);

  const entries = defaultWorktreeCreateIo.registeredWorktrees(primary);
  const mine = entries.find((e) => path.resolve(e.path).toLowerCase() === path.resolve(target).toLowerCase());
  assert.ok(mine, `the cut worktree must appear: ${JSON.stringify(entries)}`);
  assert.equal(mine.branch, "claude/registry-probe", "the branch is short-form, not refs/heads/…");

  // The primary itself is always the first porcelain entry — the probe is over ALL worktrees, and
  // the caller (not this member) is what narrows to `.claude/worktrees/<name>`.
  assert.ok(
    entries.some((e) => path.resolve(e.path).toLowerCase() === path.resolve(primary).toLowerCase()),
    "the primary checkout is reported too",
  );
});

test("defaultWorktreeCreateIo.registeredWorktrees: outside a repository it answers EMPTY, never throws", () => {
  // Best-effort by contract: `createWorktree` treats an unreadable registry as "no orphan found" and
  // mints fresh. A throw here would turn a degraded probe into a refused workspace.
  const dir = mkdtempSync(path.join(os.tmpdir(), "st-create-norepo-"));
  try {
    assert.deepEqual(defaultWorktreeCreateIo.registeredWorktrees(dir), []);
  } finally {
    rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  }
});

// ---------------------------------------------------------------------------
// RESUME, end to end against real git
// ---------------------------------------------------------------------------

/** A minimal accumulating ledger: `claimsFor` replays what `take` was given, as the live one does. */
function recordingLedger(): WorktreeCreateLedgerLike & { readonly rows: ClaimDocT[] } {
  const rows: ClaimDocT[] = [];
  const iso = "2026-08-13T00:00:00.000Z";
  return {
    rows,
    async take(req: ClaimRequest): Promise<ClaimResult> {
      const claim: ClaimDocT = {
        unitId: req.unitId,
        sessionId: req.sessionId,
        branch: req.branch,
        intent: req.intent ?? "",
        grade: req.grade ?? "work",
        claimedAt: iso,
        heartbeatAt: iso,
      };
      // The real store upserts per (unit, session) — the idempotence resume leans on rather than
      // adding a second bookkeeping layer. Model it, or a re-take would look like a second claim.
      const at = rows.findIndex((r) => r.unitId === claim.unitId && r.sessionId === claim.sessionId);
      if (at === -1) rows.push(claim);
      else rows[at] = claim;
      return { acquired: true, claim, reclaimed: false };
    },
    async release() {
      return true;
    },
    async claimsFor(unitId: string) {
      return rows.filter((r) => r.unitId === unitId);
    },
  };
}

test("RESUME against REAL git: a re-run adopts its own cut-but-unprovisioned worktree instead of minting a second one", async () => {
  // THE SCENARIO, reproduced: run 1 takes the claim and really cuts the worktree, then dies before
  // provisioning (its `node_modules` are never created). Run 2 is the identical command.
  //
  // ONLY REAL GIT CAN PROVE THIS HALF. The adoption match compares the path git reports in
  // `worktree list --porcelain` against `path.join(<primary>/.claude/worktrees, <sessionId>)` — and on
  // Windows git prints `C:/…/x` while `path.join` produces `C:\…\x`. A fake registry that hands back
  // whatever the test built can never fail that comparison, so it cannot prove it either.
  const installs: string[] = [];
  const io: WorktreeCreateIo = {
    ...defaultWorktreeCreateIo,
    primaryRoot: () => primary,
    // The one stub: `install` is proven real below, and running pnpm inside this package-less fixture
    // would prove nothing about resume while costing the file another real install.
    install: (p) => {
      installs.push(p);
      return { ok: true, code: 0 };
    },
  };
  const ledger = recordingLedger();
  const shared = {
    ledger,
    io,
    stamps: () => [],
    checkpoint: () => {},
  };
  const intent = "resuming a partial ceremony";

  const first = await createWorktree(
    { nodes: ["resume-unit"], intent },
    { ...shared, generateSuffix: () => "aaa111" },
  );
  assert.equal(first.ok, true, first.body);
  const cut = path.join(primary, ".claude", "worktrees", "resume-unit-aaa111");
  assert.equal(existsSync(cut), true, "run 1 really cut a worktree");
  assert.equal(existsSync(path.join(cut, "node_modules")), false, "…and really never provisioned it");
  assert.deepEqual(installs, [cut]);
  assert.deepEqual(ledger.rows.map((r) => r.sessionId), ["resume-unit-aaa111"]);

  // Run 2: the SAME command. Its suffix generator would draw a different name, so an adoption is the
  // only way the second run can land on the first run's identity.
  const second = await createWorktree(
    { nodes: ["resume-unit"], intent },
    { ...shared, generateSuffix: () => "bbb222" },
  );
  assert.equal(second.ok, true, second.body);
  assert.match(second.body, /RESUMED/, "the envelope says it adopted rather than created");
  assert.ok(second.body.includes(cut), "…and hands back run 1's path");
  assert.equal(
    existsSync(path.join(primary, ".claude", "worktrees", "resume-unit-bbb222")),
    false,
    "NO second worktree — that duplication is the whole defect",
  );
  assert.deepEqual(installs, [cut, cut], "provisioning is what run 2 resumes");
  assert.deepEqual(
    ledger.rows.map((r) => r.sessionId),
    ["resume-unit-aaa111"],
    "the claim is re-taken in place, never abandoned and never doubled",
  );

  // And once it IS provisioned, the same command must stop adopting it — it is now a live workspace.
  mkdirSync(path.join(cut, "node_modules"), { recursive: true });
  const third = await createWorktree(
    { nodes: ["resume-unit"], intent },
    { ...shared, generateSuffix: () => "ccc333" },
  );
  assert.equal(third.ok, true, third.body);
  assert.doesNotMatch(third.body, /RESUMED/, "a provisioned tree belongs to a session that is using it");
  assert.equal(
    existsSync(path.join(primary, ".claude", "worktrees", "resume-unit-ccc333")),
    true,
    "so the ceremony mints and cuts its own",
  );
});

// ---------------------------------------------------------------------------
// install — the real pnpm spawn, including the Windows shim path
// ---------------------------------------------------------------------------

/**
 * Run `fn` with `CI` absent from the environment.
 *
 * `defaultInstall` builds its child env from `process.env`, and pnpm treats `CI` as an implicit
 * `--frozen-lockfile`, which a scratch directory with no `pnpm-lock.yaml` cannot satisfy. That is a
 * property of the AMBIENT environment, not of the default under test — nothing here stubs the
 * subject, and on a developer machine (no `CI`) this is a no-op.
 */
function withoutCiEnv(fn: () => void): void {
  const had = Object.prototype.hasOwnProperty.call(process.env, "CI");
  const prev = process.env["CI"];
  delete process.env["CI"];
  try {
    fn();
  } finally {
    if (had) process.env["CI"] = prev;
  }
}

test(
  "defaultInstall: a REAL pnpm install in a real directory reports ok (the win32 .cmd shim really resolves)",
  withTempDir((dir) => {
    // A dependency-free manifest: this proves the SPAWN — that `pnpm` is found and exits 0 — which is
    // the whole point on Windows, where the `pnpm.cmd` shim resolves only through a shell. It is
    // deliberately not a test of pnpm's resolver, and it needs no network.
    writeFileSync(
      path.join(dir, "package.json"),
      `${JSON.stringify({ name: "st-install-probe", version: "1.0.0", private: true }, null, 2)}\n`,
      "utf8",
    );

    withoutCiEnv(() => {
      assert.deepEqual(
        defaultWorktreeCreateIo.install(dir),
        { ok: true, code: 0 },
        "a real pnpm install in a valid package reports ok with code 0",
      );
    });
  }),
);

test(
  "defaultInstall: a REAL failing install RETURNS {ok:false} — it never throws (createWorktree depends on that)",
  withTempDir((dir) => {
    // Malformed manifest — real pnpm exits non-zero.
    writeFileSync(path.join(dir, "package.json"), "{ this is not json", "utf8");

    // The documented contract is "returns ok/code, never throws", and `createWorktree` leans on it:
    // a THROW and a FALSE produce different envelopes, and only the false one keeps the honest
    // "the worktree and claims stand" wording. Assert the shape, not pnpm's exit number.
    let res: { ok: boolean; code: number } | undefined;
    assert.doesNotThrow(() => {
      res = defaultWorktreeCreateIo.install(dir);
    }, "a failing install must be REPORTED, never thrown");
    assert.equal(res?.ok, false, "a failing install reports ok:false");
    assert.notEqual(res?.code, 0, "…with a non-zero code for the envelope to quote");
  }),
);
