/**
 * Integration tests for the ROLE-NEUTRAL write-scoped spawn core (`runSpawnWriteScoped`,
 * ADR-0160 D2).
 *
 * The write-scoped runner's fence is a CALLER-DECLARED predicate — not hard-wired to `stories/**`.
 * A caller fences the session to whatever source scope it declares and threads its task prompt
 * verbatim. There is no second fence and no default scope.
 *
 * BOTH ROLES THAT CALLED IT ARE RETIRED, THE CORE IS NOT (ADR-0175). `spawn_glue_worker` retired as
 * redundant (ADR-0175's ONE exception, amending ADR-0160), and `spawn_story_author` retired with the
 * chat's whole spawn surface — taking its `runSpawnStoryAuthor` wrapper and that wrapper's
 * `stories/**` default with it (see apps/desktop/src/backend/spawn-surface-retired.test.ts). ADR-0175
 * keeps this core as ADR-0160's live residue and aims `app-guide`'s future narrow setup-scoped
 * writes at it, so the fence stays proven while it waits for its next caller.
 *
 * Every test is OFFLINE: the queryFn seam is injected, so no live SDK spend. The tests fire the
 * write-fence PreToolUse hook directly.
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import * as path from "node:path";

import { runSpawnWriteScoped } from "./spawn-write-scoped.js";
import type { SdkQueryFn } from "./sdk-author.js";

// ---------------------------------------------------------------------------
// Platform-agnostic workspace (resolves under the current drive on Windows, / on POSIX)
// ---------------------------------------------------------------------------

const CWD = path.resolve("/workspace");

/** A caller-declared write scope: only the desktop sidecar surface is writable. */
const CALLER_FENCE = (rel: string): boolean => rel.startsWith("apps/desktop/");

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function queryYielding(messages: unknown[]): SdkQueryFn {
  return () =>
    (async function* () {
      for (const m of messages) yield m;
    })();
}

const SUCCESS_RESULT = {
  type: "result",
  subtype: "success",
  is_error: false,
  num_turns: 3,
  total_cost_usd: 0.004,
  result: "Added 3 routes to apps/desktop/electron/backend-entry.ts.",
};

/** Capture the whole query request (options + prompt), then stream the given messages. */
function capturingQuery(messages: unknown[]) {
  let last: { options: unknown; prompt: unknown } = { options: undefined, prompt: undefined };
  const fn: SdkQueryFn = (q) => {
    last = { options: q.options, prompt: q.prompt };
    return queryYielding(messages)(q);
  };
  return { fn, req: () => last };
}

// The PreToolUse hook type (structural — avoids importing SDK types directly).
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

function extractScopeHook(raw: unknown): ScopeHook {
  const o = raw as { hooks?: { PreToolUse?: Array<{ hooks: ScopeHook[] }> } };
  const matcher = o.hooks?.PreToolUse?.[0];
  assert.ok(matcher !== undefined, "a PreToolUse write-scope hook must be wired into the Options");
  const hook = matcher.hooks[0];
  assert.ok(hook !== undefined, "the PreToolUse scope-hook closure must be present");
  return hook;
}

const SIGNAL = { signal: new AbortController().signal };

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

function denyOf(out: unknown) {
  const hso = (
    out as { hookSpecificOutput?: { permissionDecision?: string; permissionDecisionReason?: string } }
  ).hookSpecificOutput;
  return { decision: hso?.permissionDecision, reason: hso?.permissionDecisionReason };
}

/**
 * A scripted session that FIRES the write-fence hook mid-stream, the way the real SDK would, so
 * denials are recorded as typed violations on the runner's result.
 */
function sessionAttemptingWrites(
  writes: Array<{ tool: string; filePath: string }>,
) {
  const hookOutputs: unknown[] = [];
  let capturedOptions: unknown;
  const fn: SdkQueryFn = (q) =>
    (async function* () {
      capturedOptions = q.options;
      const hook = extractScopeHook(q.options);
      for (const w of writes) {
        hookOutputs.push(await hook(preToolUseInput(w.tool, w.filePath), "tu-w", SIGNAL));
      }
      yield SUCCESS_RESULT;
    })();
  return { fn, hookOutputs, capturedOptions: () => capturedOptions };
}

// ---------------------------------------------------------------------------
// sws-writes-fenced-to-caller-declared-scope
// ---------------------------------------------------------------------------

