/**
 * Contract tests for the build spawn capture composition (story `context-traversal-spawn`,
 * capability `build-spawn-capture`, ADR-0235 / ADR-0241 / ADR-0192).
 *
 * Real-collaborator integration: every fixture is exercised end to end through the actual
 * `@storytree/context-traversal-capture` sink into a fresh temporary directory (never the real
 * `HOME`, never `STORYTREE_TRAVERSAL_DIR` from the ambient environment) — no stubbed store, no
 * mocked filesystem. Every assertion reads bytes back off disk (via a fresh `readTraversalSession`
 * call, or the raw file text itself), never a return value or a call count, per the node spec's
 * "fail-silent is not the same as unobserved" instruction.
 *
 * Covers the eight contracts declared in `stories/context-traversal-spawn/build-spawn-capture.md`:
 *   1. parent-and-child-lanes-land-in-their-own-files
 *   2. an-absent-parent-session-is-a-total-no-op
 *   3. traversal-off-is-a-total-no-op
 *   4. capture-never-throws-and-never-changes-an-exit-code
 *   5. no-canary-text-ever-reaches-the-bytes
 *   6. a-declared-window-reaches-the-child-lane-bytes
 *   7. an-undeclared-window-leaves-the-key-wholly-absent-in-the-bytes
 *   8. written-bytes-carry-no-field-outside-the-closed-vocabulary
 *
 * And, after them, the parent lane as the SESSION'S OWN lane (`session-harness-and-host-arc`,
 * increment `build-lane-ships-with-its-session`): keyed by the trace identity the session's CLI
 * reads use (`buildSpawnParentOf`), stamped with that identity's grade / slot / harness / host on
 * the parent lane only, and enrolled in the shipper by a forward-only baseline. Those tests name no
 * contract id because the spec declares none for them; they are held to the same bar — real sink,
 * temporary directory, bytes read back.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";

import {
  appendTraversalEvents,
  captureCliInvocation,
  captureIdentityOf,
  readTraversalSession,
  resolveTraceIdentity,
  TRAVERSAL_TRACE_EXT,
} from "@storytree/context-traversal-capture";
import type { TraceIdentity } from "@storytree/context-traversal-capture";
import {
  readShipCursor,
  shipTraversalBacklog,
  traversalShipBacklog,
  writeShipCursor,
  SHIP_CURSOR_EXT,
} from "@storytree/context-traversal-capture/store";
import type { TraversalEventLocation, TraversalEventStore } from "@storytree/context-traversal-capture/store";
import { ContextTraversalEvent } from "@storytree/context-traversal-telemetry";

import { buildSpawnParentOf, captureBuildSpawn } from "./build-capture.js";
import type { BuildSpawnParentIdentity } from "./build-capture.js";
import type { LeafSliceRun, LeafSliceUsage } from "./observe-leaf-slices.js";
import { showTraversalSessionAllAdapters } from "./replay-adapters.js";

function makeTempDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), `context-traversal-spawn-build-capture-${prefix}-`));
}

function removeTempDir(dir: string): void {
  fs.rmSync(dir, { recursive: true, force: true });
}

function usage(overrides: Partial<LeafSliceUsage> = {}): LeafSliceUsage {
  return {
    inputTokens: 100,
    cacheCreationInputTokens: 0,
    cacheReadInputTokens: 0,
    outputTokens: 10,
    ...overrides,
  };
}

function deterministicNow(): () => Date {
  return () => new Date("2026-07-26T12:00:00.000Z");
}

function deterministicNextId(): () => string {
  let counter = 0;
  return () => `id-${++counter}`;
}

test("parent-and-child-lanes-land-in-their-own-files: the parent's spawn/return lane and each child's own model-context observation land in their own separate on-disk files, with no cross-contamination", () => {
  const dir = makeTempDir("parent-child");
  try {
    const parentSessionId = "session-parent-1";
    const runId = "run-1";
    const unitId = "unit-a";
    const childPhase = "AUTHOR_TEST";
    const childSessionId = `${parentSessionId}__build__${runId}__${unitId}__${childPhase}`;

    const runs: LeafSliceRun[] = [
      {
        phase: childPhase,
        subtype: "success",
        turns: 2,
        usage: usage({ inputTokens: 500, cacheCreationInputTokens: 50, cacheReadInputTokens: 25, outputTokens: 30 }),
      },
    ];

    const returned = captureBuildSpawn({
      parentSessionId,
      runId,
      unitId,
      runs,
      dir,
      now: deterministicNow(),
      nextId: deterministicNextId(),
    });
    assert.equal(returned, undefined);

    // The TRACE files, as an exact set — a missing or stray lane still fails here. The directory also
    // holds the parent lane's ship cursor (`<parent>.ship.json`), which is not a trace; which lanes
    // carry one is asserted by its own test below.
    const traceFilesOnDisk = fs
      .readdirSync(dir)
      .filter((file) => file.endsWith(TRAVERSAL_TRACE_EXT))
      .sort();
    assert.deepEqual(traceFilesOnDisk, [`${childSessionId}.jsonl`, `${parentSessionId}.jsonl`].sort());

    // Parent file: read back through a FRESH reader — this proves durability across instances, not
    // an in-process object — and holds exactly the parent-lane events, scoped to the parent id.
    const parentReplay = readTraversalSession({ dir, sessionId: parentSessionId });
    assert.equal(parentReplay.skipped, 0);
    assert.deepEqual(
      parentReplay.replay.events.map((event) => event.kind),
      ["spawn_handoff", "result_return"],
    );
    for (const event of parentReplay.replay.events) {
      assert.equal(event.sessionId, parentSessionId);
    }

    // Child file: holds exactly its own model_context observation, scoped to the child id.
    const childReplay = readTraversalSession({ dir, sessionId: childSessionId });
    assert.equal(childReplay.skipped, 0);
    assert.deepEqual(
      childReplay.replay.events.map((event) => event.kind),
      ["model_context"],
    );
    assert.equal(childReplay.replay.events[0]?.sessionId, childSessionId);

    // No cross-contamination, asserted on the raw bytes rather than on the typed replay: the
    // parent's file must never contain the child's own event kind, and vice versa.
    const parentRaw = fs.readFileSync(path.join(dir, `${parentSessionId}.jsonl`), "utf8");
    assert.equal(parentRaw.includes("model_context"), false, "the parent's file must not contain a child event");

    const childRaw = fs.readFileSync(path.join(dir, `${childSessionId}.jsonl`), "utf8");
    assert.equal(childRaw.includes("spawn_handoff"), false, "the child's file must not contain a parent-lane event");
    assert.equal(childRaw.includes("result_return"), false, "the child's file must not contain a parent-lane event");
  } finally {
    removeTempDir(dir);
  }
});

test("an-absent-parent-session-is-a-total-no-op: a null or empty parentSessionId writes nothing, creates no directory and no file, and returns normally", () => {
  const runs: LeafSliceRun[] = [{ phase: "AUTHOR_TEST", subtype: "success", turns: 1, usage: usage() }];

  const base = makeTempDir("absent-parent");
  try {
    const emptyDir = path.join(base, "would-be-traces-empty");
    const emptyReturn = captureBuildSpawn({
      parentSessionId: "",
      runId: "run-1",
      unitId: "unit-a",
      runs,
      dir: emptyDir,
    });
    assert.equal(emptyReturn, undefined);
    assert.equal(fs.existsSync(emptyDir), false, "an empty parentSessionId must create no directory");

    const nullDir = path.join(base, "would-be-traces-null");
    const nullReturn = captureBuildSpawn({
      parentSessionId: null,
      runId: "run-1",
      unitId: "unit-a",
      runs,
      dir: nullDir,
    });
    assert.equal(nullReturn, undefined);
    assert.equal(fs.existsSync(nullDir), false, "a null parentSessionId must create no directory");
  } finally {
    removeTempDir(base);
  }
});

test("traversal-off-is-a-total-no-op: STORYTREE_TRAVERSAL=off and an explicit enabled:false each produce no directory and no file even with a valid parent session and slices that would otherwise emit", () => {
  const runs: LeafSliceRun[] = [{ phase: "AUTHOR_TEST", subtype: "success", turns: 1, usage: usage() }];
  const parentSessionId = "session-off";

  const base = makeTempDir("off");
  try {
    const overrideDir = path.join(base, "traces-override");
    captureBuildSpawn({
      parentSessionId,
      runId: "run-1",
      unitId: "unit-a",
      runs,
      dir: overrideDir,
      enabled: false,
    });
    assert.equal(fs.existsSync(overrideDir), false, "enabled:false must create no directory");

    const envDir = path.join(base, "traces-env");
    const previous = process.env.STORYTREE_TRAVERSAL;
    process.env.STORYTREE_TRAVERSAL = "off";
    try {
      captureBuildSpawn({
        parentSessionId,
        runId: "run-2",
        unitId: "unit-a",
        runs,
        dir: envDir,
      });
    } finally {
      if (previous === undefined) delete process.env.STORYTREE_TRAVERSAL;
      else process.env.STORYTREE_TRAVERSAL = previous;
    }
    assert.equal(fs.existsSync(envDir), false, "STORYTREE_TRAVERSAL=off must create no directory");
  } finally {
    removeTempDir(base);
  }
});

test("capture-never-throws-and-never-changes-an-exit-code: capture against an unwritable target returns normally rather than throwing, and a caller's surrounding control flow is unchanged", () => {
  const base = makeTempDir("blocked");
  try {
    // Occupy the directory's own path with a plain file, so creating a directory there is
    // impossible on every platform (unreliable to force via OS permissions cross-platform).
    const blockedParent = path.join(base, "blocked-file");
    fs.writeFileSync(blockedParent, "occupied");
    const blockedDir = path.join(blockedParent, "sessions");

    const runs: LeafSliceRun[] = [{ phase: "AUTHOR_TEST", subtype: "success", turns: 1, usage: usage() }];

    let threw = false;
    let simulatedExitCode = 0;
    let returned: unknown;
    try {
      returned = captureBuildSpawn({
        parentSessionId: "session-blocked",
        runId: "run-1",
        unitId: "unit-a",
        runs,
        dir: blockedDir,
      });
      // A caller's own success path continues exactly as if capture had not run at all.
      simulatedExitCode = 0;
    } catch {
      threw = true;
      simulatedExitCode = 1;
    }

    assert.equal(threw, false, "capture must never throw, even against an unwritable target");
    assert.equal(returned, undefined);
    assert.equal(simulatedExitCode, 0, "a caller's own control flow/exit code must be unaffected by a capture failure");
    assert.equal(fs.existsSync(blockedDir), false);
  } finally {
    removeTempDir(base);
  }
});

test("no-canary-text-ever-reaches-the-bytes: a distinctive canary threaded through every free-text-looking input never appears in any written trace file's raw text", () => {
  const dir = makeTempDir("canary");
  try {
    const CANARY = "CANARY-FREE-TEXT-9f3d";
    const parentSessionId = "session-canary";
    const runId = "run-1";
    const unitId = "unit-a";

    const runs: LeafSliceRun[] = [
      {
        phase: "AUTHOR_TEST",
        // A free-text-looking value that is never itself written verbatim: only a derived boolean
        // (`ok`, via a strict "success" comparison) is ever emitted from this field.
        subtype: `${CANARY}-not-a-recognised-subtype`,
        turns: 1,
        usage: usage({ inputTokens: 10, cacheCreationInputTokens: 0, cacheReadInputTokens: 0, outputTokens: 5 }),
        // A `byModel` KEY is DECLARED METADATA, not a free-text input, so it is deliberately NOT a
        // canary carrier: contract 6 here requires the bytes to carry "the matching `modelId`", and
        // contract 8 of `leaf-slice-spawn-observations` requires the sole `byModel` key to be
        // emitted as exactly that (the vocabulary declares `modelId: identity.optional()`). A
        // runtime-declared model id is none of ADR-0235 clause 6's banned categories. This fixture
        // previously threaded the canary through the key and passed only because contract 8 was
        // unimplemented; the canary stays on `subtype` above, which is genuinely never emitted.
        byModel: {
          "model-declared-runtime-id": {
            inputTokens: 10,
            cacheCreationInputTokens: 0,
            cacheReadInputTokens: 0,
            outputTokens: 5,
            costUsd: 1,
          },
        },
      },
      {
        phase: "IMPLEMENT",
        subtype: "error_max_turns",
        turns: 3,
      },
    ];

    captureBuildSpawn({
      parentSessionId,
      runId,
      unitId,
      runs,
      dir,
      now: deterministicNow(),
      nextId: deterministicNextId(),
    });

    const files = fs.readdirSync(dir);
    assert.ok(files.length > 0, "capture must have written at least the parent file");

    for (const file of files) {
      const raw = fs.readFileSync(path.join(dir, file), "utf8");
      assert.equal(raw.includes(CANARY), false, `canary text leaked into ${file}`);
    }
  } finally {
    removeTempDir(dir);
  }
});

// A distinctive number/id pair — no plausible default and no model-id -> capacity map would
// produce this number, so a carrier that supplies capacity from anywhere other than the input
// FAILS rather than coincides (the falsifiability bar contract 6 sets).
const DECLARED_WINDOW_CAPACITY = 733_319;
const DECLARED_WINDOW_MODEL_ID = "model-canary-capacity-9f21";

function declaringUsage(): LeafSliceUsage {
  return usage({ inputTokens: 40, cacheCreationInputTokens: 5, cacheReadInputTokens: 5, outputTokens: 12 });
}

test("a-declared-window-reaches-the-child-lane-bytes: a slice declaring exactly one distinct positive context window writes that number and its modelId onto the child's own model_context line, read back off disk", () => {
  const dir = makeTempDir("declared-window");
  try {
    const parentSessionId = "session-declared-window";
    const runId = "run-1";
    const unitId = "unit-a";
    const phase = "AUTHOR_TEST";
    const childSessionId = `${parentSessionId}__build__${runId}__${unitId}__${phase}`;

    const declaringRuns: LeafSliceRun[] = [
      {
        phase,
        subtype: "success",
        turns: 1,
        usage: declaringUsage(),
        byModel: {
          [DECLARED_WINDOW_MODEL_ID]: {
            ...declaringUsage(),
            costUsd: 0.02,
            contextWindow: DECLARED_WINDOW_CAPACITY,
          },
        },
      },
    ];

    captureBuildSpawn({
      parentSessionId,
      runId,
      unitId,
      runs: declaringRuns,
      dir,
      now: deterministicNow(),
      nextId: deterministicNextId(),
    });

    const childPath = path.join(dir, `${childSessionId}.jsonl`);
    const raw = fs.readFileSync(childPath, "utf8");
    const rawLine = raw
      .trim()
      .split("\n")
      .find((line) => line.includes('"model_context"'));
    assert.ok(rawLine, "expected a model_context line in the child's file");
    // The falsifiable claim itself: the specific declared number, and the model id that declared
    // it, survive to the raw bytes verbatim — never a default, never a lookup, never coincidence.
    assert.ok(
      rawLine?.includes(`"contextWindowCapacity":${DECLARED_WINDOW_CAPACITY}`),
      "expected the declared window capacity in the raw bytes",
    );
    assert.ok(
      rawLine?.includes(`"modelId":"${DECLARED_WINDOW_MODEL_ID}"`),
      "expected the matching modelId in the raw bytes",
    );

    // Same claim proven again through a FRESH typed reader, never only the raw text.
    const replay = readTraversalSession({ dir, sessionId: childSessionId });
    assert.equal(replay.skipped, 0);
    const contextEvent = replay.replay.events.find((event) => event.kind === "model_context");
    assert.ok(contextEvent?.kind === "model_context");
    if (contextEvent?.kind === "model_context") {
      assert.equal(contextEvent.contextWindowCapacity, DECLARED_WINDOW_CAPACITY);
      assert.equal(contextEvent.modelId, DECLARED_WINDOW_MODEL_ID);
    }
  } finally {
    removeTempDir(dir);
  }
});

test("an-undeclared-window-leaves-the-key-wholly-absent-in-the-bytes: a slice declaring no context window keeps the child's model_context line intact but WITHOUT a contextWindowCapacity key anywhere in the raw bytes", () => {
  const dir = makeTempDir("undeclared-window");
  try {
    const parentSessionId = "session-undeclared-window";
    const runId = "run-1";
    const unitId = "unit-a";
    const phase = "AUTHOR_TEST";
    const childSessionId = `${parentSessionId}__build__${runId}__${unitId}__${phase}`;

    const undeclaringRuns: LeafSliceRun[] = [
      {
        phase,
        subtype: "success",
        turns: 1,
        usage: declaringUsage(),
        // No byModel at all — nothing to attribute a capacity to.
      },
    ];

    captureBuildSpawn({
      parentSessionId,
      runId,
      unitId,
      runs: undeclaringRuns,
      dir,
      now: deterministicNow(),
      nextId: deterministicNextId(),
    });

    const childPath = path.join(dir, `${childSessionId}.jsonl`);
    const raw = fs.readFileSync(childPath, "utf8");
    const rawLine = raw
      .trim()
      .split("\n")
      .find((line) => line.includes('"model_context"'));
    assert.ok(rawLine, "expected a model_context line in the child's file");
    // The load-bearing half: an absent declaration must leave the key WHOLLY ABSENT from the raw
    // bytes — never serialized as null or 0, which would read downstream as a declared capacity.
    assert.equal(
      rawLine?.includes("contextWindowCapacity"),
      false,
      "an undeclared window must never appear as a key in the raw bytes",
    );

    const parsedLine = JSON.parse(rawLine as string) as { event: Record<string, unknown> };
    assert.equal(Object.hasOwn(parsedLine.event, "contextWindowCapacity"), false);
    // Token observations still land — only the capacity field is missing, not the whole event.
    assert.equal(typeof parsedLine.event.cumulativeInputTokens, "number");
    assert.equal(typeof parsedLine.event.addedInputTokens, "number");

    const replay = readTraversalSession({ dir, sessionId: childSessionId });
    assert.equal(replay.skipped, 0);
    const contextEvent = replay.replay.events.find((event) => event.kind === "model_context");
    assert.ok(contextEvent?.kind === "model_context");
    if (contextEvent?.kind === "model_context") {
      assert.equal(contextEvent.contextWindowCapacity, undefined);
    }
  } finally {
    removeTempDir(dir);
  }
});

test("written-bytes-carry-no-field-outside-the-closed-vocabulary: under both the declared-window and undeclared-window outcomes, every written line parses through the strict ContextTraversalEvent union with no unrecognised key and no free text anywhere in the bytes", () => {
  const dir = makeTempDir("closed-vocabulary");
  try {
    const parentSessionId = "session-closed-vocab";
    const runId = "run-1";
    const unitId = "unit-a";

    const runs: LeafSliceRun[] = [
      {
        phase: "AUTHOR_TEST",
        subtype: "success",
        turns: 1,
        usage: declaringUsage(),
        byModel: {
          [DECLARED_WINDOW_MODEL_ID]: {
            ...declaringUsage(),
            contextWindow: DECLARED_WINDOW_CAPACITY,
          },
        },
      },
      {
        phase: "IMPLEMENT",
        subtype: "success",
        turns: 1,
        usage: declaringUsage(),
        // No byModel: the undeclared-window outcome, landing in the SAME capture as the declared
        // one above — the pairing the node spec's integration evidence calls for.
      },
    ];

    captureBuildSpawn({
      parentSessionId,
      runId,
      unitId,
      runs,
      dir,
      now: deterministicNow(),
      nextId: deterministicNextId(),
    });

    // TRACE files only, deliberately. The parent lane now also leaves a ship cursor beside its trace
    // (`<parent>.ship.json`, ADR-0484 D6): a cursor DOCUMENT with its own schema (`ShipCursorDoc` —
    // byte offsets and counters), holding no event and no line. This contract's subject is "every line
    // of every written TRACE file", and parsing a cursor as `{ v, event }` would fail on a file that
    // was never a trace. Nothing asserted about a trace line below is narrowed.
    const files = fs.readdirSync(dir).filter((file) => file.endsWith(TRAVERSAL_TRACE_EXT));
    assert.ok(files.length >= 3, "expected the parent file plus one file per child");

    const ALLOWED_MODEL_CONTEXT_KEYS = new Set([
      "kind",
      "eventId",
      "sessionId",
      "at",
      "modelId",
      "cumulativeInputTokens",
      "addedInputTokens",
      "contextWindowCapacity",
    ]);

    let sawModelContext = false;
    for (const file of files) {
      const raw = fs.readFileSync(path.join(dir, file), "utf8");
      const lines = raw
        .trim()
        .split("\n")
        .filter((line) => line.length > 0);
      for (const line of lines) {
        const parsedLine = JSON.parse(line) as { v: unknown; event: unknown };
        assert.equal(parsedLine.v, 1);
        // Strict union parse: any key outside the closed vocabulary throws here, extending
        // contract 5 from "the canary is absent" to "nothing beyond the declared vocabulary is
        // present" — a new field cannot arrive on disk unnoticed just because it is not the canary.
        const event = ContextTraversalEvent.parse(parsedLine.event);
        if (event.kind === "model_context") {
          sawModelContext = true;
          for (const key of Object.keys(event)) {
            assert.ok(ALLOWED_MODEL_CONTEXT_KEYS.has(key), `unexpected key ${key} on a model_context event`);
          }
        }
      }
    }
    assert.ok(sawModelContext, "expected at least one model_context line to have been scanned");
  } finally {
    removeTempDir(dir);
  }
});

// ---------------------------------------------------------------------------
// The parent lane is the SESSION'S OWN lane (`build-lane-ships-with-its-session`)
// ---------------------------------------------------------------------------

const LANE_RUN_ID = "run-1";
const LANE_UNIT_ID = "unit-a";
const LANE_PHASES = ["AUTHOR_TEST", "IMPLEMENT"] as const;

/** Two slices, both reporting usage: one capture writes a four-event parent lane and two child lanes. */
function twoSliceRuns(): LeafSliceRun[] {
  return [
    { phase: "AUTHOR_TEST", subtype: "success", turns: 1, usage: usage() },
    { phase: "IMPLEMENT", subtype: "success", turns: 2, usage: usage({ inputTokens: 200 }) },
  ];
}

