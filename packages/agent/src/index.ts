// @storytree/agent — the owned agent loop (ADR-0011): the surviving turn discipline on the raw
// Messages API, behind a thin Model seam. The Agentic subprocess-wrapper half is dead (survey §3).
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

export type { WriteToolSpec } from "./fs-tools.js";
export {
  FileToolExecutor,
  PathEscapeError,
  FILE_TOOLS,
  FILE_WRITE_TOOLS,
} from "./fs-tools.js";
