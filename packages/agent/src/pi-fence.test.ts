import { test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import { Agent } from "@earendil-works/pi-agent-core";
import type { BeforeToolCallContext, StreamFn } from "@earendil-works/pi-agent-core";
import { createAssistantMessageEventStream } from "@earendil-works/pi-ai";
import type { AssistantMessage } from "@earendil-works/pi-ai";
import {
  DefaultResourceLoader,
  ExtensionRunner,
  ModelRegistry,
  ModelRuntime,
  SessionManager,
  createBashTool,
  createEditTool,
  createFindTool,
  createGrepTool,
  createLsTool,
  createPowerShellTool,
  createReadTool,
  createWriteTool,
} from "@earendil-works/pi-coding-agent";

import {
  PI_AUTHORING_TOOLS,
  PI_SHELL_TOOLS,
  PI_WRITE_TOOLS,
  createPiScopeFence,
  decidePiToolCall,
} from "./pi-fence.js";
import type {
  ExtensionFactory,
  PiFenceViolation,
  PiRefusalKind,
  PiToolCallDecision,
  ToolCallEvent,
} from "./pi-fence.js";
import type { AuthoringPhase } from "./phase-author.js";

/**
 * OFFLINE proof of the pi write-scope fence (`pi-harness-admission-arc` increment 1).
 *
 * The whole arc turns on one question: can a pi extension enforce phase write scope as reliably
 * as the Claude leaf's `PreToolUse` hook? This file answers it WITHOUT a credential, a model, or
 * a network call — every assertion below runs against pi's own shipped code:
 *
 *  1. the PURE decision (`decidePiToolCall`), the same fail-closed rules as `decideWrite`;
 *  2. pi's REAL extension pipeline — `DefaultResourceLoader` loads our factory, and pi's own
 *     `ExtensionRunner.emitToolCall` dispatches to it and returns our block;
 *  3. pi's REAL agent loop — a scripted `streamFn` emits a `write` tool call, pi's REAL `write`
 *     tool is on the tool list, and the fence is bridged in exactly as pi's own `AgentSession`
 *     bridges it. The blocked call never reaches the filesystem.
 *
 * (3) carries a CONTROL: the identical run with the fence ABSENT writes the file. That control is
 * the permanent red — a fence that silently degrades to a no-op fails the fenced assertion while
 * the control still passes, so this suite cannot go green on a fence that fences nothing.
 *
 * NO CREDENTIAL IS VISIBLE TO ANY OF IT: every `ModelRuntime` here is built over a throwaway
 * `authPath` in a fresh temp dir with `allowModelNetwork: false`, so the developer's own `~/.pi`
 * credentials are never read and no paid provider is reachable (the ADR-0198 rule, applied from
 * the first commit).
 */

// Platform-agnostic absolute workspace (resolves under the current drive on Windows, / on POSIX).
const CWD = path.resolve("/work/space");

/** The same shape `sdk-author.test.ts` uses: tests only in AUTHOR_TEST, one source file in IMPLEMENT. */
const testOnlyInAuthor = (phase: AuthoringPhase, rel: string): boolean =>
  phase === "AUTHOR_TEST" ? rel.endsWith(".test.cjs") : rel === "impl.cjs";

/** Read the refusal reason off a decision; the empty string when the call was allowed. */
const reasonOf = (decision: PiToolCallDecision): string => (decision.allow ? "" : decision.reason);

/** Read the refusal kind off a decision; `undefined` when the call was allowed. */
const kindOf = (decision: PiToolCallDecision): PiRefusalKind | undefined =>
  decision.allow ? undefined : decision.kind;

// ── The pure decision: the same fail-closed rules the Claude leaf applies ────

test("decidePiToolCall allows an in-scope test write in AUTHOR_TEST", () => {
  const d = decidePiToolCall({
    phase: "AUTHOR_TEST",
    cwd: CWD,
    toolName: "write",
    toolInput: { path: "unit.test.cjs", content: "x" },
    isWriteAllowed: testOnlyInAuthor,
  });
  assert.equal(d.allow, true);
  assert.equal(d.relPath, "unit.test.cjs");
});

test("decidePiToolCall refuses a source write in AUTHOR_TEST", () => {
  const d = decidePiToolCall({
    phase: "AUTHOR_TEST",
    cwd: CWD,
    toolName: "write",
    toolInput: { path: "impl.cjs", content: "x" },
    isWriteAllowed: testOnlyInAuthor,
  });
  assert.equal(d.allow, false);
  assert.match(reasonOf(d), /phase scope/);
});

test("decidePiToolCall allows the source write in IMPLEMENT", () => {
  const d = decidePiToolCall({
    phase: "IMPLEMENT",
    cwd: CWD,
    toolName: "write",
    toolInput: { path: "impl.cjs", content: "x" },
    isWriteAllowed: testOnlyInAuthor,
  });
  assert.equal(d.allow, true);
});

test("decidePiToolCall refuses the test write in IMPLEMENT (never the test it must satisfy)", () => {
  const d = decidePiToolCall({
    phase: "IMPLEMENT",
    cwd: CWD,
    toolName: "write",
    toolInput: { path: "unit.test.cjs", content: "x" },
    isWriteAllowed: testOnlyInAuthor,
  });
  assert.equal(d.allow, false);
});

test("decidePiToolCall refuses a write that escapes the workspace", () => {
  const d = decidePiToolCall({
    phase: "AUTHOR_TEST",
    cwd: CWD,
    toolName: "write",
    toolInput: { path: "../outside.test.cjs", content: "x" },
    isWriteAllowed: () => true,
  });
  assert.equal(d.allow, false);
  assert.match(reasonOf(d), /outside the workspace/);
});

test("decidePiToolCall refuses an absolute path outside the workspace", () => {
  const d = decidePiToolCall({
    phase: "AUTHOR_TEST",
    cwd: CWD,
    toolName: "write",
    toolInput: { path: path.resolve("/elsewhere/unit.test.cjs"), content: "x" },
    isWriteAllowed: () => true,
  });
  assert.equal(d.allow, false);
  assert.match(reasonOf(d), /outside the workspace/);
});

test("decidePiToolCall refuses a write-shaped call with no readable path (fail-closed, matching sdk-author)", () => {
  // THE case the two existing implementations disagree on: `write-scoped-executor.ts` passes an
  // unextractable path through and merely notes it; `sdk-author.ts` refuses. We match sdk-author.
  for (const toolInput of [{}, { path: "" }, { path: 42 }, null, "nonsense"]) {
    const d = decidePiToolCall({
      phase: "AUTHOR_TEST",
      cwd: CWD,
      toolName: "write",
      toolInput,
      isWriteAllowed: () => true,
    });
    assert.equal(d.allow, false, `expected refusal for ${JSON.stringify(toolInput)}`);
    assert.match(reasonOf(d), /no readable path/);
  }
});

test("decidePiToolCall applies the same predicate to the edit tool", () => {
  const allowed = decidePiToolCall({
    phase: "AUTHOR_TEST",
    cwd: CWD,
    toolName: "edit",
    toolInput: { path: "unit.test.cjs", edits: [{ oldText: "a", newText: "b" }] },
    isWriteAllowed: testOnlyInAuthor,
  });
  assert.equal(allowed.allow, true);

  const refused = decidePiToolCall({
    phase: "AUTHOR_TEST",
    cwd: CWD,
    toolName: "edit",
    toolInput: { path: "impl.cjs", edits: [{ oldText: "a", newText: "b" }] },
    isWriteAllowed: testOnlyInAuthor,
  });
  assert.equal(refused.allow, false);
});

test("decidePiToolCall allows the read-shaped tools in both authoring phases", () => {
  const readOnly = PI_AUTHORING_TOOLS.filter((t) => !PI_WRITE_TOOLS.includes(t));
  assert.ok(readOnly.length > 0, "the authoring surface must carry read-shaped tools");
  for (const phase of ["AUTHOR_TEST", "IMPLEMENT"] as const) {
    for (const toolName of readOnly) {
      const d = decidePiToolCall({
        phase,
        cwd: CWD,
        toolName,
        toolInput: { path: "anything.txt" },
        isWriteAllowed: () => false,
      });
      assert.equal(d.allow, true, `${toolName} in ${phase} must be readable`);
    }
  }
});

test("decidePiToolCall refuses every pi shell tool — THE hole a write-only fence leaves open", () => {
  for (const toolName of PI_SHELL_TOOLS) {
    for (const phase of ["AUTHOR_TEST", "IMPLEMENT"] as const) {
      const d = decidePiToolCall({
        phase,
        cwd: CWD,
        // The shell command is a plain in-scope-looking write. There is no path field to read,
        // which is exactly why gating the shell by path extraction is not possible.
        toolName,
        toolInput: { command: "echo pwned > unit.test.cjs" },
        isWriteAllowed: () => true,
      });
      assert.equal(d.allow, false, `${toolName} must never run in ${phase}`);
      assert.match(reasonOf(d), /not on the authoring tool surface/);
    }
  }
});

test("every refusal is STAMPED with the wall it hit, so three fences share one denominator", () => {
  // ADR-0446 landed a durable sink for write-scope refusals and both existing fence mechanisms
  // stamp `kind` at the refusal. This is the third fence; a refusal it cannot label is a refusal
  // the sink's denominator cannot count. The first three kinds mirror `SdkRefusalKind` member for
  // member; `tool-surface` is pi's own, because only pi has a shell to keep off the surface.
  const cases: Array<[string, unknown, PiRefusalKind]> = [
    ["write", { path: "impl.cjs", content: "x" }, "scope"],
    ["write", { path: "../outside.test.cjs", content: "x" }, "outside-workspace"],
    ["write", {}, "no-path"],
    ["bash", { command: "echo pwned > unit.test.cjs" }, "tool-surface"],
    ["some_future_tool", { path: "unit.test.cjs" }, "tool-surface"],
  ];
  for (const [toolName, toolInput, expected] of cases) {
    const d = decidePiToolCall({
      phase: "AUTHOR_TEST",
      cwd: CWD,
      toolName,
      toolInput,
      isWriteAllowed: testOnlyInAuthor,
    });
    assert.equal(d.allow, false, `${toolName} must be refused`);
    assert.equal(kindOf(d), expected, `${toolName} must be stamped '${expected}'`);
  }

  // And an ALLOWED call carries no kind at all — the stamp is a property of a refusal, so a
  // reader counting kinds can never pick up a call that was let through.
  const allowed = decidePiToolCall({
    phase: "AUTHOR_TEST",
    cwd: CWD,
    toolName: "write",
    toolInput: { path: "unit.test.cjs", content: "x" },
    isWriteAllowed: testOnlyInAuthor,
  });
  assert.equal(allowed.allow, true);
  assert.equal(kindOf(allowed), undefined);
});

test("decidePiToolCall refuses an unknown tool name (allowlist, not denylist)", () => {
  // A pi version bump that ADDS a write-capable tool, or an extension that registers one, is
  // refused by default rather than silently permitted.
  const d = decidePiToolCall({
    phase: "IMPLEMENT",
    cwd: CWD,
    toolName: "some_future_tool",
    toolInput: { path: "impl.cjs" },
    isWriteAllowed: () => true,
  });
  assert.equal(d.allow, false);
  assert.match(reasonOf(d), /not on the authoring tool surface/);
});

// ── The tool surface: the shell is absent, and the names are pi's real ones ──

test("the authoring tool surface excludes every pi shell tool", () => {
  for (const shell of PI_SHELL_TOOLS) {
    assert.equal(
      PI_AUTHORING_TOOLS.includes(shell),
      false,
      `${shell} must not be on the authoring tool surface`,
    );
  }
});

test("both tool lists name REAL pi built-ins, so neither exclusion nor allowlist is a typo", () => {
  // Built from pi's own tool factories: a renamed pi tool, or a typo in either list, fails here.
  // Without this, `PI_SHELL_TOOLS = ["bahs"]` would "exclude the shell" while excluding nothing,
  // and `PI_AUTHORING_TOOLS = ["wrtie"]` would refuse every write and look like a working fence.
  const builtins = new Set(
    [
      createReadTool(CWD),
      createBashTool(CWD),
      createPowerShellTool(CWD),
      createEditTool(CWD),
      createWriteTool(CWD),
      createGrepTool(CWD),
      createFindTool(CWD),
      createLsTool(CWD),
    ].map((tool) => tool.name),
  );
  for (const name of [...PI_AUTHORING_TOOLS, ...PI_SHELL_TOOLS]) {
    assert.ok(builtins.has(name), `'${name}' is not a pi built-in tool (pi has: ${[...builtins].join(", ")})`);
  }
  for (const write of PI_WRITE_TOOLS) {
    assert.ok(PI_AUTHORING_TOOLS.includes(write), `${write} must be on the authoring surface`);
  }
});

// ── pi's REAL extension pipeline: loader + runner, no credential, no network ──

interface PiHarness {
  runner: ExtensionRunner;
  cwd: string;
}

/**
 * Load `factory` (or nothing at all) through pi's OWN `DefaultResourceLoader` and hand back pi's
 * OWN `ExtensionRunner`. `agentDir` and `authPath` are throwaway temp paths, so no extension of
 * the developer's is discovered and no real credential is read.
 */
async function piHarness(
  buildFactory?: (cwd: string) => ExtensionFactory,
): Promise<PiHarness> {
  const agentDir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-fence-agent-"));
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "pi-fence-work-"));
  const factory = buildFactory?.(cwd);
  const loader = new DefaultResourceLoader({
    cwd,
    agentDir,
    noSkills: true,
    noPromptTemplates: true,
    noThemes: true,
    noContextFiles: true,
    extensionFactories: factory === undefined ? [] : [{ name: "storytree-pi-scope-fence", factory }],
  });
  await loader.reload();
  const { extensions, runtime, errors } = loader.getExtensions();
  assert.deepEqual(
    errors.map((e) => `${e.path}: ${e.error}`),
    [],
    "pi reported extension load errors",
  );
  assert.equal(
    extensions.length,
    factory === undefined ? 0 : 1,
    "the harness must be hermetic: exactly the extensions this test installed",
  );
  const modelRuntime = await ModelRuntime.create({
    authPath: path.join(agentDir, "auth.json"),
    modelsPath: null,
    allowModelNetwork: false,
    refreshOnCreate: false,
  });
  const runner = new ExtensionRunner(
    extensions,
    runtime,
    cwd,
    SessionManager.inMemory(cwd),
    new ModelRegistry(modelRuntime),
  );
  return { runner, cwd };
}

