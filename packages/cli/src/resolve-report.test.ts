import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { loadNodeSpec, findNodeSpecFile } from "@storytree/orchestrator";

// This import fails until the implementation is written — the right-kind red for this unit.
import { resolveReport } from "./resolve-report.js";
import type { ResolveReport, ResolveRealReport } from "./resolve-report.js";

/**
 * Contract tests for `resolveReport(spec: NodeSpec): ResolveReport`.
 * The function is a pure data transform that renders how a node spec resolves for a build —
 * provenance (spec-borne / registry / not-buildable), proof command, write scope, and the REAL arm.
 * Uses real spec files from the repo so the assertions bind to production data.
 *
 * (install: true — @storytree/orchestrator is a value import)
 */

const REPO_ROOT = path.resolve(fileURLToPath(import.meta.url), "..", "..", "..", "..");
const STORIES_DIR = path.join(REPO_ROOT, "stories");

// ── Contract 1: spec-borne node with a real arm (no install, default proof command) ─────────────

test("resolveReport on a spec-borne node reports source=spec, all command/scope/real fields", () => {
  // verdict-line has a spec-borne proof: block AND a real: arm; no install, no custom proofCommand.
  const file = findNodeSpecFile(STORIES_DIR, "verdict-line");
  assert.ok(file !== null, "verdict-line spec file exists");
  const spec = loadNodeSpec(file);
  assert.ok(spec.buildConfig !== undefined, "verdict-line declares a spec-borne proof: block");

  const report = resolveReport(spec);

  // Identity echoed from the spec
  assert.equal(report.id, "verdict-line");
  assert.equal(report.tier, "contract");

  // proofModeWord is the raw frontmatter word; proofMode is the mapped core tier
  assert.equal(report.proofModeWord, "contract-test");
  assert.equal(report.proofMode, "contract"); // mapProofMode("contract-test") === "contract"

  // Buildable via the spec-borne block (source = "spec", not "registry")
  assert.equal(report.buildable, true);
  assert.equal(report.source, "spec");

  // Proof command rendered off the spec (not spawned — just the file/args/display triple)
  assert.ok(report.command !== null);
  assert.equal(report.command.file, "pnpm");
  assert.deepEqual(report.command.args, ["--filter", "@storytree/core", "test"]);
  assert.equal(report.command.display, "pnpm --filter @storytree/core test");

  // Per-phase write scope (test-only vs source-only walls)
  assert.ok(report.scope !== null);
  assert.deepEqual(report.scope.testGlobs, ["packages/core/src/**/*.test.ts"]);
  assert.deepEqual(report.scope.sourceGlobs, ["packages/core/src/**/*.ts"]);

  // REAL arm present
  assert.equal(report.realBuildable, true);
  assert.ok(report.real !== null);
  assert.equal(report.real.testFile, "packages/core/src/verdict-line.test.ts");
  assert.equal(report.real.sourceFile, "packages/core/src/verdict-line.ts");
  assert.equal(report.real.install, false);      // absent in spec → normalised to false
  assert.equal(report.real.editsExisting, false); // absent in spec → normalised to false
  assert.equal(report.real.db, false);            // absent in spec → normalised to false (ADR-0064)
  assert.deepEqual(report.real.addDeps, []);      // absent in spec → empty (ADR-0064 §2)
  assert.equal(report.real.typecheck, null);       // no typecheck declared → null
  assert.equal(report.real.proofCommand, null);    // no custom proofCommand → null (default node:test)

  // proofDisplay delegates to realProofCommand — the one-true display, not hand-formatted
  assert.equal(
    report.real.proofDisplay,
    "node --import tsx --test packages/core/src/verdict-line.test.ts",
  );
});

// ── Contract 1 (continued): spec-borne node with install + typecheck declared ────────────────────

