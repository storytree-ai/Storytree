import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { buildManagedCodexWorktreeCreate } from "./codex-worktree-create-bundle.js";

test("managed worktree bootstrap is standalone and refuses every non-exact argument shape", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "storytree-codex-worktree-bootstrap-"));
  try {
    const payload = path.join(root, "bootstrap.mjs");
    const bundle = buildManagedCodexWorktreeCreate();
    writeFileSync(payload, bundle, "utf8");
    assert.match(bundle, /^#!\/usr\/bin\/env node/u);

    for (const argv of [
      [],
      ["--node", "unit", "--intent", "one line"],
      ["--node", "unit", "--intent", "one line", "--primary", "."],
      ["--node", "unit", "--node", "other", "--primary", path.resolve(root)],
      ["--node", "unit", "--intent", "two\nlines", "--primary", path.resolve(root)],
      ["worktree", "create", "--node", "unit", "--intent", "one line", "--primary", path.resolve(root)],
    ]) {
      const result = spawnSync(process.execPath, [payload, ...argv], { encoding: "utf8" });
      assert.equal(result.status, 2, `${argv.join(" ")}\n${result.stderr}`);
      assert.equal(result.stdout, "", argv.join(" "));
      assert.match(result.stderr, /failed closed/u, argv.join(" "));
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
