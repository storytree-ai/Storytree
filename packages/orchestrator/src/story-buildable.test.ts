import test from "node:test";
import assert from "node:assert/strict";

import type { NodeSpec } from "./node-spec.js";
import type { NodeBuildConfig } from "./proof-config.js";
import { isStoryBuildable, storyDriveOrder } from "./story-build.js";

// Stage-1 red-green for the studio's story-level Build affordance (ADR-0090 Phase 2 increment): the
// SHARED predicate that decides whether `story build <id> --<mode>` has real work to drive, so the
// UI's "is this story buildable" answer mirrors what the build would actually run (never a drifting
// guess). Pure over hand-built NodeSpecs (the loader's output shape), no FS / no DB.

/** A minimal NodeSpec literal; pass a buildConfig to make the node buildable. */
function spec(
  id: string,
  tier: NodeSpec["tier"],
  opts: {
    dependsOn?: string[];
    capabilities?: string[];
    uatWitness?: NodeSpec["uatWitness"];
    buildConfig?: NodeBuildConfig;
  } = {},
): NodeSpec {
  return {
    id,
    tier,
    title: id,
    outcome: `outcome of ${id}`,
    status: "proposed",
    proofMode: tier === "story" ? "UAT" : "integration-test",
    uatWitness: opts.uatWitness,
    story: tier === "story" ? undefined : "s",
    dependsOn: opts.dependsOn ?? [],
    consumedBy: [],
    capabilities: opts.capabilities ?? [],
    decisions: [],
    buildConfig: opts.buildConfig,
    guidance: undefined,
    uatTests: [],
    reliabilityGates: [],
    file: `${id}.md`,
  };
}

const cmd = { file: "node", args: ["--test"] };
const scope = { testGlobs: ["*.test.ts"], sourceGlobs: ["*.ts"] };
/** A live/dry-buildable config (a proof command + scope, no `real:` arm). */
const liveCfg: NodeBuildConfig = { command: cmd, scope };
/** A real-buildable config (adds the `real:` arm `--real` needs). */
const realCfg: NodeBuildConfig = {
  command: cmd,
  scope,
  real: { testFile: "x.test.ts", sourceFile: "x.ts", scope },
};

// ── isStoryBuildable ────────────────────────────────────────────────────────

test("a human-witnessed story with all-real-buildable caps is buildable both live and real (story node withheld)", () => {
  // notice-board / binding-staleness shape: human witness ⇒ story UAT node withheld; every cap real.
  const caps = [spec("c1", "capability", { buildConfig: realCfg }), spec("c2", "capability", { buildConfig: realCfg })];
  const story = spec("nb", "story", { capabilities: ["c1", "c2"] }); // uatWitness undefined ⇒ human
  assert.equal(isStoryBuildable(story, caps, "live"), true);
  assert.equal(isStoryBuildable(story, caps, "real"), true);
});

test("a story whose caps are live-only is live-buildable but NOT real-buildable", () => {
  // library shape: caps carry a (registry/spec) proof config but NO real: arm.
  const caps = [spec("c1", "capability", { buildConfig: liveCfg }), spec("c2", "capability", { buildConfig: liveCfg })];
  const story = spec("lib", "story", { capabilities: ["c1", "c2"] });
  assert.equal(isStoryBuildable(story, caps, "live"), true);
  assert.equal(isStoryBuildable(story, caps, "real"), false);
});

test("a machine-witnessed story drives its own UAT node, so a live-only story node blocks --real (library today)", () => {
  // Machine witness ⇒ the story node is DRIVEN (not withheld). Its caps are real, but the story
  // node has only a live config (a UAT ceremony, no real: arm) ⇒ --real is refused; --live is fine.
  const caps = [spec("c1", "capability", { buildConfig: realCfg })];
  const story = spec("m", "story", { capabilities: ["c1"], uatWitness: "machine", buildConfig: liveCfg });
  assert.equal(isStoryBuildable(story, caps, "live"), true);
  assert.equal(isStoryBuildable(story, caps, "real"), false);
});

test("a capless story (e.g. agent) is not buildable in any mode — nothing to drive", () => {
  const story = spec("agent", "story", {}); // 0 caps, human witness ⇒ empty drive order
  assert.equal(isStoryBuildable(story, [], "live"), false);
  assert.equal(isStoryBuildable(story, [], "real"), false);
});

test("a story whose caps carry no proof config (e.g. drive-machinery) is not buildable", () => {
  const caps = [spec("c1", "capability"), spec("c2", "capability")]; // no buildConfig
  const story = spec("dm", "story", { capabilities: ["c1", "c2"] });
  assert.equal(isStoryBuildable(story, caps, "live"), false);
  assert.equal(isStoryBuildable(story, caps, "real"), false);
});

test("one non-real cap makes the whole story not real-buildable (every driven node must qualify)", () => {
  const caps = [spec("c1", "capability", { buildConfig: realCfg }), spec("c2", "capability", { buildConfig: liveCfg })];
  const story = spec("mix", "story", { capabilities: ["c1", "c2"] });
  assert.equal(isStoryBuildable(story, caps, "real"), false);
  assert.equal(isStoryBuildable(story, caps, "live"), true);
});

test("a malformed story (a listed cap with no spec) is not buildable — the topo refusal propagates", () => {
  const story = spec("bad", "story", { capabilities: ["missing"] });
  assert.equal(isStoryBuildable(story, [], "real"), false);
});

// ── storyDriveOrder (the drive set the build would run) ──────────────────────

test("storyDriveOrder withholds the story node for a human-witnessed story, keeps it for machine", () => {
  const caps = [spec("c1", "capability", { buildConfig: realCfg })];
  const human = spec("h", "story", { capabilities: ["c1"] });
  const machine = spec("m", "story", { capabilities: ["c1"], uatWitness: "machine" });

  const hd = storyDriveOrder(human, caps);
  assert.ok(hd.ok);
  assert.deepEqual(hd.order.map((n) => n.id), ["c1"]); // story node withheld

  const md = storyDriveOrder(machine, caps);
  assert.ok(md.ok);
  assert.deepEqual(md.order.map((n) => n.id), ["c1", "m"]); // story node driven (last)
});
