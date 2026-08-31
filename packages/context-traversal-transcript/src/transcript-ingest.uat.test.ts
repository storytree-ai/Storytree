/**
 * Story `context-traversal-transcript` UAT (ADR-0235 / ADR-0241 / ADR-0248 D1).
 *
 * This is the story's standing machine UAT: it spawns the REAL `storytree` CLI entry
 * (`node packages/cli/launch.mjs traversal ingest <sessionId>`) as a child process — never an
 * in-process call, never a composed object asserted about directly — so "production reads the host
 * transcript and writes the occupancy series" is an OBSERVATION of a process that has already
 * exited, not a claim.
 *
 * Both env overrides are load-bearing rather than convenient. Without `STORYTREE_TRANSCRIPT_DIR`
 * the spawned CLI would read the DEVELOPER'S OWN `~/.claude/projects`, which is neither
 * deterministic nor safe to assert against in CI; without `STORYTREE_TRAVERSAL_DIR` it would write
 * into the real `~/.storytree/traces`. Every run is OFFLINE — no `--pg`, no DB, no API key, no
 * model — which is exactly why ADR-0243 does not apply to this adapter: reading a local file is
 * free and credential-free, so the honest machine leg that ADR-0243 has to work for is simply
 * available here (ADR-0248's Decision records that correction).
 *
 * UAT legs covered (`stories/context-traversal-transcript/story.md`), all bound to
 * `context-traversal-transcript#gate-1`:
 *   1. A real spawned ingest writes a falling occupancy series.
 *   2. Occupancy is the resident total, not the billing total.
 *   3. Two windows in one session stay two windows.
 *   4. A foreign session's transcript is never correlated.
 *   5. Re-ingesting the same transcripts appends nothing.
 *   6. No transcript content reaches the trace.
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

import type { ContextTraversalEvent, ModelContextEvent } from "@storytree/context-traversal-telemetry";

import { readTraversalSession } from "@storytree/context-traversal-capture";

const LAUNCHER = fileURLToPath(new URL("../../cli/launch.mjs", import.meta.url));

const SESSION = "uat-transcript-session";
const WINDOW_A = "host-window-a-0000";
const WINDOW_B = "host-window-b-1111";
const CANARY = "PINEAPPLE-OWNER-PROSE-9f81a1";

interface CliResult {
  readonly status: number | null;
  readonly stdout: string;
  readonly stderr: string;
}

/**
 * The node binary, NAMED rather than inferred from whatever runtime happens to run this suite.
 *
 * Production is node — `pnpm storytree …` resolves to `node packages/cli/launch.mjs` — so a UAT
 * whose whole point is spawning the REAL CLI entry has to spawn it under node. `process.execPath`
 * means "the current runtime", which is node only while this package's own test script is
 * `node --test`. Under bun it silently becomes bun, and `bun packages/cli/launch.mjs` RUNS
 * (measured, `bun-runtime-migration-arc` inc-06) — so this suite would keep passing while
 * observing a program production never executes, with tsx's ESM loader and node's compile cache
 * bypassed. A green that exercised the wrong binary is worse than a red, so the binary is named
 * here rather than left to whoever chose the runner.
 */
let cachedNodeExecutable: string | undefined;
function nodeExecutable(): string {
  if (cachedNodeExecutable !== undefined) return cachedNodeExecutable;
  if (process.versions["bun"] === undefined) return (cachedNodeExecutable = process.execPath);
  const fromPackageManager = process.env["npm_node_execpath"];
  if (fromPackageManager !== undefined && fromPackageManager !== "") {
    return (cachedNodeExecutable = fromPackageManager);
  }
  const lookup = spawnSync(process.platform === "win32" ? "where" : "which", ["node"], {
    encoding: "utf8",
  });
  const first = (lookup.stdout ?? "").split(/\r?\n/).find((line) => line.trim() !== "");
  if (lookup.status !== 0 || first === undefined) {
    throw new Error(
      "this UAT spawns the production CLI under node, but no node binary was found on PATH " +
        `(runtime is bun ${String(process.versions["bun"])}) — it must not silently fall back ` +
        "to the runner, which would observe a program production never executes",
    );
  }
  return (cachedNodeExecutable = first.trim());
}

