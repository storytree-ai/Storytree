// routed-node-real-dispatch — the ADR-0144 node-branch flip.
//
// Before ADR-0144: routedBuildRunner routed a NODE unit to the synthetic --live smoke:
//   nodeBuild(unitId, { live: true, dryRun: false, real: false }) — non-persisting, proved the pipeline
//   on a synthetic add(2,3) task only, verdictStore omitted.
//
// After ADR-0144: the node branch drives the node's REAL proof with persist semantics:
//   nodeBuild(unitId, { real: true, dryRun: false, verdictStore: 'pg' }) — persists the signed verdict,
//   parks a claude/real/<unit>-<run> branch for the human to land (ADR-0031, ADR-0136 wall: no openPr).
//
// One named, substantive test per contract (the ADR-0122/0126 coverage convention: the test name
// carries the contract id VERBATIM as its prefix).

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  routedBuildRunner,
  type NodeBuildLikeOpts,
  type StoryBuildLikeOpts,
  type RoutedBuildDeps,
  type BuildKind,
} from "./build-worker.js";

/** Drive one routed dispatch with scripted entries, capturing opts + sink lines. */
async function driveRouted(kind: BuildKind, unitId: string, actor?: string) {
  let nodeOpts: NodeBuildLikeOpts | undefined;
  let storyOpts: StoryBuildLikeOpts | undefined;
  let nodeCalls = 0;
  let storyCalls = 0;
  const sinkLines: string[] = [];
  const deps: RoutedBuildDeps = {
    classify: async (): Promise<BuildKind> => kind,
    nodeBuild: async (_unitId, opts) => {
      nodeCalls += 1;
      nodeOpts = opts;
      return { ok: true, body: "node-envelope" };
    },
    storyBuild: async (_storyId, opts) => {
      storyCalls += 1;
      storyOpts = opts;
      return { ok: true, body: "story-envelope" };
    },
    ...(actor !== undefined ? { actor } : {}),
  };
  await routedBuildRunner(deps)(unitId, (line) => sinkLines.push(line));
  return { nodeOpts, storyOpts, nodeCalls, storyCalls, sinkLines };
}

// ---------------------------------------------------------------------------
// Contract 1 — rnrd-node-accept-drives-real-persist
// ---------------------------------------------------------------------------

test("rnrd-node-accept-drives-real-persist: a NODE-classified dispatch drives nodeBuild once with real:true, dryRun:false, verdictStore:'pg' (actor threaded; story entry never fires)", async () => {
  const { nodeOpts, nodeCalls, storyCalls } = await driveRouted("node", "test-node-unit", "op@example.com");

  assert.equal(nodeCalls, 1, "nodeBuild fires exactly once for a node-classified unit");
  assert.equal(storyCalls, 0, "storyBuild never fires for a node-classified unit");
  if (nodeOpts === undefined) throw new Error("nodeBuild was not invoked for a node-classified unit");

  // ADR-0144: the node branch drives the REAL proof (real: true), not the synthetic smoke.
  assert.equal(
    nodeOpts.real,
    true,
    "node branch: real must be true — drives the node's genuine red→green, not the synthetic smoke",
  );
  // The signed verdict must persist to events.verdict (verdictStore: 'pg').
  assert.equal(
    nodeOpts.verdictStore,
    "pg",
    "node branch: verdictStore must be 'pg' so the signed verdict persists to events.verdict (ADR-0144)",
  );
  assert.equal(nodeOpts.dryRun, false, "node branch: dryRun must be false — a real build, not a dry walk");
  // The actorOpt spread survives the flip.
  assert.equal(nodeOpts.actor, "op@example.com", "an injected actor is threaded onto the node branch's opts");
});

// ---------------------------------------------------------------------------
// Contract 2 — rnrd-no-synthetic-smoke-on-accept
// ---------------------------------------------------------------------------