/** A `tool_call` event in pi's own shape. */
function toolCall(toolName: string, input: Record<string, unknown>): ToolCallEvent {
  return { type: "tool_call", toolCallId: `tc-${toolName}`, toolName, input };
}

test("pi's own loader registers the fence as a tool_call handler", async () => {
  const { runner } = await piHarness(() =>
    createPiScopeFence({ phase: "AUTHOR_TEST", cwd: CWD, isWriteAllowed: () => true }),
  );
  // The EXACT predicate pi's `AgentSession` guards its beforeToolCall bridge on: when this is
  // false pi skips the extension entirely and the fence is never consulted.
  assert.equal(runner.hasHandlers("tool_call"), true);
});

test("pi's own runner returns the fence's block for an out-of-scope write", async () => {
  const violations: PiFenceViolation[] = [];
  const harness = await piHarness(() =>
    createPiScopeFence({
      phase: "AUTHOR_TEST",
      cwd: CWD,
      isWriteAllowed: testOnlyInAuthor,
      onViolation: (v) => violations.push(v),
    }),
  );
  const result = await harness.runner.emitToolCall(toolCall("write", { path: "impl.cjs", content: "x" }));
  assert.equal(result?.block, true);
  assert.match(result?.reason ?? "", /phase scope/);
  assert.deepEqual(
    violations.map((v) => [v.phase, v.tool, v.path, v.kind]),
    [["AUTHOR_TEST", "write", "impl.cjs", "scope"]],
  );
});

