import { resolveBuildConfig, mapProofMode, realProofCommand } from "@storytree/orchestrator";
import type { NodeSpec } from "@storytree/orchestrator";

/** The REAL (`--real`) arm of a node's resolution, when it carries one. */
export interface ResolveRealReport {
  /** Repo-relative test file the REAL proof authors + runs. */
  testFile: string;
  /** Repo-relative implementation file the REAL build authors. */
  sourceFile: string;
  /** Lockfile-only worktree install (ADR-0031 §2). */
  install: boolean;
  /** Whether the node edits existing source (vs net-new). */
  editsExisting: boolean;
  /** DB-backed proof (ADR-0064): the worktree proof gets an isolated test-DB connection. */
  db: boolean;
  /** Spine-driven dependency adds (ADR-0064 §2): NEW deps the spine `pnpm add`s before authoring. */
  addDeps: string[];
  /** The declared typecheck command shown as one string, or null when none is declared. */
  typecheck: string | null;
  /** The DECLARED proof command shown as one string, or null when the default node:test is used. */
  proofCommand: string | null;
  /** The RESOLVED real proof command display — reuse `realProofCommand(real, ...).display`. */
  proofDisplay: string;
}

/** How a node spec resolves for a build — the read-only report behind `storytree node resolve`. */
export interface ResolveReport {
  /** The node id (echoed from the spec). */
  id: string;
  /** The node's tier (contract | capability | story | ...). */
  tier: string;
  /** The spec's frontmatter proof-mode word, e.g. "contract-test". */
  proofModeWord: string;
  /** The mapped core ProofMode, e.g. "contract" (via `mapProofMode`). */
  proofMode: string;
  /** True iff the node has ANY proof config (spec-borne OR registry) — i.e. buildable at all. */
  buildable: boolean;
  /** Provenance: "spec" (a spec-borne proof: block), "registry" (fallback), or null (not buildable). */
  source: "spec" | "registry" | null;
  /** The resolved proof command (file + args + a joined display string), or null when not buildable. */
  command: { file: string; args: string[]; display: string } | null;
  /** The per-phase write scope, or null when not buildable. */
  scope: { testGlobs: string[]; sourceGlobs: string[] } | null;
  /** The REAL arm, or null when the node has no `real:` arm. */
  real: ResolveRealReport | null;
  /** True iff the node is REAL-buildable (its config carries a `real:` arm). */
  realBuildable: boolean;
}

/**
 * Resolve a node spec into a structured resolution report — provenance (spec-borne vs registry vs
 * not-buildable), the proof command, the per-phase write scope, and the REAL arm — so an operator
 * can see how a node would build without building or spending anything.
 *
 * Pure function: no I/O, no spawning, no filesystem. Delegates resolution to `resolveBuildConfig`
 * and only renders the result into a structured report.
 */
export function resolveReport(spec: NodeSpec): ResolveReport {
  const id = spec.id;
  const tier = spec.tier;
  const proofModeWord = spec.proofMode;
  const proofMode = mapProofMode(spec.proofMode);

  const resolved = resolveBuildConfig(spec);

  if (resolved === null) {
    return {
      id,
      tier,
      proofModeWord,
      proofMode,
      buildable: false,
      source: null,
      command: null,
      scope: null,
      real: null,
      realBuildable: false,
    };
  }

  const c = resolved.config;

  const command = {
    file: c.command.file,
    args: [...c.command.args],
    display: `${c.command.file} ${c.command.args.join(" ")}`,
  };

  const scope = {
    testGlobs: [...c.scope.testGlobs],
    sourceGlobs: [...c.scope.sourceGlobs],
  };

  const realConfig = c.real;

  if (realConfig === undefined) {
    return {
      id,
      tier,
      proofModeWord,
      proofMode,
      buildable: true,
      source: resolved.source,
      command,
      scope,
      real: null,
      realBuildable: false,
    };
  }

  const typecheck =
    realConfig.typecheck !== undefined
      ? `${realConfig.typecheck.file} ${realConfig.typecheck.args.join(" ")}`
      : null;

  const proofCommandStr =
    realConfig.proofCommand !== undefined
      ? `${realConfig.proofCommand.file} ${realConfig.proofCommand.args.join(" ")}`
      : null;

  const proofDisplay = realProofCommand(realConfig, "").display;

  const real: ResolveRealReport = {
    testFile: realConfig.testFile,
    sourceFile: realConfig.sourceFile,
    install: realConfig.install === true,
    editsExisting: realConfig.editsExisting === true,
    db: realConfig.db === true,
    addDeps: realConfig.addDeps !== undefined ? [...realConfig.addDeps] : [],
    typecheck,
    proofCommand: proofCommandStr,
    proofDisplay,
  };

  return {
    id,
    tier,
    proofModeWord,
    proofMode,
    buildable: true,
    source: resolved.source,
    command,
    scope,
    real,
    realBuildable: true,
  };
}
