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

// The headless orchestrator runtime (ADR-0108 Phase 1): the read-only orientation tool surface and
// the single-session SDK runner that runs the rendered session-orchestrator agent headlessly. A third
// SDK-driven role behind the package's single-import-site (ADR-0004), alongside the leaf and the
// curator. The composition (packages/cli, which renders the prompt + injects the real `run` as the
// orientation runner) imports these by package name — hence the barrel export.
export type {
  OrientationEnvelope,
  OrientationRunner,
  OrientationOpts,
  OrientationTool,
} from "./orientation-tools.js";
export { buildOrientationTools } from "./orientation-tools.js";

export type {
  HeadlessOrchestratorArgs,
  HeadlessOrchestratorResult,
} from "./headless-orchestrator.js";
export { runHeadlessOrchestrator } from "./headless-orchestrator.js";

// The spawn seams (ADR-0137 Phase 3 / chat-subagent-spawn): the write-fenced story-author
// spawn runner and the claim-gated spawn tool surface's dep contract — consumed by
// @storytree/drive's spawn-deps composition, which renders the story-author prompt,
// composes the claim/build deps, and threads them through orchestrate() to the runtime.
export type {
  SpawnStoryAuthorArgs,
  SpawnStoryAuthorResult,
  ScopeViolation,
} from "./spawn-story-author.js";
export { runSpawnStoryAuthor } from "./spawn-story-author.js";
export type { SpawnSurfaceDeps } from "./spawn-tool-surface.js";
export { buildSpawnTools, SPAWN_SERVER } from "./spawn-tool-surface.js";
