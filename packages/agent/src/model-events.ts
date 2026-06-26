import { z } from "zod";

/**
 * A typed vocabulary over the Anthropic Messages API content blocks (ADR-0011 owns the loop
 * on the raw Messages API behind a thin Model seam). Ported from the IDEA of
 * legacy/Agentic/crates/agentic-runtime/src/claude_event.rs: typed and LOUD-ON-MALFORMED —
 * the spine never substring-matches the stream; schema drift surfaces as a thrown error, not
 * as a silently-dropped block.
 *
 * Unlike the legacy enum we DROP the `Unknown` fallback variant: an unrecognised block is a
 * defect we want to hear about loudly (see {@link parseContentBlock}), not absorb.
 */

/** Assistant prose. */
export const TextBlock = z
  .object({
    type: z.literal("text"),
    text: z.string(),
  })
  .strict();
export type TextBlock = z.infer<typeof TextBlock>;

/** A tool-call request from the assistant. `input` is arbitrary JSON shaped by the tool's schema. */
export const ToolUseBlock = z
  .object({
    type: z.literal("tool_use"),
    id: z.string(),
    name: z.string(),
    input: z.unknown(),
  })
  .strict();
export type ToolUseBlock = z.infer<typeof ToolUseBlock>;

/** A tool result fed back to the model. `content` is the (string-serialised) tool output. */
export const ToolResultBlock = z
  .object({
    type: z.literal("tool_result"),
    tool_use_id: z.string(),
    content: z.string(),
    is_error: z.boolean().optional(),
  })
  .strict();
export type ToolResultBlock = z.infer<typeof ToolResultBlock>;

/** A content block at any type. The discriminator is `type`. */
export const ContentBlock = z.discriminatedUnion("type", [
  TextBlock,
  ToolUseBlock,
  ToolResultBlock,
]);
export type ContentBlock = z.infer<typeof ContentBlock>;

/** Why the model stopped generating (Messages API `stop_reason`). */
export const StopReason = z.enum([
  "end_turn",
  "tool_use",
  "max_tokens",
  "stop_sequence",
  "refusal",
]);
export type StopReason = z.infer<typeof StopReason>;

export function isTextBlock(block: ContentBlock): block is TextBlock {
  return block.type === "text";
}

export function isToolUseBlock(block: ContentBlock): block is ToolUseBlock {
  return block.type === "tool_use";
}

export function isToolResultBlock(block: ContentBlock): block is ToolResultBlock {
  return block.type === "tool_result";
}

/**
 * Parse an unknown value into a typed {@link ContentBlock}. LOUD-ON-MALFORMED: throws a clear
 * error (never returns a fallback) when the input is not a well-formed block — drift must be
 * heard, not swallowed.
 */
export function parseContentBlock(input: unknown): ContentBlock {
  const result = ContentBlock.safeParse(input);
  if (!result.success) {
    throw new Error(
      `malformed model content block: ${result.error.message}`,
    );
  }
  return result.data;
}
