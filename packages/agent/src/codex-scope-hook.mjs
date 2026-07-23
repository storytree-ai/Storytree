import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const PHASES = new Set(["AUTHOR_TEST", "IMPLEMENT"]);
const READ_ONLY_TOOLS = new Set([
  "Read",
  "Glob",
  "Grep",
  "read_file",
  "list_dir",
  "list_files",
  "search_files",
]);

function deny(tool, paths, reason) {
  return { allow: false, tool, paths, reason };
}

function normalizeRelative(cwd, candidate) {
  if (
    typeof candidate !== "string" ||
    candidate.length === 0 ||
    candidate.includes("\0") ||
    /[\r\n]/.test(candidate)
  ) {
    return { ok: false, reason: "tool path is unreadable or malformed" };
  }
  const absolute = path.resolve(cwd, candidate);
  const relative = path.relative(cwd, absolute);
  if (
    relative === "" ||
    relative === ".." ||
    relative.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relative)
  ) {
    return { ok: false, reason: `'${candidate}' resolves outside the workspace or to its root` };
  }
  return { ok: true, path: relative.replaceAll("\\", "/") };
}

function globRegex(glob) {
  let source = "^";
  for (let i = 0; i < glob.length; i += 1) {
    const ch = glob[i];
    if (ch === "*") {
      if (glob[i + 1] === "*") {
        i += 1;
        if (glob[i + 1] === "/") {
          i += 1;
          source += "(?:.*/)?";
        } else {
          source += ".*";
        }
      } else {
        source += "[^/]*";
      }
    } else if (ch === "?") {
      source += "[^/]";
    } else {
      source += ch.replace(/[\\^$.*+?()[\]{}|]/g, "\\$&");
    }
  }
  return new RegExp(`${source}$`, process.platform === "win32" ? "i" : "");
}

function validWriteGlobs(writeGlobs, phase) {
  if (
    typeof writeGlobs !== "object" ||
    writeGlobs === null ||
    !Array.isArray(writeGlobs[phase])
  ) {
    return null;
  }
  const globs = writeGlobs[phase];
  if (
    globs.some(
      (glob) =>
        typeof glob !== "string" ||
        glob.length === 0 ||
        glob.includes("\0") ||
        path.isAbsolute(glob) ||
        glob === ".." ||
        glob.startsWith("../") ||
        glob.includes("/../") ||
        glob.includes("\\"),
    )
  ) {
    return null;
  }
  return globs;
}

function patchPaths(patch) {
  if (typeof patch !== "string" || patch.length === 0 || patch.includes("\0")) {
    return { ok: false, reason: "apply_patch carries no readable patch text" };
  }
  const lines = patch.replaceAll("\r\n", "\n").split("\n");
  if (lines[0] !== "*** Begin Patch" || !lines.includes("*** End Patch")) {
    return { ok: false, reason: "apply_patch is not an unambiguous Codex patch envelope" };
  }
  const end = lines.indexOf("*** End Patch");
  if (end !== lines.length - 1 && !(end === lines.length - 2 && lines.at(-1) === "")) {
    return { ok: false, reason: "apply_patch contains trailing data after its end marker" };
  }
  const targets = [];
  let hasOperation = false;
  for (let i = 1; i < end; i += 1) {
    const line = lines[i];
    const operation = /^\*\*\* (?:Add File|Delete File|Update File): (.+)$/.exec(line);
    const move = /^\*\*\* Move to: (.+)$/.exec(line);
    if (operation) {
      hasOperation = true;
      targets.push(operation[1]);
      continue;
    }
    if (move) {
      if (!hasOperation) {
        return { ok: false, reason: "apply_patch move target has no preceding file operation" };
      }
      targets.push(move[1]);
      continue;
    }
    if (line.startsWith("*** ") && line !== "*** End of File") {
      return { ok: false, reason: `apply_patch contains ambiguous marker '${line}'` };
    }
  }
  if (!hasOperation || targets.length === 0) {
    return { ok: false, reason: "apply_patch contains no readable file operation" };
  }
  return { ok: true, paths: targets };
}

