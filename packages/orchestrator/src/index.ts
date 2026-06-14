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
// Re-exported from core so the studio dev server — which lazy-imports ONLY the orchestrator
// (devApi.ts's raw-TS trap) — resolves the uat_witness default through the same single helper
// the story-build gate uses (ADR-0040).
export { effectiveUatWitness, type UatWitness } from "@storytree/core";

export type { NodeBuildConfig, RealProofConfig } from "./test-command-registry.js";
export {
  NODE_BUILD_REGISTRY,
  lookupNodeBuildConfig,
  registeredNodeIds,
  realBuildableNodeIds,
} from "./test-command-registry.js";

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