function childSessionIdsOf(parentSessionId: string): string[] {
  return LANE_PHASES.map((phase) => `${parentSessionId}__build__${LANE_RUN_ID}__${LANE_UNIT_ID}__${phase}`);
}

/** One trace file's lines, parsed as the raw JSON objects the sink wrote — never a typed replay. */
function rawLinesOf(dir: string, sessionId: string): Record<string, unknown>[] {
  return fs
    .readFileSync(path.join(dir, `${sessionId}${TRAVERSAL_TRACE_EXT}`), "utf8")
    .split("\n")
    .filter((line) => line.length > 0)
    .map((line) => JSON.parse(line) as Record<string, unknown>);
}

/** One of the session's OWN reads, in the shape its CLI capture records — for history fixtures. */
function sessionRead(sessionId: string) {
  return {
    kind: "front_matter_read",
    eventId: `${sessionId}-read-1`,
    sessionId,
    at: "2026-07-26T11:00:00.000Z",
    visitId: `${sessionId}-visit-1`,
    nodeId: "plan",
  };
}

/** A Codex window with every attribute naming something — the whole identity a lane can carry. */
const CODEX_WINDOW: TraceIdentity = {
  sessionId: "0198de4f-codex-thread",
  grade: "window",
  slot: "worktree-alpha",
  harness: "codex",
  host: "owner-laptop",
};