function writeTargets(tool, input) {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return { ok: false, reason: `'${tool}' carries malformed tool_input` };
  }
  if (tool === "apply_patch" || typeof input.patch === "string") {
    return patchPaths(input.patch);
  }
  const target = input.file_path ?? input.path;
  if (typeof target !== "string") {
    return { ok: false, reason: `'${tool}' carries no readable file path` };
  }
  return { ok: true, paths: [target] };
}

/**
 * Pure PreToolUse policy. The disposable replica is the hard isolation wall; this hook is the
 * independently testable early refusal that keeps even discarded writes phase-scoped.
 */
export function decideCodexToolUse({ phase, cwd, writeGlobs, event }) {
  if (!PHASES.has(phase) || typeof cwd !== "string" || !path.isAbsolute(cwd)) {
    return deny("(unknown)", [], "scope policy is malformed (invalid phase or workspace)");
  }
  const globs = validWriteGlobs(writeGlobs, phase);
  if (globs === null) {
    return deny("(unknown)", [], "scope policy carries malformed phase write globs");
  }
  if (typeof event !== "object" || event === null || Array.isArray(event)) {
    return deny("(unknown)", [], "malformed PreToolUse input");
  }
  if (event.hook_event_name !== "PreToolUse" || typeof event.tool_name !== "string") {
    return deny("(unknown)", [], "malformed or unexpected hook event");
  }
  const tool = event.tool_name;
  if (tool === "Bash" || tool === "exec_command" || tool === "unified_exec") {
    return deny(tool, [], "shell and unified execution are unavailable to the Codex phase leaf");
  }
  if (tool === "Agent" || tool.startsWith("mcp__")) {
    return deny(tool, [], "agents and MCP tools are unavailable to the Codex phase leaf");
  }
  if (READ_ONLY_TOOLS.has(tool)) {
    return { allow: true, tool, paths: [] };
  }
  if (tool !== "apply_patch" && tool !== "Write" && tool !== "Edit") {
    return deny(tool, [], `unknown local tool '${tool}' is denied fail-closed`);
  }

  const targets = writeTargets(tool, event.tool_input);
  if (!targets.ok) return deny(tool, [], targets.reason);
  const normalized = [];
  for (const target of targets.paths) {
    const result = normalizeRelative(cwd, target);
    if (!result.ok) return deny(tool, normalized, result.reason);
    normalized.push(result.path);
  }
  const matchers = globs.map(globRegex);
  const refused = normalized.find((target) => !matchers.some((matcher) => matcher.test(target)));
  if (refused !== undefined) {
    return deny(
      tool,
      normalized,
      `write refused by ${phase} scope: '${refused}' matches no caller-supplied write glob`,
    );
  }
  return { allow: true, tool, paths: normalized };
}

async function readStdin() {
  let text = "";
  for await (const chunk of process.stdin) text += chunk;
  return text;
}

async function main() {
  let policy;
  let event;
  try {
    const encoded = process.env.STORYTREE_CODEX_HOOK_POLICY;
    if (typeof encoded !== "string" || encoded.length === 0) {
      throw new Error("missing hook policy");
    }
    policy = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
    event = JSON.parse(await readStdin());
  } catch (error) {
    const reason = `Codex scope hook refused malformed input: ${error.message}`;
    process.stderr.write(`${reason}\n`);
    process.exitCode = 2;
    return;
  }

  const decision = decideCodexToolUse({ ...policy, event });
  if (decision.allow) return;
  const violation = {
    phase: policy.phase,
    tool: decision.tool,
    path: decision.paths.join(", ") || "(no path)",
    reason: decision.reason,
  };
  const report = process.env.STORYTREE_CODEX_HOOK_REPORT;
  if (typeof report === "string" && report.length > 0) {
    try {
      fs.appendFileSync(report, `${JSON.stringify(violation)}\n`, "utf8");
    } catch {
      // Reporting is additive. The exit status remains the fail-closed enforcement signal.
    }
  }
  process.stderr.write(`${decision.reason}\n`);
  process.exitCode = 2;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
