/**
 * Contract tests for the spawn_glue_worker tool (spawn-glue-tool capability,
 * scoped-glue-actuator / ADR-0160 D1/D5.i).
 *
 * Pins the third claim-gated spawn tool on buildSpawnTools — the scoped-edit affordance the desktop
 * chat lacked — AND the honesty fix that rides along (spawn_builder's phantom `userPrompt` dropped):
 *
 *   sgt-glue-tool-mounts-claim-gated-with-paths-and-prompt — buildSpawnTools returns spawn_glue_worker
 *     (schema { unitId, paths, userPrompt }) gate-wrapped by claimGatedSpawn; on an acquired claim the
 *     handler receives the caller-declared paths + userPrompt (threaded to the runner's fence).
 *   sgt-glue-tool-runs-the-gate-then-the-handler — claim-acquire runs STRICTLY BEFORE the handler; a
 *     refused claim returns the holder-naming refusal text and the handler is NEVER invoked.
 *   sgt-glue-spawn-returns-summary-never-a-verdict — the tool returns the handler's summary TEXT; no
 *     verdict-shaped payload appears in the result.
 *   sgt-spawn-builder-drops-phantom-userprompt — spawn_builder's schema no longer advertises
 *     userPrompt (a builder drives the WHOLE unit's registered proof, no per-run scope).
 *
 * Every test is OFFLINE: recording handlers + a recording claim store, no live SDK spend.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import { z } from "zod";

import { buildSpawnTools } from "./spawn-tool-surface.js";
import type { SpawnSurfaceDeps } from "./spawn-tool-surface.js";

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

const HOLDER = {
  unitId: "story-x",
  sessionId: "sess-other",
  branch: "claude/sess-other",
  intent: "orchestrate",
  claimedAt: "2026-07-05T00:00:00.000Z",
  heartbeatAt: "2026-07-05T00:00:00.000Z",
};

/** What the recording glue handler captured (to assert paths/userPrompt/maxTurns threading). */
interface GlueCapture {
  args?: { unitId: string; paths: string[]; userPrompt: string; maxTurns?: number };
}

function makeSpawnDeps(opts?: {
  refuse?: boolean;
  order?: string[];
  glue?: GlueCapture;
}): SpawnSurfaceDeps {
  const order = opts?.order ?? [];
  return {
    store: {
      async claim(req: { unitId: string; sessionId: string; branch: string }) {
        order.push("claim");
        if (opts?.refuse === true) return { acquired: false as const, heldBy: HOLDER };
        return {
          acquired: true as const,
          claim: {
            unitId: req.unitId,
            sessionId: req.sessionId,
            branch: req.branch,
            intent: "orchestrate",
            claimedAt: "2026-07-05T00:00:00.000Z",
            heartbeatAt: "2026-07-05T00:00:00.000Z",
          },
          reclaimed: false,
        };
      },
      async bumpHeartbeat(_unitId: string): Promise<void> {},
    },
    sessionId: "sess-test",
    branch: "claude/sess-test",
    spawnStoryAuthor: async () => "story-author session finished (stub)",
    spawnBuilder: async () => "builder run-123 dispatched (stub)",
    spawnGlueWorker: async (args, _onTrace) => {
      order.push("handler:spawn_glue_worker");
      if (opts?.glue !== undefined) opts.glue.args = args;
      return "glue worker session finished; edited apps/desktop/electron/backend-entry.ts (stub)";
    },
  };
}

/**
 * A spawn tool viewed loosely for handler-driving tests. buildSpawnTools returns a UNION of the
 * three tools, so a union-typed `.handler` demands the INTERSECTION of all three arg schemas — e.g.
 * the glue tool's optional per-run `maxTurns` (ADR-0163 Gap A) would force every unrelated handler
 * call to supply it. The runtime handler validates its own args, so tests drive it through this view.
 */
type LooseSpawnTool = {
  name: string;
  inputSchema: Record<string, unknown>;
  handler: (
    args: Record<string, unknown>,
    extra: Record<string, unknown>,
  ) => Promise<{ content: Array<{ type: string; text?: string }> }>;
};

function toolNamed(tools: ReturnType<typeof buildSpawnTools>, name: string): LooseSpawnTool {
  const t = tools.find((d) => d.name === name);
  assert.ok(t !== undefined, `expected the built surface to carry '${name}'`);
  return t as unknown as LooseSpawnTool;
}

function resultText(result: { content: Array<{ type: string; text?: string }> }): string {
  return result.content.map((c) => c.text ?? "").join("\n");
}

