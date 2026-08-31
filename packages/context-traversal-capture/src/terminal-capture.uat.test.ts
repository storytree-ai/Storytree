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
 *
 * It also carries the story's sixth UAT leg (`stories/context-traversal-capture/story.md`), which
 * belongs to no capability's contract list: an `agents <name>` render's floor-ref descent, proven on
 * the REAL CLI. `agent-ref-descent`'s own contracts prove the descent over caller-supplied events,
 * which is strictly weaker than "the real CLI, spawned, writes a parent-linked child visit and
 * renders it" — the gap is closed here because this file already spawns the CLI for free.
 */
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import type { ChildProcess, SpawnSyncOptionsWithStringEncoding } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test, before, after } from "node:test";

import { nodeExecutable } from "./node-executable.test-helpers.js";

import { isContextVisitEvent } from "@storytree/context-traversal-telemetry";
import type { ContextTraversalEvent, ContextVisitEvent } from "@storytree/context-traversal-telemetry";

import { readTraversalSession } from "./sink.js";
import { readShipCursor, SHIP_CURSOR_EXT } from "./store/ship.js";

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
  // No `cwd` leaves the key ABSENT, so the child inherits THIS process's directory — which is what
  // the unresolved-identity leg depends on.
  const options: SpawnSyncOptionsWithStringEncoding = { encoding: "utf8", env };
  if (cwd !== undefined) options.cwd = cwd;
  const res = spawnSync(nodeExecutable(), [LAUNCHER, ...args], options);
  return { status: res.status, stdout: res.stdout ?? "", stderr: res.stderr ?? "" };
}

/**
 * A STORE DOOR over the library's fixture corpus, in its OWN process, for the whole suite.
 *
 * Every case below spawns the real CLI, and since ADR-0302 D1 a `library artifact <id>` read goes to
 * the LIVE store — which `pnpm -r test` has no credential for by design (ADR-0302 D3). So the child
 * is handed `STORYTREE_STORE_URL` pointing here.
 *
 * OUT OF PROCESS, and that is forced rather than chosen: {@link runCli} uses `spawnSync`, which
 * blocks this process's event loop for the child's whole lifetime, so a door served from here could
 * never answer the request the child is waiting on — both sides would hang until the runner was
 * killed. `before`/`after` may be async even though every case is sync, so readiness is awaited on
 * the door's own `PORT=` line rather than polled.
 */
let doorProc: ChildProcess | undefined;
let doorUrl: string | undefined;

const DOOR = fileURLToPath(new URL("../../cli/fixture-door.mjs", import.meta.url));

before(async () => {
  doorProc = spawn(nodeExecutable(), [DOOR], { stdio: ["ignore", "pipe", "pipe"] });
  const port = await new Promise<string>((resolve, reject) => {
    let buf = "";
    const timer = setTimeout(() => reject(new Error(`fixture door did not start: ${buf}`)), 30_000);
    doorProc?.stdout?.setEncoding("utf8");
    doorProc?.stdout?.on("data", (c: string) => {
      buf += c;
      const m = /PORT=(\d+)/.exec(buf);
      if (m?.[1]) {
        clearTimeout(timer);
        resolve(m[1]);
      }
    });
    doorProc?.on("error", reject);
  });
  doorUrl = `http://127.0.0.1:${port}`;
});

after(() => {
  doorProc?.kill();
});

function freshDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), `traversal-uat-${prefix}-`));
}

/** The env every OFFLINE test starts from: ambient process.env with the four traversal-only
 * variables stripped, so a prior test (or the host machine) can never leak into this one.
 *
 * `CLAUDE_CODE_SESSION_ID` is the fourth (`linked-session-context-arc-inc-30`): since trace identity
 * is the host CONTEXT WINDOW rather than the worktree slot, that variable is now an identity source,
 * and it is set on every process a Claude Code session spawns — including this suite's. Left in
 * place it would silently resolve an identity for the "no resolvable identity" leg below, which runs
 * from a non-worktree cwd precisely so that leg is decided by the machine's shape rather than faked.
 * Stripping it keeps that determinism intact for exactly the reason the other three are stripped. */
