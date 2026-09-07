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

test("the ambient wrappers ARE wired through the worktree-safe launcher: the SessionStart nudge + the statusline glance; the SessionEnd presence-done is RETIRED", () => {
  const settings = JSON.parse(fs.readFileSync(settingsFile, "utf8")) as {
    hooks?: Record<string, Array<{ hooks?: Array<{ command?: string; timeout?: number }> }>>;
    statusLine?: { type?: string; command?: string };
  };
  const hooksFor = (event: string): Array<{ command?: string; timeout?: number }> =>
    (settings.hooks?.[event] ?? []).flatMap((entry) => entry.hooks ?? []);

  // SessionStart keeps the launcher: it prints the one claim-ledger nudge line (ADR-0143/0200 D3).
  const startHooks = hooksFor("SessionStart");
  const startAmbient = startHooks.filter((hook) => (hook.command ?? "").includes("presence-hook"));
  assert.ok(
    startAmbient.length >= 1,
    "SessionStart must carry the ambient wrapper via scripts/presence-hook.sh (the claim-ledger nudge, ADR-0200 D3)",
  );
  // REGRESSION LOCK — the "5 sessions, nothing on the tree" bug (2026-06-14): a bare
  // `pnpm --filter @storytree/cli exec tsx …ambient-presence-entry…` dies with
  // "'tsx' is not recognized" in a FRESH worktree (no node_modules), so the hook never runs.
  // The launcher resolves tsx from the primary checkout. Lock the routing in: an ambient
  // command must NOT invoke tsx directly.
  assert.ok(
    startHooks.every((hook) => {
      const command = hook.command ?? "";
      const isAmbient = command.includes("presence-hook") || command.includes("ambient-presence");
      return !isAmbient || !/exec\s+tsx/.test(command);
    }),
    "SessionStart ambient hook must route through scripts/presence-hook.sh, not a bare `pnpm exec tsx` (which fails in fresh worktrees)",
  );
  // The fail-silent contract is bounded time too — a hook without a timeout can hang a session.
  assert.ok(
    startAmbient.every((hook) => typeof hook.timeout === "number" && hook.timeout <= 60),
    "SessionStart ambient hooks must declare a short timeout",
  );

  // SessionEnd carried the presence-done write — presence is RETIRED (ADR-0200 D7): the retirement
  // sweep removed that hook, and it must never come back (claims release via `noticeboard done`,
  // the CI merge clear, and stale-reclaim — not a session hook).
  const endAmbient = hooksFor("SessionEnd").filter(
    (hook) =>
      (hook.command ?? "").includes("presence-hook") ||
      (hook.command ?? "").includes("ambient-presence") ||
      (hook.command ?? "").includes("noticeboard"),
  );
  assert.deepEqual(
    endAmbient.map((h) => h.command),
    [],
    "SessionEnd must carry NO presence/noticeboard hook (the presence-done write retired, ADR-0200 D7)",
  );

  assert.ok(
    (settings.statusLine?.command ?? "").includes("presence-hook"),
    "the statusline glance (the human ambient surface — now ledger-sourced) must route through scripts/presence-hook.sh",
  );
});

// ---------------------------------------------------------------------------
// the worktree-activity sweep is wired where it can actually fire (ADR-0535 D2)
// ---------------------------------------------------------------------------

test("liveness-is-observed-not-self-reported: the worktree-activity sweep is registered on SessionStart, through a launcher, bounded", () => {
  // THE COMPLAINT THIS ANSWERS. Liveness used to hang off `statusLine` alone, which desktop and
  // unattended sessions never draw — so their claims aged into stale-reclaim on a timer whatever
  // they were doing, and the board told an owner an arc was unheld while a session was 432 tool
  // calls into it. SessionStart fires for every session type, and because the sweep observes EVERY
  // claimed worktree rather than only its own, one session's start vouches for all the quiet ones.
  //
  // Asserted against the REAL `.claude/settings.json`, like the audit above: the sweep's own logic
  // is proven in `@storytree/drive`'s unit tests, and the thing those cannot see is whether the
  // repo actually invokes it. A registration that silently disappears is precisely how the retired
  // beat spent three weeks dead without anyone noticing.
  const settings = JSON.parse(fs.readFileSync(settingsFile, "utf8")) as {
    hooks?: Record<string, Array<{ hooks?: Array<{ command?: string; timeout?: number }> }>>;
  };
  const startHooks = (settings.hooks?.["SessionStart"] ?? []).flatMap((entry) => entry.hooks ?? []);
  const sweep = startHooks.filter((h) => (h.command ?? "").includes("worktree-activity-hook"));

  assert.equal(
    sweep.length,
    1,
    "SessionStart must carry exactly one worktree-activity sweep launcher (ADR-0535 D2)",
  );
  // The fresh-worktree lesson, same as the presence launcher: a bare `pnpm exec tsx` dies with
  // "'tsx' is not recognized" in a worktree that has no node_modules, so the hook never runs at all.
  assert.ok(
    sweep.every((h) => !/exec\s+tsx/.test(h.command ?? "")),
    "the sweep must route through scripts/worktree-activity-hook.sh, not a bare `pnpm exec tsx`",
  );
  assert.ok(
    sweep.every((h) => typeof h.timeout === "number" && h.timeout <= 60),
    "the sweep launcher must declare a short timeout — it detaches, so it has nothing to wait for",
  );
});

test("liveness-is-observed-not-self-reported: the worktree-activity launcher exists on disk and detaches its child", () => {
  // A registered hook whose script is missing fails silently by contract, which would leave the
  // ledger exactly as dead as it was before this landed. And the detach is the reason session start
  // never waits on the ~6-11s keyless connector handshake the write needs.
  const script = fs.readFileSync(path.join(repoRoot(), "scripts", "worktree-activity-hook.sh"), "utf8");
  // Anchored on the ASSIGNMENT, not on the bare filename: this script's own header comment names
  // `ambient-presence-entry.ts` in prose, so a filename match would stay green with the code
  // deleted — the commonest way a source-text check ends up asserting its own rationale.
  assert.match(
    script,
    /^rel_entry="packages\/cli\/src\/ambient-presence-entry\.ts"$/m,
    "it must invoke the ambient entry",
  );
  assert.match(script, /"\$2" sweep/, "in `sweep` mode — not `start`, which prints and returns");
  assert.match(script, /&\s*\)/, "and launch it detached, so session start never blocks on the store");
});

// ---------------------------------------------------------------------------
// a build run never writes session presence (ADR-0199)
// ---------------------------------------------------------------------------

test("builds-never-write-session-presence: the drive exports no build presence wrapper (ADR-0199)", async () => {
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
