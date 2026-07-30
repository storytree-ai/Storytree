// Retirement guard — the desktop sidecar's LANDING tool surface stays GONE (ADR-0175, now executed).
//
// WHY THIS FILE EXISTS. ADR-0174 retired the in-app *interactive* work-orchestrator (the chat widget)
// for an embedded terminal running real Claude Code. ADR-0175 then split its infrastructure: the SSE
// transport, the dock, cross-turn continuity and the read-only inspect surface are RE-AIMED under the
// `app-guide` concierge, but "the **spawn** and **landing** surfaces (which drove story work) do not
// belong to a help agent and retire with the interactive orchestrator under ADR-0174, not into
// `app-guide`". The stories/**-only reconcile deliberately deferred the code half —
// `stories/headless-orchestrator/story.md`: "NOT retired here: the code itself (no unmount — a
// separate thin PR, ADR-0175)". This is the LANDING slice of that thin PR.
//
// WHAT IT PINS: the landing modules are deleted and no production wiring re-composes them. A negative
// assertion of the kind this repo keeps to hold a retired feature gone — the ADR-0155 / PR #587
// precedent, where the propose/accept surface was deleted and only the assertions that "exist to keep
// them gone" survived. The positive `csm-forwards-landing-deps` / chat-stream landing tests went with
// the surface, exactly as the propose_unit tests did.
//
// WHY IT MATTERS BEYOND TIDINESS (ADR-0163 D3 Gap B1 / ADR-0271). The retired `open_landing_pr` did
// more than open a PR: on a confirmed already-merged branch it cut a FRESH branch (`claude/<slug>`)
// and best-effort re-lit the story wisp, so the session could keep working. That was Gap B1's shipped
// remedy (PR #608), built on ADR-0142's post-merge "cut a fresh branch, re-declare presence, keep
// working" leg. ADR-0271 (which amends ADR-0142) ended that shape: a session's working life ENDS where
// its PR merges — the closing leg replaces the fresh branch, and new work re-enters through a fresh
// session. The sidecar chat renders the SAME `session-orchestrator` agent the terminal does, so
// leaving this tool wired left a live self-contradiction inside one session: a prompt saying "end at
// merge, re-enter through a fresh session" holding a tool that silently cut a branch and carried on.
//
// Gap B1 asked whether that tool should follow ADR-0271 or keep cutting. Neither: the surface it lives
// in was already retired, and it had no reachable caller to have a lifecycle at all — `ChatDock` (the
// only mount of `ChatPanel`, the only caller of POST /api/chat) is imported by nothing in the
// production tree, and `storytree orchestrate` passes no landing deps. Deleting the surface dissolves
// the question rather than re-deciding it.

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

test("lsr-modules-deleted: the landing tool surface and its deps composition no longer exist", () => {
  for (const relPath of [
    "packages/agent/src/landing-tool-surface.ts",
    "packages/agent/src/landing-tool-surface.test.ts",
    "packages/drive/src/landing-deps.ts",
    "packages/drive/src/landing-deps.test.ts",
  ]) {
    assert.equal(
      existsSync(REPO + relPath),
      false,
      `${relPath} must be deleted — ADR-0175 retires the landing surface with the interactive ` +
        `orchestrator (ADR-0174); it is not repurposed into app-guide`,
    );
  }
});

// ---------------------------------------------------------------------------
// The sidecar composes no landing deps
// ---------------------------------------------------------------------------

test("lsr-sidecar-composes-nothing: backend-entry.ts builds no landing deps and cuts no fresh branch", () => {
  const src = code(readFileSync(HERE + "../../electron/backend-entry.ts", "utf8"));

  // The composition itself (ADR-0175: the landing surface retires, it is not re-aimed).
  for (const token of ["buildLandingDeps", "LandingSurfaceDeps"]) {
    assert.ok(
      !src.includes(token),
      `backend-entry.ts must not reference ${token} — the landing surface is retired (ADR-0175)`,
    );
  }

  // The ADR-0271 contradiction specifically: no per-session fresh-branch slug is minted for a
  // post-merge re-land. A session's working life ends where its PR merges; it does not cut and carry on.
  assert.ok(
    !src.includes("freshBranchSlug"),
    "backend-entry.ts must mint no freshBranchSlug — ADR-0271 ended the post-merge fresh-branch leg " +
      "(it amends ADR-0142); the closing leg and a fresh SESSION replace it",
  );

  // The surfaces ADR-0175 genuinely re-aims into app-guide stay wired — this retirement is surgical,
  // not a teardown of the chat substrate.
  assert.ok(
    src.includes("buildInspectDeps"),
    "the read-only inspect surface (ADR-0173) is REPURPOSED into app-guide by ADR-0175 and must stay wired",
  );
});

// ---------------------------------------------------------------------------
// No landing wiring survives anywhere in the chain
// ---------------------------------------------------------------------------

test("lsr-chain-unwired: no module in the chat chain mounts, forwards, or types a landing surface", () => {
  // mount → startChatStream → orchestrate → runHeadlessOrchestrator: the full path the sidecar's
  // landing deps used to travel. Each link must be free of the surface.
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
      "LandingSurfaceDeps",
      "buildLandingTools",
      "LANDING_SERVER",
      "landing-tool-surface",
      "landing-deps",
    ]) {
      assert.ok(
        !src.includes(token),
        `${relPath} must not reference ${token} — the landing surface is retired (ADR-0175)`,
      );
    }
  }
});

test("lsr-no-landing-tool-names: the retired MCP tool names appear in no production source", () => {
  // `open_landing_pr` was the tool that cut the fresh branch; `run_gate` and `poll_pr_checks` were its
  // siblings on the same server. None may be advertised by anything the sidecar mounts. (The read-only
  // CI-watch affordance survives as the repurposed inspect surface's `view_pr_checks`, ADR-0173/0175.)
  for (const relPath of [
    "apps/desktop/src/backend/chat-sse-mount.ts",
    "packages/drive/src/chat-stream.ts",
    "packages/drive/src/orchestrate.ts",
    "packages/agent/src/headless-orchestrator.ts",
  ]) {
    const src = sourceOf(relPath);
    for (const toolName of ["open_landing_pr", "run_gate", "poll_pr_checks"]) {
      assert.ok(
        !src.includes(toolName),
        `${relPath} must not mount '${toolName}' — the landing surface is retired (ADR-0175)`,
      );
    }
  }
});