function runCli(args: readonly string[], env: NodeJS.ProcessEnv): CliResult {
  const res = spawnSync(nodeExecutable(), [LAUNCHER, ...args], { encoding: "utf8", env });
  return { status: res.status, stdout: res.stdout ?? "", stderr: res.stderr ?? "" };
}

/** Ambient env with every override this suite controls stripped, so the host machine cannot leak in.
 * `CLAUDE_CODE_SESSION_ID` joined the list when trace identity became the host context WINDOW
 * (`linked-session-context-arc-inc-30`): it is set on every process a Claude Code session spawns, so
 * leaving it would let the RUNNING session's id key a child's trace. */
function baseEnv(): NodeJS.ProcessEnv {
  const {
    STORYTREE_TRAVERSAL_DIR: _traceDir,
    STORYTREE_TRANSCRIPT_DIR: _transcriptDir,
    STORYTREE_SESSION_ID: _session,
    STORYTREE_TRAVERSAL: _toggle,
    CLAUDE_CODE_SESSION_ID: _window,
    ...rest
  } = process.env;
  return rest;
}

interface RequestSpec {
  readonly id: string;
  readonly at: string;
  readonly input: number;
  readonly cacheRead: number;
  readonly cacheWrite: number;
  readonly model?: string;
  readonly sidechain?: boolean;
  /** Emit the same line twice — one model request written as several transcript lines. */
  readonly repeatLine?: boolean;
}

/** One host transcript line, shaped exactly like the harness writes it, canary prose included. */
function assistantLine(windowId: string, cwd: string, spec: RequestSpec): string {
  return JSON.stringify({
    type: "assistant",
    uuid: `${spec.id}-uuid`,
    sessionId: windowId,
    timestamp: spec.at,
    cwd,
    gitBranch: `claude/${CANARY}`,
    isSidechain: spec.sidechain === true,
    message: {
      id: spec.id,
      model: spec.model ?? "claude-opus-5",
      content: [
        { type: "text", text: `owner prose that must never be recorded: ${CANARY}` },
        { type: "tool_use", name: "Bash", input: { command: `echo ${CANARY}` } },
      ],
      usage: {
        input_tokens: spec.input,
        cache_read_input_tokens: spec.cacheRead,
        cache_creation_input_tokens: spec.cacheWrite,
        output_tokens: 512,
      },
    },
  });
}

function writeTranscript(file: string, windowId: string, cwd: string, specs: readonly RequestSpec[]): void {
  const lines: string[] = [
    JSON.stringify({ type: "user", sessionId: windowId, timestamp: specs[0]?.at, cwd, content: CANARY }),
  ];
  for (const spec of specs) {
    const line = assistantLine(windowId, cwd, spec);
    lines.push(line);
    if (spec.repeatLine === true) lines.push(line);
  }
  lines.push(JSON.stringify({ type: "user", sessionId: windowId, timestamp: specs[0]?.at, cwd, toolUseResult: CANARY }));
  fs.writeFileSync(file, `${lines.join("\n")}\n`, "utf8");
}

/**
 * Window A: four parent requests whose resident totals RISE then FALL, plus one sidechain request
 * carrying a total larger than any of them, plus one request written as a repeated line.
 *
 * The fourth request is the cache-read-dominant one (leg 2): input 2 against 32,920 cache-read, so
 * an implementation reading `input_tokens` alone lands four orders of magnitude away from 67,723.
 */
