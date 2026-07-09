// Render the delegatable library `agent` artifacts to each harness-native subagent directory:
// `.claude/agents/<id>.md` (ADR-0052) and `.cursor/agents/<id>.md` (ADR-0178). Both are generated
// VIEWS of one Library population, drift-gated so neither harness can diverge by hand.
//
//   pnpm build:agents      (re)generate .claude/agents/*.md + .cursor/agents/*.md
//   pnpm check:agents      fail (exit 1) if any file is stale / missing / orphaned — the gate's guard
//
// Offline by construction (reads the seed corpus via loadCorpus), so it runs in the gate and CI with
// no DB. Both harness directories are FULLY GENERATED: write prunes orphaned *.md. Edit the agent
// artifact (the live store / knowledge.json), not a generated file.

import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { InMemoryStore } from "@storytree/storage-protocol";
import { loadCorpus } from "@storytree/library/store";

import {
  delegatableAgentIds,
  renderAgentFile,
  renderCursorAgentFile,
  essentialsGateViolations,
} from "@storytree/library/store";

/** Repo root: packages/cli/src/build-agents.ts → four dirs up (the build-claude-md.ts pattern). */
const repoRoot = path.resolve(fileURLToPath(import.meta.url), "..", "..", "..", "..");
const targets = [
  {
    label: ".claude/agents",
    dir: path.join(repoRoot, ".claude", "agents"),
    render: renderAgentFile,
  },
  {
    label: ".cursor/agents",
    dir: path.join(repoRoot, ".cursor", "agents"),
    render: renderCursorAgentFile,
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

  const store = new InMemoryStore();
  await loadCorpus(store);
  const ids = await delegatableAgentIds(store);

  const renderedTargets: Array<{
    label: string;
    dir: string;
    files: Map<string, string>;
    orphans: string[];
  }> = [];

  for (const target of targets) {
    // <id>.md -> generated content; a dangling ref fails closed (never a silently-thinner subagent).
    const files = new Map<string, string>();
    for (const id of ids) {
      const res = await target.render(store, id);
      if (!res.ok) fail(`${res.reason} (agents: ${res.available.join(", ") || "none"})`);
      if (res.missingRefs.length > 0) {
        fail(
          `${target.label}/${id}.md has dangling refs: ${res.missingRefs.join(", ")} — ` +
            "fix the agent artifact.",
        );
      }
      files.set(`${id}.md`, res.content);
    }

    let existing: string[] = [];
    try {
      existing = (await fs.readdir(target.dir)).filter((f) => f.endsWith(".md"));
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
    console.log(
      `check:agents — ${renderedTargets.map((target) => target.label).join(" + ")} in sync + ` +
        `essentials gate clean (${ids.length} agents × ${renderedTargets.length} harnesses).`,
    );
    return;
  }

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
