import { test } from "node:test";
import assert from "node:assert/strict";
import * as path from "node:path";

import { ClaudeAgentAuthor, composeLeafSystemPrompt, leafSystemPrompt } from "./sdk-author.js";
import type { ClaudeAgentAuthorArgs, FeedbackCommand, SdkQueryFn } from "./sdk-author.js";

/**
 * escalate-tool-is-armed-on-every-slice-and-recorded-once (ADR-0569 D1/D2/D6):
 *
 *  - every ClaudeAgentAuthor.author() slice arms a spawn-free `mcp__spine__escalate` tool, whether
 *    or not feedback commands are wired;
 *  - the tool admits its arguments ONLY through the seam's validator (`parseAuthoringEscalation`),
 *    never a bespoke check inline in this file;
 *  - exactly the first VALID call in a slice is recorded; every later call (valid or not) in that
 *    same slice is refused;
 *  - whatever the slice's own ending would otherwise have been (success, an exhaustion subtype, a
 *    genuine error, no result message, or a thrown query), a recorded escalation is what `author()`
 *    returns instead: `{ ok: false, error, escalation }`, with `error` naming the phase and kind.
 *
 * OFFLINE throughout: the query seam is injected, and the MCP server construction is intercepted
 * through an injected `mcpServerFactory` seam — this file imports no SDK. Because the server factory
 * is called synchronously while `author()` builds its Options (before the query seam ever runs), a
 * scripted `queryFn` can retrieve this slice's own tool definitions and invoke the registered
 * `escalate` handler directly mid-flight, exactly as the real SDK would when the model calls the tool.
 *
 * RED phase: `ClaudeAgentAuthorArgs` does not yet declare `mcpServerFactory`, and the current
 * `author()` never builds an MCP server unless feedback commands are wired, so it never calls the
 * injected factory at all — every assertion below that depends on the captured tool list fails as a
 * genuine runtime assertion (`escalate` never found / `mcpServers` absent), never a missing-symbol or
 * import-link error, since every imported name here already exists on `sdk-author.ts` today.
 */

// Platform-agnostic absolute workspace (resolves under the current drive on Windows, / on POSIX).
const CWD = path.resolve("/work/space");

function scripted(messages: unknown[]): SdkQueryFn {
  return async function* () {
    for (const m of messages) {
      yield m;
    }
  };
}

// ── The injected MCP-server-factory seam: captures the tool definitions handed to it ────────────

/** The escalate tool's declared shape, as this file expects it to be registered. */
interface CapturedEscalateArgs {
  statement: string;
  assertion?: string;
}

/** One captured spine tool definition, shaped structurally like the SDK's `SdkMcpToolDefinition`. */
interface CapturedSpineTool {
  name: string;
  description: string;
  inputSchema: unknown;
  handler: (
    args: CapturedEscalateArgs,
    extra: unknown,
  ) => Promise<{ content: Array<{ type: string; text: string }>; isError?: boolean }>;
}

/** What `createSdkMcpServer` is called with, captured instead of built for real. */
interface CapturedMcpServerArgs {
  name: string;
  version?: string;
  tools?: CapturedSpineTool[];
}

type McpServerFactory = NonNullable<ClaudeAgentAuthorArgs["mcpServerFactory"]>;

/**
 * An injected double for the `mcpServerFactory` seam: records exactly what `author()` handed it
 * (never touching `McpServer` private fields — the definitions ARE what is captured) and returns an
 * inert placeholder, since nothing in these tests ever starts a real transport.
 */
function capturingMcpServerFactory(): {
  factory: McpServerFactory;
  last: () => CapturedMcpServerArgs | undefined;
} {
  let captured: CapturedMcpServerArgs | undefined;
  const factory = ((opts: CapturedMcpServerArgs) => {
    captured = opts;
    return {} as unknown as ReturnType<McpServerFactory>;
  }) as unknown as McpServerFactory;
  return { factory, last: () => captured };
}

/** Pull the registered `escalate` tool out of a captured factory call, failing loud if absent. */
function mustFindEscalate(captured: CapturedMcpServerArgs | undefined): CapturedSpineTool {
  const tool = captured?.tools?.find((t) => t.name === "escalate");
  assert.ok(
    tool !== undefined,
    "the spine MCP server must register an 'escalate' tool on every slice (ADR-0569 D6)",
  );
  return tool as CapturedSpineTool;
}