test("pi's own runner returns the fence's block for a shell call", async () => {
  const harness = await piHarness(() =>
    createPiScopeFence({ phase: "IMPLEMENT", cwd: CWD, isWriteAllowed: () => true }),
  );
  const result = await harness.runner.emitToolCall(
    toolCall("bash", { command: "echo pwned > impl.cjs" }),
  );
  assert.equal(result?.block, true);
  assert.match(result?.reason ?? "", /not on the authoring tool surface/);
});

test("pi's own runner passes an in-scope write through unblocked", async () => {
  const harness = await piHarness(() =>
    createPiScopeFence({ phase: "AUTHOR_TEST", cwd: CWD, isWriteAllowed: testOnlyInAuthor }),
  );
  const result = await harness.runner.emitToolCall(
    toolCall("write", { path: "unit.test.cjs", content: "x" }),
  );
  assert.notEqual(result?.block, true);
});

// ── pi's REAL agent loop: the blocked write never reaches the filesystem ─────

/** A scripted `streamFn`: one assistant turn that calls `write` on `target`, then stops. */
function scriptedWriteCall(target: string): StreamFn {
  return () => {
    const stream = createAssistantMessageEventStream();
    const message: AssistantMessage = {
      role: "assistant",
      content: [{ type: "toolCall", id: "tc-1", name: "write", arguments: { path: target, content: "pwned" } }],
      api: "anthropic-messages",
      provider: "scripted-offline",
      model: "scripted-offline",
      usage: {
        input: 0,
        output: 0,
        cacheRead: 0,
        cacheWrite: 0,
        totalTokens: 0,
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
      },
      stopReason: "toolUse",
      timestamp: 0,
    };
    queueMicrotask(() => {
      stream.push({ type: "start", partial: message });
      stream.end(message);
    });
    return stream;
  };
}

