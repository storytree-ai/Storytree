// Tests for the sidecar startup diagnostics (sidecar-startup.ts).
//
// WHAT THEY PIN:
//   - tailText / describeSidecarExit format the child's captured stderr into a self-contained failure
//     message so the `[main]` line names the REAL cause, not a generic "exited (code 1)".
//
// The electron/main.ts spawn wiring that consumes these is operator-attested.

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  tailText,
  describeSidecarExit,
  describeRunningSidecarExit,
} from "./sidecar-startup.js";

test("tailText: keeps the last N non-blank lines, trimmed", () => {
  const text = "line one\n\nline two  \nline three\n";
  assert.equal(tailText(text, 2), "line two\nline three");
});

test("tailText: empty / whitespace-only input yields an empty string (section omitted)", () => {
  assert.equal(tailText("", 5), "");
  assert.equal(tailText("   \n\n  \n", 5), "");
});

test("tailText: fewer lines than the cap returns them all", () => {
  assert.equal(tailText("only line", 5), "only line");
});

test("describeSidecarExit: includes the exit code and the real stderr cause", () => {
  const msg = describeSidecarExit(
    1,
    null,
    "Error [ERR_MODULE_NOT_FOUND]: Cannot find package '@storytree/notice-board'",
  );
  assert.match(msg, /exited \(code 1\) before reporting a port/);
  assert.match(msg, /last stderr:/);
  assert.match(msg, /ERR_MODULE_NOT_FOUND/);
});

test("describeSidecarExit: falls back to the signal when the code is null", () => {
  const msg = describeSidecarExit(null, "SIGKILL", "");
  assert.match(msg, /signal SIGKILL/);
  // No stderr captured → no dangling "last stderr:" section.
  assert.doesNotMatch(msg, /last stderr:/);
});

test("describeSidecarExit: null code and null signal degrades to 'code null'", () => {
  assert.match(describeSidecarExit(null, null, ""), /code null/);
});

test("describeRunningSidecarExit: distinguishes a post-handshake death and makes recovery explicit", () => {
  const msg = describeRunningSidecarExit(
    1,
    null,
    "Error [ERR_MODULE_NOT_FOUND]: Cannot find package '@storytree/notice-board'",
  );
  assert.match(msg, /after startup/);
  assert.match(msg, /local operations have stopped/);
  assert.match(msg, /Retry starts a fresh sidecar/);
  assert.match(msg, /ERR_MODULE_NOT_FOUND/);
  assert.doesNotMatch(msg, /before reporting a port/);
});
