/**
 * `storytree-hook <harness>`: the command Claude Code (`claude-code`) and Codex (`codex`) run by
 * themselves at session start, after each file edit, shell command and subagent start, before each
 * call to storytree's own tools, and at session end, with the hook's input on stdin (capability 3 ·
 * Hooks, stories/agent-link.md).
 *
 * It always exits 0 and never prints: whatever happens, the agent it runs beside is untouched. It
 * also never outlives DEADLINE_MS, whatever it is waiting on.
 */
import { runHook } from "../hooks/index.js";

/** The longest a hook may run, start to finish. Reaching storytree is given up well before this. */
const DEADLINE_MS = 5_000;

setTimeout(() => process.exit(0), DEADLINE_MS).unref();
process.on("uncaughtException", () => process.exit(0));
process.on("unhandledRejection", () => process.exit(0));

let input = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk: string) => (input += chunk));
process.stdin.on("error", () => process.exit(0));
process.stdin.on("end", () => {
  runHook({ argv: process.argv.slice(2), input }).then(
    () => process.exit(0),
    () => process.exit(0),
  );
});
