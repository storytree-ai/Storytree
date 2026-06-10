import type { ShellCommand } from "./shell-test-executor.js";
import type { PathWriteScopeConfig } from "./phase-machine.js";

/**
 * The EXPLICIT node→build-config registry (drive-machinery Phase B, plan §3): for each buildable
 * node id, the REAL shell command that proves it and the per-phase write-scope globs the gate
 * walls writes with. Explicit by design — a small map keyed by node id, not magic discovery; a
 * node is buildable only once someone deliberately registers how to prove it.
 *
 * Seeded with the stories/library tree (the first authored story with real test evidence). The
 * commands are the LIVE proof commands (what `--live` would run); the dry-run path swaps in a
 * synthetic temp-workspace executor and only uses the registry as the buildable-node gate.
 *
 * Commands are file+argv (execFile, never a shell). `pnpm` on Windows is `pnpm.cmd`-shimmed, so
 * live spawning may need a platform shim — acceptable while only dry-run exists.
 */
export interface NodeBuildConfig {
  /** The proof command `ShellTestExecutor` would spawn for this node in a live build. */
  command: ShellCommand;
  /** Per-phase write walls: tests writable only in AUTHOR_TEST, source only in IMPLEMENT. */
  scope: PathWriteScopeConfig;
  /** REAL-mode proof config (Phase F). Absent = the node is dry-run/live-smoke buildable only. */
  real?: RealProofConfig;
}

/**
 * What `--real` (drive-machinery Phase F) needs to drive a node's ACTUAL proof in a fresh git
 * worktree of this repo: the real test file the spine runs (`node --import tsx --test <testFile>`
 * at the worktree root) and the per-phase write walls over REAL repo-relative paths.
 *
 * Iteration-one constraint (deliberate, documented): the worktree gets NO `pnpm install`, so the
 * authored test/impl may import ONLY `node:` builtins and relative files (type-only imports are
 *  erased and fine) — which is why the first real targets are NET-NEW, dependency-free leaf
 * behaviours (plan §5: a genuine red→green, not a synthetic red over brownfield code).
 */
export interface RealProofConfig {
  /** Repo-relative TS test file the REAL proof runs. AUTHOR_TEST may write exactly this. */
  testFile: string;
  /** Repo-relative implementation file named in the leaf brief. IMPLEMENT may write per scope. */
  sourceFile: string;
  /** Per-phase write walls over REAL repo-relative paths. */
  scope: PathWriteScopeConfig;
}

const pnpmTest = (pkg: string): ShellCommand => ({
  file: "pnpm",
  args: ["--filter", pkg, "test"],
});

const pkgScope = (pkg: string): PathWriteScopeConfig => ({
  testGlobs: [`packages/${pkg}/src/**/*.test.ts`],
  sourceGlobs: [`packages/${pkg}/src/**/*.ts`],
});

/** node id → how to prove it. Start: the `library` story + its seven capabilities. */
export const NODE_BUILD_REGISTRY: Readonly<Record<string, NodeBuildConfig>> = {
  // The story itself: the whole organism's suite.
  library: {
    command: { file: "pnpm", args: ["-r", "test"] },
    scope: {
      testGlobs: ["packages/*/src/**/*.test.ts"],
      sourceGlobs: ["packages/*/src/**/*.ts"],
    },
  },
  // Capabilities, each proven by its host package's suite (stories/library/story.md table).
  "library-schema-and-write-validation": { command: pnpmTest("@storytree/core"), scope: pkgScope("core") },
  "migrate-on-write-upcaster": { command: pnpmTest("@storytree/core"), scope: pkgScope("core") },
  "event-sourced-store-seam": { command: pnpmTest("@storytree/store"), scope: pkgScope("store") },
  "eager-batch-migrate": { command: pnpmTest("@storytree/store"), scope: pkgScope("store") },
  "seed-corpus-scripts": { command: pnpmTest("@storytree/store"), scope: pkgScope("store") },
  "library-health-gate": { command: pnpmTest("@storytree/cli"), scope: pkgScope("cli") },
  "library-cli": { command: pnpmTest("@storytree/cli"), scope: pkgScope("cli") },
  // The first REAL-buildable node (Phase F): a NET-NEW, dependency-free core behaviour, so the
  // red is genuine (the test imports an implementation that does not exist at HEAD).
  "verdict-line": {
    command: pnpmTest("@storytree/core"),
    scope: pkgScope("core"),
    real: {
      testFile: "packages/core/src/verdict-line.test.ts",
      sourceFile: "packages/core/src/verdict-line.ts",
      scope: {
        testGlobs: ["packages/core/src/verdict-line.test.ts"],
        sourceGlobs: ["packages/core/src/verdict-line.ts"],
      },
    },
  },
};

/** Look up a node's build config; a miss returns null (the caller turns it into guidance). */
export function lookupNodeBuildConfig(unitId: string): NodeBuildConfig | null {
  return NODE_BUILD_REGISTRY[unitId] ?? null;
}

/** The registered (buildable) node ids, for "did you mean" guidance. */
export function registeredNodeIds(): string[] {
  return Object.keys(NODE_BUILD_REGISTRY).sort();
}

/** The ids that are REAL-buildable (carry a {@link RealProofConfig}), for `--real` guidance. */
export function realBuildableNodeIds(): string[] {
  return Object.entries(NODE_BUILD_REGISTRY)
    .filter(([, c]) => c.real !== undefined)
    .map(([id]) => id)
    .sort();
}
