// @storytree/agent — the agent runtimes (ADR-0011 / ADR-0030). This package is the SOLE model-
// runtime import site (ADR-0004): the owned loop on the raw Messages API (the offline/test
// executor and pivot-out fallback) AND the Claude Agent SDK leaf (the live runtime, ADR-0030),
// both behind the runtime-agnostic PhaseAuthor seam.
export type {
  Model,
  ModelMessage,
  ModelRequest,
  ModelResponse,
  ModelTool,
} from "./model.js";
export { ScriptedModel, AnthropicModel } from "./model.js";

export type { ToolExecutor, ToolHandler } from "./tool-executor.js";
export { MapToolExecutor } from "./tool-executor.js";

export type { TurnResult } from "./run-turn.js";
export { runTurn, DEFAULT_MAX_TURNS } from "./run-turn.js";

export type { StepResult, StepArgs } from "./step.js";
export { runStep, runStepValidated } from "./step.js";

export type { AuthoringPhase, AuthorResult, PhaseAuthor } from "./phase-author.js";

export type {
  SdkQueryFn,
  SdkWriteViolation,
  SdkRunInfo,
  SdkFeedbackRun,
  FeedbackCommand,
  FeedbackRunOutput,
  ClaudeAgentAuthorArgs,
} from "./sdk-author.js";
export {
  ClaudeAgentAuthor,
  decideWrite,
  executeFeedback,
  formatFeedbackOutput,
  leafSystemPrompt,
  composeLeafSystemPrompt,
} from "./sdk-author.js";

export type { SdkCuratorArgs, SdkCuratorResult } from "./sdk-curator.js";
export { runSdkCurator } from "./sdk-curator.js";

export type { WriteToolSpec } from "./fs-tools.js";
export {
  FileToolExecutor,
  PathEscapeError,
  FILE_TOOLS,
  FILE_WRITE_TOOLS,
} from "./fs-tools.js";

// The model-event vocabulary (ContentBlock / ToolUseBlock / ToolResultBlock / isTextBlock /
// isToolUseBlock / parseContentBlock …) — the agent leaf organism's declared `port` (ADR-0068
// step 6). Moved here from the dissolving @storytree/core; orchestrator consumes it across the seam.
export * from "./model-events.js";
