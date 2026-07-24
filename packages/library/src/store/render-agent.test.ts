import { test } from "node:test";
import assert from "node:assert/strict";

import { InMemoryStore } from "@storytree/storage-protocol";

import {
  renderAgentPrompt,
  renderAgentEssentials,
  renderAgentDigest,
  renderAgentFile,
  renderCursorAgentFile,
  renderCodexAgentFile,
  renderGeminiAgentFile,
  renderAgentStep,
  delegatableAgentIds,
  essentialsGateViolations,
  estimateTokens,
  ESSENTIALS_TOKEN_BUDGET,
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

// ── essentials render (ADR-0156 §1 / ADR-0161: thin, DRY, fresh delegation surface) ────────────────

test("renderAgentEssentials: own prose + each rule's ONE-LINE assertion + a pull-hint + the escape hatch — NOT the injected body", async () => {
  const store = await seeded();
  const res = await renderAgentEssentials(store, "clean-agent");
  assert.equal(res.ok, true);
  if (!res.ok) return;
  const p = res.agent.prompt;
  // (a) the agent's OWN prose — verbatim, the same spine renderAgentPrompt emits
  assert.match(p, /The clean agent does one thing\./);
  assert.match(p, /It exists to test the renderer\./);
  // (b) the FLOOR — the rule's ONE-LINE assertion (its `statement` lead), plus a pull-hint for the rationale
  assert.match(p, /Always assemble from the library\./);
  assert.match(p, /storytree library artifact test-principle/);
  // (c) the ESCAPE HATCH — inline, the specialist → manager rung
  assert.match(p, /Escalate UP when blocked or out of scope/);
  assert.match(p, /session-orchestrator/);
  // the EXACT INVERSE of renderAgentPrompt's "INJECTS the content" test: the full Why/How BODY is NOT inlined
  assert.doesNotMatch(p, /one source of truth beats hand-copy drift/); // the `why` body
  assert.doesNotMatch(p, /render, never restate/); // the `howToApply` body
  assert.doesNotMatch(p, /### Test Principle/); // no full-body injection header
  assert.deepEqual(res.agent.missingRefs, []);
});

test("renderAgentEssentials: a dangling floor ref is FLAGGED inline and collected (the drift guard build:agents fails closed on)", async () => {
  const store = await seeded();
  const res = await renderAgentEssentials(store, "broken-agent");
  assert.equal(res.ok, true);
  if (!res.ok) return;
  assert.deepEqual(res.agent.missingRefs, ["asset:ghost-ref"]);
  assert.match(res.agent.prompt, /MISSING REF: asset:ghost-ref/);
});

test("renderAgentEssentials: per-step DOORS are generated from stepRefs (one door per workflow step)", async () => {
  const store = await stepped();
  const res = await renderAgentEssentials(store, "stepper");
  assert.equal(res.ok, true);
  if (!res.ok) return;
  const p = res.agent.prompt;
  assert.match(p, /## Doors/);
  // one door line per declared step, pointing at the just-in-time step affordance
  assert.match(p, /storytree agents stepper --step session_start/);
  assert.match(p, /storytree agents stepper --step 1/);
  // with a step map present, context is served through the doors — NOT the fallback manifest
  assert.doesNotMatch(p, /No per-step map yet/);
});

test("renderAgentEssentials: with NO stepRefs, context refs surface as a just-in-time pointer MANIFEST (never bodies)", async () => {
  const store = await seeded();
  const res = await renderAgentEssentials(store, "clean-agent"); // has context but no stepRefs
  assert.equal(res.ok, true);
  if (!res.ok) return;
  const p = res.agent.prompt;
  assert.match(p, /## Doors/);
  assert.match(p, /No per-step map yet/);
  assert.match(p, /storytree library artifact test-principle/); // the context ref as a pointer, not a body
});

test("renderAgentEssentials: an unknown agent fails closed with the list of agents that DO exist", async () => {
  const store = await seeded();
  const res = await renderAgentEssentials(store, "nope");
  assert.equal(res.ok, false);
  if (res.ok) return;
  assert.deepEqual(res.available, ["broken-agent", "clean-agent"]);
});

// ── .claude/agents push surface (ADR-0052) ──────────────────────────────────────────────────────

test("renderAgentFile wraps the assembled prompt in Claude Code subagent frontmatter + marker", async () => {
  const store = await seeded();
  const res = await renderAgentFile(store, "clean-agent");
  assert.equal(res.ok, true);
  if (!res.ok) return;
  // model tier defaults to `inherit` when the agent doc carries none (ADR-0182, amending ADR-0178 §3).
  assert.match(
    res.content,
    /^---\nname: clean-agent\ndescription: "a role whose refs all resolve"\nmodel: inherit\n---\n\n/,
  );
  assert.ok(res.content.includes(GENERATED_AGENT_MARKER));
  assert.match(res.content, /The clean agent does one thing\./); // the assembled prompt body
  assert.match(res.content, /Always assemble from the library\./); // injected ref content
  assert.ok(res.content.endsWith("\n"));
  assert.ok(!res.content.endsWith("\n\n"));
  assert.deepEqual(res.missingRefs, []);
});

test("both harness renderers emit the same model tier over the same essentials (ADR-0182)", async () => {
  const store = await seeded();
  const cursor = await renderCursorAgentFile(store, "clean-agent");
  const claude = await renderAgentFile(store, "clean-agent");
  assert.equal(cursor.ok, true);
  assert.equal(claude.ok, true);
  if (!cursor.ok || !claude.ok) return;

  // an untiered agent renders `model: inherit` in BOTH surfaces (the ADR-0178 default) — so the
  // Claude and Cursor wrappers are now byte-identical (the model line is no longer Cursor-only).
  assert.match(
    cursor.content,
    /^---\nname: clean-agent\ndescription: "a role whose refs all resolve"\nmodel: inherit\n---\n\n/,
  );
  assert.ok(cursor.content.includes(GENERATED_AGENT_MARKER));
  assert.equal(cursor.content, claude.content, "both harness surfaces render the same tier line");
  assert.deepEqual(cursor.missingRefs, []);
});

test("renderCodexAgentFile emits the native custom-agent TOML shape without a foreign model tier", async () => {
  const store = await seeded();
  const res = await renderCodexAgentFile(store, "clean-agent");
  assert.equal(res.ok, true);
  if (!res.ok) return;

  assert.match(res.content, /^name = "clean-agent"\ndescription = "a role whose refs all resolve"\n/);
  assert.match(res.content, /developer_instructions = """\n/);
  assert.ok(res.content.includes(GENERATED_AGENT_MARKER));
  assert.match(res.content, /The clean agent does one thing\./);
  assert.ok(!res.content.includes("model ="), "Codex inherits its spawning session model");
  assert.ok(res.content.endsWith("\n"));
  assert.deepEqual(res.missingRefs, []);
});

test("renderCodexAgentFile escapes a multiline prompt that contains TOML delimiters", async () => {
  const store = await seeded();
  await store.upsertDoc({
    id: "toml-agent",
    kind: "agent",
    doc: {
      kind: "agent",
      title: "TOML Agent",
      description: 'has a "quote" and a: colon',
      oneLine: "o",
      role: 'Keep the literal """ delimiter and \\ path.',
      outcome: "o",
      context: ["asset:test-principle"],
      tools: "t",
      workflow: "w",
      references: [],
    },
  });
  const res = await renderCodexAgentFile(store, "toml-agent");
  assert.equal(res.ok, true);
  if (!res.ok) return;
  assert.match(res.content, /description = "has a \\"quote\\" and a: colon"/);
  assert.match(res.content, /literal \\""" delimiter and \\\\ path/);
});

test("renderGeminiAgentFile emits native Markdown frontmatter and inherits the Gemini session model", async () => {
  const store = await seeded();
  const res = await renderGeminiAgentFile(store, "clean-agent");
  assert.equal(res.ok, true);
  if (!res.ok) return;

  assert.match(
    res.content,
    /^---\nname: clean-agent\ndescription: "a role whose refs all resolve"\n---\n\n/,
  );
  assert.ok(res.content.includes(GENERATED_AGENT_MARKER));
  assert.match(res.content, /The clean agent does one thing\./);
  assert.ok(!res.content.includes("\nmodel:"), "Gemini inherits the spawning session model");
  assert.ok(res.content.endsWith("\n"));
  assert.deepEqual(res.missingRefs, []);
});

test("a pinned Claude model tier is not translated into a foreign Gemini model id", async () => {
  const store = await seeded();
  await store.upsertDoc({
    id: "sonnet-agent",
    kind: "agent",
    doc: {
      kind: "agent",
      title: "Sonnet Agent",
      description: "a workhorse pinned to sonnet",
      oneLine: "The sonnet agent is a mechanical workhorse.",
      role: "It exists to test the model tier pin.",
      outcome: "Its harness files carry model: sonnet.",
      context: ["asset:test-principle"],
      tools: "none",
      workflow: "orient, then stop.",
      model: "sonnet",
      references: [],
    },
  });
  const claude = await renderAgentFile(store, "sonnet-agent");
  const cursor = await renderCursorAgentFile(store, "sonnet-agent");
  const gemini = await renderGeminiAgentFile(store, "sonnet-agent");
  assert.equal(claude.ok, true);
  assert.equal(cursor.ok, true);
  assert.equal(gemini.ok, true);
  if (!claude.ok || !cursor.ok || !gemini.ok) return;
  assert.match(claude.content, /\nmodel: sonnet\n---\n/);
  assert.match(cursor.content, /\nmodel: sonnet\n---\n/);
  assert.ok(!gemini.content.includes("\nmodel:"));
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

// ── the essentials size/structure + step→refs integrity gate (ADR-0156 §5 / ADR-0161 decision 5) ──
// The fence check:agents (build-agents.ts --check) runs over every rendered .claude/agents/*.md so the
// thinned prompts can't silently re-bloat toward the full-inline path. Red-green over the four asserts.

test("essentials gate: a clean essentials render passes — incl. a step-map-LESS agent (the inc-4 sequencing trap)", async () => {
  const store = await seeded();
  const file = await renderAgentFile(store, "clean-agent");
  assert.equal(file.ok, true);
  if (!file.ok) return;
  // clean-agent has a `context` ref but NO stepRefs → the scoped "unattached context" check is a no-op,
  // so its "No per-step map yet" manifest is NOT a violation. This is the whole green corpus's shape today.
  const violations = await essentialsGateViolations(store, "clean-agent", file.content);
  assert.deepEqual(violations, []);
});

test("essentials gate: a file over the token budget REDS, naming the budget + the file", async () => {
  const store = await seeded();
  const bloated = "x".repeat((ESSENTIALS_TOKEN_BUDGET + 500) * 4); // ~+500 tokens over, via the chars/4 proxy
  assert.ok(estimateTokens(bloated) > ESSENTIALS_TOKEN_BUDGET);
  const violations = await essentialsGateViolations(store, "clean-agent", bloated);
  assert.equal(violations.length, 1);
  assert.ok(violations.some((v) => /over the 6000-token essentials budget/.test(v)));
  assert.ok(violations.some((v) => /clean-agent\.md/.test(v)));
});

test("essentials gate: a full ref BODY inline REDS — the exact ADR-0052→0156 regression (renderAgentPrompt content)", async () => {
  const store = await seeded();
  const full = await renderAgentPrompt(store, "clean-agent"); // the FAT path — injects `### <title>  [<kind>]`
  assert.equal(full.ok, true);
  if (!full.ok) return;
  assert.match(full.agent.prompt, /### Test Principle\s+\[principle\]/); // the injection header the gate keys off
  const violations = await essentialsGateViolations(store, "clean-agent", full.agent.prompt);
  assert.ok(violations.some((v) => /inlines a full ref BODY/.test(v)), "the body-injection header must be flagged");
});

test("essentials gate: a stepRefs step that names no real workflow step REDS", async () => {
  const store = await seeded();
  await store.upsertDoc({
    id: "bad-step-agent",
    kind: "agent",
    doc: {
      kind: "agent", title: "Bad Step", description: "a step key that isn't a workflow step",
      oneLine: "o", role: "r", outcome: "o", context: [], tools: "t",
      workflow: "orient, then stop.", references: [],
      stepRefs: [{ step: "deploy", refs: [] }], // "deploy" is not named in the workflow prose
    },
  });
  const violations = await essentialsGateViolations(store, "bad-step-agent", "ok");
  assert.equal(violations.length, 1);
  assert.ok(violations.some((v) => /step "deploy" is not named in the agent's `workflow` prose/.test(v)));
});

test("essentials gate: a dangling stepRefs ref key REDS (the integrity fence over structured edges)", async () => {
  const store = await seeded();
  await store.upsertDoc({
    id: "dangling-step-agent",
    kind: "agent",
    doc: {
      kind: "agent", title: "Dangling Step", description: "a step ref that resolves to nothing",
      oneLine: "o", role: "r", outcome: "o", context: [], tools: "t",
      workflow: "orient, then stop.", references: [],
      stepRefs: [{ step: "orient", refs: ["asset:ghost-ref"] }], // step is valid; the ref resolves to nothing
    },
  });
  const violations = await essentialsGateViolations(store, "dangling-step-agent", "ok");
  assert.equal(violations.length, 1);
  assert.ok(violations.some((v) => /dangling ref asset:ghost-ref/.test(v)));
});

test("essentials gate: with a step map, a context ref attached to NO step REDS — but a step-map-less agent does NOT (scoped)", async () => {
  const store = await seeded();
  // an agent WITH a step map whose context ref is pulled by no step → an unattached "just-in-case" rider
  await store.upsertDoc({
    id: "rider-agent",
    kind: "agent",
    doc: {
      kind: "agent", title: "Rider", description: "context attached to no step",
      oneLine: "o", role: "r", outcome: "o", context: ["asset:test-principle"], tools: "t",
      workflow: "orient, then stop.", references: [],
      stepRefs: [{ step: "orient", refs: [] }], // non-empty step map, but test-principle is attached nowhere
    },
  });
  const riderViolations = await essentialsGateViolations(store, "rider-agent", "ok");
  assert.equal(riderViolations.length, 1);
  assert.ok(riderViolations.some((v) => /context ref asset:test-principle is attached to no workflow step/.test(v)));

  // the SAME unattached context on a step-map-LESS agent (clean-agent) is NOT a violation — the scope guard
  const cleanFile = await renderAgentFile(store, "clean-agent");
  assert.equal(cleanFile.ok, true);
  if (!cleanFile.ok) return;
  assert.deepEqual(await essentialsGateViolations(store, "clean-agent", cleanFile.content), []);
});

test("essentials gate: a valid step map with attached context passes (the inc-5 target shape)", async () => {
  const store = await seeded();
  await store.upsertDoc({
    id: "good-step-agent",
    kind: "agent",
    doc: {
      kind: "agent", title: "Good Step", description: "a well-formed step map",
      oneLine: "o", role: "r", outcome: "o", context: ["asset:test-principle"], tools: "t",
      workflow: "session_start: orient. then stop.", references: [],
      stepRefs: [{ step: "session_start", refs: ["asset:test-principle"] }],
    },
  });
  const file = await renderAgentFile(store, "good-step-agent");
  assert.equal(file.ok, true);
  if (!file.ok) return;
  assert.deepEqual(await essentialsGateViolations(store, "good-step-agent", file.content), []);
});

test("essentials gate: a non-agent / missing id fails closed", async () => {
  const store = await seeded();
  const violations = await essentialsGateViolations(store, "test-principle", "ok"); // a principle, not an agent
  assert.equal(violations.length, 1);
  assert.ok(violations.some((v) => /not an agent artifact/.test(v)));
});
