import test from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";

import { classifyProofRoute, namesTestFile, withOracleGuard, withOracleGuardEnv } from "./proof-route.js";
import type { RealProofConfig } from "../proof-config.js";

/** A minimal REAL arm; each case overrides only what it is about. */
function real(overrides: Partial<RealProofConfig> = {}): RealProofConfig {
  return {
    testFile: "packages/library/src/thing.test.ts",
    sourceFile: "packages/library/src/thing.ts",
    scope: {
      testGlobs: ["packages/library/src/thing.test.ts"],
      sourceGlobs: ["packages/library/src/thing.ts"],
    },
    ...overrides,
  };
}

// ── The DEFAULT route is unchanged: it was accounted before this classifier existed and must still be.

test("no declared proofCommand is the default node:test route, and it is oracle-accounted", () => {
  const route = classifyProofRoute(real());
  assert.equal(route.accounting, "oracle");
  assert.equal(route.basis, "default-node-test");
  assert.equal(route.accounting === "oracle" ? route.guardArgIndex : "n/a", null);
});

// ── "No oracle WIRED" — the gap this closes. A declared command that runs node:test over the node's
// OWN test file is byte-for-byte the shape ADR-0211's guard was built for; it lost accounting only for
// declaring itself. This is the arm that makes the increment's title literally true.

test("a declared node:test command over the node's OWN test file is oracle-accounted (the wired gap)", () => {
  const route = classifyProofRoute(
    real({
      testFile: "packages/notice-board/src/store/claim.live.test.ts",
      proofCommand: {
        file: "pnpm",
        args: [
          "--filter",
          "@storytree/notice-board",
          "exec",
          "node",
          "--import",
          "tsx",
          "--test",
          "--test-force-exit",
          "src/store/claim.live.test.ts",
        ],
      },
    }),
  );
  assert.equal(route.accounting, "oracle", "a single-file node:test run is exactly what the guard measures");
  assert.equal(route.basis, "custom-node-test-own-file");
  // tokens = [pnpm, --filter, @storytree/notice-board, exec, node, ...] → node is tokens[4]; since
  // tokens[0] is `file`, args index 4 is the slot immediately AFTER the `node` token.
  assert.equal(route.accounting === "oracle" ? route.guardArgIndex : -1, 4);
});

test("the guard index splices --import immediately after the node token, leaving the rest in order", () => {
  const args = ["--filter", "pkg", "exec", "node", "--import", "tsx", "--test", "src/x.test.ts"];
  assert.deepEqual(withOracleGuard(args, 4, "file:///guard.mjs"), [
    "--filter",
    "pkg",
    "exec",
    "node",
    "--import",
    "file:///guard.mjs",
    "--import",
    "tsx",
    "--test",
    "src/x.test.ts",
  ]);
});

test("a bare `node --test <ownFile>` command puts the guard at args index 0 (the node token IS `file`)", () => {
  const route = classifyProofRoute(
    real({
      testFile: "packages/library/src/thing.test.ts",
      proofCommand: { file: "node", args: ["--test", "packages/library/src/thing.test.ts"] },
    }),
  );
  assert.equal(route.accounting, "oracle");
  assert.equal(route.accounting === "oracle" ? route.guardArgIndex : -1, 0);
});

test("a node command with no --test but ONE explicit own-file argument is still accountable (one process, node:assert)", () => {
  const route = classifyProofRoute(
    real({ proofCommand: { file: "node", args: ["--import", "tsx", "packages/library/src/thing.test.ts"] } }),
  );
  assert.equal(route.accounting, "oracle");
  assert.equal(route.basis, "custom-node-test-own-file");
});

test("a flag VALUE is never mistaken for the test path — `--import tsx` must not read as a file", () => {
  // If `tsx` (or a loader URL) counted as a path, a single-file command would look multi-file and
  // silently lose the accounting this change just gave it.
  const route = classifyProofRoute(
    real({
      proofCommand: {
        file: "node",
        args: ["--import", "tsx", "--test-reporter", "spec", "--test", "packages/library/src/thing.test.ts"],
      },
    }),
  );
  assert.equal(route.accounting, "oracle");
});

