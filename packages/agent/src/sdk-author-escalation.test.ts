import { test } from "node:test";
import assert from "node:assert/strict";
import * as path from "node:path";

import { parseAuthoringEscalation } from "./phase-author.js";
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

/** A phrase check whose failure prints the phrase and the text it was missing from. */
function assertIncludes(text: string, phrase: string, message: string): void {
  assert.ok(
    text.includes(phrase),
    `${message}\n  expected to find: ${JSON.stringify(phrase)}\n  in: ${JSON.stringify(text)}`,
  );
}

// ── The injected MCP-server-factory seam: captures the tool definitions handed to it ────────────

/**
 * The escalate tool's declared input shape, as this file expects it to be registered. A type alias
 * rather than an interface: the SDK types a handler's arguments as a string-indexed record, which an
 * object-literal alias satisfies and an interface (having no implicit index signature) does not.
 */
type CapturedEscalateArgs = {
  statement: string;
  assertion?: string;
};

type McpServerFactory = NonNullable<ClaudeAgentAuthorArgs["mcpServerFactory"]>;

/** What `author()` hands the factory: the SDK's own `createSdkMcpServer` options, captured as-is. */
type CapturedMcpServerArgs = Parameters<McpServerFactory>[0];

/** One captured spine tool definition, exactly as the SDK's `tool()` built it. */
type CapturedSpineTool = NonNullable<CapturedMcpServerArgs["tools"]>[number];

/** The server config a factory returns — which the real one backs with a live `McpServer`. */
type ServerConfig = ReturnType<McpServerFactory>;

/** The capturing double's two handles: the factory to inject, and what that factory was last handed. */
interface CapturingMcpServerFactory {
  factory: McpServerFactory;
  last: () => CapturedMcpServerArgs | undefined;
}

/**
 * An injected double for the `mcpServerFactory` seam: records exactly what `author()` handed it
 * (never touching `McpServer` private fields — the definitions ARE what is captured) and returns a
 * stand-in server config. The stand-in has no live `McpServer`: building one needs the MCP SDK, which
 * this file does not import, and nothing here ever starts a transport. So it takes the one assertion
 * the house standard admits for an external contract a unit test cannot construct, and `satisfies`
 * checks every member it does define against the real config type.
 */
function capturingMcpServerFactory(): CapturingMcpServerFactory {
  let captured: CapturedMcpServerArgs | undefined;
  const factory: McpServerFactory = (opts) => {
    captured = opts;
    return { type: "sdk", name: opts.name } satisfies Partial<ServerConfig> as ServerConfig;
  };
  return { factory, last: () => captured };
}

/** Pull the registered `escalate` tool out of a captured factory call, failing loud if absent. */
function mustFindEscalate(captured: CapturedMcpServerArgs | undefined): CapturedSpineTool {
  const tool = captured?.tools?.find((t) => t.name === "escalate");
  assert.ok(
    tool !== undefined,
    "the spine MCP server must register an 'escalate' tool on every slice (ADR-0569 D6)",
  );
  return tool;
}

/** A zod schema, as far as this file needs one: narrowed at the boundary, never cast. */
interface SafeParser {
  safeParse: (input: unknown) => { success: boolean };
}