function baseEnv(): NodeJS.ProcessEnv {
  const {
    STORYTREE_TRAVERSAL_DIR: _dir,
    STORYTREE_SESSION_ID: _session,
    STORYTREE_TRAVERSAL: _toggle,
    CLAUDE_CODE_SESSION_ID: _window,
    ...rest
  } = process.env;
  // The door the spawned CLI reads its corpus through (see the `before` hook above). Set here so
  // EVERY case gets it — a case that omitted it would hit the live store and fail on a credential.
  return doorUrl === undefined ? rest : { ...rest, STORYTREE_STORE_URL: doorUrl };
}

function listDir(dir: string): string[] {
  try {
    return fs.readdirSync(dir);
  } catch {
    return [];
  }
}

/**
 * The VISIT events of a replay, in order.
 *
 * Since ADR-0260 D1 a trace legitimately carries non-visit events too: a `library artifact <id>`
 * read records the offer its Sources block printed as a `candidate_set` beside the visit. The
 * event-count assertions below therefore count VISITS rather than raw events — they were always
 * making a claim about reads, and a raw total silently conflates "how many reads happened" with
 * "how many events exist". Where a leg's real claim IS about the raw total (contract 3: a write
 * appends NOTHING of any kind), it says so explicitly rather than filtering.
 */
function visitsOf(events: readonly ContextTraversalEvent[]): ContextVisitEvent[] {
  return events.filter((event): event is ContextVisitEvent => isContextVisitEvent(event));
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
  const visits = visitsOf(replay.events);
  assert.equal(visits.length, 1, "expected exactly one captured visit");

  const event = expectVisit(visits[0], "contract1");
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
  const visits = visitsOf(replay.events);
  assert.equal(visits.length, 2, "expected exactly two captured visits across both invocations");

  const [firstEvent, secondEvent] = visits;
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
    // These two fixtures read DIFFERENT nodes (`plan`, then `context-traversal-telemetry`), which is
    // why neither links. Since increment 6 the reason matters: cross-process adjacency to the SAME
    // node DOES create a revisit edge (see the sibling test below), so stating this as "adjacency
    // never links" would be true of the value and false of the mechanism.
    assert.equal(event.priorVisitId, undefined, "a visit to a DIFFERENT node must not become a revisit edge");
    // followedEdgeId is not even a field on a visit event's vocabulary — confirm no such key leaked in.
    assert.equal(Object.prototype.hasOwnProperty.call(event, "followedEdgeId"), false);
  }
});

// ---------------------------------------------------------------------------
// 2b. increment 6's revisit link, asserted at the REAL-CLI boundary
//
// Not a contract of any capability and not a UAT leg: `revisit-link-metadata`'s five contracts prove
// the PURE linker over caller-supplied events, which is strictly weaker than "the real CLI, run twice
// as two separate processes, links the second read to the first". That positive case was witnessed by
// hand and asserted NOWHERE, which is the "trustworthy seam that nothing composed" shape ADR-0243
// records — and unlike ADR-0243's own boundary this one costs nothing to close, because this file
// already spawns the real CLI. Strengthening a living criterion is safe; only weakening one would be
// forgery, so this is added rather than deferred.
// ---------------------------------------------------------------------------