const WINDOW_A_REQUESTS: readonly RequestSpec[] = [
  { id: "msg_a1", at: "2026-07-27T01:00:00.000Z", input: 100, cacheRead: 39_900, cacheWrite: 0 },
  { id: "msg_a2", at: "2026-07-27T01:05:00.000Z", input: 900, cacheRead: 200_000, cacheWrite: 40_000, repeatLine: true },
  { id: "msg_a3", at: "2026-07-27T01:10:00.000Z", input: 100, cacheRead: 220_000, cacheWrite: 8_000 },
  { id: "msg_sc", at: "2026-07-27T01:12:00.000Z", input: 9, cacheRead: 999_000, cacheWrite: 990, sidechain: true },
  { id: "msg_a4", at: "2026-07-27T01:15:00.000Z", input: 2, cacheRead: 32_920, cacheWrite: 34_801 },
];
const WINDOW_A_RESIDENT = [40_000, 240_900, 228_100, 67_723];
const WINDOW_A_CUMULATIVE = [40_000, 280_900, 509_000, 576_723];

const WINDOW_B_REQUESTS: readonly RequestSpec[] = [
  { id: "msg_b1", at: "2026-07-27T03:00:00.000Z", input: 0, cacheRead: 5_000, cacheWrite: 0 },
  { id: "msg_b2", at: "2026-07-27T03:05:00.000Z", input: 0, cacheRead: 10_000, cacheWrite: 5_000 },
];
const WINDOW_B_RESIDENT = [5_000, 15_000];
const WINDOW_B_CUMULATIVE = [5_000, 20_000];

interface Fixture {
  readonly traceDir: string;
  readonly transcriptDir: string;
  /**
   * The trace file each correlated WINDOW is written to. There is no session-keyed file any more
   * (`linked-session-context-arc-inc-32`): occupancy is keyed by the context window it was read
   * from, which is the identity the terminal-CLI read trace already uses, so a window's replay
   * carries both its reads and its occupancy instead of the two landing in different files.
   */
  readonly windowTraceFiles: readonly string[];
  /** The file the OLD session-keyed shape wrote, kept only so a leg can assert it is not there. */
  readonly legacySessionTraceFile: string;
  readonly env: NodeJS.ProcessEnv;
}

/**
 * Builds a temporary transcript root holding four transcripts: two written inside the target
 * session's worktree (two separate host windows) and two that must NEVER correlate — one from the
 * main checkout, one from a worktree whose name has the session id as a strict prefix.
 */
function buildFixture(): Fixture {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "transcript-uat-"));
  const traceDir = path.join(root, "traces");
  const transcriptDir = path.join(root, "projects");
  const checkout = path.join(root, "checkout");
  const worktree = path.join(checkout, ".claude", "worktrees", SESSION);
  const prefixWorktree = path.join(checkout, ".claude", "worktrees", `${SESSION}-extra`);

  const projectA = path.join(transcriptDir, "proj-a");
  const projectB = path.join(transcriptDir, "proj-b");
  fs.mkdirSync(projectA, { recursive: true });
  fs.mkdirSync(projectB, { recursive: true });

  // Filenames deliberately differ from the recorded host session ids: `windowId` must come from the
  // DATA, never from the basename.
  writeTranscript(path.join(projectA, "zzz-first.jsonl"), WINDOW_A, worktree, WINDOW_A_REQUESTS);
  writeTranscript(path.join(projectA, "aaa-second.jsonl"), WINDOW_B, worktree, WINDOW_B_REQUESTS);
  writeTranscript(path.join(projectB, "main-checkout.jsonl"), "host-window-main", checkout, WINDOW_B_REQUESTS);
  writeTranscript(path.join(projectB, "prefix.jsonl"), "host-window-prefix", prefixWorktree, WINDOW_B_REQUESTS);

  return {
    traceDir,
    transcriptDir,
    windowTraceFiles: [path.join(traceDir, `${WINDOW_A}.jsonl`), path.join(traceDir, `${WINDOW_B}.jsonl`)],
    legacySessionTraceFile: path.join(traceDir, `${SESSION}.jsonl`),
    env: { ...baseEnv(), STORYTREE_TRAVERSAL_DIR: traceDir, STORYTREE_TRANSCRIPT_DIR: transcriptDir },
  };
}

