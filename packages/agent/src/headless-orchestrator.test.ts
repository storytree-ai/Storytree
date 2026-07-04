/**
 * Contract tests for the headless orchestrator runner
 * (`packages/agent/src/headless-orchestrator.ts`).
 *
 * The runner mirrors `runSdkCurator` with one key difference: where the curator
 * sets `tools: []` (its neighbourhood is in the prompt), the orchestrator wires
 * the read-only orientation tool surface (tree/library/noticeboard) via an
 * injectable `OrientationRunner` and the `createSdkMcpServer` MCP pattern
 * (`ClaudeAgentAuthor`'s precedent in sdk-author.ts).
 *
 * Behaviours pinned:
 *   1. Success — proposal text (from `result.result`) + cost + turns extracted.
 *   2. Fail-closed — no result message → { ok: false, error }.
 *   3. Fail-closed — non-success subtype → { ok: false, error }, cost still surfaced.
 *   4. Never throws — throwing queryFn → { ok: false, error }.
 *   5. Single-session guard — second concurrent run refused (typed result, never a throw).
 *   6. Read-only tool surface — orientation tool names appear in allowedTools, no Write/Edit/Bash.
 *   7. Integration — injected runner is usable by orientation tools; proposal extracted end-to-end.
 *
 * Every test is OFFLINE: the queryFn seam is injected, so no live SDK spend. The
 * live `query()` path is the Story UAT human-witness leg.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

// RED: headless-orchestrator.ts does not exist yet — module-not-found is the right-kind red.
import { runHeadlessOrchestrator } from "./headless-orchestrator.js";
import type { SdkQueryFn } from "./sdk-author.js";
import { buildOrientationTools } from "./orientation-tools.js";
import type { OrientationEnvelope } from "./orientation-tools.js";

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function queryYielding(messages: unknown[]): SdkQueryFn {
  return () =>
    (async function* () {
      for (const m of messages) yield m;
    })();
}

const okResult = {
  type: "result",
  subtype: "success",
  is_error: false,
  num_turns: 3,
  total_cost_usd: 0.042,
  result: "My proposal: adopt the slow-growth-minimum-to-green principle as the next unit.",
};

/** A stub OrientationRunner that returns a fixed envelope for any argv/deps. */
function fixedRunner(envelope: OrientationEnvelope) {
  return async (_argv: readonly string[], _deps: unknown): Promise<OrientationEnvelope> =>
    envelope;
}

// ---------------------------------------------------------------------------
// 1. Success path — proposal text + cost + turns extracted from result message
// ---------------------------------------------------------------------------

test("runHeadlessOrchestrator: returns proposal text + cost + turns on a successful session", async () => {
  const r = await runHeadlessOrchestrator({
    systemPrompt: "You are the orchestrator agent.",
    userPrompt: "Orient and propose the next unit.",
    queryFn: queryYielding([{ type: "assistant" }, okResult]),
  });

  assert.equal(r.ok, true, "successful session must return ok:true");
  assert.equal(
    r.proposal,
    "My proposal: adopt the slow-growth-minimum-to-green principle as the next unit.",
    "proposal must be the text from the SDK result message's result field",
  );
  assert.equal(r.costUsd, 0.042, "cost must be read from total_cost_usd");
  assert.equal(r.turns, 3, "turns must be read from num_turns");
});

// ---------------------------------------------------------------------------
// 1b. No USD budget ceiling by default — the turn cap is the brake (ADR-0131)
// ---------------------------------------------------------------------------

