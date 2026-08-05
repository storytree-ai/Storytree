import { test } from "node:test";
import assert from "node:assert/strict";
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

/**
 * `sign-after-typecheck` (parallel-red-green-arc, stage-one defect 3): a REAL node's verdict must
 * not be signed ahead of the package backstop that is supposed to back it.
 *
 * At HEAD the backstop ran AFTER `proveUnit` returned — and only when `promote !== false`, so the
 * story chain's per-node verdicts had no backstop at all and the single-node path let a red set
 * `push: false` while the signing row stayed. `events.verdict` could therefore hold a signed PASS
 * over code the repo's own typecheck rejects. These are BEHAVIOUR assertions against
 * `buildNodeReal` — a red typecheck must produce a fail-closed GATE refusal with zero signing rows,
 * on BOTH the single-node and the chain (`promote: false`) paths.
 *
 * The worktree is deliberately NOT installed: `buildNodeReal` takes the worktree from its caller and
 * reads `realConfig.install` only to decide whether a backstop is owed, so a fixture can declare
 * `install: true` with cheap scripted commands and exercise the ordering without a `pnpm install`.
 */

/** A backstop command that is observed RED / GREEN off its exit code alone. */
const RED_COMMAND: ShellCommand = { file: "node", args: ["-e", "process.exit(1)"] };
const GREEN_COMMAND: ShellCommand = { file: "node", args: ["--version"] };

/** The fixture corpus the leaf's per-phase prompts render from (ADR-0302 D3: no credential in tests). */
async function fixtureCorpus(): Promise<InMemoryStore> {
  const corpus = new InMemoryStore();
  await loadFixtureCorpus(corpus);
  return corpus;
}

/** Drive one fixture `cap-a` through `buildNodeReal` with an injected backstop configuration. */
async function runFixtureNode(args: {
  typecheck: ShellCommand;
  promote: boolean;
}): Promise<{ ok: boolean; failedAt?: string; reason?: string; signingRows: number; promoted: boolean }> {
  const stories = await fixtureStories([{ id: "cap-a", dependsOn: [] }]);
  const repo = await fixtureRepo(false);
  const store = new InMemoryStore();
  const worktree = await createBuildWorktree(repo.root, {});
  try {
    const specFile = findNodeSpecFile(stories, "cap-a");
    assert.ok(specFile !== null, "the fixture cap-a spec must resolve");
    const spec: NodeSpec = loadNodeSpec(specFile as string);
    const resolved = resolveBuildConfig(spec);
    assert.ok(resolved !== null && resolved.config.real !== undefined, "cap-a must carry a real: arm");
    const buildConfig = resolved!.config;
    // install:true is what makes a backstop owed; the fixture's own proof command doubles as the
    // (green) regression suite, so only the typecheck varies between the red and green cases.
    const realConfig: RealProofConfig = {
      ...(buildConfig.real as RealProofConfig),
      install: true,
      typecheck: args.typecheck,
    };
    const signer = resolveSignerFromEnv({ flag: "tester@example.com" });
    assert.equal(signer.ok, true, "the fixture signer must resolve");
    const prompts = await renderLeafPhasePrompts(await fixtureCorpus());
    assert.equal(prompts.ok, true, "the Library leaf prompts must render");
    const author = scriptedAuthors({ "cap-a": scopeFor("cap-a") })(spec, worktree.root);
    assert.ok(author !== undefined, "the scripted author must resolve for cap-a");

    const built = await buildNodeReal({
      spec,
      worktree,
      baseSha: worktree.headSha,
      buildConfig,
      realConfig,
      store,
      runId: "backstop-order-test",
      signer: (signer as { ok: true; signer: string }).signer,
      phasePrompts: (prompts as { ok: true; prompts: never }).prompts,
      repoRoot: repo.root,
      promote: args.promote,
      authorOverride: author,
    });

    const signingRows = (await store.readEvents()).filter((e) => e.kind === "signing").length;
    return {
      ok: built.result.ok,
      ...(built.result.ok ? {} : { failedAt: built.result.failedAt, reason: built.result.reason }),
      signingRows,
      promoted: built.promotion !== undefined,
    };
  } finally {
    await worktree.remove();
    await rm(stories, { recursive: true, force: true });
    await rm(repo.root, { recursive: true, force: true });
  }
}

test("a-red-backstop-refuses-before-the-signature: a single-node --real build with a RED package typecheck fails closed at GATE and signs NOTHING", async () => {
  const outcome = await runFixtureNode({ typecheck: RED_COMMAND, promote: true });

  assert.equal(outcome.ok, false, "a red backstop is not a proven unit");
  assert.equal(outcome.failedAt, "GATE");
  assert.match(outcome.reason ?? "", /backstop RED/);
  assert.equal(
    outcome.signingRows,
    0,
    "the signed history must not carry a PASS the package typecheck rejects",
  );
  assert.equal(outcome.promoted, false, "nothing is promoted from an unsigned walk");
});

test("the-chain-path-pays-it-too: a chain node (promote:false) with a RED package typecheck also fails closed at GATE and signs NOTHING", async () => {
  // The audit named only the chain, and the chain was the WORSE case: `promote: false` skipped the
  // backstop outright, so every chained verdict was signed with no package observation at all.
  const outcome = await runFixtureNode({ typecheck: RED_COMMAND, promote: false });

  assert.equal(outcome.ok, false);
  assert.equal(outcome.failedAt, "GATE");
  assert.equal(outcome.signingRows, 0);
});

test("a-green-backstop-still-signs: a GREEN package typecheck plus a GREEN suite signs exactly one verdict and promotes", async () => {
  const outcome = await runFixtureNode({ typecheck: GREEN_COMMAND, promote: true });

  assert.equal(outcome.ok, true, `the green path must be unchanged (${outcome.reason ?? ""})`);
  assert.equal(outcome.signingRows, 1);
  assert.equal(outcome.promoted, true);
});
