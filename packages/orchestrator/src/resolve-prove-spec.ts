import * as path from "node:path";

import {
  ClaudeAgentAuthor,
  FileToolExecutor,
  FILE_WRITE_TOOLS,
  ScriptedModel,
} from "@storytree/agent";
import type { FeedbackCommand, ModelResponse, PhaseAuthor } from "@storytree/agent";
import type { Store } from "@storytree/base";

import { resolveSigner } from "./proof/signer.js";
import type { SignerInputs } from "./proof/signer.js";
import { PathWriteScope } from "./phase-machine.js";
import { OwnedLoopAuthor } from "./owned-loop-author.js";
import { ShellTestExecutor, runShellCommand } from "./shell-test-executor.js";
import type { ShellCommand } from "./shell-test-executor.js";
import { gitTreeState } from "./prove-it-gate.js";
import type { PhasePrompts, ProveSpec, TreeState } from "./prove-it-gate.js";
import type { NodeSpec } from "./node-spec.js";
import { mapProofMode } from "./node-spec.js";
import {
  lookupNodeBuildConfig,
  realBuildableNodeIds,
  registeredNodeIds,
} from "./test-command-registry.js";
import type { NodeBuildConfig, RealProofConfig } from "./proof-config.js";
import { commitAuthored, platformShellCommand } from "./build-worktree.js";

/**
 * The resolver (drive-machinery Phase B, plan §2): turn a loaded {@link NodeSpec} into the full
 * {@link ProveSpec} the prove-it-gate drives. The gate itself stays untouched — this is the
 * injection layer the plan identified as "the whole gap".
 *
 * Two modes:
 *  - **dry-run** (offline, zero cost): the REAL fields come off the node spec (unitId, proof mode,
 *    prompts, signer, runId — and the registry gates which nodes are buildable), while the
 *    EXECUTION seams are synthetic (a scripted phase-aware model behind {@link OwnedLoopAuthor},
 *    a temp workspace, a Node test runner over a planted red→green pair, an injected clean
 *    TreeState). A dry-run proves the GLUE, not the node's actual proofs.
 *  - **live-smoke** (ADR-0030, the plan's Phase D): the SAME temp-workspace walk, but the leaf is
 *    REAL — a {@link ClaudeAgentAuthor} (Claude Agent SDK, subscription-funded) genuinely authors
 *    the test and the impl under hook-enforced write scope, and the spine observes the genuine
 *    red→green its writes cause. Still synthetic in WHAT is built (the add(2,3) task in a temp
 *    dir) — it proves the live loop through the gate, not the node's real proof command (Phase F).
 *  - **real** (the plan's Phase F): nothing synthetic in the walk. The workspace is a FRESH GIT
 *    WORKTREE of this repo, the leaf authors the node's REAL test/impl at their real repo paths
 *    (registry {@link RealProofConfig}), the spine runs the registry's REAL proof command for
 *    red/green, COMMITS the authored files itself after the observed green, and the GATE reads
 *    genuine `git status` off the worktree — cleanliness is earned by that commit, never injected.
 */

/** Workspace-relative paths the dry-run's scripted model writes (mirrors prove-it-gate.e2e.test.ts). */
export const DRY_RUN_TEST_REL = "unit.test.cjs";
export const DRY_RUN_IMPL_REL = "impl.cjs";

/** The synthetic test: red while ./impl.cjs is absent, green once it exports add(2,3) === 5. */
const DRY_RUN_TEST_SOURCE = `const assert = require("node:assert/strict");
const { add } = require("./impl.cjs");
assert.equal(add(2, 3), 5, "add(2,3) must equal 5");
console.log("ok - add works");
`;

/** The impl the scripted model writes in IMPLEMENT — the green-maker. */
const DRY_RUN_IMPL_SOURCE = `module.exports = { add: (a, b) => a + b };
`;

/**
 * A scripted writer model: each authoring step issues ONE real `write_file` tool_use (the next
 * entry in `writes`) and then ends the turn. The writes are REAL (they land via the
 * FileToolExecutor and the spine really observes the exit-code red→green they cause) — only the
 * authorship is scripted. Used by the dry-run, and by offline tests of the REAL-mode wiring.
 */
