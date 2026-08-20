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

/**
 * Probes over an in-memory map of path → branch, plus an optional set of paths whose HEAD is PINNED to
 * origin/main (ADR-0181). A path absent from the branch map does not exist; a path in `pinned` reads
 * `pinnedToOriginMain: true` (the detached-at/behind-origin/main canonical form).
 */
function probes(
  worktrees: Record<string, string | null>,
  pinned: Set<string> = new Set(),
  unregistered: Set<string> = new Set(),
): RuntimeRootProbes {
  return {
    exists: (p) => Object.prototype.hasOwnProperty.call(worktrees, p),
    isGitWorktree: (p) => !unregistered.has(p),
    branchOf: (p) => worktrees[p] ?? null,
    pinnedToOriginMain: (p) => pinned.has(p),
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

test("configured + present + on the local main branch → serves (back-compat name arm)", () => {
  const r = resolveRuntimeRoot(
    { configured: "/runtime", launchRoot: "/dev/checkout" },
    probes({ "/runtime": RUNTIME_BRANCH }), // local `main` branch, NOT flagged pinned — the name arm alone accepts
  );
  assert.deepEqual(r, { ok: true, root: "/runtime", source: "runtime" });
});

test("configured + DETACHED HEAD pinned to origin/main → serves (the canonical form, ADR-0181)", () => {
  // `git worktree add <path> origin/main` checks out a DETACHED HEAD (branch reads "HEAD"), pinned to
  // origin/main. This is the exact worktree the bootstrap recipe produces — the old literal
  // branch===main guard rejected it (the self-contradicting-guard bug); it must now be SERVED.
  const r = resolveRuntimeRoot(
    { configured: "/runtime", launchRoot: "/dev/checkout" },
    probes({ "/runtime": "HEAD" }, new Set(["/runtime"])),
  );
  assert.deepEqual(r, { ok: true, root: "/runtime", source: "runtime" });
});

test("configured + DETACHED HEAD behind origin/main → serves (the update flow ff's the behind case)", () => {
  // Behind-origin/main is still an ANCESTOR of origin/main → pinnedToOriginMain true → serve. The
  // desktop's behind-main banner then offers Rebuild & relaunch to advance it.
  const r = resolveRuntimeRoot(
    { configured: "/runtime", launchRoot: "/dev/checkout" },
    probes({ "/runtime": "HEAD" }, new Set(["/runtime"])),
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

test("configured but on a STRAY branch (not pinned) → refuses (the whole point — never serve a feature branch)", () => {
  const r = resolveRuntimeRoot(
    { configured: "/runtime", launchRoot: "/dev/checkout" },
    probes({ "/runtime": "claude/win-arm-real-worktree-fix" }), // a feature branch, not pinned to origin/main
  );
  assert.equal(r.ok, false);
  assert.match((r as { error: string }).error, /on 'claude\/win-arm-real-worktree-fix'/);
  assert.match((r as { error: string }).error, /not pinned to origin\/main/);
});

test("configured + DETACHED HEAD NOT reachable from origin/main → refuses (a stray detached commit is still rejected)", () => {
  // A detached HEAD on a commit OUTSIDE origin/main's history (a diverged/stray checkout) is NOT pinned —
  // the anti-stray intent must hold for detached HEADs too, not just named feature branches.
  const r = resolveRuntimeRoot(
    { configured: "/runtime", launchRoot: "/dev/checkout" },
    probes({ "/runtime": "HEAD" }, new Set()), // detached but not pinned
  );
  assert.equal(r.ok, false);
  assert.match((r as { error: string }).error, /not pinned to origin\/main/);
});

test("configured but git can't answer (null branch, not pinned) → refuses, naming the unknown state", () => {
  const r = resolveRuntimeRoot(
    { configured: "/runtime", launchRoot: "/dev/checkout" },
    probes({ "/runtime": null }), // a REGISTERED worktree git can still not name a branch for → fail-closed
  );
  assert.equal(r.ok, false);
  assert.match((r as { error: string }).error, /detached\/unknown/);
  assert.match((r as { error: string }).error, /not pinned to origin\/main/);
});

test("configured + present but NOT a registered worktree → names the LOST REGISTRATION, not a branch pin", () => {
  // The 2026-08-20 shape: the main checkout's `.git` was destroyed and re-cloned, so this worktree's
  // admin dir (`<main>/.git/worktrees/<name>`) no longer exists. The DIRECTORY and every file in it are
  // intact, and the code is legitimate merged `main` — git simply cannot read it, so `branchOf` reads
  // null exactly as a stray detached HEAD would. The old single message called this
  // "(detached/unknown) … not pinned to origin/main" and handed over a `git fetch && git checkout`
  // remedy that CANNOT RUN here: with no registration git answers `fatal: not a git repository`. The
  // two states need different fixes, so they must not share one message.
  const r = resolveRuntimeRoot(
    { configured: "/runtime", launchRoot: "/dev/checkout" },
    probes({ "/runtime": null }, new Set(), new Set(["/runtime"])),
  );
  assert.equal(r.ok, false);
  const { error } = r as { error: string };
  assert.match(error, /registration/i);
  assert.match(error, /not a git repository/);
  // The load-bearing half: the WRONG remedy must not be offered for this state.
  assert.doesNotMatch(error, /not pinned to origin\/main/);
  assert.doesNotMatch(error, /checkout --detach origin\/main/);
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
