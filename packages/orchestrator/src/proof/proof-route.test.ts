import test from "node:test";
import assert from "node:assert/strict";

import { classifyProofRoute, namesTestFile } from "./proof-route.js";
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

// ── The DEFAULT route: no declared command.

test("no declared proofCommand is the default node:test route", () => {
  assert.deepEqual(classifyProofRoute(real()), { basis: "default-node-test" });
});

// ── A declared node command over the node's OWN test file.

test("a declared node:test command over the node's OWN test file is the own-file node route", () => {
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
  assert.equal(route.basis, "custom-node-test-own-file");
});

test("a bare `node --test <ownFile>` command is the own-file node route (the node token IS `file`)", () => {
  const route = classifyProofRoute(
    real({
      testFile: "packages/library/src/thing.test.ts",
      proofCommand: { file: "node", args: ["--test", "packages/library/src/thing.test.ts"] },
    }),
  );
  assert.equal(route.basis, "custom-node-test-own-file");
});

test("a node command with no --test but ONE explicit own-file argument is still the own-file node route", () => {
  const route = classifyProofRoute(
    real({ proofCommand: { file: "node", args: ["--import", "tsx", "packages/library/src/thing.test.ts"] } }),
  );
  assert.equal(route.basis, "custom-node-test-own-file");
});

test("a flag VALUE is never mistaken for the test path — `--import tsx` must not read as a file", () => {
  // If `tsx` (or a loader URL) counted as a path, a single-file command would look multi-file and
  // classify as a suite.
  const route = classifyProofRoute(
    real({
      proofCommand: {
        file: "node",
        args: ["--import", "tsx", "--test-reporter", "spec", "--test", "packages/library/src/thing.test.ts"],
      },
    }),
  );
  assert.equal(route.basis, "custom-node-test-own-file");
});

// ── Suites — never refused. Refusing these would unbuild ADR-0098's R2 arm, whose schema refine
// REQUIRES a suite proofCommand.

test("a package-script proof command is suite-scoped, and NOT refused", () => {
  const route = classifyProofRoute(
    real({ proofCommand: { file: "pnpm", args: ["--filter", "@storytree/library", "test"] } }),
  );
  assert.equal(route.basis, "suite-scoped", "a suite must keep building — R2 nodes are structurally suite-scoped");
});

test("a package name containing a slash does not masquerade as a test path", () => {
  // `--filter @storytree/library` is the shape that would break a naive "contains a slash" path test:
  // it would read as a single explicit file, mismatch `testFile`, and REFUSE a legitimate suite node.
  const route = classifyProofRoute(
    real({ proofCommand: { file: "pnpm", args: ["--filter", "@storytree/library", "test"] } }),
  );
  assert.notEqual(route.basis, "observes-another-file");
});

test("a multi-file node:test command is suite-scoped", () => {
  const route = classifyProofRoute(
    real({
      proofCommand: {
        file: "node",
        args: ["--test", "packages/library/src/thing.test.ts", "packages/library/src/other.test.ts"],
      },
    }),
  );
  assert.equal(route.basis, "suite-scoped");
});

test("a GLOB node:test command is suite-scoped too — glob and multi-file are the same suite shape", () => {
  const route = classifyProofRoute(
    real({ proofCommand: { file: "node", args: ["--import", "tsx", "--test", "src/**/*.test.ts"] } }),
  );
  assert.equal(route.basis, "suite-scoped");
});

test("a vitest command is a foreign runner, even when it runs exactly one file", () => {
  const route = classifyProofRoute(
    real({
      testFile: "apps/studio/src/components/ChatPanel.test.tsx",
      proofCommand: {
        file: "pnpm",
        args: ["--filter", "studio", "exec", "vitest", "run", "src/components/ChatPanel.test.tsx"],
      },
    }),
  );
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
  assert.equal(route.basis, "observes-another-file");
});

test("the refusal NAMES the remedy — a refusal an author cannot act on is not a fix", () => {
  const route = classifyProofRoute(
    real({
      proofCommand: {
        file: "pnpm",
        args: ["--filter", "studio", "exec", "vitest", "run", "src/components/Other.test.tsx"],
      },
    }),
  );
  assert.equal(route.basis, "observes-another-file");
  const reason = route.basis === "observes-another-file" ? route.reason : "";
  assert.match(reason, /packages\/library\/src\/thing\.test\.ts/, "it must name the file AUTHOR_TEST writes");
  assert.match(reason, /node --import tsx --test/, "it must name the default route");
});

test("a command this spine cannot READ is not refused — unverified is not the same as broken", () => {
  // The line the refusal above draws: it fires on a command proved unable to observe the authored
  // test, never on one merely unreadable. Refusing the unreadable would fence off an install-free
  // `node -e` probe or a shell proof to protect nothing — its red/green is still the exit code.
  for (const cmd of [
    { file: "make", args: ["proof"] },
    // The `node -e` probe the comment above names, spelled as a LITERAL: `process.execPath` is
    // `bun.exe` under `bun test`, which classifies as a package manager rather than the
    // unreadable-node-command this leg exists to pin (see `NODE_BINARY` in `proof-route.ts`).
    { file: "node", args: ["-e", "process.exit(0)"] },
  ]) {
    const route = classifyProofRoute(real({ proofCommand: cmd }));
    assert.equal(route.basis, "unrecognised-runner", `${cmd.file} must stay buildable`);
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
  // pass a command observing something else entirely as this node's own-file route.
  assert.equal(namesTestFile("thing.test.ts", "packages/library/src/other-thing.test.ts"), false);
});
