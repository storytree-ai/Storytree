import type { ToolResultBlock, ToolUseBlock } from "./model-events.js";

/**
 * The tool seam (ADR-0005: the spine owns control flow, the leaf judges). The owned loop
 * dispatches each model tool-call through this one interface. The sandbox implementation is
 * BORROWED-LATER from open source (survey §3); here we define only the interface plus a test
 * double.
 */
export interface ToolExecutor {
  execute(call: ToolUseBlock): Promise<ToolResultBlock>;
}

/** The handler a tool is registered with: pure input -> string result. May be async. */
export type ToolHandler = (input: unknown) => string | Promise<string>;

/**
 * A test double backed by a `Map<toolName, handler>`. An unregistered tool, or a handler that
 * throws, yields an `is_error` tool_result (fail-soft back to the model, not a thrown crash) —
 * the loop keeps the conversation well-formed so the model can recover.
 */
export class MapToolExecutor implements ToolExecutor {
  #tools: Map<string, ToolHandler>;

  constructor(tools?: Map<string, ToolHandler> | Record<string, ToolHandler>) {
    if (tools instanceof Map) {
      this.#tools = new Map(tools);
    } else if (tools) {
      this.#tools = new Map(Object.entries(tools));
    } else {
      this.#tools = new Map();
    }
  }

  /** Register (or replace) a tool handler. Returns `this` for chaining. */
  register(name: string, handler: ToolHandler): this {
    this.#tools.set(name, handler);
    return this;
  }

  async execute(call: ToolUseBlock): Promise<ToolResultBlock> {
    const handler = this.#tools.get(call.name);
    if (handler === undefined) {
      return {
        type: "tool_result",
        tool_use_id: call.id,
        content: `no such tool: ${call.name}`,
        is_error: true,
      };
    }
    try {
      const content = await handler(call.input);
      return {
        type: "tool_result",
        tool_use_id: call.id,
        content,
      };
    } catch (err) {
      return {
        type: "tool_result",
        tool_use_id: call.id,
        content: err instanceof Error ? err.message : String(err),
        is_error: true,
      };
    }
  }
}
