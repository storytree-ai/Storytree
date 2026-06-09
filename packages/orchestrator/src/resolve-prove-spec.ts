import * as path from "node:path";

import { FileToolExecutor, FILE_WRITE_TOOLS, ScriptedModel } from "@storytree/agent";
import type { ModelResponse } from "@storytree/agent";
import type { SignerInputs, Store } from "@storytree/core";

import { PathWriteScope } from "./phase-machine.js";
import { ShellTestExecutor } from "./shell-test-executor.js";
import type { ShellCommand } from "./shell-test-executor.js";
import type { PhasePrompts, ProveSpec, TreeState } from "./prove-it-gate.js";
import type { NodeSpec } from "./node-spec.js";
import { mapProofMode } from "./node-spec.js";
import { lookupNodeBuildConfig, registeredNodeIds } from "./test-command-registry.js";

/**
 * The resolver (drive-machinery Phase B, plan §2): turn a loaded {@link NodeSpec} into the full
 * 14-field {@link ProveSpec} the prove-it-gate drives. The gate itself stays untouched — this is
 * the injection layer the plan identified as "the whole gap".
 *
 * Only DRY-RUN mode exists today (offline, zero API cost): the REAL fields come off the node spec
 * (unitId, proof mode, prompts, signer, runId — and the registry gates which nodes are buildable),
 * while the EXECUTION seams are synthetic (a scripted phase-aware model, a temp workspace, a Node
 * test runner over a planted red→green pair, an injected clean TreeState). HONEST FRAMING: a
 * dry-run proves the GLUE — spec → ProveSpec → gate → verdict → rollup — not the node's actual
 * proofs; the model is scripted and the red→green is synthetic in the temp workspace. `--live`
 * (AnthropicModel + the registry's real proof command) is gated on owner decisions (plan Phase 0/D).
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

/** The dry-run resolver inputs: the seams the CLI owns (workspace, store, ids, signer, clock). */
export interface DryRunResolveOptions {
  mode: "dry-run";
  /** The fresh temp workspace the synthetic red→green happens in. */
  workspace: string;
  /** The event store the signed verdict lands in (an InMemoryStore — never the live library DB). */
  store: Store;
  runId: string;
  signerInputs: SignerInputs;
  /** Injected for determinism in tests; defaults to the wall clock. */
  now?: () => string;
  /** Injected tree seam; defaults to a SYNTHETIC clean tree (a dry-run must not require a clean real tree). */
  treeState?: () => Promise<TreeState>;
}

/** Resolution outcome: the full ProveSpec, or a fail-closed refusal with the buildable ids. */
export type ResolveResult =
  | { ok: true; spec: ProveSpec }
  | { ok: false; reason: string; registered: string[] };

/**
 * Fill all 14 {@link ProveSpec} fields for one node (plan §2 table). Fail-closed: a node with no
 * registry entry is not buildable, even dry — registration is the deliberate act that makes a
 * node driveable.
 */
export function resolveProveSpec(
  spec: NodeSpec,
  opts: DryRunResolveOptions,
): ResolveResult {
  const config = lookupNodeBuildConfig(spec.id);
  if (config === null) {
    return {
      ok: false,
      reason: `node "${spec.id}" has no test-command registry entry — register how to prove it first`,
      registered: registeredNodeIds(),
    };
  }

  // Dry-run execution seams: a real FileToolExecutor + real Node test runner, but rooted in the
  // synthetic temp workspace (exactly the prove-it-gate.e2e.test.ts wiring, parameterized by the
  // real node spec). The registry's real command/scope are NOT spawned here — that's `--live`.
  const tools = new FileToolExecutor({ rootDir: opts.workspace });
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
    (async (): Promise<TreeState> => ({ commitSha: "dry-run-synthetic-tree", clean: true }));

  return {
    ok: true,
    spec: {
      unitId: spec.id,
      proofMode: mapProofMode(spec.proofMode),
      testId: spec.id,
      model: dryRunModel(),
      tools,
      scope,
      writeTools: FILE_WRITE_TOOLS,
      testExecutor,
      store: opts.store,
      signerInputs: opts.signerInputs,
      treeState,
      now: opts.now ?? ((): string => new Date().toISOString()),
      prompts: assemblePrompts(spec),
      runId: opts.runId,
    },
  };
}
