// Contract for the fresh-worktree pre-provisioner (`packages/cli/provision-worktree.mjs`,
// ADR-0162 inc 3 — BOOT: move the mandatory `pnpm install` off the agent's onboarding tool-call path
// into a SessionStart hook). Its behavioural invariants:
//   - idempotent / detects an already-installed worktree → a no-op fast path (installer NOT called),
//     which is what makes it safe to run at EVERY SessionStart;
//   - a fresh worktree runs the installer exactly once, at the worktree root;
//   - an install failure surfaces a non-zero exit code — UNLESS `--hook` mode swallows it so a failed
//     install never breaks the session.
// The installer is injected so the contract is proven WITHOUT spawning a real pnpm (slow, networked,
// environment-dependent); one spawn of the real entry proves the fast-path wiring end-to-end.
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import { test } from "node:test";

import { needsProvision, provisionWorktree, exitCode } from "../provision-worktree.mjs";

const SCRIPT = fileURLToPath(new URL("../provision-worktree.mjs", import.meta.url));

/** A throwaway worktree root. `provisioned` seeds pnpm's install-complete marker (.modules.yaml). */
function makeTmpRoot(provisioned: boolean): string {
  const dir = mkdtempSync(join(tmpdir(), "st-provision-"));
  if (provisioned) {
    mkdirSync(join(dir, "node_modules"), { recursive: true });
    writeFileSync(join(dir, "node_modules", ".modules.yaml"), "hoistPattern:\n  - '*'\n");
  }
  return dir;
}

test("needsProvision: an installed worktree is skipped, a fresh one is flagged", () => {
  const installed = makeTmpRoot(true);
  const fresh = makeTmpRoot(false);
  try {
    assert.equal(needsProvision(installed), false, "node_modules/.modules.yaml ⇒ provisioned");
    assert.equal(needsProvision(fresh), true, "no node_modules ⇒ needs provisioning");
  } finally {
    rmSync(installed, { recursive: true, force: true });
    rmSync(fresh, { recursive: true, force: true });
  }
});

test("provisionWorktree: an already-installed worktree is a no-op fast path (installer not called)", () => {
  const root = makeTmpRoot(true);
  try {
    let called = false;
    const res = provisionWorktree({
      root,
      install: () => {
        called = true;
        return { ok: true, code: 0 };
      },
    });
    assert.equal(called, false, "must not install a provisioned worktree");
    assert.deepEqual(res, { provisioned: false, ok: true, code: 0, reason: "already-provisioned" });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("provisionWorktree: a fresh worktree runs the installer once, at the worktree root", () => {
  const root = makeTmpRoot(false);
  try {
    const calls: string[] = [];
    const res = provisionWorktree({
      root,
      install: (r) => {
        calls.push(r);
        return { ok: true, code: 0 };
      },
    });
    assert.deepEqual(calls, [root], "installer called exactly once, at the worktree root");
    assert.equal(res.provisioned, true);
    assert.equal(res.ok, true);
    assert.equal(res.code, 0);
    assert.equal(res.reason, "installed");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("provisionWorktree: a failed install surfaces its non-zero exit code", () => {
  const root = makeTmpRoot(false);
  try {
    const res = provisionWorktree({ root, install: () => ({ ok: false, code: 7 }) });
    assert.equal(res.ok, false);
    assert.equal(res.code, 7, "the installer's failure code is propagated");
    assert.equal(res.reason, "install-failed");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("exitCode: --hook swallows failure (never breaks the session); standalone propagates it", () => {
  assert.equal(exitCode({ code: 1 }, true), 0, "hook mode exits 0 even on failure");
  assert.equal(exitCode({ code: 7 }, false), 7, "standalone propagates the real code");
  assert.equal(exitCode({ code: 0 }, false), 0);
});

test("entry: `node provision-worktree.mjs --root <provisioned>` fast-paths to exit 0 without installing", () => {
  const root = makeTmpRoot(true);
  try {
    const res = spawnSync(process.execPath, [SCRIPT, "--root", root], { encoding: "utf8" });
    assert.equal(res.status, 0, `a provisioned root must exit 0; stderr: ${res.stderr}`);
    assert.doesNotMatch(res.stderr ?? "", /running pnpm install/, "must not attempt install on a provisioned root");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
