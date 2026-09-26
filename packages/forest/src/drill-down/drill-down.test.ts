/**
 * Capability 4 · Drill-down (stories/forest.md): what the panel a click opens says about a story.
 * The library's tree and history, and the agent log's lines, are written out here as the app hands
 * them to the page, so no database is needed.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import type { Line, NewLine } from "@storytree/agent-link";
import { workStates } from "@storytree/arc-surface";
import type { AnnotatedCapability, AnnotatedContract, AnnotatedStory, AnnotatedTree, Change, HealthColumn, HealthState } from "@storytree/library";

import { drillDown, NO_DESCRIPTION } from "./drill-down.js";

const column = (state: HealthState, written = false): HealthColumn => (written ? { state, by: "someone", at: new Date(0).toISOString() } : { state });

function contract(id: string, reported: HealthState, verified?: HealthState): AnnotatedContract {
  return { id, title: `${id} works`, health: { reported: column(reported, reported !== "not-checked"), verified: column(verified ?? "not-checked", verified !== undefined) } };
}

function capability(id: string, dependsOn: string[], contracts: AnnotatedContract[] = [], description: string | undefined = `What ${id} does. Why it matters.`): AnnotatedCapability {
  return { id, title: `The ${id}`, ...(description === undefined ? {} : { description }), dependsOn, contracts, health: { reported: { state: "not-checked" }, verified: { state: "not-checked" } } };
}

function story(id: string, ...capabilities: AnnotatedCapability[]): AnnotatedStory {
  return { id, title: `Story ${id}`, description: `What ${id} is. Why.`, capabilities, health: { reported: { state: "not-checked" }, verified: { state: "not-checked" } } };
}

/** The history's health saves for `contract`'s reported column, oldest first. */
function reports(contractId: string, ...states: HealthState[]): Change[] {
  return states.map((state, index) => {
    const at = new Date(Date.UTC(2026, 8, 27, 12, 0, index)).toISOString();
    const id = `health_${contractId}_reported`;
    return { seq: index + 1, recordId: id, type: "health", action: index === 0 ? "created" : "updated", record: { id, type: "health", version: index + 1, fields: { node: contractId, column: "reported", state }, createdAt: at, updatedAt: at } };
  });
}

function log(...written: NewLine[]): Line[] {
  return written.map((line, index) => ({ ...line, seq: index + 1, project: "shop", at: new Date(0).toISOString() }));
}
const claimed = (capability: string): NewLine => ({ kind: "claimed", session: "s1", source: "tool", capability, reason: "building it" });
const landed = (capability: string): NewLine => ({ kind: "landed", session: "s1", source: "tool", capability });

test("4.1 a story whose third capability builds on the first two opens in build order, with the agent's health, and a diagram of exactly two arrows", () => {
  const tree: AnnotatedTree = {
    stories: [story("s", capability("third", ["first", "second"]), capability("first", [], [contract("k1", "passing")]), capability("second", []))],
    arcs: [],
  };
  const panel = drillDown(tree, "s", workStates([]), []);
  assert.equal(panel?.description, "What s is. Why.");
  assert.deepEqual(panel?.capabilities.map(({ id, description }) => [id, description]), [
    ["first", "What first does. Why it matters."],
    ["second", "What second does. Why it matters."],
    ["third", "What third does. Why it matters."],
  ]);
  assert.equal(panel?.capabilities[0]?.contracts[0]?.reported, "passing");
  assert.deepEqual(panel?.arrows.map(({ from, to }) => `${from} -> ${to}`), ["third -> first", "third -> second"]);
});

test("4.2 a capability that builds on one in another story points at it, named with that story, and marked until it lands", () => {
  const tree: AnnotatedTree = { stories: [story("a", capability("login", ["accounts"])), story("b", capability("accounts", []))], arcs: [] };
  const [before] = drillDown(tree, "a", workStates([]), [])?.arrows ?? [];
  assert.deepEqual(before, { from: "login", to: "accounts", toTitle: "The accounts", toStory: "Story b", landed: false });
  const [after] = drillDown(tree, "a", workStates(log(claimed("accounts"), landed("accounts"))), [])?.arrows ?? [];
  assert.equal(after?.landed, true);
});

test("4.3 a capability with no description says so instead of leaving a blank", () => {
  const tree: AnnotatedTree = { stories: [story("s", capability("bare", [], [], undefined))], arcs: [] };
  assert.equal(drillDown(tree, "s", workStates([]), [])?.capabilities[0]?.description, NO_DESCRIPTION);
});

test("4.4 a contract reported red, then green, says so; one reported only green says that", () => {
  const tree: AnnotatedTree = { stories: [story("s", capability("c", [], [contract("fixed", "passing"), contract("clean", "passing")]))], arcs: [] };
  const history = [...reports("fixed", "failing", "passing"), ...reports("clean", "passing")];
  const contracts = drillDown(tree, "s", workStates([]), history)?.capabilities[0]?.contracts ?? [];
  assert.deepEqual(contracts.map(({ id, trail }) => [id, trail]), [
    ["fixed", "red, then green"],
    ["clean", "green only"],
  ]);
});

test("4.5 storytree's own column shows beside the agent's only where something wrote it", () => {
  const tree: AnnotatedTree = { stories: [story("s", capability("c", [], [contract("seen", "passing", "passing"), contract("unseen", "passing")]))], arcs: [] };
  const [line] = drillDown(tree, "s", workStates([]), [])?.capabilities ?? [];
  assert.deepEqual(line?.contracts.map(({ id, verified }) => [id, verified]), [
    ["seen", "passing"],
    ["unseen", undefined],
  ]);
  assert.equal(line?.verified, "passing", "the capability shows it too, since one of its contracts has it");
  const bare = drillDown({ stories: [story("t", capability("d", [], [contract("x", "failing")]))], arcs: [] }, "t", workStates([]), []);
  assert.equal(bare?.capabilities[0]?.verified, undefined);
});
