import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { rm } from "node:fs/promises";

import { InMemoryStore } from "@storytree/storage-protocol";
import { loadFixtureCorpus } from "@storytree/library/fixture";
import {
  createBuildWorktree,
  findNodeSpecFile,
  loadNodeSpec,
  resolveBuildConfig,
  resolveSignerFromEnv,
} from "@storytree/orchestrator";
import type { NodeSpec, RealProofConfig, ShellCommand } from "@storytree/orchestrator";

import { buildNodeReal, renderLeafPhasePrompts } from "./node-build.js";
import { fixtureRepo, fixtureStories, scriptedAuthors, scopeFor } from "./real-chain-fixture.js";

const TYPECHECK_RED: ShellCommand = {
  file: process.execPath,
  args: [
    "-e",
    "process.stdout.write('TYPECHECK-STDOUT'); process.stderr.write('TYPECHECK-STDERR'); process.exit(7)",
  ],
  timeoutMs: 60_000,
};
const GREEN: ShellCommand = { file: process.execPath, args: ["--version"] };
const REGRESSION_RED: ShellCommand = {
  file: process.execPath,
  args: [
    "-e",
    "process.stdout.write('REGRESSION-STDOUT'); process.stderr.write('REGRESSION-STDERR'); process.exit(9)",
  ],
  timeoutMs: 70_000,
};

interface ScenarioResult {
  built: Awaited<ReturnType<typeof buildNodeReal>>;
  signingRows: number;
  baseSha: string;
  preservedShaAfterRemoval?: string;
  remoteForensicRef?: string;
  remotePromotionRef?: string;
}

interface ScenarioArgs {
  runId: string;
  typecheck: ShellCommand;
  regression?: ShellCommand;
  promote: boolean;
}

async function runScenario(args: ScenarioArgs): Promise<ScenarioResult> {
  const stories = await fixtureStories([{ id: "cap-a", dependsOn: [] }]);
  try {
    const repo = await fixtureRepo(true);
    try {
      const origin = repo.origin;
      assert.ok(origin !== null, "withOrigin:true must provision the local bare origin");
      const corpus = new InMemoryStore();
      await loadFixtureCorpus(corpus);
      const prompts = await renderLeafPhasePrompts(corpus);
      assert.equal(prompts.ok, true, "the Library leaf prompts must render");

      const store = new InMemoryStore();
      const worktree = await createBuildWorktree(repo.root, {});
      try {
        const specFile = findNodeSpecFile(stories, "cap-a");
        assert.ok(specFile !== null, "the fixture cap-a spec must resolve");
        const spec: NodeSpec = loadNodeSpec(specFile);
        const resolved = resolveBuildConfig(spec);
        assert.ok(
          resolved !== null && resolved.config.real !== undefined,
          "cap-a must carry a real: arm",
        );
        const buildConfig =
          args.regression === undefined
            ? resolved.config
            : { ...resolved.config, command: args.regression };
        const realConfig: RealProofConfig = {
          ...(buildConfig.real as RealProofConfig),
          install: true,
          typecheck: args.typecheck,
        };
        const signer = resolveSignerFromEnv({ flag: "tester@example.com" });
        assert.equal(signer.ok, true, "the fixture signer must resolve");
        const author = scriptedAuthors({ "cap-a": scopeFor("cap-a") })(spec, worktree.root);
        assert.ok(author !== undefined, "the scripted author must resolve for cap-a");

        const built = await buildNodeReal({
          spec,
          worktree,
          baseSha: worktree.headSha,
          buildConfig,
          realConfig,
          store,
          runId: args.runId,
          signer: (signer as { ok: true; signer: string }).signer,
          phasePrompts: (prompts as { ok: true; prompts: never }).prompts,
          repoRoot: repo.root,
          promote: args.promote,
          authorOverride: author,
        });

        const result: ScenarioResult = {
          built,
          signingRows: (await store.readEvents()).filter((event) => event.kind === "signing").length,
          baseSha: worktree.headSha,
        };
        await worktree.remove();
        if (built.forensicPreservation !== undefined) {
          result.preservedShaAfterRemoval = execFileSync(
            "git",
            ["rev-parse", built.forensicPreservation.branch],
            { cwd: repo.root, encoding: "utf8" },
          ).trim();
          result.remoteForensicRef = execFileSync(
            "git",
            ["ls-remote", "--heads", origin, built.forensicPreservation.branch],
            { cwd: repo.root, encoding: "utf8" },
          ).trim();
        }
        if (built.promotion !== undefined) {
          result.remotePromotionRef = execFileSync(
            "git",
            ["ls-remote", "--heads", origin, built.promotion.branch],
            { cwd: repo.root, encoding: "utf8" },
          ).trim();
        }
        return result;
      } finally {
        await worktree.remove();
      }
    } finally {
      await rm(repo.root, { recursive: true, force: true });
      if (repo.origin !== null) await rm(repo.origin, { recursive: true, force: true });
    }
  } finally {
    await rm(stories, { recursive: true, force: true });
  }
}

