// Tests for the sidecar startup diagnostics + graceful-degrade cores (sidecar-startup.ts).
//
// WHAT THEY PIN:
//   - acquireBackendStore turns a rejecting pool factory into a TYPED degraded result (with the reason),
//     never a throw — the property that lets the sidecar still listen + serve the read shell on a down DB.
//   - degradedBackend answers every route honestly: health `unreachable` (→ the studio "Start DB" banner),
//     empty assets, null overlays — never a throw, never a forged green.
//   - tailText / describeSidecarExit format the child's captured stderr into a self-contained failure
//     message so the `[main]` line names the REAL cause, not a generic "exited (code 1)".
//
// This is the CI-provable core of Increment 1; the electron/main.ts spawn + backend-entry.ts wiring that
// consume these are operator-attested (a node:test over them would open a real DB / spawn a billed SDK).

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  acquireBackendStore,
  degradedBackend,
  tailText,
  describeSidecarExit,
} from "./sidecar-startup.js";

test("acquireBackendStore: a resolving factory yields the live handle", async () => {
  const handle = { pool: "P", connector: "C" };
  const res = await acquireBackendStore(async () => handle);
  assert.equal(res.ok, true);
  assert.equal(res.ok && res.handle, handle);
});

test("acquireBackendStore: a rejecting factory degrades to a typed reason, never throws", async () => {
  const res = await acquireBackendStore(async () => {
    throw new Error("createPool: no IAM principal resolved — set STORYTREE_DB_USER");
  });
  assert.equal(res.ok, false);
  assert.equal(res.ok, false);
  if (!res.ok) assert.match(res.reason, /STORYTREE_DB_USER/);
});

test("acquireBackendStore: a non-Error rejection is stringified into the reason", async () => {
  const res = await acquireBackendStore(async () => {
    throw "ECONNREFUSED";
  });
  assert.equal(res.ok, false);
  if (!res.ok) assert.equal(res.reason, "ECONNREFUSED");
});

test("degradedBackend: health reports unreachable (drives the Start-DB banner)", async () => {
  const b = degradedBackend();
  assert.deepEqual(await b.health(), { db: "unreachable" });
});

test("degradedBackend: assets are empty and every overlay is null (under-claim, never a throw)", async () => {
  const b = degradedBackend();
  assert.deepEqual(await b.listAssets(), []);
  assert.equal(await b.activeSessions(), null);
  assert.equal(await b.inFlightBuilds(), null);
  assert.equal(await b.inFlightClaims?.(), null);
  assert.equal(await b.latestVerdicts(), null);
  assert.equal(await b.verdictEvents?.(), null);
});

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
