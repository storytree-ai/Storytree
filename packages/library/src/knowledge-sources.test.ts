import test from "node:test";
import assert from "node:assert/strict";
import { groupSources, SOURCE_GROUP_ORDER } from "./knowledge-sources.js";

/**
 * Offline + pure: groupSources buckets `references` by target type, in SOURCE_GROUP_ORDER,
 * dropping empty groups and keeping reference order within a group.
 */

const corpus: Record<string, { kind: string; title: string }> = {
  "red-green": { kind: "principle", title: "Red-green" },
  "approval-gated-trunk": { kind: "guardrail", title: "Approval-gated trunk" },
  "owned-loop": { kind: "definition", title: "Owned loop" },
};
const resolve = (id: string) => corpus[id] ?? null;

test("groups asset: refs by their category and doc: refs by decisions/ vs other", () => {
  const groups = groupSources(
    [
      "asset:red-green",
      "doc:decisions/0007-proof-model.md",
      "asset:approval-gated-trunk",
      "doc:open-questions.md",
      "asset:owned-loop",
    ],
    resolve,
  );
  assert.deepEqual(
    groups.map((g) => g.group),
    ["Definitions", "Principles", "Guardrails", "Decisions (ADRs)", "Docs & references"],
    "emitted in SOURCE_GROUP_ORDER, empty groups omitted",
  );
  const principles = groups.find((g) => g.group === "Principles");
  assert.deepEqual(principles?.items, [{ ref: "asset:red-green", label: "Red-green" }]);
  const docs = groups.find((g) => g.group === "Docs & references");
  assert.deepEqual(docs?.items, [{ ref: "doc:open-questions.md", label: "open-questions.md" }]);
});

/**
 * BOTH LIVE SPELLINGS GROUP THE SAME (ADR-0403 dec 7). This arm used to ask
 * `rel.startsWith("decisions/")` — the bare spelling only — so a decision cited as
 * `doc:docs/decisions/…` rendered under "Docs & references" as though it were a research note.
 * The third assertion is what keeps the fix from over-reaching: `doc:` is the scheme for ANY
 * repository file, and a pointer that is not a decision must still land under docs.
 */
test("BOTH live doc: spellings group under Decisions (ADRs); other doc: refs still do not", () => {
  const groups = groupSources(
    [
      "doc:decisions/0007-proof-model.md",
      "doc:docs/decisions/0403-adrs-into-the-dag.md",
      "doc:research/decision-log-readers-census-2026-08-22.md",
    ],
    resolve,
  );
  const adrs = groups.find((g) => g.group === "Decisions (ADRs)");
  assert.deepEqual(
    adrs?.items,
    [
      { ref: "doc:decisions/0007-proof-model.md", label: "decisions/0007-proof-model.md" },
      {
        ref: "doc:docs/decisions/0403-adrs-into-the-dag.md",
        label: "docs/decisions/0403-adrs-into-the-dag.md",
      },
    ],
    "the spelling is reported in the label, never what decides the group",
  );
  const docs = groups.find((g) => g.group === "Docs & references");
  assert.deepEqual(docs?.items, [
    {
      ref: "doc:research/decision-log-readers-census-2026-08-22.md",
      label: "research/decision-log-readers-census-2026-08-22.md",
    },
  ]);
});

test("keeps reference order within a group", () => {
  const [adrs] = groupSources(
    ["doc:decisions/0008-ui.md", "doc:decisions/0001-stack.md"],
    resolve,
  );
  assert.deepEqual(
    adrs?.items.map((i) => i.ref),
    ["doc:decisions/0008-ui.md", "doc:decisions/0001-stack.md"],
  );
});

test("an unknown asset: id falls under Other, labelled as unknown", () => {
  const groups = groupSources(["asset:ghost"], resolve);
  assert.deepEqual(groups, [
    { group: "Other", items: [{ ref: "asset:ghost", label: "asset:ghost (unknown asset)" }] },
  ]);
});

test("no references -> no groups", () => {
  assert.deepEqual(groupSources([], resolve), []);
});

test("a node: ref groups under Story nodes, labelled by its node id", () => {
  // ADR-0107 D2's third reference token. Before this it fell to "Other" as a raw pointer — the gap
  // ADR-0107's own Consequences named ("will show a `node:` ref ungrouped until that view learns
  // the token"). Corpus-free: the node id is the label; the work tree is not the library's to resolve.
  const groups = groupSources(["node:map-server-memo", "asset:red-green"], resolve);
  assert.deepEqual(
    groups.map((g) => g.group),
    ["Principles", "Story nodes"],
    "Story nodes sits after the library kinds",
  );
  assert.deepEqual(groups.find((g) => g.group === "Story nodes")?.items, [
    { ref: "node:map-server-memo", label: "map-server-memo" },
  ]);
});

test("SOURCE_GROUP_ORDER ends with the two doc buckets then Other", () => {
  assert.deepEqual(SOURCE_GROUP_ORDER.slice(-3), [
    "Decisions (ADRs)",
    "Docs & references",
    "Other",
  ]);
});
