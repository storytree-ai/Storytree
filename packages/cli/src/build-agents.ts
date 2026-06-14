// Render the delegatable library `agent` artifacts to `.claude/agents/<id>.md` (ADR-0052) — the
// harness-native subagent files, so a Claude Code session can DELEGATE to the authored story-writers
// (story-author, the curators, the investigators). Mirrors build-claude-md.ts: a generated VIEW of
// the library, drift-gated, so the subagents can never diverge from the agent artifacts by hand.
//
//   pnpm build:agents      (re)generate .claude/agents/*.md
//   pnpm check:agents      fail (exit 1) if any file is stale / missing / orphaned — the gate's guard
//
// Offline by construction (reads the seed corpus via loadCorpus), so it runs in the gate and CI with
// no DB. `.claude/agents/` is FULLY GENERATED: write prunes orphaned *.md. Edit the agent artifact
// (the live store / knowledge.json), not the generated file.

import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { InMemoryStore } from "@storytree/core";
import { loadCorpus } from "@storytree/store";

import { delegatableAgentIds, renderAgentFile } from "./agents.js";

/** Repo root: packages/cli/src/build-agents.ts → four dirs up (the build-claude-md.ts pattern). */
const repoRoot = path.resolve(fileURLToPath(import.meta.url), "..", "..", "..", "..");
const agentsDir = path.join(repoRoot, ".claude", "agents");

/** LF-space view so the drift compare ignores a Windows (CRLF) checkout — the claude-region.ts fix. */
const toLf = (s: string): string => s.replace(/\r\n/g, "\n");

function fail(message: string): never {
  console.error(`build:agents — ${message}`);
  process.exit(1);
}

async function main(): Promise<void> {
  const check = process.argv.includes("--check");

  const store = new InMemoryStore();
  await loadCorpus(store);
  const ids = await delegatableAgentIds(store);

  // <id>.md -> generated content; a dangling ref fails closed (never a silently-thinner subagent).
  const files = new Map<string, string>();
  for (const id of ids) {
    const res = await renderAgentFile(store, id);
    if (!res.ok) fail(`${res.reason} (agents: ${res.available.join(", ") || "none"})`);
    if (res.missingRefs.length > 0) {
      fail(`${id} has dangling refs: ${res.missingRefs.join(", ")} — fix the agent artifact.`);
    }
    files.set(`${id}.md`, res.content);
  }

  let existing: string[] = [];
  try {
    existing = (await fs.readdir(agentsDir)).filter((f) => f.endsWith(".md"));
  } catch {
    /* dir missing → no existing files */
  }
  const orphans = existing.filter((f) => !files.has(f));

  if (check) {
    const drift: string[] = [];
    for (const [name, content] of files) {
      let onDisk: string | null = null;
      try {
        onDisk = await fs.readFile(path.join(agentsDir, name), "utf8");
      } catch {
        onDisk = null;
      }
      if (onDisk === null) drift.push(`missing: ${name}`);
      else if (toLf(onDisk) !== toLf(content)) drift.push(`stale:   ${name}`);
    }
    for (const o of orphans) drift.push(`orphan:  ${o}`);
    if (drift.length > 0) {
      fail(
        ".claude/agents is STALE — the library agents changed. Regenerate with `pnpm build:agents` " +
          "and commit:\n  " + drift.join("\n  "),
      );
    }
    console.log(`check:agents — .claude/agents in sync (${files.size} agents).`);
    return;
  }

  await fs.mkdir(agentsDir, { recursive: true });
  for (const [name, content] of files) await fs.writeFile(path.join(agentsDir, name), content, "utf8");
  for (const o of orphans) await fs.rm(path.join(agentsDir, o));
  console.log(
    `build:agents — wrote ${files.size} agents → .claude/agents/` +
      (orphans.length > 0 ? ` (pruned ${orphans.length}: ${orphans.join(", ")})` : ""),
  );
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
