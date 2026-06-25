import test from "node:test";
import assert from "node:assert/strict";

import { NODE_REF_PREFIX, nodeRef, openQuestionsGatingNode } from "./oq-gating.js";

// ADR-0107: the attachment predicate — an OQ gates a node's proving process iff its `references`
// carry the `node:<id>` token. Pure, browser-safe; the orchestrator counts what this returns.

test("nodeRef builds the proving-process attachment token", () => {
  assert.equal(nodeRef("agent"), "node:agent");
  assert.equal(NODE_REF_PREFIX, "node:");
});

test("an OQ referencing node:<id> gates that node", () => {
  const oqs = [{ id: "oq-x", references: ["node:agent"] }];
  assert.deepEqual(
    openQuestionsGatingNode(oqs, "agent").map((o) => o.id),
    ["oq-x"],
  );
});

test("an OQ NOT referencing the node is excluded — a different node, an ADR, or an asset ref", () => {
  const oqs = [
    { id: "oq-other-node", references: ["node:library"] },
    { id: "oq-adr", references: ["doc:decisions/0037-x.md"] },
    { id: "oq-asset", references: ["asset:some-unit"] },
  ];
  assert.deepEqual(openQuestionsGatingNode(oqs, "agent"), []);
});

test("an OQ with no references (or an empty list) gates nothing", () => {
  const oqs = [{ id: "oq-bare" }, { id: "oq-empty", references: [] }];
  assert.deepEqual(openQuestionsGatingNode(oqs, "agent"), []);
});

test("only the EXACT node token matches — node:agent does not gate node:agent-x (no prefix bleed)", () => {
  const oqs = [{ id: "oq-prefixy", references: ["node:agent-x"] }];
  assert.deepEqual(openQuestionsGatingNode(oqs, "agent"), []);
});

test("multiple gating OQs on one node are all returned (the gate takes the count)", () => {
  const oqs = [
    { id: "oq-1", references: ["node:agent"] },
    { id: "oq-2", references: ["node:agent", "doc:decisions/0106-x.md"] },
    { id: "oq-3", references: ["node:library"] },
  ];
  assert.deepEqual(
    openQuestionsGatingNode(oqs, "agent").map((o) => o.id),
    ["oq-1", "oq-2"],
  );
});
