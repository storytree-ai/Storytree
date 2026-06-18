import { execFile } from "node:child_process";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { promisify } from "node:util";

import type { ToolResultBlock, ToolUseBlock } from "./model-events.js";
import { z } from "zod";

import type { ModelTool } from "./model.js";
import type { ToolExecutor } from "./tool-executor.js";

const execFileAsync = promisify(execFile);

/**
 * Structurally compatible with the orchestrator's `WriteToolSpec` (a map of write-tool name ->
 * path-extractor). Declared locally so the agent package does not depend on the orchestrator
 * (the dependency runs the other way); {@link FILE_WRITE_TOOLS} satisfies the orchestrator's type.
 */
export type WriteToolSpec = Record<string, (input: unknown) => string | string[] | null>;

/**
 * The REAL local tool surface the owned loop (ADR-0011) uses to act on a workspace: file IO
 * plus running a command. This is the plain tool layer — NOT sandboxing/isolation (which the
 * owner cut). Every path is resolved relative to `rootDir` and MUST stay inside it.
 *
 * The contract mirrors {@link MapToolExecutor}: an EXPECTED failure (missing file, ambiguous
 * edit, path escape, non-zero exit) NEVER throws out of {@link execute} — it returns an
 * `is_error` (or, for run_command, a data-bearing) {@link ToolResultBlock} so the loop keeps
 * the conversation well-formed and the model can adapt. Only an unknown tool name is the
 * executor-contract `is_error`.
 */
export class FileToolExecutor implements ToolExecutor {
  readonly #rootDir: string;

  constructor(opts: { rootDir: string }) {
    this.#rootDir = path.resolve(opts.rootDir);
  }

