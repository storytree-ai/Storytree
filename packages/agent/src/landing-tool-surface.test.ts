/**
 * Contract tests for landing-tool-surface (landing-tool-surface capability, ADR-0152).
 *
 * Pins the integration of the desktop orchestrator's LANDING tool surface into the headless
 * orchestrator session — the merge-ceremony tools (run_gate + open_landing_pr) the terminal
 * session-orchestrator already has (gate → commit → push → non-draft PR; CI automerges, ADR-0022).
 *
 * One test block per behaviour:
 *   lts-landing-tools-mounted-only-with-deps — landing power is opt-in per composition, absent by
 *     default (§7 scale-down mirror): a dep-less session is byte-identical to the propose+spawn
 *     surface; with deps, exactly the three landing tools join allowedTools and the landing MCP
 *     server mounts.
 *   lts-tool-call-dispatches-to-the-handler — invoking a landing tool dispatches to the injected
 *     handler and returns the handler's summary TEXT to the model.
 *   lts-poll-pr-checks-observes-ci-state — poll_pr_checks reports the handler's observed status
 *     VERBATIM across pending / passed / failed / merged / unknown (ADR-0163 Gap B2 — the surface
 *     gives the orchestrator eyes on CI; it observes, never signs).
 *   lts-fail-closed-on-a-throwing-handler — a handler that throws folds to conversation text (a
 *     failure the orchestrator can read), NEVER a thrown crash into the SDK loop.
 *   lts-run-gate-is-observed-not-authored — run_gate reports the handler's pass/fail VERBATIM; a
 *     FAILED gate returns failure text (the surface never rewrites a fail to a pass — ADR-0020).
 *   lts-chat-session-keeps-no-write-bash — tools: [] stays; NO Write/Edit/Bash in allowedTools even
 *     with landing power (ADR-0137 d.1 — the landing tools are the ONLY sanctioned side-effect surface).
 *   lts-no-verdict-crosses-back — a landing tool returns progress/status TEXT; no verdict-shaped
 *     payload appears in any tool result (ADR-0091 / ADR-0020: the spine signs out-of-band, not the chat).
 *
 * Every test is OFFLINE: queryFn and landing handler stubs are injected — no live SDK spend, no
 * real gate/git/gh. The real deps composition (shelling pnpm gate / git / gh) is @storytree/drive's
 * follow-on; this file pins the COMPOSITION — the surface mounts on the headless-orchestrator seam
 * only when landing deps are present, and every handler is fail-closed.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import { runHeadlessOrchestrator } from "./headless-orchestrator.js";
import { buildLandingTools } from "./landing-tool-surface.js";
import type { LandingSurfaceDeps, LandingPollStatus } from "./landing-tool-surface.js";
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
 * Build recording landing deps. `order` records "runGate" / "openLandingPr" / "pollPrChecks" call
 * events so the dispatch is observable; `gatePassed` controls the gate verdict; `pollStatus` controls
 * the poll's observed CI state; `throwOn` makes the named handler throw (to exercise the fail-closed arm).
 */
function makeLandingDeps(opts?: {
  order?: string[];
  gatePassed?: boolean;
  pollStatus?: LandingPollStatus;
  throwOn?: "runGate" | "openLandingPr" | "pollPrChecks";
}): LandingSurfaceDeps {
  const order = opts?.order ?? [];
  const gatePassed = opts?.gatePassed ?? true;
  const pollStatus = opts?.pollStatus ?? "merged";
  return {
    runGate: async () => {
      order.push("runGate");
      if (opts?.throwOn === "runGate") throw new Error("gate subprocess spawn failed (stub)");
      return gatePassed
        ? { passed: true, summary: "gate PASSED — 494 tests green (stub)" }
        : { passed: false, summary: "gate FAILED — @storytree/cli 1 red (stub)" };
    },
    openLandingPr: async (args) => {
      order.push("openLandingPr");
      if (opts?.throwOn === "openLandingPr") throw new Error("gh pr create failed (stub)");
      return {
        ok: true,
        summary: `PR opened for '${args.prTitle}' (stub)`,
        prUrl: "https://github.com/HuaMick/storytree/pull/999",
      };
    },
    pollPrChecks: async (args) => {
      order.push("pollPrChecks");
      if (opts?.throwOn === "pollPrChecks") throw new Error("gh pr view failed (stub)");
      return { status: pollStatus, summary: `poll of ${args.pr}: ${pollStatus} (stub)` };
    },
  };
}