export function scriptedWriterModel(
  writes: ReadonlyArray<{ path: string; content: string }>,
): ScriptedModel {
  let writeTurnPending = true;
  let step = 0;
  return new ScriptedModel((): ModelResponse => {
    if (writeTurnPending) {
      writeTurnPending = false;
      const write = writes[step];
      if (write === undefined) {
        throw new Error(`scriptedWriterModel exhausted: no scripted write for step ${step}`);
      }
      return {
        stopReason: "tool_use",
        content: [
          {
            type: "tool_use",
            id: `scripted-w${step}`,
            name: "write_file",
            input: { path: write.path, content: write.content },
          },
        ],
      };
    }
    writeTurnPending = true;
    step += 1;
    return {
      stopReason: "end_turn",
      content: [{ type: "text", text: "authoring step complete" }],
    };
  });
}

/** The dry-run model: the scripted writer over the synthetic add(2,3) pair. */
export function dryRunModel(): ScriptedModel {
  return scriptedWriterModel([
    { path: DRY_RUN_TEST_REL, content: DRY_RUN_TEST_SOURCE },
    { path: DRY_RUN_IMPL_REL, content: DRY_RUN_IMPL_SOURCE },
  ]);
}

/**
 * Assemble the per-phase leaf briefs from the node's REAL spec — its outcome plus its `## Guidance`
 * prose. These are the prompts a live model would receive; the dry-run's scripted model ignores
 * them, but resolving them off the real spec is part of what the dry-run proves.
 */
export function assemblePrompts(spec: NodeSpec): PhasePrompts {
  const guidance =
    spec.guidance !== undefined ? `\n\nGuidance from the node spec:\n${spec.guidance}` : "";
  const header = `Unit "${spec.id}" (${spec.tier}): ${spec.title}.\nOutcome: ${spec.outcome}`;
  return {
    authorTest: `${header}\n\nPhase AUTHOR_TEST — author the FAILING test that proves the outcome. Write test paths only; the spine will observe the red itself.${guidance}`,
    implement: `${header}\n\nPhase IMPLEMENT — implement against the authored test. Write source paths only (never the test); the spine will observe the green itself.${guidance}`,
  };
}

/** The seams the CLI owns in every mode (workspace, store, ids, signer, clock). */
interface BaseResolveOptions {
  /** The fresh temp workspace the synthetic red→green happens in. */
  workspace: string;
  /** The event store the signed verdict lands in (an InMemoryStore — never the live library DB). */
  store: Store;
  runId: string;
  signerInputs: SignerInputs;
  /** Injected for determinism in tests; defaults to the wall clock. */
  now?: () => string;
  /** Injected tree seam; defaults to a SYNTHETIC clean tree (a smoke must not require a clean real tree). */
  treeState?: () => Promise<TreeState>;
}

/**
 * The rendered per-phase leaf system prompts (ADR-0051 §4): the `red-builder` agent drives
 * AUTHOR_TEST, the `green-builder` agent drives IMPLEMENT. The CLI assembles these from the Library
 * offline and threads them down so the LIVE SDK leaf's system prompt IS the library agent — never a
 * hard-coded generic. The owned-loop (dry-run) leaf ignores them; an SDK leaf with no injected
 * prompt fails closed (the anti-blindside guarantee, see {@link ClaudeAgentAuthor}).
 */
export interface LeafPhasePrompts {
  AUTHOR_TEST: string;
  IMPLEMENT: string;
}

/** Dry-run: the scripted owned loop (offline, zero cost). */
export interface DryRunResolveOptions extends BaseResolveOptions {
  mode: "dry-run";
}

/** Live-smoke (ADR-0030 / plan Phase D): a real Claude Agent SDK leaf, subscription-funded. */
export interface LiveSmokeResolveOptions extends BaseResolveOptions {
  mode: "live-smoke";
  /** Model for the SDK leaf. Default: claude-sonnet-4-6. */
  model?: string;
  /** Per-authoring-slice budget ceiling in USD (SDK-enforced). Default: 1. */
  maxBudgetUsd?: number;
  /** Per-authoring-slice turn ceiling (SDK-enforced). Default: 16. */
  maxTurns?: number;
  /** The rendered red-builder/green-builder system prompts the live SDK leaf runs on (ADR-0051 §4). */
  phasePrompts?: LeafPhasePrompts;
}

