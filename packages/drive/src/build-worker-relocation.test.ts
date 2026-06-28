// The worker-relocation package-boundary contract (capability worker-relocation, ADR-0133 d.3).
//
// The build worker machinery (BuildRegistry / runBuildJob / routedBuildRunner / dispatchAcceptedBuild +
// the BuildContext type) used to live in apps/studio/server. An app may not import another app's server
// (ADR-0100), so the desktop (where chat ships) could not reach it. This capability MOVES the machinery
// DOWN into @storytree/drive/build-worker — a package both surfaces may import — and this test is the
// NET-NEW package-boundary contract that proves the move:
//   - the new subpath resolves and exports the trio (module-not-found RED at HEAD — the module did not
//     exist before the relocation);
//   - the relocated machinery behaves identically from its new home (a buildable id mints + runs a
//     scripted runner to a terminal passed);
//   - build-worker.ts imports NOTHING from apps/* (the ADR-0100 wall the relocation exists to satisfy —
//     a structural source read, the modelPathBoundary.test.ts precedent);
//   - the typed refusals (un-buildable, single-build guard) moved intact (the safe-write posture, ADR-0091).
//
// The cross-package PARITY (the studio importers stay green from the new home) is observed by the real
// arm's suite proofCommand (the studio server suite), not this file. Here the build runner is an injected
// scripted double over the REAL relocated registry — no SDK spend (ADR-0010 §5).

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import {
  BuildRegistry,
  runBuildJob,
  dispatchAcceptedBuild,
  routedBuildRunner,
  type BuildContext,
  type BuildRunner,
  type BuildEnvelope,
  type BuildKind,
} from "./build-worker.js";

/** Drain the event loop until the fire-and-forget worker reaches a terminal state. */
async function waitTerminal(registry: BuildRegistry, runId: string, tries = 100): Promise<void> {
  for (let i = 0; i < tries; i += 1) {
    if (registry.getRun(runId)?.status !== "building") return;
    await new Promise<void>((r) => setTimeout(r, 5));
  }
  throw new Error(`run ${runId} never reached a terminal state`);
}

// ---------------------------------------------------------------------------
// Contract 1 — wr-subpath-exports-the-worker-trio
// ---------------------------------------------------------------------------

// @storytree/drive/build-worker (./build-worker.js) resolves and exports the worker trio. The IMPORT at
// the top of this file is the existence proof — it is module-not-found at HEAD (the net-new RED); here we
// assert the runtime values are the real machinery, not stubs.
test("wr-subpath-exports-the-worker-trio: the relocated subpath exports BuildRegistry / runBuildJob / dispatchAcceptedBuild / routedBuildRunner", () => {
  assert.equal(typeof BuildRegistry, "function", "BuildRegistry (the run registry) is exported from the new home");
  assert.equal(typeof runBuildJob, "function", "runBuildJob (the fire-and-forget worker) is exported");
  assert.equal(typeof dispatchAcceptedBuild, "function", "dispatchAcceptedBuild (the chat accept→dispatch) is exported");
  assert.equal(typeof routedBuildRunner, "function", "routedBuildRunner (the kind router) is exported");
  // The BuildContext TYPE is type-only (erased at runtime); using it to type a value proves it is exported.
  const ctx: BuildContext = {
    registry: new BuildRegistry(),
    runner: async () => ({ ok: true, body: "" }),
    isBuildable: async () => false,
  };
  assert.ok(ctx.registry instanceof BuildRegistry, "BuildContext composes the real relocated BuildRegistry");
});

// ---------------------------------------------------------------------------
// Contract 2 — wr-relocated-worker-behaves
// ---------------------------------------------------------------------------

