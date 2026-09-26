/**
 * `storytree-hook <harness>`: the command Claude Code (`claude-code`) and Codex (`codex`) run by
 * themselves at session start, after each file edit and shell command, and at session end, with
 * the hook's input on stdin (capability 3 · Hooks, stories/agent-link.md).
 */
import { runHook } from "../hooks/index.js";

let input = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk: string) => (input += chunk));
process.stdin.on("end", () => {
  void runHook({ argv: process.argv.slice(2), input }).then(() => process.exit(0));
});
