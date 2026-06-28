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

test("SOURCE_GROUP_ORDER ends with the two doc buckets then Other", () => {
  assert.deepEqual(SOURCE_GROUP_ORDER.slice(-3), [
    "Decisions (ADRs)",
    "Docs & references",
    "Other",
  ]);
});
