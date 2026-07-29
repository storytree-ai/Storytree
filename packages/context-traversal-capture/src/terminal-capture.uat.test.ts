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
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

import { isContextVisitEvent } from "@storytree/context-traversal-telemetry";
import type { ContextTraversalEvent, ContextVisitEvent } from "@storytree/context-traversal-telemetry";

import { OFFER_FLAG } from "./follow-offer-edges.js";
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

/** The `candidate_set` events of a replay, in order. */
function candidateSetsOf(
  events: readonly ContextTraversalEvent[],
): Extract<ContextTraversalEvent, { kind: "candidate_set" }>[] {
  return events.filter(
    (event): event is Extract<ContextTraversalEvent, { kind: "candidate_set" }> =>
      event.kind === "candidate_set",
  );
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

  // ADR-0260 D3 CHANGED THE AGENT-FACING SURFACE, deliberately, and this leg is where that cost is
  // paid rather than worked around. A render that records an offer also PRINTS follow-up commands
  // carrying that offer's id, and the id is a fresh visit id per invocation — so "byte-identical"
  // can no longer mean the whole stdout, not even between two capture-ON runs of the same command.
  //
  // What the leg was ALWAYS claiming is that opting out changes nothing an agent depends on. That
  // splits cleanly in two, and both halves are asserted below: the command's own PAYLOAD is
  // byte-identical whatever capture does, and the offer-carrying lines appear ONLY where an offer is
  // genuinely recorded — never on a run that captures nothing, which would be an id naming a
  // candidate set that does not exist. Together those two ARE ADR-0241 **D2**'s opt-out-clean
  // envelope, intact. (D2 is the clause this leg pins; D3's envelope promise is the narrower one that
  // no telemetry FAILURE may alter an envelope, which an opted-out run never engages. ADR-0241's own
  // Consequences make that split — don't re-file this leg under D3.) Comparing the payloads rather
  // than tuning a fixture is the honest repair: the claim did not move, the surface underneath it did.
  const OFFER_LINE = ` ${OFFER_FLAG} `;
  const payloadOf = (stdout: string): string =>
    stdout
      .split("\n")
      .filter((line) => !line.includes(OFFER_LINE))
      .join("\n");
  const offerLinesOf = (stdout: string): string[] =>
    stdout.split("\n").filter((line) => line.includes(OFFER_LINE));

  // Variant CAPTURED: capture unambiguously ON — an explicit session id and a real trace directory,
  // so this run's behaviour does not depend on whether the test's own cwd happens to be a worktree
  // slot (see variant B's note on that trap). This is the run that MUST carry offer lines.
  const onDir = freshDir("contract5-on");
  const onResult = runCli(args, {
    ...baseEnv(),
    STORYTREE_TRAVERSAL_DIR: onDir,
    STORYTREE_SESSION_ID: "session-contract5-on",
  });
  assert.equal(onResult.status, 0, `expected the captured read to exit 0: ${onResult.stderr}`);
  assert.ok(
    offerLinesOf(onResult.stdout).length > 0,
    "a run that records an offer MUST print the follow-up commands carrying its id (ADR-0260 D3)",
  );
  assert.equal(
    payloadOf(onResult.stdout),
    payloadOf(baseline.stdout),
    "capture adds follow-up lines and NOTHING else — the command's own payload is untouched",
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
    payloadOf(offResult.stdout),
    payloadOf(baseline.stdout),
    "STORYTREE_TRAVERSAL=off must not change the envelope's payload",
  );
  assert.deepEqual(
    offerLinesOf(offResult.stdout),
    [],
    "an opted-out run records no offer, so it must print no offer id — a printed id nothing recorded " +
      "is an id an agent can return that names a candidate set which never existed",
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
    payloadOf(noIdResult.stdout),
    payloadOf(baseline.stdout),
    "an unresolved identity must not change the envelope's payload",
  );
  assert.deepEqual(
    offerLinesOf(noIdResult.stdout),
    [],
    "an uninstrumented run records no offer, so it must print no offer id either",
  );
  assert.deepEqual(listDir(noIdDir), [], "an unresolved identity must create no trace file");
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
  // The `agents` surface renders no Sources block, so it offers nothing and records no candidate set
  // — stated rather than assumed, since this leg indexes positionally into the trace below.
  assert.deepEqual(candidateSetsOf(replay.events), [], "an agents render offers nothing to record");

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
// 7. a real artifact read records the branches it did NOT take
// ---------------------------------------------------------------------------

test("an-artifact-read-records-the-branches-not-taken: a real spawned `library artifact <id>` leaves a candidate_set naming every offered id, followed or not", () => {
  const dir = freshDir("contract7");
  const sessionId = "session-contract7";
  const env = { ...baseEnv(), STORYTREE_TRAVERSAL_DIR: dir, STORYTREE_SESSION_ID: sessionId };

  // ONE invocation, and nothing after it. Whatever this read offered, nothing in this session ever
  // follows — which is the whole point: ADR-0260 D2 records the offer at RENDER time, so the branches
  // not taken exist in the telemetry precisely because they were recorded when they were offered.
  const result = runCli(["library", "artifact", "plan"], env);
  assert.equal(result.status, 0, `expected the spawned read to exit 0: ${result.stderr}`);

  const { replay, skipped } = readTraversalSession({ dir, sessionId });
  assert.equal(skipped, 0);

  const visits = visitsOf(replay.events);
  assert.equal(visits.length, 1, "one read is one visit");
  const renderVisit = expectVisit(visits[0], "the rendering visit");

  const candidateSets = candidateSetsOf(replay.events);
  assert.equal(candidateSets.length, 1, "the render must record exactly one offer");
  const offer = candidateSets[0];
  assert.ok(offer !== undefined, "expected the recorded offer");

  // The offer is joinable to the render that made it — by an id carried on the event, never by
  // adjacency or timestamp proximity (ADR-0235 clause 3).
  assert.ok(
    offer.candidateSetId.includes(renderVisit.visitId),
    `expected candidateSetId ${offer.candidateSetId} to name visit ${renderVisit.visitId}`,
  );
  assert.equal(offer.surfaceId, "library-artifact");

  // The recorded ids are the artifact's REAL authored refs, read independently of the traversal that
  // produced them — the arc's own closing condition. `plan` carries four, and the `doc:` one is kept
  // prefix-and-all because an ADR file has no canonical Library node to be visited.
  assert.deepEqual(
    [...offer.candidateNodeIds],
    [
      "doc:decisions/0183-arcs-contain-plans-the-initiative-overlay-upstream-of-storie.md",
      "arc",
      "anchor-implementation-surface",
      "orchestrate-route-supplement",
    ],
    "every offered ref must be recorded, in authored order",
  );

  // THE D2 PIN, at the real boundary: not one of those four ids was ever visited in this session, and
  // all four are on the record anyway. An implementation that emitted offers lazily — only once
  // something followed — would leave this trace with NO candidate set at all, and would still pass
  // every other assertion in this file.
  const visitedNodeIds = new Set(visits.map((visit) => visit.nodeId));
  const neverFollowed = offer.candidateNodeIds.filter((id) => !visitedNodeIds.has(id));
  assert.deepEqual(
    [...neverFollowed],
    [...offer.candidateNodeIds],
    "every recorded offer must be a branch this session did not take",
  );

  // The RENDER must show what the trace carries, and must not deny it.
  const shown = runCli(["traversal", "show", sessionId], env);
  assert.equal(shown.status, 0, `expected traversal show to exit 0: ${shown.stderr}`);
  assert.ok(
    shown.stdout.includes(`[candidate-set] set=${offer.candidateSetId} surface=library-artifact candidates=4`),
    "the rendered body must name the recorded offer and how many artifacts were on the table",
  );

  const coverageLine = shown.stdout
    .split("\n")
    .find((line) => line.includes("coverage: adapter=terminal-cli-dispatch"));
  assert.ok(coverageLine !== undefined, "the terminal adapter's coverage block must render");
  const [supportedHalf, omittedHalf] = coverageLine.split(" omitted=");
  assert.ok(supportedHalf?.includes("event:candidate_set"), "offers are emitted, so they must be SUPPORTED");
  assert.ok(!omittedHalf?.includes("event:candidate_set"), "a render may not deny an event it produces");
  // ...and it must still deny what it genuinely cannot see. This adapter observes no model at all,
  // so claiming a token or capacity field here would be the inverse dishonesty. (`followed_edge` and
  // `field:candidate_follow_causality` were pinned here until ADR-0260 D3's producer landed; leg 8
  // below now holds them on the SUPPORTED side, against a trace that visibly carries an edge.)
  assert.ok(omittedHalf?.includes("event:model_context"), "the CLI boundary sees no model request");
  assert.ok(
    omittedHalf?.includes("field:context_window_capacity"),
    "the CLI boundary declares no window capacity",
  );

  // ADR-0260 D7: both gaps must be visible in the same body, because D4 forbids ever repairing them
  // by inference. A tidy-looking tree that never states what it cannot show is the failure mode.
  assert.match(shown.stdout, /coverage-caveats:/, "the declaration must surface its caveats");
  assert.ok(
    shown.stdout.includes("doc-refs-are-offered-but-follows-are-unobservable"),
    "the `doc:` blind spot must be declared — it is the MAJORITY of a typical offer set",
  );
  assert.ok(
    shown.stdout.includes("follow-completeness-depends-on-the-offered-command-form"),
    "the behavioural dependency must be declared — it is a new class for this telemetry",
  );
});

// ---------------------------------------------------------------------------
// 8. a real followed command declares its edge, and a bare one declares none
// ---------------------------------------------------------------------------

test("a-followed-command-declares-its-edge-and-a-bare-one-declares-none: a real spawned follow-up carrying the offer id records the edge it answered, while a bare read of another offered node records none", () => {
  const dir = freshDir("contract8");
  const sessionId = "session-contract8";
  const env = { ...baseEnv(), STORYTREE_TRAVERSAL_DIR: dir, STORYTREE_SESSION_ID: sessionId };

  // 1. The OFFERING read. Its envelope must print pasteable follow-up commands carrying the id of
  //    the offer it is about to record — the whole of ADR-0260 D3's first half. The id is minted
  //    before the render and recorded after it, in one process, so this is also the only place the
  //    two halves can be proven to be the SAME id rather than two that merely look alike.
  const offering = runCli(["library", "artifact", "plan"], env);
  assert.equal(offering.status, 0, `expected the offering read to exit 0: ${offering.stderr}`);

  const followUp = offering.stdout
    .split("\n")
    .map((line) => line.trim())
    .find((line) => line.startsWith("- storytree library artifact arc --from-offer "));
  assert.ok(
    followUp !== undefined,
    `the render must print a pasteable follow-up carrying its offer id; got:\n${offering.stdout}`,
  );

  const followArgs = followUp.replace(/^- storytree /, "").split(" ");
  const printedOfferId = followArgs[followArgs.length - 1];
  assert.ok(printedOfferId !== undefined && printedOfferId.startsWith("candidate-set:"));

  const afterOffer = readTraversalSession({ dir, sessionId });
  const recordedOffer = candidateSetsOf(afterOffer.replay.events)[0];
  assert.ok(recordedOffer !== undefined, "the offering read must have recorded its offer");
  assert.equal(
    recordedOffer.candidateSetId,
    printedOfferId,
    "the id PRINTED on the follow-up command must be the id RECORDED for the offer — an id an agent " +
      "can return is the entire mechanism; two ids that merely look alike join nothing",
  );
  const offeringVisit = expectVisit(visitsOf(afterOffer.replay.events)[0], "the offering visit");

  // 2. The FOLLOW, run VERBATIM as an agent would paste it. Two separate OS processes with no shared
  //    memory: the second knows about the first only through the string on its own command line.
  const followed = runCli(followArgs, env);
  assert.equal(followed.status, 0, `expected the followed read to exit 0: ${followed.stderr}`);

  // 3. A BARE read of a DIFFERENT node the very same offer put on the table. This is ADR-0260 D3's
  //    refusal at the real boundary: the trace visibly contains a recent candidate set offering
  //    `anchor-implementation-surface`, which is exactly the join a recency-resolving implementation
  //    would make. Without the id on the command line there is no edge, and the missing edge is D4's
  //    accepted under-report — never repaired by correlating after the fact.
  const bare = runCli(["library", "artifact", "anchor-implementation-surface"], env);
  assert.equal(bare.status, 0, `expected the bare read to exit 0: ${bare.stderr}`);

  const { replay, skipped } = readTraversalSession({ dir, sessionId });
  assert.equal(skipped, 0);
  const visits = visitsOf(replay.events);
  assert.equal(visits.length, 3, "three reads, three visits");

  const answeringVisit = expectVisit(visits[1], "the answering visit");
  assert.equal(answeringVisit.nodeId, "arc");
  const bareVisit = expectVisit(visits[2], "the bare visit");
  assert.equal(bareVisit.nodeId, "anchor-implementation-surface");

  const edges = replay.events.filter(
    (event): event is Extract<ContextTraversalEvent, { kind: "followed_edge" }> =>
      event.kind === "followed_edge",
  );
  assert.equal(edges.length, 1, "exactly one read named an offer, so exactly one edge exists");
  const edge = edges[0];
  assert.ok(edge !== undefined);
  assert.equal(edge.candidateSetId, printedOfferId, "the edge names the offer the command line carried");
  assert.equal(edge.fromVisitId, offeringVisit.visitId, "…which resolves to the visit that offered it");
  assert.equal(edge.toVisitId, answeringVisit.visitId, "…and lands on the visit that answered it");
  assert.equal(
    answeringVisit.followedEdgeId,
    edge.edgeId,
    "the answering visit must itself carry the edge — an edge event beside an unstamped visit would " +
      "make `field:candidate_follow_causality` a claim the visit cannot support",
  );

  // THE D3 PIN at the real boundary: the bare read carries NO edge, though the trace plainly offered
  // its node moments earlier. If the key is present at all here, recency has crept back in.
  assert.equal(
    bareVisit.followedEdgeId,
    undefined,
    "a bare command answers nothing, even when a recent offer named the very node it read",
  );

  // A followed read is still a read: it records its OWN offer, so the chain continues past one hop.
  const offers = candidateSetsOf(replay.events);
  assert.equal(offers.length, 3, "every one of the three reads recorded the offer it printed");

  // 4. The RENDER must show the edge and must not deny the ability to see it.
  const shown = runCli(["traversal", "show", sessionId], env);
  assert.equal(shown.status, 0, `expected traversal show to exit 0: ${shown.stderr}`);
  assert.ok(
    shown.stdout.includes(
      `[followed-edge] edge=${edge.edgeId} from=${edge.fromVisitId} to=${edge.toVisitId}`,
    ),
    "the rendered body must draw the edge the trace carries",
  );

  const coverageLine = shown.stdout
    .split("\n")
    .find((line) => line.includes("coverage: adapter=terminal-cli-dispatch"));
  assert.ok(coverageLine !== undefined, "the terminal adapter's coverage block must render");
  const [supportedHalf, omittedHalf] = coverageLine.split(" omitted=");
  for (const feature of ["event:followed_edge", "field:candidate_follow_causality"]) {
    assert.ok(supportedHalf?.includes(feature), `${feature} now has a producer, so it must be SUPPORTED`);
    assert.ok(!omittedHalf?.includes(feature), `a render may not deny ${feature} on a trace carrying it`);
  }

  // ADR-0260 D7, sharpened: the command-form gap keeps its id but its note now says a BARE command
  // loses the edge outright, and D4's asymmetry is stated in the same body — because the tree this
  // trace draws is thin by design and a reader must be able to see why.
  for (const caveatId of [
    "doc-refs-are-offered-but-follows-are-unobservable",
    "follow-completeness-depends-on-the-offered-command-form",
    "an-unanswered-visit-and-a-bypassed-mechanism-are-indistinguishable",
  ]) {
    assert.ok(shown.stdout.includes(caveatId), `the declaration must surface caveat ${caveatId}`);
  }
});
