import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import type { AdrMeta } from "./adr-frontmatter.js";
import { InMemoryStore } from "@storytree/base";
import { loadCorpus } from "@storytree/store";

import {
  adrHealth,
  adrGateFailures,
  extractPathTokens,
  loadAdrMetas,
  loadStoryDecisions,
  type AdrHealthInputs,
  type GuardrailView,
  type StoryDecisionsView,
} from "./adr-health.js";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

function adr(number: number, status: AdrMeta["status"], edges?: Partial<AdrMeta>): AdrMeta {
  return {
    number,
    file: `${String(number).padStart(4, "0")}-x.md`,
    status,
    supersedes: [],
    supersedesInPart: [],
    amends: [],
    ...edges,
  };
}

function inputs(partial: Partial<AdrHealthInputs>): AdrHealthInputs {
  return {
    adrs: [],
    parseErrors: [],
    stories: [],
    guardrails: [],
    pathExists: () => true,
    ...partial,
  };
}

function levelOf(results: ReturnType<typeof adrHealth>, name: string): string | undefined {
  return results.find((r) => r.name === name)?.level;
}

// --- (a) pure-check tests ------------------------------------------------------------------------

test("adr-frontmatter: parse errors FAIL, a clean load PASSes", () => {
  assert.equal(levelOf(adrHealth(inputs({})), "adr-frontmatter"), "PASS");
  assert.equal(
    levelOf(adrHealth(inputs({ parseErrors: ["0099-x.md: no frontmatter block"] })), "adr-frontmatter"),
    "FAIL",
  );
});

test("adr-number-unique: two files sharing a number FAIL (the parallel-authoring collision)", () => {
  // distinct numbers -> PASS
  const clean = adrHealth(inputs({ adrs: [adr(48, "proposed"), adr(49, "proposed")] }));
  assert.equal(levelOf(clean, "adr-number-unique"), "PASS");
  // two files both numbered 0048 -> FAIL, and it is a GATE failure
  const dupA: AdrMeta = { ...adr(48, "proposed"), file: "0048-hosted-db-wake.md" };
  const dupB: AdrMeta = { ...adr(48, "proposed"), file: "0048-in-flight-wisp.md" };
  const collide = adrHealth(inputs({ adrs: [dupA, dupB, adr(49, "proposed")] }));
  assert.equal(levelOf(collide, "adr-number-unique"), "FAIL");
  assert.ok(
    adrGateFailures(collide).some((r) => r.name === "adr-number-unique"),
    "a duplicate ADR number gates the merge",
  );
  // the message names both colliding files so the fix is obvious
  const line = collide.find((r) => r.name === "adr-number-unique")?.lines.join(" ") ?? "";
  assert.match(line, /0048-hosted-db-wake\.md/);
  assert.match(line, /0048-in-flight-wisp\.md/);
});

test("adr-edge-integrity: a dangling edge target FAILs", () => {
  const ok = adrHealth(inputs({ adrs: [adr(1, "accepted"), adr(2, "accepted", { amends: [1] })] }));
  assert.equal(levelOf(ok, "adr-edge-integrity"), "PASS");
  const bad = adrHealth(inputs({ adrs: [adr(2, "accepted", { supersedesInPart: [99] })] }));
  assert.equal(levelOf(bad, "adr-edge-integrity"), "FAIL");
});

test("supersede-consistency: both directions enforced", () => {
  // X supersedes Y but Y not flipped -> FAIL
  const halfDone = adrHealth(
    inputs({ adrs: [adr(14, "proposed"), adr(27, "accepted", { supersedes: [14] })] }),
  );
  assert.equal(levelOf(halfDone, "supersede-consistency"), "FAIL");
  // Y superseded with no incoming edge -> FAIL
  const orphan = adrHealth(inputs({ adrs: [adr(14, "superseded")] }));
  assert.equal(levelOf(orphan, "supersede-consistency"), "FAIL");
  // the pair recorded properly -> PASS
  const clean = adrHealth(
    inputs({ adrs: [adr(14, "superseded"), adr(27, "accepted", { supersedes: [14] })] }),
  );
  assert.equal(levelOf(clean, "supersede-consistency"), "PASS");
});