test("a repeat read of the SAME node across two real CLI processes links to the earlier visit", () => {
  const dir = freshDir("revisit");
  const sessionId = "session-revisit";
  const env = { ...baseEnv(), STORYTREE_TRAVERSAL_DIR: dir, STORYTREE_SESSION_ID: sessionId };

  const first = runCli(["tree", "context-traversal-capture"], env);
  assert.equal(first.status, 0, `expected the first spawned command to exit 0: ${first.stderr}`);
  const second = runCli(["tree", "context-traversal-capture"], env);
  assert.equal(second.status, 0, `expected the second spawned command to exit 0: ${second.stderr}`);

  const { replay, skipped } = readTraversalSession({ dir, sessionId });
  assert.equal(skipped, 0);
  const visits = visitsOf(replay.events);
  assert.equal(visits.length, 2, "expected one captured visit per invocation");

  const [firstEvent, secondEvent] = visits;
  const one = expectVisit(firstEvent, "revisit first");
  const two = expectVisit(secondEvent, "revisit second");

  assert.equal(one.nodeId, two.nodeId, "the fixture must read the same canonical node twice");
  assert.notEqual(one.visitId, two.visitId, "a revisit is a NEW forward visit, never a reused id");

  // The link is read off the SECOND event the system produced, and it must name the FIRST event's
  // visitId — not merely be present. A linker that emitted any non-empty string would pass a
  // "priorVisitId is defined" check and fail this one.
  assert.equal(
    two.priorVisitId,
    one.visitId,
    "the second visit must name the first visit's id as its priorVisitId",
  );
  // The earlier visit itself has nothing to link back to, so the key must be absent entirely — the
  // shape the sink writes, which is what a later reader parses.
  assert.equal(Object.prototype.hasOwnProperty.call(one, "priorVisitId"), false);
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
  assert.equal(visitsOf(afterRead.replay.events).length, 1, "expected the seeding read to leave exactly one visit");

  // Offline (no --pg), `noticeboard declare` refuses outright — a write-shaped command whose argv
  // carries owner prose (the canary), which must never reach the trace bytes.
  const writeResult = runCli(
    ["noticeboard", "declare", "--working-on", canary, "--node", "x"],
    env,
  );
  assert.notEqual(writeResult.status, 0, "the offline write command must itself refuse (non-zero exit)");

  const afterWrite = readTraversalSession({ dir, sessionId });
  // This leg's claim really IS about the RAW total, so it is asserted as one: the write must append
  // no event of ANY kind. Comparing against the seeded total rather than a hard-coded number keeps
  // the claim exact as the read side legitimately gains events (a `library artifact` read now also
  // records its offer, ADR-0260 D1) — the point was never "one event", it was "the write added none".
  assert.equal(
    afterWrite.replay.events.length,
    afterRead.replay.events.length,
    "the write attempt must append no new event of any kind",
  );

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

  // ADR-0464 D1 RESTORED THIS LEG'S ORIGINAL, STRONGER CLAIM, and the history is worth keeping because
  // it explains why the assertion below is so blunt.
  //
  // The leg has always claimed that opting out changes nothing an agent depends on. It began as plain
  // stdout equality. ADR-0260 D3 broke that: a render recording an offer also PRINTED follow-up
  // commands carrying that offer's id, and the id was a fresh visit id per invocation — so no two runs
  // of the same command had identical stdout, not even two capture-ON runs. The leg was weakened to
  // compare stdout MINUS the offer lines. ADR-0320 widened the offer surface again with the `note:`
  // ask stanza, and the strip had to widen with it.
  //
  // Nothing is printed conditionally on capture any more, so the strip is gone and the comparison is
  // whole-stdout again. That is a STRONGER assertion than the one it replaces, not a weaker one: a
  // stripping comparison cannot see a regression inside the bytes it strips, and this one has nothing
  // to strip. ADR-0241 **D2**'s opt-out-clean envelope is what it pins. (D3's envelope promise is the
  // narrower one that no telemetry FAILURE may alter an envelope, which an opted-out run never
  // engages. ADR-0241's own Consequences make that split — don't re-file this leg under D3.)
  //
  // ⚠ THE POSITIVE HALF HAD TO BE REPLACED, NOT JUST DROPPED. The captured variant used to prove
  // capture was really ON by asserting it printed offer lines. Deleting that assertion and keeping
  // only the three "no trace file" checks would have left a leg that passes identically whether
  // capture works or has been ripped out entirely — every variant writing nothing, every stdout equal,
  // all green. So the captured variant now asserts the direct positive the offer lines stood proxy
  // for: a run with capture ON WRITES A TRACE FILE. It is the exact mirror of the absence checks in
  // variants A and B, which is what lets the three of them discriminate at all.

  // Variant CAPTURED: capture unambiguously ON — an explicit session id and a real trace directory,
  // so this run's behaviour does not depend on whether the test's own cwd happens to be a worktree
  // slot (see variant B's note on that trap). This is the run that MUST leave a trace.
  const onDir = freshDir("contract5-on");
  const onResult = runCli(args, {
    ...baseEnv(),
    STORYTREE_TRAVERSAL_DIR: onDir,
    STORYTREE_SESSION_ID: "session-contract5-on",
  });
  assert.equal(onResult.status, 0, `expected the captured read to exit 0: ${onResult.stderr}`);
  assert.notDeepEqual(
    listDir(onDir),
    [],
    "a run with capture ON must WRITE a trace — without this the absence checks below would all hold " +
      "just as well against a capture path that had been deleted outright",
  );
  assert.equal(
    onResult.stdout,
    baseline.stdout,
    "capture changes NOTHING an agent reads — stdout is byte-identical, with nothing stripped first",
  );

  // Variant A: explicit opt-out, even with a valid session id and a real trace directory.
  const offDir = freshDir("contract5-off");
  const offResult = runCli(args, {
    ...baseEnv(),
    STORYTREE_TRAVERSAL_DIR: offDir,
    STORYTREE_SESSION_ID: "session-contract5-off",
    STORYTREE_TRAVERSAL: "off",
  });
  assert.equal(offResult.status, baseline.status, "STORYTREE_TRAVERSAL=off must not change the exit code");
  assert.equal(
    offResult.stdout,
    baseline.stdout,
    "STORYTREE_TRAVERSAL=off must not change the envelope",
  );
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
  assert.equal(
    noIdResult.stdout,
    baseline.stdout,
    "an unresolved identity must not change the envelope",
  );
  assert.deepEqual(listDir(noIdDir), [], "an unresolved identity must create no trace file");
});

