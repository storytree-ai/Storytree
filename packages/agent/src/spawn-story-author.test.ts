/**
 * Integration tests for runSpawnStoryAuthor — the write-scoped SDK session runner for the
 * story-author surface (story-author-spawn capability):
 *
 * - The caller injects the systemPrompt (the rendered story-author agent — this module does NOT
 *   render it; rendering is `spawn-deps-composition`'s contract keeping this module library-free)
 * - The write fence is a fail-closed PreToolUse hook on Write/Edit, defaulting to stories/**
 * - The result is { ok: true, summary, turns?, costUsd? } or { ok: false, error } — NEVER a verdict
 * - The turn cap (default 16) is the runaway brake; no USD ceiling by default (ADR-0130)
 * - Bash is never in the tool surface (a shell write would bypass the write fence)
 *
 * Every test is OFFLINE: the queryFn seam is injected, so no live SDK spend. Tests capture the
 * SDK Options to fire the write-fence hook and pin the tool-surface invariants (the same pattern
 * as sdk-author.test.ts's WIRED hook suite).
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import * as path from "node:path";

// RED: spawn-story-author.ts does not exist yet — module-not-found is the right-kind red.
import { runSpawnStoryAuthor } from "./spawn-story-author.js";
import type { SdkQueryFn } from "./sdk-author.js";

// ---------------------------------------------------------------------------
// Platform-agnostic workspace (resolves under the current drive on Windows, / on POSIX)
// ---------------------------------------------------------------------------

const CWD = path.resolve("/workspace");

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function queryYielding(messages: unknown[]): SdkQueryFn {
  return () =>
    (async function* () {
      for (const m of messages) yield m;
    })();
}

/** The standard success result message the scripted double yields. */
const SUCCESS_RESULT = {
  type: "result",
  subtype: "success",
  is_error: false,
  num_turns: 4,
  total_cost_usd: 0.0072,
  result: "Authored stories/task-spawn/spec.md and 2 capability frontmatter files.",
};

/**
 * A query seam that captures the Options it receives, then streams the given messages.
 * Mirrors the `capturingQueryFn` pattern from sdk-author.test.ts.
 */
function capturingQuery(messages: unknown[]): { fn: SdkQueryFn; opts: () => unknown } {
  let last: unknown;
  const fn: SdkQueryFn = (q) => {
    last = q.options;
    return queryYielding(messages)(q);
  };
  return { fn, opts: () => last };
}

// ---------------------------------------------------------------------------
// The PreToolUse hook type (structural — avoids importing SDK types directly)
// Mirrors the wiredScopeHook approach in sdk-author.test.ts.
// ---------------------------------------------------------------------------

type ScopeHook = (
  input: {
    hook_event_name: string;
    tool_name: string;
    tool_input: unknown;
    tool_use_id: string;
    session_id: string;
    transcript_path: string;
    cwd: string;
  },
  id: string,
  ctx: { signal: AbortSignal },
) => Promise<unknown>;

/** Extract the PreToolUse scope hook from captured SDK Options. */
function extractScopeHook(raw: unknown): ScopeHook {
  const o = raw as { hooks?: { PreToolUse?: Array<{ hooks: ScopeHook[] }> } };
  const matcher = o.hooks?.PreToolUse?.[0];
  assert.ok(matcher !== undefined, "a PreToolUse write-scope hook must be wired into the Options");
  const hook = matcher.hooks[0];
  assert.ok(hook !== undefined, "the PreToolUse scope-hook closure must be present");
  return hook;
}

const SIGNAL = { signal: new AbortController().signal };

/** Build a PreToolUseHookInput for a Write/Edit call (structural — no SDK import). */
function preToolUseInput(toolName: string, filePath: string) {
  return {
    hook_event_name: "PreToolUse",
    tool_name: toolName,
    tool_input: { file_path: filePath },
    tool_use_id: "tu-test",
    session_id: "sess-1",
    transcript_path: path.join(CWD, "transcript.jsonl"),
    cwd: CWD,
  };
}

