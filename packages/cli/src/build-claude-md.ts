// Shape CLAUDE.md and Codex AGENTS.md from the `session-orchestrator` Library agent (ADR-0051/0291).
// CLAUDE.md keeps its marked partial view; AGENTS.md is a whole-file generated view. The discipline
// has one source of truth and cannot drift between harnesses through a hand copy.
//
//   pnpm build:guidance        regenerate both root projections in place
//   pnpm check:guidance        fail if either projection is stale (the gate's drift guard)
//   pnpm build/check:claude    compatibility aliases for the commands above
//
// Offline by construction (reads the seed corpus via loadCorpus), so it runs in the gate and CI
// with no DB. Edit the agent artifact (knowledge.json for the seed-canonical agent tier), not either
// generated projection.

import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { InMemoryStore } from "@storytree/storage-protocol";
import { REPO_ROOT_ENV, resolveRepoRoot } from "@storytree/library";
import { loadCorpus } from "@storytree/library/store";

import { renderAgentDigest } from "@storytree/library/store";
import {
  renderCodexGuidance,
  syncClaudeRegion,
  syncGeneratedGuidance,
} from "./claude-region.js";

const AGENT = "session-orchestrator";

/**
 * The repo root — a PARAMETER (ADR-0246), not a derivation. `STORYTREE_REPO_ROOT` points the
 * root-guidance renderer at another project's checkout; unset, it derives from this file's location
 * (packages/cli/src/build-claude-md.ts → four dirs up, the commands.ts repoRoot pattern).
 */
const repoRoot = resolveRepoRoot({
  env: process.env[REPO_ROOT_ENV],
  derived: path.resolve(fileURLToPath(import.meta.url), "..", "..", "..", ".."),
}).root;
const claudePath = path.join(repoRoot, "CLAUDE.md");
const codexPath = path.join(repoRoot, "AGENTS.md");

function fail(message: string): never {
  console.error(`build:guidance — ${message}`);
  process.exit(1);
}

async function readIfExists(file: string): Promise<string | null> {
  try {
    return await fs.readFile(file, "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw err;
  }
}

async function main(): Promise<void> {
  const check = process.argv.includes("--check");

  const store = new InMemoryStore();
  await loadCorpus(store);
  const res = await renderAgentDigest(store, AGENT);
  if (!res.ok) fail(`${res.reason} (agents: ${res.available.join(", ") || "none"})`);
  if (res.agent.missingRefs.length > 0) {
    fail(`${AGENT} has dangling refs: ${res.agent.missingRefs.join(", ")} — fix the agent artifact.`);
  }

  const rawMd = await fs.readFile(claudePath, "utf8");
  // EOL-robust splice + compare (claude-region.ts): work in LF space, re-apply the file's EOL on
  // write. A naive `next === md` went spuriously STALE on Windows (CRLF checkout) — see the module.
  const region = syncClaudeRegion(rawMd, AGENT, res.agent.digest);
  if (!region.ok) fail(region.error);
  const codex = syncGeneratedGuidance(
    await readIfExists(codexPath),
    renderCodexGuidance(AGENT, res.agent.digest),
  );

  if (region.inSync && codex.inSync) {
    console.log("build:guidance — CLAUDE.md region + AGENTS.md in sync.");
    return;
  }
  if (check) {
    const drift = [
      ...(!region.inSync ? ["CLAUDE.md region is stale"] : []),
      ...(!codex.inSync ? ["AGENTS.md is missing or stale"] : []),
    ];
    fail(`${drift.join("; ")} — regenerate with \`pnpm build:guidance\` and commit both projections.`);
  }
  if (!region.inSync) await fs.writeFile(claudePath, region.next, "utf8");
  if (!codex.inSync) await fs.writeFile(codexPath, codex.next, "utf8");
  console.log(
    `build:guidance — wrote ${[
      ...(!region.inSync ? ["CLAUDE.md region"] : []),
      ...(!codex.inSync ? ["AGENTS.md"] : []),
    ].join(" + ")}.`,
  );
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
