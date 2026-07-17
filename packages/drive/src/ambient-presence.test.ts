/**
 * Offline proof for ambient-presence.ts (ADR-0033 Decision 3: advisory-by-construction, re-founded
 * on the claim ledger by ADR-0200 D5/D7 — presence is RETIRED).
 *
 * Every path through the implementation is fail-silent — ledger failures must never surface
 * through the result or errors. All fixtures are inline; do NOT read .claude/settings.json from
 * disk (hook-config-audit.test.ts scans the real file).
 */
import test from "node:test";
import assert from "node:assert/strict";

import type { ClaimDocT } from "@storytree/notice-board";

import type { AmbientClaimsLike, AmbientDeps, HeartbeatState } from "./ambient-presence.js";
import * as ambientPresence from "./ambient-presence.js";
import {
  statuslineGlance,
  auditHookConfig,
  undeclaredSessionNudge,
} from "./ambient-presence.js";

import type { SessionIdentity } from "./noticeboard.js";

// ---------------------------------------------------------------------------
// Fixed clock
// ---------------------------------------------------------------------------

const NOW = new Date("2026-06-13T08:00:00.000Z");
const nowFn = () => NOW;

const IDENTITY: SessionIdentity = {
  sessionId: "wt-ambient",
  branch: "claude/real/ambient-integration",
};

// ---------------------------------------------------------------------------
// Helpers — a recording fake of the ambient claim-ledger slice
// ---------------------------------------------------------------------------

function claimDoc(over: Partial<ClaimDocT> & Pick<ClaimDocT, "unitId" | "sessionId">): ClaimDocT {
  return {
    branch: "claude/x",
    intent: "",
    claimedAt: NOW.toISOString(),
    heartbeatAt: NOW.toISOString(),
    ...over,
  };
}

interface RecordingClaims extends AmbientClaimsLike {
  bumps: string[];
  live: ClaimDocT[];
  /** When true, every method throws. */
  throwing: boolean;
  /** When true, only the bump throws (the reads still answer). */
  bumpThrows: boolean;
}

function makeClaims(live: ClaimDocT[] = [], over: Partial<RecordingClaims> = {}): RecordingClaims {
  const self: RecordingClaims = {
    bumps: [],
    live,
    throwing: false,
    bumpThrows: false,
    async listLiveClaims(): Promise<ClaimDocT[]> {
      if (self.throwing) throw new Error("ledger error: listLiveClaims");
      return self.live;
    },
    async claimsBySession(sessionId: string): Promise<ClaimDocT[]> {
      if (self.throwing) throw new Error("ledger error: claimsBySession");
      return self.live.filter((c) => c.sessionId === sessionId);
    },
    async bumpHeartbeatsBySession(sessionId: string): Promise<number> {
      if (self.throwing || self.bumpThrows) throw new Error("ledger error: bump");
      self.bumps.push(sessionId);
      return self.live.filter((c) => c.sessionId === sessionId).length;
    },
    ...over,
  };
  return self;
}

function makeHeartbeatState(initial: string | null = null): HeartbeatState & { bumps: string[] } {
  let stored: string | null = initial;
  const bumps: string[] = [];
  return {
    bumps,
    readLastBump: () => stored,
    writeLastBump: (iso: string) => {
      stored = iso;
      bumps.push(iso);
    },
  };
}

// ---------------------------------------------------------------------------
// the retired writers stay deleted (ADR-0199 / ADR-0200 D7)
// ---------------------------------------------------------------------------

test("the module exports no build presence wrapper — a build run never writes session state (ADR-0199)", () => {
  assert.ok(
    !("withPresence" in ambientPresence),
    "withPresence must stay deleted — builds never write session presence (ADR-0199)",
  );
});

test("the module exports no sessionHook — sessions no longer declare/retire presence rows (ADR-0200 D7)", () => {
  // The SessionStart declare / SessionEnd done pair retired with the presence layer: a fresh
  // workspace is born claimed (the lobby ceremony, D3) and the nudge below aims at the ledger.
  assert.ok(
    !("sessionHook" in ambientPresence),
    "sessionHook must stay deleted — the claim ledger is the one session surface (ADR-0200 D7)",
  );
});

// ---------------------------------------------------------------------------
// statuslineGlance — rendering (sourced from the claim ledger, ADR-0200 D7)
// ---------------------------------------------------------------------------