// ---------------------------------------------------------------------------
// 5b. THE TRACE'S SESSION IS ONE CONTEXT WINDOW, AND A FLAGGED READ IS A READ.
//
// `linked-session-context-arc-inc-30`, both defects on the REAL CLI in one leg because they are one
// wiring: what the trace is keyed by, and what it records at all.
//
// Not a new UAT criterion — the same "strengthening a living criterion is safe" posture as the
// repeat-read leg above, which is likewise unnumbered. The story's signed legs are untouched.
// ---------------------------------------------------------------------------

test("a real spawned read keys its trace by the CONTEXT WINDOW, not the pooled worktree slot, and records a flag-carrying read", () => {
  const dir = freshDir("window-identity");
  const windowId = "11111111-2222-3333-4444-555555555555";

  // The HARNESS's own env var, and no `STORYTREE_SESSION_ID`: this is the resolution a real agent
  // invocation takes. `deriveIdentity()` may or may not find a worktree slot depending on where the
  // suite runs (a session worktree, CI, the spine's temp checkout) — and that is exactly the point.
  // Whatever it finds, the slot must not name the file.
  const env = { ...baseEnv(), STORYTREE_TRAVERSAL_DIR: dir, CLAUDE_CODE_SESSION_ID: windowId };

  // A `--raw <field>` read: 72.3% of reads in the measured corpus carry a flag, and every one of
  // them was invisible to the observer's old three-token fence.
  const flagged = runCli(["library", "artifact", "plan", "--raw", "oneLine"], env);
  assert.equal(flagged.status, 0, `expected the flagged read to exit 0: ${flagged.stderr}`);

  assert.deepEqual(
    listDir(dir).filter((entry) => entry.endsWith(".jsonl")),
    [`${windowId}.jsonl`],
    "the trace is named by the context window — a slot-named file here would be the pooling defect",
  );

  // THE FORWARD-ONLY SHIP BASELINE, stamped by the REAL CLI (ADR-0484 D6). The cursor is named by
  // the same window id, so what a shipper would later drain is this window's own events and nothing
  // else — and it sits at 0 because this trace had no history before the invocation. A cursor named
  // by the SLOT here would ship one window's events under another's identity.
  assert.deepEqual(
    listDir(dir).filter((entry) => entry.endsWith(SHIP_CURSOR_EXT)),
    [`${windowId}${SHIP_CURSOR_EXT}`],
  );
  assert.equal(readShipCursor(dir, windowId)?.offset, 0);
  // NOTHING WAS SHIPPED and no ship was attempted: `STORYTREE_TRAVERSAL_DIR` is set here, which is
  // the shipper's own refusal to drain a directory it was pointed at rather than the machine's own.
  // Asserted rather than assumed — a spawned CLI that started a background `--pg` process would make
  // this suite reach the live database, which it must never do.
  assert.equal(listDir(dir).includes(".ship-attempt"), false, "an overridden trace dir is never swept ambiently");

  const { replay, skipped, identity, slots } = readTraversalSession({ dir, sessionId: windowId });
  assert.equal(skipped, 0);
  const visits = visitsOf(replay.events);
  assert.equal(visits.length, 1, "a flag-carrying read is a READ — it was silently discarded before");
  const visit = expectVisit(visits[0], "window-identity");
  assert.equal(visit.nodeId, "plan");
  assert.equal(visit.sessionId, windowId, "the event's own sessionId is the window, not the slot");
  assert.equal(
    visit.kind,
    "front_matter_read",
    "and a one-field read is recorded at the PARTIAL strength, not as a whole document",
  );
  assert.equal(
    JSON.stringify(replay.events).includes("oneLine"),
    false,
    "the field name is a flag value and is never recorded (ADR-0235 clause 6)",
  );

  // The classification the render then states, and the slot demoted to a grouping attribute beside
  // it. `slots` is whatever this machine's checkout actually is — asserted as "never the identity"
  // rather than as a fixed value, so the leg holds in a session worktree and in CI alike.
  assert.equal(identity, "window");
  assert.equal(slots.includes(windowId), false, "the slot is recorded beside the identity, never as it");

  const shown = runCli(["traversal", "show", windowId], env);
  assert.equal(shown.status, 0, `expected traversal show to exit 0: ${shown.stderr}`);
  assert.match(
    shown.stdout,
    /identity: window —/,
    "the replay says what its session id names rather than leaving it to the id's shape",
  );
  assert.doesNotMatch(
    shown.stdout,
    /retrofittable/i,
    "and a window-keyed replay carries no legacy slot warning",
  );

  // A second window in the SAME worktree writes a SEPARATE trace — the whole correction in one
  // assertion. Under slot identity these two would have been one "session" with a repeat read.
  const otherWindowId = "66666666-7777-8888-9999-000000000000";
  const second = runCli(["library", "artifact", "plan", "--raw", "oneLine"], {
    ...env,
    CLAUDE_CODE_SESSION_ID: otherWindowId,
  });
  assert.equal(second.status, 0, `expected the second window's read to exit 0: ${second.stderr}`);
  assert.deepEqual(
    listDir(dir)
      .filter((entry) => entry.endsWith(".jsonl"))
      .sort(),
    [`${otherWindowId}.jsonl`, `${windowId}.jsonl`].sort(),
    "two context windows in one worktree are two sessions, not one session that read twice",
  );
  // And each window carries its OWN ship cursor, for the same reason the traces are separate: a
  // cursor keyed by the shared worktree slot would drain one window's events under the other's id.
  assert.deepEqual(
    listDir(dir)
      .filter((entry) => entry.endsWith(SHIP_CURSOR_EXT))
      .sort(),
    [`${otherWindowId}${SHIP_CURSOR_EXT}`, `${windowId}${SHIP_CURSOR_EXT}`].sort(),
  );
  const secondReplay = readTraversalSession({ dir, sessionId: otherWindowId });
  assert.equal(visitsOf(secondReplay.replay.events).length, 1);
  assert.equal(
    visitsOf(secondReplay.replay.events)[0]?.priorVisitId,
    undefined,
    "and neither window's read is a revisit of the other's — that link was the inflated count",
  );
});

