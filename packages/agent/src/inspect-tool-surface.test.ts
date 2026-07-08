/**
 * Contract tests for inspect-tool-surface (ADR-0173 — the read-only CI/git inspection surface).
 *
 * Pins the integration of the desktop orchestrator's INSPECT tool surface into the headless
 * orchestrator session — the read-only diagnosis tools (view_ci_run + view_pr_checks + git_inspect)
 * the terminal session-orchestrator gets for free from its shell, so a blind chat can root-cause a
 * red pipeline itself instead of theorising (the PR #650 misdiagnosis).
 *
 * One test block per behaviour:
 *   its-inspect-tools-mounted-only-with-deps — inspect power is opt-in per composition, absent by
 *     default (§7 scale-down mirror): a dep-less session is byte-identical to the propose+spawn+landing
 *     surface; with deps, exactly the three inspect tools join allowedTools and the inspect MCP server
 *     mounts.
 *   its-tool-call-dispatches-to-the-handler — invoking an inspect tool dispatches to the injected
 *     handler and returns the handler's observed TEXT to the model.
 *   its-fail-closed-on-a-throwing-handler — a handler that throws folds to conversation text (a
 *     failure the orchestrator can read), NEVER a thrown crash into the SDK loop.
 *   its-refusal-is-surfaced-not-rewritten — a REFUSED mutating argument (an `ok: false` from the
 *     handler) is surfaced as its refusal text VERBATIM; the surface never rewrites a refusal to a read.
 *   its-chat-session-keeps-no-write-bash — tools: [] stays; NO Write/Edit/Bash in allowedTools even
 *     with inspect power (ADR-0137 d.1 / ADR-0173 invariant 1 — inspect is scoped READ tools).
 *   its-no-verdict-crosses-back — an inspect tool returns observation TEXT; no verdict-shaped payload
 *     appears in any tool result (ADR-0091 / ADR-0020: the spine signs out-of-band, not the chat).
 *
 * Every test is OFFLINE: queryFn and inspect handler stubs are injected — no live SDK spend, no real
 * gh/git. The real deps composition (shelling gh/git behind a time-boxed exec seam, and refusing
 * mutating args) is @storytree/drive's follow-on (inspect-deps.test.ts); this file pins the
 * COMPOSITION — the surface mounts on the headless-orchestrator seam only when inspect deps are
 * present, and every handler is fail-closed and read-only.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import { runHeadlessOrchestrator } from "./headless-orchestrator.js";
import { buildInspectTools } from "./inspect-tool-surface.js";
import type { InspectSurfaceDeps } from "./inspect-tool-surface.js";
import type { SdkQueryFn } from "./sdk-author.js";

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

const OK_RESULT = {
  type: "result",
  subtype: "success",
  is_error: false,
  num_turns: 1,
  total_cost_usd: 0.001,
  result: "session finished",
};

function queryYielding(messages: unknown[]): SdkQueryFn {
  return () =>
    (async function* () {
      for (const m of messages) yield m;
    })();
}

function capturingQuery(messages: unknown[]): { fn: SdkQueryFn; opts: () => unknown } {
  let last: unknown;
  const fn: SdkQueryFn = (q) => {
    last = q.options;
    return queryYielding(messages)(q);
  };
  return { fn, opts: () => last };
}

/**
 * Build recording inspect deps. `order` records "viewCiRun" / "viewPrChecks" / "gitInspect" call
 * events so the dispatch is observable; `refuse` makes the named handler return an `ok: false`
 * refusal (to exercise the read-only fence surfacing); `throwOn` makes the named handler throw (to
 * exercise the fail-closed arm).
 */