// ── The channel: armed on every slice, feedback commands or not ─────────────────────────────────

test("escalate-tool-is-armed-on-every-slice-and-recorded-once: mcp__spine__escalate is allow-listed with ZERO feedback commands wired", async () => {
  let captured: { allowedTools?: string[]; tools?: string[] } | undefined;
  const author = new ClaudeAgentAuthor({
    cwd: CWD,
    isWriteAllowed: () => true,
    queryFn: (args) => {
      captured = args.options as typeof captured;
      return scripted([
        { type: "result", subtype: "success", is_error: false, num_turns: 1, total_cost_usd: 0 },
      ])(args);
    },
  });

  await author.author("AUTHOR_TEST", "author the failing test");
  assert.ok(captured !== undefined);
  assert.ok(captured.allowedTools?.includes("mcp__spine__escalate"));
  assert.equal(captured.allowedTools?.includes("Bash"), false, "Bash must never be allow-listed");
  assert.ok(captured.tools?.includes("Read"), "the base tool surface is unchanged");
  assert.equal(author.feedbackToolNames.length, 0, "feedbackToolNames stays scoped to feedback commands only");
});

test("escalate-tool-is-armed-on-every-slice-and-recorded-once: the spine server registers escalate beside one tool per feedback command", async () => {
  const mcp = capturingMcpServerFactory();
  const feedback: FeedbackCommand = {
    name: "run_proof",
    description: "run the registered proof command",
    run: async () => ({ code: 0, stdout: "", stderr: "" }),
  };
  const author = new ClaudeAgentAuthor({
    cwd: CWD,
    isWriteAllowed: () => true,
    mcpServerFactory: mcp.factory,
    feedbackCommands: [feedback],
    queryFn: scripted([
      { type: "result", subtype: "success", is_error: false, num_turns: 1, total_cost_usd: 0 },
    ]),
  });

  await author.author("IMPLEMENT", "implement it");
  const names = (mcp.last()?.tools ?? []).map((t) => t.name).sort();
  assert.deepEqual(names, ["escalate", "run_proof"]);
});

test("escalate-tool-is-armed-on-every-slice-and-recorded-once: uses the SDK's default createSdkMcpServer when no factory is injected", async () => {
  // No mcpServerFactory injected at all — this must fall through to the real SDK export without
  // throwing, exactly as the existing feedback-command tests already rely on.
  let captured: { mcpServers?: Record<string, unknown> } | undefined;
  const author = new ClaudeAgentAuthor({
    cwd: CWD,
    isWriteAllowed: () => true,
    queryFn: (args) => {
      captured = args.options as typeof captured;
      return scripted([
        { type: "result", subtype: "success", is_error: false, num_turns: 1, total_cost_usd: 0 },
      ])(args);
    },
  });
  await author.author("AUTHOR_TEST", "p");
  assert.ok(captured?.mcpServers !== undefined && "spine" in captured.mcpServers);
});

// ── Admission: only through parseAuthoringEscalation, never a bespoke inline check ───────────────

test("escalate-tool-is-armed-on-every-slice-and-recorded-once: a malformed call is refused and does NOT consume the slice's one recording slot", async () => {
  const mcp = capturingMcpServerFactory();
  const author = new ClaudeAgentAuthor({
    cwd: CWD,
    isWriteAllowed: () => true,
    mcpServerFactory: mcp.factory,
    queryFn: scripted([
      { type: "result", subtype: "success", is_error: false, num_turns: 1, total_cost_usd: 0 },
    ]),
  });
  await author.author("IMPLEMENT", "p");
  const escalate = mustFindEscalate(mcp.last());

  // IMPLEMENT requires a non-blank assertion (parseAuthoringEscalation) — omitting it is a
  // validator refusal, deliberately reaching the handler through a cast (a well-typed caller could
  // never construct this shape).
  const malformed = await escalate.handler(
    { statement: "no assertion here" } as unknown as CapturedEscalateArgs,
    undefined,
  );
  assert.equal(malformed.isError, true);

  // The refused call must not have taken the slice's one recording slot — a genuinely valid call
  // right after it must still succeed.
  const valid = await escalate.handler(
    { statement: "the fixture rounds to 3dp, the test wants 5", assertion: "assert.equal(x, 1.23456)" },
    undefined,
  );
  assert.notEqual(valid.isError, true);

  // …and NOW the slot really is taken: a second valid call in the same slice is refused.
  const secondValid = await escalate.handler(
    { statement: "a different statement", assertion: "assert.equal(y, 2)" },
    undefined,
  );
  assert.equal(secondValid.isError, true);
});