/**
 * Real (plan Phase F): the node's REAL proof in a fresh git worktree. `workspace` MUST be the
 * worktree root (see `createBuildWorktree`); unless `treeState` is injected (tests only), the
 * GATE's tree seam first COMMITS the leaf's authored files spine-side, then reads genuine
 * `git status` — a dirty tree past that commit fails closed, never gets papered over.
 */
export interface RealResolveOptions extends BaseResolveOptions {
  mode: "real";
  /** Model for the SDK leaf. Default: claude-sonnet-4-6. */
  model?: string;
  /** Per-authoring-slice budget ceiling in USD (SDK-enforced). Default: 1. */
  maxBudgetUsd?: number;
  /** Per-authoring-slice turn ceiling (SDK-enforced). Default: 16. */
  maxTurns?: number;
  /** The rendered red-builder/green-builder system prompts the live SDK leaf runs on (ADR-0051 §4). */
  phasePrompts?: LeafPhasePrompts;
  /**
   * Injected leaf for OFFLINE wiring tests (a scripted {@link OwnedLoopAuthor}); defaults to the
   * live {@link ClaudeAgentAuthor}. The executor seam (ADR-0030 §2), used as the test seam here.
   */
  authorOverride?: PhaseAuthor;
  /**
   * DB-backed proof env (ADR-0064): the spine-supplied env the worktree proof spawns with when the
   * node declares `real.db: true` — at minimum a `STORYTREE_DB_NAME` pointing at a DISPOSABLE test
   * database (the CLI computes it and asserts non-prod via `@storytree/store`'s `assertTestDatabase`,
   * plus `STORYTREE_DB_USER` for keyless IAM). The resolver FORCES it onto the proof command (so both
   * the spine's CONFIRM observation and the leaf's `run_proof` hit the test DB) and REFUSES a
   * `db:true` node whose env is missing or names production — an independent SECOND honesty wall (the
   * store's `createTestPool` guard is the first). Ignored when the node does not declare `db`.
   */
  dbProofEnv?: Record<string, string>;
}

export type ResolveOptions =
  | DryRunResolveOptions
  | LiveSmokeResolveOptions
  | RealResolveOptions;

/**
 * Resolution outcome: the full ProveSpec (plus, in live mode, the live author for cost/violation
 * reporting), or a fail-closed refusal with the buildable ids.
 */
export type ResolveResult =
  | { ok: true; spec: ProveSpec; liveAuthor?: ClaudeAgentAuthor }
  | { ok: false; reason: string; registered: string[] };

/**
 * Resolve a node's build config (ADR-0057 keystone): SPEC-BORNE first (the node's own `proof:`
 * block), the test-command registry as FALLBACK, fail-closed (`null`) when neither exists.
 * Spec-wins-on-conflict by construction — the registry is consulted only when the spec declares no
 * block. `source` is honest provenance for CLI/error output, never a behavioural switch. This is the
 * one joint the keystone moves: the SOURCE of the config, not its enforcement (the spine still
 * constructs the scope + command from whatever this returns).
 */
export function resolveBuildConfig(
  spec: NodeSpec,
): { config: NodeBuildConfig; source: "spec" | "registry" } | null {
  if (spec.buildConfig !== undefined) return { config: spec.buildConfig, source: "spec" };
  const registry = lookupNodeBuildConfig(spec.id);
  if (registry !== null) return { config: registry, source: "registry" };
  return null;
}

/**
 * Fill every {@link ProveSpec} field for one node (plan §2 table). Fail-closed: a node with no
 * proof config — neither a spec-borne `proof:` block nor a registry entry — is not buildable, even
 * dry. Declaring how to prove it (spec block, ADR-0057, or the residual registry) is the deliberate
 * act that makes a node driveable.
 */