/** Find one tool definition by name off the built surface (fails loudly when absent). */
function toolNamed(
  tools: ReturnType<typeof buildLandingTools>,
  name: string,
): ReturnType<typeof buildLandingTools>[number] {
  const t = tools.find((d) => d.name === name);
  assert.ok(t !== undefined, `expected the built surface to carry '${name}'`);
  return t;
}

/** Flatten a CallToolResult's text content for assertions. */
function resultText(result: { content: Array<{ type: string; text?: string }> }): string {
  return result.content.map((c) => c.text ?? "").join("\n");
}

/**
 * A superset of every landing tool's args. The heterogeneous tool array types `.handler`'s param as
 * the INTERSECTION of all three arg shapes ({commitMessage,prTitle,prBody} & {pr}), so a call must
 * supply every field — each handler ignores the extras at runtime. Override the fields a test cares about.
 */
function fullArgs(
  over?: Partial<{ commitMessage: string; prTitle: string; prBody: string; pr: string }>,
): { commitMessage: string; prTitle: string; prBody: string; pr: string } {
  return { commitMessage: "", prTitle: "", prBody: "", pr: "999", ...over };
}

// ---------------------------------------------------------------------------
// lts-landing-tools-mounted-only-with-deps — landing power is opt-in per
// composition, absent by default (§7 scale-down mirror)
// ---------------------------------------------------------------------------

test("lts-landing-tools-mounted-only-with-deps: absent landing dep — no landing tool in allowedTools, no landing MCP server (byte-identical propose+spawn surface)", async () => {
  const { fn, opts } = capturingQuery([OK_RESULT]);

  await runHeadlessOrchestrator({
    systemPrompt: "SYS",
    userPrompt: "orient",
    // No landing dep — the session must be byte-identical to today's propose+spawn surface.
    queryFn: fn,
  });

  const o = opts() as { allowedTools?: string[]; mcpServers?: Record<string, unknown> };
  const allowed = o.allowedTools ?? [];
  assert.ok(
    !allowed.some((n) => n.includes("landing")),
    `with no landing dep, no landing tool may appear in allowedTools (§7 scale-down mirror); ` +
      `got: ${JSON.stringify(allowed)}`,
  );
  assert.ok(
    !Object.keys(o.mcpServers ?? {}).includes("landing"),
    "with no landing dep, the landing MCP server must not be mounted",
  );
});

test("lts-landing-tools-mounted-only-with-deps: with the dep, EXACTLY the three landing tools join allowedTools and the landing MCP server mounts (no propose surface, ADR-0155)", async () => {
  // Baseline: the bare surface (no landing dep, no runner) — the orchestrator drives, it does not
  // propose (ADR-0155), so there is no propose_unit tool in the baseline.
  const base = capturingQuery([OK_RESULT]);
  await runHeadlessOrchestrator({ systemPrompt: "SYS", userPrompt: "orient", queryFn: base.fn });
  const baseAllowed = (base.opts() as { allowedTools?: string[] }).allowedTools ?? [];

  // Same composition + the landing dep.
  const withDeps = capturingQuery([OK_RESULT]);
  await runHeadlessOrchestrator({
    systemPrompt: "SYS",
    userPrompt: "orient and land when green",
    queryFn: withDeps.fn,
    landing: makeLandingDeps(),
  });
  const o = withDeps.opts() as { allowedTools?: string[]; mcpServers?: Record<string, unknown> };

  // EXACTLY the three landing tool names join the baseline — nothing else changes.
  assert.deepEqual(
    o.allowedTools,
    [
      ...baseAllowed,
      "mcp__landing__run_gate",
      "mcp__landing__open_landing_pr",
      "mcp__landing__poll_pr_checks",
    ],
    "the ONLY additions over the bare surface must be the three landing tool names",
  );
  assert.ok(
    Object.keys(o.mcpServers ?? {}).includes("landing"),
    "the landing MCP server must be mounted when the landing dep is present",
  );
  // And the retired propose surface is never present (ADR-0155).
  assert.equal(
    (o.allowedTools ?? []).includes("mcp__proposal__propose_unit"),
    false,
    "propose_unit must NOT be advertised — the orchestrator drives, it does not propose",
  );
});

