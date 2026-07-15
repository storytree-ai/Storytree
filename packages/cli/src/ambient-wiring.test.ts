import test from "node:test";
import assert from "node:assert/strict";

import * as fs from "node:fs";
import path from "node:path";

import { auditHookConfig } from "@storytree/drive";
import { nodeBuild, repoRoot } from "@storytree/drive";

/**
 * The SPINE wiring of ambient-integration (post-promotion, per the capability spec): the shared
 * `.claude/settings.json` honours the never-blocking-hooks contract (audited with the leaf-proven
 * `auditHookConfig` against the REAL file, not a fixture), and the build path carries NO presence
 * calls at all — a build run never writes session presence (ADR-0199). The ambient-presence
 * module's own truths live in ambient-presence.test.ts (the node's registered REAL proof); these
 * tests cover only the wiring around it.
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
// a build run never writes session presence (ADR-0199)
// ---------------------------------------------------------------------------

test("the drive exports no build presence wrapper — a build run never writes session presence (ADR-0199)", async () => {
  // The clobber bug (owner interrupts 2026-07-15/16): `withPresence` declared the BUILD under the
  // LAUNCHING session's worktree identity and retired that session's row in its finally. The fix is
  // structural: builds write work-events + the write-claim, never `events.session`. Lock the wrapper
  // out of the drive's public surface so a presence write cannot be re-wired into the build path.
  const drive = await import("@storytree/drive");
  assert.ok(
    !("withPresence" in drive),
    "withPresence must stay deleted — a build run never writes session presence (ADR-0199)",
  );
});

test("node build drives to green with a worktree identity and no presence surface (ADR-0199)", async () => {
  // The identity opt feeds ONLY the write-claim (ADR-0121); there is deliberately no presence seam
  // on the build path any more — the launching session's declaration survives its own builds.
  const env = await nodeBuild("library-cli", {
    dryRun: true,
    actor: "tester@example.com",
    identity: { sessionId: "wiring-test-worktree", branch: "claude/wiring-test" },
  });
  assert.equal(env.ok, true, env.body);
  assert.match(env.body, /AUTHOR_TEST → CONFIRM_RED → IMPLEMENT → CONFIRM_GREEN → GATE/);
  assert.match(env.body, /rollup: {6}healthy/);
});

// ── ADR-0060/0081, narrowed by ADR-0099-B: the DB-preflight wiring is REAL-only now ──
//
// Pre-0099-B a --live build defaulted to `pg` and ran the DB preflight (refusing fail-closed on a down
// DB). ADR-0099-B makes a synthetic --live smoke NON-persisting (in-memory), so it never brings the DB
// up — `needsDb = (effectiveStore === "pg" && mode === "real")` is false for a live smoke (its
// effectiveStore is in-memory). That enforcement is proven deterministically and OFFLINE (no worktree,
// no SDK, no flake) by the seam unit tests rather than by driving a real --live build here:
//   - db-control.test.ts — effectiveVerdictStore: a --live smoke (synthetic) no longer defaults to pg;
//     only a REAL driven proof does.
//   - node-build.test.ts — resolveVerdictStore: --store pg is refused for a synthetic walk (the forged
//     healthy guard), and the in-memory stores still resolve.
// The fail-closed-on-down-DB refusal is unchanged for the path that still persists (`--real`).

test("a --dry-run build never runs the DB preflight — it stays in-memory (ADR-0060/0020)", async () => {
  // The preflight is gated to live/real; a scripted dry-run must reach its in-memory walk without ever
  // touching the DB (guarding the dry-run+pg-hang regression this gating fixed).
  let preflightRan = false;
  const env = await nodeBuild("library-cli", {
    dryRun: true,
    actor: "tester@example.com",
    ensureDb: async () => {
      preflightRan = true;
      return { ok: true, started: false };
    },
    identity: null,
  });
  assert.equal(env.ok, true, env.body);
  assert.equal(preflightRan, false, "a dry-run must never invoke the DB preflight");
});
