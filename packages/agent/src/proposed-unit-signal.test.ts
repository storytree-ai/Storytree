/**
 * Tests for the non-spoofable proposed-unit signal (ADR-0108 d.3): the headless orchestrator captures
 * the unitId the agent DECLARES via a typed `propose_unit` tool_use message — a structural signal, not
 * a regex scraped from free text — and adds no write authority by doing so.
 *
 * One named, substantive test per declared `## Contracts` behaviour, named for its contract id so the
 * contract-coverage classifier (ADR-0122 / ADR-0126) detects it:
 *   - pus-captures-tool-declared-unit-id  — the tool's unitId arg becomes result.proposedUnitId
 *   - pus-signal-not-parsed-from-prose    — the id is structural, never scraped from the proposal text
 *   - pus-absent-declaration-is-undefined — no declaration → undefined (no forged id, no default)
 *   - pus-tool-is-read-only               — adding propose_unit adds NO write authority (ADR-0091)
 *
 * The keystone red→green (capture) was authored by the gated leaf and signed by the spine; these
 * standing tests complete the declared contract coverage against that landed implementation. All are
 * OFFLINE (injected queryFn, no live SDK spend — ADR-0010 §5).
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import { runHeadlessOrchestrator } from "./headless-orchestrator.js";
import type { SdkQueryFn } from "./sdk-author.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function queryYielding(messages: unknown[]): SdkQueryFn {
  return () =>
    (async function* () {
      for (const m of messages) yield m;
    })();
}

/** A scripted success result. `proposal` is the agent's free-text reply (a preview, not the signal). */
function okResult(proposal: string): unknown {
  return {
    type: "result",
    subtype: "success",
    is_error: false,
    num_turns: 2,
    total_cost_usd: 0.01,
    result: proposal,
  };
}

/**
 * A scripted assistant message carrying a `propose_unit` tool_use block — the structural declaration
 * the runner captures (distinct from the `stream_event` partials used for text deltas). The tool name
 * is the EXACT `mcp__proposal__propose_unit` the landed `extractProposedUnit` matches on, so this
 * drives the real extraction path.
 */
function proposeUnitMessage(unitId: string): unknown {
  return {
    type: "assistant",
    message: {
      content: [
        { type: "tool_use", id: "tu_propose_1", name: "mcp__proposal__propose_unit", input: { unitId } },
      ],
    },
  };
}

/** A read-only orientation runner stub — its mere presence mounts the orientation + propose surface. */
const orientationRunner = async (_argv: readonly string[], _deps: unknown) => ({
  ok: true as const,
  body: "## tree\n(stub)",
});

// ---------------------------------------------------------------------------
// pus-captures-tool-declared-unit-id — the tool's unitId arg becomes result.proposedUnitId
// ---------------------------------------------------------------------------

test("pus-captures-tool-declared-unit-id: the propose_unit tool arg is captured onto result.proposedUnitId", async () => {
  const res = await runHeadlessOrchestrator({
    systemPrompt: "You are the orchestrator agent.",
    userPrompt: "Orient and propose the next unit.",
    queryFn: queryYielding([proposeUnitMessage("some-unit"), okResult("My proposal text.")]),
  });

  assert.equal(res.ok, true, "session must succeed");
  assert.equal(
    res.proposedUnitId,
    "some-unit",
    "proposedUnitId must be captured from the propose_unit tool_use message's unitId input — " +
      "a typed structural declaration (ADR-0108 d.3)",
  );
});

// ---------------------------------------------------------------------------
// pus-signal-not-parsed-from-prose — the id is structural, never scraped from the proposal text
// ---------------------------------------------------------------------------

