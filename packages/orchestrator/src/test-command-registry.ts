import type { ShellCommand } from "./shell-test-executor.js";
import type { PathWriteScopeConfig } from "./phase-machine.js";
import type { NodeBuildConfig, RealProofConfig } from "./proof-config.js";

/**
 * The node→build-config registry. Once the SOURCE OF TRUTH for "how to prove a node", it is now a
 * VALIDATION/FALLBACK layer (ADR-0057): a node's proof config lives primarily in its own spec's
 * `proof:` block ({@link import("./proof-config.js").parseNodeBuildConfig}), and the resolver
 * consults the registry only when a spec declares none. The 5 entries with a `real:` arm are kept
 * here during the time-boxed transition as a LIVE PARITY ORACLE — a test asserts each spec-borne
 * config deep-equals its registry twin (no drift) — and to keep the un-migrated `library`-tier
 * entries (the fallback path) buildable.
 *
 * The {@link NodeBuildConfig}/{@link RealProofConfig} shape lives in `proof-config.ts` now; it is
 * re-exported here so existing path-importers and the package index keep working unchanged.
 *
 * Commands are file+argv (execFile, never a shell). `pnpm` on Windows is `pnpm.cmd`-shimmed, so
 * live spawning may need a platform shim.
 */
export type { NodeBuildConfig, RealProofConfig } from "./proof-config.js";

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
  "library-schema-and-write-validation": { command: pnpmTest("@storytree/library"), scope: pkgScope("library") },
  "migrate-on-write-upcaster": { command: pnpmTest("@storytree/library"), scope: pkgScope("library") },
  // ADR-0077: the store substrate + central drawers (corpus store / batch migrate / seed scripts)
  // dissolved into @storytree/library/store, so these capabilities are now proven by library's suite.
  "event-sourced-store-seam": { command: pnpmTest("@storytree/library"), scope: pkgScope("library") },
  "eager-batch-migrate": { command: pnpmTest("@storytree/library"), scope: pkgScope("library") },
  "seed-corpus-scripts": { command: pnpmTest("@storytree/library"), scope: pkgScope("library") },
  "library-health-gate": { command: pnpmTest("@storytree/cli"), scope: pkgScope("cli") },
  "library-cli": { command: pnpmTest("@storytree/cli"), scope: pkgScope("cli") },
  // The first REAL-buildable node (Phase F): a NET-NEW, dependency-free behaviour, so the red is
  // genuine (the test imports an implementation that does not exist at HEAD). MOVED from
  // @storytree/core to @storytree/orchestrator's proof/ subdir (ADR-0068 step 1): verdictLine is the
  // farmer's render COMPUTE, so it lives with the gate that signs the verdict it renders.
  "verdict-line": {
    command: pnpmTest("@storytree/orchestrator"),
    scope: pkgScope("orchestrator"),
    real: {
      testFile: "packages/orchestrator/src/proof/verdict-line.test.ts",
      sourceFile: "packages/orchestrator/src/proof/verdict-line.ts",
      scope: {
        testGlobs: ["packages/orchestrator/src/proof/verdict-line.test.ts"],
        sourceGlobs: ["packages/orchestrator/src/proof/verdict-line.ts"],
      },
    },
  },
  // (The notice-board presence nodes — declare-presence + presence-store — were RETIRED by ADR-0200
  // with the self-reported presence layer: their `real:` arms were dropped spec-side and their
  // registry entries removed, so they are no longer REAL-buildable. The claim ledger is the
  // notice board's coordination record now.)
  // The notice-board CLI node (ADR-0033): the `storytree noticeboard` command module — a
  // self-contained handler file (the spine wires commands.ts dispatch AFTER promotion; the leaf's
  // walls deliberately exclude it). `install: true`: imports @storytree/notice-board + ./envelope.js.
  "noticeboard-cli": {
    command: pnpmTest("@storytree/drive"),
    scope: pkgScope("drive"),
    real: {
      testFile: "packages/drive/src/noticeboard.test.ts",
      sourceFile: "packages/drive/src/noticeboard.ts",
      scope: {
        testGlobs: ["packages/drive/src/noticeboard.test.ts"],
        sourceGlobs: ["packages/drive/src/noticeboard.ts"],
      },
      install: true,
      typecheck: pnpmTypecheck("@storytree/drive"),
    },
  },
  // The notice-board orientation surface (ADR-0033): `storytree tree` — offline hierarchy with
  // the presence block woven in when live. Self-contained module; dispatch wired spine-side
  // after promotion. `install: true`: imports @storytree/notice-board + @storytree/orchestrator.
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
  // fail-silent session-hook handler, statusline glance/heartbeat, and the never-blocking-hooks
  // config audit (the build presence wrapper was retired by ADR-0199 — builds never write session
  // presence). Pure module legs only; the spine wires `.claude/settings.json` hooks and the
  // statusline AFTER promotion. `install: true`: imports @storytree/notice-board + ./noticeboard.js seams.
  "ambient-integration": {
    command: pnpmTest("@storytree/drive"),
    scope: pkgScope("drive"),
    real: {
      testFile: "packages/drive/src/ambient-presence.test.ts",
      sourceFile: "packages/drive/src/ambient-presence.ts",
      scope: {
        testGlobs: ["packages/drive/src/ambient-presence.test.ts"],
        sourceGlobs: ["packages/drive/src/ambient-presence.ts"],
      },
      install: true,
      typecheck: pnpmTypecheck("@storytree/drive"),
    },
  },
  // The notice-board verdict-glyph follow-up (ADR-0033 owner decision 4): the pure glyph module —
  // ✓/✗/– per unit id from signed verdicts, plus the offline-silent reader wrapper. NET-NEW file
  // pair ON PURPOSE: tree.ts/tree.test.ts are tree-view's registered REAL surface above, so this
  // capability's proof lives in its own files and the spine wires tree.ts to call them after
  // promotion. `install: true`: imports @storytree/proof-protocol (Verdict, SIGNING_EVENT_KIND).
  "verdict-glyphs": {
    command: pnpmTest("@storytree/cli"),
    scope: pkgScope("cli"),
    real: {
      testFile: "packages/cli/src/tree-verdicts.test.ts",
      sourceFile: "packages/cli/src/tree-verdicts.ts",
      scope: {
        testGlobs: ["packages/cli/src/tree-verdicts.test.ts"],
        sourceGlobs: ["packages/cli/src/tree-verdicts.ts"],
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
