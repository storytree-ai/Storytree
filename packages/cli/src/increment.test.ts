import test from "node:test";
import assert from "node:assert/strict";

import { InMemoryStore } from "@storytree/storage-protocol";

import {
  arcIdOf,
  deliveredBySibling,
  extractIncrementPaths,
  incrementCommand,
  type IncrementCheckDeps,
} from "./increment.js";

// The consumption-time freshness check (ADR-0183 D2): git-log the paths the plan names since its
// anchor; drift past threshold means re-plan, not repair. The git seam is injected, so the whole
// verdict surface is provable offline — the source-drift move applied to intentions.

function incrementDoc(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    kind: "increment",
    id: "p1",
    title: "t",
    description: "d",
    objective: "Deliver the thing.",
    body:
      "1. `packages/library/src/knowledge.ts` schema unit (`--real` red→green).\n" +
      "2. glue in `packages/cli/src` (ADR-0158).\n\n" +
      "lane A fences `apps/studio/src`; run `storytree arc show map-arc --pg` to orient.",
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
  await store.upsertDoc({ id: "p1", kind: "increment", doc: incrementDoc(overrides) });
  return store;
}

function depsFor(store: InMemoryStore, counts: Record<string, number>, pg = true): IncrementCheckDeps {
  return {
    store,
    pg,
    countCommits: (sha, p) => {
      assert.equal(sha, "abcdef1234567"); // the check always logs since the plan's own anchor
      return counts[p] ?? 0;
    },
  };
}

test("extractIncrementPaths pulls backtick path tokens and rejects flags/commands/URLs/prose", () => {
  const paths = extractIncrementPaths(incrementDoc());
  assert.deepEqual(paths, ["packages/library/src/knowledge.ts", "packages/cli/src", "apps/studio/src"]);
  // Not paths: flags, backtick commands with spaces, URLs, single words.
  const junk = extractIncrementPaths(
    incrementDoc({
      body:
        "run `--real` then `pnpm gate`; see `https://x.test/a`, `knowledge.ts` alone, the `/api/library/graph` route, " +
        "the `#/library` hash route, the `@dagrejs/dagre` dep, and `stories/<id>/story.md` placeholders",
    }),
  );
  assert.deepEqual(junk, []);

  // The RETIRED headings are no longer mined (ADR-0305 D4 removed them from the schema, and
  // migration 4 folds a stored doc's prose into `body`). A doc still carrying them names no paths —
  // which is the honest answer, since such a doc cannot validate any more.
  assert.deepEqual(
    extractIncrementPaths({
      objective: "o",
      decomposition: "`packages/library/src/knowledge.ts`",
      lanes: "`apps/studio/src`",
      budgets: "`packages/cli/src`",
      traps: "`packages/drive/src`",
    }),
    [],
  );
});

test("increment check is FRESH when no named path moved since the anchor", async () => {
  const res = await incrementCommand("check", "p1", {}, depsFor(await seeded(), {}));
  assert.equal(res.ok, true);
  assert.match(res.body, /FRESH — no named path moved/);
  assert.match(res.body, /consume it: take lanes/);
});

test("increment check is DRIFTED past the threshold → re-plan, not repair", async () => {
  const counts = { "packages/library/src/knowledge.ts": 3, "apps/studio/src": 1 };
  const res = await incrementCommand("check", "p1", {}, depsFor(await seeded(), counts));
  assert.equal(res.ok, true);
  assert.match(res.body, /DRIFTED — 4 commit\(s\) touched 2 of 3 named path\(s\)/);
  assert.match(res.body, /re-plan, not repair/);
  assert.ok((res.next ?? []).some((n) => n.includes("storytree agents planner")));

  // A --threshold above the movement tolerates it (the caller opts into slack explicitly).
  const tolerated = await incrementCommand("check", "p1", { threshold: "4" }, depsFor(await seeded(), counts));
  assert.match(tolerated.body, /FRESH/);
});

test("increment check refuses to bless a spent increment even when fresh (executed once, ADR-0183 D2)", async () => {
  // `active` and `closed` are ADR-0305 D2's renames of `consumed` and of `superseded`/`retired`;
  // the write-lock they enforce is unchanged.
  for (const status of ["active", "closed"]) {
    const res = await incrementCommand("check", "p1", {}, depsFor(await seeded({ status }), {}));
    assert.equal(res.ok, true);
    assert.match(res.body, new RegExp(`status is ${status} — a ${status} increment is never re-executed; re-plan`));
  }
  // `ready` is consumable: the spent warning must NOT fire, or every fresh increment reads as re-planned.
  const ready = await incrementCommand("check", "p1", {}, depsFor(await seeded({ status: "ready" }), {}));
  assert.doesNotMatch(ready.body, /never re-executed/);
  assert.match(ready.body, /consume it: take lanes/);
});