/** Every trace line the ingest wrote, across every window file — the bytes, not a parsed replay. */
function allWindowTraceLines(fixture: Fixture): string[] {
  return fixture.windowTraceFiles.flatMap((file) =>
    fs
      .readFileSync(file, "utf8")
      .split("\n")
      .filter((line) => line.trim() !== ""),
  );
}

function modelContextEvents(events: readonly ContextTraversalEvent[]): ModelContextEvent[] {
  return events.filter((event): event is ModelContextEvent => event.kind === "model_context");
}

function eventsFor(fixture: Fixture, windowId: string): ModelContextEvent[] {
  // Read the WINDOW's own trace. The `windowId` filter is kept deliberately even though the file
  // should now hold nothing else: it is what keeps this helper honest if a future adapter ever
  // writes a foreign window's event into a window's file.
  const { replay } = readTraversalSession({ dir: fixture.traceDir, sessionId: windowId });
  return modelContextEvents(replay.events).filter((event) => event.windowId === windowId);
}

test("a real spawned ingest writes a falling occupancy series, resident not billing, from a process that has exited (legs 1 + 2)", () => {
  const fixture = buildFixture();

  const res = runCli(["traversal", "ingest", SESSION], fixture.env);
  assert.equal(res.status, 0, `ingest exited ${res.status}: ${res.stderr}`);

  // Each correlated WINDOW is its own trace now, and the storytree session names no file at all.
  const traceA = readTraversalSession({ dir: fixture.traceDir, sessionId: WINDOW_A });
  const traceB = readTraversalSession({ dir: fixture.traceDir, sessionId: WINDOW_B });
  assert.equal(traceA.skipped, 0, "the trace the CLI wrote must replay with nothing skipped");
  assert.equal(traceB.skipped, 0, "the trace the CLI wrote must replay with nothing skipped");

  // Asserted as file EXISTENCE, because a reader over a MISSING file returns an empty replay just
  // as a genuinely empty one does — only existence separates "moved" from "wrote nothing".
  assert.equal(
    fs.existsSync(fixture.legacySessionTraceFile),
    false,
    "occupancy must no longer be written under the storytree session id",
  );

  // Each trace SAYS what its id names, from its lines' own grade rather than the id's shape: one
  // context window, with the storytree session recorded beside it as the grouping slot.
  assert.equal(traceA.identity, "window");
  assert.equal(traceB.identity, "window");
  assert.deepEqual(traceA.slots, [SESSION]);
  assert.deepEqual(traceB.slots, [SESSION]);

  // The `traversal` area is not on the terminal adapter's read allowlist, so the ONLY events in
  // these files are the ones the transcript adapter appended.
  for (const { replay } of [traceA, traceB]) {
    assert.equal(
      replay.events.length,
      modelContextEvents(replay.events).length,
      "the trace must hold model_context events and nothing else",
    );
  }

  const windowA = eventsFor(fixture, WINDOW_A);
  // One event per REQUEST, not per line: `msg_a2` was written twice, and the sidechain request is
  // somebody else's window.
  assert.deepEqual(
    windowA.map((event) => event.residentInputTokens),
    WINDOW_A_RESIDENT,
  );

  // Leg 1's whole point: the series is NOT monotonically non-decreasing. A billing total could
  // never draw this — the owner-approved reference trace recedes exactly this way.
  const fell = WINDOW_A_RESIDENT.some((value, index) => index > 0 && value < (WINDOW_A_RESIDENT[index - 1] ?? 0));
  assert.equal(fell, true, "fixture sanity: the resident series must fall");
  const observedFall = windowA.some(
    (event, index) => index > 0 && (event.residentInputTokens ?? 0) < (windowA[index - 1]?.residentInputTokens ?? 0),
  );
  assert.equal(observedFall, true, "the persisted occupancy series must be able to fall");

  // Leg 2: the cache-read-dominant request. 2 + 32,920 + 34,801 = 67,723 — never `input_tokens`.
  const dominant = windowA[3];
  assert.notEqual(dominant, undefined);
  assert.equal(dominant?.residentInputTokens, 67_723);
  assert.equal(dominant?.cumulativeInputTokens, 576_723);
  assert.ok(
    (dominant?.cumulativeInputTokens ?? 0) > (dominant?.residentInputTokens ?? 0),
    "the running billing total must exceed the request's own resident total",
  );
  assert.deepEqual(
    windowA.map((event) => event.cumulativeInputTokens),
    WINDOW_A_CUMULATIVE,
  );

  // Capacity is RUNTIME-DECLARED (ADR-0235 clause 4) and a transcript declares none: the key must
  // be absent on the BYTES, not merely falsy in memory.
  for (const line of allWindowTraceLines(fixture)) {
    const parsed = JSON.parse(line) as { event: Record<string, unknown> };
    assert.equal("contextWindowCapacity" in parsed.event, false, "no capacity may be invented at this boundary");
  }

  // The envelope reports the sidechain exclusion rather than hiding it (ADR-0235 clause 6).
  assert.match(res.stdout, /excluded 1 sidechain request\(s\)/);
  assert.match(res.stdout, /coverage: adapter=host-transcript/);

  fs.rmSync(path.dirname(fixture.traceDir), { recursive: true, force: true });
});

