// Retirement guard — the desktop sidecar's SPAWN tool surface stays GONE (ADR-0175, now executed).
//
// WHY THIS FILE EXISTS. ADR-0174 retired the in-app *interactive* work-orchestrator (the chat widget)
// for an embedded terminal running real Claude Code. ADR-0175 then split its infrastructure: the SSE
// transport, the dock, cross-turn continuity and the read-only inspect surface are RE-AIMED under the
// `app-guide` concierge, but "the **spawn** and **landing** surfaces (which drove story work) do not
// belong to a help agent and retire with the interactive orchestrator under ADR-0174, not into
// `app-guide`". The stories/**-only reconcile deliberately deferred the code half —
// `stories/headless-orchestrator/story.md`: "NOT retired here: the code itself (no unmount — a
// separate thin PR, ADR-0175)". PR #1035 landed the LANDING slice; this is the SPAWN slice, the rest
// of that thin PR. Its sibling guard is `landing-surface-retired.test.ts`.
//
// WHAT IT PINS: the spawn modules are deleted and no production wiring re-composes them. A negative
// assertion of the kind this repo keeps to hold a retired feature gone — the ADR-0155 / PR #587
// precedent, where the propose/accept surface was deleted and only the assertions that "exist to keep
// them gone" survived. The positive `spawn-tool-surface` / `spawn-deps` / `chat-spawn-trace` tests went
// with the surface, exactly as the propose_unit and landing tests did.
//
// IT HAD NO REACHABLE CALLER — the same two facts that made the landing slice unambiguous:
//   • `ChatDock` (the only mount of `ChatPanel`, itself the only caller of POST /api/chat) is imported
//     by NOTHING in the production tree — `TerminalDock` took its dock slot under ADR-0174. TreeView
//     names it in a comment only ("ChatDock stays dormant in the tree for a future app-guide").
//   • `storytree orchestrate` — the other `orchestrate()` caller — passes NO spawn deps.
// So the surface was composed at every sidecar boot with no UI path to it. `spawn_glue_worker`, the
// third tool that once sat on this server, was already retired as redundant (ADR-0175's stated ONE
// exception, amending ADR-0160): the embedded terminal makes glue edits natively.
//
// WHAT DELIBERATELY SURVIVES — this retirement is surgical, not a teardown of the chat substrate:
//   • `runSpawnWriteScoped` (packages/agent/src/spawn-write-scoped.ts) — the ROLE-NEUTRAL write-fence
//     core (ADR-0160 D2). ADR-0175 names it as ADR-0160's live residue, and points `app-guide`'s
//     future "narrow setup-scoped writes for config and hooks" at exactly this fail-closed path-fence
//     discipline ("not an unbounded editor"). Only `runSpawnStoryAuthor` — the retired
//     `spawn_story_author` tool's stories/** wrapper — went with the surface; the module was renamed
//     to match the core (and its long-standing test name) once the wrapper left.
//   • `resolveSpawnClaim` (packages/agent/src/spawn-claim.ts) — the `take-claim-at-spawn` capability
//     of the LIVE `wisp-as-story-claim` story, which ADR-0175 explicitly does NOT retire ("the claim
//     ledger / map wisps stay load-bearing for terminal Claude Code via the noticeboard").
//   • The inspect surface (ADR-0173) and the SSE/dock/continuity substrate — re-aimed, not deleted.

import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/** This directory (`apps/desktop/src/backend`). */
const HERE = fileURLToPath(new URL(".", import.meta.url));
/** The repo root — four levels up from `apps/desktop/src/backend`. */
const REPO = fileURLToPath(new URL("../../../../", import.meta.url));

/**
 * Strip comments before scanning, so a PROSE mention of the retired surface (this guard's own
 * citations, the tombstone comments left at each unwiring site) never counts as live wiring. Only
 * real code may fail these assertions.
 */
