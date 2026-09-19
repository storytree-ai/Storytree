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
/**
 * A package-suite command that is RED. Declared as the node's `proof.command`, it proves the build
 * never runs that command: ADR-0580 D2 took the package suite out of the build, so a red one here
 * must change nothing about the verdict.
 */
const SUITE_RED: ShellCommand = {
  file: process.execPath,
  args: ["-e", "process.stdout.write('SUITE-STDOUT'); process.exit(9)"],
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
  /** Replaces the spec's declared package-suite command (`proof.command`). */
  suiteCommand?: ShellCommand;
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
        // The spec itself carries the replaced suite command, so it is in front of every reader the
        // build has — the resolver, the gate and the backstop alike.
        const buildConfig =
          args.suiteCommand === undefined
            ? resolved.config
            : { ...resolved.config, command: args.suiteCommand };
        const drivenSpec: NodeSpec = { ...spec, buildConfig };
        const realConfig: RealProofConfig = {
          ...(buildConfig.real as RealProofConfig),
          install: true,
          typecheck: args.typecheck,
        };
        const signer = resolveSignerFromEnv({ flag: "tester@example.com" });
        assert.equal(signer.ok, true, "the fixture signer must resolve");
        const author = scriptedAuthors({ "cap-a": scopeFor("cap-a") })(drivenSpec, worktree.root);
        assert.ok(author !== undefined, "the scripted author must resolve for cap-a");

        const built = await buildNodeReal({
          spec: drivenSpec,
          worktree,
          baseSha: worktree.headSha,
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
  "a red typecheck on the chain path (promote:false) retains the exact authored HEAD too",
  { timeout: 180_000 },
  async () => {
    const chainRed = await runScenario({
      runId: "chain-typecheck-red-forensics",
      typecheck: TYPECHECK_RED,
      promote: false,
    });
    assert.equal(chainRed.built.result.ok, false);
    if (chainRed.built.result.ok) assert.fail("the red typecheck unexpectedly signed");
    assert.equal(chainRed.built.result.failedAt, "GATE");
    assert.equal(chainRed.signingRows, 0);
    assert.equal(chainRed.built.typecheck, "red");
    assert.deepEqual(chainRed.built.backstopObservation, {
      kind: "typecheck",
      result: "red",
      originalProcessResult: {
        stdout: "TYPECHECK-STDOUT",
        stderr: "TYPECHECK-STDERR",
        exitCode: 7,
      },
      timeoutMs: 60_000,
    });
    const chainForensic = chainRed.built.forensicPreservation;
    assert.ok(chainForensic !== undefined);
    assert.equal(chainForensic.branch, "claude/real-forensics/cap-a-chain-typecheck-red-forensics");
    assert.equal(chainForensic.pushed, false);
    assert.equal(chainRed.preservedShaAfterRemoval, chainForensic.commitSha);
    assert.equal(chainRed.remoteForensicRef, "");
  },
);

test(
  "a green install-bearing backstop still signs and pushes ordinary promotion, even over a red package suite no build runs",
  { timeout: 180_000 },
  async () => {
    const green = await runScenario({
      runId: "green-still-promotes",
      typecheck: GREEN,
      // ADR-0580 D2: the node's declared package suite is RED, and it must change nothing.
      suiteCommand: SUITE_RED,
      promote: true,
    });
    assert.equal(green.built.result.ok, true, green.built.result.ok ? "" : green.built.result.reason);
    assert.equal(green.built.typecheck, "green");
    assert.equal(green.signingRows, 1);
    assert.ok(green.built.promotion !== undefined);
    assert.equal(green.built.promotion.pushed, true);
    assert.match(green.remotePromotionRef ?? "", new RegExp(green.built.promotion.commitSha));
    assert.equal(Object.hasOwn(green.built, "backstopObservation"), false);
    assert.equal(Object.hasOwn(green.built, "forensicPreservation"), false);
  },
);
