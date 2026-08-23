/**
 * THE AUTHORING LINK of ADR-0419 D1's chain, end to end — `decision-read-measurement-arc-inc-01`.
 *
 * Increment 05 proved the READING half: a decision row carrying `dependsOn` reaches `AdrMeta`, the
 * seam, and the depth walk, and moves the depth (`packages/drive/src/adr-metas.test.ts`, "END TO
 * END"). Those tests seed the row as a literal, which is the right way to fence a reader — and it
 * leaves exactly one link of the real chain unexercised: **the write**.
 *
 * `decision-read-measurement-arc-inc-07` will rehome ~446 edges from `amends` onto `dependsOn`
 * through `storytree library artifact adr-NNNN --set dependsOn=…`. If that command refuses the
 * field, or accepts it and stores a shape `readDependsOnPointers` does not read, the drain either
 * cannot start or lands hundreds of edges that are invisible to the very measurement this arc
 * exists to take. Both failures are silent at the read side — an unwritten edge and an unwalked one
 * produce the same zero — so the fence has to sit on the WRITE and be followed all the way through
 * to a walked depth.
 *
 * ZERO decision rows carry `dependsOn` in the live corpus today (measured 2026-08-23), so this case
 * cannot be reached by sampling the store: it must be authored. It is authored here through the
 * REAL command, against `InMemoryStore` — hermetic, no database, no credential — so it stays on the
 * credential-free `pnpm -r test` leg (ADR-0302 D3).
 */
import assert from "node:assert/strict";
import test from "node:test";

import { loadTitledAdrMetasFromStore } from "@storytree/drive";
import {
  decisionAmendsResolver,
  depthFromWorkNodes,
  evaluateDepthFromWork,
} from "@storytree/library";
import { InMemoryStore } from "@storytree/storage-protocol";

import { editArtifact } from "./commands.js";

const NOW = "2026-08-23T00:00:00.000Z";

function decisionRow(number: number, extra: Record<string, unknown> = {}) {
  const id = `adr-${String(number).padStart(4, "0")}`;
  return {
    kind: "adr",
    id,
    schemaVersion: 1,
    title: `ADR-${String(number).padStart(4, "0")}: a decision`,
    description: "a decision",
    number,
    status: "accepted",
    amends: [],
    supersedes: [],
    loadBearing: false,
    references: [],
    body: `# ADR-${String(number).padStart(4, "0")}: a decision\n\n## Status\n\naccepted\n`,
    createdAt: NOW,
    updatedAt: NOW,
    ...extra,
  };
}

/**
 * An ordinary artifact anchored to work, so the walk has somewhere to start from.
 *
 * Its pointer at the decision is spelled `doc:decisions/…`. BOTH spellings work: an artifact whose
 * `dependsOn` names a decision as `asset:adr-0419` reaches it too, since
 * `decision-read-measurement-arc-inc-08` (commit 4a7e9345) taught the artifact half of the walk to
 * try `parseDecisionPointer` before `parseCiteRef`.
 *
 * ⚠ THE HISTORY IS KEPT BECAUSE THE FAILURE MODE IS NOT: until that fix landed, the `asset:` form
 * resolved to the ORDINARY `adr-0419` artifact node — a different node from `decision:0419` — so the
 * edge hung off a node the decision half of the walk never reaches, and the depth silently did not
 * move. If a future change to pointer PRECEDENCE ever reintroduces that, these tests keep passing on
 * the `doc:` spelling alone, so the `asset:` half is covered by inc-08's own tests rather than
 * inferred from a green here.
 */
function anchorRow(dependsOn: readonly string[]) {
  return {
    kind: "pattern",
    id: "an-anchor",
    schemaVersion: 1,
    title: "An anchor",
    description: "an anchor",
    body: "anchored",
    cites: ["capability:some-capability"],
    dependsOn: [...dependsOn],
    createdAt: NOW,
    updatedAt: NOW,
  };
}

async function seed(store: InMemoryStore, rows: readonly Record<string, unknown>[]): Promise<void> {
  for (const row of rows) {
    await store.upsertDoc({ id: row["id"] as string, kind: row["kind"] as string, doc: row });
  }
}