test("two host windows under one session stay two windows, each with its own running total (leg 3)", () => {
  const fixture = buildFixture();

  const res = runCli(["traversal", "ingest", SESSION], fixture.env);
  assert.equal(res.status, 0, `ingest exited ${res.status}: ${res.stderr}`);

  const all = [...eventsFor(fixture, WINDOW_A), ...eventsFor(fixture, WINDOW_B)];
  assert.equal(all.length, WINDOW_A_RESIDENT.length + WINDOW_B_RESIDENT.length);

  // Two windows stay two windows — and since inc-32 they are separated BY FILE, each event carrying
  // its own window as its SESSION rather than the worktree slot they were found through. The slot
  // is not lost: it rides along as the grouping attribute, which is what still makes them "under
  // one session" for anyone who asks that question.
  for (const event of all) {
    assert.equal(event.sessionId, event.windowId, "a window's events are keyed by that window");
    assert.notEqual(event.windowId, undefined, "an observation with no window would be an unreadable bar");
  }
  const windowIds = new Set(all.map((event) => event.windowId));
  assert.deepEqual([...windowIds].sort(), [WINDOW_A, WINDOW_B].sort());

  // The separation is real on disk, not merely a field: two files, and no session-keyed file.
  for (const file of fixture.windowTraceFiles) assert.equal(fs.existsSync(file), true);
  assert.equal(fs.existsSync(fixture.legacySessionTraceFile), false);
  for (const windowId of [WINDOW_A, WINDOW_B]) {
    assert.deepEqual(readTraversalSession({ dir: fixture.traceDir, sessionId: windowId }).slots, [SESSION]);
  }

  // Window B's running total restarts from its own first request — it never continues window A's
  // 576,723. A worktree-derived session id outlives any single runtime window, so concatenating
  // them would draw a bar that resets without explanation.
  assert.deepEqual(
    eventsFor(fixture, WINDOW_B).map((event) => event.cumulativeInputTokens),
    WINDOW_B_CUMULATIVE,
  );
  assert.deepEqual(
    eventsFor(fixture, WINDOW_B).map((event) => event.residentInputTokens),
    WINDOW_B_RESIDENT,
  );

  assert.match(res.stdout, /correlated 2 window\(s\)/);

  fs.rmSync(path.dirname(fixture.traceDir), { recursive: true, force: true });
});

