// Runtime-status probe tests (ADR-0181 Decision 3). Branch + behind-main readers are injected doubles,
// so the compose + advisory-null handling runs offline — no real git, no repo.

import { test } from "node:test";
import assert from "node:assert/strict";

import { createRuntimeStatusProbe, fetchOriginBestEffort } from "./runtime-status.js";

test("probe: on main, up to date → { branch: 'main', behind: 0 }", async () => {
  const probe = createRuntimeStatusProbe("/runtime", async () => "main", async () => 0);
  assert.deepEqual(await probe(), { branch: "main", behind: 0 });
});

test("probe: on main, a merged fix waiting → behind is the commit count", async () => {
  const probe = createRuntimeStatusProbe("/runtime", async () => "main", async () => 3);
  assert.deepEqual(await probe(), { branch: "main", behind: 3 });
});

test("probe: a misconfigured runtime on a stray branch surfaces the branch (operator sees 'not main')", async () => {
  const probe = createRuntimeStatusProbe(
    "/runtime",
    async () => "claude/win-arm-real-worktree-fix",
    async () => 12,
  );
  assert.deepEqual(await probe(), { branch: "claude/win-arm-real-worktree-fix", behind: 12 });
});

test("probe: git unreachable → both fields null (health answers without them, never a throw)", async () => {
  const probe = createRuntimeStatusProbe("/runtime", async () => null, async () => null);
  assert.deepEqual(await probe(), { branch: null, behind: null });
});

test("probe: a partial answer (branch resolves, behind fails) is honestly partial", async () => {
  const probe = createRuntimeStatusProbe("/runtime", async () => "main", async () => null);
  assert.deepEqual(await probe(), { branch: "main", behind: null });
});

// ---- fetchOriginBestEffort: the launch update-check must never crash startup ----

test("fetchOriginBestEffort: resolves when the fetch succeeds, calling git in the given root", async () => {
  let calledWith: string | null = null;
  await fetchOriginBestEffort("/runtime", async (root) => {
    calledWith = root;
  });
  assert.equal(calledWith, "/runtime");
});

test("fetchOriginBestEffort: SWALLOWS a failing fetch (offline / no origin) — resolves, never rejects", async () => {
  await assert.doesNotReject(
    fetchOriginBestEffort("/runtime", async () => {
      throw new Error("fatal: unable to access origin (offline)");
    }),
  );
});