test("a decision's dependsOn is AUTHORABLE through `library artifact edit --set` — the field is not refused", async () => {
  const store = new InMemoryStore();
  await seed(store, [decisionRow(419), decisionRow(139)]);

  const env = await editArtifact({ store, writable: true }, "adr-0419", {
    sets: ['dependsOn=["asset:adr-0139"]'],
    json: undefined,
    file: undefined,
  });

  assert.equal(
    env.ok,
    true,
    `--set dependsOn was REFUSED, so ADR-0419's drain has no CLI write path: ${env.body}`,
  );

  const stored = await store.getDoc("adr-0419");
  assert.deepEqual(
    (stored?.doc as Record<string, unknown>)["dependsOn"],
    ["asset:adr-0139"],
    "the pointer must persist as an ARRAY — a JSON array flattened to a string reads as no edge",
  );
});

test("END TO END: an edge authored by the CLI is walked as depth — write, store, project, resolve, walk", async () => {
  // The whole chain, in one test, with no literal standing in for any of its links:
  //   editArtifact  →  InMemoryStore row  →  loadTitledAdrMetasFromStore  →  decisionAmendsResolver
  //   →  evaluateDepthFromWork
  // Any one of them dropping the field puts the depth back to the unwired reading, which is what
  // this asserts against rather than asserting a bare number.
  const store = new InMemoryStore();
  await seed(store, [
    anchorRow(["doc:decisions/0419-a-decision.md"]),
    decisionRow(419),
    decisionRow(139),
  ]);

  const artifacts = await store.queryDocs();
  const nodes = depthFromWorkNodes(
    artifacts.map((entry) => ({ id: entry.id, kind: entry.kind, doc: entry.doc })),
  );

  const { adrs: before } = await loadTitledAdrMetasFromStore(store);
  const unwired = evaluateDepthFromWork(nodes, decisionAmendsResolver(before));
  assert.equal(
    unwired.decisionDependsOnEdges,
    0,
    "control: with no authored edge the walk must find none, or this test proves nothing",
  );

  const env = await editArtifact({ store, writable: true }, "adr-0419", {
    sets: ['dependsOn=["asset:adr-0139"]'],
    json: undefined,
    file: undefined,
  });
  assert.equal(env.ok, true, env.body);

  const { adrs: after } = await loadTitledAdrMetasFromStore(store);
  const walked = evaluateDepthFromWork(nodes, decisionAmendsResolver(after));

  assert.equal(
    walked.decisionDependsOnEdges,
    1,
    "the CLI-authored edge must reach the walk — if this is 0 the drain lands invisible edges",
  );
  assert.equal(walked.amendsEdges, 0, "and it must NOT be counted as an amends edge — never summed");
  assert.ok(
    walked.decisionsReached > unwired.decisionsReached,
    "the authored edge must actually MOVE the reach, not merely be counted",
  );
});

test("the three pointer spellings all survive the CLI write and are all walked", async () => {
  // ADR-0403 dec 7 keeps three live spellings and rewrites none, so the drain may author any of
  // them. A write path that stored all three and a walk that resolved only one would return a
  // confident, plausible, wrong number — the failure `parseDecisionPointer` exists to prevent.
  const store = new InMemoryStore();
  await seed(store, [
    anchorRow(["doc:decisions/0419-a-decision.md"]),
    decisionRow(419),
    decisionRow(139),
    decisionRow(402),
    decisionRow(403),
  ]);

  const env = await editArtifact({ store, writable: true }, "adr-0419", {
    sets: [
      'dependsOn=["asset:adr-0139","doc:decisions/0402-a.md","doc:docs/decisions/0403-b.md"]',
    ],
    json: undefined,
    file: undefined,
  });
  assert.equal(env.ok, true, env.body);

  const artifacts = await store.queryDocs();
  const nodes = depthFromWorkNodes(
    artifacts.map((entry) => ({ id: entry.id, kind: entry.kind, doc: entry.doc })),
  );
  const { adrs } = await loadTitledAdrMetasFromStore(store);
  const walked = evaluateDepthFromWork(nodes, decisionAmendsResolver(adrs));

  assert.equal(walked.decisionDependsOnEdges, 3, "every spelling must resolve, or the drain loses edges");
  assert.equal(walked.decisionDependsOnUnwalkedTargets, 0);
  assert.equal(walked.decisionDanglingTargets, 0);
});