test("escalate-tool-is-armed-on-every-slice-and-recorded-once: escalate calls never touch feedback-run accounting or the feedback budget", async () => {
  const mcp = capturingMcpServerFactory();
  const author = new ClaudeAgentAuthor({
    cwd: CWD,
    isWriteAllowed: () => true,
    mcpServerFactory: mcp.factory,
    maxFeedbackRuns: 1,
    feedbackCommands: [
      { name: "run_proof", description: "d", run: async () => ({ code: 0, stdout: "", stderr: "" }) },
    ],
    queryFn: scripted([
      { type: "result", subtype: "success", is_error: false, num_turns: 1, total_cost_usd: 0 },
    ]),
  });
  await author.author("AUTHOR_TEST", "p");
  const escalate = mustFindEscalate(mcp.last());

  await escalate.handler({ statement: "one" }, undefined);
  await escalate.handler({ statement: "two" }, undefined);
  await escalate.handler({ statement: "three" }, undefined);

  assert.deepEqual(author.feedbackRuns, [], "escalate is spawn-free and is never recorded as a feedback run");
});

// ── The return: a recorded escalation overrides every ending of the slice ───────────────────────

/** Build a queryFn that calls `escalate` mid-flight (as the real SDK would), then ends the slice. */
function queryInvokingEscalate(args: {
  mcp: ReturnType<typeof capturingMcpServerFactory>;
  escalateArgs: CapturedEscalateArgs;
  ending:
    | { kind: "success" }
    | { kind: "exhausted-turns" }
    | { kind: "exhausted-budget" }
    | { kind: "genuine-error" }
    | { kind: "no-result" }
    | { kind: "throw" };
}): SdkQueryFn {
  return async function* () {
    const escalate = mustFindEscalate(args.mcp.last());
    await escalate.handler(args.escalateArgs, undefined);
    switch (args.ending.kind) {
      case "success":
        yield { type: "result", subtype: "success", is_error: false, num_turns: 1, total_cost_usd: 0.01 };
        return;
      case "exhausted-turns":
        yield {
          type: "result",
          subtype: "error_max_turns",
          is_error: true,
          num_turns: 16,
          total_cost_usd: 0.4,
          errors: ["reached the turn limit"],
        };
        return;
      case "exhausted-budget":
        yield {
          type: "result",
          subtype: "error_max_budget_usd",
          is_error: true,
          num_turns: 5,
          total_cost_usd: 1.2,
          errors: ["budget exceeded"],
        };
        return;
      case "genuine-error":
        yield {
          type: "result",
          subtype: "error_during_execution",
          is_error: true,
          num_turns: 2,
          total_cost_usd: 0.02,
          errors: ["the session crashed"],
        };
        return;
      case "no-result":
        yield { type: "assistant", text: "..." };
        return;
      case "throw":
        throw new Error("ENOENT: claude binary not found");
    }
  };
}

const AUTHOR_TEST_ESCALATE_ARGS: CapturedEscalateArgs = {
  statement: "no automated oracle can observe this contract",
};
const AUTHOR_TEST_ESCALATION = {
  phase: "AUTHOR_TEST",
  kind: "untestable-contract",
  statement: AUTHOR_TEST_ESCALATE_ARGS.statement,
};

const IMPLEMENT_ESCALATE_ARGS: CapturedEscalateArgs = {
  statement: "no correct implementation can satisfy the authored test as written",
  assertion: "assert.equal(actual, expected)",
};
const IMPLEMENT_ESCALATION = {
  phase: "IMPLEMENT",
  kind: "unsatisfiable-test",
  statement: IMPLEMENT_ESCALATE_ARGS.statement,
  assertion: IMPLEMENT_ESCALATE_ARGS.assertion,
};