test("resolveReport on an install-bearing real arm renders typecheck as a display string", () => {
  // declare-presence: spec-borne, real: install=true, typecheck=pnpm --filter @storytree/core typecheck
  const file = findNodeSpecFile(STORIES_DIR, "declare-presence");
  assert.ok(file !== null, "declare-presence spec file exists");
  const spec = loadNodeSpec(file);
  assert.ok(spec.buildConfig !== undefined, "declare-presence has a spec-borne block");

  const report = resolveReport(spec);

  assert.equal(report.buildable, true);
  assert.equal(report.source, "spec");
  assert.equal(report.realBuildable, true);
  assert.ok(report.real !== null);

  assert.equal(report.real.install, true);
  assert.equal(report.real.editsExisting, false);
  // typecheck is declared → rendered as "file args..." display string
  assert.equal(report.real.typecheck, "pnpm --filter @storytree/core typecheck");
  assert.equal(report.real.proofCommand, null); // no custom proofCommand
  assert.equal(
    report.real.proofDisplay,
    "node --import tsx --test packages/core/src/presence.test.ts",
  );
});

// ── Contract 1 (continued): registry-only node — source="registry", realBuildable=false ─────────

test("resolveReport on a registry-only node reports source=registry with no real arm", () => {
  // library-cli: no spec-borne proof: block, but in the registry; no real: arm.
  const file = findNodeSpecFile(STORIES_DIR, "library-cli");
  assert.ok(file !== null, "library-cli spec file exists");
  const spec = loadNodeSpec(file);
  assert.equal(spec.buildConfig, undefined, "library-cli has no spec-borne block");

  const report = resolveReport(spec);

  assert.equal(report.id, "library-cli");
  // proofModeWord/proofMode distinction for an integration-test (capability) node
  assert.equal(report.proofModeWord, "integration-test");
  assert.equal(report.proofMode, "capability"); // mapProofMode("integration-test") === "capability"

  assert.equal(report.buildable, true);
  assert.equal(report.source, "registry"); // falls back to the registry

  assert.ok(report.command !== null);
  assert.equal(report.command.file, "pnpm");
  assert.deepEqual(report.command.args, ["--filter", "@storytree/cli", "test"]);
  assert.equal(report.command.display, "pnpm --filter @storytree/cli test");

  assert.ok(report.scope !== null);
  // No real arm in the registry entry
  assert.equal(report.real, null);
  assert.equal(report.realBuildable, false);
});

// ── Contract 1 (continued): not-buildable node — buildable=false, all fields null ────────────────

test("resolveReport on a non-buildable node reports buildable=false with command/scope/real all null", () => {
  // browse-library: neither a spec-borne proof: block nor a registry entry.
  const file = findNodeSpecFile(STORIES_DIR, "browse-library");
  assert.ok(file !== null, "browse-library spec file exists");
  const spec = loadNodeSpec(file);
  assert.equal(spec.buildConfig, undefined, "browse-library has no spec block");

  const report = resolveReport(spec);

  assert.equal(report.buildable, false);
  assert.equal(report.source, null);
  assert.equal(report.command, null);
  assert.equal(report.scope, null);
  assert.equal(report.real, null);
  assert.equal(report.realBuildable, false);

  // Identity fields still present
  assert.equal(report.id, "browse-library");
  assert.ok(typeof report.tier === "string");
  assert.ok(typeof report.proofModeWord === "string");
  assert.ok(typeof report.proofMode === "string");
});

// ── Array aliasing guard: the report's arrays are copies, not references to the spec's internals ─

test("resolveReport copies array fields — the report never aliases the spec's internal arrays", () => {
  const file = findNodeSpecFile(STORIES_DIR, "verdict-line");
  assert.ok(file !== null);
  const spec = loadNodeSpec(file);
  const report = resolveReport(spec);

  assert.ok(report.command !== null);
  assert.ok(report.scope !== null);
  assert.ok(spec.buildConfig !== undefined);

  // Mutation of the spec's arrays must not affect the report
  const originalArgs = [...report.command.args];
  spec.buildConfig.command.args.push("--extra-flag");
  assert.deepEqual(report.command.args, originalArgs);

  const originalTestGlobs = [...report.scope.testGlobs];
  spec.buildConfig.scope.testGlobs.push("extra.test.ts");
  assert.deepEqual(report.scope.testGlobs, originalTestGlobs);
});