test("story-decisions: dangling or superseded deciding ADRs FAIL", () => {
  const story = (decisions: number[]): StoryDecisionsView => ({ id: "s", status: "proposed", decisions });
  const adrs = [adr(14, "superseded"), adr(27, "accepted", { supersedes: [14] })];
  assert.equal(levelOf(adrHealth(inputs({ adrs, stories: [story([27])] })), "story-decisions"), "PASS");
  assert.equal(levelOf(adrHealth(inputs({ adrs, stories: [story([99])] })), "story-decisions"), "FAIL");
  assert.equal(levelOf(adrHealth(inputs({ adrs, stories: [story([14])] })), "story-decisions"), "FAIL");
});

test("green-flip: a healthy story on a proposed ADR FAILs; non-healthy stories never fire", () => {
  const adrs = [adr(33, "proposed")];
  const healthy: StoryDecisionsView = { id: "s", status: "healthy", decisions: [33] };
  const building: StoryDecisionsView = { id: "s", status: "building", decisions: [33] };
  assert.equal(levelOf(adrHealth(inputs({ adrs, stories: [healthy] })), "green-flip"), "FAIL");
  assert.equal(levelOf(adrHealth(inputs({ adrs, stories: [building] })), "green-flip"), "PASS");
});

test("enforced-by-anchors: a dangling path token WARNs (never FAILs)", () => {
  const guardrail: GuardrailView = {
    id: "g",
    enforcedBy: "A rule: `packages/agent` may import, see `packages/gone/file.ts:1-9`.",
  };
  const results = adrHealth(
    inputs({ guardrails: [guardrail], pathExists: (p) => p === "packages/agent" }),
  );
  assert.equal(levelOf(results, "enforced-by-anchors"), "WARN");
  assert.deepEqual(adrGateFailures(results), [], "a WARN never gates");
});

test("extractPathTokens: backticked repo paths only, line suffixes dropped", () => {
  const tokens = extractPathTokens(
    "see `packages/cli/src/health.ts:84-102` and `apps/studio` but not prose/paths or `claim-conflict-refused`",
  );
  assert.deepEqual(tokens, ["packages/cli/src/health.ts", "apps/studio"]);
});

// --- (b) the REAL-repo gate (this is the ADR-0022 enforcement surface) --------------------------

test("REPO gate: every ADR parses, edges and story decisions hold, no green-flip drift", async () => {
  const { adrs, parseErrors } = loadAdrMetas(path.join(REPO_ROOT, "docs", "decisions"));
  assert.ok(adrs.length >= 37, `expected the full ADR corpus, parsed ${adrs.length}`);
  const stories = loadStoryDecisions(path.join(REPO_ROOT, "stories"));
  assert.ok(stories.length >= 5, `expected the story seed, parsed ${stories.length}`);

  const store = new InMemoryStore();
  await loadCorpus(store);
  const docs = await store.queryDocs();
  const guardrails: GuardrailView[] = [];
  for (const d of docs) {
    if (d.kind !== "guardrail") continue;
    const body = d.doc as Record<string, unknown>;
    if (typeof body["enforcedBy"] === "string") {
      guardrails.push({ id: d.id, enforcedBy: body["enforcedBy"] });
    }
  }
  assert.ok(guardrails.length > 0, "expected guardrails in the seed corpus");

  const results = adrHealth({
    adrs,
    parseErrors,
    stories,
    guardrails,
    pathExists: (rel) => existsSync(path.join(REPO_ROOT, rel)),
  });
  assert.deepEqual(
    adrGateFailures(results).map((r) => `${r.name}: ${r.lines.join("; ")}`),
    [],
    "the decision-binding GATE-class checks must be clean on the real repo",
  );
  // enforced-by-anchors may WARN (prose names not-yet-built mechanisms) — log, never gate.
  const anchors = results.find((r) => r.name === "enforced-by-anchors");
  if (anchors !== undefined && anchors.level === "WARN") {
    console.log(`enforced-by-anchors WARN:\n  ${anchors.lines.join("\n  ")}`);
  }
});