test("statuslineGlance: returns a non-empty line with the live-session count and own claimed units", async () => {
  const claims = makeClaims([
    claimDoc({ unitId: "ambient-integration", sessionId: IDENTITY.sessionId, grade: "work" }),
    claimDoc({ unitId: "other-story", sessionId: "wt-other", grade: "exploring", intent: "poking" }),
  ]);
  const deps: AmbientDeps = { claims, identity: IDENTITY, now: nowFn };

  const line = await statuslineGlance(deps, makeHeartbeatState(null), 60_000);

  assert.ok(line.length > 0, "should return a non-empty line");
  assert.match(line, /2 sessions on the ledger/, "counts distinct live-claim sessions");
  assert.match(line, /claims: ambient-integration/, "names this session's own claimed units");
});

test("statuslineGlance: includes an overlap warning when another session claims one of your units", async () => {
  const claims = makeClaims([
    claimDoc({ unitId: "ambient-integration", sessionId: IDENTITY.sessionId, grade: "work" }),
    claimDoc({ unitId: "ambient-integration", sessionId: "wt-other", grade: "exploring" }),
  ]);
  const deps: AmbientDeps = { claims, identity: IDENTITY, now: nowFn };

  const line = await statuslineGlance(deps, makeHeartbeatState(null), 60_000);

  assert.match(line, /overlap/i);
});

test("statuslineGlance: no overlap warning when the other session claims different units", async () => {
  const claims = makeClaims([
    claimDoc({ unitId: "ambient-integration", sessionId: IDENTITY.sessionId }),
    claimDoc({ unitId: "unrelated-story", sessionId: "wt-other" }),
  ]);
  const deps: AmbientDeps = { claims, identity: IDENTITY, now: nowFn };

  const line = await statuslineGlance(deps, makeHeartbeatState(NOW.toISOString()), 60_000);

  assert.doesNotMatch(line, /overlap|conflict/i);
});

test("statuslineGlance: a claim-less session renders the count alone (no claims segment)", async () => {
  const claims = makeClaims([claimDoc({ unitId: "other-story", sessionId: "wt-other" })]);
  const deps: AmbientDeps = { claims, identity: IDENTITY, now: nowFn };

  const line = await statuslineGlance(deps, makeHeartbeatState(NOW.toISOString()), 60_000);

  assert.match(line, /1 session on the ledger/);
  assert.doesNotMatch(line, /claims:/);
});

// ---------------------------------------------------------------------------
// statuslineGlance — fail-silent
// ---------------------------------------------------------------------------

test("statuslineGlance: returns '' when claims store is null", async () => {
  const deps: AmbientDeps = { claims: null, identity: IDENTITY, now: nowFn };
  const result = await statuslineGlance(deps, makeHeartbeatState(null), 60_000);
  assert.equal(result, "");
});

test("statuslineGlance: returns '' when identity is null", async () => {
  const deps: AmbientDeps = { claims: makeClaims(), identity: null, now: nowFn };
  const result = await statuslineGlance(deps, makeHeartbeatState(null), 60_000);
  assert.equal(result, "");
});

test("statuslineGlance: returns '' when the ledger reads throw", async () => {
  const claims = makeClaims([], { throwing: true });
  const deps: AmbientDeps = { claims, identity: IDENTITY, now: nowFn };
  const result = await statuslineGlance(deps, makeHeartbeatState(null), 60_000);
  assert.equal(result, "");
});

// ---------------------------------------------------------------------------
// statuslineGlance — the claim heartbeat rides the debounce (ADR-0200 D5)
// ---------------------------------------------------------------------------

test("statuslineGlance: null lastBump → the claim heartbeat bump fires and the bump is recorded", async () => {
  const claims = makeClaims([claimDoc({ unitId: "n1", sessionId: IDENTITY.sessionId })]);
  const deps: AmbientDeps = { claims, identity: IDENTITY, now: nowFn };
  const state = makeHeartbeatState(null);

  await statuslineGlance(deps, state, 60_000);

  assert.deepEqual(claims.bumps, [IDENTITY.sessionId], "the beat bumps this session's claims");
  assert.equal(state.bumps.length, 1, "writeLastBump records the debounce");
});