/** The param names a built tool advertises (inputSchema is the raw zod-shape object). */
function schemaKeys(t: LooseSpawnTool): string[] {
  return Object.keys(t.inputSchema).sort();
}

// ---------------------------------------------------------------------------
// sgt-glue-tool-mounts-claim-gated-with-paths-and-prompt
// ---------------------------------------------------------------------------

test("sgt-glue-tool-mounts-claim-gated-with-paths-and-prompt: buildSpawnTools returns spawn_glue_worker (schema { unitId, paths, userPrompt }); on an acquired claim the handler receives the caller-declared paths and userPrompt", async () => {
  const glue: GlueCapture = {};
  const tools = buildSpawnTools(makeSpawnDeps({ glue }));

  const glueTool = toolNamed(tools, "spawn_glue_worker");
  assert.deepEqual(
    schemaKeys(glueTool),
    ["maxTurns", "paths", "unitId", "userPrompt"],
    "spawn_glue_worker must advertise { unitId, paths, userPrompt } + the optional per-run maxTurns (ADR-0163 Gap A)",
  );

  await glueTool.handler(
    {
      unitId: "desktop-build-mount",
      paths: ["apps/desktop/electron/backend-entry.ts"],
      userPrompt: "add these 3 routes and stop",
    },
    {},
  );

  assert.deepEqual(
    glue.args,
    {
      unitId: "desktop-build-mount",
      paths: ["apps/desktop/electron/backend-entry.ts"],
      userPrompt: "add these 3 routes and stop",
    },
    "the caller-declared paths + userPrompt must be threaded to the glue handler (→ the runner's fence)",
  );
});

// ---------------------------------------------------------------------------
// sgt-glue-tool-runs-the-gate-then-the-handler
// ---------------------------------------------------------------------------

test("sgt-glue-tool-runs-the-gate-then-the-handler: claim-acquire runs STRICTLY BEFORE the handler; a refused claim returns the holder-naming refusal text and the handler is NEVER invoked (ADR-0138 §3)", async () => {
  // Acquire arm: claim strictly before the handler.
  const order: string[] = [];
  const okTools = buildSpawnTools(makeSpawnDeps({ order }));
  await toolNamed(okTools, "spawn_glue_worker").handler(
    { unitId: "story-x", paths: ["apps/desktop/**"], userPrompt: "edit" },
    {},
  );
  assert.deepEqual(
    order,
    ["claim", "handler:spawn_glue_worker"],
    "the claim must be acquired BEFORE the glue handler runs (no claim, no subagent)",
  );

  // Refuse arm: holder-named refusal text, handler never runs.
  const refusedOrder: string[] = [];
  const refusedTools = buildSpawnTools(makeSpawnDeps({ refuse: true, order: refusedOrder }));
  const result = await toolNamed(refusedTools, "spawn_glue_worker").handler(
    { unitId: "story-x", paths: ["apps/desktop/**"], userPrompt: "edit" },
    {},
  );
  const text = resultText(result as { content: Array<{ type: string; text?: string }> });
  assert.match(text, /sess-other/, "the refusal must name the holder session");
  assert.match(text, /claude\/sess-other/, "the refusal must name the holder branch");
  assert.ok(
    !refusedOrder.some((e) => e.startsWith("handler:")),
    `on a refused claim the glue handler must NEVER run; recorded: ${JSON.stringify(refusedOrder)}`,
  );
});

// ---------------------------------------------------------------------------
// sgt-glue-spawn-returns-summary-never-a-verdict
// ---------------------------------------------------------------------------

test("sgt-glue-spawn-returns-summary-never-a-verdict: the text a spawn_glue_worker call returns to the model is the handler's summary; no verdict-shaped payload appears in the tool result (ADR-0091)", async () => {
  const tools = buildSpawnTools(makeSpawnDeps());
  const result = await toolNamed(tools, "spawn_glue_worker").handler(
    { unitId: "story-x", paths: ["apps/desktop/electron/backend-entry.ts"], userPrompt: "edit" },
    {},
  );

  const content = (result as { content: Array<{ type: string; text?: string }> }).content;
  assert.ok(content.length > 0, "the tool must return content");
  for (const item of content) {
    assert.equal(item.type, "text", "every glue tool result item must be plain text");
  }
  assert.match(
    resultText(result as { content: Array<{ type: string; text?: string }> }),
    /glue worker session finished/,
    "the handler's summary text must return to the model",
  );

  const serialized = JSON.stringify(result);
  for (const forbidden of ["verdict", "signedBy", "signing", "proofStatus", "proof_status"]) {
    assert.ok(
      !serialized.includes(`"${forbidden}"`),
      `no '${forbidden}' field may appear — the glue worker only edits; the spine signs out-of-band`,
    );
  }
});

