import { test } from "node:test";
import assert from "node:assert/strict";

import { InMemoryStore } from "@storytree/storage-protocol";

import { agentsCommand, agentStepCommand } from "./agents.js";
import { run } from "./commands.js";

// The agent RENDERER itself (renderAgentPrompt / renderAgentDigest / renderAgentFile /
// delegatableAgentIds) is tested in @storytree/library (packages/library/src/store/render-agent.test.ts)
// — its home after the drive extraction. Here we test only the CLI surface over it: the
// Envelope-returning `agentsCommand` shell and the `agents` dispatch wiring.

/** A store seeded with a principle + two agents (one clean, one with a dangling ref). */
async function seeded(): Promise<InMemoryStore> {
  const store = new InMemoryStore();
  await store.upsertDoc({
    id: "test-principle",
    kind: "principle",
    doc: {
      kind: "principle",
      title: "Test Principle",
      description: "a principle the agent stands on",
      statement: "Always assemble from the library.",
      why: "one source of truth beats hand-copy drift.",
      howToApply: "render, never restate.",
      references: [],
    },
  });
  await store.upsertDoc({
    id: "clean-agent",
    kind: "agent",
    doc: {
      kind: "agent",
      title: "Clean Agent",
      description: "a role whose refs all resolve",
      oneLine: "The clean agent does one thing.",
      role: "It exists to test the renderer.",
      outcome: "The prompt assembles with injected content.",
      context: ["asset:test-principle"],
      tools: "none",
      workflow: "orient, then stop.",
      rules: ["asset:test-principle"],
      references: [],
    },
  });
  await store.upsertDoc({
    id: "broken-agent",
    kind: "agent",
    doc: {
      kind: "agent",
      title: "Broken Agent",
      description: "a role with a dangling manifest ref",
      oneLine: "The broken agent points at a ghost.",
      role: "It exists to test dangling-ref handling.",
      outcome: "The dangling ref is flagged, never silently dropped.",
      context: ["asset:test-principle"],
      tools: "none",
      workflow: "orient, then stop.",
      antiPatterns: ["asset:ghost-ref"],
      references: [],
    },
  });
  return store;
}

test("agentsCommand: clean agent → ok envelope; dangling agent → not-ok with the dangling note", async () => {
  const store = await seeded();
  const clean = await agentsCommand(store, "clean-agent");
  assert.equal(clean.ok, true);
  const broken = await agentsCommand(store, "broken-agent");
  assert.equal(broken.ok, false);
  assert.match(broken.body, /dangling ref/);
});

test("the `agents` area is wired into the dispatch", async () => {
  const store = await seeded();
  const env = await run(["agents", "clean-agent"], { store });
  assert.equal(env.ok, true);
  assert.match(env.body, /The clean agent does one thing\./);
  // bare `agents` needs a name and lists what exists
  const bare = await run(["agents"], { store });
  assert.equal(bare.ok, false);
});

// ── `agents <name> --step <step>` — the step→refs retrieval affordance (ADR-0156 §4 / ADR-0161) ────

/** Extend the seeded store with an agent carrying a `stepRefs` map. */
async function seededWithSteps(): Promise<InMemoryStore> {
  const store = await seeded();
  await store.upsertDoc({
    id: "stepper",
    kind: "agent",
    doc: {
      kind: "agent",
      title: "Stepper",
      description: "an agent with a step→refs map",
      oneLine: "o",
      role: "r",
      outcome: "o",
      context: ["asset:test-principle"],
      tools: "t",
      workflow: "session_start, then 1.",
      references: [],
      stepRefs: [
        { step: "session_start", refs: ["asset:test-principle"] },
        { step: "1", refs: [] },
      ],
    },
  });
  return store;
}

test("agentStepCommand: a step's refs render as `storytree library artifact <id>` pulls (shared emitter)", async () => {
  const store = await seededWithSteps();
  const env = await agentStepCommand(store, "stepper", "session_start");
  assert.equal(env.ok, true);
  assert.match(env.body, /stepper — step "session_start"/);
  // the outbound edge is emitted as the canonical Library pull, with the asset: prefix stripped
  assert.deepEqual(env.next, ["storytree library artifact test-principle"]);
});

test("agentStepCommand: a step with no refs is ok with an empty next", async () => {
  const store = await seededWithSteps();
  const env = await agentStepCommand(store, "stepper", "1");
  assert.equal(env.ok, true);
  assert.deepEqual(env.next, []);
});

test("agentStepCommand: an unknown step fails closed, offering the valid step branches", async () => {
  const store = await seededWithSteps();
  const env = await agentStepCommand(store, "stepper", "nope");
  assert.equal(env.ok, false);
  assert.deepEqual(env.next, [
    "storytree agents stepper --step session_start",
    "storytree agents stepper --step 1",
  ]);
});

test("`agents <name> --step <step>` is wired through the dispatch", async () => {
  const store = await seededWithSteps();
  const env = await run(["agents", "stepper", "--step", "session_start"], { store });
  assert.equal(env.ok, true);
  assert.deepEqual(env.next, ["storytree library artifact test-principle"]);
  // bare `agents stepper` (no --step) still prints the full assembled prompt
  const full = await run(["agents", "stepper"], { store });
  assert.equal(full.ok, true);
  assert.match(full.body, /## Context/);
});