export function resolveProveSpec(
  spec: NodeSpec,
  opts: ResolveOptions,
): ResolveResult {
  const resolved = resolveBuildConfig(spec);
  if (resolved === null) {
    return {
      ok: false,
      reason:
        `node "${spec.id}" has no proof config — declare a 'proof:' block in its spec ` +
        `(${spec.file}) or register how to prove it in the test-command registry`,
      registered: registeredNodeIds(),
    };
  }
  const config = resolved.config;

  if (opts.mode === "real") {
    return resolveReal(spec, config, opts);
  }

  // Shared SYNTHETIC execution seams (dry-run / live-smoke): a real Node test runner over the
  // workspace's planted/authored pair, and the per-phase write walls. The registry's real
  // command/scope are NOT spawned in these modes — that is what `mode: "real"` is for.
  const syntheticProofCmd: ShellCommand = {
    file: process.execPath,
    args: [path.join(opts.workspace, DRY_RUN_TEST_REL)],
    cwd: opts.workspace,
  };
  const testExecutor = new ShellTestExecutor({
    command: (): ShellCommand => syntheticProofCmd,
  });
  const scope = new PathWriteScope({
    testGlobs: ["*.test.cjs"],
    sourceGlobs: [DRY_RUN_IMPL_REL],
  });
  const treeState =
    opts.treeState ??
    (async (): Promise<TreeState> => ({ commitSha: `${opts.mode}-synthetic-tree`, clean: true }));

  // The leaf, per mode (the ADR-0030 executor seam): scripted owned loop, or the live SDK author.
  let author: PhaseAuthor;
  let liveAuthor: ClaudeAgentAuthor | undefined;
  let prompts: PhasePrompts;
  if (opts.mode === "dry-run") {
    author = new OwnedLoopAuthor({
      model: dryRunModel(),
      tools: new FileToolExecutor({ rootDir: opts.workspace }),
      scope,
      writeTools: FILE_WRITE_TOOLS,
    });
    prompts = assemblePrompts(spec);
  } else {
    liveAuthor = new ClaudeAgentAuthor({
      cwd: opts.workspace,
      isWriteAllowed: (phase, relPath) => scope.isWriteAllowed(phase, relPath),
      feedbackCommands: feedbackCommandsFor(syntheticProofCmd, `node ${DRY_RUN_TEST_REL}`),
      ...(opts.phasePrompts !== undefined ? { phasePrompts: opts.phasePrompts } : {}),
      ...(opts.model !== undefined ? { model: opts.model } : {}),
      ...(opts.maxBudgetUsd !== undefined ? { maxBudgetUsd: opts.maxBudgetUsd } : {}),
      ...(opts.maxTurns !== undefined ? { maxTurns: opts.maxTurns } : {}),
    });
    author = liveAuthor;
    prompts = liveSmokePrompts(spec);
  }

  const proveSpec: ProveSpec = {
    unitId: spec.id,
    proofMode: mapProofMode(spec.proofMode),
    testId: spec.id,
    author,
    testExecutor,
    store: opts.store,
    signerInputs: opts.signerInputs,
    treeState,
    now: opts.now ?? ((): string => new Date().toISOString()),
    prompts,
    runId: opts.runId,
  };
  return liveAuthor !== undefined
    ? { ok: true, spec: proveSpec, liveAuthor }
    : { ok: true, spec: proveSpec };
}

/**
 * The production database name a db-backed proof must NEVER reach (ADR-0064/0054). Duplicated as a
 * LITERAL rather than imported from `@storytree/store` (`DEFAULT_DATABASE`) to keep the orchestrator
 * store-free; this is the SECOND, independent honesty wall — the store's `assertTestDatabase` is the
 * first. Two unrelated checks must both hold, so a CLI bug alone can never reach prod.
 */
const PROD_DB_NAME = "storytree";

/** The env var naming the disposable test database (mirrors `@storytree/store`'s `TEST_DB_ENV`). */
const DB_NAME_ENV = "STORYTREE_DB_NAME";

/**
 * Resolve REAL mode (plan Phase F). Fail-closed twice over: a registered node without a
 * {@link RealProofConfig} is not real-buildable, and the default tree seam earns cleanliness by a
 * real spine-side commit + a real `git status` (an injected `treeState` is for offline tests only).
 */
