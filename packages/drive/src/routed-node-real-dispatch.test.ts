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
// RED at HEAD: the node-branch assertions fail — capturedOpts.real is false, verdictStore is undefined.
// GREEN post-fix: real:true, verdictStore:'pg', no live:true, no openPr, mode line names real drive.

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  routedBuildRunner,
  type NodeBuildLikeOpts,
  type StoryBuildLikeOpts,
  type RoutedBuildDeps,
  type BuildKind,
} from "./build-worker.js";

// ---------------------------------------------------------------------------
// Contract: routed-node-real-dispatch — node branch opts (the primary pin)
// ---------------------------------------------------------------------------

test("routed-node-real-dispatch: node branch dispatches real proof opts — real:true, verdictStore:'pg', no live:true, no openPr", async () => {
  let capturedOpts: NodeBuildLikeOpts | undefined;
  const sinkLines: string[] = [];

  const deps: RoutedBuildDeps = {
    classify: async (): Promise<BuildKind> => "node",
    nodeBuild: async (_unitId, opts) => {
      capturedOpts = opts;
      return { ok: true, body: "node-envelope" };
    },
    storyBuild: async () => ({ ok: true, body: "unreachable" }),
  };

  await routedBuildRunner(deps)("test-node-unit", (line) => sinkLines.push(line));

  if (capturedOpts === undefined) throw new Error("nodeBuild was not invoked for a node-classified unit");

  // ADR-0144: the node branch must drive the REAL proof (real: true), not the synthetic smoke (real: false).
  assert.equal(
    capturedOpts.real,
    true,
    "node branch: real must be true — drives the node's genuine red→green, not the synthetic smoke",
  );

  // The signed verdict must persist to events.verdict (verdictStore: 'pg').
  assert.equal(
    capturedOpts.verdictStore,
    "pg",
    "node branch: verdictStore must be 'pg' so the signed verdict persists to events.verdict (ADR-0144)",
  );

  // dryRun must be false — a real build, not a dry walkthrough.
  assert.equal(capturedOpts.dryRun, false, "node branch: dryRun must be false");

  // The node branch must NOT pass live:true (the synthetic-smoke flag).
  assert.ok(
    capturedOpts.live !== true,
    "node branch: must NOT pass live:true (the synthetic-smoke flag must not appear in the real dispatch)",
  );

  // ADR-0136 wall: only story --real opens the auto-merging PR; node --real parks the branch for human landing.
  assert.equal(
    (capturedOpts as unknown as Record<string, unknown>)["openPr"],
    undefined,
    "node branch: must NOT pass openPr (ADR-0136 wall — node --real parks the branch, the human lands it non-squash)",
  );

  // The mode line must name the real drive + the parked-branch landing (not the synthetic smoke).
  const modeLine = sinkLines.find((l) => l.startsWith("▸ mode:")) ?? "";
  assert.ok(
    /real/i.test(modeLine),
    `node mode line must name the real drive, not the synthetic smoke — got: ${JSON.stringify(modeLine)}`,
  );
  assert.ok(
    /parked|branch|persist|verdict/i.test(modeLine),
    `node mode line must name the parked-branch landing or persisted verdict — got: ${JSON.stringify(modeLine)}`,
  );
});

// ---------------------------------------------------------------------------
// Contract: routed-node-real-dispatch — story branch unchanged (regression guard)
// ---------------------------------------------------------------------------

test("routed-node-real-dispatch: story branch unchanged — real story build with openPr:true", async () => {
  let capturedStoryOpts: StoryBuildLikeOpts | undefined;

  const deps: RoutedBuildDeps = {
    classify: async (): Promise<BuildKind> => "story",
    nodeBuild: async () => ({ ok: true, body: "unreachable" }),
    storyBuild: async (_storyId, opts) => {
      capturedStoryOpts = opts;
      return { ok: true, body: "story-envelope" };
    },
  };

  await routedBuildRunner(deps)("test-story-unit", () => undefined);

  assert.deepEqual(
    capturedStoryOpts,
    { real: true, dryRun: false, verdictStore: "pg", openPr: true },
    "story branch: whole-story real build with openPr:true is unchanged (ADR-0144 only flips the node arm)",
  );
});