function makeInspectDeps(opts?: {
  order?: string[];
  refuse?: "viewCiRun" | "viewPrChecks" | "gitInspect";
  throwOn?: "viewCiRun" | "viewPrChecks" | "gitInspect";
}): InspectSurfaceDeps {
  const order = opts?.order ?? [];
  return {
    viewCiRun: async (args) => {
      order.push("viewCiRun");
      if (opts?.throwOn === "viewCiRun") throw new Error("gh run view spawn failed (stub)");
      if (opts?.refuse === "viewCiRun") {
        return { ok: false, summary: "refused: flag-like runId (stub)" };
      }
      return { ok: true, summary: `run ${args.runId} log: verify FAILED — check:web-engine (stub)` };
    },
    viewPrChecks: async (args) => {
      order.push("viewPrChecks");
      if (opts?.throwOn === "viewPrChecks") throw new Error("gh pr checks spawn failed (stub)");
      if (opts?.refuse === "viewPrChecks") {
        return { ok: false, summary: "refused: flag-like pr (stub)" };
      }
      return { ok: true, summary: `PR ${args.pr} checks: verify FAILURE, build SUCCESS (stub)` };
    },
    gitInspect: async (args) => {
      order.push("gitInspect");
      if (opts?.throwOn === "gitInspect") throw new Error("git spawn failed (stub)");
      if (opts?.refuse === "gitInspect") {
        return { ok: false, summary: `refused: '${args.verb}' is not a read-only git verb (stub)` };
      }
      return { ok: true, summary: `git ${args.verb} ${(args.args ?? []).join(" ")}: 160000 web (stub)` };
    },
  };
}

/** Find one tool definition by name off the built surface (fails loudly when absent). */
function toolNamed(
  tools: ReturnType<typeof buildInspectTools>,
  name: string,
): ReturnType<typeof buildInspectTools>[number] {
  const t = tools.find((d) => d.name === name);
  assert.ok(t !== undefined, `expected the built surface to carry '${name}'`);
  return t;
}

/** Flatten a CallToolResult's text content for assertions. */
function resultText(result: { content: Array<{ type: string; text?: string }> }): string {
  return result.content.map((c) => c.text ?? "").join("\n");
}

/**
 * A superset of every inspect tool's args. The heterogeneous tool array types `.handler`'s param as
 * the INTERSECTION of the three arg shapes, so a call must supply every field — each handler ignores
 * the extras at runtime. Override the fields a test cares about.
 */
function fullArgs(
  over?: Partial<{ runId: string; logFailed: boolean; pr: string; verb: string; args: string[] }>,
): { runId: string; logFailed: boolean; pr: string; verb: string; args: string[] } {
  return { runId: "123", logFailed: false, pr: "650", verb: "status", args: [], ...over };
}

// ---------------------------------------------------------------------------
// its-inspect-tools-mounted-only-with-deps — inspect power is opt-in per
// composition, absent by default (§7 scale-down mirror)
// ---------------------------------------------------------------------------

test("its-inspect-tools-mounted-only-with-deps: absent inspect dep — no inspect tool in allowedTools, no inspect MCP server (byte-identical propose+spawn+landing surface)", async () => {
  const { fn, opts } = capturingQuery([OK_RESULT]);

  await runHeadlessOrchestrator({
    systemPrompt: "SYS",
    userPrompt: "orient",
    // No inspect dep — the session must be byte-identical to today's propose+spawn+landing surface.
    queryFn: fn,
  });

  const o = opts() as { allowedTools?: string[]; mcpServers?: Record<string, unknown> };
  const allowed = o.allowedTools ?? [];
  assert.ok(
    !allowed.some((n) => n.includes("inspect")),
    `with no inspect dep, no inspect tool may appear in allowedTools (§7 scale-down mirror); ` +
      `got: ${JSON.stringify(allowed)}`,
  );
  assert.ok(
    !Object.keys(o.mcpServers ?? {}).includes("inspect"),
    "with no inspect dep, the inspect MCP server must not be mounted",
  );
});

