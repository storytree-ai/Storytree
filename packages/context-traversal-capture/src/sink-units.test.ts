/**
 * THE PLURAL `cutFor` RIDER ON THE BYTES — story `context-traversal-capture`, capability
 * `traversal-trace-sink` (ADR-0541 D2).
 *
 * `session-origin-units.test.ts` proves the RULE by value; this file proves it against real bytes,
 * on the same posture the rest of `sink.test.ts` takes: a fresh temp directory per fixture, and a
 * brand-new reader call, so what is asserted is durability across processes rather than within one
 * held reference.
 *
 * The property that matters most here is the one a value test cannot see — that a SINGLE unit still
 * writes the exact bytes it wrote before this landed. The list form exists because one append
 * carries one identity stamp; it must not become the shape of the common case, because the shared
 * store's `cut_for` column is single-valued and every line already on disk is a bare string.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";

import { appendTraversalEvents, readTraversalSession } from "./sink.js";

function freshDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), `traversal-units-${prefix}-`));
}

function anEvent(sessionId: string, n: number) {
  return {
    kind: "front_matter_read",
    eventId: `event:u${n}`,
    sessionId,
    at: `2026-09-07T00:00:0${n}.000Z`,
    visitId: `u${n}`,
    nodeId: `node-${n}`,
  };
}

function firstLine(dir: string, sessionId: string): Record<string, unknown> {
  const raw = fs.readFileSync(path.join(dir, `${sessionId}.jsonl`), "utf8");
  return JSON.parse(raw.split("\n")[0] ?? "{}") as Record<string, unknown>;
}

test("ONE unit writes a bare string — the bytes of every line written before ADR-0541 are unchanged", () => {
  const dir = freshDir("one");
  const sessionId = "session-one";
  appendTraversalEvents([anEvent(sessionId, 1)], {
    dir,
    sessionId,
    origin: "cut",
    cutBy: "predecessor",
    cutFor: "map-arc-inc-01",
  });
  assert.equal(firstLine(dir, sessionId)["cutFor"], "map-arc-inc-01");
});

test("SEVERAL units write a list, and the list reads back as several", () => {
  const dir = freshDir("several");
  const sessionId = "session-several";
  appendTraversalEvents([anEvent(sessionId, 1)], {
    dir,
    sessionId,
    origin: "human",
    cutFor: ["cap-a", "cap-b"],
  });
  assert.deepEqual(firstLine(dir, sessionId)["cutFor"], ["cap-a", "cap-b"]);

  const read = readTraversalSession({ dir, sessionId });
  assert.deepEqual(read.origin.cutFor, ["cap-a", "cap-b"]);
  // ⚠ Recorded on a HUMAN-started session. The rider no longer rides an established `cut` origin
  // (ADR-0541 D2) — before that, this whole line's attribution was dropped.
  assert.equal(read.origin.reading, "human");
});

test("a unit list that names nothing stamps no key at all — absence is what leaves a line unlabelled", () => {
  const dir = freshDir("empty");
  const sessionId = "session-empty";
  appendTraversalEvents([anEvent(sessionId, 1)], { dir, sessionId, cutFor: null });
  assert.equal("cutFor" in firstLine(dir, sessionId), false);
  assert.deepEqual(readTraversalSession({ dir, sessionId }).origin.cutFor, []);
});

test("a session whose units GREW mid-trace reads back as the union of both stamps", () => {
  // The ordinary shape once `noticeboard declare` records at claim time: the session claims one
  // capability, reads, then claims a second and reads again. Each append carries the stamp that was
  // true when it was written; the trace's reading is the union, and neither append is rewritten.
  const dir = freshDir("grew");
  const sessionId = "session-grew";
  appendTraversalEvents([anEvent(sessionId, 1)], { dir, sessionId, cutFor: "cap-a" });
  appendTraversalEvents([anEvent(sessionId, 2)], { dir, sessionId, cutFor: ["cap-a", "cap-b"] });

  const read = readTraversalSession({ dir, sessionId });
  assert.equal(read.replay.events.length, 2);
  assert.deepEqual(read.origin.cutFor, ["cap-a", "cap-b"]);
});
