/**
 * RECORDING WHAT A SESSION CLAIMED, on its own traversal declaration (ADR-0541 D2).
 *
 * This is the half that touches the FILESYSTEM, and it is a separate module from the dispatch for
 * exactly that reason: `noticeboard-dispatch.test.ts` proves the seam is called and — the assertion
 * that matters most there — that a caller supplying no recorder reaches nothing at all. Here the
 * recorder is exercised against a real directory, with every ambient input injected: the trace dir,
 * the capture toggle and the clock. No case can reach `~/.storytree/traces`.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";

import { readSessionOriginDeclaration } from "@storytree/context-traversal-capture";

import { claimedUnitsRecorderFor, recordClaimedUnitsOnTrace } from "./claimed-units-trace.js";

const AT = new Date("2026-09-07T09:00:00.000Z");
const LATER = new Date("2026-09-07T11:00:00.000Z");

function freshDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), `claimed-units-${prefix}-`));
}

test("a session's claimed units land on its own declaration, and the line names them", () => {
  const dir = freshDir("write");
  const record = recordClaimedUnitsOnTrace({ sessionId: "window-a", dir, enabled: true, now: () => AT });

  const said = record(["map-arc-inc-01", "cap-a"]);
  assert.match(said ?? "", /trace records this session's units: map-arc-inc-01, cap-a \(ADR-0541 D2\)/);

  const declaration = readSessionOriginDeclaration(dir, "window-a");
  // SEVERAL units are recorded as several — a session claiming two capabilities worked on two.
  assert.deepEqual(declaration?.units, ["map-arc-inc-01", "cap-a"]);
  // ⚠ AND NO ORIGIN IS CLAIMED. Claiming work says what a session is DOING, never how it came to
  // exist; stamping an origin here would be the inference ADR-0484 D7 refuses, arriving through a
  // door nobody would read as a provenance claim.
  assert.equal(declaration?.origin, null);
  assert.equal(declaration?.cutBy, null);
  assert.equal(declaration?.cutFor, null);
  assert.equal(declaration?.declaredAt, AT.toISOString());
});

test("units ACCUMULATE across declares, and a re-declare of the same unit rewrites nothing", () => {
  const dir = freshDir("again");
  const first = recordClaimedUnitsOnTrace({ sessionId: "window-b", dir, enabled: true, now: () => AT });
  assert.notEqual(first(["cap-a"]), null);
  const before = fs.readFileSync(path.join(dir, "window-b.origin.json"), "utf8");

  // The COMMON case: a session refines what it is working on and re-declares the same unit.
  const again = recordClaimedUnitsOnTrace({ sessionId: "window-b", dir, enabled: true, now: () => LATER });
  assert.equal(again(["cap-a"]), null, "nothing new to say");
  assert.equal(
    fs.readFileSync(path.join(dir, "window-b.origin.json"), "utf8"),
    before,
    "and nothing new written — a re-declare must not restamp `declaredAt` over the first one",
  );

  // A DIFFERENT unit accumulates rather than replacing.
  assert.notEqual(again(["cap-b"]), null);
  assert.deepEqual(readSessionOriginDeclaration(dir, "window-b")?.units, ["cap-a", "cap-b"]);
  assert.equal(readSessionOriginDeclaration(dir, "window-b")?.declaredAt, AT.toISOString());
});

test("an ESTABLISHED origin survives a claim untouched", () => {
  const dir = freshDir("origin");
  fs.writeFileSync(
    path.join(dir, "window-c.origin.json"),
    JSON.stringify({
      v: 1,
      origin: "cut",
      cutBy: "predecessor-window",
      cutFor: "some-arc",
      units: [],
      declaredAt: AT.toISOString(),
    }),
    "utf8",
  );

  recordClaimedUnitsOnTrace({ sessionId: "window-c", dir, enabled: true, now: () => LATER })(["cap-a"]);
  const after = readSessionOriginDeclaration(dir, "window-c");
  assert.equal(after?.origin, "cut");
  assert.equal(after?.cutBy, "predecessor-window");
  assert.equal(after?.cutFor, "some-arc");
  assert.deepEqual(after?.units, ["cap-a"]);
});

test("STORYTREE_TRAVERSAL=off writes NOTHING — a declaration is part of the trace", () => {
  // ⚠ ADR-0241 D2: an opted-out run writes no trace and reads back byte-identical. A declaration
  // sits beside the trace and is read by the same reader, so an opted-out declare must leave the
  // directory exactly as it found it.
  const dir = freshDir("off");
  const record = recordClaimedUnitsOnTrace({ sessionId: "window-d", dir, enabled: false, now: () => AT });
  assert.equal(record(["cap-a"]), null);
  assert.deepEqual(fs.readdirSync(dir), []);
});

test("no trace identity writes NOTHING, and says nothing", () => {
  // The primary checkout, CI and the lobby resolve no trace identity — exactly the runs that capture
  // no trace at all, so there is no row for a unit to label. Silent, never an error.
  const dir = freshDir("noid");
  const record = recordClaimedUnitsOnTrace({ sessionId: null, dir, enabled: true, now: () => AT });
  assert.equal(record(["cap-a"]), null);
  assert.deepEqual(fs.readdirSync(dir), []);
});

test("an UNWRITABLE home leaves the session unrecorded and says nothing — never a throw", () => {
  // Fail-silent on the capture path's own contract (ADR-0241 D3): a telemetry failure may not change
  // the caller's control flow, its envelope, or its exit code. The claim has already been banked.
  const dir = freshDir("blocked");
  // A FILE where the session's declaration must be written: the write fails, the read finds nothing.
  fs.writeFileSync(path.join(dir, "window-e.origin.json"), "", "utf8");
  fs.mkdirSync(path.join(dir, "window-e.origin.json.d"));
  const blocked = path.join(dir, "window-e.origin.json", "nested");
  const record = recordClaimedUnitsOnTrace({ sessionId: "nested", dir: blocked, enabled: true, now: () => AT });
  assert.equal(record(["cap-a"]), null);
});

test("units that name nobody are not recorded, and no file is created for them", () => {
  const dir = freshDir("blank");
  const record = recordClaimedUnitsOnTrace({ sessionId: "window-f", dir, enabled: true, now: () => AT });
  assert.equal(record([]), null);
  assert.equal(record(["", "   "]), null);
  assert.deepEqual(fs.readdirSync(dir), []);
});

test("with NO clock injected the declaration is stamped with a real time, not an absent one", () => {
  // The default clock is the one thing `main.ts` never overrides, so it is the one every real
  // declare runs on. A `declaredAt` that failed to parse would make the whole declaration
  // unreadable — the reader rejects a document it does not understand — and take the session's
  // origin down with it.
  const dir = freshDir("clock");
  const before = Date.now();
  recordClaimedUnitsOnTrace({ sessionId: "window-clock", dir, enabled: true })(["cap-a"]);
  const stamped = readSessionOriginDeclaration(dir, "window-clock")?.declaredAt;
  assert.equal(typeof stamped, "string");
  const parsed = Date.parse(stamped ?? "");
  assert.ok(!Number.isNaN(parsed), "the stamp is a real ISO instant");
  assert.ok(parsed >= before - 1000 && parsed <= Date.now() + 1000, "and it is NOW, not the epoch");
});

test("claimedUnitsRecorderFor: an unresolved trace identity records NOTHING, never under another id", () => {
  // The decision `main.ts` would otherwise have made inline, where nothing could witness it. The
  // primary checkout, CI and the lobby all resolve no trace identity, and those are exactly the runs
  // that capture no trace at all — so there is no row for a unit to label.
  const dir = freshDir("recorder");
  const previous = process.env["STORYTREE_TRAVERSAL_DIR"];
  process.env["STORYTREE_TRAVERSAL_DIR"] = dir;
  try {
    assert.equal(claimedUnitsRecorderFor(null)(["cap-a"]), null);
    assert.deepEqual(fs.readdirSync(dir), [], "and nothing at all was written");

    // A RESOLVED identity records under that id and no other.
    assert.notEqual(claimedUnitsRecorderFor({ sessionId: "window-g" })(["cap-a"]), null);
    assert.deepEqual(fs.readdirSync(dir), ["window-g.origin.json"]);
    assert.deepEqual(readSessionOriginDeclaration(dir, "window-g")?.units, ["cap-a"]);
  } finally {
    if (previous === undefined) delete process.env["STORYTREE_TRAVERSAL_DIR"];
    else process.env["STORYTREE_TRAVERSAL_DIR"] = previous;
  }
});