test("runHeadlessOrchestrator: runs with NO USD budget ceiling AND no turn ceiling by default (ADR-0131 / ADR-0151)", async () => {
  let opts: { maxBudgetUsd?: number; maxTurns?: number } | undefined;
  let hasMaxTurnsKey = false;
  const queryFn: SdkQueryFn = (q) => {
    opts = (q as { options: { maxBudgetUsd?: number; maxTurns?: number } }).options;
    hasMaxTurnsKey = "maxTurns" in (q as { options: object }).options;
    return (async function* () {
      yield okResult;
    })();
  };
  const r = await runHeadlessOrchestrator({ systemPrompt: "SYS", userPrompt: "orient", queryFn });
  assert.equal(r.ok, true);
  // The session is subscription-funded (ADR-0030); ADR-0108's deferred per-session budget is resolved
  // in the no-ceiling direction (ADR-0131) — so no phantom dollar wall by default…
  assert.equal(opts?.maxBudgetUsd, undefined, "no maxBudgetUsd unless `orchestrate --budget` is set");
  // …and the orchestrator session runs UNBOUNDED (ADR-0151): the human-watched loop keeps no turn cap
  // by default (the desktop chat / terminal `orchestrate`), so a healthy long orient/propose can't be
  // false-failed by a fixed ceiling. No `maxTurns` key is even handed to the SDK.
  assert.equal(hasMaxTurnsKey, false, "no maxTurns handed to the SDK by default — the session is unbounded");
  assert.equal(opts?.maxTurns, undefined, "unbounded by default (ADR-0151)");
});

test("runHeadlessOrchestrator: an explicit maxTurns RE-imposes the turn cap (the debug/bounded-run override, ADR-0151)", async () => {
  let opts: { maxTurns?: number } | undefined;
  const queryFn: SdkQueryFn = (q) => {
    opts = (q as { options: { maxTurns?: number } }).options;
    return (async function* () {
      yield okResult;
    })();
  };
  await runHeadlessOrchestrator({ systemPrompt: "SYS", userPrompt: "orient", maxTurns: 12, queryFn });
  assert.equal(opts?.maxTurns, 12, "an explicit maxTurns is threaded to the SDK — the cap can be re-imposed");
});

test("runHeadlessOrchestrator: passes an explicit maxBudgetUsd through (the opt-in cap survives, ADR-0131)", async () => {
  let opts: { maxBudgetUsd?: number } | undefined;
  const queryFn: SdkQueryFn = (q) => {
    opts = (q as { options: { maxBudgetUsd?: number } }).options;
    return (async function* () {
      yield okResult;
    })();
  };
  await runHeadlessOrchestrator({ systemPrompt: "SYS", userPrompt: "orient", maxBudgetUsd: 2, queryFn });
  assert.equal(opts?.maxBudgetUsd, 2, "an operator-set budget is still honoured as a ceiling");
});

// ---------------------------------------------------------------------------
// 2. Fail-closed — stream carries no result message
// ---------------------------------------------------------------------------

test("runHeadlessOrchestrator: fails closed when the stream carries no result message", async () => {
  const r = await runHeadlessOrchestrator({
    systemPrompt: "SYS",
    userPrompt: "orient",
    queryFn: queryYielding([{ type: "assistant" }]),
  });

  assert.equal(r.ok, false, "session without a result message must return ok:false");
  assert.match(
    r.error ?? "",
    /without a result/,
    "error must describe the missing result message",
  );
});

// ---------------------------------------------------------------------------
// 3. Fail-closed — non-success / error result; cost still surfaced
// ---------------------------------------------------------------------------

test("runHeadlessOrchestrator: fails closed on non-success result, surfacing cost", async () => {
  const r = await runHeadlessOrchestrator({
    systemPrompt: "SYS",
    userPrompt: "x",
    queryFn: queryYielding([
      {
        type: "result",
        subtype: "error_max_turns",
        is_error: true,
        num_turns: 6,
        total_cost_usd: 0.5,
        errors: ["hit the cap"],
      },
    ]),
  });

  assert.equal(r.ok, false, "error result must return ok:false");
  assert.equal(r.costUsd, 0.5, "cost is still reported on a failed session");
  assert.match(r.error ?? "", /error_max_turns/, "error must surface the result subtype");
});

// ---------------------------------------------------------------------------
// 4. Never throws — a throwing queryFn is returned as an error result
// ---------------------------------------------------------------------------

test("runHeadlessOrchestrator: never throws — a throwing queryFn is returned as an error result", async () => {
  const throwing: SdkQueryFn = () =>
    (async function* () {
      throw new Error("network failure");
      // eslint-disable-next-line no-unreachable
      yield {};
    })();

  const r = await runHeadlessOrchestrator({
    systemPrompt: "SYS",
    userPrompt: "x",
    queryFn: throwing,
  });

  assert.equal(r.ok, false, "throwing queryFn must return ok:false (never re-throw)");
  assert.match(r.error ?? "", /network failure/, "error must carry the thrown message");
});