test(
  "a red typecheck retains the exact authored HEAD and its captured diagnostics",
  { timeout: 180_000 },
  async () => {
    const typecheckRed = await runScenario({
      runId: "typecheck-red-forensics",
      typecheck: TYPECHECK_RED,
      // This must never run: a typecheck red is the first actionable refusal. Keeping the sentinel
      // fast also makes a broken short-circuit fail this assertion instead of timing out in the
      // fixture's broad default suite.
      regression: REGRESSION_RED,
      promote: true,
    });
    assert.equal(typecheckRed.built.result.ok, false);
    if (typecheckRed.built.result.ok) assert.fail("the red typecheck unexpectedly signed");
    assert.equal(typecheckRed.built.result.failedAt, "GATE");
    assert.match(typecheckRed.built.result.reason, /the package typecheck is RED in the worktree/);
    assert.equal(typecheckRed.signingRows, 0);
    assert.equal(typecheckRed.built.promotion, undefined);
    assert.deepEqual(typecheckRed.built.backstopObservation, {
      kind: "typecheck",
      result: "red",
      originalProcessResult: {
        stdout: "TYPECHECK-STDOUT",
        stderr: "TYPECHECK-STDERR",
        exitCode: 7,
      },
      timeoutMs: 60_000,
    });
    const typecheckForensic = typecheckRed.built.forensicPreservation;
    assert.ok(typecheckForensic !== undefined);
    assert.equal(
      typecheckForensic.branch,
      "claude/real-forensics/cap-a-typecheck-red-forensics",
    );
    assert.equal(typecheckForensic.pushed, false);
    assert.notEqual(typecheckForensic.commitSha, typecheckRed.baseSha);
    assert.equal(typecheckRed.preservedShaAfterRemoval, typecheckForensic.commitSha);
    assert.equal(typecheckRed.remoteForensicRef, "");
  },
);

test(
  "a red regression retains the exact authored HEAD after a green typecheck",
  { timeout: 180_000 },
  async () => {
    const regressionRed = await runScenario({
      runId: "regression-red-forensics",
      typecheck: GREEN,
      regression: REGRESSION_RED,
      promote: false,
    });
    assert.equal(regressionRed.built.result.ok, false);
    if (regressionRed.built.result.ok) assert.fail("the red regression unexpectedly signed");
    assert.equal(regressionRed.built.result.failedAt, "GATE");
    assert.match(
      regressionRed.built.result.reason,
      /the package regression suite is RED in the worktree/,
    );
    assert.equal(regressionRed.signingRows, 0);
    assert.equal(regressionRed.built.typecheck, "green");
    assert.equal(regressionRed.built.regression, "red");
    assert.deepEqual(regressionRed.built.backstopObservation, {
      kind: "regression",
      result: "red",
      originalProcessResult: {
        stdout: "REGRESSION-STDOUT",
        stderr: "REGRESSION-STDERR",
        exitCode: 9,
      },
      timeoutMs: 70_000,
    });
    const regressionForensic = regressionRed.built.forensicPreservation;
    assert.ok(regressionForensic !== undefined);
    assert.equal(
      regressionForensic.branch,
      "claude/real-forensics/cap-a-regression-red-forensics",
    );
    assert.equal(regressionForensic.pushed, false);
    assert.equal(regressionRed.preservedShaAfterRemoval, regressionForensic.commitSha);
    assert.equal(regressionRed.remoteForensicRef, "");
  },
);

test(
  "a green install-bearing backstop still signs and pushes ordinary promotion",
  { timeout: 180_000 },
  async () => {
    const green = await runScenario({
      runId: "green-still-promotes",
      typecheck: GREEN,
      promote: true,
    });
    assert.equal(green.built.result.ok, true, green.built.result.ok ? "" : green.built.result.reason);
    assert.equal(green.signingRows, 1);
    assert.ok(green.built.promotion !== undefined);
    assert.equal(green.built.promotion.pushed, true);
    assert.match(green.remotePromotionRef ?? "", new RegExp(green.built.promotion.commitSha));
    assert.equal(Object.hasOwn(green.built, "backstopObservation"), false);
    assert.equal(Object.hasOwn(green.built, "forensicPreservation"), false);
  },
);
