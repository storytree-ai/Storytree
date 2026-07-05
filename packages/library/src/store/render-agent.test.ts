import { test } from "node:test";
import assert from "node:assert/strict";

import { InMemoryStore } from "@storytree/storage-protocol";

import {
  renderAgentPrompt,
  renderAgentDigest,
  renderAgentFile,
  renderAgentStep,
  delegatableAgentIds,
  DEDICATED_SURFACE_AGENTS,
  GENERATED_AGENT_MARKER,
} from "./render-agent.js";

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

test("renderAgentPrompt INJECTS the content a ref points at (not the ref id)", async () => {
  const store = await seeded();
  const res = await renderAgentPrompt(store, "clean-agent");
  assert.equal(res.ok, true);
  if (!res.ok) return;
  // the agent's own prose
  assert.match(res.agent.prompt, /The clean agent does one thing\./);
  // the INJECTED principle — its title AND its rendered body, under the Context section
  assert.match(res.agent.prompt, /## Context/);
  assert.match(res.agent.prompt, /Test Principle/);
  assert.match(res.agent.prompt, /Always assemble from the library\./);
  // a rules section too (it shares the same ref)
  assert.match(res.agent.prompt, /## Rules/);
  assert.deepEqual(res.agent.missingRefs, []);
});

test("a dangling ref is FLAGGED inline and collected — never a silently-thinner prompt", async () => {
  const store = await seeded();
  const res = await renderAgentPrompt(store, "broken-agent");
  assert.equal(res.ok, true);
  if (!res.ok) return;
  assert.deepEqual(res.agent.missingRefs, ["asset:ghost-ref"]);
  assert.match(res.agent.prompt, /MISSING REF: asset:ghost-ref/);
  // the resolvable context ref still injected
  assert.match(res.agent.prompt, /Test Principle/);
});

test("an unknown agent fails closed with the list of agents that DO exist", async () => {
  const store = await seeded();
  const res = await renderAgentPrompt(store, "nope");
  assert.equal(res.ok, false);
  if (res.ok) return;
  assert.deepEqual(res.available, ["broken-agent", "clean-agent"]);
});

test("no name fails closed asking for one", async () => {
  const store = await seeded();
  const res = await renderAgentPrompt(store, undefined);
  assert.equal(res.ok, false);
  if (res.ok) return;
  assert.match(res.reason, /needs a name/);
});

test("renderAgentDigest is CONCISE — prose + a manifest pointer, not the injected bodies", async () => {
  const store = await seeded();
  const res = await renderAgentDigest(store, "clean-agent");
  assert.equal(res.ok, true);
  if (!res.ok) return;
  // the agent's prose
  assert.match(res.agent.digest, /The clean agent does one thing\./);
  assert.match(res.agent.digest, /\*\*Role\.\*\*/);
  // a manifest of refs by id + the pointer to the full assembly — NOT the injected body
  assert.match(res.agent.digest, /storytree agents clean-agent/);
  assert.match(res.agent.digest, /test-principle/);
  assert.doesNotMatch(res.agent.digest, /Always assemble from the library\./); // the ref BODY is not inlined
  assert.deepEqual(res.agent.missingRefs, []);
});

test("renderAgentDigest flags a dangling ref (the gate's drift/integrity guard)", async () => {
  const store = await seeded();
  const res = await renderAgentDigest(store, "broken-agent");
  assert.equal(res.ok, true);
  if (!res.ok) return;
  assert.deepEqual(res.agent.missingRefs, ["asset:ghost-ref"]);
});

// ── .claude/agents push surface (ADR-0052) ──────────────────────────────────────────────────────

test("renderAgentFile wraps the assembled prompt in Claude Code subagent frontmatter + marker", async () => {
  const store = await seeded();
  const res = await renderAgentFile(store, "clean-agent");
  assert.equal(res.ok, true);
  if (!res.ok) return;
  assert.match(res.content, /^---\nname: clean-agent\ndescription: "a role whose refs all resolve"\n---\n\n/);
  assert.ok(res.content.includes(GENERATED_AGENT_MARKER));
  assert.match(res.content, /The clean agent does one thing\./); // the assembled prompt body
  assert.match(res.content, /Always assemble from the library\./); // injected ref content
  assert.ok(res.content.endsWith("\n"));
  assert.ok(!res.content.endsWith("\n\n"));
  assert.deepEqual(res.missingRefs, []);
});

test("renderAgentFile surfaces a dangling ref via missingRefs (the build:agents fail-closed guard)", async () => {
  const store = await seeded();
  const res = await renderAgentFile(store, "broken-agent");
  assert.equal(res.ok, true);
  if (!res.ok) return;
  assert.deepEqual(res.missingRefs, ["asset:ghost-ref"]);
});

test("renderAgentFile escapes quotes in the description for valid YAML frontmatter", async () => {
  const store = await seeded();
  await store.upsertDoc({
    id: "quoty",
    kind: "agent",
    doc: {
      kind: "agent",
      title: "Quoty",
      description: 'has a "quote" and a: colon',
      oneLine: "o",
      role: "r",
      outcome: "o",
      context: ["asset:test-principle"],
      tools: "t",
      workflow: "w",
      references: [],
    },
  });
  const res = await renderAgentFile(store, "quoty");
  assert.equal(res.ok, true);
  if (!res.ok) return;
  assert.match(res.content, /description: "has a \\"quote\\" and a: colon"/);
});

// ── step→refs retrieval (ADR-0156 §4 / ADR-0161: the agent-step node) ─────────────────────────────

/** A store with one agent carrying a `stepRefs` map (a two-step workflow, one step with no refs). */
async function stepped(): Promise<InMemoryStore> {
  const store = new InMemoryStore();
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
        { step: "session_start", refs: ["asset:merge-ceremony", "asset:pull-based-context"] },
        { step: "1", refs: [] },
      ],
    },
  });
  return store;
}

