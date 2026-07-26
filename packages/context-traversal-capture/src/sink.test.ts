/**
 * The durable local sink for context-traversal traces (ADR-0241), story `context-traversal-capture`,
 * capability `traversal-trace-sink`.
 *
 * Every fixture here writes to a fresh, unique temporary directory (never the real `HOME`) and every
 * read goes through a brand-new call to `readTraversalSession` — there is no in-process object shared
 * between "writer" and "reader" — so durability across process instances is what these assertions
 * actually prove, not durability within one held reference.
 *
 * Covers the four contracts declared in
 * `stories/context-traversal-capture/traversal-trace-sink.md`:
 *   1. appended-events-replay-in-a-fresh-reader
 *   2. tolerant-read-skips-and-counts-bad-lines
 *   3. append-creates-its-directory-and-never-throws
 *   4. invalid-events-never-reach-the-bytes
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";

import { appendTraversalEvents, readTraversalSession } from "./sink.js";

function freshDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), `traversal-sink-${prefix}-`));
}

test("appended-events-replay-in-a-fresh-reader: events land and replay chronologically across separate append and read calls", () => {
  const dir = freshDir("fresh");
  const sessionId = "session-fresh";

  const wroteFirst = appendTraversalEvents(
    [
      {
        kind: "front_matter_read",
        eventId: "event:f1",
        sessionId,
        at: "2026-07-26T00:00:00.000Z",
        visitId: "f1",
        nodeId: "node-first",
      },
    ],
    { dir, sessionId },
  );
  assert.equal(wroteFirst, true);

  // A brand-new reader call — no object or state is carried over from the write above.
  const afterFirst = readTraversalSession({ dir, sessionId });
  assert.equal(afterFirst.skipped, 0);
  assert.equal(afterFirst.replay.events.length, 1);
  assert.equal(afterFirst.replay.events[0]?.eventId, "event:f1");

  // A second, independent append call — simulates a second process joining the same session.
  const wroteSecond = appendTraversalEvents(
    [
      {
        kind: "full_payload_read",
        eventId: "event:f2",
        sessionId,
        at: "2026-07-26T00:00:01.000Z",
        visitId: "f2",
        nodeId: "node-second",
      },
      {
        kind: "front_matter_read",
        eventId: "event:f3",
        sessionId,
        at: "2026-07-26T00:00:02.000Z",
        visitId: "f3",
        nodeId: "node-third",
      },
    ],
    { dir, sessionId },
  );
  assert.equal(wroteSecond, true);

  // Yet another fresh reader call proves durability across instances rather than within one object.
  const replayed = readTraversalSession({ dir, sessionId });
  assert.equal(replayed.skipped, 0);
  assert.deepEqual(
    replayed.replay.events.map((event) => event.eventId),
    ["event:f1", "event:f2", "event:f3"],
  );
  assert.deepEqual(
    replayed.replay.events.map((event) => ("visitId" in event ? event.visitId : undefined)),
    ["f1", "f2", "f3"],
  );
});

test("tolerant-read-skips-and-counts-bad-lines: duplicate identity, garbage, unknown-v, and a crash-truncated final line are all skipped and counted, never thrown", () => {
  const dir = freshDir("tolerant");
  const sessionId = "session-tolerant";
  const filePath = path.join(dir, `${sessionId}.jsonl`);

  const good1 = {
    v: 1,
    event: {
      kind: "front_matter_read",
      eventId: "event:a1",
      sessionId,
      at: "2026-07-26T00:00:00.000Z",
      visitId: "a1",
      nodeId: "node-a",
    },
  };
  // A crash-duplicated write of the exact same line — same identity, must be skipped on replay even
  // though increment 1's in-memory trace would throw on a duplicate eventId/visitId if not guarded.
  const duplicateOfGood1 = good1;
  const unknownVersion = {
    v: 2,
    event: {
      kind: "front_matter_read",
      eventId: "event:unknownv",
      sessionId,
      at: "2026-07-26T00:00:01.000Z",
      visitId: "unknownv",
      nodeId: "node-c",
    },
  };
  const good2 = {
    v: 1,
    event: {
      kind: "full_payload_read",
      eventId: "event:b1",
      sessionId,
      at: "2026-07-26T00:00:02.000Z",
      visitId: "b1",
      nodeId: "node-b",
    },
  };

  const lines = [
    JSON.stringify(good1),
    JSON.stringify(duplicateOfGood1),
    "not-even-json-{{{",
    JSON.stringify(unknownVersion),
    // a trailing \r before the line's \n must be tolerated — this is still a GOOD line, not a skip
    `${JSON.stringify(good2)}\r`,
  ];
  // the normal shape of a crash mid-write: no closing brace, no trailing newline, at EOF
  const finalPartialLine = '{"v":1,"event":{"kind":"full_payload_read","eventId":"event:partial"';

  fs.writeFileSync(filePath, `${lines.join("\n")}\n${finalPartialLine}`);

  const { replay, skipped } = readTraversalSession({ dir, sessionId });

  assert.deepEqual(
    replay.events.map((event) => event.eventId),
    ["event:a1", "event:b1"],
  );
  // duplicate(1) + garbage(1) + unknown-v(1) + final partial line(1)
  assert.equal(skipped, 4);
});

test("append-creates-its-directory-and-never-throws: a missing directory is created on write, and an unwritable target returns false instead of throwing", () => {
  const base = freshDir("dir");
  const sessionId = "session-created";
  const missingDir = path.join(base, "nested", "sessions");

  assert.equal(fs.existsSync(missingDir), false);
  const created = appendTraversalEvents(
    [
      {
        kind: "front_matter_read",
        eventId: "event:created",
        sessionId,
        at: "2026-07-26T00:00:00.000Z",
        visitId: "created",
        nodeId: "node-created",
      },
    ],
    { dir: missingDir, sessionId },
  );
  assert.equal(created, true);
  assert.equal(fs.existsSync(missingDir), true);
  const { replay } = readTraversalSession({ dir: missingDir, sessionId });
  assert.equal(replay.events.length, 1);

  // Force a write failure without touching OS permissions (unreliable cross-platform): occupy the
  // directory's own path with a plain file, so creating a directory there is impossible everywhere.
  const blockedParent = path.join(base, "blocked-file");
  fs.writeFileSync(blockedParent, "occupied");
  const blockedDir = path.join(blockedParent, "sessions");

  let threw = false;
  let blockedResult: unknown;
  try {
    blockedResult = appendTraversalEvents(
      [
        {
          kind: "front_matter_read",
          eventId: "event:blocked",
          sessionId,
          at: "2026-07-26T00:00:01.000Z",
          visitId: "blocked",
          nodeId: "node-blocked",
        },
      ],
      { dir: blockedDir, sessionId },
    );
  } catch {
    threw = true;
  }
  assert.equal(threw, false, "appendTraversalEvents must return false, never throw, for an unwritable target");
  assert.equal(blockedResult, false);
});

test("invalid-events-never-reach-the-bytes: an event failing the vocabulary is never written, even alongside a valid sibling in the same call", () => {
  const dir = freshDir("invalid");
  const sessionId = "session-invalid";
  const filePath = path.join(dir, `${sessionId}.jsonl`);

  // Deliberately not asserting on the return value here — contract 4 requires this be proven by
  // reading the file's raw bytes, not by inspecting what appendTraversalEvents reports back.
  appendTraversalEvents(
    [
      {
        kind: "front_matter_read",
        eventId: "event:good",
        sessionId,
        at: "2026-07-26T00:00:00.000Z",
        visitId: "good-visit",
        nodeId: "node-good",
      },
      {
        // missing the required nodeId — fails increment 1's vocabulary — and carries a canary that
        // must never reach disk if validation genuinely happens before the bytes.
        kind: "front_matter_read",
        eventId: "event:bad-CANARY-MARKER",
        sessionId,
        at: "2026-07-26T00:00:01.000Z",
        visitId: "bad-visit",
      },
    ],
    { dir, sessionId },
  );

  const raw = fs.existsSync(filePath) ? fs.readFileSync(filePath, "utf8") : "";
  assert.equal(raw.includes("event:good"), true);
  assert.equal(raw.includes("CANARY-MARKER"), false);
  assert.equal(raw.includes("bad-visit"), false);
});
