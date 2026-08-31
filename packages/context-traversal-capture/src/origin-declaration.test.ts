/**
 * THE PERSISTED ORIGIN DECLARATION — story `context-traversal-capture`, capability
 * `terminal-capture-activation` (ADR-0484 D7).
 *
 * Every fixture writes to a fresh, unique temporary directory (never the real `HOME`), and every
 * read goes through a brand-new call, so what these assertions prove is durability across process
 * instances rather than within one held reference — the rule `sink.test.ts` already follows.
 *
 * Covers the contract declared in
 * `stories/context-traversal-capture/terminal-capture-activation.md`:
 *   8. an-origin-declaration-survives-the-process-and-fails-silent-in-both-directions
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";

import {
  readSessionOriginDeclaration,
  sessionOriginPath,
  writeSessionOriginDeclaration,
  SESSION_ORIGIN_EXT,
} from "./origin-declaration.js";
import { TRAVERSAL_TRACE_EXT } from "./sink.js";
import type { SessionOriginDeclaration } from "./session-origin.js";

function freshDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), `traversal-origin-${prefix}-`));
}

const CUT: SessionOriginDeclaration = {
  v: 1,
  origin: "cut",
  cutBy: "parent-window-id",
  cutFor: "trace-records-whether-a-session-was-cut-or-human-started",
  declaredAt: "2026-08-31T09:00:00.000Z",
};

test("an-origin-declaration-survives-the-process-and-fails-silent-in-both-directions: a declaration round-trips through a fresh reader over the same directory", () => {
  const dir = freshDir("roundtrip");

  assert.equal(writeSessionOriginDeclaration(dir, "session-a", CUT), true);
  assert.deepEqual(readSessionOriginDeclaration(dir, "session-a"), CUT);

  // Keyed by SESSION, which is the whole reason the declaration outranks the environment: a
  // neighbouring session's declaration is not this one's.
  assert.equal(readSessionOriginDeclaration(dir, "session-b"), null);
});

test("an-origin-declaration-survives-the-process-and-fails-silent-in-both-directions: a missing, unparseable or unrecognised declaration is ONE answer — no claim at all", () => {
  const dir = freshDir("unreadable");

  assert.equal(readSessionOriginDeclaration(dir, "never-declared"), null, "no file");

  fs.writeFileSync(sessionOriginPath(dir, "garbage"), "{not json", "utf8");
  assert.equal(readSessionOriginDeclaration(dir, "garbage"), null, "unparseable bytes");

  fs.writeFileSync(sessionOriginPath(dir, "future"), JSON.stringify({ v: 2, origin: "cut" }), "utf8");
  assert.equal(readSessionOriginDeclaration(dir, "future"), null, "a version this reader does not know");

  fs.writeFileSync(sessionOriginPath(dir, "bad-word"), JSON.stringify({ v: 1, origin: "agent" }), "utf8");
  assert.equal(readSessionOriginDeclaration(dir, "bad-word"), null, "an origin word that is neither");
});

test("an-origin-declaration-survives-the-process-and-fails-silent-in-both-directions: a second declaration replaces the first, because a session has one origin", () => {
  const dir = freshDir("replace");

  writeSessionOriginDeclaration(dir, "session-c", CUT);
  const corrected: SessionOriginDeclaration = {
    v: 1,
    origin: "human",
    cutBy: null,
    cutFor: null,
    declaredAt: "2026-08-31T10:00:00.000Z",
  };
  assert.equal(writeSessionOriginDeclaration(dir, "session-c", corrected), true);

  assert.deepEqual(readSessionOriginDeclaration(dir, "session-c"), corrected);
  // One document, not an appended log: a correction is a correction of the same fact.
  const raw = fs.readFileSync(sessionOriginPath(dir, "session-c"), "utf8");
  assert.equal(raw.trim().split("\n").length, 1);
  assert.equal(raw.endsWith("\n"), true, "a record this package writes ends with a newline, like the trace and the cursor");
});

test("an-origin-declaration-survives-the-process-and-fails-silent-in-both-directions: a missing directory is created, and an unwritable target returns false instead of throwing", () => {
  const base = freshDir("write");
  const missingDir = path.join(base, "nested", "traces");

  assert.equal(fs.existsSync(missingDir), false);
  assert.equal(writeSessionOriginDeclaration(missingDir, "session-d", CUT), true);
  assert.deepEqual(readSessionOriginDeclaration(missingDir, "session-d"), CUT);

  // Force a write failure without touching OS permissions (unreliable cross-platform): occupy the
  // directory's own path with a plain file, so creating a directory there is impossible everywhere.
  const blockedParent = path.join(base, "blocked-file");
  fs.writeFileSync(blockedParent, "occupied");
  const blockedDir = path.join(blockedParent, "traces");

  let threw = false;
  let result: unknown;
  try {
    result = writeSessionOriginDeclaration(blockedDir, "session-e", CUT);
  } catch {
    threw = true;
  }
  assert.equal(threw, false, "a declaration write must return false, never throw — telemetry never breaks a command");
  assert.equal(result, false);
  // ...and the session simply stays undeclared, which reads as `unknown`. The one outcome that never
  // happens is a guessed origin taking its place.
  assert.equal(readSessionOriginDeclaration(blockedDir, "session-e"), null);
});

test("an-origin-declaration-survives-the-process-and-fails-silent-in-both-directions: the declaration file never enters the trace index's scan", () => {
  // `listTraversalSessions` enumerates `*.jsonl`. A declaration sharing that suffix would appear in
  // the index as a session id ending in `.origin`, which is a phantom row rather than a trace.
  assert.equal(SESSION_ORIGIN_EXT, ".origin.json");
  assert.notEqual(SESSION_ORIGIN_EXT, TRAVERSAL_TRACE_EXT);
  assert.equal(SESSION_ORIGIN_EXT.endsWith(TRAVERSAL_TRACE_EXT), false);
  assert.equal(sessionOriginPath("/traces", "abc"), path.join("/traces", `abc${SESSION_ORIGIN_EXT}`));
});
