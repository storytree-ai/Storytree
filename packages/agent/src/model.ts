import Anthropic from "@anthropic-ai/sdk";
import type {
  ContentBlock,
  StopReason,
} from "./model-events.js";
import { parseContentBlock } from "./model-events.js";

/**
 * The thin Model seam (ADR-0011 §3). The owned loop calls the model through this one
 * interface so the model runtime is swappable + mockable. ALL @anthropic-ai/sdk imports
 * are isolated to THIS file — the single model-runtime import site (ADR-0004/0011).
 */

/** A turn in the conversation. `content` is a typed block list or a bare string (sugar). */
export interface ModelMessage {
  role: "user" | "assistant";
  content: ContentBlock[] | string;
}

/** A tool offered to the model. Mirrors the Messages API `tools[]` shape. */
export interface ModelTool {
  name: string;
  description?: string;
  inputSchema: Record<string, unknown>;
}

/** A model request, mirroring messages.create. */
export interface ModelRequest {
  model: string;
  system?: string;
  messages: ModelMessage[];
  tools?: ModelTool[];
  maxTokens?: number;
}

/** A model response: the assistant's content blocks plus why it stopped. */
export interface ModelResponse {
  content: ContentBlock[];
  stopReason: StopReason;
}

/** The model seam: one swappable call. */
export interface Model {
  createMessage(req: ModelRequest): Promise<ModelResponse>;
}

/**
 * The test double for the whole loop (zero live calls). Constructed with an ordered list
 * of {@link ModelResponse}, or a function that computes the next response from the request.
 * Each call returns the next scripted response; running past the end is a LOUD error.
 */
export class ScriptedModel implements Model {
  #script: ((req: ModelRequest, index: number) => ModelResponse) | ModelResponse[];
  #index = 0;

  constructor(
    script: ModelResponse[] | ((req: ModelRequest, index: number) => ModelResponse),
  ) {
    this.#script = script;
  }

  /** How many times {@link createMessage} has been called. */
  get calls(): number {
    return this.#index;
  }

  createMessage(req: ModelRequest): Promise<ModelResponse> {
    if (typeof this.#script === "function") {
      const res = this.#script(req, this.#index);
      this.#index += 1;
      return Promise.resolve(res);
    }
    const res = this.#script[this.#index];
    if (res === undefined) {
      return Promise.reject(
        new Error(
          `ScriptedModel exhausted: no response scripted for call #${this.#index}`,
        ),
      );
    }
    this.#index += 1;
    return Promise.resolve(res);
  }
}

const DEFAULT_MAX_TOKENS = 4096;

/**
 * The live model: wraps @anthropic-ai/sdk. Constructed with `{ apiKey }`. It must TYPECHECK
 * and be constructible, but is NEVER exercised in tests (no key offline). Maps ModelRequest
 * <-> the SDK's messages.create and the SDK Message back to core's ContentBlock/StopReason.
 */
export class AnthropicModel implements Model {
  #client: Anthropic;

  constructor(opts: { apiKey: string }) {
    this.#client = new Anthropic({ apiKey: opts.apiKey });
  }

  async createMessage(req: ModelRequest): Promise<ModelResponse> {
    const message = await this.#client.messages.create({
      model: req.model,
      max_tokens: req.maxTokens ?? DEFAULT_MAX_TOKENS,
      ...(req.system !== undefined ? { system: req.system } : {}),
      messages: req.messages.map(toSdkMessage),
      ...(req.tools !== undefined ? { tools: req.tools.map(toSdkTool) } : {}),
    });

    // Filter to the blocks core's vocabulary recognises (text / tool_use); thinking and
    // redacted_thinking blocks are not part of the owned-loop transcript vocabulary.
    const content: ContentBlock[] = [];
    for (const block of message.content) {
      // Strip SDK-only fields (citations, cache_control) and validate against core's vocabulary;
      // thinking / redacted_thinking blocks are not part of the owned-loop transcript.
      if (block.type === "text") {
        content.push(parseContentBlock({ type: "text", text: block.text }));
      } else if (block.type === "tool_use") {
        content.push(
          parseContentBlock({
            type: "tool_use",
            id: block.id,
            name: block.name,
            input: block.input,
          }),
        );
      }
    }

    const stopReason: StopReason = message.stop_reason ?? "end_turn";
    return { content, stopReason };
  }
}

function toSdkMessage(m: ModelMessage): Anthropic.MessageParam {
  if (typeof m.content === "string") {
    return { role: m.role, content: m.content };
  }
  return {
    role: m.role,
    content: m.content.map(toSdkBlock),
  };
}

function toSdkBlock(block: ContentBlock): Anthropic.ContentBlockParam {
  switch (block.type) {
    case "text":
      return { type: "text", text: block.text };
    case "tool_use":
      return {
        type: "tool_use",
        id: block.id,
        name: block.name,
        input: block.input,
      };
    case "tool_result":
      return {
        type: "tool_result",
        tool_use_id: block.tool_use_id,
        content: block.content,
        ...(block.is_error !== undefined ? { is_error: block.is_error } : {}),
      };
  }
}

function toSdkTool(tool: ModelTool): Anthropic.Tool {
  return {
    name: tool.name,
    ...(tool.description !== undefined ? { description: tool.description } : {}),
    input_schema: tool.inputSchema as Anthropic.Tool.InputSchema,
  };
}
