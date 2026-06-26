/**
 * Contract tests for the read-only orientation tool surface
 * (`packages/agent/src/orientation-tools.ts`).
 *
 * Five contracts — each one isolated automated test with a stub runner injected for the read-
 * command dispatch. The surface is offline-testable by design: `buildOrientationTools` takes the
 * runner as an injectable callback, so no @storytree/cli import is needed here (cli depends on
 * agent; the reverse would cycle). The integration test driving the real run() + InMemoryStore +
 * real stories/ corpus lives at the Story UAT level (packages/cli can import from both).
 */
import { test } from "node:test";
import assert from "node:assert/strict";

// RED: orientation-tools.ts does not exist yet — module-not-found is the right-kind red.
import { buildOrientationTools } from "./orientation-tools.js";

// ---------------------------------------------------------------------------
// Stub helpers
// ---------------------------------------------------------------------------

/** The local envelope shape (structurally matches @storytree/cli's Envelope). */
interface LocalEnvelope {
  readonly ok: boolean;
  readonly body: string;
  readonly doctrine?: readonly string[];
  readonly next?: readonly string[];
}

/**
 * A stub runner that returns a fixed envelope regardless of argv/deps.
 * Typed with `_deps: unknown` so it satisfies any OrientationRunner signature (contravariant in
 * params: accepting unknown is WIDER than any concrete deps type, so it is safely assignable).
 */
function fixedRunner(envelope: LocalEnvelope) {
  return async (_argv: readonly string[], _deps: unknown): Promise<LocalEnvelope> => envelope;
}

// ---------------------------------------------------------------------------
// Contract 1: ots-exposes-exactly-the-read-surfaces
// ---------------------------------------------------------------------------

test("ots-exposes-exactly-the-read-surfaces: surface lists exactly tree, library, and noticeboard — no more", () => {
  const tools = buildOrientationTools(fixedRunner({ ok: true, body: "" }), { store: null });
  const names = tools.map((t) => t.name);

  assert.ok(
    names.includes("tree"),
    `'tree' must be in tool names; got: ${names.join(", ")}`,
  );
  assert.ok(
    names.includes("library"),
    `'library' must be in tool names; got: ${names.join(", ")}`,
  );
  assert.ok(
    names.includes("noticeboard"),
    `'noticeboard' must be in tool names; got: ${names.join(", ")}`,
  );
  assert.equal(
    names.length,
    3,
    `expected exactly 3 tools (tree, library, noticeboard), got ${names.length}: ${names.join(", ")}`,
  );
});

// ---------------------------------------------------------------------------
// Contract 2: ots-has-no-write-tool
// ---------------------------------------------------------------------------

test("ots-has-no-write-tool: no Write / Edit / Bash or write-verb tool appears in the surface", () => {
  const tools = buildOrientationTools(fixedRunner({ ok: true, body: "" }), { store: null });
  const names = tools.map((t) => t.name);

  // The ClaudeAgentAuthor LEAF_TOOLS write set — none of these must appear here.
  const FORBIDDEN = [
    "Write", "Edit", "Bash",
    "write", "edit", "bash",
    "run_command", "write_file", "edit_file",
  ];
  for (const bad of FORBIDDEN) {
    assert.ok(
      !names.includes(bad),
      `surface must not expose write tool '${bad}'; tool names: ${names.join(", ")}`,
    );
  }
});

// ---------------------------------------------------------------------------
// Contract 3: ots-constructs-non-writable-deps
// ---------------------------------------------------------------------------

test("ots-constructs-non-writable-deps: surface passes writable:false (or absent) to the runner — never true", async () => {
  let capturedDeps: unknown;

  const tools = buildOrientationTools(
    async (_argv, deps) => {
      capturedDeps = deps;
      return { ok: true, body: "captured" };
    },
    { store: null },
  );

  // Call the first tool (any tool) to trigger the runner.
  const first = tools[0];
  assert.ok(first, "surface must expose at least one tool");
  await first.call();

  assert.ok(capturedDeps !== undefined, "runner must have been called");

  // writable must NOT be true — either false or absent; both prevent writes in run().
  const d = capturedDeps as { writable?: boolean };
  assert.notEqual(
    d.writable,
    true,
    `deps.writable must not be true (must be false or absent); got: ${String(d.writable)}`,
  );
});

// ---------------------------------------------------------------------------
// Contract 4: ots-tool-returns-envelope-body
// ---------------------------------------------------------------------------

test("ots-tool-returns-envelope-body: tool call returns the formatted envelope body including doctrine and next", async () => {
  const known: LocalEnvelope = {
    ok: true,
    body: "REAL BODY TEXT",
    doctrine: ["pull-based-context-architecture — the just-in-time stance"],
    next: ["storytree library artifact pull-based-context-architecture"],
  };
  const tools = buildOrientationTools(fixedRunner(known), { store: null });

  const first = tools[0];
  assert.ok(first, "surface must expose at least one tool");
  const result = await first.call();

  // Body text must appear in the tool result.
  assert.ok(
    result.includes("REAL BODY TEXT"),
    `tool result must include envelope body; got: ${result.slice(0, 300)}`,
  );
  // Doctrine must be rendered (not silently dropped).
  assert.ok(
    result.includes("pull-based-context-architecture"),
    `tool result must include doctrine pointer; got: ${result.slice(0, 300)}`,
  );
  // Next must be rendered.
  assert.ok(
    result.includes("storytree library artifact pull-based-context-architecture"),
    `tool result must include next pointer; got: ${result.slice(0, 300)}`,
  );
});

// ---------------------------------------------------------------------------
// Contract 5: ots-miss-is-guidance-not-throw
// ---------------------------------------------------------------------------

test("ots-miss-is-guidance-not-throw: ok:false envelope is returned as tool result, never propagated as a throw", async () => {
  const miss: LocalEnvelope = {
    ok: false,
    body: 'no artifact "does-not-exist" in the Library.',
    next: ["storytree library", "storytree library artifact list <category>"],
  };
  const tools = buildOrientationTools(fixedRunner(miss), { store: null });

  const first = tools[0];
  assert.ok(first, "surface must expose at least one tool");

  let result: string | undefined;
  try {
    result = await first.call();
  } catch (e) {
    assert.fail(
      `tool must not throw on ok:false envelope; threw: ${(e as Error).message}`,
    );
  }

  // The miss body must appear in the tool result.
  assert.ok(
    result?.includes("does-not-exist"),
    `tool result must include miss body; got: ${(result ?? "").slice(0, 300)}`,
  );
  // The next guidance must be present in the result.
  assert.ok(
    result?.includes("storytree library"),
    `tool result must include next guidance; got: ${(result ?? "").slice(0, 300)}`,
  );
});
