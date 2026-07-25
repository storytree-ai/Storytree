/**
 * Story `context-traversal-capture` UAT / capability `terminal-capture-activation` proof
 * (ADR-0235 / ADR-0241).
 *
 * This is the story's standing machine UAT: it spawns the REAL `storytree` CLI entry
 * (`node packages/cli/launch.mjs …`) as a child process — never an in-process call, never a
 * composed object asserted about directly — so "production emits" is an OBSERVATION of a real
 * process that has already exited, not a claim. Every run is OFFLINE (no `--pg`) and points
 * `STORYTREE_TRAVERSAL_DIR` at a fresh temporary directory so no run ever touches a real machine's
 * `~/.storytree/traces`. `STORYTREE_SESSION_ID` is set explicitly wherever a session must resolve —
 * `deriveIdentity()` only matches a `.claude/worktrees/<name>` checkout, so leaving the override off
 * is how contract 5 below exercises the "no resolvable identity" path for real, from a real process,
 * without relying on running from a particular directory shape.
 *
 * Contracts covered (`stories/context-traversal-capture/terminal-capture-activation.md`):
 *   1. a-spawned-read-command-writes-a-replayable-visit
 *   2. two-commands-share-one-session-with-distinct-visits
 *   3. a-spawned-write-command-leaves-no-canary-bytes
 *   4. traversal-show-renders-the-captured-session
 *   5. capture-off-leaves-a-byte-identical-envelope
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

import { isContextVisitEvent } from "@storytree/context-traversal-telemetry";
import type { ContextTraversalEvent, ContextVisitEvent } from "@storytree/context-traversal-telemetry";

import { readTraversalSession } from "./sink.js";

const LAUNCHER = fileURLToPath(new URL("../../cli/launch.mjs", import.meta.url));

interface CliResult {
  readonly status: number | null;
  readonly stdout: string;
  readonly stderr: string;
}

/**
 * Spawns the REAL CLI as a child process with an explicit env — never inherits ambient overrides.
 *
 * `cwd` is load-bearing for the unresolved-identity leg: `deriveIdentity()` resolves by running
 * `git rev-parse --show-toplevel` in the CHILD's working directory and matching
 * `.claude/worktrees/<name>`, so the caller's directory — not any env var — is what decides whether
 * an identity exists. Defaults to this process's cwd.
 */
function runCli(args: readonly string[], env: NodeJS.ProcessEnv, cwd?: string): CliResult {
  const res = spawnSync(process.execPath, [LAUNCHER, ...args], {
    encoding: "utf8",
    env,
    ...(cwd !== undefined ? { cwd } : {}),
  });
  return { status: res.status, stdout: res.stdout ?? "", stderr: res.stderr ?? "" };
}

function freshDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), `traversal-uat-${prefix}-`));
}

/** The env every OFFLINE test starts from: ambient process.env with the three traversal-only
 * variables stripped, so a prior test (or the host machine) can never leak into this one. */
function baseEnv(): NodeJS.ProcessEnv {
  const {
    STORYTREE_TRAVERSAL_DIR: _dir,
    STORYTREE_SESSION_ID: _session,
    STORYTREE_TRAVERSAL: _toggle,
    ...rest
  } = process.env;
  return rest;
}

function listDir(dir: string): string[] {
  try {
    return fs.readdirSync(dir);
  } catch {
    return [];
  }
}

/** Narrows a raw event to a visit event (front_matter_read | full_payload_read) or fails loudly. */
function expectVisit(event: ContextTraversalEvent | undefined, context: string): ContextVisitEvent {
  assert.notEqual(event, undefined, `${context}: expected an event, got none`);
  if (event === undefined) throw new Error("unreachable");
  assert.equal(isContextVisitEvent(event), true, `${context}: expected a visit event, got kind=${event.kind}`);
  if (!isContextVisitEvent(event)) throw new Error("unreachable");
  return event;
}

// ---------------------------------------------------------------------------
// 1. a-spawned-read-command-writes-a-replayable-visit
// ---------------------------------------------------------------------------

test("a-spawned-read-command-writes-a-replayable-visit: a real spawned CLI read leaves a replayable full-payload visit", () => {
  const dir = freshDir("contract1");
  const sessionId = "session-contract1";

  const result = runCli(["library", "artifact", "plan"], {
    ...baseEnv(),
    STORYTREE_TRAVERSAL_DIR: dir,
    STORYTREE_SESSION_ID: sessionId,
  });
  assert.equal(result.status, 0, `expected the spawned read to exit 0, got ${result.status}: ${result.stderr}`);

  // Read back through a BRAND-NEW reader call, after the child process has already exited — this is
  // what proves durability across a real process boundary rather than an in-memory hold.
  const { replay, skipped } = readTraversalSession({ dir, sessionId });
  assert.equal(skipped, 0);
  assert.equal(replay.events.length, 1, "expected exactly one captured event");

  const event = expectVisit(replay.events[0], "contract1");
  assert.equal(event.kind, "full_payload_read");
  assert.equal(event.nodeId, "plan");
  assert.equal(event.sessionId, sessionId);
});