// ---------------------------------------------------------------------------
// lts-tool-call-dispatches-to-the-handler — invoking a tool drives the handler
// ---------------------------------------------------------------------------

test("lts-tool-call-dispatches-to-the-handler: run_gate + open_landing_pr each dispatch to the injected handler and return its summary text", async () => {
  const order: string[] = [];
  const tools = buildLandingTools(makeLandingDeps({ order }));

  // Full-superset args satisfy the intersection-typed handler (run_gate ignores the extras at runtime).
  const gate = await toolNamed(tools, "run_gate").handler(fullArgs(), {});
  assert.match(
    resultText(gate as { content: Array<{ type: string; text?: string }> }),
    /gate PASSED/,
    "run_gate must return the handler's summary text",
  );

  const pr = await toolNamed(tools, "open_landing_pr").handler(
    fullArgs({ commitMessage: "feat: land the unit", prTitle: "Land the unit", prBody: "body" }),
    {},
  );
  const prText = resultText(pr as { content: Array<{ type: string; text?: string }> });
  assert.match(prText, /PR opened/, "open_landing_pr must return the handler's summary text");
  assert.match(prText, /pull\/999/, "open_landing_pr must surface the PR url the handler returned");

  assert.deepEqual(
    order,
    ["runGate", "openLandingPr"],
    "each tool must dispatch to its own handler exactly once, in call order",
  );
});

// ---------------------------------------------------------------------------
// lts-poll-pr-checks-observes-ci-state — poll_pr_checks surfaces the OBSERVED
// CI state verbatim across every status (ADR-0163 Gap B2)
// ---------------------------------------------------------------------------

test("lts-poll-pr-checks-observes-ci-state: poll_pr_checks dispatches to the handler and surfaces the observed status text for every state", async () => {
  for (const status of ["pending", "passed", "failed", "merged", "unknown"] as const) {
    const order: string[] = [];
    const tools = buildLandingTools(makeLandingDeps({ order, pollStatus: status }));
    const result = await toolNamed(tools, "poll_pr_checks").handler(fullArgs({ pr: "999" }), {});
    const text = resultText(result as { content: Array<{ type: string; text?: string }> });
    assert.match(
      text,
      new RegExp(status, "i"),
      `poll_pr_checks must surface the observed '${status}' state to the orchestrator`,
    );
    assert.match(text, /999/, "the summary must reference the polled PR");
    assert.deepEqual(order, ["pollPrChecks"], "poll_pr_checks must dispatch to its own handler once");
  }
});

// ---------------------------------------------------------------------------
// lts-fail-closed-on-a-throwing-handler — a throwing handler folds to text
// ---------------------------------------------------------------------------

test("lts-fail-closed-on-a-throwing-handler: a handler that throws folds to conversation text, never a thrown crash", async () => {
  const toolFor = {
    runGate: "run_gate",
    openLandingPr: "open_landing_pr",
    pollPrChecks: "poll_pr_checks",
  } as const;
  for (const throwOn of ["runGate", "openLandingPr", "pollPrChecks"] as const) {
    const tools = buildLandingTools(makeLandingDeps({ throwOn }));
    const name = toolFor[throwOn];
    // A superset of every tool's args satisfies all three handler signatures (each ignores the
    // extras); this sidesteps the union-handler type over the distinct arg shapes.
    const args = { commitMessage: "m", prTitle: "t", prBody: "b", pr: "999" };

    // Must NOT reject — a fail-closed handler returns a readable failure, never throws into the loop.
    const result = await toolNamed(tools, name).handler(args, {});
    const text = resultText(result as { content: Array<{ type: string; text?: string }> });
    assert.match(
      text,
      /fail|error|could not|unable/i,
      `a throwing ${name} handler must fold to a readable failure text`,
    );
  }
});