test("its-inspect-tools-mounted-only-with-deps: with the dep, EXACTLY the three inspect tools join allowedTools and the inspect MCP server mounts", async () => {
  // Baseline: the bare surface (no inspect dep, no runner).
  const base = capturingQuery([OK_RESULT]);
  await runHeadlessOrchestrator({ systemPrompt: "SYS", userPrompt: "orient", queryFn: base.fn });
  const baseAllowed = (base.opts() as { allowedTools?: string[] }).allowedTools ?? [];

  // Same composition + the inspect dep.
  const withDeps = capturingQuery([OK_RESULT]);
  await runHeadlessOrchestrator({
    systemPrompt: "SYS",
    userPrompt: "orient and diagnose the red PR",
    queryFn: withDeps.fn,
    inspect: makeInspectDeps(),
  });
  const o = withDeps.opts() as { allowedTools?: string[]; mcpServers?: Record<string, unknown> };

  // EXACTLY the three inspect tool names join the baseline — nothing else changes.
  assert.deepEqual(
    o.allowedTools,
    [
      ...baseAllowed,
      "mcp__inspect__view_ci_run",
      "mcp__inspect__view_pr_checks",
      "mcp__inspect__git_inspect",
    ],
    "the ONLY additions over the bare surface must be the three inspect tool names",
  );
  assert.ok(
    Object.keys(o.mcpServers ?? {}).includes("inspect"),
    "the inspect MCP server must be mounted when the inspect dep is present",
  );
});

// ---------------------------------------------------------------------------
// its-tool-call-dispatches-to-the-handler — invoking a tool drives the handler
// ---------------------------------------------------------------------------

test("its-tool-call-dispatches-to-the-handler: each inspect tool dispatches to the injected handler and returns its observed text", async () => {
  const order: string[] = [];
  const tools = buildInspectTools(makeInspectDeps({ order }));

  const ci = await toolNamed(tools, "view_ci_run").handler(fullArgs({ runId: "999", logFailed: true }), {});
  assert.match(
    resultText(ci as { content: Array<{ type: string; text?: string }> }),
    /run 999 log/,
    "view_ci_run must return the handler's observed text",
  );

  const pr = await toolNamed(tools, "view_pr_checks").handler(fullArgs({ pr: "650" }), {});
  assert.match(
    resultText(pr as { content: Array<{ type: string; text?: string }> }),
    /PR 650 checks/,
    "view_pr_checks must return the handler's observed text",
  );

  const git = await toolNamed(tools, "git_inspect").handler(
    fullArgs({ verb: "ls-tree", args: ["HEAD", "web"] }),
    {},
  );
  const gitText = resultText(git as { content: Array<{ type: string; text?: string }> });
  assert.match(gitText, /git ls-tree HEAD web/, "git_inspect must return the handler's observed text");
  assert.match(gitText, /160000 web/, "git_inspect must surface the command output the handler returned");

  assert.deepEqual(
    order,
    ["viewCiRun", "viewPrChecks", "gitInspect"],
    "each tool must dispatch to its own handler exactly once, in call order",
  );
});

// ---------------------------------------------------------------------------
// its-fail-closed-on-a-throwing-handler — a throwing handler folds to text
// ---------------------------------------------------------------------------

test("its-fail-closed-on-a-throwing-handler: a handler that throws folds to conversation text, never a thrown crash", async () => {
  const toolFor = {
    viewCiRun: "view_ci_run",
    viewPrChecks: "view_pr_checks",
    gitInspect: "git_inspect",
  } as const;
  for (const throwOn of ["viewCiRun", "viewPrChecks", "gitInspect"] as const) {
    const tools = buildInspectTools(makeInspectDeps({ throwOn }));
    const name = toolFor[throwOn];
    const args = fullArgs();

    // Must NOT reject — a fail-closed handler returns a readable failure, never throws into the loop.
    const result = await toolNamed(tools, name).handler(args, {});
    const text = resultText(result as { content: Array<{ type: string; text?: string }> });
    assert.match(
      text,
      /could not|fail|error|unable/i,
      `a throwing ${name} handler must fold to a readable failure text`,
    );
  }
});