// ---------------------------------------------------------------------------
// 2. two-commands-share-one-session-with-distinct-visits
// ---------------------------------------------------------------------------

test("two-commands-share-one-session-with-distinct-visits: two spawned commands under one session id produce two distinct visits", () => {
  const dir = freshDir("contract2");
  const sessionId = "session-contract2";
  const env = { ...baseEnv(), STORYTREE_TRAVERSAL_DIR: dir, STORYTREE_SESSION_ID: sessionId };

  const first = runCli(["library", "artifact", "plan"], env); // full-payload strength
  assert.equal(first.status, 0, `expected the first spawned command to exit 0: ${first.stderr}`);

  const second = runCli(["tree", "context-traversal-telemetry"], env); // front-matter strength
  assert.equal(second.status, 0, `expected the second spawned command to exit 0: ${second.stderr}`);

  const { replay, skipped } = readTraversalSession({ dir, sessionId });
  assert.equal(skipped, 0);
  assert.equal(replay.events.length, 2, "expected exactly two captured events across both invocations");

  const [firstEvent, secondEvent] = replay.events;
  const one = expectVisit(firstEvent, "contract2 first");
  const two = expectVisit(secondEvent, "contract2 second");

  assert.notEqual(one.visitId, two.visitId, "the two visits must carry distinct visit ids");
  const kinds = new Set([one.kind, two.kind]);
  assert.deepEqual(
    [...kinds].sort(),
    ["front_matter_read", "full_payload_read"],
    "the two commands must land at distinct read strengths",
  );

  for (const event of [one, two]) {
    assert.equal(event.sessionId, sessionId);
    assert.equal(event.parentVisitId, undefined, "cross-process adjacency must not create a parent edge");
    assert.equal(event.priorVisitId, undefined, "cross-process adjacency must not create a revisit edge");
    // followedEdgeId is not even a field on a visit event's vocabulary — confirm no such key leaked in.
    assert.equal(Object.prototype.hasOwnProperty.call(event, "followedEdgeId"), false);
  }
});

// ---------------------------------------------------------------------------
// 3. a-spawned-write-command-leaves-no-canary-bytes
// ---------------------------------------------------------------------------

test("a-spawned-write-command-leaves-no-canary-bytes: a spawned write-shaped command appends nothing and leaves no canary on disk", () => {
  const dir = freshDir("contract3");
  const sessionId = "session-contract3";
  const env = { ...baseEnv(), STORYTREE_TRAVERSAL_DIR: dir, STORYTREE_SESSION_ID: sessionId };
  const canary = "CANARY-MUST-NEVER-REACH-DISK-7f3a";

  // First, a genuine read so a real trace file with real bytes already exists — proving the write
  // command below adds nothing to an existing file is a stronger claim than proving an empty
  // directory stays empty.
  const readResult = runCli(["library", "artifact", "plan"], env);
  assert.equal(readResult.status, 0, `expected the seeding read to exit 0: ${readResult.stderr}`);
  const afterRead = readTraversalSession({ dir, sessionId });
  assert.equal(afterRead.replay.events.length, 1, "expected the seeding read to leave exactly one event");

  // Offline (no --pg), `noticeboard declare` refuses outright — a write-shaped command whose argv
  // carries owner prose (the canary), which must never reach the trace bytes.
  const writeResult = runCli(
    ["noticeboard", "declare", "--working-on", canary, "--node", "x"],
    env,
  );
  assert.notEqual(writeResult.status, 0, "the offline write command must itself refuse (non-zero exit)");

  const afterWrite = readTraversalSession({ dir, sessionId });
  assert.equal(afterWrite.replay.events.length, 1, "the write attempt must append no new event");

  const filePath = path.join(dir, `${sessionId}.jsonl`);
  const raw = fs.existsSync(filePath) ? fs.readFileSync(filePath, "utf8") : "";
  // Guards against a vacuous pass: the file must genuinely have bytes to search, and those bytes
  // must be the real seeded read (not an empty file the canary check would trivially pass against).
  assert.equal(raw.includes("plan"), true, "sanity: the trace file must hold the seeded read's real bytes");
  assert.equal(raw.includes(canary), false, "the canary prose must never reach the trace file's bytes");
});

// ---------------------------------------------------------------------------
// 4. traversal-show-renders-the-captured-session
// ---------------------------------------------------------------------------