/** Read the deny-verdict shape out of a hook output. */
function denyOf(out: unknown): { event: string | undefined; decision: string | undefined; reason: string | undefined } {
  const hso = (
    out as {
      hookSpecificOutput?: {
        hookEventName?: string;
        permissionDecision?: string;
        permissionDecisionReason?: string;
      };
    }
  ).hookSpecificOutput;
  return {
    event: hso?.hookEventName,
    decision: hso?.permissionDecision,
    reason: hso?.permissionDecisionReason,
  };
}

// ---------------------------------------------------------------------------
// 1. Session result shape — success: summary is the SDK result.result field
// ---------------------------------------------------------------------------

test("runSpawnStoryAuthor returns { ok: true, summary, turns, costUsd } on a successful session", async () => {
  const r = await runSpawnStoryAuthor({
    systemPrompt: "You are story-author.",
    userPrompt: "Create a story for the spawn runner.",
    cwd: CWD,
    queryFn: queryYielding([{ type: "assistant" }, SUCCESS_RESULT]),
  });

  assert.equal(r.ok, true, "a successful SDK session must return ok: true");
  if (!r.ok) return;
  assert.equal(
    r.summary,
    "Authored stories/task-spawn/spec.md and 2 capability frontmatter files.",
    "summary must be read from the SDK result message's result field",
  );
  assert.equal(r.turns, 4, "turns must be read from num_turns");
  assert.equal(r.costUsd, 0.0072, "costUsd must be read from total_cost_usd");
});

// ---------------------------------------------------------------------------
// 2. Fail-closed — stream ends without a result message
// ---------------------------------------------------------------------------

test("runSpawnStoryAuthor fails closed when the stream ends without a result message", async () => {
  const r = await runSpawnStoryAuthor({
    systemPrompt: "SYS",
    userPrompt: "x",
    cwd: CWD,
    queryFn: queryYielding([{ type: "assistant" }]),
  });

  assert.equal(r.ok, false);
  if (r.ok) return;
  assert.match(r.error, /without a result/, "error must describe the missing result message");
});

// ---------------------------------------------------------------------------
// 3. Fail-closed — non-success SDK result, subtype surfaced in error
// ---------------------------------------------------------------------------

test("runSpawnStoryAuthor fails closed on a non-success SDK result, surfacing the subtype", async () => {
  const r = await runSpawnStoryAuthor({
    systemPrompt: "SYS",
    userPrompt: "x",
    cwd: CWD,
    queryFn: queryYielding([
      {
        type: "result",
        subtype: "error_max_turns",
        is_error: true,
        num_turns: 16,
        total_cost_usd: 0.15,
        errors: ["turn ceiling reached"],
      },
    ]),
  });

  assert.equal(r.ok, false);
  if (r.ok) return;
  assert.match(r.error, /error_max_turns/, "error must include the result subtype");
});

// ---------------------------------------------------------------------------
// 4. Never throws — a throwing queryFn is returned as { ok: false, error }
// ---------------------------------------------------------------------------

test("runSpawnStoryAuthor never throws — a throwing queryFn returns { ok: false, error }", async () => {
  const r = await runSpawnStoryAuthor({
    systemPrompt: "SYS",
    userPrompt: "x",
    cwd: CWD,
    queryFn: () =>
      (async function* () {
        throw new Error("connection refused");
        // eslint-disable-next-line no-unreachable
        yield {};
      })(),
  });

  assert.equal(r.ok, false);
  if (r.ok) return;
  assert.match(r.error, /SDK session failed/, "error must carry the SDK failure prefix");
  assert.match(r.error, /connection refused/, "error must carry the thrown message");
});

// ---------------------------------------------------------------------------
// 5. ADR-0130: no USD ceiling by default — the turn cap (16) is the brake
// ---------------------------------------------------------------------------