// Over the REAL relocated BuildRegistry + a scripted runner, dispatchAcceptedBuild validates isBuildable,
// mints a run, fires runBuildJob, returns { ok: true, runId }, and once drained the run is terminal
// `passed` with the scripted progress on its transcript — identical behaviour from the new home.
test("wr-relocated-worker-behaves: dispatchAcceptedBuild mints + runs over the real relocated registry to a terminal passed", async () => {
  const registry = new BuildRegistry();
  const runner: BuildRunner = async (_unitId, sink): Promise<BuildEnvelope> => {
    sink("phase: AUTHOR_TEST");
    sink("phase: GATE");
    return { ok: true, body: "verdict: PASS\nsigned by the spine" };
  };
  const build: BuildContext = { registry, runner, isBuildable: async (id) => id === "chat-drive-bridge" };

  const result = await dispatchAcceptedBuild("chat-drive-bridge", build);
  assert.equal(result.ok, true, "a buildable id is dispatched");
  if (!result.ok) return;
  assert.ok(result.runId.length > 0, "the dispatch returns a tracked runId");

  await waitTerminal(registry, result.runId);
  const run = registry.getRun(result.runId);
  assert.equal(run?.status, "passed", "the relocated worker drives the scripted runner to a terminal passed");
  assert.ok(run?.transcript.includes("phase: AUTHOR_TEST"), "the scripted coarse progress lands on the transcript");
  assert.ok(run?.transcript.includes("phase: GATE"), "every scripted line is folded onto the transcript");
  assert.match(run?.envelope ?? "", /verdict: PASS/, "the terminal envelope carries the build body");
  assert.equal(registry.hasActiveBuild(), false, "the single-build guard releases when the run terminalises");

  // routedBuildRunner moved intact: a `story` classification selects the story branch, `node` the node branch.
  const seen: string[] = [];
  const routed = routedBuildRunner({
    classify: async (id): Promise<BuildKind> => (id === "some-story" ? "story" : "node"),
    storyBuild: async () => {
      seen.push("story");
      return { ok: true, body: "story" };
    },
    nodeBuild: async () => {
      seen.push("node");
      return { ok: true, body: "node" };
    },
  });
  await routed("some-story", () => undefined);
  await routed("some-node", () => undefined);
  assert.deepEqual(seen, ["story", "node"], "routedBuildRunner routes by kind unchanged from the new home");
});

// ---------------------------------------------------------------------------
// Contract 3 — wr-imports-nothing-from-apps
// ---------------------------------------------------------------------------

// The relocated module's reason-to-exist is that the desktop can import it WITHOUT importing
// apps/studio/server (ADR-0100). Assert STRUCTURALLY that build-worker.ts imports nothing from apps/* —
// FALSE before the relocation (the machinery was IN apps/studio/server), TRUE after. Mirrors
// modelPathBoundary.test.ts (which holds apps/studio/src to "imports no agent/drive/model").
test("wr-imports-nothing-from-apps: the relocated build-worker imports nothing from apps/* (the ADR-0100 wall)", () => {
  const src = readFileSync(fileURLToPath(new URL("./build-worker.ts", import.meta.url)), "utf8");
  const importLines = src
    .split(/\r?\n/)
    .filter((l) => /^\s*import\b/.test(l) || /\bfrom\s+["']/.test(l) || /import\(/.test(l))
    .join("\n");
  assert.ok(!/apps\//.test(importLines), "build-worker.ts imports nothing from apps/* (the desktop can import it legally)");
  assert.ok(!/studio\/server/.test(importLines), "build-worker.ts does not reach back into apps/studio/server");
  // It composes only node:crypto + injected entries — no surface/UI/store coupling pulled in by the move.
  assert.ok(!/@storytree\/library\/store|cloud-sql-connector|\bfrom\s+["']pg["']/.test(importLines), "the move pulls in no DB connector");
});

// ---------------------------------------------------------------------------
// Contract 4 — wr-typed-refusal-moved-intact
// ---------------------------------------------------------------------------

// The safe-write refusals survive the move: an un-buildable id returns a typed { ok: false, reason } and
// the worker is NEVER invoked; a second concurrent dispatch returns the single-build refusal. No signing
// key, no verdict path — intent in, progress out (ADR-0091).
test("wr-typed-refusal-moved-intact: un-buildable + single-build refusals (and intent-not-verdict) moved intact", async () => {
  // Un-buildable → typed refusal, worker never invoked.
  let invoked = 0;
  const registryA = new BuildRegistry();
  const refused = await dispatchAcceptedBuild("no-such-unit", {
    registry: registryA,
    runner: async () => {
      invoked += 1;
      return { ok: true, body: "unreached" };
    },
    isBuildable: async () => false,
  });
  assert.equal(refused.ok, false, "an un-buildable id is refused");
  if (!refused.ok) assert.equal(refused.reason, "not buildable", "the typed refusal reason moved intact");
  assert.equal(invoked, 0, "the worker is never invoked against an un-buildable id (no run against nothing)");
  assert.equal(registryA.hasActiveBuild(), false, "no run is minted on a refusal");

  // Single-build guard → a concurrent dispatch is refused, the running run untouched; result is intent only.
  const registryB = new BuildRegistry();
  const occupied = registryB.createRun("occupied-unit");
  assert.equal(occupied.ok, true, "the slot is occupied by a live run");
  const concurrent = await dispatchAcceptedBuild("chat-drive-bridge", {
    registry: registryB,
    runner: async () => ({ ok: true, body: "unreached" }),
    isBuildable: async () => true,
  });
  assert.equal(concurrent.ok, false, "a concurrent dispatch is refused by the single-build guard");
  if (!concurrent.ok) assert.equal(concurrent.reason, "a build is already running", "the single-build guard reason moved intact");
  assert.ok(!Object.prototype.hasOwnProperty.call(concurrent, "verdict"), "the dispatch returns intent, never a verdict (ADR-0091)");
});
