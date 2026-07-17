// Shape CLAUDE.md's operating-discipline region from the `session-orchestrator` library agent
// (ADR-0051). The region between the AGENT markers is a GENERATED VIEW — like the `.claude/agents/*.md`
// files are generated from the agent artifacts — so the discipline an agent runs on has ONE source of
// truth (the library artifact) and can never drift from a hand-copy again.
//
//   pnpm build:claude          regenerate the region in place
//   pnpm check:claude          fail (exit 1) if the region is stale — the gate's drift guard
//
// Offline by construction (reads the seed corpus via loadCorpus), so it runs in the gate and CI
// with no DB. Edit the agent artifact (the live store / knowledge.json), not CLAUDE.md.

import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { InMemoryStore } from "@storytree/storage-protocol";
import { loadCorpus } from "@storytree/library/store";

import { renderAgentDigest } from "@storytree/library/store";
import { syncClaudeRegion } from "./claude-region.js";

const AGENT = "session-orchestrator";

/** Repo root: packages/cli/src/build-claude-md.ts → four dirs up (the commands.ts repoRoot pattern). */
const repoRoot = path.resolve(fileURLToPath(import.meta.url), "..", "..", "..", "..");
const claudePath = path.join(repoRoot, "CLAUDE.md");

function fail(message: string): never {
  console.error(`build:claude — ${message}`);
  process.exit(1);
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

  if (region.inSync) {
    console.log(`build:claude — CLAUDE.md ${AGENT} region in sync.`);
    return;
  }
  if (check) {
    fail("CLAUDE.md is STALE — the library agent changed. Regenerate with `pnpm build:claude` and commit.");
  }
  await fs.writeFile(claudePath, region.next, "utf8");
  console.log(`build:claude — wrote the ${AGENT} region into CLAUDE.md.`);
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
