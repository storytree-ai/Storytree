// Shape CLAUDE.md and Codex AGENTS.md from the `session-orchestrator` Library agent (ADR-0051/0291).
// CLAUDE.md keeps its marked partial view; AGENTS.md is a whole-file generated view. The discipline
// has one source of truth and cannot drift between harnesses through a hand copy.
//
// It also emits a THIRD projection: `packages/cli/definitions.generated.json`, the ~12 KB
// definition table the `UserPromptSubmit` hook reads (ADR-0307 D4 — a generator may hold a store
// connection; a per-prompt hook may not, so it gets a committed projection instead). It rides this
// command rather than a gate rung of its own, so `check:guidance` covers all three and the gate
// gains no step — see definitions-projection.ts for why the hook cannot read the store directly.
//
//   pnpm build:guidance        regenerate all three projections in place
//   pnpm check:guidance        fail if any projection is stale (the gate's drift guard)
//   pnpm build/check:claude    compatibility aliases for the commands above
//
// Offline TODAY (reads the seed corpus via loadCorpus), so it runs in the gate and CI with no DB.
// ADR-0307 D1/D2 move that source to the live store when ADR-0302 D1 decommits the seed: the
// outputs stay committed files, only the source moves — which is why ADR-0302 D3 (a CI database
// credential) is a hard prerequisite of the decommit, since `check:guidance` runs in CI.
// Edit the agent artifact, not any generated projection.

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
import {
  DEFINITIONS_PROJECTION_BASENAME,
  buildDefinitionsProjection,
  renderDefinitionsProjection,
} from "./definitions-projection.js";

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
/**
 * Deliberately NOT under `repoRoot`: the definition table ships with the CLI (beside the hook that
 * reads it), because definitions are storytree's METHOD corpus rather than a description of the
 * project under inspection — the same call the studio makes anchoring `knowledge.json` to
 * `studioRoot` (ADR-0244 D3). A forest for another project still wants these injected.
 */
const definitionsPath = path.resolve(
  fileURLToPath(import.meta.url),
  "..",
  "..",
  DEFINITIONS_PROJECTION_BASENAME,
);

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
  // The hook's definition table (ADR-0307 D4). Same store, same sync/check/write shape as the two
  // prose projections — it is a generated view of the corpus like they are, just data.
  const definitions = syncGeneratedGuidance(
    await readIfExists(definitionsPath),
    renderDefinitionsProjection(buildDefinitionsProjection(await store.queryDocs({ kind: "definition" }))),
  );

  if (region.inSync && codex.inSync && definitions.inSync) {
    console.log(
      `build:guidance — CLAUDE.md region + AGENTS.md + ${DEFINITIONS_PROJECTION_BASENAME} in sync.`,
    );
    return;
  }
  if (check) {
    const drift = [
      ...(!region.inSync ? ["CLAUDE.md region is stale"] : []),
      ...(!codex.inSync ? ["AGENTS.md is missing or stale"] : []),
      ...(!definitions.inSync ? [`${DEFINITIONS_PROJECTION_BASENAME} is missing or stale`] : []),
    ];
    fail(`${drift.join("; ")} — regenerate with \`pnpm build:guidance\` and commit the projections.`);
  }
  if (!region.inSync) await fs.writeFile(claudePath, region.next, "utf8");
  if (!codex.inSync) await fs.writeFile(codexPath, codex.next, "utf8");
  if (!definitions.inSync) await fs.writeFile(definitionsPath, definitions.next, "utf8");
  console.log(
    `build:guidance — wrote ${[
      ...(!region.inSync ? ["CLAUDE.md region"] : []),
      ...(!codex.inSync ? ["AGENTS.md"] : []),
      ...(!definitions.inSync ? [DEFINITIONS_PROJECTION_BASENAME] : []),
    ].join(" + ")}.`,
  );
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
