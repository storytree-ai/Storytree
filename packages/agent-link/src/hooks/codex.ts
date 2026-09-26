/**
 * Codex's hook inputs, as recorded from Codex (codex-cli 0.155; hooks are on by default from 0.124,
 * and SessionEnd exists from 0.145): every event names the session (`session_id`), its working
 * folder (`cwd`) and itself (`hook_event_name`).
 *
 * - SessionStart carries `source`: startup, resume, clear or compact. A resumed session keeps its id.
 * - PostToolUse carries `tool_name` and `tool_input`. Codex edits files with `apply_patch`, whose
 *   `tool_input.command` is the patch text: the files are the ones its `*** Add File:`,
 *   `*** Update File:`, `*** Delete File:` and `*** Move to:` lines name. A shell command is `Bash`,
 *   its `tool_input.command` one string; a patch run through the shell (`apply_patch <<'EOF'`)
 *   arrives that way too, and is read as the patch it applies.
 * - SessionEnd carries `reason`. Codex sends it only when a session shuts down, so a session whose
 *   end never comes goes idle instead (capability 4).
 */
import type { NewLine } from "../activity/index.js";
import type { HookLines } from "./hooks.js";

/** A line of a patch that names a file: the one it adds, updates or deletes, or where it moves one to. */
const PATCH_FILE = /^\*\*\* (?:(?:Add|Update|Delete) File|Move to): (.+?)\s*$/;

export function codexLines(input: Record<string, unknown>): HookLines | undefined {
  const { session_id: session, cwd: folder, hook_event_name: event } = input;
  if (!isText(session) || !isText(folder) || !isText(event)) return undefined;
  const common = { session, harness: "codex", source: "hook", folder } as const;
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
  if (typeof toolInput !== "object" || toolInput === null) return undefined;
  const { command } = toolInput as Record<string, unknown>;
  if (typeof command !== "string") return undefined;
  const isPatch = tool === "apply_patch" || (tool === "Bash" && command.includes("*** Begin Patch"));
  if (isPatch) {
    const files = patchFiles(command);
    return files.length === 0 ? undefined : { ...common, kind: "file-edited", files };
  }
  return tool === "Bash" ? { ...common, kind: "command-run", command } : undefined;
}

/** The files a patch names, each once, in the order it names them. */
function patchFiles(patch: string): string[] {
  const files: string[] = [];
  for (const line of patch.split(/\r?\n/)) {
    const file = PATCH_FILE.exec(line)?.[1];
    if (file !== undefined && !files.includes(file)) files.push(file);
  }
  return files;
}

function isText(value: unknown): value is string {
  return typeof value === "string" && value !== "";
}