// ---------------------------------------------------------------------------
// 5. Single-session guard — second concurrent run is refused (typed, never a throw)
// ---------------------------------------------------------------------------

test("runHeadlessOrchestrator: refuses a second concurrent run while one is in flight", async () => {
  // The first run's queryFn blocks on a promise until we explicitly unlock it,
  // keeping the first run in-flight for the duration of the test.
  let unlock: () => void;
  const blocker = new Promise<void>((resolve) => {
    unlock = resolve;
  });

  const slowQuery: SdkQueryFn = () =>
    (async function* () {
      await blocker;
      yield okResult;
    })();

  // Start the first run — it stays in-flight until unlock() is called.
  const first = runHeadlessOrchestrator({
    systemPrompt: "SYS",
    userPrompt: "orient",
    queryFn: slowQuery,
  });

  // Yield control twice so the first run can set its in-flight guard before the
  // slow query suspends.
  await Promise.resolve();
  await Promise.resolve();

  // The second run, started while the first is in-flight, must be refused.
  const second = await runHeadlessOrchestrator({
    systemPrompt: "SYS",
    userPrompt: "orient",
    queryFn: queryYielding([okResult]),
  });

  assert.equal(second.ok, false, "second concurrent run must be refused with ok:false");
  assert.match(
    second.error ?? "",
    /in.?flight|concurrent|running|busy|session/i,
    "refusal must describe the concurrency reason",
  );

  // Unblock and drain the first run — no leaked async handles.
  unlock!();
  await first;
});

// ---------------------------------------------------------------------------
// 5b. Streaming — assistant text deltas are forwarded to onDelta as they arrive,
//     and the session enables includePartialMessages (ADR-0108 Phase 2 streaming)
// ---------------------------------------------------------------------------

/** Build an SDK partial-assistant streaming message carrying one text-delta fragment.
 *  Mirrors the live `SDKPartialAssistantMessage` shape so the scripted double matches `query()`. */
function textDeltaMessage(text: string): unknown {
  return {
    type: "stream_event",
    event: { type: "content_block_delta", index: 0, delta: { type: "text_delta", text } },
    parent_tool_use_id: null,
    uuid: "u",
    session_id: "s",
  };
}

test("runHeadlessOrchestrator: forwards assistant text deltas to onDelta in order and enables includePartialMessages", async () => {
  const deltas: string[] = [];
  let capturedOptions: unknown;

  const streamingQuery: SdkQueryFn = ({ options }) => {
    capturedOptions = options;
    return (async function* () {
      yield textDeltaMessage("Orient");
      yield textDeltaMessage("ing on ");
      yield textDeltaMessage("the tree…");
      // A non-text partial (tool-input JSON) must NOT be forwarded as prose.
      yield {
        type: "stream_event",
        event: {
          type: "content_block_delta",
          index: 1,
          delta: { type: "input_json_delta", partial_json: '{"a":1}' },
        },
        parent_tool_use_id: null,
        uuid: "u2",
        session_id: "s",
      };
      yield okResult;
    })();
  };

  const r = await runHeadlessOrchestrator({
    systemPrompt: "SYS",
    userPrompt: "orient",
    onDelta: (t) => deltas.push(t),
    queryFn: streamingQuery,
  });

  assert.equal(r.ok, true, "a streaming session must still terminate with the result message");
  assert.deepEqual(
    deltas,
    ["Orient", "ing on ", "the tree…"],
    "every text_delta fragment must be forwarded to onDelta in arrival order; non-text deltas excluded",
  );
  assert.equal(
    (capturedOptions as { includePartialMessages?: boolean }).includePartialMessages,
    true,
    "includePartialMessages must be enabled when an onDelta sink is wired",
  );
  assert.equal(
    r.proposal,
    okResult.result,
    "the authoritative proposal is still the result message's result, not the concatenated deltas",
  );
});

