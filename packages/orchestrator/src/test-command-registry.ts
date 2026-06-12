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
 * Dependencies (ADR-0031 §2): without `install`, the worktree gets NO `pnpm install`, so the
 * authored test/impl may import ONLY `node:` builtins and relative files (type-only imports are
 * erased and fine) — the right shape for NET-NEW, dependency-free leaves. With `install: true`,
 * the worktree gets a LOCKFILE-ONLY `pnpm install` first (shared-store cheap), the authored files
 * may import workspace dependencies, and promotion additionally requires the node's package suite
 * (the registry `command`) AND the package typecheck (`typecheck`) green in the worktree — a green
 * leaf must not break its package, and the proof run is tsx-driven (types STRIPPED), so only a
 * real `tsc --noEmit` can see type-illegal-but-runtime-green code. The leaf can never ADD a
 * dependency either way: `package.json`/`pnpm-lock.yaml` sit outside every write scope
 * (deny-by-default).
 */
export interface RealProofConfig {
  /** Repo-relative TS test file the REAL proof runs. AUTHOR_TEST may write exactly this. */
  testFile: string;
  /** Repo-relative implementation file named in the leaf brief. IMPLEMENT may write per scope. */
  sourceFile: string;
  /** Per-phase write walls over REAL repo-relative paths. */
  scope: PathWriteScopeConfig;
  /** Lockfile-only `pnpm install` in the worktree first (dependency-bearing targets, ADR-0031). */
  install?: boolean;
  /**
   * The package typecheck command (`tsc --noEmit` via the package's `typecheck` script), run in the
   * installed worktree alongside the regression suite before a promotion may push. REQUIRED when
   * `install` is true (the CLI refuses an install-bearing entry without it): the proof command runs
   * under tsx, which strips types, so a leaf can author runtime-green code that violates the repo's
   * strict flags (it happened — exactOptionalPropertyTypes, declare-presence, 2026-06-11) and only
   * a worktree `tsc` catches it before the PR-time CI does. Needs node_modules, hence install-only.
   */
  typecheck?: ShellCommand;
}

const pnpmTest = (pkg: string): ShellCommand => ({
  file: "pnpm",
  args: ["--filter", pkg, "test"],
});

const pnpmTypecheck = (pkg: string): ShellCommand => ({
  file: "pnpm",
  args: ["--filter", pkg, "typecheck"],
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
  // The notice-board story's first node (ADR-0033): the core presence module — zod schema +
  // pure staleness/merge logic. `install: true` (ADR-0031 §2): the impl imports zod, so the
  // worktree gets a lockfile-only install and promotion requires the core suite green.
  "declare-presence": {
    command: pnpmTest("@storytree/core"),
    scope: pkgScope("core"),
    real: {
      testFile: "packages/core/src/presence.test.ts",
      sourceFile: "packages/core/src/presence.ts",
      scope: {
        testGlobs: ["packages/core/src/presence.test.ts"],
        sourceGlobs: ["packages/core/src/presence.ts"],
      },
      install: true,
      typecheck: pnpmTypecheck("@storytree/core"),
    },
  },
  // The notice-board store node (ADR-0033): the pg presence store — event+projection mirroring
  // PgCommentStore, proven OFFLINE against a fake transactional client (the live SQL leg is
  // live-gated/human-verified, never attested by a worktree PASS). `install: true`: the impl
  // imports @storytree/core (presence merge/validation).
  "presence-store": {
    command: pnpmTest("@storytree/store"),
    scope: pkgScope("store"),
    real: {
      testFile: "packages/store/src/presence-store.test.ts",
      sourceFile: "packages/store/src/presence-store.ts",
      scope: {
        testGlobs: ["packages/store/src/presence-store.test.ts"],
        sourceGlobs: ["packages/store/src/presence-store.ts"],
      },
      install: true,
      typecheck: pnpmTypecheck("@storytree/store"),
    },
  },
  // The notice-board CLI node (ADR-0033): the `storytree noticeboard` command module — a
  // self-contained handler file (the spine wires commands.ts dispatch AFTER promotion; the leaf's
  // walls deliberately exclude it). `install: true`: imports @storytree/core + ./envelope.js.
  "noticeboard-cli": {
    command: pnpmTest("@storytree/cli"),
    scope: pkgScope("cli"),
    real: {
      testFile: "packages/cli/src/noticeboard.test.ts",
      sourceFile: "packages/cli/src/noticeboard.ts",
      scope: {
        testGlobs: ["packages/cli/src/noticeboard.test.ts"],
        sourceGlobs: ["packages/cli/src/noticeboard.ts"],
      },
      install: true,
      typecheck: pnpmTypecheck("@storytree/cli"),
    },
  },
  // The notice-board orientation surface (ADR-0033): `storytree tree` — offline hierarchy with
  // the presence block woven in when live. Self-contained module; dispatch wired spine-side
  // after promotion. `install: true`: imports @storytree/core + @storytree/orchestrator.
  "tree-view": {
    command: pnpmTest("@storytree/cli"),
    scope: pkgScope("cli"),
    real: {
      testFile: "packages/cli/src/tree.test.ts",
      sourceFile: "packages/cli/src/tree.ts",
      scope: {
        testGlobs: ["packages/cli/src/tree.test.ts"],
        sourceGlobs: ["packages/cli/src/tree.ts"],
      },
      install: true,
      typecheck: pnpmTypecheck("@storytree/cli"),
    },
  },
  // The notice-board automation rung (ADR-0033 Decision 3): the ambient-presence module — the
  // withPresence build wrapper, fail-silent session-hook handler, statusline glance/heartbeat,
  // and the never-blocking-hooks config audit. Pure module legs only; the spine wires node-build,
  // `.claude/settings.json` hooks, and the statusline AFTER promotion. `install: true`: imports
  // @storytree/core + ./noticeboard.js seams.
  "ambient-integration": {
    command: pnpmTest("@storytree/cli"),
    scope: pkgScope("cli"),
    real: {
      testFile: "packages/cli/src/ambient-presence.test.ts",
      sourceFile: "packages/cli/src/ambient-presence.ts",
      scope: {
        testGlobs: ["packages/cli/src/ambient-presence.test.ts"],
        sourceGlobs: ["packages/cli/src/ambient-presence.ts"],
      },
      install: true,
      typecheck: pnpmTypecheck("@storytree/cli"),
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
