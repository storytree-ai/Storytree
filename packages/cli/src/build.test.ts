import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { InMemoryStore } from "@storytree/storage-protocol";
import { loadCorpus } from "@storytree/library/store";

import { run, classifyBuildTarget } from "./commands.js";

/**
 * Unit A of the ADR-0118 workflow-first reshape: the `build` WORKFLOW. Offline tests in the
 * cli/gate/adopt pattern — seed an InMemoryStore from the studio data, drive `run` exactly as `main`
 * does, and assert routing WITHOUT running a real build: the `--store memory` guard (ADR-0081) fires in
 * the dispatch BEFORE any leaf/DB is touched, so the tier auto-route is observable through the
 * refusal's area-specific retry hint. The build entries delegate to the SAME nodeBuild/storyBuild/
 * gateCommand the grain areas call, so these prove only the surface routing — the build engines
 * themselves are covered in node-build / story-build / gate tests.
 */
async function seeded(): Promise<InMemoryStore> {
  const store = new InMemoryStore();
  await loadCorpus(store);
  return store;
}

/** The repo's real stories dir (build.test.ts → src → cli → packages → repo root → stories). */
const STORIES_DIR = path.resolve(fileURLToPath(import.meta.url), "..", "..", "..", "..", "stories");

test("build (bare) shows the workflow help: the goal, the auto-route, the nested primitives, the aliases", async () => {
  const env = await run(["build"], { store: await seeded() });
  assert.equal(env.ok, true);
  assert.match(env.body, /storytree build <id>/);
  assert.match(env.body, /AUTO-ROUTE by tier/);
  assert.match(env.body, /storytree build node <id>/);
  assert.match(env.body, /storytree build node resolve <id>/);
  assert.match(env.body, /storytree build story <id>/);
  assert.match(env.body, /storytree build gate .*--real/);
  // teaches that an observe gate is NOT a build — it relocates to `adopt gate`, not under `build`
  assert.match(env.body, /adopt gate/);
  // the back-compat aliases are advertised in-context (no silent breakage)
  assert.match(env.body, /node build/);
  assert.match(env.body, /node resolve/);
  assert.match(env.body, /story build/);
  assert.match(env.body, /gate run --real/);
});

test("classifyBuildTarget routes by tier — a story id → story, a capability/unknown id → node", () => {
  assert.equal(classifyBuildTarget("library", STORIES_DIR), "story", "a story spec routes to the chain");
  assert.equal(classifyBuildTarget("library-cli", STORIES_DIR), "node", "a capability routes to a node build");
  assert.equal(classifyBuildTarget("does-not-exist", STORIES_DIR), "node", "an unknown id falls to a node build (nodeBuild then guides)");
});

test("build <id> auto-routes by tier — a story id is driven as a whole-story chain", async () => {
  // `--store memory` refuses in-dispatch (ADR-0081) before any build runs; the refusal's retry hint
  // is area-specific, so it proves the auto-route classified `library` (a story) as a STORY build.
  const env = await run(["build", "library", "--store", "memory"], { store: await seeded() });
  assert.equal(env.ok, false);
  assert.match(env.body, /--store memory/);
  assert.match((env.next ?? []).join("\n"), /storytree story build library/, "auto-routed to a story build");
});

test("build <id> auto-routes by tier — a capability id is driven as a single node", async () => {
  const env = await run(["build", "library-cli", "--store", "memory"], { store: await seeded() });
  assert.equal(env.ok, false);
  assert.match((env.next ?? []).join("\n"), /storytree node build library-cli/, "auto-routed to a node build");
});

test("build node <id> is the explicit node primitive (was `node build`)", async () => {
  const env = await run(["build", "node", "library-cli", "--store", "memory"], { store: await seeded() });
  assert.equal(env.ok, false);
  assert.match((env.next ?? []).join("\n"), /storytree node build library-cli/);
});

test("build story <id> is the explicit whole-story primitive (was `story build`)", async () => {
  const env = await run(["build", "story", "library", "--store", "memory"], { store: await seeded() });
  assert.equal(env.ok, false);
  assert.match((env.next ?? []).join("\n"), /storytree story build library/);
});

test("build gate <g> --real routes to the build-tests primitive (was `gate run --real`)", async () => {
  // `--store memory` refuses before the gate is loaded; the gate refusal's retry hint is the `gate run
  // --real` form, proving `build gate` reached the same gate code path.
  const env = await run(["build", "gate", "library#gate-1", "--real", "--store", "memory"], {
    store: await seeded(),
  });
  assert.equal(env.ok, false);
  assert.match((env.next ?? []).join("\n"), /storytree gate run library#gate-1 --real/);
});

test("build node resolve <id> is FREE, read-only spec resolution (was `node resolve`) — no build, no DB", async () => {
  const env = await run(["build", "node", "resolve", "library-cli"], { store: await seeded() });
  // nodeResolve never refuses on store/DB; it returns a resolve report for a real node.
  assert.equal(env.ok, true);
  assert.match(env.body, /library-cli/);
});

test("build node (bare) and build story (bare) surface their primitive help", async () => {
  const store = await seeded();
  const node = await run(["build", "node"], { store });
  assert.equal(node.ok, true);
  assert.match(node.body, /storytree node/);
  const story = await run(["build", "story"], { store });
  assert.equal(story.ok, true);
  assert.match(story.body, /storytree story/);
});
