// Render the delegatable library `agent` artifacts to each harness-native subagent directory:
// `.claude/agents/<id>.md` (ADR-0052), `.cursor/agents/<id>.md` (ADR-0178),
// `.codex/agents/<id>.toml`, and `.gemini/agents/<id>.md`. All are generated
// VIEWS of one Library population, drift-gated so no harness can diverge by hand.
//
//   pnpm build:agents      (re)generate every harness agent view
//   pnpm check:agents      fail (exit 1) if any file is stale / missing / orphaned — the gate's guard
//
// READS THE LIVE STORE (ADR-0302 D1 / ADR-0307 D1+D2) — the `agent` tier is live-canonical, so the
// source is the store a session edits with `library artifact edit <id> --pg`, and it needs a
// reachable store (locally `pnpm db:up`; in CI the ADR-0302 D3 credential). The OUTPUTS stay
// committed files exactly as ADR-0302 D5 requires; only the source moved. All harness directories
// are FULLY GENERATED: write prunes orphaned agent files. Edit the agent ARTIFACT, not a generated
// file.

import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { REPO_ROOT_ENV, resolveRepoRoot } from "@storytree/library";

import { openCorpusStore } from "@storytree/drive";

import {
  delegatableAgentIds,
  renderAgentFile,
  renderCursorAgentFile,
  renderCodexAgentFile,
  renderGeminiAgentFile,
  essentialsGateViolations,
} from "@storytree/library/store";

/**
 * The repo root — a PARAMETER (ADR-0246), not a derivation. `STORYTREE_REPO_ROOT` points the agent
 * renderer at another project's harness directories; unset, it derives from this file's location
 * (packages/cli/src/build-agents.ts → four dirs up, the build-claude-md.ts pattern).
 *
 * NOTE: the fallback used to be `process.cwd()` + two dirs up, which only agreed with the comment
 * above because both `pnpm build:agents` and `pnpm check:agents` run under
 * `pnpm --filter @storytree/cli exec` (cwd = packages/cli). Invoked from anywhere else it wrote the
 * generated agent views into the wrong tree. Module-relative is the honest fallback.
 */
const repoRoot = resolveRepoRoot({
  env: process.env[REPO_ROOT_ENV],
  derived: path.resolve(fileURLToPath(import.meta.url), "..", "..", "..", ".."),
}).root;
const targets = [
  {
    label: ".claude/agents",
    dir: path.join(repoRoot, ".claude", "agents"),
    extension: "md",
    render: renderAgentFile,
  },
  {
    label: ".cursor/agents",
    dir: path.join(repoRoot, ".cursor", "agents"),
    extension: "md",
    render: renderCursorAgentFile,
  },
  {
    label: ".codex/agents",
    dir: path.join(repoRoot, ".codex", "agents"),
    extension: "toml",
    render: renderCodexAgentFile,
  },
  {
    label: ".gemini/agents",
    dir: path.join(repoRoot, ".gemini", "agents"),
    extension: "md",
    render: renderGeminiAgentFile,
  },
] as const;

/** LF-space view so the drift compare ignores a Windows (CRLF) checkout — the claude-region.ts fix. */
const toLf = (s: string): string => s.replace(/\r\n/g, "\n");

function fail(message: string): never {
  console.error(`build:agents — ${message}`);
  process.exit(1);
}

async function main(): Promise<void> {
  const check = process.argv.includes("--check");

  // The store is held across the render loop AND the essentials gate below (which re-reads each
  // agent's cited artifacts), then closed at each normal exit. No try/finally: every failure path
  // here is `fail()`, which exits the process (taking the pool with it), and an unexpected throw
  // lands in main()'s catch and exits the same way.
  const corpus = await openCorpusStore("build:agents");
  const store = corpus.store;
  const ids = await delegatableAgentIds(store);

  const renderedTargets: Array<{
    label: string;
    dir: string;
    files: Map<string, string>;
    orphans: string[];
  }> = [];

  for (const target of targets) {
    // <id>.<native extension> -> content; a dangling ref fails closed (never silently thinner).
    const files = new Map<string, string>();
    for (const id of ids) {
      const res = await target.render(store, id);
      if (!res.ok) fail(`${res.reason} (agents: ${res.available.join(", ") || "none"})`);
      if (res.missingRefs.length > 0) {
        fail(
          `${target.label}/${id}.${target.extension} has dangling refs: ${res.missingRefs.join(", ")} — ` +
            "fix the agent artifact.",
        );
      }
      files.set(`${id}.${target.extension}`, res.content);
    }

    let existing: string[] = [];
    try {
      existing = (await fs.readdir(target.dir)).filter((f) => f.endsWith(".md") || f.endsWith(".toml"));
    } catch {
      /* dir missing → every expected file is reported missing in check mode */
    }
    renderedTargets.push({
      label: target.label,
      dir: target.dir,
      files,
      orphans: existing.filter((f) => !files.has(f)),
    });
  }

  if (check) {
    const drift: string[] = [];
    for (const target of renderedTargets) {
      for (const [name, content] of target.files) {
        let onDisk: string | null = null;
        try {
          onDisk = await fs.readFile(path.join(target.dir, name), "utf8");
        } catch {
          onDisk = null;
        }
        if (onDisk === null) drift.push(`missing: ${target.label}/${name}`);
        else if (toLf(onDisk) !== toLf(content)) drift.push(`stale:   ${target.label}/${name}`);
      }
      for (const orphan of target.orphans) drift.push(`orphan:  ${target.label}/${orphan}`);
    }
    if (drift.length > 0) {
      fail(
        "harness agent views are STALE — the library agents changed. Regenerate with `pnpm build:agents` " +
          "and commit:\n  " + drift.join("\n  "),
      );
    }

    // The essentials size/structure + step→refs integrity gate (ADR-0156 §5 / ADR-0161 decision 5):
    // the fence that keeps the thinned prompts from silently re-bloating back toward full-inline.
    const gateFailures: string[] = [];
    for (const target of renderedTargets) {
      for (const id of ids) {
        const content = target.files.get(`${id}.md`);
        if (content === undefined) continue; // a missing render is the drift check's business, above
        const failures = await essentialsGateViolations(store, id, content);
        gateFailures.push(...failures.map((failure) => `${target.label}: ${failure}`));
      }
    }
    if (gateFailures.length > 0) {
      fail(
        "essentials gate FAILED (ADR-0156 §5 / ADR-0161) — a rendered agent broke a size/structure/" +
          "integrity invariant:\n  " + gateFailures.join("\n  "),
      );
    }
    await corpus.close();
    console.log(
      `check:agents — ${renderedTargets.map((target) => target.label).join(" + ")} in sync + ` +
        `essentials gate clean (${ids.length} agents × ${renderedTargets.length} harnesses).`,
    );
    return;
  }
  await corpus.close();

  for (const target of renderedTargets) {
    await fs.mkdir(target.dir, { recursive: true });
    for (const [name, content] of target.files) {
      await fs.writeFile(path.join(target.dir, name), content, "utf8");
    }
    for (const orphan of target.orphans) await fs.rm(path.join(target.dir, orphan));
  }
  const pruned = renderedTargets.flatMap((target) =>
    target.orphans.map((orphan) => `${target.label}/${orphan}`),
  );
  console.log(
    `build:agents — wrote ${ids.length} agents × ${renderedTargets.length} harnesses → ` +
      renderedTargets.map((target) => `${target.label}/`).join(" + ") +
      (pruned.length > 0 ? ` (pruned ${pruned.length}: ${pruned.join(", ")})` : ""),
  );
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