/** Capture one two-slice build under `trace`, mapped exactly as the CLI maps it. */
function captureLaneUnder(trace: TraceIdentity | null, dir: string): void {
  captureBuildSpawn({
    ...buildSpawnParentOf(trace),
    runId: LANE_RUN_ID,
    unitId: LANE_UNIT_ID,
    runs: twoSliceRuns(),
    dir,
    now: deterministicNow(),
    nextId: deterministicNextId(),
  });
}

/**
 * A shared store that remembers what the shipper handed it. The shipper is the one reader of a
 * cursor, so asking IT what ships is the observation — a cursor offset is only a proxy for one.
 */
class RecordingStore implements TraversalEventStore {
  readonly appends: { location: TraversalEventLocation; eventIds: string[] }[] = [];

  async append(events: readonly unknown[], location: TraversalEventLocation): Promise<boolean> {
    this.appends.push({ location, eventIds: events.map((event) => ContextTraversalEvent.parse(event).eventId) });
    return true;
  }

  async read(): Promise<never> {
    throw new Error("the shipper never reads the store");
  }

  async list(): Promise<never> {
    throw new Error("the shipper never lists the store");
  }
}

test("the parent lane carries the session's identity — grade, slot, harness and host — on every line, and the child lanes carry none of them", () => {
  const dir = makeTempDir("parent-identity");
  try {
    captureLaneUnder(CODEX_WINDOW, dir);

    const parentLines = rawLinesOf(dir, CODEX_WINDOW.sessionId);
    assert.equal(parentLines.length, 4, "two slices: one handoff and one return each");
    for (const line of parentLines) {
      // The WHOLE top-level key set, so an attribute that went missing and one that arrived
      // uninvited both fail — and each value is the identity's own, verbatim.
      assert.deepEqual(Object.keys(line).sort(), ["event", "grade", "harness", "host", "slot", "v"]);
      assert.equal(line.grade, "window");
      assert.equal(line.slot, "worktree-alpha");
      assert.equal(line.harness, "codex");
      assert.equal(line.host, "owner-laptop");
    }

    // Through a FRESH reader as well: the lane reads as ONE context window, on one slot, from one
    // harness, on one machine.
    const parent = readTraversalSession({ dir, sessionId: CODEX_WINDOW.sessionId });
    assert.equal(parent.skipped, 0);
    assert.equal(parent.identity, "window");
    assert.deepEqual(parent.slots, ["worktree-alpha"]);
    assert.deepEqual(parent.harnesses, ["codex"]);
    assert.deepEqual(parent.hosts, ["owner-laptop"]);

    // Each child lane is written exactly as before: `v` and `event` and nothing else. Its window is the
    // LEAF runtime's, so the session's harness, host or grade would describe it falsely.
    for (const childSessionId of childSessionIdsOf(CODEX_WINDOW.sessionId)) {
      const childLines = rawLinesOf(dir, childSessionId);
      assert.equal(childLines.length, 1, `${childSessionId} holds its one model_context line`);
      for (const line of childLines) {
        assert.deepEqual(Object.keys(line).sort(), ["event", "v"], `${childSessionId} must carry no identity stamp`);
      }
    }
  } finally {
    removeTempDir(dir);
  }
});

