/**
 * Registering storytree's hooks in each harness's own user-level settings, and taking them out
 * again: only ever storytree's entries, recognised by the hook script they run
 * (`storytree-hook.mjs`), so every other setting is left exactly as it was.
 *
 * - Claude Code: `<config folder>/settings.json` (CLAUDE_CONFIG_DIR, else ~/.claude). Each hook is a
 *   program with arguments, run with no shell in between, so it works on Windows without a Unix
 *   shell. The start and edit hooks run in the background (`async`); the end hook runs before
 *   Claude Code exits, and the hook before storytree's own tools before the call is made, so its
 *   line is there when the call reaches the tool server (ADR-0629 D2).
 * - Codex: `<CODEX_HOME>/hooks.json` (else ~/.codex). Codex runs a hook as one command line through
 *   its shell (PowerShell on Windows, sh elsewhere), so the line is written for the shell of this
 *   machine. Codex runs a newly added hook only after the user approves it once (ADR-0626 D4).
 */
import { existsSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { isDeepStrictEqual } from "node:util";

import { STORYTREE_TOOLS } from "../hooks/index.js";

/** The command a harness runs as storytree's hook: a Node and the built hook script. */
export interface HookCommand {
  readonly node: string;
  readonly script: string;
}

/** Where each harness keeps its settings: Claude Code's config folder (~/.claude) and Codex's home (~/.codex). */
export interface Homes {
  readonly claude?: string;
  readonly codex?: string;
}

/** What registering found: storytree's hooks added now, already there, or no such harness on this machine. */
export type HookRegistration = "registered" | "already registered" | "not here";

export interface HooksReport {
  readonly "claude-code": HookRegistration;
  readonly codex: HookRegistration;
}

export interface RemovalReport {
  readonly "claude-code": "removed" | "none";
  readonly codex: "removed" | "none";
}

/** The hook script's file name: what marks a hook entry as storytree's. */
const SCRIPT_NAME = "storytree-hook.mjs";

interface HookEntry {
  matcher?: string;
  hooks?: Record<string, unknown>[];
}

type Settings = Record<string, unknown> & { hooks?: Record<string, HookEntry[]> };

/** The harnesses' homes on this machine: CLAUDE_CONFIG_DIR or ~/.claude, and CODEX_HOME or ~/.codex. */
export function defaultHomes(env: Readonly<Record<string, string | undefined>> = process.env): Required<Homes> {
  return {
    claude: env.CLAUDE_CONFIG_DIR || path.join(homedir(), ".claude"),
    codex: env.CODEX_HOME || path.join(homedir(), ".codex"),
  };
}

/** Register storytree's hooks for each harness whose home is here, replacing any older registration of them. */
export function registerHooks(homes: Homes, hook: HookCommand): HooksReport {
  return {
    "claude-code": register(homes.claude, "settings.json", claudeEntries(hook)),
    codex: register(homes.codex, "hooks.json", codexEntries(hook)),
  };
}

/** Take storytree's hooks out of each harness's settings, leaving everything else as it was. */
export function removeHooks(homes: Homes): RemovalReport {
  return {
    "claude-code": remove(homes.claude, "settings.json"),
    codex: remove(homes.codex, "hooks.json"),
  };
}

/** Claude Code's entries: the hook script run with arguments, no shell. */
function claudeEntries({ node, script }: HookCommand): Record<string, HookEntry> {
  const run = (background: boolean) => ({ type: "command", command: node, args: [script, "claude-code"], ...(background ? { async: true } : {}) });
  return {
    SessionStart: { hooks: [run(true)] },
    PreToolUse: { matcher: `${STORYTREE_TOOLS}.*`, hooks: [run(false)] },
    PostToolUse: { matcher: "Write|Edit|MultiEdit|NotebookEdit|Bash|Agent|Task", hooks: [run(true)] },
    SessionEnd: { hooks: [run(false)] },
  };
}

/** Codex's entries: one command line for this machine's shell. */
function codexEntries({ node, script }: HookCommand): Record<string, HookEntry> {
  const line =
    process.platform === "win32"
      ? `& ${powerShellQuoted(node)} ${powerShellQuoted(script)} codex`
      : `${shQuoted(node)} ${shQuoted(script)} codex`;
  const run = (timeout: number) => ({ type: "command", command: line, timeout });
  return {
    SessionStart: { hooks: [run(10)] },
    PreToolUse: { matcher: `^${STORYTREE_TOOLS}`, hooks: [run(10)] },
    PostToolUse: { matcher: "^(apply_patch|Bash|spawn_agent)$", hooks: [run(10)] },
    SessionEnd: { hooks: [run(3)] },
  };
}

function register(home: string | undefined, file: string, entries: Record<string, HookEntry>): HookRegistration {
  if (home === undefined || !isFolder(home)) return "not here";
  const settingsFile = path.join(home, file);
  const settings = readSettings(settingsFile);
  const hooks = { ...(settings.hooks ?? {}) };
  let changed = false;
  for (const [event, wanted] of Object.entries(entries)) {
    const current = hooks[event] ?? [];
    const ours = current.filter(isStorytrees);
    if (ours.length === 1 && isDeepStrictEqual(ours[0], wanted)) continue;
    hooks[event] = [...current.filter((entry) => !isStorytrees(entry)), wanted];
    changed = true;
  }
  if (!changed) return "already registered";
  writeSettings(settingsFile, { ...settings, hooks });
  return "registered";
}

function remove(home: string | undefined, file: string): "removed" | "none" {
  if (home === undefined) return "none";
  const settingsFile = path.join(home, file);
  if (!existsSync(settingsFile)) return "none";
  const settings = readSettings(settingsFile);
  const hooks: Record<string, HookEntry[]> = {};
  let removed = false;
  for (const [event, entries] of Object.entries(settings.hooks ?? {})) {
    const kept = entries.filter((entry) => !isStorytrees(entry));
    if (kept.length !== entries.length) removed = true;
    if (kept.length > 0) hooks[event] = kept;
  }
  if (!removed) return "none";
  const { hooks: _hooks, ...rest } = settings;
  const left: Settings = Object.keys(hooks).length === 0 ? rest : { ...settings, hooks };
  // A hooks file with nothing left in it was storytree's alone: it goes with them.
  if (file === "hooks.json" && Object.keys(hooks).length === 0 && Object.keys(rest).length === 0) rmSync(settingsFile);
  else writeSettings(settingsFile, left);
  return "removed";
}

/** Whether a hook entry runs storytree's hook script. */
function isStorytrees(entry: HookEntry): boolean {
  return (entry.hooks ?? []).some((hook) =>
    [hook.command, ...(Array.isArray(hook.args) ? hook.args : [])].some((part) => typeof part === "string" && part.includes(SCRIPT_NAME)),
  );
}

function readSettings(file: string): Settings {
  if (!existsSync(file)) return {};
  const text = readFileSync(file, "utf8");
  if (text.trim() === "") return {};
  return JSON.parse(text) as Settings;
}

function writeSettings(file: string, settings: Settings): void {
  writeFileSync(file, `${JSON.stringify(settings, null, 2)}\n`);
}

function isFolder(folder: string): boolean {
  try {
    return statSync(folder).isDirectory();
  } catch {
    return false;
  }
}

function powerShellQuoted(text: string): string {
  return `'${text.replaceAll("'", "''")}'`;
}

function shQuoted(text: string): string {
  return `'${text.replaceAll("'", "'\\''")}'`;
}
