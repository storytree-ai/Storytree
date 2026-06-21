// @storytree/orchestrator — the deterministic spine (ADR-0005/0020). The spine OWNS control flow
// (runSequence / runLoop) and the red-green honesty floor (the phase machine); the leaf only judges.

export type { StepFn, SequenceRun, LoopArgs, LoopRun } from "./sequence.js";
export { runSequence, runLoop } from "./sequence.js";

export type {
  Phase,
  TestObservation,
  PhaseTransition,
  WriteScope,
  PathWriteScopeConfig,
  TestExecutor,
} from "./phase-machine.js";
export {
  nextPhase,
  advancePhase,
  PathWriteScope,
  globMatch,
  RecordingTestExecutor,
} from "./phase-machine.js";

export type {
  ShellRunResult,
  ShellCommand,
  ShellTestResolver,
} from "./shell-test-executor.js";
export {
  ShellTestExecutor,
  defaultClassifyKind,
  nodeEvalExecutor,
  runShellCommand,
  scrubbedChildEnv,
  isScrubbedEnvKey,
} from "./shell-test-executor.js";

export type {
  WriteToolSpec,
  WriteViolation,
  WriteScopedToolExecutorArgs,
} from "./write-scoped-executor.js";
export { WriteScopedToolExecutor } from "./write-scoped-executor.js";

export type {
  TreeState,
  PhasePrompts,
  ProveSpec,
  ProveResult,
} from "./prove-it-gate.js";
export { proveUnit, gitTreeState } from "./prove-it-gate.js";

export type { OwnedLoopAuthorArgs } from "./owned-loop-author.js";
export { OwnedLoopAuthor } from "./owned-loop-author.js";

export type { NodeSpec } from "./node-spec.js";
export { loadNodeSpec, findNodeSpecFile, mapProofMode } from "./node-spec.js";
// Re-exported from the library organism (ADR-0068 step 3) so the studio dev server — which
// lazy-imports ONLY the orchestrator (devApi.ts's raw-TS trap) — resolves the uat_witness default
// through the same single helper the story-build gate uses (ADR-0040).
export { effectiveUatWitness, type UatWitness } from "@storytree/library";

export type { NodeBuildConfig, RealProofConfig } from "./test-command-registry.js";
export {
  NODE_BUILD_REGISTRY,
  lookupNodeBuildConfig,
  registeredNodeIds,
  realBuildableNodeIds,
} from "./test-command-registry.js";

// The spec-borne proof-config shape (ADR-0057 keystone): the zod schema + parser a node's own
// `proof:` block validates through (the loader uses it; tests assert it directly).
export { NodeBuildConfigSchema, parseNodeBuildConfig } from "./proof-config.js";

export type {
  DryRunResolveOptions,
  LiveSmokeResolveOptions,
  RealResolveOptions,
  ResolveOptions,
  ResolveResult,
  LeafPhasePrompts,
} from "./resolve-prove-spec.js";
export {
  resolveProveSpec,
  resolveBuildConfig,
  realProofCommand,
  assemblePrompts,
  liveSmokePrompts,
  realPrompts,
  feedbackCommandsFor,
  dryRunModel,
  scriptedWriterModel,
  DRY_RUN_TEST_REL,
  DRY_RUN_IMPL_REL,
} from "./resolve-prove-spec.js";

export type {
  AddDepsGroup,
  BuildWorktree,
  CreateBuildWorktreeOptions,
  PromotionResult,
} from "./build-worktree.js";
export {
  createBuildWorktree,
  commitAuthored,
  promoteRealPass,
  runRegressionSuite,
  runWorktreeTypecheck,
  platformShellCommand,
} from "./build-worktree.js";

export type {
  StoryNodeOutcome,
  StoryNodeBuilder,
  StoryBuildArgs,
  StoryBuildRun,
  TopoResult,
} from "./story-build.js";
export { runStoryBuild, topoOrderStoryNodes } from "./story-build.js";

// ── The proof machinery (ADR-0068 step 1): the farmer organism's RULER — the compute that
// constructs/signs/hashes/classifies/derives verdict-DATA, moved out of @storytree/core. The DATA
// SHAPES it reads/returns live in @storytree/proof-protocol; this is the COMPUTE half. ──────────
export type { SignerInputs, SignerResult } from "./proof/signer.js";
export { resolveSigner } from "./proof/signer.js";
export { resolveSignerFromEnv } from "./proof/signer-env.js";
export { isProvenStatus } from "./proof/proof-status.js";
export { verdictLine } from "./proof/verdict-line.js";
export { normalizeSpan, hashSpan, isDescribed, classifyDrift } from "./proof/anchor-compute.js";
export { workEvent, rollupStatus } from "./proof/rollup.js";
export type { RollupEvent } from "./proof/rollup.js";
export { rollupParitySuite } from "./proof/rollup-parity.js";
export { deriveAttestations } from "./proof/attestations.js";
// The per-test UAT proof compute (ADR-0082): the sign-time trust guard + the read-time AND-roll-up
// that greens a story's own UAT when all its per-test verdicts pass. DATA shapes are the contract's;
// the per-test DATA + parser live in the library organism (`uat-tests.ts`, ADR-0044).
export type { UatProofCheck, UatProofResult } from "./proof/uat-proof.js";
export { checkUatProof, rollupStoryUat, rollupStoryGreen } from "./proof/uat-proof.js";
// ADR-0085 (resolving ADR-0083 Fork B): the brownfield OBSERVE-AND-SIGN compute — an `observe`
// reliability gate earns an `adopted` machine verdict when the spine observes its declared command
// green at a clean committed HEAD (no prior red; job 2 supplied by author review).
export type {
  ObserveAndSignSpec,
  ObserveAndSignResult,
  ObserveGitState,
  ObserveOutcome,
  AdoptedVerdictStore,
} from "./proof/observe-and-sign.js";
export { observeAndSign } from "./proof/observe-and-sign.js";
export type { SourceRef, SourceDriftFlag } from "./proof/source-drift.js";
export { classifySourceDrift } from "./proof/source-drift.js";