// ---------------------------------------------------------------------------
// its-refusal-is-surfaced-not-rewritten — a refused mutating arg surfaces its
// refusal text verbatim (ADR-0173 invariant 1 — read-only means read-only)
// ---------------------------------------------------------------------------

test("its-refusal-is-surfaced-not-rewritten: a REFUSED mutating argument surfaces its refusal text — the surface never rewrites a refusal into a read", async () => {
  const toolFor = {
    viewCiRun: "view_ci_run",
    viewPrChecks: "view_pr_checks",
    gitInspect: "git_inspect",
  } as const;
  for (const refuse of ["viewCiRun", "viewPrChecks", "gitInspect"] as const) {
    const tools = buildInspectTools(makeInspectDeps({ refuse }));
    const name = toolFor[refuse];
    // git_inspect refusal is the load-bearing one: a mutating verb must never reach the shell.
    const args = refuse === "gitInspect" ? fullArgs({ verb: "commit" }) : fullArgs();
    const result = await toolNamed(tools, name).handler(args, {});
    const text = resultText(result as { content: Array<{ type: string; text?: string }> });
    assert.match(text, /refused/i, `a refused ${name} must surface the handler's refusal text verbatim`);
  }
});

// ---------------------------------------------------------------------------
// its-chat-session-keeps-no-write-bash — inspect power, never raw write power
// (ADR-0137 d.1 / ADR-0173 invariant 1 — the wall test that matters most)
// ---------------------------------------------------------------------------

test("its-chat-session-keeps-no-write-bash: with inspect deps present, tools stays [] and allowedTools carries NO Write/Edit/Bash", async () => {
  const { fn, opts } = capturingQuery([OK_RESULT]);

  await runHeadlessOrchestrator({
    systemPrompt: "SYS",
    userPrompt: "orient and diagnose the red PR",
    queryFn: fn,
    inspect: makeInspectDeps(),
  });

  const o = opts() as { tools?: unknown; allowedTools?: string[] };
  const allowed = o.allowedTools ?? [];

  // tools: [] must stay — the inspect tools are named READ actions, never a raw shell (ADR-0137 d.1
  // widened for OBSERVATION only, ADR-0173 invariant 1).
  assert.deepEqual(
    o.tools,
    [],
    "tools must be [] — the chat must NEVER have a raw write/shell surface; inspect is scoped READ MCP tools",
  );

  for (const bad of ["Write", "Edit", "Bash"]) {
    assert.ok(
      !allowed.includes(bad),
      `'${bad}' must NOT appear in allowedTools — inspect is scoped read MCP tools, not raw shell ` +
        `(ADR-0137 d.1); got: ${JSON.stringify(allowed)}`,
    );
  }
});

// ---------------------------------------------------------------------------
// its-no-verdict-crosses-back — the model sees observations, never a verdict
// (ADR-0091 / ADR-0020: the spine signs out-of-band)
// ---------------------------------------------------------------------------

test("its-no-verdict-crosses-back: inspect tool results are plain observation text — no verdict-shaped payload", async () => {
  const tools = buildInspectTools(makeInspectDeps());

  const callArgs = fullArgs();
  for (const name of ["view_ci_run", "view_pr_checks", "git_inspect"] as const) {
    const result = await toolNamed(tools, name).handler(callArgs, {});
    const content = (result as { content: Array<{ type: string; text?: string }> }).content;
    assert.ok(content.length > 0, `${name} must return content`);
    for (const item of content) {
      assert.equal(item.type, "text", `every ${name} result item must be plain text`);
    }
    // No verdict-shaped payload anywhere — the surface reads; the spine signs out-of-band.
    const serialized = JSON.stringify(result);
    for (const forbidden of ["signedBy", "signing", "proofStatus", "proof_status", "anchor"]) {
      assert.ok(
        !serialized.includes(`"${forbidden}"`),
        `no '${forbidden}' field may appear in a ${name} result — the spine signs out-of-band`,
      );
    }
  }
});