test("increment check is honest about an increment that names no paths (vacuous, not green)", async () => {
  const store = await seeded({
    objective: "o",
    body: "one unit, no fence hints",
  });
  const res = await incrementCommand("check", "p1", {}, depsFor(store, {}));
  assert.equal(res.ok, true);
  assert.match(res.body, /names NO paths/);
  assert.match(res.body, /VACUOUS, not green/);
});

test("increment check fails honestly on a missing anchor, an unknown id, a wrong kind, and a bad sha", async () => {
  const unanchored = await incrementCommand("check", "p1", {}, depsFor(await seeded({ anchor: undefined }), {}));
  assert.equal(unanchored.ok, false);
  assert.match(unanchored.body, /no anchor\.sha/);

  const store = new InMemoryStore();
  const missing = await incrementCommand("check", "nope", {}, { store, pg: false, countCommits: () => 0 });
  assert.equal(missing.ok, false);
  assert.match(missing.body, /increments are live-ONLY/);

  await store.upsertDoc({ id: "a-def", kind: "definition", doc: { kind: "definition", id: "a-def" } });
  const wrongKind = await incrementCommand("check", "a-def", {}, { store, pg: true, countCommits: () => 0 });
  assert.equal(wrongKind.ok, false);
  assert.match(wrongKind.body, /is a definition, not an increment/);

  const badSha = await incrementCommand("check", "p1", {}, {
    store: await seeded(),
    pg: true,
    countCommits: () => {
      throw new Error("unknown revision abcdef1234567");
    },
  });
  assert.equal(badSha.ok, false);
  assert.match(badSha.body, /is the anchor commit in this checkout\?/);
});

test("increment help and unknown-sub are envelopes", async () => {
  const help = await incrementCommand(undefined, undefined, {}, { store: new InMemoryStore(), pg: false, countCommits: () => 0 });
  assert.equal(help.ok, true);
  assert.match(help.body, /freshness check/);
  const unknown = await incrementCommand("frob", undefined, {}, { store: new InMemoryStore(), pg: false, countCommits: () => 0 });
  assert.equal(unknown.ok, false);
});

// ---------------------------------------------------------------------------
// THE COMPLETION PROBE (`tool-signal-gaps-arc`, friction `drifted-increment-may-be-already-delivered`)
//
// Drift is anchor-vs-HEAD and NOTHING else, so a DRIFTED verdict cannot distinguish "never built"
// from "built, then the ground moved elsewhere" — yet the two have OPPOSITE remedies. The check used
// to print `next: storytree agents planner` for both, which cost a whole session re-planning work
// that had landed three weeks earlier (`explorer-onboarding-plan-1`, 89 commits, 7/7 paths, PR #775).
// ---------------------------------------------------------------------------

function closedSibling(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    kind: "increment",
    id: "sib-1",
    title: "t",
    description: "d",
    objective: "Land the thing.",
    body: "Plan p1 consumed; every unit landed.",
    arcRef: "asset:map-arc",
    status: "closed",
    outcome: { pr: 775 },
    references: [],
    createdAt: "2026-07-17",
    updatedAt: "2026-07-17",
    ...overrides,
  };
}

/** Seed `p1` plus a sibling increment. */
async function seededWithSibling(
  siblingDoc: Record<string, unknown>,
  overrides: Record<string, unknown> = {},
): Promise<InMemoryStore> {
  const store = await seeded(overrides);
  await store.upsertDoc({ id: "sib-1", kind: "increment", doc: siblingDoc });
  return store;
}

const DRIFT = { "packages/library/src/knowledge.ts": 89 };

/** Wrap a doc in the StoredDoc shape the pure probe reads. */
function rowOf(doc: Record<string, unknown>) {
  return { id: doc["id"] as string, kind: "increment", doc, createdAt: "", updatedAt: "" };
}

test("deliveredBySibling finds a CLOSED sibling naming the id, in any of the three prose fields", () => {
  assert.deepEqual(deliveredBySibling("p1", [rowOf(closedSibling())]), {
    by: "sib-1",
    where: "body",
  });
  assert.deepEqual(
    deliveredBySibling("p1", [rowOf(closedSibling({ body: "x", objective: "p1 landed" }))]),
    { by: "sib-1", where: "objective" },
  );
  assert.deepEqual(
    deliveredBySibling("p1", [
      rowOf(closedSibling({ body: "x", objective: "y", outcome: { note: "p1 was wrong" } })),
    ]),
    { by: "sib-1", where: "outcome.note" },
  );
});

