import type { ContentBlock, StopReason, ToolResultBlock, ToolUseBlock } from "./model-events.js";
import { isTextBlock, isToolUseBlock } from "./model-events.js";
import type { Model, ModelMessage, ModelRequest } from "./model.js";
import type { ToolExecutor } from "./tool-executor.js";

/** The default tool-use turn ceiling. Exceeding it is a fail-closed error (see {@link runTurn}). */
export const DEFAULT_MAX_TURNS = 16;

/**
 * The result of driving a turn to `end_turn`. `finalText` is the concatenated text of the
 * terminal assistant message; `blocks` are that message's content blocks; `transcript` is the
 * full message list (the original request messages plus everything the loop appended); `turns`
 * is how many model round-trips it took.
 */
export interface TurnResult {
  finalText: string;
  blocks: ContentBlock[];
  transcript: ModelMessage[];
  turns: number;
  stopReason: StopReason;
}

/**
 * Drive tools to `end_turn` (survey §3, the surviving half of the owned loop). One ITERATION is
 * one clean request/response round-trip — NOT the legacy stream-shape counting hack. Loop:
 * call the model; if it stopped to use tools, execute each {@link ToolUseBlock} via the
 * {@link ToolExecutor}, append an assistant message (the tool_use blocks) and a user message
 * (the tool_result blocks), and loop; stop on `end_turn`. `maxTurns` is enforced FAIL-CLOSED:
 * a model that never terminates throws rather than silently returning a partial answer.
 */
export async function runTurn(args: {
  model: Model;
  tools?: ToolExecutor;
  request: ModelRequest;
  maxTurns?: number;
}): Promise<TurnResult> {
  const { model, tools, request } = args;
  const maxTurns = args.maxTurns ?? DEFAULT_MAX_TURNS;

  // Working copy of the conversation; we append assistant/tool turns as we go.
  const transcript: ModelMessage[] = [...request.messages];
  let turns = 0;

  while (turns < maxTurns) {
    turns += 1;
    const response = await model.createMessage({ ...request, messages: transcript });

    if (response.stopReason === "tool_use") {
      const toolUses = response.content.filter(isToolUseBlock);
      if (toolUses.length === 0) {
        // Stopped for tool_use but offered no tool call — a malformed turn we will not absorb.
        throw new Error(
          "model stopped with stop_reason='tool_use' but produced no tool_use block",
        );
      }
      if (tools === undefined) {
        throw new Error(
          "model requested tool use but no ToolExecutor was provided to runTurn",
        );
      }

      // Append the assistant's tool_use turn, then the user's tool_result turn.
      transcript.push({ role: "assistant", content: response.content });
      const results: ToolResultBlock[] = [];
      for (const call of toolUses) {
        results.push(await runOne(tools, call));
      }
      transcript.push({ role: "user", content: results });
      continue;
    }

    // Terminal turn (end_turn, or any non-tool_use stop reason): record and return.
    transcript.push({ role: "assistant", content: response.content });
    return {
      finalText: joinText(response.content),
      blocks: response.content,
      transcript,
      turns,
      stopReason: response.stopReason,
    };
  }

  throw new Error(`runTurn exceeded maxTurns=${maxTurns} without reaching end_turn`);
}

function runOne(tools: ToolExecutor, call: ToolUseBlock): Promise<ToolResultBlock> {
  return tools.execute(call);
}

/** Concatenate the text of all text blocks (the model may interleave text with tool_use). */
function joinText(blocks: ContentBlock[]): string {
  return blocks
    .filter(isTextBlock)
    .map((b) => b.text)
    .join("");
}
