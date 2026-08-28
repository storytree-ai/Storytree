import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import type { NodeBuildConfig } from "@storytree/orchestrator";

import {
  adoptCapabilityHelp,
  declaredCommand,
  declaredSourcePaths,
  loadAdoptCapability,
  renderCommand,
} from "./adopt-capability.js";

// ---------------------------------------------------------------------------
// The spec PROJECTION — which command an adoption observes, and which paths the
// service-history fence is measured against. Both decide whether a real verdict
// gets signed, so both are tested rather than trusted.
// ---------------------------------------------------------------------------

function config(over: Partial<NodeBuildConfig> = {}): NodeBuildConfig {
  return {
    command: { file: "pnpm", args: ["--filter", "@storytree/library", "test"] },
    scope: { testGlobs: ["packages/library/src/*.test.ts"], sourceGlobs: ["packages/library/src/*.ts"] },
    ...over,
  };
}

test("renderCommand joins file and args back into the one line the spine observes", () => {
  assert.equal(renderCommand({ file: "pnpm", args: ["--filter", "studio", "test"] }), "pnpm --filter studio test");
  assert.equal(renderCommand({ file: "node", args: [] }), "node");
});

test("declaredCommand prefers the `real:` arm's override over the node's base command", () => {
  const withReal = config({
    real: {
      testFile: "packages/library/src/knowledge-dag.test.ts",
      sourceFile: "packages/library/src/knowledge-dag.ts",
      scope: { testGlobs: [], sourceGlobs: [] },
      proofCommand: { file: "pnpm", args: ["--filter", "studio", "exec", "vitest", "run", "x.test.ts"] },
    },
  });
  assert.equal(declaredCommand(withReal), "pnpm --filter studio exec vitest run x.test.ts");
});

test("declaredCommand falls back to the base command when the `real:` arm declares no override", () => {
  assert.equal(declaredCommand(config()), "pnpm --filter @storytree/library test");
});

test("declaredCommand is UNDEFINED with no proof block at all — the Class C wall, and never a default", () => {
  // ADR-0465 D2 signs on an OBSERVED green, so a capability nobody declared a command for has
  // nothing to observe. Inventing one here would manufacture the evidence the verdict rests on.
  assert.equal(declaredCommand(undefined), undefined);
});

test("declaredSourcePaths unions the write scope's globs with the `real:` arm's own source file", () => {
  const withReal = config({
    real: {
      testFile: "packages/library/src/store/connection.test.ts",
      sourceFile: "packages/library/src/store/connection.ts",
      scope: { testGlobs: [], sourceGlobs: [] },
    },
  });
  assert.deepEqual(declaredSourcePaths(withReal), [
    "packages/library/src/*.ts",
    "packages/library/src/store/connection.ts",
  ]);
});

test("declaredSourcePaths does not duplicate a source file the globs already name", () => {
  const dup = config({
    scope: { testGlobs: [], sourceGlobs: ["packages/library/src/store/connection.ts"] },
    real: {
      testFile: "packages/library/src/store/connection.test.ts",
      sourceFile: "packages/library/src/store/connection.ts",
      scope: { testGlobs: [], sourceGlobs: [] },
    },
  });
  assert.deepEqual(dup, dup);
  assert.deepEqual(declaredSourcePaths(dup), ["packages/library/src/store/connection.ts"]);
});

test("declaredSourcePaths is EMPTY with no proof block — drive then refuses, because an unfenceable capability is not adoptable", () => {
  assert.deepEqual(declaredSourcePaths(undefined), []);
});

// ---------------------------------------------------------------------------
// The disk loader
// ---------------------------------------------------------------------------

function storiesDirWith(files: Record<string, string>): string {
  const root = mkdtempSync(path.join(os.tmpdir(), "adopt-cap-"));
  for (const [rel, body] of Object.entries(files)) {
    const full = path.join(root, rel);
    mkdirSync(path.dirname(full), { recursive: true });
    writeFileSync(full, body, "utf8");
  }
  return root;
}

const SPEC = `---
id: "widget-core"
tier: capability
title: "The widget core"
outcome: "A widget resolves."
status: proposed
proof_mode: integration-test
story: demo
proof:
  command:
    file: pnpm
    args: ["--filter", "@storytree/demo", "test"]
  scope:
    testGlobs: ["packages/demo/src/*.test.ts"]
    sourceGlobs: ["packages/demo/src/widget.ts"]
---

# The widget core
`;

test("loadAdoptCapability projects the slice the adoption reads, command and fence paths included", () => {
  const dir = storiesDirWith({ "demo/widget-core.md": SPEC });
  const spec = loadAdoptCapability(dir, "widget-core");
  assert.ok(spec !== null);
  assert.equal(spec.id, "widget-core");
  assert.equal(spec.tier, "capability");
  assert.equal(spec.title, "The widget core");
  assert.equal(spec.story, "demo");
  assert.equal(spec.proofCommand, "pnpm --filter @storytree/demo test");
  assert.deepEqual(spec.sourcePaths, ["packages/demo/src/widget.ts"]);
  assert.match(spec.file, /widget-core\.md$/);
});

test("loadAdoptCapability returns null for an id with no spec", () => {
  const dir = storiesDirWith({ "demo/widget-core.md": SPEC });
  assert.equal(loadAdoptCapability(dir, "no-such-capability"), null);
});

test("loadAdoptCapability returns null rather than throwing on an unreadable spec — the caller refuses, it does not crash", () => {
  const dir = storiesDirWith({ "demo/broken.md": "not frontmatter at all\n" });
  assert.equal(loadAdoptCapability(dir, "broken"), null);
});

test("a spec carrying NO proof block loads, but declares no command and no fence paths", () => {
  // This is the Class C shape — 43 of the arc's 71 capabilities. It must LOAD (so the refusal can
  // name what is missing) rather than fail to resolve, which would read as "no such capability".
  const bare = SPEC.split("proof:")[0] + "---\n\n# The widget core\n";
  const dir = storiesDirWith({ "demo/widget-core.md": bare });
  const spec = loadAdoptCapability(dir, "widget-core");
  assert.ok(spec !== null);
  assert.equal(spec.proofCommand, undefined);
  assert.deepEqual(spec.sourcePaths, []);
});

// ---------------------------------------------------------------------------
// Help
// ---------------------------------------------------------------------------

test("the help states the basis, names the refusals, and does not rank adopted below driven", () => {
  const env = adoptCapabilityHelp();
  assert.equal(env.ok, true);
  assert.match(env.body, /ACCEPTING THE RISK/);
  assert.match(env.body, /never the signer/);
  // The story-grain guard must be described as JOINED, never widened (ADR-0465 D4 / ADR-0423 D1).
  assert.match(env.body, /never widens it/);
  // ADR-0465 D7: no surface may present `driven` as the senior mode.
  assert.match(env.body, /differ in KIND, not rank/);
});