test("buildSpawnParentOf: a trace identity maps onto the parent lane exactly as a CLI read's capture maps it — a null slot, harness or host stamps NO key, and no identity captures nothing", () => {
  // No identity at all: nothing to key the lane by, so the run captures nothing — the rule every CLI
  // read follows, and an ordinary outcome rather than an error.
  assert.deepEqual(buildSpawnParentOf(null), { parentSessionId: null, parentIdentity: {} });

  const base = makeTempDir("parent-of");
  try {
    const unidentified = path.join(base, "unidentified");
    captureLaneUnder(null, unidentified);
    assert.equal(fs.existsSync(unidentified), false, "an unidentified run must create no directory");

    // Each attribute both present and absent. `parentIdentity` is the helper's answer; `stamped` is
    // what the parent lane's lines must then carry beside `v` and `event` — nothing more.
    const cases: {
      readonly name: string;
      readonly trace: TraceIdentity;
      readonly parentIdentity: BuildSpawnParentIdentity;
      readonly stamped: Readonly<Record<string, string>>;
    }[] = [
      {
        name: "everything detected",
        trace: CODEX_WINDOW,
        parentIdentity: { grade: "window", slot: "worktree-alpha", harness: "codex", host: "owner-laptop" },
        stamped: { grade: "window", slot: "worktree-alpha", harness: "codex", host: "owner-laptop" },
      },
      {
        name: "a declared id with nothing detected beside it",
        trace: { sessionId: "declared-id", grade: "declared", slot: null, harness: null, host: null },
        parentIdentity: { grade: "declared", slot: null },
        stamped: { grade: "declared" },
      },
      {
        name: "a harness but no machine",
        trace: { sessionId: "claude-window", grade: "window", slot: "worktree-beta", harness: "claude-code", host: null },
        parentIdentity: { grade: "window", slot: "worktree-beta", harness: "claude-code" },
        stamped: { grade: "window", slot: "worktree-beta", harness: "claude-code" },
      },
      {
        name: "a machine but no harness",
        trace: { sessionId: "declared-on-mintbox", grade: "declared", slot: null, harness: null, host: "mintbox" },
        parentIdentity: { grade: "declared", slot: null, host: "mintbox" },
        stamped: { grade: "declared", host: "mintbox" },
      },
    ];

    for (const { name, trace, parentIdentity, stamped } of cases) {
      const mapped = buildSpawnParentOf(trace);
      assert.equal(mapped.parentSessionId, trace.sessionId, name);
      // Key sets compared explicitly: an ABSENT key and a key holding `undefined` must not pass for
      // one another here, because only the first is what the sink reads as "unrecorded".
      assert.deepEqual(Object.keys(mapped.parentIdentity).sort(), Object.keys(parentIdentity).sort(), name);
      assert.deepEqual(mapped.parentIdentity, parentIdentity, name);

      const dir = path.join(base, trace.sessionId);
      captureLaneUnder(trace, dir);
      for (const line of rawLinesOf(dir, trace.sessionId)) {
        assert.deepEqual(Object.keys(line).sort(), ["event", "v", ...Object.keys(stamped)].sort(), name);
        for (const [key, value] of Object.entries(stamped)) assert.equal(line[key], value, `${name}: ${key}`);
      }
    }
  } finally {
    removeTempDir(base);
  }
});

