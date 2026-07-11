import test from "node:test";
import assert from "node:assert/strict";

import { InMemoryStore } from "@storytree/storage-protocol";

import { extractPlanPaths, planCommand, type PlanCheckDeps } from "./plan.js";

// The consumption-time freshness check (ADR-0183 D2): git-log the paths the plan names since its
// anchor; drift past threshold means re-plan, not repair. The git seam is injected, so the whole
// verdict surface is provable offline — the source-drift move applied to intentions.

function planDoc(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    kind: "plan",
    id: "p1",
    title: "t",
    description: "d",
    objective: "Deliver the thing.",
    decomposition:
      "1. `packages/library/src/knowledge.ts` schema unit (`--real` red→green).\n" +
      "2. glue in `packages/cli/src` (ADR-0158).",
    lanes: "lane A fences `apps/studio/src`; run `storytree arc show map-arc --pg` to orient.",
    arcRef: "asset:map-arc",
    anchor: { sha: "abcdef1234567", date: "2026-07-10" },
    status: "ready",
    references: [],
    createdAt: "2026-07-10",
    updatedAt: "2026-07-10",
    ...overrides,
  };
}

async function seeded(overrides: Record<string, unknown> = {}): Promise<InMemoryStore> {
  const store = new InMemoryStore();
  await store.upsertDoc({ id: "p1", kind: "plan", doc: planDoc(overrides) });
  return store;
}

function depsFor(store: InMemoryStore, counts: Record<string, number>, pg = true): PlanCheckDeps {
  return {
    store,
    pg,
    countCommits: (sha, p) => {
      assert.equal(sha, "abcdef1234567"); // the check always logs since the plan's own anchor
      return counts[p] ?? 0;
    },
  };
}

test("extractPlanPaths pulls backtick path tokens and rejects flags/commands/URLs/prose", () => {
  const paths = extractPlanPaths(planDoc());
  assert.deepEqual(paths, ["packages/library/src/knowledge.ts", "packages/cli/src", "apps/studio/src"]);
  // Not paths: flags, backtick commands with spaces, URLs, single words.
  const junk = extractPlanPaths(
    planDoc({
      decomposition:
        "run `--real` then `pnpm gate`; see `https://x.test/a`, `knowledge.ts` alone, the `/api/library/graph` route, " +
        "the `#/library` hash route, the `@dagrejs/dagre` dep, and `stories/<id>/story.md` placeholders",
      lanes: undefined,
    }),
  );
  assert.deepEqual(junk, []);
});

test("plan check is FRESH when no named path moved since the anchor", async () => {
  const res = await planCommand("check", "p1", {}, depsFor(await seeded(), {}));
  assert.equal(res.ok, true);
  assert.match(res.body, /FRESH — no named path moved/);
  assert.match(res.body, /consume it: take lanes/);
});

test("plan check is DRIFTED past the threshold → re-plan, not repair", async () => {
  const counts = { "packages/library/src/knowledge.ts": 3, "apps/studio/src": 1 };
  const res = await planCommand("check", "p1", {}, depsFor(await seeded(), counts));
  assert.equal(res.ok, true);
  assert.match(res.body, /DRIFTED — 4 commit\(s\) touched 2 of 3 named path\(s\)/);
  assert.match(res.body, /re-plan, not repair/);
  assert.ok((res.next ?? []).some((n) => n.includes("storytree agents planner")));

  // A --threshold above the movement tolerates it (the caller opts into slack explicitly).
  const tolerated = await planCommand("check", "p1", { threshold: "4" }, depsFor(await seeded(), counts));
  assert.match(tolerated.body, /FRESH/);
});

test("plan check refuses to bless a spent plan even when fresh (consumed once, ADR-0183 D2)", async () => {
  const res = await planCommand("check", "p1", {}, depsFor(await seeded({ status: "consumed" }), {}));
  assert.equal(res.ok, true);
  assert.match(res.body, /status is consumed — a consumed plan is never \(re-\)consumed; re-plan/);
});

test("plan check is honest about a plan that names no paths (vacuous, not green)", async () => {
  const store = await seeded({
    objective: "o",
    decomposition: "one unit, no fence hints",
    lanes: undefined,
  });
  const res = await planCommand("check", "p1", {}, depsFor(store, {}));
  assert.equal(res.ok, true);
  assert.match(res.body, /names NO paths/);
  assert.match(res.body, /VACUOUS, not green/);
});

test("plan check fails honestly on a missing anchor, an unknown id, a wrong kind, and a bad sha", async () => {
  const unanchored = await planCommand("check", "p1", {}, depsFor(await seeded({ anchor: undefined }), {}));
  assert.equal(unanchored.ok, false);
  assert.match(unanchored.body, /no anchor\.sha/);

  const store = new InMemoryStore();
  const missing = await planCommand("check", "nope", {}, { store, pg: false, countCommits: () => 0 });
  assert.equal(missing.ok, false);
  assert.match(missing.body, /plans are live-ONLY/);

  await store.upsertDoc({ id: "a-def", kind: "definition", doc: { kind: "definition", id: "a-def" } });
  const wrongKind = await planCommand("check", "a-def", {}, { store, pg: true, countCommits: () => 0 });
  assert.equal(wrongKind.ok, false);
  assert.match(wrongKind.body, /is a definition, not a plan/);

  const badSha = await planCommand("check", "p1", {}, {
    store: await seeded(),
    pg: true,
    countCommits: () => {
      throw new Error("unknown revision abcdef1234567");
    },
  });
  assert.equal(badSha.ok, false);
  assert.match(badSha.body, /is the anchor commit in this checkout\?/);
});

test("plan help and unknown-sub are envelopes", async () => {
  const help = await planCommand(undefined, undefined, {}, { store: new InMemoryStore(), pg: false, countCommits: () => 0 });
  assert.equal(help.ok, true);
  assert.match(help.body, /freshness check/);
  const unknown = await planCommand("frob", undefined, {}, { store: new InMemoryStore(), pg: false, countCommits: () => 0 });
  assert.equal(unknown.ok, false);
});