test("deliveredBySibling ignores OPEN siblings and the increment itself", () => {
  // An OPEN sibling naming it is one plan referencing another, not a delivery record.
  assert.equal(deliveredBySibling("p1", [rowOf(closedSibling({ status: "active" }))]), null);
  assert.equal(deliveredBySibling("p1", [rowOf(closedSibling({ status: "proposal" }))]), null);
  // A closed increment naming ITSELF is not evidence that anything delivered it.
  assert.equal(
    deliveredBySibling("p1", [rowOf({ ...closedSibling(), id: "p1", body: "p1 consumed" })]),
    null,
  );
});

test("arcIdOf strips the `asset:` scheme prefix, and tolerates a bare id or none", () => {
  assert.equal(arcIdOf({ arcRef: "asset:map-arc" }), "map-arc");
  assert.equal(arcIdOf({ arcRef: "map-arc" }), "map-arc");
  assert.equal(arcIdOf({}), null);
  assert.equal(arcIdOf({ arcRef: "" }), null);
});

test("DRIFTED + a closed sibling recording delivery does NOT recommend the planner", async () => {
  const store = await seededWithSibling(closedSibling());
  const env = await incrementCommand("check", "p1", {}, depsFor(store, DRIFT));

  assert.equal(env.ok, true);
  assert.match(env.body, /DRIFTED/, "the drift verdict itself is unchanged — it is still true");
  assert.match(env.body, /MAY HAVE NOTHING LEFT TO BUILD/);
  assert.match(env.body, /closed sibling "sib-1" names this increment in its body/);

  const next = env.next.join("\n");
  assert.doesNotMatch(next, /agents planner/, "the measured misdirection: re-planning delivered work");
  assert.match(next, /arc increment close p1/, "closing the record is the honest terminal move");
  assert.match(next, /library artifact sib-1/, "and the evidence is one read away");
});

test("DRIFTED + status active|closed surfaces the write-lock the drifted branch used to DROP", async () => {
  // The `spent` warning already existed — but only on the FRESH branch. A drifted+spent increment
  // got "re-plan, not repair" with no mention that it can never be re-executed, which is exactly
  // the shape of the measured instance.
  for (const status of ["active", "closed"]) {
    const store = await seeded({ status });
    const env = await incrementCommand("check", "p1", {}, depsFor(store, DRIFT));
    assert.match(env.body, /MAY HAVE NOTHING LEFT TO BUILD/, `status ${status}`);
    assert.match(
      env.body,
      new RegExp(`status is ${status} — a ${status} increment is never re-executed`),
    );
    assert.doesNotMatch(env.next.join("\n"), /agents planner/, `status ${status}`);
  }
});

test("DRIFTED with NO completion evidence still recommends re-planning, and SAYS it looked", async () => {
  const store = await seededWithSibling(closedSibling({ body: "unrelated work" }));
  const env = await incrementCommand("check", "p1", {}, depsFor(store, DRIFT));

  assert.match(env.body, /DRIFTED/);
  assert.match(env.body, /re-plan, not repair/);
  assert.match(
    env.body,
    /no completion evidence found/,
    "an absent signal must say it was CHECKED — a silent absence reads as 'never looked for'",
  );
  assert.match(env.next.join("\n"), /agents planner/, "ADR-0183 D2 is unchanged for genuinely stale work");
});

test("the probe never fires on a FRESH increment — it costs a store read only where it can matter", async () => {
  const store = await seededWithSibling(closedSibling());
  let queries = 0;
  const inner = store.queryDocs.bind(store);
  store.queryDocs = async (filter) => {
    queries += 1;
    return inner(filter);
  };
  const env = await incrementCommand("check", "p1", {}, depsFor(store, {}));
  assert.match(env.body, /FRESH/);
  assert.equal(queries, 0, "a fresh verdict has no ambiguity to resolve");
});

test("an increment with NO arcRef degrades silently — the probe only ever ADDS evidence", async () => {
  const store = await seeded({ arcRef: undefined });
  const env = await incrementCommand("check", "p1", {}, depsFor(store, DRIFT));
  assert.equal(env.ok, true);
  assert.match(env.body, /re-plan, not repair/, "no siblings to consult is not an error");
});

test("a sibling on a DIFFERENT arc is not consulted", async () => {
  const store = await seededWithSibling(closedSibling({ arcRef: "asset:other-arc" }));
  const env = await incrementCommand("check", "p1", {}, depsFor(store, DRIFT));
  assert.match(env.body, /no completion evidence found/);
});
