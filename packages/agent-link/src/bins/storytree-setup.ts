/**
 * `storytree-setup install | remove`: register storytree's hooks for Claude Code and Codex now,
 * outside any session, or take out exactly what storytree added (capability 8 · Setup check,
 * stories/agent-link.md). The hook registered is the `storytree-hook.mjs` built beside this script.
 * Claude Code's settings are CLAUDE_CONFIG_DIR's or ~/.claude's, Codex's CODEX_HOME's or ~/.codex's.
 */
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { defaultHomes, registerHooks, removeHooks } from "../setup/index.js";

const [command] = process.argv.slice(2);
const homes = defaultHomes();

if (command === "remove") {
  const removed = removeHooks(homes);
  console.log(`Claude Code: ${removed["claude-code"] === "removed" ? "storytree's hooks removed" : "no storytree hooks"}`);
  console.log(`Codex: ${removed.codex === "removed" ? "storytree's hooks removed" : "no storytree hooks"}`);
} else if (command === "install") {
  const script = fileURLToPath(new URL("./storytree-hook.mjs", import.meta.url));
  if (!existsSync(script)) {
    console.error(`no hook command beside this one (${script}): build storytree first`);
    process.exit(1);
  }
  const report = registerHooks(homes, { node: process.execPath, script });
  console.log(`Claude Code: ${report["claude-code"]}`);
  console.log(`Codex: ${report.codex}${report.codex === "registered" ? " (run `codex` in a terminal once and trust storytree's hooks when it asks)" : ""}`);
} else {
  console.error("usage: storytree-setup install | remove");
  process.exit(2);
}