function resolveReal(
  spec: NodeSpec,
  config: NodeBuildConfig,
  opts: RealResolveOptions,
): ResolveResult {
  const real = config.real;
  if (real === undefined) {
    return {
      ok: false,
      reason:
        `node "${spec.id}" has no REAL proof config ` +
        `(the real.testFile/sourceFile/scope arm) in its spec \`proof:\` block or registry entry — ` +
        `it is dry-run/live-smoke buildable only`,
      registered: realBuildableNodeIds(),
    };
  }

  // ADR-0064 DB-backed proof, the SECOND honesty wall: a `db:true` node must be handed an isolated
  // test-DB env, and that env must NOT name production (or be blank). Refuse before any worktree work
  // — independent of the store's own `assertTestDatabase` (the first wall), so both must agree.
  if (real.db === true) {
    const dbName = opts.dbProofEnv?.[DB_NAME_ENV]?.trim();
    if (dbName === undefined || dbName === "") {
      return {
        ok: false,
        reason:
          `node "${spec.id}" declares real.db:true but no isolated test-DB env was supplied ` +
          `(${DB_NAME_ENV}). A db-backed proof must connect to a DISPOSABLE test database, never ` +
          `production — the CLI computes this env and asserts it non-prod (ADR-0064/0054).`,
        registered: realBuildableNodeIds(),
      };
    }
    if (dbName === PROD_DB_NAME) {
      return {
        ok: false,
        reason:
          `refusing a db-backed proof for "${spec.id}" against the PRODUCTION database "${dbName}" — ` +
          `set ${DB_NAME_ENV} to a disposable test database (e.g. storytree_test). ADR-0064/0054.`,
        registered: realBuildableNodeIds(),
      };
    }
  }

  // The REAL proof command: the node's DECLARED `real.proofCommand` (ADR-0057 §3, expansion B) or
  // the default `node --import tsx --test <testFile>`. ONE place chooses it, so the spine's CONFIRM
  // observations and the leaf's run_proof can never diverge (the one-oracle property). For a
  // db-backed node (ADR-0064) the spine FORCES the test-DB env onto that one command, so the CONFIRM
  // observation and the leaf's run_proof both hit the disposable DB (one oracle, one environment).
  const base = realProofCommand(real, opts.workspace);
  const proofDisplay = base.display;
  const realProofCmd: ShellCommand =
    real.db === true && opts.dbProofEnv !== undefined
      ? { ...base.command, env: { ...(base.command.env ?? {}), ...opts.dbProofEnv } }
      : base.command;
  const testExecutor = new ShellTestExecutor({
    command: (): ShellCommand => realProofCmd,
  });
  const scope = new PathWriteScope(real.scope);

  // The leaf's bounded feedback tools (option A): run_proof spawns the SAME command object the
  // CONFIRM observations spawn (above); run_typecheck (install-bearing nodes) spawns the package
  // typecheck in the worktree. One oracle, two consumers — the leaf iterates against exactly what
  // will be observed, and the observations themselves stay out-of-band.
  const typecheckCmd =
    real.install === true && real.typecheck !== undefined
      ? platformShellCommand({ ...real.typecheck, cwd: opts.workspace })
      : undefined;
  const feedbackCommands = feedbackCommandsFor(realProofCmd, proofDisplay, typecheckCmd);

  let author: PhaseAuthor;
  let liveAuthor: ClaudeAgentAuthor | undefined;
  if (opts.authorOverride !== undefined) {
    author = opts.authorOverride;
  } else {
    liveAuthor = new ClaudeAgentAuthor({
      cwd: opts.workspace,
      isWriteAllowed: (phase, relPath) => scope.isWriteAllowed(phase, relPath),
      feedbackCommands,
      ...(opts.phasePrompts !== undefined ? { phasePrompts: opts.phasePrompts } : {}),
      ...(opts.model !== undefined ? { model: opts.model } : {}),
      ...(opts.maxBudgetUsd !== undefined ? { maxBudgetUsd: opts.maxBudgetUsd } : {}),
      ...(opts.maxTurns !== undefined ? { maxTurns: opts.maxTurns } : {}),
    });
    author = liveAuthor;
  }

  // The GATE's tree seam: commit the authored files (attributed to the resolved signer; a
  // non-resolving signer still fails the gate itself), then read the REAL git state. Honest by
  // construction: if anything is still dirty after that commit, the gate fails closed.
  const signer = resolveSigner(opts.signerInputs);
  const commitAuthor = signer.ok ? signer.signer : "spine@storytree.invalid";
  const treeState =
    opts.treeState ??
    (async (): Promise<TreeState> => {
      await commitAuthored({
        worktreeRoot: opts.workspace,
        message: `storytree real build ${opts.runId}: ${spec.id} (authored by the gated leaf)`,
        author: commitAuthor,
      });
      return gitTreeState(opts.workspace)();
    });

  const proveSpec: ProveSpec = {
    unitId: spec.id,
    proofMode: mapProofMode(spec.proofMode),
    testId: spec.id,
    author,
    testExecutor,
    store: opts.store,
    signerInputs: opts.signerInputs,
    treeState,
    now: opts.now ?? ((): string => new Date().toISOString()),
    prompts: realPrompts(spec, real, proofDisplay),
    runId: opts.runId,
  };
  return liveAuthor !== undefined
    ? { ok: true, spec: proveSpec, liveAuthor }
    : { ok: true, spec: proveSpec };
}