// ── "No oracle POSSIBLE" — disclosed, never refused. Refusing these would unbuild ADR-0098's R2 arm,
// whose schema refine REQUIRES a suite proofCommand.

test("a package-script proof command with NO workspaceRoot supplied is suite-scoped: no oracle possible, and NOT refused", () => {
  // classifyProofRoute's early (pre-worktree) refusal-check call site passes no opts at all — this is
  // that degrade path: unable to read the target's package.json, it must never GUESS.
  const route = classifyProofRoute(
    real({ proofCommand: { file: "pnpm", args: ["--filter", "@storytree/library", "test"] } }),
  );
  assert.equal(route.accounting, "none", "a suite must keep building — R2 nodes are structurally suite-scoped");
  assert.equal(route.basis, "suite-scoped");
  assert.match(route.accounting === "none" ? route.disclosure : "", /no oracle is POSSIBLE/);
});

test("a package name containing a slash does not masquerade as a test path", () => {
  // `--filter @storytree/library` is the shape that would break a naive "contains a slash" path test:
  // it would read as a single explicit file, mismatch `testFile`, and REFUSE a legitimate suite node.
  const route = classifyProofRoute(
    real({ proofCommand: { file: "pnpm", args: ["--filter", "@storytree/library", "test"] } }),
  );
  assert.notEqual(route.accounting, "refused");
});

// ── "no oracle WIRED" (residual), the package-script-node-test-suite arm: `pnpm --filter <pkg> test`
// is accountable IFF the target package's OWN scripts.test is provably a bare node:test invocation —
// read from its package.json, never guessed from the pnpm token stream, which cannot see it.

/** A throwaway `{packages,apps}/<name>/package.json` workspace fixture for the lookup under test. */
async function workspaceFixture(
  members: ReadonlyArray<{ root: "packages" | "apps"; dir: string; name: string; test: string }>,
): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "storytree-proof-route-ws-"));
  for (const m of members) {
    const pkgDir = path.join(root, m.root, m.dir);
    await fs.mkdir(pkgDir, { recursive: true });
    await fs.writeFile(
      path.join(pkgDir, "package.json"),
      JSON.stringify({ name: m.name, scripts: { test: m.test } }),
    );
  }
  return root;
}

test("a bare `pnpm --filter <pkg> test` IS oracle-accounted when the target's own scripts.test is node:test", async () => {
  const workspaceRoot = await workspaceFixture([
    {
      root: "packages",
      dir: "library",
      name: "@storytree/library",
      test: 'node --import tsx --test "src/**/*.test.ts"',
    },
  ]);
  try {
    const route = classifyProofRoute(
      real({
        testFile: "packages/library/src/thing.test.ts",
        proofCommand: { file: "pnpm", args: ["--filter", "@storytree/library", "test"] },
      }),
      { workspaceRoot },
    );
    assert.equal(route.accounting, "oracle");
    assert.equal(route.basis, "package-script-node-test-suite");
    assert.equal(route.accounting === "oracle" ? route.guardArgIndex : -1, null);
  } finally {
    await fs.rm(workspaceRoot, { recursive: true, force: true });
  }
});

test("a bare `pnpm --filter <pkg> test` STAYS unaccounted when the target's own scripts.test is a foreign runner", async () => {
  // The exact real-corpus hazard this lookup exists to prevent: `studio`/`@storytree/app-surface`
  // both declare a BARE `pnpm --filter <pkg> test`, and their OWN scripts.test is `vitest run` — the
  // pnpm token stream alone cannot see that, so wiring the guard without reading the manifest would
  // false-red every green on those packages (vitest does not exercise node:assert the way it counts).
  const workspaceRoot = await workspaceFixture([
    { root: "apps", dir: "studio", name: "studio", test: "vitest run" },
  ]);
  try {
    const route = classifyProofRoute(
      real({
        testFile: "apps/studio/src/components/Thing.test.tsx",
        proofCommand: { file: "pnpm", args: ["--filter", "studio", "test"] },
      }),
      { workspaceRoot },
    );
    assert.equal(route.accounting, "none");
    assert.equal(route.basis, "suite-scoped");
  } finally {
    await fs.rm(workspaceRoot, { recursive: true, force: true });
  }
});