test("renderAgentStep resolves one step's refs VERBATIM (asset: kept; the emitter strips it)", async () => {
  const store = await stepped();
  const res = await renderAgentStep(store, "stepper", "session_start");
  assert.equal(res.ok, true);
  if (!res.ok) return;
  assert.equal(res.agent, "stepper");
  assert.equal(res.step, "session_start");
  assert.deepEqual(res.refs, ["asset:merge-ceremony", "asset:pull-based-context"]);
});

test("renderAgentStep: a step with an empty ref-list resolves ok with no edges", async () => {
  const store = await stepped();
  const res = await renderAgentStep(store, "stepper", "1");
  assert.equal(res.ok, true);
  if (!res.ok) return;
  assert.deepEqual(res.refs, []);
});

test("renderAgentStep: an unknown step fails closed listing the agent's declared step keys", async () => {
  const store = await stepped();
  const res = await renderAgentStep(store, "stepper", "nope");
  assert.equal(res.ok, false);
  if (res.ok) return;
  assert.match(res.reason, /no workflow step "nope"/);
  assert.deepEqual(res.steps, ["session_start", "1"]);
});

test("renderAgentStep: an unknown agent fails closed with the agent list; a missing step asks for one", async () => {
  const store = await stepped();
  const unknownAgent = await renderAgentStep(store, "ghost", "session_start");
  assert.equal(unknownAgent.ok, false);
  if (unknownAgent.ok) return;
  assert.deepEqual(unknownAgent.available, ["stepper"]);

  const noStep = await renderAgentStep(store, "stepper", undefined);
  assert.equal(noStep.ok, false);
  if (noStep.ok) return;
  assert.match(noStep.reason, /needs a step key/);
  assert.deepEqual(noStep.steps, ["session_start", "1"]);
});

test("renderAgentStep: an agent with NO stepRefs authored treats every step as unknown (empty steps)", async () => {
  const store = new InMemoryStore();
  await store.upsertDoc({
    id: "bare",
    kind: "agent",
    doc: {
      kind: "agent",
      title: "Bare",
      description: "no step map yet",
      oneLine: "o",
      role: "r",
      outcome: "o",
      context: ["asset:x"],
      tools: "t",
      workflow: "w",
      references: [],
    },
  });
  const res = await renderAgentStep(store, "bare", "session_start");
  assert.equal(res.ok, false);
  if (res.ok) return;
  assert.deepEqual(res.steps, []);
});

test("delegatableAgentIds excludes agents that own a dedicated surface (CLAUDE.md / SDK leaf)", async () => {
  const store = await seeded();
  await store.upsertDoc({
    id: "session-orchestrator",
    kind: "agent",
    doc: {
      kind: "agent",
      title: "Session Orchestrator",
      description: "the main loop",
      oneLine: "o",
      role: "r",
      outcome: "o",
      context: ["asset:test-principle"],
      tools: "t",
      workflow: "w",
      references: [],
    },
  });
  const ids = await delegatableAgentIds(store);
  assert.ok(!ids.includes("session-orchestrator"), "the orchestrator owns CLAUDE.md, not a subagent file");
  assert.ok(ids.includes("clean-agent"));
  assert.ok(ids.includes("broken-agent"));
  assert.equal(DEDICATED_SURFACE_AGENTS.has("session-orchestrator"), true);
});