// ---------------------------------------------------------------------------
// 6. a real `agents` render writes a depth, not a flat column
// ---------------------------------------------------------------------------

test("an-agents-render-writes-a-parent-linked-descent: a real spawned `agents <name>` leaves child visits naming the agent visit as parent", () => {
  const dir = freshDir("contract6");
  const sessionId = "session-contract6";
  const env = { ...baseEnv(), STORYTREE_TRAVERSAL_DIR: dir, STORYTREE_SESSION_ID: sessionId };
  const agentId = "librarian-curator";

  // `agents <name>` fails its envelope (`ok: false`) on ANY dangling floor ref, and capture is
  // success-only — so a dangling manifest would make this leg fail for a reason unrelated to the
  // descent. Asserting exit 0 first makes that distinction visible instead of silent.
  const result = runCli(["agents", agentId], env);
  assert.equal(result.status, 0, `expected the spawned agents render to exit 0: ${result.stderr}`);

  const { replay } = readTraversalSession({ dir, sessionId });
  const agentVisits = visitsOf(replay.events);
  assert.ok(agentVisits.length >= 2, "an agents render must write the agent visit AND at least one child");
  // This leg indexes POSITIONALLY into the trace below, so it must first establish that every event
  // here is a visit. It used to say that by asserting the `agents` surface records no `candidate_set`
  // — true, but only because that surface rendered no Sources block. After ADR-0464 D1 no surface
  // records one, so that assertion would have held for a reason that has nothing to do with `agents`
  // and would have kept passing had the descent itself broken. Asserting the positive property the
  // indexing actually needs — these events are ALL visits — is the version that can still fail.
  assert.equal(
    replay.events.length,
    agentVisits.length,
    "this leg indexes positionally, so every recorded event must be a visit",
  );

  const parent = expectVisit(agentVisits[0], "the agent's own visit");
  assert.equal(parent.kind, "full_payload_read", "the agent itself is read at full-payload strength");
  assert.equal(parent.nodeId, agentId);
  assert.equal(parent.surfaceId, "agents");
  // The parent is a root: it descends from nothing, so the KEY is absent — the shape on disk, read
  // back from bytes a process that has already exited wrote.
  assert.equal(
    Object.prototype.hasOwnProperty.call(parent, "parentVisitId"),
    false,
    "the agent's own visit must carry no parentVisitId key at all",
  );

  const children = agentVisits.slice(1);
  assert.ok(children.length >= 1, "at least one floor ref must descend");
  for (const child of children) {
    assert.equal(child.kind, "front_matter_read", "a floor ref is read at front-matter strength only");
    assert.equal(
      child.parentVisitId,
      parent.visitId,
      "each child must name the agent's visitId — not merely carry some parentVisitId",
    );
    assert.notEqual(child.visitId, parent.visitId, "a child is a NEW visit, never a reused id");
    assert.equal(child.surfaceId, "agents", "the ref was read THROUGH the agents surface");
  }

  // The RENDER must show what the trace carries. Asserted on the rendered body of a second real
  // process, and BEFORE the coverage-block comparison below, so this pin reports its own defect
  // rather than being masked by a neighbouring mismatch.
  const shown = runCli(["traversal", "show", sessionId], env);
  assert.equal(shown.status, 0, `expected traversal show to exit 0: ${shown.stderr}`);
  const firstChild = children[0];
  assert.ok(firstChild !== undefined, "expected at least one child to assert the render on");
  assert.ok(
    shown.stdout.includes(`node=${firstChild.nodeId} surface=agents (descended from visit=${parent.visitId})`),
    "the rendered child line must name the parent visit it descended from",
  );

  // ...and the coverage block must not DENY the field the same body just displayed (ADR-0235
  // clause 6) — the self-denial this arc has had to correct twice.
  const coverageLine = shown.stdout
    .split("\n")
    .find((line) => line.includes("coverage: adapter=terminal-cli-dispatch"));
  assert.ok(coverageLine !== undefined, "the terminal adapter's coverage block must render");
  const [supportedHalf, omittedHalf] = coverageLine.split(" omitted=");
  assert.ok(supportedHalf?.includes("field:parent_visit_id"), "parent links are emitted, so they must be SUPPORTED");
  assert.ok(!omittedHalf?.includes("field:parent_visit_id"), "a render may not deny a field it produces");
});