test("an UNRESOLVABLE --filter target degrades to the conservative disclosure, never a guess", async () => {
  const workspaceRoot = await workspaceFixture([
    { root: "packages", dir: "library", name: "@storytree/library", test: "node --import tsx --test" },
  ]);
  try {
    const route = classifyProofRoute(
      real({ proofCommand: { file: "pnpm", args: ["--filter", "@storytree/nonexistent", "test"] } }),
      { workspaceRoot },
    );
    assert.equal(route.accounting, "none");
    assert.equal(route.basis, "suite-scoped");
  } finally {
    await fs.rm(workspaceRoot, { recursive: true, force: true });
  }
});

test("a resolved node:test package whose testFile does NOT live under it stays unaccounted (safety fence)", async () => {
  const workspaceRoot = await workspaceFixture([
    {
      root: "packages",
      dir: "library",
      name: "@storytree/library",
      test: 'node --import tsx --test "src/**/*.test.ts"',
    },
  ]);
  try {
    const route = classifyProofRoute(
      real({
        // testFile belongs to a DIFFERENT package than the one --filter names.
        testFile: "packages/orchestrator/src/thing.test.ts",
        proofCommand: { file: "pnpm", args: ["--filter", "@storytree/library", "test"] },
      }),
      { workspaceRoot },
    );
    assert.equal(route.accounting, "none");
    assert.equal(route.basis, "suite-scoped");
  } finally {
    await fs.rm(workspaceRoot, { recursive: true, force: true });
  }
});

test("withOracleGuardEnv composes a NODE_OPTIONS value, preserving any existing one", () => {
  assert.equal(withOracleGuardEnv(undefined, "file:///guard.mjs"), "--import file:///guard.mjs");
  assert.equal(withOracleGuardEnv("", "file:///guard.mjs"), "--import file:///guard.mjs");
  assert.equal(
    withOracleGuardEnv("--max-old-space-size=4096", "file:///guard.mjs"),
    "--max-old-space-size=4096 --import file:///guard.mjs",
  );
});

// ── "no oracle WIRED" (residual), the direct-node-test-suite arm: multi-file/glob node:test, run
// DIRECTLY (never through a package manager), is now oracle-accounted — the per-process report
// aggregation in oracle-accounting.ts is what makes a shared-report multi-process run measurable at
// all, so the arg splice this shape already supports (it IS the node token, same as own-file) can be
// wired unconditionally, with no package.json lookup needed.

test("a multi-file node:test command is now oracle-accounted (direct-node-test-suite) — per-process reports fixed the zeroing", () => {
  const route = classifyProofRoute(
    real({
      proofCommand: {
        file: "node",
        args: ["--test", "packages/library/src/thing.test.ts", "packages/library/src/other.test.ts"],
      },
    }),
  );
  assert.equal(route.accounting, "oracle");
  assert.equal(route.basis, "direct-node-test-suite");
  assert.equal(route.accounting === "oracle" ? route.guardArgIndex : -1, 0);
});

test("a GLOB node:test command is oracle-accounted too — glob and multi-file are the same suite shape", () => {
  const route = classifyProofRoute(
    real({ proofCommand: { file: "node", args: ["--import", "tsx", "--test", "src/**/*.test.ts"] } }),
  );
  assert.equal(route.accounting, "oracle");
  assert.equal(route.basis, "direct-node-test-suite");
  assert.equal(route.accounting === "oracle" ? route.guardArgIndex : -1, 0);
});