/** Resolve the tsx loader to an ABSOLUTE url usable by `node --import` in a bare worktree. */
function tsxLoaderUrl(): string {
  return import.meta.resolve("tsx");
}

/**
 * The REAL proof command for a node (ADR-0057 §3, expansion B): the node's DECLARED
 * `real.proofCommand` when present, else the default `node --import tsx --test <testFile>`. The
 * declared command is platform-shimmed (pnpm.cmd on Windows) and its cwd is FORCED to the worktree
 * root — a node declares WHAT to run, never WHERE (the schema already refuses a declared cwd, so
 * forcing it here cannot silently override an author's intent). `display` is the honest human string
 * the leaf briefs + the run_proof description use. ONE place chooses the command, so the spine's
 * CONFIRM observations and the leaf's run_proof can never diverge (the one-oracle property).
 */
export function realProofCommand(
  real: RealProofConfig,
  workspace: string,
): { command: ShellCommand; display: string } {
  if (real.proofCommand !== undefined) {
    const command = platformShellCommand({ ...real.proofCommand, cwd: workspace });
    return {
      command,
      display: `${real.proofCommand.file} ${real.proofCommand.args.join(" ")}`.trim(),
    };
  }
  return {
    command: {
      file: process.execPath,
      args: ["--import", tsxLoaderUrl(), "--test", path.join(workspace, real.testFile)],
      cwd: workspace,
    },
    display: `node --import tsx --test ${real.testFile}`,
  };
}

/**
 * The option-A feedback commands for a live leaf: `run_proof` always (the EXACT command the
 * spine's CONFIRM observations spawn), `run_typecheck` when the node registers one. Both spawn
 * through {@link runShellCommand} — env-scrubbed, exit-code-as-data, leaf controls zero arguments.
 */
export function feedbackCommandsFor(
  proofCmd: ShellCommand,
  proofDisplay: string,
  typecheckCmd?: ShellCommand,
): FeedbackCommand[] {
  const commands: FeedbackCommand[] = [
    {
      name: "run_proof",
      description:
        `Run the node's proof command (${proofDisplay}) in the workspace and return its ` +
        "exit code and output. Bounded runs. FEEDBACK ONLY: the spine re-runs this command " +
        "itself, out-of-band, and only that observation decides red/green.",
      run: () => runShellCommand(proofCmd),
    },
  ];
  if (typecheckCmd !== undefined) {
    commands.push({
      name: "run_typecheck",
      description:
        "Run the package typecheck (tsc --noEmit, full strict flags) in the workspace and " +
        "return its exit code and output. Bounded runs. Promotion requires this green — the " +
        "proof command runs under tsx (types stripped), so only this sees type errors.",
      run: () => runShellCommand(typecheckCmd),
    });
  }
  return commands;
}

/**
 * The REAL-mode briefs: the node's identity/outcome/guidance plus the repo + worktree facts the
 * leaf needs to author the REAL files — exact paths, the proof command the spine runs, and the
 * iteration-one no-node_modules constraint (builtins + relative imports only).
 */
