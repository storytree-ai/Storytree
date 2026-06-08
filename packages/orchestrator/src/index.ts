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