test("runHeadlessOrchestrator: leaves includePartialMessages off when no onDelta sink is provided", async () => {
  let capturedOptions: unknown;
  const capturingQuery: SdkQueryFn = ({ options }) => {
    capturedOptions = options;
    return (async function* () {
      yield okResult;
    })();
  };

  const r = await runHeadlessOrchestrator({
    systemPrompt: "SYS",
    userPrompt: "orient",
    queryFn: capturingQuery,
  });

  assert.equal(r.ok, true);
  assert.notEqual(
    (capturedOptions as { includePartialMessages?: boolean }).includePartialMessages,
    true,
    "a non-streaming consumer must not pay the partial-message cost (includePartialMessages stays off)",
  );
});

// ---------------------------------------------------------------------------
// 6. Read-only tool surface — orientation tools in allowedTools, no write tools
// ---------------------------------------------------------------------------

test("runHeadlessOrchestrator: wires orientation tools in allowedTools (when a runner is present) and excludes write tools", async () => {
  let capturedOptions: unknown;

  const capturingQuery: SdkQueryFn = ({ options }) => {
    capturedOptions = options;
    return (async function* () {
      yield okResult;
    })();
  };

  const r = await runHeadlessOrchestrator({
    systemPrompt: "SYS",
    userPrompt: "orient",
    // A runner IS present, so the orientation surface is wired (ADR-0108 §7 scale-down: no runner
    // → no orientation tools; see the dedicated test below).
    runner: fixedRunner({ ok: true, body: "## seed tree" }),
    queryFn: capturingQuery,
  });

  assert.equal(r.ok, true, "session must succeed with capturing queryFn");
  assert.ok(capturedOptions !== undefined, "queryFn must have been called with options");

  const opts = capturedOptions as { allowedTools?: string[]; tools?: unknown };
  const allowedTools = Array.isArray(opts.allowedTools) ? opts.allowedTools : [];

  // The orientation MCP tool names (tree/library/noticeboard) must appear in allowedTools.
  const hasOrientationTools = allowedTools.some(
    (n) => n.includes("tree") || n.includes("library") || n.includes("noticeboard"),
  );
  assert.ok(
    hasOrientationTools,
    `allowedTools must include orientation tool names (tree/library/noticeboard); ` +
      `got: ${JSON.stringify(allowedTools)}`,
  );

  // No write tools must appear in allowedTools — Phase 1 is read-only.
  const WRITE_TOOLS = ["Write", "Edit", "Bash", "write", "edit", "bash"];
  for (const bad of WRITE_TOOLS) {
    assert.ok(
      !allowedTools.includes(bad),
      `write tool '${bad}' must not appear in allowedTools; ` +
        `got: ${JSON.stringify(allowedTools)}`,
    );
  }

  // tools option must also exclude write tools (the base tool set is read-only or empty).
  if (Array.isArray(opts.tools)) {
    for (const bad of WRITE_TOOLS) {
      assert.ok(
        !(opts.tools as string[]).includes(bad),
        `write tool '${bad}' must not appear in the tools option`,
      );
    }
  }
});

// ---------------------------------------------------------------------------
// 6b. Scale-down (ADR-0108 §7) — with NO runner, no orientation tools are wired,
//     so the agent can't burn a turn on dead stub calls (the desktop "hello" fix).
// ---------------------------------------------------------------------------

test("runHeadlessOrchestrator: wires NO orientation tools when no runner is present (the §7 scale-down)", async () => {
  let capturedOptions: unknown;
  const capturingQuery: SdkQueryFn = ({ options }) => {
    capturedOptions = options;
    return (async function* () {
      yield okResult;
    })();
  };

  // NO runner injected — exactly the desktop chat's live config (createChatSseMount({})).
  const r = await runHeadlessOrchestrator({
    systemPrompt: "SYS",
    userPrompt: "hello",
    queryFn: capturingQuery,
  });

  assert.equal(r.ok, true, "a runnerless session must still succeed (a plain conversational turn)");

  const opts = capturedOptions as {
    allowedTools?: string[];
    mcpServers?: Record<string, unknown>;
  };
  const allowed = opts.allowedTools ?? [];
  const orientationWired = allowed.some((n) =>
    /tree|library|noticeboard|orientation/.test(n),
  );
  assert.ok(
    !orientationWired,
    `with no runner, NO orientation tools may be advertised — the agent must not be invited to make ` +
      `dead stub calls (the §7 scale-down); got allowedTools: ${JSON.stringify(allowed)}`,
  );
  assert.ok(
    !("orientation" in (opts.mcpServers ?? {})),
    "with no runner, the orientation MCP server must not be mounted",
  );
});