/**
 * Run ONE pi agent turn that tries to write `target`, with the fence either installed or absent.
 * The `beforeToolCall` bridge below is pi's OWN, copied from `AgentSession._installAgentToolHooks`
 * (`dist/core/agent-session.js`) — the same `hasHandlers` guard and the same event shape.
 */
async function runOnePiTurn(args: { fenced: boolean; target: string }): Promise<{
  wrote: boolean;
  toolResultText: string;
  toolResultIsError: boolean;
}> {
  const buildFence = (cwd: string): ExtensionFactory =>
    createPiScopeFence({
      phase: "IMPLEMENT",
      cwd,
      // Every write is out of scope in this run: the point is whether the fence stops it.
      isWriteAllowed: () => false,
    });
  const { runner, cwd } = await piHarness(args.fenced ? buildFence : undefined);

  const agent = new Agent({
    streamFn: scriptedWriteCall(args.target),
    initialState: { tools: [createWriteTool(cwd)] },
    beforeToolCall: async (context: BeforeToolCallContext) => {
      if (!runner.hasHandlers("tool_call")) {
        return undefined;
      }
      return await runner.emitToolCall({
        type: "tool_call",
        toolName: context.toolCall.name,
        toolCallId: context.toolCall.id,
        input: toolInputOf(context.args),
      });
    },
    shouldStopAfterTurn: () => true,
  });
  await agent.prompt("write the file");

  const results = agent.state.messages.filter((m) => m.role === "toolResult");
  assert.equal(results.length, 1, "the scripted turn must produce exactly one tool result");
  const result = results[0];
  assert.ok(result !== undefined && result.role === "toolResult");
  const text = result.content
    .map((c) => (c.type === "text" ? c.text : ""))
    .join("");
  return {
    wrote: fs.existsSync(path.join(cwd, args.target)),
    toolResultText: text,
    toolResultIsError: result.isError === true,
  };
}

/** Narrow pi's `unknown` tool args to the record shape its `tool_call` event carries. */
function toolInputOf(args: unknown): Record<string, unknown> {
  return typeof args === "object" && args !== null ? Object.fromEntries(Object.entries(args)) : {};
}

test("CONTROL: with the fence absent, pi's real write tool lands the out-of-scope file", async () => {
  // The permanent red. If this ever stops writing the file, the fenced case below proves nothing
  // and the whole suite is green over a tool that never wrote anything in the first place.
  const outcome = await runOnePiTurn({ fenced: false, target: "OUT_OF_SCOPE.txt" });
  assert.equal(outcome.wrote, true, "unfenced, pi must actually write the file");
  assert.equal(outcome.toolResultIsError, false);
});

test("FENCED: the same call is blocked and never reaches the filesystem", async () => {
  const outcome = await runOnePiTurn({ fenced: true, target: "OUT_OF_SCOPE.txt" });
  assert.equal(outcome.wrote, false, "the fence must stop the write before it lands");
  assert.equal(outcome.toolResultIsError, true);
  assert.match(outcome.toolResultText, /phase scope|outside the workspace/);
});