test("a vitest command is a foreign runner: no oracle possible even when it runs exactly one file", () => {
  const route = classifyProofRoute(
    real({
      testFile: "apps/studio/src/components/ChatPanel.test.tsx",
      proofCommand: {
        file: "pnpm",
        args: ["--filter", "studio", "exec", "vitest", "run", "src/components/ChatPanel.test.tsx"],
      },
    }),
  );
  assert.equal(route.accounting, "none", "vitest asserts through chai `expect`; the node:assert guard counts none of it");
  assert.equal(route.basis, "foreign-runner");
});

// ── REFUSED — the unprovable combination, caught before the first paid authoring turn.

test("a single-file command pointed at a DIFFERENT file than testFile is refused at resolve time", () => {
  const route = classifyProofRoute(
    real({
      testFile: "packages/library/src/thing.test.ts",
      proofCommand: { file: "node", args: ["--test", "packages/library/src/somethingElse.test.ts"] },
    }),
  );
  assert.equal(route.accounting, "refused");
  assert.equal(route.basis, "observes-another-file");
});

test("the refusal NAMES the oracle-accounted remedy — a refusal an author cannot act on is not a fix", () => {
  const route = classifyProofRoute(
    real({
      proofCommand: {
        file: "pnpm",
        args: ["--filter", "studio", "exec", "vitest", "run", "src/components/Other.test.tsx"],
      },
    }),
  );
  assert.equal(route.accounting, "refused");
  const reason = route.accounting === "refused" ? route.reason : "";
  assert.match(reason, /packages\/library\/src\/thing\.test\.ts/, "it must name the file AUTHOR_TEST writes");
  assert.match(reason, /node --import tsx --test/, "it must name the default oracle-accounted route");
});

test("a command this spine cannot READ is DISCLOSED, not refused — unverified is not the same as broken", () => {
  // The line the refusal above draws: it fires on a command proved unable to observe the authored
  // test, never on one merely unreadable. Refusing the unreadable would fence off an install-free
  // `node -e` probe or a shell proof to protect an honesty property that is not at risk — the route
  // stays exit-code-only and stamps its green unvetted either way.
  for (const cmd of [
    { file: "make", args: ["proof"] },
    // The `node -e` probe the comment above names, spelled as a LITERAL: `process.execPath` is
    // `bun.exe` under `bun test`, which classifies as a package manager rather than the
    // unreadable-node-command this leg exists to pin (see `NODE_BINARY` in `proof-route.ts`).
    { file: "node", args: ["-e", "process.exit(0)"] },
  ]) {
    const route = classifyProofRoute(real({ proofCommand: cmd }));
    assert.equal(route.accounting, "none", `${cmd.file} must stay buildable`);
    assert.equal(route.basis, "unrecognised-runner");
    assert.match(
      route.accounting === "none" ? route.disclosure : "",
      /node --import tsx --test/,
      "the disclosure still names the oracle-accounted alternative",
    );
  }
});

// ── The package-relative ↔ repo-relative join the suffix match exists for.

test("namesTestFile relates a package-relative argument to the repo-relative testFile", () => {
  assert.ok(namesTestFile("src/store/claim.live.test.ts", "packages/notice-board/src/store/claim.live.test.ts"));
  assert.ok(namesTestFile("packages/library/src/thing.test.ts", "packages/library/src/thing.test.ts"));
  assert.ok(namesTestFile("./src/thing.test.ts", "packages/library/src/thing.test.ts"));
  assert.ok(namesTestFile("src\\thing.test.ts", "packages/library/src/thing.test.ts"), "windows separators");
});

test("namesTestFile matches on a PATH BOUNDARY — a bare filename suffix is not a match by accident", () => {
  // `other-thing.test.ts` ends with `thing.test.ts` as a STRING; treating that as the same file would
  // wire the guard onto a command observing something else entirely.
  assert.equal(namesTestFile("thing.test.ts", "packages/library/src/other-thing.test.ts"), false);
});
