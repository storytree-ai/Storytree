// Runtime-root resolver tests (ADR-0181). The exists/branchOf probes are in-memory doubles, so every
// branch of the fail-closed resolve runs offline — no real fs, no git, no worktree.

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  RUNTIME_BRANCH,
  pickConfiguredRuntime,
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

// ---- pickConfiguredRuntime: env-wins-then-file source selection (ADR-0181 Decision 1) ----

test("pickConfiguredRuntime: env wins over the config file when set", () => {
  assert.equal(
    pickConfiguredRuntime("/from/env", JSON.stringify({ path: "/from/file" })),
    "/from/env",
  );
});

test("pickConfiguredRuntime: a blank/whitespace env falls through to the config file", () => {
  assert.equal(pickConfiguredRuntime("   ", JSON.stringify({ path: "/from/file" })), "/from/file");
});

test("pickConfiguredRuntime: no env + no file → null (unconfigured, launch fallback)", () => {
  assert.equal(pickConfiguredRuntime(null, null), null);
});

test("pickConfiguredRuntime: reads the `path` field from the config file when env is absent", () => {
  assert.equal(pickConfiguredRuntime(null, JSON.stringify({ path: "/runtime" })), "/runtime");
});

test("pickConfiguredRuntime: trims the config file path and treats a blank one as unconfigured", () => {
  assert.equal(pickConfiguredRuntime(null, JSON.stringify({ path: "  /runtime  " })), "/runtime");
  assert.equal(pickConfiguredRuntime(null, JSON.stringify({ path: "   " })), null);
});

test("pickConfiguredRuntime: malformed JSON / missing path → null, never throws", () => {
  assert.equal(pickConfiguredRuntime(null, "not json {"), null);
  assert.equal(pickConfiguredRuntime(null, JSON.stringify({ other: "x" })), null);
  assert.equal(pickConfiguredRuntime(null, JSON.stringify({ path: 42 })), null);
});
