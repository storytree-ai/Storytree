import test from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { loadBehaviourClaimUnits, loadCoverageUnit } from "./commands.js";
import { sweepRealBuildCoverage } from "./coverage-gate.js";

/**
 * The cli's three disk readers of a capability's test surface — `storytree coverage`, `storytree
 * coverage --contractless` and the coverage sweep — each hand the static read the test file's own
 * path, so a `.tsx` file parses as TSX (batched-test-authoring-arc-inc-06).
 *
 * Read as plain TypeScript, JSX is a run of syntax errors, and the parser's recovery can close a
 * `describe` early: the test after the JSX then escapes its suite. Measured 2026-09-15 on four real
 * `.tsx` test files (`docs/research/net-new-skeleton-red-measurement-2026-09-15.md` §7). The fixture
 * is the smallest shape found that makes a contract read wrongly: the suite names the contract, the
 * test before the JSX asserts nothing, and the only assertion comes after it. Parsed as TypeScript,
 * that suite holds no assertion (so its contract reads uncovered) and the escaped test names no
 * contract (so its behaviour reads contractless).
 */

const SUITE = "dock-seeds-a-tab: a seed opens a fresh tab";
const AFTER_JSX = "never writes the seed to the active session";

const SPEC = `---
id: "dock-tabs"
tier: capability
story: dock
title: "A seed opens a fresh tab"
outcome: "A seed opens a fresh tab and never writes to the active session."
status: proposed
proof_mode: integration-test
depends_on: []
proof:
  command:
    file: pnpm
    args: ["--filter", "@storytree/dock", "test"]
  scope:
    testGlobs: ["packages/dock/src/Dock.test.tsx"]
    sourceGlobs: ["packages/dock/src/Dock.tsx"]
  real:
    testFile: "packages/dock/src/Dock.test.tsx"
    sourceFile: "packages/dock/src/Dock.tsx"
    scope:
      testGlobs: ["packages/dock/src/Dock.test.tsx"]
      sourceGlobs: ["packages/dock/src/Dock.tsx"]
---

# A seed opens a fresh tab

## Contracts

1. **\`dock-seeds-a-tab\`** — a seed opens a fresh tab
`;

const TSX_TEST = `describe("${SUITE}", () => {
  it("renders the seeded dock", () => {
    render(<Dock seed={{ command: "ls", token: 1 }} />);
  });
  it("${AFTER_JSX}", () => {
    expect(bridge.write).not.toHaveBeenCalled();
  });
});
`;

/** A throwaway repo root holding the one capability spec and its `.tsx` test file. */
function withTsxCapability(check: (root: string, storiesDir: string) => void): void {
  const root = mkdtempSync(path.join(tmpdir(), "storytree-coverage-tsx-"));
  try {
    const storiesDir = path.join(root, "stories");
    mkdirSync(path.join(storiesDir, "dock"), { recursive: true });
    writeFileSync(path.join(storiesDir, "dock", "dock-tabs.md"), SPEC);
    mkdirSync(path.join(root, "packages", "dock", "src"), { recursive: true });
    writeFileSync(path.join(root, "packages", "dock", "src", "Dock.test.tsx"), TSX_TEST);
    check(root, storiesDir);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test("storytree coverage's loader reads a `.tsx` test file as TSX, so a suite asserted after JSX vouches for its contract", () => {
  withTsxCapability((root, storiesDir) => {
    const unit = loadCoverageUnit(storiesDir, root, "dock-tabs");
    assert.ok(unit !== null, "the fixture capability loads");
    assert.deepEqual(unit.contractIds, ["dock-seeds-a-tab"]);
    assert.ok(unit.testNames.includes(SUITE), `the suite vouches; read ${JSON.stringify(unit.testNames)}`);
  });
});

test("the --contractless loader reads a `.tsx` test file as TSX, so the test after JSX keeps the suite that names its contract", () => {
  withTsxCapability((root, storiesDir) => {
    const unit = loadBehaviourClaimUnits(storiesDir, root).find((u) => u.unitId === "dock-tabs");
    assert.ok(unit !== undefined, "the fixture capability is swept");
    assert.deepEqual(
      unit.files.map((f) => f.file),
      ["packages/dock/src/Dock.test.tsx"],
    );
    const after = unit.files[0]?.observed.find((t) => t.name === AFTER_JSX);
    assert.deepEqual(after?.ancestors, [SUITE]);
  });
});

test("the coverage sweep reads a `.tsx` test file as TSX, so the contract's suite is among the vouching names", () => {
  withTsxCapability((root, storiesDir) => {
    const unit = sweepRealBuildCoverage(storiesDir, root).units.find((u) => u.unitId === "dock-tabs");
    assert.ok(unit !== undefined, "the fixture capability is swept");
    assert.ok(unit.testNames.includes(SUITE), `the suite vouches; read ${JSON.stringify(unit.testNames)}`);
  });
});
