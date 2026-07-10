// Runtime-root resolver tests (ADR-0181). The exists/branchOf probes are in-memory doubles, so every
// branch of the fail-closed resolve runs offline — no real fs, no git, no worktree.

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  RUNTIME_BRANCH,
  resolveRuntimeRoot,
  type RuntimeRootProbes,
} from "./runtime-root.js";

/** Probes over an in-memory map of path → branch. A path absent from the map does not exist. */
function probes(worktrees: Record<string, string | null>): RuntimeRootProbes {
  return {
    exists: (p) => Object.prototype.hasOwnProperty.call(worktrees, p),
    branchOf: (p) => worktrees[p] ?? null,
  };
}

test("no runtime configured → serves the launch checkout (dev-convenience fallback)", () => {
  const r = resolveRuntimeRoot({ configured: null, launchRoot: "/dev/checkout" }, probes({}));
  assert.deepEqual(r, { ok: true, root: "/dev/checkout", source: "launch" });
});

test("blank/whitespace runtime is treated as unconfigured (falls back, never refuses)", () => {
  const r = resolveRuntimeRoot({ configured: "   ", launchRoot: "/dev/checkout" }, probes({}));
  assert.deepEqual(r, { ok: true, root: "/dev/checkout", source: "launch" });
});

test("configured + present + on main → serves the runtime worktree", () => {
  const r = resolveRuntimeRoot(
    { configured: "/runtime", launchRoot: "/dev/checkout" },
    probes({ "/runtime": RUNTIME_BRANCH }),
  );
  assert.deepEqual(r, { ok: true, root: "/runtime", source: "runtime" });
});

test("configured but MISSING → refuses with a `git worktree add` hint (never falls back to the launch checkout)", () => {
  const r = resolveRuntimeRoot(
    { configured: "/runtime", launchRoot: "/dev/checkout" },
    probes({}),
  );
  assert.equal(r.ok, false);
  assert.match((r as { error: string }).error, /not found at \/runtime/);
  assert.match((r as { error: string }).error, /git worktree add \/runtime origin\/main/);
});

test("configured but on a STRAY branch → refuses (the whole point — never serve a feature branch)", () => {
  const r = resolveRuntimeRoot(
    { configured: "/runtime", launchRoot: "/dev/checkout" },
    probes({ "/runtime": "claude/win-arm-real-worktree-fix" }),
  );
  assert.equal(r.ok, false);
  assert.match((r as { error: string }).error, /on 'claude\/win-arm-real-worktree-fix', not 'main'/);
});

test("configured but detached/unknown branch → refuses, naming the unknown state", () => {
  const r = resolveRuntimeRoot(
    { configured: "/runtime", launchRoot: "/dev/checkout" },
    probes({ "/runtime": null }),
  );
  assert.equal(r.ok, false);
  assert.match((r as { error: string }).error, /detached\/unknown/);
});