test("escalate-tool-is-armed-on-every-slice-and-recorded-once: overrides a SUCCESS ending — {ok:false, error naming phase+kind, escalation}", async () => {
  const mcp = capturingMcpServerFactory();
  const author = new ClaudeAgentAuthor({
    cwd: CWD,
    isWriteAllowed: () => true,
    mcpServerFactory: mcp.factory,
    queryFn: queryInvokingEscalate({
      mcp,
      escalateArgs: AUTHOR_TEST_ESCALATE_ARGS,
      ending: { kind: "success" },
    }),
  });

  const r = await author.author("AUTHOR_TEST", "author the failing test");
  assert.equal(r.ok, false);
  if (r.ok) return;
  assert.equal(r.exhausted, undefined);
  assert.match(r.error, /AUTHOR_TEST/);
  assert.match(r.error, /untestable-contract/);
  assert.deepEqual(r.escalation, AUTHOR_TEST_ESCALATION);
  // Per-slice run accounting is unchanged: the success result is still recorded even though the
  // RETURNED outcome is overridden.
  assert.equal(author.runs.length, 1);
  assert.equal(author.runs[0]?.subtype, "success");
});

test("escalate-tool-is-armed-on-every-slice-and-recorded-once: overrides a TURN-CEILING exhaustion — the escalation wins and `exhausted` is not set", async () => {
  const mcp = capturingMcpServerFactory();
  const author = new ClaudeAgentAuthor({
    cwd: CWD,
    isWriteAllowed: () => true,
    mcpServerFactory: mcp.factory,
    queryFn: queryInvokingEscalate({
      mcp,
      escalateArgs: IMPLEMENT_ESCALATE_ARGS,
      ending: { kind: "exhausted-turns" },
    }),
  });

  const r = await author.author("IMPLEMENT", "implement it");
  assert.equal(r.ok, false);
  if (r.ok) return;
  assert.notEqual(r.exhausted, true, "the escalation wins over exhaustion — exhausted must not be set");
  assert.match(r.error, /IMPLEMENT/);
  assert.match(r.error, /unsatisfiable-test/);
  assert.deepEqual(r.escalation, IMPLEMENT_ESCALATION);
});

test("escalate-tool-is-armed-on-every-slice-and-recorded-once: overrides a BUDGET-CEILING exhaustion — the escalation wins and `exhausted` is not set", async () => {
  const mcp = capturingMcpServerFactory();
  const author = new ClaudeAgentAuthor({
    cwd: CWD,
    isWriteAllowed: () => true,
    mcpServerFactory: mcp.factory,
    queryFn: queryInvokingEscalate({
      mcp,
      escalateArgs: IMPLEMENT_ESCALATE_ARGS,
      ending: { kind: "exhausted-budget" },
    }),
  });

  const r = await author.author("IMPLEMENT", "implement it");
  assert.equal(r.ok, false);
  if (r.ok) return;
  assert.notEqual(r.exhausted, true, "the escalation wins over exhaustion — exhausted must not be set");
  assert.deepEqual(r.escalation, IMPLEMENT_ESCALATION);
});

test("escalate-tool-is-armed-on-every-slice-and-recorded-once: overrides a GENUINE error ending too", async () => {
  const mcp = capturingMcpServerFactory();
  const author = new ClaudeAgentAuthor({
    cwd: CWD,
    isWriteAllowed: () => true,
    mcpServerFactory: mcp.factory,
    queryFn: queryInvokingEscalate({
      mcp,
      escalateArgs: IMPLEMENT_ESCALATE_ARGS,
      ending: { kind: "genuine-error" },
    }),
  });

  const r = await author.author("IMPLEMENT", "implement it");
  assert.equal(r.ok, false);
  if (r.ok) return;
  assert.notEqual(r.exhausted, true);
  assert.deepEqual(r.escalation, IMPLEMENT_ESCALATION);
});

test("escalate-tool-is-armed-on-every-slice-and-recorded-once: overrides a MISSING result-message ending", async () => {
  const mcp = capturingMcpServerFactory();
  const author = new ClaudeAgentAuthor({
    cwd: CWD,
    isWriteAllowed: () => true,
    mcpServerFactory: mcp.factory,
    queryFn: queryInvokingEscalate({
      mcp,
      escalateArgs: AUTHOR_TEST_ESCALATE_ARGS,
      ending: { kind: "no-result" },
    }),
  });

  const r = await author.author("AUTHOR_TEST", "author the failing test");
  assert.equal(r.ok, false);
  if (r.ok) return;
  assert.deepEqual(r.escalation, AUTHOR_TEST_ESCALATION);
  assert.match(r.error, /AUTHOR_TEST/);
  assert.match(r.error, /untestable-contract/);
});