test("the parent lane SHIPS: a brand-new lane is baselined at offset 0 BEFORE its append, so every one of its events reaches the shared store under the session's identity — and no child lane is enrolled", async () => {
  const dir = makeTempDir("parent-ships");
  try {
    captureLaneUnder(CODEX_WINDOW, dir);

    // A brand-new lane had no file, so a baseline stamped before the append sits at 0 and the whole
    // lane lies ahead of it. One stamped AFTER would sit at the file's end and ship nothing.
    assert.deepEqual(readShipCursor(dir, CODEX_WINDOW.sessionId), {
      v: 1,
      offset: 0,
      shipped: 0,
      unshippable: 0,
      consecutiveFailures: 0,
    });
    for (const childSessionId of childSessionIdsOf(CODEX_WINDOW.sessionId)) {
      assert.equal(readShipCursor(dir, childSessionId), null, `${childSessionId} must carry no ship cursor`);
    }
    assert.deepEqual(
      fs.readdirSync(dir).filter((file) => file.endsWith(SHIP_CURSOR_EXT)),
      [`${CODEX_WINDOW.sessionId}${SHIP_CURSOR_EXT}`],
      "exactly one cursor on disk, and it is the parent's",
    );

    const backlog = traversalShipBacklog(dir);
    assert.equal(backlog.tracked, 1, "only the parent lane is enrolled in the shipper");
    assert.deepEqual(
      backlog.waiting.map((row) => [row.sessionId, row.unshippedEvents]),
      [[CODEX_WINDOW.sessionId, 4]],
    );

    // The ship itself, into a recording store: every parent event, in file order, as ONE append whose
    // location carries the identity the lines were stamped with.
    const store = new RecordingStore();
    const report = await shipTraversalBacklog({ dir, store, now: deterministicNow() });
    assert.equal(report.failed, 0);
    assert.equal(report.shipped, 4);
    const parentEventIds = rawLinesOf(dir, CODEX_WINDOW.sessionId).map(
      (line) => ContextTraversalEvent.parse(line.event).eventId,
    );
    assert.deepEqual(store.appends, [
      {
        location: {
          sessionId: CODEX_WINDOW.sessionId,
          grade: "window",
          slot: "worktree-alpha",
          harness: "codex",
          host: "owner-laptop",
          cutBy: null,
          cutFor: null,
        },
        eventIds: parentEventIds,
      },
    ]);
  } finally {
    removeTempDir(dir);
  }
});