test("runSpawnStoryAuthor runs with NO USD budget ceiling by default — the turn cap is the brake (ADR-0130)", async () => {
  const { fn, opts } = capturingQuery([SUCCESS_RESULT]);
  const r = await runSpawnStoryAuthor({ systemPrompt: "SYS", userPrompt: "x", cwd: CWD, queryFn: fn });
  assert.equal(r.ok, true);

  const o = opts() as { maxBudgetUsd?: unknown; maxTurns?: unknown };
  assert.equal(
    o.maxBudgetUsd,
    undefined,
    "no maxBudgetUsd must be passed to the SDK by default (subscription-funded, ADR-0030)",
  );
  assert.equal(
    o.maxTurns,
    16,
    "the turn cap (16) must remain the runaway brake (ADR-0130)",
  );
});

// ---------------------------------------------------------------------------
// 6. ADR-0131: an explicit maxBudgetUsd passes through as the opt-in ceiling
// ---------------------------------------------------------------------------

test("runSpawnStoryAuthor passes an explicit maxBudgetUsd through as the opt-in ceiling (ADR-0131)", async () => {
  const { fn, opts } = capturingQuery([SUCCESS_RESULT]);
  await runSpawnStoryAuthor({
    systemPrompt: "SYS",
    userPrompt: "x",
    cwd: CWD,
    maxBudgetUsd: 1.5,
    queryFn: fn,
  });

  const o = opts() as { maxBudgetUsd?: unknown };
  assert.equal(o.maxBudgetUsd, 1.5, "an operator-set budget ceiling must be honoured");
});

// ---------------------------------------------------------------------------
// 7. Bash is never in the tool surface — a shell write bypasses the fence
// ---------------------------------------------------------------------------

test("Bash is never in the tool surface (a shell write would bypass the write fence)", async () => {
  const { fn, opts } = capturingQuery([SUCCESS_RESULT]);
  await runSpawnStoryAuthor({ systemPrompt: "SYS", userPrompt: "x", cwd: CWD, queryFn: fn });

  const o = opts() as { tools?: unknown; allowedTools?: unknown };
  assert.ok(
    Array.isArray(o.tools),
    "the tool surface must be an explicit allow-list, not an SDK preset (a preset could smuggle Bash)",
  );
  const tools = o.tools as string[];
  assert.equal(tools.includes("Bash"), false, "Bash must never appear in the tool surface");
  const allowed = (o.allowedTools ?? []) as string[];
  assert.equal(allowed.includes("Bash"), false, "Bash must not be allow-listed either");
});

// ---------------------------------------------------------------------------
// 8. Write fence — default stories/** scope: out-of-scope write is DENIED (the wall holds)
// ---------------------------------------------------------------------------

test("the write fence DENIES Write calls outside stories/** by default (fail-closed; the wall holds)", async () => {
  const { fn, opts } = capturingQuery([SUCCESS_RESULT]);
  await runSpawnStoryAuthor({ systemPrompt: "SYS", userPrompt: "x", cwd: CWD, queryFn: fn });
  const hook = extractScopeHook(opts());

  // A write to packages/ is outside the work-hierarchy surface (stories/**).
  const out = await hook(
    preToolUseInput("Write", "packages/agent/src/hack.ts"),
    "tu-test",
    SIGNAL,
  );
  const deny = denyOf(out);
  assert.equal(deny.decision, "deny", "a Write outside stories/** must be denied");
  assert.ok(
    (deny.reason ?? "").length > 0,
    "a denial must carry a reason string",
  );
});

// ---------------------------------------------------------------------------
// 9. Write fence — default stories/** scope: in-scope Write is ALLOWED (empty output)
// ---------------------------------------------------------------------------