test("traversal-show-renders-the-captured-session: `traversal show` replays a healthy session with strength, capacity, and coverage", () => {
  const dir = freshDir("contract4-healthy");
  const sessionId = "session-contract4-healthy";
  const env = { ...baseEnv(), STORYTREE_TRAVERSAL_DIR: dir, STORYTREE_SESSION_ID: sessionId };

  const first = runCli(["library", "artifact", "plan"], env);
  assert.equal(first.status, 0, `expected the seeding full-payload read to exit 0: ${first.stderr}`);
  const second = runCli(["tree", "context-traversal-telemetry"], env);
  assert.equal(second.status, 0, `expected the seeding front-matter read to exit 0: ${second.stderr}`);

  const shown = runCli(["traversal", "show", sessionId], env);
  assert.equal(shown.status, 0, `expected traversal show to exit 0: ${shown.stderr}`);
  assert.match(shown.stdout, /\[full-payload\]/, "must render the full-payload visit distinctly");
  assert.match(shown.stdout, /\[front-matter\]/, "must render the front-matter visit distinctly");
  assert.match(shown.stdout, /capacity: unknown/, "capacity must be reported honestly as unknown");
  assert.match(
    shown.stdout,
    /coverage: adapter=terminal-cli-dispatch supported=\[.*\] omitted=\[.*\]/,
    "must print the adapter's declared supported/omitted coverage block",
  );
});

test("traversal-show-renders-the-captured-session: `traversal show` over a corrupt trace still exits 0 and states its skipped count", () => {
  const dir = freshDir("contract4-corrupt");
  const sessionId = "session-contract4-corrupt";
  const filePath = path.join(dir, `${sessionId}.jsonl`);

  const goodLine = JSON.stringify({
    v: 1,
    event: {
      kind: "front_matter_read",
      eventId: "event:corrupt-good",
      sessionId,
      at: "2026-07-26T00:00:00.000Z",
      visitId: "visit-corrupt-good",
      nodeId: "node-corrupt-good",
    },
  });
  // A garbage line the reader must skip and count, never throw on.
  fs.writeFileSync(filePath, `${goodLine}\nnot-even-json-{{{\n`);

  const shown = runCli(["traversal", "show", sessionId], {
    ...baseEnv(),
    STORYTREE_TRAVERSAL_DIR: dir,
  });
  assert.equal(shown.status, 0, `expected traversal show over a corrupt trace to still exit 0: ${shown.stderr}`);
  assert.match(
    shown.stdout,
    /partial replay: 1 event line\(s\) skipped/,
    "must state the skipped-line count explicitly, not hide the corruption",
  );
});

// ---------------------------------------------------------------------------
// 5. capture-off-leaves-a-byte-identical-envelope
// ---------------------------------------------------------------------------

test("capture-off-leaves-a-byte-identical-envelope: STORYTREE_TRAVERSAL=off and an unresolved identity both leave no trace and an unchanged envelope", () => {
  const args = ["library", "artifact", "plan"];

  // Baseline: capture entirely absent — no traversal env vars set at all.
  const baseline = runCli(args, baseEnv());
  assert.equal(baseline.status, 0, `expected the baseline read to exit 0: ${baseline.stderr}`);

  // Variant A: explicit opt-out, even with a valid session id and a real trace directory.
  const offDir = freshDir("contract5-off");
  const offResult = runCli(args, {
    ...baseEnv(),
    STORYTREE_TRAVERSAL_DIR: offDir,
    STORYTREE_SESSION_ID: "session-contract5-off",
    STORYTREE_TRAVERSAL: "off",
  });
  assert.equal(offResult.status, baseline.status, "STORYTREE_TRAVERSAL=off must not change the exit code");
  assert.equal(offResult.stdout, baseline.stdout, "STORYTREE_TRAVERSAL=off must not change the envelope");
  assert.deepEqual(listDir(offDir), [], "STORYTREE_TRAVERSAL=off must create no trace file");

  // Variant B: no resolvable session identity — STORYTREE_SESSION_ID deliberately left unset AND
  // the child spawned from a directory that is not a `.claude/worktrees/<name>` checkout, so
  // `deriveIdentity()` genuinely resolves to null rather than the test faking that outcome.
  //
  // The cwd is what makes this deterministic, and it is not optional. Identity is derived from the
  // CHILD's working directory, so leaving cwd ambient makes this leg environment-dependent: it holds
  // in CI and in the spine's temporary build worktree (neither matches the slot pattern) but INVERTS
  // inside a real `.claude/worktrees/<name>` session, where an identity resolves, capture correctly
  // fires, and the "no trace file" assertion fails on a working implementation. That is the
  // worktree-shaped-identity trap in its second direction — and a session worktree is exactly where
  // this story's reliability gate is observed.
  const noIdDir = freshDir("contract5-no-identity");
  const noIdCwd = freshDir("contract5-no-identity-cwd");
  const noIdResult = runCli(
    args,
    {
      ...baseEnv(),
      STORYTREE_TRAVERSAL_DIR: noIdDir,
    },
    noIdCwd,
  );
  assert.equal(noIdResult.status, baseline.status, "an unresolved identity must not change the exit code");
  assert.equal(noIdResult.stdout, baseline.stdout, "an unresolved identity must not change the envelope");
  assert.deepEqual(listDir(noIdDir), [], "an unresolved identity must create no trace file");
});