// ---------------------------------------------------------------------------
// LEGS 7-10 WERE DELETED HERE BY ADR-0464 D1, WITH THE CAPABILITIES THEY PROVED.
//
// They were, in order: an artifact read records the branches not taken (`artifact-offer-candidate-sets`);
// a follow-up carrying the offer id declares its edge while a bare read declares none
// (`offer-follow-edges`); a real replay draws the branches not taken (`decision-point-playback`); and a
// real replay states how much of each offer set it could not see (`offer-observability-share`).
//
// All four proved behaviour of the citation-derived offer surface, which is retired. They are DELETED
// rather than kept and skipped, because every one of them was written against a REAL spawned CLI and
// would otherwise have gone on running against a population that is now empty by construction —
// asserting `candidateSets.length === 1` would have failed loudly (fine), but their NEGATIVE halves
// ("a session that recorded no offer renders no block at all") would have PASSED while verifying
// nothing at all. A leg whose negative half survives its positive half is worse than a deleted leg:
// it keeps a green tick beside a capability that no longer exists.
//
// The story's UAT criteria for those four legs are retired in the same landing (`stories/
// context-traversal-capture/story.md`), so the signed proof record and the suite agree about what is
// still claimed. Legs 1-6 above are UNTOUCHED and still cover the surviving capabilities: the sink,
// the observer's allowlist, revisit links, the opt-out-clean envelope, context-window keying, and the
// agent-ref descent.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// 6. a-declared-session-origin-reaches-the-trace-and-an-undeclared-one-reads-unknown
// ---------------------------------------------------------------------------

