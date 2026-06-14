import { test } from "node:test";
import assert from "node:assert/strict";

import { parseNodeBuildConfig, NodeBuildConfigSchema } from "./proof-config.js";

/**
 * ADR-0057 keystone, contract 1 (`spec-proof-block-parses`): the `proof:` block schema reads +
 * zod-validates into a typed {@link import("./proof-config.js").NodeBuildConfig}, materializes no
 * explicit-undefined optionals (so the parity deepEqual against the registry holds), and is LOUD on
 * any malformed block. These are the schema-level proofs; the loader/resolver legs live in
 * resolve-prove-spec.test.ts.
 */

const INSTALL_BLOCK = {
  command: { file: "pnpm", args: ["--filter", "@storytree/core", "test"] },
  scope: {
    testGlobs: ["packages/core/src/**/*.test.ts"],
    sourceGlobs: ["packages/core/src/**/*.ts"],
  },
  real: {
    testFile: "packages/core/src/presence.test.ts",
    sourceFile: "packages/core/src/presence.ts",
    scope: {
      testGlobs: ["packages/core/src/presence.test.ts"],
      sourceGlobs: ["packages/core/src/presence.ts"],
    },
    install: true,
    typecheck: { file: "pnpm", args: ["--filter", "@storytree/core", "typecheck"] },
  },
};

const NO_INSTALL_BLOCK = {
  command: { file: "pnpm", args: ["--filter", "@storytree/core", "test"] },
  scope: {
    testGlobs: ["packages/core/src/**/*.test.ts"],
    sourceGlobs: ["packages/core/src/**/*.ts"],
  },
  real: {
    testFile: "packages/core/src/verdict-line.test.ts",
    sourceFile: "packages/core/src/verdict-line.ts",
    scope: {
      testGlobs: ["packages/core/src/verdict-line.test.ts"],
      sourceGlobs: ["packages/core/src/verdict-line.ts"],
    },
  },
};

test("a well-formed install block parses to a typed config, round-trips, and carries install+typecheck", () => {
  const cfg = parseNodeBuildConfig(INSTALL_BLOCK);
  assert.deepEqual(cfg, INSTALL_BLOCK); // exact round-trip (no fields dropped or invented)
  assert.equal(cfg.real?.install, true);
  assert.deepEqual(cfg.real?.typecheck, {
    file: "pnpm",
    args: ["--filter", "@storytree/core", "typecheck"],
  });
});

test("a no-install block parses with install/typecheck/cwd keys ABSENT (the exactOptional no-materialization guard)", () => {
  const cfg = parseNodeBuildConfig(NO_INSTALL_BLOCK);
  assert.deepEqual(cfg, NO_INSTALL_BLOCK);
  assert.ok(cfg.real !== undefined);
  // The parity deepEqual against registry entries that OMIT these keys depends on them being
  // absent, not `undefined` — explicit construction guarantees that.
  assert.equal("install" in cfg.real, false);
  assert.equal("typecheck" in cfg.real, false);
  assert.equal("cwd" in cfg.command, false);
});

test("a block carrying only command+scope (no real arm) parses — dry-run/live-smoke buildable only", () => {
  const cfg = parseNodeBuildConfig({
    command: { file: "pnpm", args: ["-r", "test"] },
    scope: { testGlobs: ["packages/*/src/**/*.test.ts"], sourceGlobs: ["packages/*/src/**/*.ts"] },
  });
  assert.equal(cfg.real, undefined);
  assert.equal("real" in cfg, false);
});

// ── malformed = LOUD (contract 1) ────────────────────────────────────────────────────────────────

test("malformed: a missing scope half is loud", () => {
  assert.throws(() =>
    parseNodeBuildConfig({
      command: { file: "pnpm", args: ["test"] },
      scope: { testGlobs: ["a.test.ts"] }, // sourceGlobs missing
    }),
  );
});

test("malformed: an unknown key (typo) inside the block is loud (.strict, the under-declaration guard)", () => {
  assert.throws(() =>
    parseNodeBuildConfig({
      command: { file: "pnpm", args: ["test"] },
      scope: {
        testGlobs: ["a.test.ts"],
        sourceGlb: ["a.ts"], // typo for sourceGlobs — would silently under-declare scope
        sourceGlobs: ["a.ts"],
      },
    }),
  );
});

test("malformed: an empty command file is loud (.min(1))", () => {
  assert.throws(() =>
    parseNodeBuildConfig({
      command: { file: "", args: [] },
      scope: { testGlobs: ["a.test.ts"], sourceGlobs: ["a.ts"] },
    }),
  );
});

test("malformed: an empty glob array is loud (an empty scope can never allow a write)", () => {
  assert.throws(() =>
    parseNodeBuildConfig({
      command: { file: "pnpm", args: ["test"] },
      scope: { testGlobs: [], sourceGlobs: ["a.ts"] },
    }),
  );
});

test("malformed: install:true WITHOUT typecheck is loud (.refine — tsx strips types; ADR-0031 §2)", () => {
  assert.throws(
    () =>
      parseNodeBuildConfig({
        command: { file: "pnpm", args: ["test"] },
        scope: { testGlobs: ["a.test.ts"], sourceGlobs: ["a.ts"] },
        real: {
          testFile: "a.test.ts",
          sourceFile: "a.ts",
          scope: { testGlobs: ["a.test.ts"], sourceGlobs: ["a.ts"] },
          install: true,
        },
      }),
    /install:true requires/,
  );
});

test("malformed: a real arm missing testFile is loud", () => {
  assert.throws(() =>
    parseNodeBuildConfig({
      command: { file: "pnpm", args: ["test"] },
      scope: { testGlobs: ["a.test.ts"], sourceGlobs: ["a.ts"] },
      real: {
        sourceFile: "a.ts",
        scope: { testGlobs: ["a.test.ts"], sourceGlobs: ["a.ts"] },
      },
    }),
  );
});

test("malformed: a non-array glob is loud (the loader's loud posture covers nested type errors)", () => {
  assert.throws(() =>
    parseNodeBuildConfig({
      command: { file: "pnpm", args: ["test"] },
      scope: { testGlobs: "not-an-array", sourceGlobs: ["a.ts"] },
    }),
  );
});

test("NodeBuildConfigSchema is exported and rejects a non-object", () => {
  assert.equal(NodeBuildConfigSchema.safeParse(null).success, false);
  assert.equal(NodeBuildConfigSchema.safeParse("nope").success, false);
});