test("the write fence ALLOWS Write calls inside stories/** (the work-hierarchy surface)", async () => {
  const { fn, opts } = capturingQuery([SUCCESS_RESULT]);
  await runSpawnStoryAuthor({ systemPrompt: "SYS", userPrompt: "x", cwd: CWD, queryFn: fn });
  const hook = extractScopeHook(opts());

  // A write to stories/ is within the work-hierarchy surface.
  const out = await hook(
    preToolUseInput("Write", "stories/new-story/spec.md"),
    "tu-test",
    SIGNAL,
  );
  assert.deepEqual(out, {}, "a Write inside stories/** must be allowed (empty hook output)");
});

// ---------------------------------------------------------------------------
// 10. Write fence — Edit inside stories/** is also ALLOWED
// ---------------------------------------------------------------------------

test("the write fence ALLOWS Edit calls inside stories/** (Edit is also gated by the hook)", async () => {
  const { fn, opts } = capturingQuery([SUCCESS_RESULT]);
  await runSpawnStoryAuthor({ systemPrompt: "SYS", userPrompt: "x", cwd: CWD, queryFn: fn });
  const hook = extractScopeHook(opts());

  const out = await hook(
    preToolUseInput("Edit", "stories/existing-story/capabilities/cap-a/spec.md"),
    "tu-test",
    SIGNAL,
  );
  assert.deepEqual(out, {}, "an Edit inside stories/** must be allowed (empty hook output)");
});

// ---------------------------------------------------------------------------
// 11. Injectable isWriteAllowed predicate — the test drives BOTH arms offline
// ---------------------------------------------------------------------------

test("the write fence uses an injected isWriteAllowed predicate — allowed arm (inject () => true)", async () => {
  const { fn, opts } = capturingQuery([SUCCESS_RESULT]);
  await runSpawnStoryAuthor({
    systemPrompt: "SYS",
    userPrompt: "x",
    cwd: CWD,
    isWriteAllowed: () => true, // allow everything — not the stories/** default
    queryFn: fn,
  });
  const hook = extractScopeHook(opts());

  // Even a path outside stories/ must be allowed when the injected predicate returns true.
  const out = await hook(
    preToolUseInput("Write", "packages/anything.ts"),
    "tu-1",
    SIGNAL,
  );
  assert.deepEqual(out, {}, "an injected allow-all predicate must let every Write through");
});

test("the write fence uses an injected isWriteAllowed predicate — denied arm (inject () => false)", async () => {
  const { fn, opts } = capturingQuery([SUCCESS_RESULT]);
  await runSpawnStoryAuthor({
    systemPrompt: "SYS",
    userPrompt: "x",
    cwd: CWD,
    isWriteAllowed: () => false, // deny everything
    queryFn: fn,
  });
  const hook = extractScopeHook(opts());

  // Even a path inside stories/ must be denied when the injected predicate returns false.
  const out = await hook(
    preToolUseInput("Write", "stories/any-story/spec.md"),
    "tu-1",
    SIGNAL,
  );
  const deny = denyOf(out);
  assert.equal(deny.decision, "deny", "an injected deny-all predicate must block every Write");
});

// ---------------------------------------------------------------------------
// 12. ADR-0091: the result shape carries no verdict/proof/signing field
//     (the shape is the wall — there is nothing verdict-like to hand in)
// ---------------------------------------------------------------------------

test("the result shape carries no verdict or proof field — the shape is the wall (ADR-0091)", async () => {
  const r = await runSpawnStoryAuthor({
    systemPrompt: "SYS",
    userPrompt: "x",
    cwd: CWD,
    queryFn: queryYielding([SUCCESS_RESULT]),
  });

  assert.equal(r.ok, true);
  // The shape IS the wall: nothing verdict-like must be present for the chat to relay.
  assert.ok(!("verdict" in r), "result must carry no verdict field (ADR-0091)");
  assert.ok(!("proof" in r), "result must carry no proof field");
  assert.ok(!("signed" in r), "result must carry no signed field");
  assert.ok(!("signing" in r), "result must carry no signing field");
});
