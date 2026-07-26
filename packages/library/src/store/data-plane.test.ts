import assert from "node:assert/strict";
import test from "node:test";

import {
  ALLOW_DATA_PLANE_ENV,
  REMOTE_MARKER_DIR,
  dataPlaneRefusal,
  isDataPlaneBlockedSession,
} from "./data-plane.js";

/** A probe that reports every directory absent — the laptop default. */
const noDirs = { dirExists: () => false };
/** A probe that reports only the harness's remote marker present. */
const remoteMarker = { dirExists: (p: string) => p === REMOTE_MARKER_DIR };

test("a laptop session is never refused", () => {
  assert.equal(isDataPlaneBlockedSession({}, noDirs), false);
  assert.equal(dataPlaneRefusal({}, noDirs), null);
});

test("the harness remote-marker directory alone blocks the data plane", () => {
  assert.equal(isDataPlaneBlockedSession({}, remoteMarker), true);
});

test("a remote-shaped credential plus an egress proxy blocks the data plane", () => {
  const env = {
    GOOGLE_APPLICATION_CREDENTIALS_JSON: '{"type":"service_account"}',
    HTTPS_PROXY: "http://127.0.0.1:8080",
  };
  assert.equal(isDataPlaneBlockedSession(env, noDirs), true);
});

test("either half of the credential+proxy pair alone is NOT enough (conservative: a false positive would refuse the owner's laptop)", () => {
  const credOnly = { GOOGLE_APPLICATION_CREDENTIALS_JSON: '{"type":"service_account"}' };
  const proxyOnly = { HTTPS_PROXY: "http://127.0.0.1:8080" };
  assert.equal(isDataPlaneBlockedSession(credOnly, noDirs), false);
  assert.equal(isDataPlaneBlockedSession(proxyOnly, noDirs), false);
});

test("empty-string env values do not count as set", () => {
  const env = { GOOGLE_APPLICATION_CREDENTIALS_JSON: "  ", HTTPS_PROXY: "" };
  assert.equal(isDataPlaneBlockedSession(env, noDirs), false);
});

test(`${ALLOW_DATA_PLANE_ENV} overrides every block signal`, () => {
  const env = {
    [ALLOW_DATA_PLANE_ENV]: "1",
    GOOGLE_APPLICATION_CREDENTIALS_JSON: '{"type":"service_account"}',
    HTTPS_PROXY: "http://127.0.0.1:8080",
  };
  assert.equal(isDataPlaneBlockedSession(env, remoteMarker), false);
  assert.equal(dataPlaneRefusal(env, remoteMarker), null);
});

test("the refusal names the mechanism, the ADR, and the override — not a port block", () => {
  const message = dataPlaneRefusal({}, remoteMarker);
  assert.ok(message !== null);
  // The mechanism ADR-0250 corrected: TLS re-termination + client-mTLS, NOT "port 3307 is blocked".
  assert.match(message, /re-terminates TLS/);
  assert.match(message, /client-mTLS/);
  assert.match(message, /ADR-0250/);
  assert.match(message, new RegExp(ALLOW_DATA_PLANE_ENV));
  // It must point somewhere useful rather than just refusing.
  assert.match(message, /laptop/);
});