test("a main-checkout transcript and a prefix-named worktree are scanned and never correlated (leg 4)", () => {
  const fixture = buildFixture();

  const res = runCli(["traversal", "ingest", SESSION], fixture.env);
  assert.equal(res.status, 0, `ingest exited ${res.status}: ${res.stderr}`);

  // ⚠ THIS LEG MUST NOT BE READ THROUGH A SESSION-KEYED TRACE. It used to replay
  // `sessionId: SESSION` and assert the foreign windows were absent from it — and once inc-32 moved
  // occupancy onto window keys, that file stopped existing, so the read returned an empty replay and
  // the two assertions below passed while verifying NOTHING. The leg was still green at the moment
  // it went blind, which is exactly the fault class this arc keeps finding in its own instruments.
  //
  // The honest question is about FILES: an uncorrelated transcript must produce no trace of its own,
  // and must not have leaked into either correlated window's trace.
  for (const foreign of ["host-window-main", "host-window-prefix"]) {
    assert.equal(
      fs.existsSync(path.join(fixture.traceDir, `${foreign}.jsonl`)),
      false,
      `${foreign} must never correlate, so it must never get a trace`,
    );
  }
  const windowIds = new Set([...eventsFor(fixture, WINDOW_A), ...eventsFor(fixture, WINDOW_B)].map((e) => e.windowId));
  assert.deepEqual([...windowIds].sort(), [WINDOW_A, WINDOW_B].sort());

  // The directory holds the two correlated windows and nothing else — so a future adapter cannot
  // quietly add a third file here and leave this leg reporting a clean separation. The set is
  // spelled WHOLE rather than filtered to `.jsonl`, which is what keeps that teeth.
  //
  // Three `.ingest.json` RECEIPTS joined it with ADR-0484 D5: the ingest stamps the trace the caller
  // asked about and every window the series landed in, so a later replay can tell a MEASURED zero
  // from a session nobody ever ingested. They are sidecars, not traces — note there is still no
  // `${SESSION}.jsonl`, which is the inc-32 property this leg exists to hold.
  assert.deepEqual(
    fs.readdirSync(fixture.traceDir).sort(),
    [
      `${WINDOW_A}.jsonl`,
      `${WINDOW_B}.jsonl`,
      `${SESSION}.ingest.json`,
      `${WINDOW_A}.ingest.json`,
      `${WINDOW_B}.ingest.json`,
    ].sort(),
  );

  // The denominator is what makes "2 of 4" honest rather than indistinguishable from "nothing to
  // scan": an uncorrelated file is REPORTED, never silently dropped.
  assert.match(res.stdout, /scanned 4 transcript file\(s\); correlated 2 window\(s\)/);

  // A session with no correlated transcript at all is a normal, quiet result — not an error.
  const stranger = runCli(["traversal", "ingest", "some-other-session"], fixture.env);
  assert.equal(stranger.status, 0);
  assert.match(stranger.stdout, /scanned 4 transcript file\(s\); correlated 0 window\(s\)/);
  assert.match(stranger.stdout, /appended 0 occupancy event\(s\)/);
  assert.equal(fs.existsSync(path.join(fixture.traceDir, "some-other-session.jsonl")), false);
  // …and it IS stamped as measured (ADR-0484 D5 deliverable 4). No event was written, so without the
  // receipt this quiet-but-real result would be indistinguishable from a session nobody ever ingested.
  assert.equal(fs.existsSync(path.join(fixture.traceDir, "some-other-session.ingest.json")), true);

  fs.rmSync(path.dirname(fixture.traceDir), { recursive: true, force: true });
});

