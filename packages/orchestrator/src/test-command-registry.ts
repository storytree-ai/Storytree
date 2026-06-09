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
};

/** Look up a node's build config; a miss returns null (the caller turns it into guidance). */
export function lookupNodeBuildConfig(unitId: string): NodeBuildConfig | null {
  return NODE_BUILD_REGISTRY[unitId] ?? null;
}

/** The registered (buildable) node ids, for "did you mean" guidance. */
export function registeredNodeIds(): string[] {
  return Object.keys(NODE_BUILD_REGISTRY).sort();
}
