import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { type AdrMeta, loadAdrMetas } from "@storytree/drive";
import { InMemoryStore } from "@storytree/storage-protocol";
import { loadCorpus } from "@storytree/library/store";

import {
  adrHealth,
  adrGateFailures,
  extractPathTokens,
  loadRetiredInPartEdges,
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
    amends: [],
    loadBearing: false,
    ...edges,
  };
}

function inputs(partial: Partial<AdrHealthInputs>): AdrHealthInputs {
  return {
    adrs: [],
    parseErrors: [],
    retiredInPartEdges: [],
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
  const bad = adrHealth(inputs({ adrs: [adr(2, "accepted", { amends: [99] })] }));
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

test("load-bearing-live: a load_bearing ADR must be accepted (proposed/superseded FAIL)", () => {
  // accepted + load_bearing -> PASS
  const ok = adrHealth(inputs({ adrs: [adr(19, "accepted", { loadBearing: true })] }));
  assert.equal(levelOf(ok, "load-bearing-live"), "PASS");
  // proposed + load_bearing -> FAIL (and it gates)
  const tooEarly = adrHealth(inputs({ adrs: [adr(86, "proposed", { loadBearing: true })] }));
  assert.equal(levelOf(tooEarly, "load-bearing-live"), "FAIL");
  assert.ok(adrGateFailures(tooEarly).some((r) => r.name === "load-bearing-live"));
  // superseded + load_bearing -> FAIL (a dead ADR can't be current-state)
  const dead = adrHealth(
    inputs({ adrs: [adr(14, "superseded", { loadBearing: true }), adr(27, "accepted", { supersedes: [14] })] }),
  );
  assert.equal(levelOf(dead, "load-bearing-live"), "FAIL");
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

test("supersedes-in-part-retired: a retired supersedes_in_part edge now FAILs and GATES (ADR-0139 endgame)", () => {
  // 0 retired edges detected -> PASS (the post-consolidation steady state)
  const clean = adrHealth(inputs({ retiredInPartEdges: [] }));
  assert.equal(levelOf(clean, "supersedes-in-part-retired"), "PASS");
  // a file still carrying the retired edge (raw-scanned + pre-computed by loadRetiredInPartEdges) ->
  // FAIL, and — unlike the WARN-first transition state — it now GATES the merge.
  const dirty = adrHealth(
    inputs({
      retiredInPartEdges: [
        "ADR-0010 (0010-x.md) carries a retired `supersedes_in_part` frontmatter edge — correct the target in place or fully supersede it (ADR-0139).",
      ],
    }),
  );
  assert.equal(levelOf(dirty, "supersedes-in-part-retired"), "FAIL");
  assert.ok(
    adrGateFailures(dirty).some((r) => r.name === "supersedes-in-part-retired"),
    "a retired supersedes_in_part edge now gates the merge (ADR-0139)",
  );
  // the pre-computed line names the offending file so the fix is obvious
  const line = dirty.find((r) => r.name === "supersedes-in-part-retired")?.lines.join(" ") ?? "";
  assert.match(line, /ADR-0010/);
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
  const retiredInPartEdges = loadRetiredInPartEdges(path.join(REPO_ROOT, "docs", "decisions"));
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
    retiredInPartEdges,
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
  // ADR-0139 endgame: the accepted set carries NO retired supersedes_in_part edge (0, on the real repo).
  assert.deepEqual(retiredInPartEdges, [], "no ADR frontmatter carries the retired supersedes_in_part edge");
});

// --- (c) loadRetiredInPartEdges (the raw frontmatter scan behind the gate) ----------------------

test("loadRetiredInPartEdges: detects the retired key in FRONTMATTER only, not body prose (ADR-0139)", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "adr-retired-"));
  try {
    // FRONTMATTER carries the retired edge -> one FAIL line naming the file + the ADR-0139 fix
    writeFileSync(
      path.join(dir, "0011-own-the-loop.md"),
      "---\nstatus: accepted\nsupersedes_in_part: [5]\n---\n# ADR-0011\n",
    );
    // clean frontmatter, even though the BODY mentions the retired term in prose -> not flagged
    writeFileSync(
      path.join(dir, "0019-library-tier.md"),
      "---\nstatus: accepted\namends: [11]\n---\n# ADR-0019\nNote: supersedes_in_part was retired by ADR-0139.\n",
    );
    // a non-ADR filename is ignored entirely
    writeFileSync(path.join(dir, "README.md"), "supersedes_in_part: [1]\n");

    const hits = loadRetiredInPartEdges(dir);
    assert.equal(hits.length, 1, "only the frontmatter carrier is flagged (body prose + non-ADR files ignored)");
    assert.match(hits[0] ?? "", /ADR-0011/);
    assert.match(hits[0] ?? "", /ADR-0139/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