test("re-ingesting the same transcripts appends no bytes, and a new request appends exactly one (leg 5)", () => {
  const fixture = buildFixture();

  const first = runCli(["traversal", "ingest", SESSION], fixture.env);
  assert.equal(first.status, 0, `first ingest exited ${first.status}: ${first.stderr}`);
  // Summed across EVERY window file: idempotence is now a property of each window's own trace, so
  // asserting one file would leave the other unguarded.
  const bytesOf = (): number => fixture.windowTraceFiles.reduce((sum, file) => sum + fs.statSync(file).size, 0);
  const countOf = (): number =>
    [WINDOW_A, WINDOW_B].reduce(
      (sum, windowId) =>
        sum + readTraversalSession({ dir: fixture.traceDir, sessionId: windowId }).replay.events.length,
      0,
    );
  const bytesAfterFirst = bytesOf();
  const countAfterFirst = countOf();

  const second = runCli(["traversal", "ingest", SESSION], fixture.env);
  assert.equal(second.status, 0, `second ingest exited ${second.status}: ${second.stderr}`);
  assert.match(second.stdout, /appended 0 occupancy event\(s\)/);

  // BYTE length, not event count: an implementation that appends duplicates and leans on the sink's
  // tolerant reader to skip them would report an unchanged count while the file silently doubled.
  assert.equal(bytesOf(), bytesAfterFirst, "a re-ingest must append no bytes");
  assert.equal(countOf(), countAfterFirst);

  // One genuinely new request appends exactly one event — idempotence is not staleness.
  const grown = [
    ...WINDOW_A_REQUESTS,
    { id: "msg_a5", at: "2026-07-27T01:20:00.000Z", input: 10, cacheRead: 1_000, cacheWrite: 0 },
  ];
  const worktree = path.join(path.dirname(fixture.traceDir), "checkout", ".claude", "worktrees", SESSION);
  writeTranscript(path.join(fixture.transcriptDir, "proj-a", "zzz-first.jsonl"), WINDOW_A, worktree, grown);

  const third = runCli(["traversal", "ingest", SESSION], fixture.env);
  assert.equal(third.status, 0, `third ingest exited ${third.status}: ${third.stderr}`);
  assert.match(third.stdout, /appended 1 occupancy event\(s\)/);
  assert.equal(countOf(), countAfterFirst + 1);
  // …and it lands in the window that grew, not in the other one.
  assert.equal(eventsFor(fixture, WINDOW_A).length, WINDOW_A_RESIDENT.length + 1);
  assert.equal(eventsFor(fixture, WINDOW_B).length, WINDOW_B_RESIDENT.length);

  fs.rmSync(path.dirname(fixture.traceDir), { recursive: true, force: true });
});

test("no transcript content reaches the trace bytes or the rendered envelope (leg 6)", () => {
  const fixture = buildFixture();

  const res = runCli(["traversal", "ingest", SESSION], fixture.env);
  assert.equal(res.status, 0, `ingest exited ${res.status}: ${res.stderr}`);

  // ADR-0235 clause 6 asserted on the BYTES, exactly as increment 2 asserts it: message text, a
  // tool-use input, a tool result, a user line, and the recorded git branch all carried the canary.
  // Across EVERY window file — checking one would leave the other's bytes unread, and the canary
  // only has to leak once.
  for (const file of fixture.windowTraceFiles) {
    const raw = fs.readFileSync(file, "utf8");
    assert.equal(raw.includes(CANARY), false, "no owner prose may reach the trace file");
    // The trace is not empty — an adapter that wrote nothing would pass a canary check vacuously.
    assert.ok(raw.length > 0);
  }
  assert.equal(res.stdout.includes(CANARY), false, "no owner prose may reach the rendered envelope");

  assert.equal(
    eventsFor(fixture, WINDOW_A).length + eventsFor(fixture, WINDOW_B).length,
    WINDOW_A_RESIDENT.length + WINDOW_B_RESIDENT.length,
  );

  fs.rmSync(path.dirname(fixture.traceDir), { recursive: true, force: true });
});