// ---------------------------------------------------------------------------
// sgt-spawn-builder-drops-phantom-userprompt
// ---------------------------------------------------------------------------

test("sgt-spawn-builder-drops-phantom-userprompt: spawn_builder's schema no longer advertises a userPrompt param (a builder drives the WHOLE unit's proof — no per-run scope; ADR-0160 D5.i)", async () => {
  const tools = buildSpawnTools(makeSpawnDeps());

  const builder = toolNamed(tools, "spawn_builder");
  assert.deepEqual(
    schemaKeys(builder),
    ["unitId"],
    "spawn_builder must advertise ONLY { unitId } — the phantom userPrompt (silently discarded) is dropped",
  );

  // And the scoped-intent home is now spawn_glue_worker (which DOES honour userPrompt).
  const glue = toolNamed(tools, "spawn_glue_worker");
  assert.ok(
    schemaKeys(glue).includes("userPrompt"),
    "scoped intent now lives on spawn_glue_worker, which honours userPrompt",
  );
});

// ---------------------------------------------------------------------------
// sgt-glue-tool-accepts-per-run-max-turns — the OPTIONAL per-run turn ceiling
// (ADR-0163 Gap A): a glue task can be open-ended, and inheriting the
// story-author-tuned spawn default (~40) can cut the worker off after it has
// written the complete edit but before it can self-confirm. The tool schema
// accepts an optional maxTurns and the value reaches the injected handler.
// ---------------------------------------------------------------------------

test("sgt-glue-tool-accepts-per-run-max-turns: the schema accepts an optional positive-int maxTurns (omit → spawn default) and rejects a non-positive/non-integer one", () => {
  const glue = toolNamed(buildSpawnTools(makeSpawnDeps()), "spawn_glue_worker");
  const schema = z.object(glue.inputSchema as z.ZodRawShape);
  const base = { unitId: "story-x", paths: ["apps/x.ts"], userPrompt: "add a route" };

  assert.equal(schema.safeParse({ ...base, maxTurns: 45 }).success, true, "a positive-int maxTurns is accepted");
  assert.equal(schema.safeParse(base).success, true, "maxTurns is optional — omit to use the spawn default");
  assert.equal(schema.safeParse({ ...base, maxTurns: 0 }).success, false, "0 is rejected (would abort the session)");
  assert.equal(schema.safeParse({ ...base, maxTurns: -5 }).success, false, "a negative maxTurns is rejected");
  assert.equal(schema.safeParse({ ...base, maxTurns: 2.5 }).success, false, "a non-integer maxTurns is rejected");
});

test("sgt-glue-tool-accepts-per-run-max-turns: a per-run maxTurns reaches the injected spawnGlueWorker args; omitting it forwards no maxTurns (conditional spread — exactOptionalPropertyTypes)", async () => {
  // With maxTurns → threaded to the handler.
  const withCap: GlueCapture = {};
  const withTool = toolNamed(buildSpawnTools(makeSpawnDeps({ glue: withCap })), "spawn_glue_worker");
  await withTool.handler(
    { unitId: "story-x", paths: ["apps/x.ts"], userPrompt: "investigate + edit", maxTurns: 45 },
    {},
  );
  assert.deepEqual(
    withCap.args,
    { unitId: "story-x", paths: ["apps/x.ts"], userPrompt: "investigate + edit", maxTurns: 45 },
    "the per-run maxTurns must reach the glue handler args alongside paths + userPrompt",
  );

  // Without maxTurns → the key is NOT forwarded (so the composition falls back to the spawn default).
  const noCap: GlueCapture = {};
  const noTool = toolNamed(buildSpawnTools(makeSpawnDeps({ glue: noCap })), "spawn_glue_worker");
  await noTool.handler({ unitId: "story-x", paths: ["apps/x.ts"], userPrompt: "edit" }, {});
  assert.deepEqual(
    noCap.args,
    { unitId: "story-x", paths: ["apps/x.ts"], userPrompt: "edit" },
    "an omitted maxTurns must NOT be forwarded — the handler conditional-spreads it (exactOptionalPropertyTypes)",
  );
  assert.equal(
    Object.prototype.hasOwnProperty.call(noCap.args ?? {}, "maxTurns"),
    false,
    "no maxTurns key when the caller omits it",
  );
});