function code(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

/** Read a repo-relative source file as comment-stripped code. */
function sourceOf(relPath: string): string {
  return code(readFileSync(REPO + relPath, "utf8"));
}

// ---------------------------------------------------------------------------
// The modules themselves are deleted
// ---------------------------------------------------------------------------

test("ssr-modules-deleted: the spawn tool surface, its claim gate, and their compositions no longer exist", () => {
  for (const relPath of [
    // The agent-side MCP surface + the gate that existed only to wrap its handlers.
    "packages/agent/src/spawn-tool-surface.ts",
    "packages/agent/src/spawn-tool-surface.test.ts",
    "packages/agent/src/claim-gated-spawn.ts",
    "packages/agent/src/claim-gated-spawn.test.ts",
    // The retired `spawn_story_author` wrapper's module name — the surviving role-neutral core
    // moved to spawn-write-scoped.ts (asserted present below).
    "packages/agent/src/spawn-story-author.ts",
    "packages/agent/src/spawn-story-author.test.ts",
    // The drive-side compositions and the trace shape that only the spawn handlers emitted.
    "packages/drive/src/spawn-deps.ts",
    "packages/drive/src/spawn-deps.test.ts",
    "packages/drive/src/spawn-builder.ts",
    "packages/drive/src/spawn-builder.test.ts",
    "packages/drive/src/spawn-trace.ts",
    "packages/drive/src/chat-spawn-trace.test.ts",
    // The desktop-side turn budget that existed only for the chat-spawned story-author.
    "apps/desktop/src/backend/spawn-turns.ts",
    "apps/desktop/src/backend/spawn-turns.test.ts",
  ]) {
    assert.equal(
      existsSync(REPO + relPath),
      false,
      `${relPath} must be deleted — ADR-0175 retires the spawn surface with the interactive ` +
        `orchestrator (ADR-0174); it is not repurposed into app-guide`,
    );
  }
});

// ---------------------------------------------------------------------------
// The pieces ADR-0175 keeps are still here (the retirement is surgical)
// ---------------------------------------------------------------------------

test("ssr-write-fence-core-survives: the role-neutral write-fence core is KEPT, without its story-author wrapper", () => {
  const rel = "packages/agent/src/spawn-write-scoped.ts";
  assert.ok(
    existsSync(REPO + rel),
    `${rel} must exist — ADR-0175 names runSpawnWriteScoped as ADR-0160's live residue and points ` +
      `app-guide's future setup-scoped writes at this same fail-closed path-fence discipline`,
  );

  const src = sourceOf(rel);
  assert.ok(
    src.includes("export async function runSpawnWriteScoped"),
    "the role-neutral write-fence core (ADR-0160 D2) must still be exported",
  );
  assert.ok(
    !src.includes("runSpawnStoryAuthor"),
    "the stories/** story-author wrapper retired with the spawn_story_author tool it served (ADR-0175)",
  );

  // The live `wisp-as-story-claim` capability ADR-0175 explicitly does NOT retire.
  assert.ok(
    existsSync(REPO + "packages/agent/src/spawn-claim.ts"),
    "spawn-claim.ts (take-claim-at-spawn) belongs to the LIVE wisp-as-story-claim story — ADR-0175 " +
      "keeps the claim ledger load-bearing for terminal Claude Code",
  );
});

// ---------------------------------------------------------------------------
// The sidecar composes no spawn deps
// ---------------------------------------------------------------------------

test("ssr-sidecar-composes-nothing: backend-entry.ts builds no spawn deps and resolves no spawn turn budget", () => {
  const src = code(readFileSync(HERE + "../../electron/backend-entry.ts", "utf8"));

  for (const token of [
    "buildSpawnDeps",
    "SpawnSurfaceDeps",
    // The chat-spawned story-author's own turn ceiling — meaningless once nothing spawns it.
    "resolveSpawnMaxTurns",
    "STORYTREE_SPAWN_MAX_TURNS",
  ]) {
    assert.ok(
      !src.includes(token),
      `backend-entry.ts must not reference ${token} — the spawn surface is retired (ADR-0175)`,
    );
  }

  // The surfaces ADR-0175 genuinely re-aims into app-guide stay wired — this retirement is surgical,
  // not a teardown of the chat substrate.
  assert.ok(
    src.includes("buildInspectDeps"),
    "the read-only inspect surface (ADR-0173) is REPURPOSED into app-guide by ADR-0175 and must stay wired",
  );
});

// ---------------------------------------------------------------------------
// No spawn wiring survives anywhere in the chain
// ---------------------------------------------------------------------------

test("ssr-chain-unwired: no module in the chat chain mounts, forwards, or types a spawn surface", () => {
  // mount → startChatStream → orchestrate → runHeadlessOrchestrator: the full path the sidecar's
  // spawn deps used to travel. Each link must be free of the surface.
  const chain = [
    "apps/desktop/src/backend/chat-sse-mount.ts",
    "packages/drive/src/chat-stream.ts",
    "packages/drive/src/orchestrate.ts",
    "packages/drive/src/index.ts",
    "packages/agent/src/headless-orchestrator.ts",
    "packages/agent/src/index.ts",
  ];
  for (const relPath of chain) {
    const src = sourceOf(relPath);
    for (const token of [
      "SpawnSurfaceDeps",
      "buildSpawnTools",
      "buildSpawnDeps",
      "SPAWN_SERVER",
      "spawn-tool-surface",
      "spawn-deps",
      // The claim gate existed only to wrap the spawn handlers.
      "claim-gated-spawn",
      // The trace shape + the non-terminal chat frame it fed (chat-spawn-trace-events, retired).
      "spawn-trace",
      "SpawnTrace",
      "ChatStreamSpawnEvent",
    ]) {
      assert.ok(
        !src.includes(token),
        `${relPath} must not reference ${token} — the spawn surface is retired (ADR-0175)`,
      );
    }
  }
});

test("ssr-no-spawn-tool-names: the retired MCP tool names appear in no production source", () => {
  // `spawn_story_author` and `spawn_builder` were the two tools this server mounted;
  // `spawn_glue_worker` was the third, already retired as redundant (ADR-0175's ONE exception,
  // amending ADR-0160 — the embedded terminal makes glue edits natively). None may be advertised by
  // anything the sidecar mounts, and no runner may remain behind them.
  for (const relPath of [
    "apps/desktop/src/backend/chat-sse-mount.ts",
    "packages/drive/src/chat-stream.ts",
    "packages/drive/src/orchestrate.ts",
    "packages/agent/src/headless-orchestrator.ts",
    "packages/agent/src/index.ts",
    "packages/drive/src/index.ts",
  ]) {
    const src = sourceOf(relPath);
    for (const toolName of [
      "spawn_story_author",
      "spawn_builder",
      "spawn_glue_worker",
      "runSpawnStoryAuthor",
      "spawnBuilderDispatch",
    ]) {
      assert.ok(
        !src.includes(toolName),
        `${relPath} must not mount or re-export '${toolName}' — the spawn surface is retired (ADR-0175)`,
      );
    }
  }
});
