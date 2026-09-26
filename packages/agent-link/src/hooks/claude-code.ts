/**
 * Claude Code's hook inputs, as recorded from Claude Code 2.1.212: every event names the session
 * (`session_id`), its working folder (`cwd`) and itself (`hook_event_name`).
 *
 * - SessionStart carries `source`: startup, resume, clear or compact. A resumed window keeps its
 *   session id.
 * - PostToolUse carries `tool_name` and `tool_input`. Write, Edit and MultiEdit name the file as
 *   `file_path`, NotebookEdit as `notebook_path`; Bash gives its `command`. Other tools make no line.
 * - SessionEnd carries `reason`.
 */
import type { NewLine } from "../activity/index.js";
import type { HookLines } from "./hooks.js";

const EDITS_FILE = new Set(["Write", "Edit", "MultiEdit"]);

export function claudeCodeLines(input: Record<string, unknown>): HookLines | undefined {
  const { session_id: session, cwd: folder, hook_event_name: event } = input;
  if (!isText(session) || !isText(folder) || !isText(event)) return undefined;
  const common = { session, harness: "claude-code", source: "hook", folder } as const;
  const line = (made: NewLine | undefined): HookLines | undefined => (made === undefined ? undefined : { folder, lines: [made] });

  switch (event) {
    case "SessionStart":
      return line({ ...common, kind: "session-started", ...(isText(input.source) ? { how: input.source } : {}) });
    case "SessionEnd":
      return line({ ...common, kind: "session-ended", ...(isText(input.reason) ? { reason: input.reason } : {}) });
    case "PostToolUse":
      return line(toolLine(common, input.tool_name, input.tool_input));
    default:
      return undefined;
  }
}

function toolLine(common: Pick<NewLine, "session" | "harness" | "source" | "folder">, tool: unknown, toolInput: unknown): NewLine | undefined {
  if (!isText(tool) || typeof toolInput !== "object" || toolInput === null) return undefined;
  const { file_path: filePath, notebook_path: notebookPath, command } = toolInput as Record<string, unknown>;
  if (EDITS_FILE.has(tool) && isText(filePath)) return { ...common, kind: "file-edited", files: [filePath] };
  if (tool === "NotebookEdit" && isText(notebookPath)) return { ...common, kind: "file-edited", files: [notebookPath] };
  if (tool === "Bash" && typeof command === "string") return { ...common, kind: "command-run", command };
  return undefined;
}

function isText(value: unknown): value is string {
  return typeof value === "string" && value !== "";
}