// ---------------------------------------------------------------------------
// 6c. The trace seam (ADR-0108 §7) — onMessage receives EVERY SDK message in
//     order, and a throwing sink can never break the session loop.
// ---------------------------------------------------------------------------

test("runHeadlessOrchestrator: onMessage receives every SDK message in arrival order (the trace seam)", async () => {
  const seen: string[] = [];
  const r = await runHeadlessOrchestrator({
    systemPrompt: "SYS",
    userPrompt: "hello",
    onMessage: (m) => seen.push(String((m as { type?: unknown }).type)),
    queryFn: queryYielding([
      { type: "system", subtype: "init" },
      { type: "assistant", message: { content: [{ type: "text", text: "hi" }] } },
      okResult,
    ]),
  });

  assert.equal(r.ok, true);
  assert.deepEqual(
    seen,
    ["system", "assistant", "result"],
    "onMessage must fire for EVERY message (not just the result) in arrival order — the trace seam",
  );
});

test("runHeadlessOrchestrator: a throwing onMessage sink never breaks the session", async () => {
  const r = await runHeadlessOrchestrator({
    systemPrompt: "SYS",
    userPrompt: "hello",
    onMessage: () => {
      throw new Error("a buggy trace sink");
    },
    queryFn: queryYielding([{ type: "assistant" }, okResult]),
  });

  assert.equal(
    r.ok,
    true,
    "a trace sink that throws must be swallowed — observability must never break the session",
  );
  assert.equal(r.proposal, okResult.result, "the proposal is still extracted despite the throwing sink");
});

// ---------------------------------------------------------------------------
// 7. Integration — injected runner dispatches through orientation tools; proposal extracted
// ---------------------------------------------------------------------------

test("runHeadlessOrchestrator: injected runner is usable by orientation tools; proposal extracted end-to-end", async () => {
  // A stub runner that returns realistic seed-like data — exercises the runner seam
  // without importing @storytree/cli (which would cycle: cli depends on agent).
  const treeBody = "## storytree — story tree (seed)\n3 stories · 9 nodes";
  const stubRunner = fixedRunner({
    ok: true,
    body: treeBody,
    doctrine: ["slow-growth-minimum-to-green — build one unit at a time"],
    next: ["storytree library artifact slow-growth-minimum-to-green"],
  });

  // Verify the orientation tools dispatch to the runner and format its envelope body
  // (the "real orientation tool over the seed" — the end-to-end wiring proof).
  const tools = buildOrientationTools(stubRunner, { store: null });
  const treeTool = tools.find((t) => t.name === "tree");
  assert.ok(treeTool !== undefined, "orientation surface must expose a 'tree' tool");
  const treeResult = await treeTool.call();
  assert.ok(
    treeResult.includes(treeBody),
    `tree tool must return the runner's envelope body; got: ${treeResult.slice(0, 300)}`,
  );

  // Now drive the headless session: inject the same runner, use a scripted double that
  // yields a result message with a known proposal. Verify end-to-end proposal extraction.
  const proposal = "I propose: build the 'headless-session-runner' capability next (Phase 1).";
  const r = await runHeadlessOrchestrator({
    systemPrompt: "You are the orchestrator agent.",
    userPrompt: "Orient on the story tree and propose the next unit.",
    runner: stubRunner,
    queryFn: queryYielding([
      { type: "assistant" },
      { ...okResult, result: proposal },
    ]),
  });

  assert.equal(r.ok, true, "session with injected runner must succeed");
  assert.equal(
    r.proposal,
    proposal,
    "proposal must be extracted from the result message's result field",
  );
});