test("statuslineGlance: two renders within the debounce window — the bump fires only once", async () => {
  const claims = makeClaims([claimDoc({ unitId: "n1", sessionId: IDENTITY.sessionId })]);
  const deps: AmbientDeps = { claims, identity: IDENTITY, now: nowFn };
  const state = makeHeartbeatState(null);

  await statuslineGlance(deps, state, 60_000);
  await statuslineGlance(deps, state, 60_000);

  assert.equal(claims.bumps.length, 1, "no extra bump within the debounce window");
  assert.equal(state.bumps.length, 1, "writeLastBump called exactly once for both renders");
});

test("statuslineGlance: past the debounce window — the bump fires again", async () => {
  const claims = makeClaims([claimDoc({ unitId: "n1", sessionId: IDENTITY.sessionId })]);
  const pastBump = new Date(NOW.getTime() - 200).toISOString();
  const state = makeHeartbeatState(pastBump);
  const deps: AmbientDeps = { claims, identity: IDENTITY, now: nowFn };

  await statuslineGlance(deps, state, 100);

  assert.equal(claims.bumps.length, 1, "the bump fires when the window expired");
  assert.equal(state.bumps.length, 1);
});

test("statuslineGlance: within the debounce window (recent lastBump) — no bump at all", async () => {
  const claims = makeClaims([claimDoc({ unitId: "n1", sessionId: IDENTITY.sessionId })]);
  const state = makeHeartbeatState(NOW.toISOString());
  const deps: AmbientDeps = { claims, identity: IDENTITY, now: nowFn };

  await statuslineGlance(deps, state, 60_000);

  assert.equal(claims.bumps.length, 0, "no bump within the debounce window");
  assert.equal(state.bumps.length, 0, "writeLastBump not called within the window");
});

test("statuslineGlance: a THROWING bump stays silent — the line still renders, the debounce is NOT consumed", async () => {
  const claims = makeClaims([claimDoc({ unitId: "n1", sessionId: IDENTITY.sessionId })], {
    bumpThrows: true,
  });
  const deps: AmbientDeps = { claims, identity: IDENTITY, now: nowFn };
  const state = makeHeartbeatState(null);

  const line = await statuslineGlance(deps, state, 60_000);

  assert.notEqual(line, "", "the glance still renders despite the bump failure");
  assert.equal(state.bumps.length, 0, "a failed bump must not consume the debounce (the next render retries)");
});

test("statuslineGlance: the beat only ever BUMPS — it never takes, upgrades, or releases a claim", async () => {
  // Structural lock: the ambient seam carries no take/upgrade/release verbs at all, so the beat
  // CANNOT mutate the ledger beyond liveness (only a deliberate claim/declare lights a wisp).
  const claims = makeClaims([claimDoc({ unitId: "n1", sessionId: IDENTITY.sessionId })]);
  await statuslineGlance(
    { claims, identity: IDENTITY, now: nowFn },
    makeHeartbeatState(null),
    60_000,
  );
  assert.deepEqual(Object.keys(claims).sort(), [
    "bumpThrows",
    "bumps",
    "claimsBySession",
    "listLiveClaims",
    "live",
    "throwing",
    "bumpHeartbeatsBySession",
  ].sort());
});

// ---------------------------------------------------------------------------
// auditHookConfig
// ---------------------------------------------------------------------------

// Clean: the ambient hooks only on SessionStart / the statusline; unrelated PreToolUse → []
const CLEAN_SETTINGS = JSON.stringify({
  hooks: {
    SessionStart: [
      { matcher: "", hooks: [{ type: "command", command: "bash scripts/presence-hook.sh start" }] },
    ],
    PreToolUse: [
      { matcher: "", hooks: [{ type: "command", command: "echo unrelated-hook" }] },
    ],
  },
});

test("auditHookConfig: clean settings returns []", () => {
  const violations = auditHookConfig(CLEAN_SETTINGS);
  assert.deepEqual(violations, []);
});

test("auditHookConfig: noticeboard hook under Stop is a violation", () => {
  const settings = JSON.stringify({
    hooks: {
      Stop: [
        { matcher: "", hooks: [{ type: "command", command: "storytree noticeboard done --pg" }] },
      ],
    },
  });
  const violations = auditHookConfig(settings);
  assert.ok(violations.length >= 1, "should flag Stop noticeboard hook");
  assert.ok(
    violations.some((v) => /stop/i.test(v)),
    `violation should mention Stop, got: ${JSON.stringify(violations)}`,
  );
});