test("pus-signal-not-parsed-from-prose: proposedUnitId comes from the tool arg, never the free-text proposal", async () => {
  // The tool declares one id; the free-text proposal names a DIFFERENT unit-id-like token. A regex
  // scrape of the prose would capture "decoy-unit-id"; the structural capture must yield the tool's id.
  const res = await runHeadlessOrchestrator({
    systemPrompt: "You are the orchestrator agent.",
    userPrompt: "Orient and propose.",
    queryFn: queryYielding([
      proposeUnitMessage("tool-declared-unit"),
      okResult("I considered decoy-unit-id but my prose mentions other-thing entirely."),
    ]),
  });

  assert.equal(res.ok, true, "session must succeed");
  assert.equal(
    res.proposedUnitId,
    "tool-declared-unit",
    "the id must come from the tool arg, not the prose — a structural, non-spoofable signal",
  );
  assert.notEqual(
    res.proposedUnitId,
    "decoy-unit-id",
    "the id must NOT be scraped from a unit-id-like token in the free-text proposal",
  );

  // And with NO tool call, prose full of unit-id-like tokens still yields no id (prose is never scraped).
  const proseOnly = await runHeadlessOrchestrator({
    systemPrompt: "SYS",
    userPrompt: "chat",
    queryFn: queryYielding([okResult("Maybe build foo-bar-baz or qux-quux — prose only, no tool call.")]),
  });
  assert.equal(
    proseOnly.proposedUnitId,
    undefined,
    "a session that declares no propose_unit must yield undefined even when its prose names units",
  );
});

// ---------------------------------------------------------------------------
// pus-absent-declaration-is-undefined — no declaration → undefined (no forged id, no default)
// ---------------------------------------------------------------------------

test("pus-absent-declaration-is-undefined: a session that never calls propose_unit yields proposedUnitId undefined", async () => {
  const res = await runHeadlessOrchestrator({
    systemPrompt: "You are the orchestrator agent.",
    userPrompt: "Just think out loud without calling any tools.",
    queryFn: queryYielding([okResult("Thinking out loud, no proposal.")]),
  });

  assert.equal(res.ok, true, "session must succeed");
  assert.equal(
    res.proposedUnitId,
    undefined,
    "proposedUnitId must be undefined when no propose_unit tool_use was emitted — never a forged default",
  );
  // The free-text proposal is still surfaced (the signal is additive, not a replacement).
  assert.equal(res.proposal, "Thinking out loud, no proposal.", "the free-text proposal is still surfaced");
});

// ---------------------------------------------------------------------------
// pus-tool-is-read-only — adding propose_unit adds NO write authority (ADR-0091)
// ---------------------------------------------------------------------------

test("pus-tool-is-read-only: the session surface exposes no write tool and propose_unit only declares", async () => {
  let capturedOptions: { tools?: unknown; allowedTools?: unknown } | undefined;
  const capturingQuery: SdkQueryFn = ({ options }) => {
    capturedOptions = options as { tools?: unknown; allowedTools?: unknown };
    return (async function* () {
      yield proposeUnitMessage("read-only-check");
      yield okResult("done");
    })();
  };

  const res = await runHeadlessOrchestrator({
    systemPrompt: "You are the orchestrator agent.",
    userPrompt: "Orient and propose.",
    // A runner is present so the orientation + propose tool surface is mounted (ADR-0108 §7).
    runner: orientationRunner,
    queryFn: capturingQuery,
  });

  assert.equal(res.ok, true, "session must succeed");
  assert.ok(capturedOptions !== undefined, "the query must be called with options");

  // The Phase-1 wall: NO built-in tools (Write/Edit/Bash live there) — propose_unit added none.
  assert.deepEqual(capturedOptions.tools, [], "options.tools must be [] — no Write/Edit/Bash built-ins");

  const allowed = Array.isArray(capturedOptions.allowedTools)
    ? (capturedOptions.allowedTools as string[])
    : [];
  assert.ok(
    allowed.every((n) => !/write|edit|bash/i.test(n)),
    `no allowed tool may grant write/exec authority; got ${JSON.stringify(allowed)}`,
  );
  // propose_unit IS advertised (so the live agent can declare) — a read-only declaration tool only.
  assert.ok(
    allowed.some((n) => n.includes("propose_unit")),
    "propose_unit must be advertised as an allowed tool so the agent can declare its proposal",
  );
  // Read-only does not mean inert: the declaration still produced the id.
  assert.equal(res.proposedUnitId, "read-only-check", "the read-only tool still records the declared id");
});
