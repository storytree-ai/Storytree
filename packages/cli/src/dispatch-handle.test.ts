import assert from "node:assert/strict";
import test from "node:test";

import {
  describeReading,
  isVerdict,
  normalizeHandle,
  readDispatchHandle,
  type HandleIo,
} from "./dispatch-handle.js";

/** A filesystem of exactly the files named. Absent = absent; no real disk, no real gate run. */
function io(files: Record<string, string>): HandleIo {
  return {
    exists: (p) => Object.prototype.hasOwnProperty.call(files, p),
    readText: (p) => files[p] ?? "",
  };
}

const LOG = "/tmp/gate-20260809-1.log";
const EXIT = `${LOG}.exit`;

test("a settled sentinel of 0 is a PASS carrying the real exit code", () => {
  const r = readDispatchHandle(LOG, io({ [LOG]: "…", [EXIT]: "0\n" }));
  assert.equal(r.state, "passed");
  assert.equal(r.exitCode, 0);
  assert.ok(isVerdict(r), "a settled zero IS citable as an outcome");
  assert.match(describeReading(r), /^PASS/);
});

test("a settled non-zero sentinel is a FAIL carrying the real exit code", () => {
  const r = readDispatchHandle(LOG, io({ [LOG]: "…", [EXIT]: "1\n" }));
  assert.equal(r.state, "failed");
  assert.equal(r.exitCode, 1);
  assert.ok(isVerdict(r));
  assert.match(describeReading(r), /^FAIL/);
});

// THE LOAD-BEARING CASE (ADR-0328 D3). A job still running must never read as a verdict — this is
// the confident FALSE terminal the whole handle exists to prevent.
test("a dispatched job with no sentinel yet is RUNNING — never a pass, never a fail", () => {
  const r = readDispatchHandle(LOG, io({ [LOG]: "partial output…" }));
  assert.equal(r.state, "running");
  assert.equal(r.exitCode, undefined, "a running job has no exit code to report");
  assert.equal(isVerdict(r), false, "RUNNING must not be citable as an outcome");
  assert.doesNotMatch(describeReading(r), /^(PASS|FAIL)/);
  assert.match(describeReading(r), /UNVERIFIED/);
});

test("nothing at the handle at all is UNVERIFIED, distinct from a running job", () => {
  const r = readDispatchHandle(LOG, io({}));
  assert.equal(r.state, "not-dispatched");
  assert.equal(isVerdict(r), false);
  assert.match(describeReading(r), /UNVERIFIED/);
});

test("an unparseable sentinel is UNVERIFIED — a failure to OBSERVE, not a failure of the job", () => {
  const r = readDispatchHandle(LOG, io({ [LOG]: "…", [EXIT]: "killed by signal" }));
  assert.equal(r.state, "unreadable");
  assert.equal(r.exitCode, undefined);
  assert.equal(isVerdict(r), false);
  assert.doesNotMatch(describeReading(r), /^FAIL/, "an unreadable sentinel is not an adverse verdict");
});

test("an empty sentinel is UNVERIFIED, not a pass (an empty file must never parse as 0)", () => {
  const r = readDispatchHandle(LOG, io({ [LOG]: "…", [EXIT]: "   \n" }));
  assert.equal(r.state, "unreadable");
  assert.equal(isVerdict(r), false);
});

test("either half of the printed handle resolves to the same reading", () => {
  const files = { [LOG]: "…", [EXIT]: "0\n" };
  assert.deepEqual(readDispatchHandle(LOG, io(files)), readDispatchHandle(EXIT, io(files)));
  assert.deepEqual(normalizeHandle(EXIT), { logPath: LOG, exitFile: EXIT });
  assert.deepEqual(normalizeHandle(`  ${LOG}  `), { logPath: LOG, exitFile: EXIT });
});

test("a negative status (signal-shaped) is a FAIL, not an unreadable sentinel", () => {
  const r = readDispatchHandle(LOG, io({ [LOG]: "…", [EXIT]: "-1" }));
  assert.equal(r.state, "failed");
  assert.equal(r.exitCode, -1);
});

// POSITIVE CONTROL (`asset:unrun-check-is-unverified-not-refuted`). Every assertion above is about
// a NON-verdict; an `isVerdict` that always returned false would satisfy most of them. This pins
// the opposite answer, so a dead predicate cannot pass the suite.
test("control: isVerdict discriminates — it is true for settled states and false for unsettled", () => {
  const settled = [
    readDispatchHandle(LOG, io({ [LOG]: "…", [EXIT]: "0" })),
    readDispatchHandle(LOG, io({ [LOG]: "…", [EXIT]: "2" })),
  ];
  const unsettled = [
    readDispatchHandle(LOG, io({ [LOG]: "…" })),
    readDispatchHandle(LOG, io({})),
    readDispatchHandle(LOG, io({ [LOG]: "…", [EXIT]: "nope" })),
  ];
  assert.deepEqual(settled.map(isVerdict), [true, true]);
  assert.deepEqual(unsettled.map(isVerdict), [false, false, false]);
});