function isSafeParser(value: unknown): value is SafeParser {
  return (
    typeof value === "object" &&
    value !== null &&
    "safeParse" in value &&
    typeof value.safeParse === "function"
  );
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

test("escalate-tool-is-armed-on-every-slice-and-recorded-once: escalate is declared on a versioned spine server, with its authority described and a { statement, assertion? } input shape", async () => {
  const mcp = capturingMcpServerFactory();
  const author = new ClaudeAgentAuthor({
    cwd: CWD,
    isWriteAllowed: () => true,
    mcpServerFactory: mcp.factory,
    queryFn: scripted([
      { type: "result", subtype: "success", is_error: false, num_turns: 1, total_cost_usd: 0 },
    ]),
  });
  await author.author("AUTHOR_TEST", "p");

  const server = mcp.last();
  assert.equal(server?.name, "spine", "the server name is what makes the tool mcp__spine__escalate");
  assert.equal(server?.version, "1.0.0", "the in-process server declares its version for the MCP handshake");

  // The description is all the model reads about the tool before calling it: when to reach for it,
  // what it does to the slice and to the verdict, what each phase admits, and the once-per-slice rule.
  const escalate = mustFindEscalate(server);
  assertIncludes(
    escalate.description,
    "Raise a validated, phase-scoped escalation instead of continuing this authoring slice or " +
      "working around a frozen input you believe is wrong.",
    "the description must say when to escalate",
  );
  assertIncludes(
    escalate.description,
    "Ends the slice without a verdict — it never moves the verdict; the spine alone observes " +
      "red/green out-of-band.",
    "the description must say an escalation ends the slice and never moves the verdict",
  );
  assertIncludes(
    escalate.description,
    "Admits arguments only through the phase's own validator: AUTHOR_TEST takes { statement }, " +
      "IMPLEMENT takes { statement, assertion }.",
    "the description must say what each phase admits",
  );
  assertIncludes(
    escalate.description,
    "Exactly the first valid call in a slice is recorded; every later call is refused.",
    "the description must state the once-per-slice rule",
  );

  // The declared input shape: `statement` a required string and `assertion` an optional one, in
  // BOTH phases. IMPLEMENT's need for an assertion is the validator's refusal, never the schema's.
  const shape = escalate.inputSchema;
  assert.deepEqual(Object.keys(shape).sort(), ["assertion", "statement"], "exactly statement and assertion are declared");
  const { statement, assertion } = shape;
  assert.ok(isSafeParser(statement), "statement is declared as a zod schema");
  assert.ok(isSafeParser(assertion), "assertion is declared as a zod schema");
  assert.equal(statement.safeParse("why").success, true, "statement admits a string");
  assert.equal(statement.safeParse(undefined).success, false, "statement is required");
  assert.equal(assertion.safeParse(undefined).success, true, "assertion is optional");
  assert.equal(assertion.safeParse("assert.equal(x, 1)").success, true, "assertion admits a string");
  assert.equal(assertion.safeParse(9).success, false, "assertion admits only a string");
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

  // IMPLEMENT requires a non-blank assertion (parseAuthoringEscalation). The declared input shape
  // makes `assertion` optional in both phases, so this call is well-typed: the refusal under test is
  // the validator's, at run time — and the reply must carry the validator's own reason verbatim.
  const missingAssertion = { statement: "no assertion here" };
  const refusal = parseAuthoringEscalation("IMPLEMENT", missingAssertion);
  assert.equal(refusal.ok, false, "ground truth: the validator refuses an IMPLEMENT call with no assertion");
  if (refusal.ok) return;
  const malformed = await escalate.handler(missingAssertion, undefined);
  assert.deepEqual(
    malformed,
    { content: [{ type: "text", text: refusal.reason }], isError: true },
    "an invalid call is answered isError, with the validator's reason as its one text block",
  );

  // The refused call must not have taken the slice's one recording slot — a genuinely valid call
  // right after it must still succeed, and tell the leaf the escalation is recorded and to stop.
  const valid = await escalate.handler(
    { statement: "the fixture rounds to 3dp, the test wants 5", assertion: "assert.equal(x, 1.23456)" },
    undefined,
  );
  assert.deepEqual(
    valid,
    { content: [{ type: "text", text: "escalation recorded; this slice is ending — stop now." }] },
    "a recorded call is answered WITHOUT isError, telling the leaf the slice is ending",
  );

  // …and NOW the slot really is taken: a second valid call in the same slice is refused.
  const secondValid = await escalate.handler(
    { statement: "a different statement", assertion: "assert.equal(y, 2)" },
    undefined,
  );
  assert.deepEqual(
    secondValid,
    {
      content: [
        {
          type: "text",
          text:
            "an escalation was already recorded for this slice; this call is refused " +
            "(exactly one escalation may be recorded per slice).",
        },
      ],
      isError: true,
    },
    "a call after a recorded one is answered isError, naming the once-per-slice rule",
  );
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

/** The escalation closing's four claims, each asserted as a phrase of the prompt it closes. */
function assertEscalateClosing(prompt: string): void {
  assertIncludes(
    prompt,
    "If a frozen input is itself wrong and the phase is genuinely impossible, raise it through " +
      "mcp__spine__escalate instead of guessing or working around it",
    "the closing must say when to escalate, and through which tool",
  );
  assertIncludes(
    prompt,
    "in AUTHOR_TEST you may report the contract itself is untestable",
    "the closing must say what AUTHOR_TEST may escalate",
  );
  assertIncludes(
    prompt,
    "in IMPLEMENT you may report that no correct implementation can satisfy the authored test as written.",
    "the closing must say what IMPLEMENT may escalate",
  );
  assertIncludes(
    prompt,
    "Raising an escalation ends this slice without a verdict — it never moves the verdict; the spine " +
      "alone observes red and green, out-of-band, just as it always does.",
    "the closing must say an escalation ends the slice and never moves the verdict",
  );
}

test("escalate-tool-is-armed-on-every-slice-and-recorded-once: both the blind and feedback closings name mcp__spine__escalate and that it never moves the verdict", () => {
  const blind = leafSystemPrompt(false);
  const withFeedback = leafSystemPrompt(true);

  for (const prompt of [blind, withFeedback]) {
    assert.match(prompt, /mcp__spine__escalate/);
    assert.match(prompt, /AUTHOR_TEST/);
    assert.match(prompt, /IMPLEMENT/);
    assert.match(prompt, /never moves the verdict|spine alone observes/i);
    assertEscalateClosing(prompt);
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
  assertEscalateClosing(composedBlind);
  assert.match(composedFeedback, /^RED-BUILDER AGENT BODY/);
  assert.match(composedFeedback, /mcp__spine__escalate/);
  assertEscalateClosing(composedFeedback);
});