export function realPrompts(
  spec: NodeSpec,
  real: RealProofConfig,
  proofDisplay: string,
): PhasePrompts {
  const guidance =
    spec.guidance !== undefined ? `\n\nGuidance from the node spec:\n${spec.guidance}` : "";
  const header = `Unit "${spec.id}" (${spec.tier}): ${spec.title}.\nOutcome: ${spec.outcome}`;
  const customProof = real.proofCommand !== undefined;
  // C (ADR-0057 §3): an edit-existing node flips the brief (read+regress+edit, not net-new), and a
  // multi-file scope is NAMED off the existing `scope.sourceGlobs` — no new config field carries the
  // set. Singular `sourceGlobs === [sourceFile]` → name just the spotlight file (a net-new node's
  // brief is unchanged); a broader scope → name the spotlight plus the rest of the set.
  const editsExisting = real.editsExisting === true;
  const sourcesNamed =
    real.scope.sourceGlobs.length === 1 && real.scope.sourceGlobs[0] === real.sourceFile
      ? `\`${real.sourceFile}\``
      : `\`${real.sourceFile}\` and the other source files in your scope (matching ` +
        `${real.scope.sourceGlobs.map((g) => `\`${g}\``).join(", ")})`;
  const depsLine =
    real.install === true
      ? `- the worktree HAS its workspace dependencies installed (lockfile-only): you may import ` +
        `workspace packages and existing dependencies per the surrounding code's idiom, but you ` +
        `can NEVER add one — \`package.json\`/\`pnpm-lock.yaml\` are outside your write scope, ` +
        `and a new-dependency need means the node spec is wrong (stop, do not work around it).\n` +
        `- the proof command runs under tsx (types stripped), but promotion ALSO runs the package ` +
        `typecheck (\`tsc --noEmit\`, full strict flags incl. \`exactOptionalPropertyTypes\` and ` +
        `\`noUncheckedIndexedAccess\`) — type-illegal code that happens to be runtime-green will ` +
        `not land. Use the \`run_typecheck\` feedback tool before stopping.`
      : `- the worktree has NO node_modules: the test and the implementation may import ONLY ` +
        `\`node:\` builtins and relative files. \`import type { ... } from "./x.js"\` is fine ` +
        `(erased at runtime); a VALUE import of any package (zod etc.) will crash the proof run.`;
  // The proof line: the node's declared command (B) or the node:test default. A custom command may
  // run a package suite or another runner, so the brief points the leaf at THAT command going
  // red→green rather than naming node:test on a single file.
  const proofLine = customProof
    ? `- this node declares a CUSTOM proof command: author the test so that command goes ` +
      `red→green (it may run a package suite or another runner, not necessarily node:test on a ` +
      `single file).\n`
    : `- the TEST file is \`${real.testFile}\` (node:test + node:assert/strict).\n`;
  const conventions =
    `This is a REAL build: you are in a fresh git worktree of the storytree repo (TypeScript, ` +
    `strict, ESM NodeNext — relative imports use the .js extension). The spine proves the unit ` +
    `by running\n` +
    `  ${proofDisplay}\n` +
    `itself for the OFFICIAL red/green. You can run that same command yourself at any time via ` +
    `the \`run_proof\` feedback tool (bounded runs; its output is feedback, never the verdict). ` +
    `You cannot run shell commands.\n` +
    proofLine +
    // C (ADR-0057 §3): name the SET (via sourcesNamed) so the conventions line never contradicts the
    // multi-file IMPLEMENT brief. For a single-file node (sourceGlobs === [sourceFile], all 7 migrated
    // nodes) this is byte-identical to the old `\`${real.sourceFile}\`` — parity-of-prose preserved.
    `- the IMPLEMENTATION file is ${sourcesNamed}.\n` +
    depsLine;
  // C (ADR-0057 §3): the EDIT-EXISTING arm drops the net-new "must NOT exist yet" assumption and
  // steers the leaf to a regression red (a new failing assertion against existing behaviour, not a
  // missing symbol) then an EDIT of the existing source(s). Only the brief changes — the gate, the
  // scope wall, and the proof command are unchanged (the gate already accepts a runtime red; the
  // AUTHOR_TEST wall is still test-globs-only, so a leaf still cannot edit source while authoring
  // the test). The NET-NEW arm below is kept BYTE-FOR-BYTE (the 7 migrated nodes never set the flag).
  if (editsExisting) {
    return {
      authorTest:
        `${header}\n\n${conventions}${guidance}\n\nPhase AUTHOR_TEST — write ONLY ` +
        `\`${real.testFile}\`. The source file(s) ${sourcesNamed} ALREADY EXIST at HEAD — this is a ` +
        `regression/refactor, not a net-new file; do NOT recreate them, and do NOT edit any source ` +
        `in this phase (source writes are refused here). READ the existing source(s) first, then ` +
        `author a REGRESSION test that FAILS against their CURRENT behaviour: a NEW failing ` +
        `assertion about what they SHOULD do, NOT a missing-symbol import (the symbols already ` +
        `exist). After writing it, use \`run_proof\` to confirm it fails for the RIGHT reason — a ` +
        `behaviour-assertion failure, not a syntax error and not a "module not found". The spine ` +
        `observes the official red itself. When the test file is written and checked, stop.`,
      implement:
        `${header}\n\n${conventions}${guidance}\n\nPhase IMPLEMENT — read \`${real.testFile}\`, ` +
        `then EDIT the existing source file(s) ${sourcesNamed} so that test passes (you may write ` +
        `more than one — every path under your source scope is writable; writes to the test file ` +
        `are refused). Iterate: edit, \`run_proof\`, fix — until the proof is green` +
        `${real.install === true && real.typecheck !== undefined ? ` and \`run_typecheck\` is green` : ""}, ` +
        `then stop; the spine observes the official green itself. If you conclude the test itself ` +
        `is wrong, stop and say so plainly instead of working around it.`,
    };
  }
  return {
    authorTest:
      `${header}\n\n${conventions}${guidance}\n\nPhase AUTHOR_TEST — write ONLY ` +
      `\`${real.testFile}\`. The implementation \`${real.sourceFile}\` must NOT exist yet — do ` +
      `not create it (writes outside the test file are refused in this phase). Author the test ` +
      `so it FAILS now (importing the missing implementation) and PASSES once the implementation ` +
      `meets the outcome. After writing it, use \`run_proof\` to confirm it fails for the RIGHT ` +
      `reason (a missing-implementation/assertion failure, not a syntax error in the test). ` +
      `The spine observes the official red itself. When the test file is written and checked, stop.`,
    implement:
      `${header}\n\n${conventions}${guidance}\n\nPhase IMPLEMENT — read \`${real.testFile}\`, ` +
      `then write ONLY \`${real.sourceFile}\` so that test passes. Writes to the test file are ` +
      `refused in this phase. Iterate: write, \`run_proof\`, fix — until the proof is green` +
      `${real.install === true && real.typecheck !== undefined ? ` and \`run_typecheck\` is green` : ""}, ` +
      `then stop; the spine observes the official green itself. If you conclude the test itself ` +
      `is wrong, stop and say so plainly instead of working around it.`,
  };
}

/**
 * The live-smoke briefs: the real node's identity/outcome plus EXPLICIT file conventions, because
 * a real model (unlike the scripted one) needs to know exactly which workspace files the smoke's
 * test runner and write walls are wired to.
 */
export function liveSmokePrompts(spec: NodeSpec): PhasePrompts {
  const header = `Unit "${spec.id}" (${spec.tier}): ${spec.title}.\nOutcome: ${spec.outcome}`;
  const conventions =
    `This is a LIVE SMOKE of the prove-it gate in an empty temp workspace — the deliverable is a tiny\n` +
    `synthetic red→green pair, not the unit's real implementation:\n` +
    `- the TEST file is \`${DRY_RUN_TEST_REL}\` (plain CommonJS, run with \`node ${DRY_RUN_TEST_REL}\`,\n` +
    `  no test framework): it must \`require("./impl.cjs")\` and assert with \`node:assert/strict\`\n` +
    `  that \`add(2, 3) === 5\`, then log ok;\n` +
    `- the IMPL file is \`${DRY_RUN_IMPL_REL}\`: \`module.exports = { add }\`.\n` +
    `The \`run_proof\` feedback tool runs that test command for you (bounded runs; its output is\n` +
    `feedback, never the verdict — the spine observes the official red/green itself).`;
  return {
    authorTest:
      `${header}\n\n${conventions}\n\nPhase AUTHOR_TEST — write ONLY \`${DRY_RUN_TEST_REL}\`. ` +
      `\`${DRY_RUN_IMPL_REL}\` must NOT exist yet (the spine observes the red itself; do not create it, ` +
      `and writes to it are refused in this phase). After writing, you may \`run_proof\` to confirm ` +
      `it fails for the right reason. When the test file is written, stop.`,
    implement:
      `${header}\n\n${conventions}\n\nPhase IMPLEMENT — read \`${DRY_RUN_TEST_REL}\`, then write ONLY ` +
      `\`${DRY_RUN_IMPL_REL}\` so that test passes. Writes to the test file are refused in this phase. ` +
      `Iterate with \`run_proof\` until green, then stop — the spine observes the official green itself.`,
  };
}