test("the parent lane's baseline is FORWARD-ONLY (ADR-0484 D6): an existing cursor is left byte-for-byte, and a trace with history but no cursor is baselined at its end — the lane ships, the history never does", () => {
  const base = makeTempDir("forward-only");
  try {
    const sessionId = CODEX_WINDOW.sessionId;

    // THE ORDINARY CASE: the session's own reads came first, and their capture enrolled the session
    // and has since shipped that read. The lane must ride the cursor it finds, not re-baseline it.
    const enrolled = path.join(base, "enrolled");
    appendTraversalEvents([sessionRead(sessionId)], { dir: enrolled, sessionId, grade: "window" });
    const readBytes = fs.statSync(path.join(enrolled, `${sessionId}${TRAVERSAL_TRACE_EXT}`)).size;
    assert.ok(readBytes > 0, "the fixture's read must have been written");
    writeShipCursor(enrolled, sessionId, {
      v: 1,
      offset: readBytes,
      shipped: 1,
      unshippable: 0,
      lastShippedAt: "2026-07-26T11:30:00.000Z",
      lastAttemptAt: "2026-07-26T11:30:00.000Z",
      consecutiveFailures: 0,
    });
    const cursorFile = path.join(enrolled, `${sessionId}${SHIP_CURSOR_EXT}`);
    const cursorBefore = fs.readFileSync(cursorFile, "utf8");

    captureLaneUnder(CODEX_WINDOW, enrolled);

    assert.equal(fs.readFileSync(cursorFile, "utf8"), cursorBefore, "an existing cursor must not be re-baselined");
    assert.deepEqual(
      traversalShipBacklog(enrolled).waiting.map((row) => [row.sessionId, row.unshippedEvents]),
      [[sessionId, 4]],
      "exactly the lane is waiting — the already-shipped read is not queued again",
    );

    // PRE-LANDING HISTORY with no cursor: the baseline lands at the file's end as it stood BEFORE the
    // lane's append, so the history stays where it is and only the lane ships.
    const history = path.join(base, "history");
    appendTraversalEvents([sessionRead(sessionId)], { dir: history, sessionId });
    const historyBytes = fs.statSync(path.join(history, `${sessionId}${TRAVERSAL_TRACE_EXT}`)).size;
    assert.ok(historyBytes > 0, "the fixture's history must have been written");

    captureLaneUnder(CODEX_WINDOW, history);

    assert.equal(readShipCursor(history, sessionId)?.offset, historyBytes);
    assert.deepEqual(
      traversalShipBacklog(history).waiting.map((row) => [row.sessionId, row.unshippedEvents]),
      [[sessionId, 4]],
      "exactly the lane is waiting — never the pre-landing history",
    );
  } finally {
    removeTempDir(base);
  }
});