test("auditHookConfig: ambient-presence hook under PreToolUse is a violation", () => {
  const settings = JSON.stringify({
    hooks: {
      PreToolUse: [
        { matcher: "", hooks: [{ type: "command", command: "storytree ambient-presence hook start" }] },
      ],
    },
  });
  const violations = auditHookConfig(settings);
  assert.ok(violations.length >= 1, "should flag PreToolUse ambient-presence hook");
  assert.ok(
    violations.some((v) => /pretooluse/i.test(v)),
    `violation should mention PreToolUse, got: ${JSON.stringify(violations)}`,
  );
});

test("auditHookConfig: the presence-hook launcher under a blocking event is a violation", () => {
  // The shared settings.json invokes `bash scripts/presence-hook.sh <mode>` — its command
  // string never names `ambient-presence`, so the audit must catch it by the launcher name.
  const settings = JSON.stringify({
    hooks: {
      PreToolUse: [
        { matcher: "", hooks: [{ type: "command", command: "bash scripts/presence-hook.sh statusline" }] },
      ],
    },
  });
  const violations = auditHookConfig(settings);
  assert.ok(violations.length >= 1, "should flag PreToolUse presence-hook launcher");
  assert.ok(
    violations.some((v) => /pretooluse/i.test(v)),
    `violation should mention PreToolUse, got: ${JSON.stringify(violations)}`,
  );
});

test("auditHookConfig: noticeboard hook under UserPromptSubmit is a violation", () => {
  const settings = JSON.stringify({
    hooks: {
      UserPromptSubmit: [
        { matcher: "", hooks: [{ type: "command", command: "echo noticeboard status check" }] },
      ],
    },
  });
  const violations = auditHookConfig(settings);
  assert.ok(violations.length >= 1, "should flag UserPromptSubmit noticeboard hook");
});

test("auditHookConfig: unrelated PreToolUse hook (not noticeboard-shaped) is NOT a violation", () => {
  const settings = JSON.stringify({
    hooks: {
      PreToolUse: [
        { matcher: "", hooks: [{ type: "command", command: "echo check something else" }] },
      ],
    },
  });
  const violations = auditHookConfig(settings);
  assert.deepEqual(violations, []);
});

test("auditHookConfig: empty hooks object returns []", () => {
  const violations = auditHookConfig(JSON.stringify({ hooks: {} }));
  assert.deepEqual(violations, []);
});

test("auditHookConfig: no hooks key at all returns []", () => {
  const violations = auditHookConfig(JSON.stringify({}));
  assert.deepEqual(violations, []);
});

test("auditHookConfig: multiple violations across events reported individually", () => {
  const settings = JSON.stringify({
    hooks: {
      Stop: [
        { matcher: "", hooks: [{ type: "command", command: "storytree noticeboard done --pg" }] },
      ],
      PreToolUse: [
        { matcher: "", hooks: [{ type: "command", command: "run ambient-presence hook start" }] },
      ],
    },
  });
  const violations = auditHookConfig(settings);
  assert.ok(violations.length >= 2, "should flag both violations separately");
});

test("auditHookConfig: ambient-presence hook under Stop is a violation", () => {
  const settings = JSON.stringify({
    hooks: {
      Stop: [
        { matcher: "", hooks: [{ type: "command", command: "node ambient-presence.js" }] },
      ],
    },
  });
  const violations = auditHookConfig(settings);
  assert.ok(violations.length >= 1, "should flag ambient-presence hook under Stop");
});

// ---------------------------------------------------------------------------
// undeclaredSessionNudge (ADR-0143, re-aimed by ADR-0200 D3)
// ---------------------------------------------------------------------------

test("undeclaredSessionNudge: a worktree identity gets the one-line claim-ledger prompt naming the claim command", () => {
  const line = undeclaredSessionNudge(IDENTITY);
  assert.match(line, /UNCLAIMED/);
  assert.match(line, new RegExp(IDENTITY.sessionId));
  assert.match(line, /noticeboard claim <story-id> --grade exploring --intent "<why>" --pg/);
  assert.match(line, /worktree create --node <story-id> --intent "<what>" --pg/);
  assert.match(line, /ADR-0200/);
  assert.doesNotMatch(line, /noticeboard declare/, "the nudge no longer aims at declare (ADR-0200 D3)");
  assert.equal(line.trim().split("\n").length, 1, "exactly one line — SessionStart stdout is model context");
});

test("undeclaredSessionNudge: a plain checkout (null identity) stays silent", () => {
  assert.equal(undeclaredSessionNudge(null), "");
});
