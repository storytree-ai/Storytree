import assert from "node:assert/strict";
import { test } from "node:test";

import {
  CODEX_MULTIFILE_RUNTIME_SEAM_ID,
  codexMultifileRuntimeSeamSpec,
  nodeBuild,
} from "./node-build.js";
import { silentBuildProgress } from "./build-progress.js";

test("the built-in Codex smoke declares two literal IMPLEMENT targets", () => {
  const spec = codexMultifileRuntimeSeamSpec();
  const real = spec.buildConfig?.real;

  assert.equal(spec.id, CODEX_MULTIFILE_RUNTIME_SEAM_ID);
  assert.deepEqual(real?.scope.sourceGlobs, ["sum.cjs", "format.cjs"]);
  assert.ok(real?.scope.sourceGlobs.every((target) => !/[*?\[\]{}()!+@]/.test(target)));
  assert.match(spec.guidance ?? "", /edit BOTH exact files/);
});

test("the no-subscription walk observes assertion red then green only after both files change", async () => {
  const result = await nodeBuild(CODEX_MULTIFILE_RUNTIME_SEAM_ID, {
    dryRun: true,
    actor: "fixture@storytree.invalid",
    progress: silentBuildProgress(),
  });

  assert.equal(result.ok, true, result.body);
  assert.match(
    result.body,
    /phase trail: AUTHOR_TEST → CONFIRM_RED → IMPLEMENT → CONFIRM_GREEN → GATE/,
  );
  assert.match(result.body, /verdict:\s+PASS codex-multifile-runtime-seam/);
  assert.ok(
    result.next?.some((line) =>
      line.includes(
        "node build codex-multifile-runtime-seam --live --runtime codex --actor <email>",
      ),
    ) === true,
  );
});

test("the fixture is Codex-only when live and can never enter repository-promoting real mode", async () => {
  const wrongRuntime = await nodeBuild(CODEX_MULTIFILE_RUNTIME_SEAM_ID, {
    dryRun: false,
    live: true,
    runtime: "claude",
    actor: "fixture@storytree.invalid",
    progress: silentBuildProgress(),
  });
  assert.equal(wrongRuntime.ok, false);
  assert.match(wrongRuntime.body, /select --runtime codex/);

  const real = await nodeBuild(CODEX_MULTIFILE_RUNTIME_SEAM_ID, {
    dryRun: false,
    real: true,
    runtime: "codex",
    actor: "fixture@storytree.invalid",
    progress: silentBuildProgress(),
  });
  assert.equal(real.ok, false);
  assert.match(real.body, /disposable synthetic smoke and cannot run with --real/);
});
