import test from "node:test";
import assert from "node:assert/strict";

import { classifyProofRoute, namesTestFile, withOracleGuard } from "./proof-route.js";
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

test("a package-script proof command is suite-scoped: no oracle possible, and NOT refused", () => {
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

test("a multi-file node:test command is suite-scoped — the runner parent zeroes the report (measured)", () => {
  const route = classifyProofRoute(
    real({
      proofCommand: {
        file: "node",
        args: ["--test", "packages/library/src/thing.test.ts", "packages/library/src/other.test.ts"],
      },
    }),
  );
  assert.equal(route.accounting, "none");
  assert.equal(route.basis, "suite-scoped");
});

test("a GLOB node:test command is suite-scoped, not a single-file run", () => {
  const route = classifyProofRoute(
    real({ proofCommand: { file: "node", args: ["--import", "tsx", "--test", "src/**/*.test.ts"] } }),
  );
  assert.equal(route.accounting, "none");
  assert.equal(route.basis, "suite-scoped");
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
    { file: process.execPath, args: ["-e", "process.exit(0)"] },
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
