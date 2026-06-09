import { test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

import { InMemoryStore, rollupStatus, workEvent } from "@storytree/core";

import { loadNodeSpec, findNodeSpecFile, mapProofMode } from "./node-spec.js";
import { lookupNodeBuildConfig, registeredNodeIds } from "./test-command-registry.js";
import { resolveProveSpec, assemblePrompts } from "./resolve-prove-spec.js";
import { proveUnit } from "./prove-it-gate.js";

/**
 * Phase B (drive-machinery): the resolver glue. Loads the REAL stories/library node specs from the
 * repo, proves the frontmatter loader + proof-mode mapping + registry + prompt assembly, then
 * drives ONE real spec end-to-end through proveUnit with the dry-run seams — asserting the full
 * glue chain (spec → ProveSpec → gate → signed verdict → rollup) offline, at zero API cost.
 */

/** repo root: packages/orchestrator/src → four dirs up. */
const REPO_ROOT = path.resolve(fileURLToPath(import.meta.url), "..", "..", "..", "..");
const STORIES_DIR = path.join(REPO_ROOT, "stories");

// ── node-spec loading (the light frontmatter loader, against REAL seed files) ────────────────────

test("findNodeSpecFile locates a capability and a story's own spec", () => {
  assert.equal(
    findNodeSpecFile(STORIES_DIR, "library-cli"),
    path.join(STORIES_DIR, "library", "library-cli.md"),
  );
  assert.equal(
    findNodeSpecFile(STORIES_DIR, "library"),
    path.join(STORIES_DIR, "library", "story.md"),
  );
  assert.equal(findNodeSpecFile(STORIES_DIR, "no-such-node"), null);
});

test("loadNodeSpec parses the real library-cli frontmatter (id/tier/outcome/proof_mode) + guidance", () => {
  const spec = loadNodeSpec(path.join(STORIES_DIR, "library", "library-cli.md"));
  assert.equal(spec.id, "library-cli");
  assert.equal(spec.tier, "capability");
  assert.equal(spec.story, "library");
  assert.equal(spec.proofMode, "integration-test");
  assert.equal(spec.status, "mapped");
  assert.match(spec.outcome, /curates library artifacts/);
  assert.ok(spec.dependsOn.includes("event-sourced-store-seam"));
  // The ## Guidance prose is carried for prompt assembly.
  assert.ok(spec.guidance !== undefined && spec.guidance.includes("Envelope"));
});

test("loadNodeSpec parses the real library story spec (UAT proof mode, no guidance section)", () => {
  const spec = loadNodeSpec(path.join(STORIES_DIR, "library", "story.md"));
  assert.equal(spec.id, "library");
  assert.equal(spec.tier, "story");
  assert.equal(spec.proofMode, "UAT");
  assert.equal(spec.guidance, undefined);
});

test("loadNodeSpec is loud on a file without frontmatter", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "storytree-nodespec-"));
  try {
    const bad = path.join(dir, "bad.md");
    await fs.writeFile(bad, "# no frontmatter here\n");
    assert.throws(() => loadNodeSpec(bad), /no frontmatter block/);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

// ── proof-mode mapping (frontmatter test-kind word → core tier-ladder enum) ──────────────────────

test("mapProofMode maps the frontmatter vocabulary onto core ProofMode", () => {
  assert.equal(mapProofMode("integration-test"), "capability");
  assert.equal(mapProofMode("UAT"), "story");
  assert.equal(mapProofMode("contract-test"), "contract");
  assert.equal(mapProofMode("operator-attested"), "operator-attested");
});

// ── the registry (explicit, fail-closed) ─────────────────────────────────────────────────────────

test("the registry covers the library story + its seven capabilities; a miss is null", () => {
  const ids = registeredNodeIds();
  for (const id of [
    "library",
    "library-cli",
    "library-schema-and-write-validation",
    "migrate-on-write-upcaster",
    "event-sourced-store-seam",
    "eager-batch-migrate",
    "seed-corpus-scripts",
    "library-health-gate",
  ]) {
    assert.ok(ids.includes(id), `${id} is registered`);
    const config = lookupNodeBuildConfig(id);
    assert.ok(config !== null && config.command.args.length > 0);
    assert.ok(config.scope.testGlobs.length > 0 && config.scope.sourceGlobs.length > 0);
  }
  assert.equal(lookupNodeBuildConfig("unregistered-node"), null);
});

// ── prompt assembly (real briefs off the real spec) ──────────────────────────────────────────────

test("assemblePrompts builds authorTest/implement briefs from the node's outcome + guidance", () => {
  const spec = loadNodeSpec(path.join(STORIES_DIR, "library", "library-cli.md"));
  const prompts = assemblePrompts(spec);
  assert.match(prompts.authorTest, /AUTHOR_TEST/);
  assert.match(prompts.authorTest, /curates library artifacts/);
  assert.match(prompts.authorTest, /Guidance from the node spec/);
  assert.match(prompts.implement, /IMPLEMENT/);
  assert.match(prompts.implement, /never the test/);
});

// ── the resolver: all 14 fields, fail-closed on an unregistered node ─────────────────────────────

test("resolveProveSpec refuses an unregistered node with the buildable ids", () => {
  const spec = loadNodeSpec(path.join(STORIES_DIR, "library", "library-cli.md"));
  const result = resolveProveSpec(
    { ...spec, id: "not-registered" },
    {
      mode: "dry-run",
      workspace: os.tmpdir(),
      store: new InMemoryStore(),
      runId: "r1",
      signerInputs: { flag: "tester@example.com" },
    },
  );
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.match(result.reason, /no test-command registry entry/);
  assert.ok(result.registered.includes("library-cli"));
});

test("resolveProveSpec fills the real fields off the spec (unitId, mapped proofMode, testId, runId)", () => {
  const spec = loadNodeSpec(path.join(STORIES_DIR, "library", "library-cli.md"));
  const result = resolveProveSpec(spec, {
    mode: "dry-run",
    workspace: os.tmpdir(),
    store: new InMemoryStore(),
    runId: "run-42",
    signerInputs: { flag: "tester@example.com" },
    now: () => "2026-06-10T00:00:00.000Z",
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.spec.unitId, "library-cli");
  assert.equal(result.spec.proofMode, "capability"); // integration-test → capability
  assert.equal(result.spec.testId, "library-cli");
  assert.equal(result.spec.runId, "run-42");
  assert.match(result.spec.prompts.authorTest, /library-cli/);
  assert.equal(result.spec.now(), "2026-06-10T00:00:00.000Z");
});

// ── THE GLUE PROOF: a REAL node spec through the gate to a signed verdict + rollup ───────────────

test("dry-run glue: real library-cli spec → ProveSpec → proveUnit → signed pass → rollup healthy", async () => {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "storytree-dryrun-"));
  const store = new InMemoryStore();
  try {
    const spec = loadNodeSpec(path.join(STORIES_DIR, "library", "library-cli.md"));
    // The lifecycle mark a real build starts with — gives the rollup something real to project.
    await store.appendEvent(
      workEvent({ unitId: spec.id, event: "building", runId: "dry-1" }, "tester@example.com"),
    );
    const resolved = resolveProveSpec(spec, {
      mode: "dry-run",
      workspace,
      store,
      runId: "dry-1",
      signerInputs: { flag: "tester@example.com" },
      now: () => "2026-06-10T00:00:00.000Z",
    });
    assert.equal(resolved.ok, true);
    if (!resolved.ok) return;

    const result = await proveUnit(resolved.spec);
    assert.equal(result.ok, true, "the dry-run walk must reach a signed pass");
    if (!result.ok) return;
    assert.deepEqual(result.phasesVisited, [
      "AUTHOR_TEST",
      "CONFIRM_RED",
      "IMPLEMENT",
      "CONFIRM_GREEN",
      "GATE",
    ]);
    // The verdict carries the REAL node identity, the spine's OWN observed red→green evidence.
    assert.equal(result.verdict.unitId, "library-cli");
    assert.equal(result.verdict.proofMode, "capability");
    assert.equal(result.verdict.signer, "tester@example.com");
    assert.deepEqual(
      result.verdict.evidence.map((e) => e.kind),
      ["observation:red", "observation:green"],
    );

    // The rollup derives healthy off the event log — building, then the gate's signed pass.
    assert.equal(rollupStatus("library-cli", await store.readEvents()), "healthy");
  } finally {
    await fs.rm(workspace, { recursive: true, force: true });
  }
});
