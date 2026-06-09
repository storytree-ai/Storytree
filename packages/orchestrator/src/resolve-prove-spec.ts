import * as path from "node:path";

import {
  ClaudeAgentAuthor,
  FileToolExecutor,
  FILE_WRITE_TOOLS,
  ScriptedModel,
} from "@storytree/agent";
import type { ModelResponse, PhaseAuthor } from "@storytree/agent";
import type { SignerInputs, Store } from "@storytree/core";

import { PathWriteScope } from "./phase-machine.js";
import { OwnedLoopAuthor } from "./owned-loop-author.js";
import { ShellTestExecutor } from "./shell-test-executor.js";
import type { ShellCommand } from "./shell-test-executor.js";
import type { PhasePrompts, ProveSpec, TreeState } from "./prove-it-gate.js";
import type { NodeSpec } from "./node-spec.js";
import { mapProofMode } from "./node-spec.js";
import { lookupNodeBuildConfig, registeredNodeIds } from "./test-command-registry.js";

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
 * The dry-run model factory: a phase-aware {@link ScriptedModel} whose two authoring steps each
 * issue ONE real `write_file` tool_use (test file first, impl second) and then end the turn. The
 * writes are REAL (they land via the FileToolExecutor and the spine really observes the exit-code
 * red→green they cause) — only the authorship is scripted.
 */
export function dryRunModel(): ScriptedModel {
  let writeTurnPending = true;
  let step = 0;
  return new ScriptedModel((): ModelResponse => {
    if (writeTurnPending) {
      writeTurnPending = false;
      const [pathRel, content] =
        step === 0
          ? [DRY_RUN_TEST_REL, DRY_RUN_TEST_SOURCE]
          : [DRY_RUN_IMPL_REL, DRY_RUN_IMPL_SOURCE];
      return {
        stopReason: "tool_use",
        content: [
          { type: "tool_use", id: `dry-w${step}`, name: "write_file", input: { path: pathRel, content } },
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
}

export type ResolveOptions = DryRunResolveOptions | LiveSmokeResolveOptions;

/**
 * Resolution outcome: the full ProveSpec (plus, in live mode, the live author for cost/violation
 * reporting), or a fail-closed refusal with the buildable ids.
 */
export type ResolveResult =
  | { ok: true; spec: ProveSpec; liveAuthor?: ClaudeAgentAuthor }
  | { ok: false; reason: string; registered: string[] };

/**
 * Fill every {@link ProveSpec} field for one node (plan §2 table). Fail-closed: a node with no
 * registry entry is not buildable, even dry — registration is the deliberate act that makes a
 * node driveable.
 */
export function resolveProveSpec(
  spec: NodeSpec,
  opts: ResolveOptions,
): ResolveResult {
  const config = lookupNodeBuildConfig(spec.id);
  if (config === null) {
    return {
      ok: false,
      reason: `node "${spec.id}" has no test-command registry entry — register how to prove it first`,
      registered: registeredNodeIds(),
    };
  }

  // Shared execution seams: a real Node test runner over the workspace's planted/authored pair,
  // and the per-phase write walls. The registry's real command/scope are NOT spawned in either
  // mode — driving the node's REAL proof is later work (plan Phase F).
  const testExecutor = new ShellTestExecutor({
    command: (): ShellCommand => ({
      file: process.execPath,
      args: [path.join(opts.workspace, DRY_RUN_TEST_REL)],
      cwd: opts.workspace,
    }),
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
      ...(opts.model !== undefined ? { model: opts.model } : {}),
      ...(opts.maxBudgetUsd !== undefined ? { maxBudgetUsd: opts.maxBudgetUsd } : {}),
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
    `- the IMPL file is \`${DRY_RUN_IMPL_REL}\`: \`module.exports = { add }\`.`;
  return {
    authorTest:
      `${header}\n\n${conventions}\n\nPhase AUTHOR_TEST — write ONLY \`${DRY_RUN_TEST_REL}\`. ` +
      `\`${DRY_RUN_IMPL_REL}\` must NOT exist yet (the spine observes the red itself; do not create it, ` +
      `and writes to it are refused in this phase). When the test file is written, stop.`,
    implement:
      `${header}\n\n${conventions}\n\nPhase IMPLEMENT — read \`${DRY_RUN_TEST_REL}\`, then write ONLY ` +
      `\`${DRY_RUN_IMPL_REL}\` so that test passes. Writes to the test file are refused in this phase. ` +
      `When the impl is written, stop — the spine observes the green itself.`,
  };
}
