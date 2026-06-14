import test from "node:test";
import assert from "node:assert/strict";

import * as fs from "node:fs";
import path from "node:path";

import type { PresenceDeclarationDoc } from "@storytree/core";

import { auditHookConfig } from "./ambient-presence.js";
import { nodeBuild, repoRoot } from "./node-build.js";
import type { PresenceStoreLike } from "./noticeboard.js";

/**
 * The SPINE wiring of ambient-integration (post-promotion, per the capability spec): the shared
 * `.claude/settings.json` honours the never-blocking-hooks contract (audited with the leaf-proven
 * `auditHookConfig` against the REAL file, not a fixture), and `node build` declares presence
 * around the gate walk through `withPresence` (ADR-0033 Decision 3 — advisory by construction).
 * The ambient-presence module's own truths live in ambient-presence.test.ts (the node's
 * registered REAL proof); these tests cover only the wiring around it.
 */

const settingsFile = path.join(repoRoot(), ".claude", "settings.json");

test("the shared .claude/settings.json exists and passes the never-blocking-hooks audit", () => {
  const text = fs.readFileSync(settingsFile, "utf8");
  assert.deepEqual(
    auditHookConfig(text),
    [],
    "presence automation must never sit on Stop/PreToolUse/UserPromptSubmit (ADR-0033 Decision 3)",
  );
});

test("the presence wrappers ARE wired through the worktree-safe launcher: SessionStart/SessionEnd hooks + the statusline glance", () => {
  const settings = JSON.parse(fs.readFileSync(settingsFile, "utf8")) as {
    hooks?: Record<string, Array<{ hooks?: Array<{ command?: string; timeout?: number }> }>>;
    statusLine?: { type?: string; command?: string };
  };
  for (const event of ["SessionStart", "SessionEnd"]) {
    const hooks = (settings.hooks?.[event] ?? []).flatMap((entry) => entry.hooks ?? []);
    const presenceHooks = hooks.filter((hook) => (hook.command ?? "").includes("presence-hook"));
    assert.ok(
      presenceHooks.length >= 1,
      `${event} must carry the ambient-presence wrapper via scripts/presence-hook.sh (owner decision 3: shared hooks)`,
    );
    // REGRESSION LOCK — the "5 sessions, nothing on the tree" bug (2026-06-14): a bare
    // `pnpm --filter @storytree/cli exec tsx …ambient-presence-entry…` dies with
    // "'tsx' is not recognized" in a FRESH worktree (no node_modules), so the hook — and
    // its statusline self-heal — never run and the session never lands a presence row.
    // The launcher resolves tsx from the primary checkout. Lock the routing in: a presence
    // command must NOT invoke tsx directly.
    assert.ok(
      hooks.every((hook) => {
        const command = hook.command ?? "";
        const isPresence = command.includes("presence-hook") || command.includes("ambient-presence");
        return !isPresence || !/exec\s+tsx/.test(command);
      }),
      `${event} presence hook must route through scripts/presence-hook.sh, not a bare \`pnpm exec tsx\` (which fails in fresh worktrees)`,
    );
    // The fail-silent contract is bounded time too — a hook without a timeout can hang a session.
    assert.ok(
      presenceHooks.every((hook) => typeof hook.timeout === "number" && hook.timeout <= 60),
      `${event} presence hooks must declare a short timeout`,
    );
  }
  assert.ok(
    (settings.statusLine?.command ?? "").includes("presence-hook"),
    "the statusline glance (owner decision 2: heartbeat ships) must route through scripts/presence-hook.sh",
  );
});

// ---------------------------------------------------------------------------
// node build declares presence around the walk
// ---------------------------------------------------------------------------

interface RecordingPresence extends PresenceStoreLike {
  calls: string[];
  declared: PresenceDeclarationDoc[];
}

function recordingPresenceStore(): RecordingPresence {
  const calls: string[] = [];
  const declared: PresenceDeclarationDoc[] = [];
  return {
    calls,
    declared,
    declare: async (doc) => {
      calls.push("declare");
      declared.push(doc);
      return doc;
    },
    done: async (sessionId, lastSeenAt) => {
      calls.push("done");
      const last = declared[declared.length - 1];
      return last === undefined ? null : { ...last, status: "done", lastSeenAt, sessionId };
    },
    listActive: async () => [],
    history: async () => [],
  };
}

const identity = { sessionId: "wiring-test-worktree", branch: "claude/wiring-test" };

test("node build declares presence before the walk and marks done after (ADR-0033 Decision 3)", async () => {
  const presence = recordingPresenceStore();
  const env = await nodeBuild("library-cli", {
    dryRun: true,
    actor: "tester@example.com",
    presence: { store: presence, identity },
  });
  assert.equal(env.ok, true, env.body);
  assert.deepEqual(presence.calls, ["declare", "done"]);
  const doc = presence.declared[0];
  assert.ok(doc !== undefined);
  assert.equal(doc.sessionId, "wiring-test-worktree");
  assert.equal(doc.branch, "claude/wiring-test");
  assert.deepEqual(doc.nodes, ["library-cli"], "the declaration anchors to the node being built");
  assert.match(doc.workingOn, /dry-run run /, "workingOn names the mode and run id");
  assert.equal(doc.status, "active");
});

test("a presence store that throws on every call never fails the build", async () => {
  const throwing: PresenceStoreLike = {
    declare: async () => {
      throw new Error("board down");
    },
    done: async () => {
      throw new Error("board down");
    },
    listActive: async () => {
      throw new Error("board down");
    },
    history: async () => {
      throw new Error("board down");
    },
  };
  const env = await nodeBuild("library-cli", {
    dryRun: true,
    actor: "tester@example.com",
    presence: { store: throwing, identity },
  });
  assert.equal(env.ok, true, env.body);
  assert.match(env.body, /AUTHOR_TEST → CONFIRM_RED → IMPLEMENT → CONFIRM_GREEN → GATE/);
  assert.match(env.body, /rollup: {6}healthy/);
});

test("a null presence identity (plain checkout) is a silent no-op, not an error", async () => {
  const presence = recordingPresenceStore();
  const env = await nodeBuild("library-cli", {
    dryRun: true,
    actor: "tester@example.com",
    presence: { store: presence, identity: null },
  });
  assert.equal(env.ok, true, env.body);
  assert.deepEqual(presence.calls, [], "no identity → nothing declared (never guessed)");
});