  /**
   * Resolve `p` relative to `rootDir` and assert it stays inside. Throws {@link PathEscapeError}
   * on traversal (`../outside`) or an absolute path landing outside the root — load-bearing path
   * safety. The handlers turn that throw into an `is_error` result.
   */
  resolveInRoot(p: string): string {
    const resolved = path.resolve(this.#rootDir, p);
    const rel = path.relative(this.#rootDir, resolved);
    // Outside iff the relative path climbs out (`..`) or is itself absolute (different root/drive).
    if (rel === ".." || rel.startsWith(`..${path.sep}`) || path.isAbsolute(rel)) {
      throw new PathEscapeError(p, this.#rootDir);
    }
    return resolved;
  }

  async execute(call: ToolUseBlock): Promise<ToolResultBlock> {
    try {
      switch (call.name) {
        case "read_file":
          return ok(call, await this.#readFile(call.input));
        case "write_file":
          return ok(call, await this.#writeFile(call.input));
        case "edit_file":
          return ok(call, await this.#editFile(call.input));
        case "list_dir":
          return ok(call, await this.#listDir(call.input));
        case "run_command":
          // A non-zero exit is DATA, captured inside #runCommand — not a throw.
          return ok(call, await this.#runCommand(call.input));
        default:
          return err(call, `no such tool: ${call.name}`);
      }
    } catch (e) {
      return err(call, errMessage(e));
    }
  }

  async #readFile(input: unknown): Promise<string> {
    const { path: p } = ReadFileInput.parse(input);
    const target = this.resolveInRoot(p);
    return fs.readFile(target, "utf8");
  }

  async #writeFile(input: unknown): Promise<string> {
    const { path: p, content } = WriteFileInput.parse(input);
    const target = this.resolveInRoot(p);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, content, "utf8");
    return `wrote ${Buffer.byteLength(content, "utf8")} bytes to ${p}`;
  }

  async #editFile(input: unknown): Promise<string> {
    const { path: p, old_str, new_str } = EditFileInput.parse(input);
    const target = this.resolveInRoot(p);
    const original = await fs.readFile(target, "utf8");

    const first = original.indexOf(old_str);
    if (first === -1) {
      throw new Error(`edit_file: old_str not found in ${p}`);
    }
    // Reject ambiguous edits: old_str must occur exactly once.
    if (original.indexOf(old_str, first + 1) !== -1) {
      throw new Error(`edit_file: old_str appears more than once in ${p} (ambiguous edit)`);
    }

    const updated = original.slice(0, first) + new_str + original.slice(first + old_str.length);
    await fs.writeFile(target, updated, "utf8");
    return `edited ${p} (replaced 1 occurrence)`;
  }

  async #listDir(input: unknown): Promise<string> {
    const { path: p } = ListDirInput.parse(input);
    const target = this.resolveInRoot(p);
    const entries = await fs.readdir(target, { withFileTypes: true });
    const lines = entries.map((e) => `${e.isDirectory() ? "dir" : "file"}\t${e.name}`);
    return lines.join("\n");
  }

  async #runCommand(input: unknown): Promise<string> {
    const { command, args } = RunCommandInput.parse(input);
    // NO shell string: execFile runs the binary directly with the arg array.
    try {
      const { stdout, stderr } = await execFileAsync(command, args, {
        cwd: this.#rootDir,
      });
      return formatRun(0, stdout, stderr);
    } catch (e) {
      // A non-zero exit (or signal) is DATA, not an error: execFile rejects with code/stdout/stderr.
      const ex = e as NodeJS.ErrnoException & {
        code?: number | string;
        stdout?: string;
        stderr?: string;
      };
      if (typeof ex.code === "number") {
        return formatRun(ex.code, ex.stdout ?? "", ex.stderr ?? "");
      }
      // A genuine spawn failure (ENOENT etc.) — re-throw so execute() returns is_error.
      throw e;
    }
  }
}

/** Thrown by {@link FileToolExecutor.resolveInRoot} when a path escapes the root. */
export class PathEscapeError extends Error {
  constructor(requested: string, rootDir: string) {
    super(`path escapes rootDir: '${requested}' resolves outside ${rootDir}`);
    this.name = "PathEscapeError";
  }
}

// ---- input schemas (validate call.input shape) -------------------------------------------------

const ReadFileInput = z.object({ path: z.string() }).strict();
const WriteFileInput = z.object({ path: z.string(), content: z.string() }).strict();
const EditFileInput = z
  .object({ path: z.string(), old_str: z.string(), new_str: z.string() })
  .strict();
const ListDirInput = z.object({ path: z.string() }).strict();
const RunCommandInput = z
  .object({ command: z.string(), args: z.array(z.string()).default([]) })
  .strict();

// ---- result helpers ----------------------------------------------------------------------------

function ok(call: ToolUseBlock, content: string): ToolResultBlock {
  return { type: "tool_result", tool_use_id: call.id, content };
}

function err(call: ToolUseBlock, content: string): ToolResultBlock {
  return { type: "tool_result", tool_use_id: call.id, content, is_error: true };
}

function errMessage(e: unknown): string {
  if (e instanceof z.ZodError) {
    return `invalid tool input: ${e.issues.map((i) => i.message).join("; ")}`;
  }
  return e instanceof Error ? e.message : String(e);
}

function formatRun(code: number, stdout: string, stderr: string): string {
  return `exit_code: ${code}\nstdout:\n${stdout}\nstderr:\n${stderr}`;
}

// ---- tool schemas + write spec -----------------------------------------------------------------

/**
 * The JSON tool definitions (name, description, input_schema) for the local file surface — what a
 * real model is told exists. Mirrors the Messages API `tools[]` shape via {@link ModelTool}.
 */
export const FILE_TOOLS: ModelTool[] = [
  {
    name: "read_file",
    description: "Read a UTF-8 text file at a path relative to the workspace root.",
    inputSchema: {
      type: "object",
      properties: { path: { type: "string", description: "Workspace-relative file path." } },
      required: ["path"],
      additionalProperties: false,
    },
  },
  {
    name: "write_file",
    description:
      "Write a UTF-8 text file at a workspace-relative path, creating parent directories. Overwrites.",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Workspace-relative file path." },
        content: { type: "string", description: "The bytes to write." },
      },
      required: ["path", "content"],
      additionalProperties: false,
    },
  },
  {
    name: "edit_file",
    description:
      "Replace the single, unique occurrence of old_str with new_str in a file. Fails if old_str is absent or appears more than once.",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Workspace-relative file path." },
        old_str: { type: "string", description: "Exact text to replace (must occur exactly once)." },
        new_str: { type: "string", description: "Replacement text." },
      },
      required: ["path", "old_str", "new_str"],
      additionalProperties: false,
    },
  },
  {
    name: "list_dir",
    description: "List the entries (name + dir/file kind) of a workspace-relative directory.",
    inputSchema: {
      type: "object",
      properties: { path: { type: "string", description: "Workspace-relative directory path." } },
      required: ["path"],
      additionalProperties: false,
    },
  },
  {
    name: "run_command",
    description:
      "Run a command (no shell) with an argument array in the workspace root. The exit code, stdout, and stderr are returned as data; a non-zero exit is not an error.",
    inputSchema: {
      type: "object",
      properties: {
        command: { type: "string", description: "The executable to run (no shell interpolation)." },
        args: {
          type: "array",
          items: { type: "string" },
          description: "Arguments passed verbatim to the command.",
        },
      },
      required: ["command"],
      additionalProperties: false,
    },
  },
];

/**
 * A {@link WriteToolSpec}-compatible path-extractor map: which FILE_TOOLS are WRITES and how to read
 * their target path, so the orchestrator's WriteScopedToolExecutor can gate them by phase. Read/list/
 * run tools are absent (non-writes) and bypass scope-checking.
 */
export const FILE_WRITE_TOOLS: WriteToolSpec = {
  write_file: (input) => extractPath(input),
  edit_file: (input) => extractPath(input),
};

function extractPath(input: unknown): string | null {
  if (typeof input === "object" && input !== null && "path" in input) {
    const p = (input as { path: unknown }).path;
    return typeof p === "string" ? p : null;
  }
  return null;
}