test("a build's parent lane JOINS the session's window trace: the session's reads and its lane share ONE file, which still replays as one context window with one slot, harness and machine", () => {
  const base = makeTempDir("joins-window");
  try {
    // The identity is resolved the way the CLI resolves it — `resolveTraceIdentity` — over an INJECTED
    // environment, so the ambient `CLAUDE_CODE_SESSION_ID` / `CODEX_THREAD_ID` / `STORYTREE_SESSION_ID`
    // of whatever process runs this suite can neither leak in nor be needed.
    const trace = resolveTraceIdentity({
      env: { CLAUDE_CODE_SESSION_ID: "window-1" },
      slot: "worktree-alpha",
      host: "owner-laptop",
    });
    assert.ok(trace !== null);

    /** One of the session's reads, captured as `main.ts` captures it — then a build that session ran. */
    const readThenBuild = (dir: string, lane: () => void): void => {
      captureCliInvocation({
        argv: ["library", "artifact", "plan"],
        ok: true,
        ...captureIdentityOf(trace),
        dir,
        enabled: true,
        origin: null,
        now: deterministicNow(),
        nextId: () => "visit-1",
      });
      lane();
    };

    const joined = path.join(base, "joined");
    readThenBuild(joined, () => captureLaneUnder(trace, joined));

    assert.deepEqual(
      fs.readdirSync(joined).filter((file) => file.endsWith(TRAVERSAL_TRACE_EXT)).sort(),
      ["window-1", ...childSessionIdsOf("window-1")].map((id) => `${id}${TRAVERSAL_TRACE_EXT}`).sort(),
      "one trace for the session — its reads and its lane together — plus one per child",
    );

    const session = readTraversalSession({ dir: joined, sessionId: "window-1" });
    assert.equal(session.skipped, 0);
    assert.ok(
      session.replay.events.some((event) => event.eventId === "event:visit-1"),
      "the session's own read is in the file",
    );
    assert.equal(session.replay.events.filter((event) => event.kind === "spawn_handoff").length, 2);
    assert.equal(session.replay.events.filter((event) => event.kind === "result_return").length, 2);
    assert.equal(session.identity, "window", "graded lane lines keep the trace ONE window rather than mixed");
    assert.deepEqual(session.slots, ["worktree-alpha"]);
    assert.deepEqual(session.harnesses, ["claude-code"]);
    assert.deepEqual(session.hosts, ["owner-laptop"]);

    // The replay the CLI's `traversal show` prints states the same classification for this
    // mixed-KIND trace.
    assert.match(showTraversalSessionAllAdapters("window-1", { dir: joined }).body, /^identity: window — /m);

    // THE FALSIFIER: the same read followed by an UNSTAMPED lane under the same id — what a caller
    // supplying only the id would write — reads MIXED, so the window reading above is not vacuous.
    const unstamped = path.join(base, "unstamped");
    readThenBuild(unstamped, () =>
      captureBuildSpawn({
        parentSessionId: trace.sessionId,
        runId: LANE_RUN_ID,
        unitId: LANE_UNIT_ID,
        runs: twoSliceRuns(),
        dir: unstamped,
        now: deterministicNow(),
        nextId: deterministicNextId(),
      }),
    );
    assert.equal(readTraversalSession({ dir: unstamped, sessionId: "window-1" }).identity, "mixed");
  } finally {
    removeTempDir(base);
  }
});