test("sws-writes-fenced-to-caller-declared-scope: a write inside the caller-declared scope is permitted; one outside it — INCLUDING stories/** — is denied fail-closed before landing and recorded as a typed violation; Bash is never in the tool surface", async () => {
  const { fn, hookOutputs, capturedOptions } = sessionAttemptingWrites([
    { tool: "Write", filePath: "apps/desktop/electron/backend-entry.ts" }, // inside the fence
    { tool: "Edit", filePath: "packages/agent/src/evil.ts" }, // outside — not the declared scope
    { tool: "Write", filePath: "stories/demo/story.md" }, // outside — the caller did not declare it
  ]);

  const r = await runSpawnWriteScoped({
    systemPrompt: "You are a write-scoped author.",
    userPrompt: "add 3 routes to backend-entry.ts",
    cwd: CWD,
    isWriteAllowed: CALLER_FENCE,
    queryFn: fn,
  });

  // The in-scope write is permitted (empty hook output — the write may land).
  assert.deepEqual(hookOutputs[0], {}, "a Write inside the caller-declared scope must be permitted");
  // The two out-of-scope writes are DENIED before landing.
  assert.equal(denyOf(hookOutputs[1]).decision, "deny", "a write outside the fence must be denied");
  assert.equal(
    denyOf(hookOutputs[2]).decision,
    "deny",
    "stories/** is not in this caller's declared scope — it must be denied (the fence is caller-declared, not story-wide)",
  );

  // …and recorded as typed violations on the result.
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal(r.violations.length, 2, "exactly the two denied writes must be recorded as violations");
  assert.deepEqual(
    r.violations.map((v) => v.path).sort(),
    ["packages/agent/src/evil.ts", "stories/demo/story.md"],
    "both out-of-scope paths must be recorded",
  );

  // Bash is never in the session's tool surface (no shell bypass of the fence).
  const o = capturedOptions() as { tools?: string[]; allowedTools?: string[] };
  assert.equal((o.tools ?? []).includes("Bash"), false, "Bash must never be in tools");
  assert.equal((o.allowedTools ?? []).includes("Bash"), false, "Bash must never be allow-listed");
});

// ---------------------------------------------------------------------------
// sws-honours-the-task-prompt-verbatim
// ---------------------------------------------------------------------------

test("sws-honours-the-task-prompt-verbatim: the injected userPrompt is threaded to the spawned session verbatim (ADR-0160 D1)", async () => {
  const TASK = "add these 3 routes to apps/desktop/electron/backend-entry.ts and stop";
  const { fn, req } = capturingQuery([SUCCESS_RESULT]);

  const r = await runSpawnWriteScoped({
    systemPrompt: "You are a write-scoped author.",
    userPrompt: TASK,
    cwd: CWD,
    isWriteAllowed: CALLER_FENCE,
    queryFn: fn,
  });

  assert.equal(r.ok, true);
  assert.equal(
    req().prompt,
    TASK,
    "the caller's task prompt must reach the spawned session verbatim",
  );
});

// ---------------------------------------------------------------------------
// sws-typed-result-never-a-verdict
// ---------------------------------------------------------------------------

test("sws-typed-result-never-a-verdict: a successful session returns { ok: true, summary, violations }; a dead/empty session returns { ok: false, error, violations } — never a throw, never a forged success; the shape carries no verdict/signing/proof field", async () => {
  const ok = await runSpawnWriteScoped({
    systemPrompt: "SYS",
    userPrompt: "x",
    cwd: CWD,
    isWriteAllowed: CALLER_FENCE,
    queryFn: queryYielding([SUCCESS_RESULT]),
  });
  assert.equal(ok.ok, true, "a successful session must return ok: true");
  if (ok.ok) {
    assert.equal(ok.summary, SUCCESS_RESULT.result, "summary must be read off the SDK result text");
    assert.deepEqual(ok.violations, [], "a clean session records no violations");
  }

  const dead = await runSpawnWriteScoped({
    systemPrompt: "SYS",
    userPrompt: "x",
    cwd: CWD,
    isWriteAllowed: CALLER_FENCE,
    queryFn: queryYielding([{ type: "assistant" }]),
  });
  assert.equal(dead.ok, false, "a session with no result message must never forge a success");
  if (!dead.ok) assert.ok(dead.error.length > 0, "the failure must carry an error description");

  // Structurally nothing verdict-like exists for the chat to relay (ADR-0091).
  for (const r of [ok, dead]) {
    assert.ok(!("verdict" in r), "no verdict field (ADR-0091)");
    assert.ok(!("signing" in r), "no signing field");
    assert.ok(!("proofStatus" in r), "no proof-status field");
  }
});

// ---------------------------------------------------------------------------
// sws-no-default-scope-remains
// ---------------------------------------------------------------------------

test("sws-no-default-scope-remains: the core takes NO default write scope — the retired story-author wrapper's stories/** default did not leak into it, so a caller that declares a narrow scope is fenced to exactly that", async () => {
  // The `runSpawnStoryAuthor` wrapper retired with the `spawn_story_author` tool it served
  // (ADR-0175). It was the ONLY holder of a stories/** default; the core's fence has always been
  // caller-declared (ADR-0160 D2). This pins that removing the wrapper left no default behind —
  // a caller declaring `packages/agent/**` gets that and nothing more, stories/** included.
  const { fn, capturedOptions } = sessionAttemptingWrites([]);
  await runSpawnWriteScoped({
    systemPrompt: "SYS",
    userPrompt: "scoped",
    cwd: CWD,
    isWriteAllowed: (rel) => rel.startsWith("packages/agent/"),
    queryFn: fn,
  });
  const hook = extractScopeHook(capturedOptions());

  const inside = await hook(preToolUseInput("Write", "packages/agent/src/new.ts"), "tu-1", SIGNAL);
  assert.deepEqual(inside, {}, "a write inside the caller-declared scope must be permitted");

  const storiesWrite = await hook(preToolUseInput("Write", "stories/new-story/story.md"), "tu-2", SIGNAL);
  assert.equal(
    denyOf(storiesWrite).decision,
    "deny",
    "stories/** must be DENIED unless the caller declares it — no retired-wrapper default survives in the core",
  );
});
