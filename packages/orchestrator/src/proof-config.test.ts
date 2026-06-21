import { test } from "node:test";
import assert from "node:assert/strict";

import {
  parseNodeBuildConfig,
  NodeBuildConfigSchema,
  scopeGlobBoundIssue,
} from "./proof-config.js";

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
  // B (ADR-0057 §3): a default node:test node carries no proofCommand — the key must be ABSENT, so
  // the parity deepEqual against the registry twins (which never declare one) holds.
  assert.equal("proofCommand" in cfg.real, false);
});

test("a block carrying only command+scope (no real arm) parses — dry-run/live-smoke buildable only", () => {
  const cfg = parseNodeBuildConfig({
    command: { file: "pnpm", args: ["--filter", "@storytree/orchestrator", "test"] },
    scope: {
      testGlobs: ["packages/orchestrator/src/**/*.test.ts"],
      sourceGlobs: ["packages/orchestrator/src/**/*.ts"],
    },
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

// ── ADR-0057 §3 expansion B: a node-declared proof command (proof-mode vocabulary) ──────────────

/** A no-deps custom proof command (node-based) — install-free-legitimate. */
const DECLARED_NODE_PROOF = {
  command: { file: "pnpm", args: ["--filter", "@storytree/core", "test"] },
  scope: {
    testGlobs: ["packages/core/src/**/*.test.ts"],
    sourceGlobs: ["packages/core/src/**/*.ts"],
  },
  real: {
    testFile: "packages/core/src/widget.test.ts",
    sourceFile: "packages/core/src/widget.ts",
    scope: {
      testGlobs: ["packages/core/src/widget.test.ts"],
      sourceGlobs: ["packages/core/src/widget.ts"],
    },
    proofCommand: { file: "node", args: ["--test", "packages/core/src/widget.test.cjs"] },
  },
};

/** A pnpm custom proof command — needs node_modules, so install:true + typecheck are required. */
const DECLARED_PNPM_PROOF = {
  command: { file: "pnpm", args: ["--filter", "@storytree/cli", "test"] },
  scope: {
    testGlobs: ["packages/cli/src/**/*.test.ts"],
    sourceGlobs: ["packages/cli/src/**/*.ts"],
  },
  real: {
    testFile: "packages/cli/src/widget.test.ts",
    sourceFile: "packages/cli/src/widget.ts",
    scope: {
      testGlobs: ["packages/cli/src/widget.test.ts"],
      sourceGlobs: ["packages/cli/src/widget.ts"],
    },
    install: true,
    typecheck: { file: "pnpm", args: ["--filter", "@storytree/cli", "typecheck"] },
    proofCommand: { file: "pnpm", args: ["--filter", "@storytree/cli", "test"] },
  },
};

test("B — a real arm with a declared (node) proofCommand parses and round-trips", () => {
  const cfg = parseNodeBuildConfig(DECLARED_NODE_PROOF);
  assert.deepEqual(cfg, DECLARED_NODE_PROOF);
  assert.deepEqual(cfg.real?.proofCommand, {
    file: "node",
    args: ["--test", "packages/core/src/widget.test.cjs"],
  });
});

test("B — a pnpm proofCommand WITH install+typecheck parses and round-trips", () => {
  const cfg = parseNodeBuildConfig(DECLARED_PNPM_PROOF);
  assert.deepEqual(cfg, DECLARED_PNPM_PROOF);
  assert.equal(cfg.real?.proofCommand?.file, "pnpm");
});

test("B — malformed: a proofCommand with an empty file is loud", () => {
  assert.throws(() =>
    parseNodeBuildConfig({
      ...DECLARED_NODE_PROOF,
      real: { ...DECLARED_NODE_PROOF.real, proofCommand: { file: "", args: [] } },
    }),
  );
});

test("B — malformed: a proofCommand carrying a cwd is loud (the spine forces cwd)", () => {
  assert.throws(
    () =>
      parseNodeBuildConfig({
        ...DECLARED_NODE_PROOF,
        real: {
          ...DECLARED_NODE_PROOF.real,
          proofCommand: { file: "node", args: ["--test", "x"], cwd: "../../etc" },
        },
      }),
    /cwd is not allowed/,
  );
});

test("B — malformed: a typo'd key inside proofCommand is loud (.strict reused)", () => {
  assert.throws(() =>
    parseNodeBuildConfig({
      ...DECLARED_NODE_PROOF,
      real: {
        ...DECLARED_NODE_PROOF.real,
        proofCommand: { file: "node", args: ["--test", "x"], arrgs: ["typo"] },
      },
    }),
  );
});

test("B — malformed: a pnpm proofCommand WITHOUT install:true is loud (worktree has no node_modules)", () => {
  assert.throws(
    () =>
      parseNodeBuildConfig({
        ...DECLARED_NODE_PROOF,
        real: {
          ...DECLARED_NODE_PROOF.real,
          proofCommand: { file: "pnpm", args: ["--filter", "x", "test"] },
        },
      }),
    /pnpm proof command requires real\.install:true/,
  );
});

// ── ADR-0057 §3 expansion C: editsExisting (multi-file & edit-existing-source) ──────────────────

/** A single-file edit-existing arm: `sourceGlobs === [sourceFile]`, so the default node:test proof is legal. */
const EDIT_EXISTING_SINGLE = {
  command: { file: "pnpm", args: ["--filter", "@storytree/core", "test"] },
  scope: {
    testGlobs: ["packages/core/src/widget.test.ts"],
    sourceGlobs: ["packages/core/src/widget.ts"],
  },
  real: {
    testFile: "packages/core/src/widget.test.ts",
    sourceFile: "packages/core/src/widget.ts",
    scope: {
      testGlobs: ["packages/core/src/widget.test.ts"],
      sourceGlobs: ["packages/core/src/widget.ts"],
    },
    editsExisting: true,
  },
};

test("C — an editsExisting single-file arm parses and round-trips (default node:test proof legal)", () => {
  const cfg = parseNodeBuildConfig(EDIT_EXISTING_SINGLE);
  assert.deepEqual(cfg, EDIT_EXISTING_SINGLE);
  assert.equal(cfg.real?.editsExisting, true);
  // No proofCommand needed when sourceGlobs is exactly the spotlight file.
  assert.equal("proofCommand" in (cfg.real ?? {}), false);
});

test("C — editsExisting is ABSENT (not undefined) when not declared — the net-new parity drift-lock", () => {
  // The 7 migrated net-new nodes never declare editsExisting; the key must not materialize, or the
  // deepEqual parity against the registry twins (which omit it) would break.
  const cfg = parseNodeBuildConfig(NO_INSTALL_BLOCK);
  assert.ok(cfg.real !== undefined);
  assert.equal("editsExisting" in cfg.real, false);
});

test("C — honesty refine: editsExisting + a source scope BROADER than sourceFile + no proofCommand is LOUD", () => {
  // The default node:test runs ONE file; it cannot observe a regression across other edited files,
  // so a multi-file edit-existing node MUST declare a suite proofCommand.
  assert.throws(
    () =>
      parseNodeBuildConfig({
        ...EDIT_EXISTING_SINGLE,
        real: {
          ...EDIT_EXISTING_SINGLE.real,
          scope: {
            testGlobs: ["packages/core/src/widget.test.ts"],
            sourceGlobs: ["packages/core/src/widget.ts", "packages/core/src/helper.ts"],
          },
        },
      }),
    /must declare real\.proofCommand/,
  );
});

test("C — honesty refine: editsExisting + a single BROAD glob (≠ sourceFile) + no proofCommand is LOUD", () => {
  // The exemption is a LITERAL string equality (sourceGlobs[0] === sourceFile), not a glob match — a
  // single `**/*.ts` glob is length-1 yet matches many files, so it must NOT exempt. Lock this so a
  // future "helpful" refactor to a glob-match cannot silently reopen the proof-coverage hole.
  assert.throws(
    () =>
      parseNodeBuildConfig({
        ...EDIT_EXISTING_SINGLE,
        real: {
          ...EDIT_EXISTING_SINGLE.real,
          scope: {
            testGlobs: ["packages/core/src/widget.test.ts"],
            sourceGlobs: ["packages/core/src/**/*.ts"],
          },
        },
      }),
    /must declare real\.proofCommand/,
  );
});

test("C — honesty refine (wildcard tightening): editsExisting + a single wildcard glob EQUAL to sourceFile + no proofCommand is LOUD", () => {
  // The hole the literal-equality exemption left open (owner call 2026-06-21): a `sourceFile` that is
  // ITSELF a `*` wildcard, with `sourceGlobs === [sourceFile]`, is length-1 AND string-equal yet
  // matches MANY files — the default single-file proof can't observe a regression across them. The
  // tightened exemption requires the single glob to carry no `*`, so this now demands a suite.
  assert.throws(
    () =>
      parseNodeBuildConfig({
        ...EDIT_EXISTING_SINGLE,
        real: {
          ...EDIT_EXISTING_SINGLE.real,
          testFile: "packages/core/src/widget.test.ts",
          sourceFile: "packages/core/src/**/*.ts",
          scope: {
            testGlobs: ["packages/core/src/widget.test.ts"],
            sourceGlobs: ["packages/core/src/**/*.ts"],
          },
        },
      }),
    /must declare real\.proofCommand/,
  );
});

test("C — no-install owner call (2026-06-21): editsExisting WITHOUT install is ACCEPTED (builtins-only edits stay legal)", () => {
  // Edit-existing intentionally does NOT force install:true — a builtins-only edit-existing node is
  // legitimate on a bare worktree. Lock the decision so a future "force install for edit-existing"
  // refactor would break a labeled test, not slip in silently.
  const cfg = parseNodeBuildConfig(EDIT_EXISTING_SINGLE);
  assert.equal(cfg.real?.editsExisting, true);
  assert.equal("install" in (cfg.real ?? {}), false);
});

test("C — editsExisting + a broader source scope + a declared suite proofCommand is ACCEPTED", () => {
  const cfg = parseNodeBuildConfig({
    ...EDIT_EXISTING_SINGLE,
    real: {
      ...EDIT_EXISTING_SINGLE.real,
      scope: {
        testGlobs: ["packages/core/src/widget.test.ts"],
        sourceGlobs: ["packages/core/src/widget.ts", "packages/core/src/helper.ts"],
      },
      install: true,
      typecheck: { file: "pnpm", args: ["--filter", "@storytree/core", "typecheck"] },
      proofCommand: { file: "pnpm", args: ["--filter", "@storytree/core", "test"] },
    },
  });
  assert.equal(cfg.real?.editsExisting, true);
  assert.equal(cfg.real?.proofCommand?.file, "pnpm");
});

test("C — a NET-NEW node may carry a broad source scope with no proofCommand (the refine is editsExisting-only)", () => {
  // The refine must NOT fire on a net-new node — only editsExisting:true gates the suite requirement.
  const cfg = parseNodeBuildConfig({
    ...EDIT_EXISTING_SINGLE,
    real: {
      testFile: "packages/core/src/widget.test.ts",
      sourceFile: "packages/core/src/widget.ts",
      scope: {
        testGlobs: ["packages/core/src/widget.test.ts"],
        sourceGlobs: ["packages/core/src/**/*.ts"],
      },
      // no editsExisting, no proofCommand — net-new is unaffected
    },
  });
  assert.equal("editsExisting" in (cfg.real ?? {}), false);
});

// ── ADR-0064: DB-backed proof (real.db) ──────────────────────────────────────────────────────────

/** A db-backed arm: db:true with install+typecheck (the proof imports the pg change store from node_modules). */
const DB_BACKED_BLOCK = {
  command: { file: "pnpm", args: ["--filter", "@storytree/orchestrator", "test"] },
  scope: {
    testGlobs: ["packages/orchestrator/src/store/**/*.test.ts"],
    sourceGlobs: ["packages/orchestrator/src/store/**/*.ts"],
  },
  real: {
    testFile: "packages/orchestrator/src/store/pg-change-store.test.ts",
    sourceFile: "packages/orchestrator/src/store/pg-change-store.ts",
    scope: {
      testGlobs: ["packages/orchestrator/src/store/pg-change-store.test.ts"],
      sourceGlobs: ["packages/orchestrator/src/store/pg-change-store.ts"],
    },
    install: true,
    typecheck: { file: "pnpm", args: ["--filter", "@storytree/orchestrator", "typecheck"] },
    db: true,
  },
};

test("ADR-0064 — a db:true arm with install+typecheck parses and round-trips", () => {
  const cfg = parseNodeBuildConfig(DB_BACKED_BLOCK);
  assert.deepEqual(cfg, DB_BACKED_BLOCK);
  assert.equal(cfg.real?.db, true);
});

test("ADR-0064 — db is ABSENT (not undefined) when not declared — the parity drift-lock against the registry", () => {
  // The 7 migrated nodes never declare db; the key must not materialize, or the contract-4 deepEqual
  // parity against the registry twins (which omit it) would break.
  const cfg = parseNodeBuildConfig(NO_INSTALL_BLOCK);
  assert.ok(cfg.real !== undefined);
  assert.equal("db" in cfg.real, false);
});

test("ADR-0064 — malformed: db:true WITHOUT install:true is LOUD (the proof can't import the store without node_modules)", () => {
  assert.throws(
    () =>
      parseNodeBuildConfig({
        command: { file: "pnpm", args: ["test"] },
        scope: { testGlobs: ["a.test.ts"], sourceGlobs: ["a.ts"] },
        real: {
          testFile: "a.test.ts",
          sourceFile: "a.ts",
          scope: { testGlobs: ["a.test.ts"], sourceGlobs: ["a.ts"] },
          db: true,
        },
      }),
    /real\.db:true requires real\.install:true/,
  );
});

// ── ADR-0064 §2: guarded dependency adds (real.addDeps) ──────────────────────────────────────────

/** An addDeps arm: declared NEW deps the spine adds; requires install+typecheck. */
const ADD_DEPS_BLOCK = {
  command: { file: "pnpm", args: ["--filter", "@storytree/core", "test"] },
  scope: {
    testGlobs: ["packages/core/src/**/*.test.ts"],
    sourceGlobs: ["packages/core/src/**/*.ts"],
  },
  real: {
    testFile: "packages/core/src/anchor.test.ts",
    sourceFile: "packages/core/src/anchor.ts",
    scope: {
      testGlobs: ["packages/core/src/anchor.test.ts"],
      sourceGlobs: ["packages/core/src/anchor.ts"],
    },
    install: true,
    typecheck: { file: "pnpm", args: ["--filter", "@storytree/core", "typecheck"] },
    addDeps: ["tree-sitter", "tree-sitter-typescript@0.21.0"],
  },
};

test("ADR-0064 §2 — an addDeps arm with install+typecheck parses and round-trips", () => {
  const cfg = parseNodeBuildConfig(ADD_DEPS_BLOCK);
  assert.deepEqual(cfg, ADD_DEPS_BLOCK);
  assert.deepEqual(cfg.real?.addDeps, ["tree-sitter", "tree-sitter-typescript@0.21.0"]);
});

test("ADR-0064 §2 — addDeps is ABSENT (not undefined) when not declared — the parity drift-lock", () => {
  const cfg = parseNodeBuildConfig(NO_INSTALL_BLOCK);
  assert.ok(cfg.real !== undefined);
  assert.equal("addDeps" in cfg.real, false);
});

test("ADR-0064 §2 — malformed: addDeps WITHOUT install:true is LOUD (`pnpm add` needs the workspace installed)", () => {
  assert.throws(
    () =>
      parseNodeBuildConfig({
        command: { file: "pnpm", args: ["test"] },
        scope: { testGlobs: ["a.test.ts"], sourceGlobs: ["a.ts"] },
        real: {
          testFile: "a.test.ts",
          sourceFile: "a.ts",
          scope: { testGlobs: ["a.test.ts"], sourceGlobs: ["a.ts"] },
          addDeps: ["tree-sitter"],
        },
      }),
    /real\.addDeps requires real\.install:true/,
  );
});

test("ADR-0064 §2 — malformed: an addDeps entry starting with `-` is LOUD (no flag injection)", () => {
  assert.throws(
    () =>
      parseNodeBuildConfig({
        ...ADD_DEPS_BLOCK,
        real: { ...ADD_DEPS_BLOCK.real, addDeps: ["tree-sitter", "--registry=evil"] },
      }),
    /must be package specs/,
  );
});

test("ADR-0064 §2 — an empty addDeps entry is LOUD (.min(1))", () => {
  assert.throws(() =>
    parseNodeBuildConfig({
      ...ADD_DEPS_BLOCK,
      real: { ...ADD_DEPS_BLOCK.real, addDeps: [""] },
    }),
  );
});

// ── ADR-0087: the structural bound on a spec-borne write scope ────────────────────────────────────
// A self-registered node writes its own scope globs (ADR-0057). Instead of leaving an over-declared
// scope to PR-diff review (the registry status quo), the schema refuses — by construction — any glob
// reaching outside ONE concrete package/app. The pure judge is unit-tested directly; the refine wiring
// is proven through `parseNodeBuildConfig`.

/** A well-formed block whose outer + real scopes can be overridden per-case. */
const SCOPED = (testGlobs: string[], sourceGlobs: string[]) => ({
  command: { file: "pnpm", args: ["--filter", "@storytree/core", "test"] },
  scope: { testGlobs, sourceGlobs },
  real: {
    testFile: "packages/core/src/widget.test.ts",
    sourceFile: "packages/core/src/widget.ts",
    scope: {
      testGlobs: ["packages/core/src/widget.test.ts"],
      sourceGlobs: ["packages/core/src/widget.ts"],
    },
  },
});

test("ADR-0087 — scopeGlobBoundIssue: a concrete packages/<pkg>/ glob is in bounds (null)", () => {
  assert.equal(scopeGlobBoundIssue("packages/core/src/**/*.ts"), null);
  assert.equal(scopeGlobBoundIssue("packages/orchestrator/src/proof/anchor.ts"), null);
  assert.equal(scopeGlobBoundIssue("apps/studio/src/**/*.tsx"), null);
});

test("ADR-0087 — scopeGlobBoundIssue: out-of-bounds globs each return a reason", () => {
  // a bare repo-wide glob — the case the owner named explicitly
  assert.match(scopeGlobBoundIssue("**/*") ?? "", /rooted under/);
  assert.match(scopeGlobBoundIssue("**/*.ts") ?? "", /rooted under/);
  // not anchored to a known code root
  assert.match(scopeGlobBoundIssue("src/**/*.ts") ?? "", /rooted under/);
  assert.match(scopeGlobBoundIssue("docs/**/*.md") ?? "", /rooted under/);
  // wildcard package segment — spans the whole monorepo
  assert.match(scopeGlobBoundIssue("packages/*/src/**/*.ts") ?? "", /concrete package/);
  assert.match(scopeGlobBoundIssue("apps/**/*.ts") ?? "", /concrete package/);
  // upward escape
  assert.match(scopeGlobBoundIssue("../../etc/passwd") ?? "", /escape/);
  assert.match(scopeGlobBoundIssue("packages/core/../store/src/x.ts") ?? "", /escape/);
  // absolute paths
  assert.match(scopeGlobBoundIssue("/etc/passwd") ?? "", /absolute/);
  assert.match(scopeGlobBoundIssue("C:/Windows/system32") ?? "", /absolute/);
});

test("ADR-0087 — parse: a bare **/* sourceGlob is LOUD (over-broad self-registered scope)", () => {
  assert.throws(
    () => parseNodeBuildConfig(SCOPED(["packages/core/src/widget.test.ts"], ["**/*"])),
    /over-broad scope glob/,
  );
});

test("ADR-0087 — parse: a wildcard-package glob is LOUD (must name one concrete package)", () => {
  assert.throws(
    () =>
      parseNodeBuildConfig(
        SCOPED(["packages/*/src/**/*.test.ts"], ["packages/*/src/**/*.ts"]),
      ),
    /over-broad scope glob/,
  );
});

test("ADR-0087 — parse: the bound applies to testGlobs, not only sourceGlobs", () => {
  assert.throws(
    () => parseNodeBuildConfig(SCOPED(["**/*.test.ts"], ["packages/core/src/widget.ts"])),
    /over-broad scope glob/,
  );
});

test("ADR-0087 — parse: the bound also walls the inner real.scope", () => {
  assert.throws(
    () =>
      parseNodeBuildConfig({
        ...SCOPED(["packages/core/src/widget.test.ts"], ["packages/core/src/widget.ts"]),
        real: {
          testFile: "packages/core/src/widget.test.ts",
          sourceFile: "packages/core/src/widget.ts",
          // a `..` escape in the REAL arm's source scope must be refused too
          scope: {
            testGlobs: ["packages/core/src/widget.test.ts"],
            sourceGlobs: ["packages/core/../store/src/x.ts"],
          },
        },
      }),
    /over-broad scope glob/,
  );
});

test("ADR-0087 — parse: a fully concrete-package scope is ACCEPTED (no false positive)", () => {
  const cfg = parseNodeBuildConfig(
    SCOPED(["packages/core/src/**/*.test.ts"], ["packages/core/src/**/*.ts"]),
  );
  assert.deepEqual(cfg.scope.sourceGlobs, ["packages/core/src/**/*.ts"]);
});