// ---------------------------------------------------------------------------
// lts-run-gate-is-observed-not-authored — a FAILED gate returns failure text
// (ADR-0020: the surface reports the observed verdict, never rewrites it)
// ---------------------------------------------------------------------------

test("lts-run-gate-is-observed-not-authored: a FAILED gate returns failure text — the surface never rewrites a red gate to green", async () => {
  const tools = buildLandingTools(makeLandingDeps({ gatePassed: false }));
  const result = await toolNamed(tools, "run_gate").handler(
    fullArgs(),
    {},
  );
  const text = resultText(result as { content: Array<{ type: string; text?: string }> });
  assert.match(text, /FAIL/i, "a red gate must surface as a failure to the orchestrator");
  assert.doesNotMatch(
    text,
    /\bpassed\b/i,
    "a red gate result must NOT read as passed (the surface reports, never authors, the verdict)",
  );
});

// ---------------------------------------------------------------------------
// lts-chat-session-keeps-no-write-bash — landing power, never raw write power
// (ADR-0137 d.1 — the wall test that matters most)
// ---------------------------------------------------------------------------

test("lts-chat-session-keeps-no-write-bash: with landing deps present, tools stays [] and allowedTools carries NO Write/Edit/Bash", async () => {
  const { fn, opts } = capturingQuery([OK_RESULT]);

  await runHeadlessOrchestrator({
    systemPrompt: "SYS",
    userPrompt: "orient and land when green",
    queryFn: fn,
    landing: makeLandingDeps(),
  });

  const o = opts() as { tools?: unknown; allowedTools?: string[] };
  const allowed = o.allowedTools ?? [];

  // tools: [] must stay — the landing tools are the ONLY sanctioned side-effect surface, each a
  // named narrow action, never a raw shell (ADR-0137 d.1 upheld by ADR-0152 d.2).
  assert.deepEqual(
    o.tools,
    [],
    "tools must be [] — the chat must NEVER have a raw write/shell surface; landing is scoped MCP tools",
  );

  for (const bad of ["Write", "Edit", "Bash"]) {
    assert.ok(
      !allowed.includes(bad),
      `'${bad}' must NOT appear in allowedTools — landing is scoped MCP tools, not raw shell ` +
        `(ADR-0137 d.1); got: ${JSON.stringify(allowed)}`,
    );
  }
});

// ---------------------------------------------------------------------------
// lts-no-verdict-crosses-back — the model sees progress, never a verdict
// (ADR-0091 / ADR-0020: the spine signs out-of-band)
// ---------------------------------------------------------------------------

test("lts-no-verdict-crosses-back: landing tool results are plain progress/status text — no verdict-shaped payload", async () => {
  const tools = buildLandingTools(makeLandingDeps());

  // Full-superset args satisfy every tool's handler signature (each ignores the extras).
  const callArgs = fullArgs();
  for (const name of ["run_gate", "open_landing_pr", "poll_pr_checks"] as const) {
    const result = await toolNamed(tools, name).handler(callArgs, {});
    const content = (result as { content: Array<{ type: string; text?: string }> }).content;
    assert.ok(content.length > 0, `${name} must return content`);
    for (const item of content) {
      assert.equal(item.type, "text", `every ${name} result item must be plain text`);
    }
    // No verdict-shaped payload anywhere — the surface runs the gate / opens a PR; the spine signs
    // the verdict out-of-band (ADR-0091 / ADR-0020). The landing tools never carry one.
    const serialized = JSON.stringify(result);
    for (const forbidden of ["signedBy", "signing", "proofStatus", "proof_status", "anchor"]) {
      assert.ok(
        !serialized.includes(`"${forbidden}"`),
        `no '${forbidden}' field may appear in a ${name} result — the spine signs out-of-band`,
      );
    }
  }
});