test("rnrd-no-synthetic-smoke-on-accept: the node branch carries no synthetic shape — no live:true, no real:false, no omitted verdictStore (ADR-0099-B stays synthetic-only)", async () => {
  const { nodeOpts } = await driveRouted("node", "test-node-unit");
  if (nodeOpts === undefined) throw new Error("nodeBuild was not invoked for a node-classified unit");

  // The synthetic --live smoke (which per ADR-0099-B must never persist, and whose --store pg would be
  // refused downstream as a synthetic walk) is no longer what the routed dispatch runs.
  assert.ok(
    nodeOpts.live !== true,
    "node branch: must NOT pass live:true (the synthetic-smoke flag must not appear in the real dispatch)",
  );
  assert.ok(
    nodeOpts.real !== false,
    "node branch: must NOT pass real:false (the pre-ADR-0144 synthetic shape)",
  );
  assert.notEqual(
    nodeOpts.verdictStore,
    undefined,
    "node branch: verdictStore must not be omitted — an omitted store is the non-persisting smoke shape",
  );
});

// ---------------------------------------------------------------------------
// Contract 3 — rnrd-mode-line-names-real-and-parked-branch
// ---------------------------------------------------------------------------

test("rnrd-mode-line-names-real-and-parked-branch: the sink mode line names the real drive + parked-branch human landing, and openPr is absent (ADR-0136/0031)", async () => {
  const { nodeOpts, sinkLines } = await driveRouted("node", "test-node-unit");
  if (nodeOpts === undefined) throw new Error("nodeBuild was not invoked for a node-classified unit");

  // ADR-0136 wall: only story --real opens the auto-merging PR; node --real parks the branch for
  // the human to land non-squash — openPr must be ABSENT on the node arm.
  assert.equal(
    (nodeOpts as unknown as Record<string, unknown>)["openPr"],
    undefined,
    "node branch: must NOT pass openPr (ADR-0136 wall — node --real parks the branch, the human lands it non-squash)",
  );

  // The mode line is what the chat transcript streams back to the human — it must name the NEW shape
  // (substance, not exact prose): a real red→green, the persisted verdict, the parked-branch landing.
  const modeLine = sinkLines.find((l) => l.startsWith("▸ mode:")) ?? "";
  assert.ok(
    /--real|real red/i.test(modeLine),
    `node mode line must name the real drive — got: ${JSON.stringify(modeLine)}`,
  );
  assert.ok(
    /persist/i.test(modeLine) && /verdict/i.test(modeLine),
    `node mode line must name the persisted signed verdict — got: ${JSON.stringify(modeLine)}`,
  );
  assert.ok(
    /park/i.test(modeLine) && /claude\/real\//i.test(modeLine),
    `node mode line must name the parked claude/real/<unit>-<run> branch landing — got: ${JSON.stringify(modeLine)}`,
  );
  assert.ok(
    !/synthetic/i.test(modeLine),
    `node mode line must no longer name a synthetic task — got: ${JSON.stringify(modeLine)}`,
  );
});

// ---------------------------------------------------------------------------
// Contract 4 — rnrd-story-routing-unchanged
// ---------------------------------------------------------------------------

test("rnrd-story-routing-unchanged: a STORY-classified dispatch still drives storyBuild once with exactly real:true, dryRun:false, verdictStore:'pg', openPr:true (node entry never fires)", async () => {
  const { storyOpts, nodeCalls, storyCalls, sinkLines } = await driveRouted("story", "test-story-unit");

  assert.equal(storyCalls, 1, "storyBuild fires exactly once for a story-classified unit");
  assert.equal(nodeCalls, 0, "nodeBuild never fires for a story-classified unit");
  assert.deepEqual(
    storyOpts,
    { real: true, dryRun: false, verdictStore: "pg", openPr: true },
    "story branch: whole-story real build with openPr:true is unchanged (ADR-0144 only flips the node arm)",
  );
  const modeLine = sinkLines.find((l) => l.startsWith("▸ mode:")) ?? "";
  assert.ok(
    /auto-merges/i.test(modeLine),
    `story mode line still names the auto-merging PR — got: ${JSON.stringify(modeLine)}`,
  );
});
