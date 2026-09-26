/**
 * Whether a session's hooks are proven to fire (ADR-0625 D9, ADR-0626 D5): the connection shows as
 * verified only once storytree has received all three from that session, a session start, a file
 * edit and a command, each written by a hook. Until then each missing one is named, with its fix.
 */
import type { Line } from "../activity/index.js";

/** The three hooks a session's setup is verified by, in the order they fire. */
export const HOOK_TESTS = ["session start", "file edit", "command"] as const;
export type HookTest = (typeof HOOK_TESTS)[number];

/** A fix the agent can act on: each has a sentence of its own in check_setup's answer. */
export type Fix = "new-session" | "codex-approval" | "edit-check-file" | "run-check-command";

/** The file the agent writes to fire the edit hook, in the session's folder. */
export const CHECK_FILE = ".storytree-check";
/** The command the agent runs to fire the command hook. */
export const CHECK_COMMAND = "echo storytree-check";

const KIND_OF: Readonly<Record<HookTest, Line["kind"]>> = { "session start": "session-started", "file edit": "file-edited", command: "command-run" };

export interface Verification {
  verified: boolean;
  missing: HookTest[];
  fixes: Fix[];
}

/** Which of `session`'s hooks storytree has received, from `lines`, and the fix for each still missing. */
export function verifyHooks(lines: readonly Line[], session: string, harness: string | undefined): Verification {
  const fired = new Set(lines.filter((line) => line.session === session && line.source === "hook").map((line) => line.kind));
  const missing = HOOK_TESTS.filter((test) => !fired.has(KIND_OF[test]));
  const fixes: Fix[] = [];
  if (missing.includes("session start")) fixes.push(harness === "codex" ? "codex-approval" : "new-session");
  if (missing.includes("file edit")) fixes.push("edit-check-file");
  if (missing.includes("command")) fixes.push("run-check-command");
  return { verified: missing.length === 0, missing, fixes };
}

/** What each fix says to do. */
export const FIX_SENTENCES: Readonly<Record<Fix, string>> = {
  "new-session":
    "The session-start hook has not reached storytree: hooks registered during a session work from the next one, so once this session's work is done, start a new session and call check_setup again.",
  "codex-approval":
    "Codex runs storytree's hooks only once the user approves them: ask the user to run `codex` in a terminal and trust the storytree hooks when it asks (or use /hooks there), then start a new session.",
  "edit-check-file": `To fire the edit hook, write any text to the file ${CHECK_FILE} in this folder.`,
  "run-check-command": `To fire the command hook, run the command \`${CHECK_COMMAND}\`.`,
};