test("a-declared-session-origin-reaches-the-trace-and-an-undeclared-one-reads-unknown: a real spawned declaration stamps every later read, and the replay says so", () => {
  const dir = freshDir("contract6");
  const sessionId = "session-contract6";
  const env = { ...baseEnv(), STORYTREE_TRAVERSAL_DIR: dir, STORYTREE_SESSION_ID: sessionId };

  // A read BEFORE the session declares anything: nobody has said how this session came to exist.
  const before = runCli(["library", "artifact", "plan"], env);
  assert.equal(before.status, 0, `expected the pre-declaration read to exit 0: ${before.stderr}`);
  assert.equal(
    readTraversalSession({ dir, sessionId }).origin.reading,
    "unknown",
    "an undeclared session reads UNKNOWN — never human, which is the assumption ADR-0484 D7 removes",
  );

  // The declaration, run as a real command exactly as a cut session's brief would tell it to.
  const declared = runCli(
    ["traversal", "origin", "--cut-by", "the-predecessor", "--cut-for", "linked-session-context-arc"],
    env,
  );
  assert.equal(declared.status, 0, `expected the declaration to exit 0: ${declared.stderr}`);
  assert.match(declared.stdout, /origin:  cut/);

  // ...and the NEXT read carries it, through the real capture path in a real process.
  const after = runCli(["tree", "context-traversal-telemetry"], env);
  assert.equal(after.status, 0, `expected the post-declaration read to exit 0: ${after.stderr}`);

  const read = readTraversalSession({ dir, sessionId });
  assert.equal(read.origin.reading, "cut");
  assert.deepEqual(read.origin.cutBy, ["the-predecessor"]);
  assert.deepEqual(read.origin.cutFor, ["linked-session-context-arc"]);

  // The bytes carry it per line, not in a header — the same rule `grade` follows, and the reason a
  // crash-truncated trace still says who started the session.
  const raw = fs.readFileSync(path.join(dir, `${sessionId}.jsonl`), "utf8").trim().split("\n");
  const stamped = raw.filter((line) => line.includes('"origin":"cut"'));
  assert.equal(stamped.length >= 1, true, "the post-declaration line carries the origin");
  assert.equal(
    stamped.length < raw.length,
    true,
    "and the PRE-declaration line does not — an origin applies forward, never backwards",
  );

  // Finally the surface a reader actually meets states it, rather than leaving the reads to be
  // attributed to an operator's prompt.
  const shown = runCli(["traversal", "show", sessionId], env);
  assert.equal(shown.status, 0, `expected the replay to exit 0: ${shown.stderr}`);
  assert.match(shown.stdout, /origin: cut —/);
  assert.match(shown.stdout, /cut by: the-predecessor/);
});