test("escalate-tool-is-armed-on-every-slice-and-recorded-once: overrides a THROWN query (spawn/auth failure)", async () => {
  const mcp = capturingMcpServerFactory();
  const author = new ClaudeAgentAuthor({
    cwd: CWD,
    isWriteAllowed: () => true,
    mcpServerFactory: mcp.factory,
    queryFn: queryInvokingEscalate({
      mcp,
      escalateArgs: AUTHOR_TEST_ESCALATE_ARGS,
      ending: { kind: "throw" },
    }),
  });

  const r = await author.author("AUTHOR_TEST", "author the failing test");
  assert.equal(r.ok, false);
  if (r.ok) return;
  assert.deepEqual(r.escalation, AUTHOR_TEST_ESCALATION);
  assert.match(r.error, /AUTHOR_TEST/);
  assert.match(r.error, /untestable-contract/);
});

// ── Control: with no escalation raised, every ending maps exactly as it did before ──────────────

test("escalate-tool-is-armed-on-every-slice-and-recorded-once: with NO escalation raised, a turn-ceiling ending still marks `exhausted: true` exactly as before", async () => {
  const mcp = capturingMcpServerFactory();
  const author = new ClaudeAgentAuthor({
    cwd: CWD,
    isWriteAllowed: () => true,
    mcpServerFactory: mcp.factory,
    queryFn: scripted([
      {
        type: "result",
        subtype: "error_max_turns",
        is_error: true,
        num_turns: 16,
        total_cost_usd: 0.4,
        errors: ["reached the turn limit"],
      },
    ]),
  });

  const r = await author.author("IMPLEMENT", "implement it");
  assert.equal(r.ok, false);
  if (r.ok) return;
  assert.equal(r.exhausted, true, "unchanged: exhaustion still exhaustion when nothing escalated");
  assert.equal(r.escalation, undefined, "no escalation was raised, so none is recorded");
});

test("escalate-tool-is-armed-on-every-slice-and-recorded-once: with NO escalation raised, a plain success ending stays ok:true", async () => {
  const mcp = capturingMcpServerFactory();
  const author = new ClaudeAgentAuthor({
    cwd: CWD,
    isWriteAllowed: () => true,
    mcpServerFactory: mcp.factory,
    queryFn: scripted([
      { type: "result", subtype: "success", is_error: false, num_turns: 2, total_cost_usd: 0.05 },
    ]),
  });

  const r = await author.author("AUTHOR_TEST", "author the failing test");
  assert.deepEqual(r, { ok: true });
});

// ── The closings: both name mcp__spine__escalate and what each phase may escalate ───────────────

test("escalate-tool-is-armed-on-every-slice-and-recorded-once: both the blind and feedback closings name mcp__spine__escalate and that it never moves the verdict", () => {
  const blind = leafSystemPrompt(false);
  const withFeedback = leafSystemPrompt(true);

  for (const prompt of [blind, withFeedback]) {
    assert.match(prompt, /mcp__spine__escalate/);
    assert.match(prompt, /AUTHOR_TEST/);
    assert.match(prompt, /IMPLEMENT/);
    assert.match(prompt, /never moves the verdict|spine alone observes/i);
  }

  // The pre-existing phrases other tests already assert must all still be present.
  assert.match(blind, /cannot run tests or shell commands/);
  assert.match(withFeedback, /FEEDBACK ONLY/);
  assert.match(withFeedback, /stop and say so/);
  assert.match(withFeedback, /mcp__spine__/);
});

test("escalate-tool-is-armed-on-every-slice-and-recorded-once: composeLeafSystemPrompt names escalate in both modes, after the injected agent body", () => {
  const composedBlind = composeLeafSystemPrompt("RED-BUILDER AGENT BODY", false);
  const composedFeedback = composeLeafSystemPrompt("RED-BUILDER AGENT BODY", true);

  assert.match(composedBlind, /^RED-BUILDER AGENT BODY/);
  assert.match(composedBlind, /mcp__spine__escalate/);
  assert.match(composedFeedback, /^RED-BUILDER AGENT BODY/);
  assert.match(composedFeedback, /mcp__spine__escalate/);
});
