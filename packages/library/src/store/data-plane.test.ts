import assert from "node:assert/strict";
import test from "node:test";

import {
  ALLOW_DATA_PLANE_ENV,
  LIVE_DB_TEST_ENV,
  REMOTE_MARKER_DIR,
  dataPlaneRefusal,
  isDataPlaneBlockedSession,
  isTestRunnerProcess,
  testProcessRefusal,
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

test("the refusal no longer offers the REST control plane — that identity was retired (ADR-0254 D4)", () => {
  const message = dataPlaneRefusal({}, remoteMarker);
  assert.ok(message !== null);
  // Splitting on the blocked list is what makes this precise: the control plane must appear as a
  // LOSS, never in the still-available list. A bare `match`/`doesNotMatch` on the whole message
  // cannot tell those two apart.
  const [available, blocked] = message.split("Blocked:");
  assert.ok(available !== undefined && blocked !== undefined);
  assert.doesNotMatch(available, /control plane/);
  assert.match(blocked, /control plane/);
  assert.match(blocked, /ADR-0254/);
});

// ── a-test-process-never-dials-the-live-store ────────────────────────────────────────────────────

test("a-test-process-never-dials-the-live-store: every test runner's mark makes a process a test process, and nothing else does", () => {
  assert.equal(isTestRunnerProcess({ NODE_ENV: "test" }), true, "bun test and vitest set NODE_ENV=test");
  assert.equal(isTestRunnerProcess({ NODE_TEST_CONTEXT: "child-v8" }), true, "node --test sets NODE_TEST_CONTEXT");
  assert.equal(isTestRunnerProcess({}), false, "an ordinary CLI or server process");
  assert.equal(isTestRunnerProcess({ NODE_ENV: "production" }), false);
  assert.equal(isTestRunnerProcess({ NODE_ENV: "development", NODE_TEST_CONTEXT: "  " }), false, "a blank context is unset");
});

test("a-test-process-never-dials-the-live-store: a test process is refused unless it opts in with exactly STORYTREE_DB_LIVE=1", () => {
  assert.equal(LIVE_DB_TEST_ENV, "STORYTREE_DB_LIVE");
  assert.equal(testProcessRefusal({}), null, "an ordinary process is never refused");
  assert.equal(testProcessRefusal({ STORYTREE_DB_LIVE: "0" }), null, "the opt-in means nothing outside a test");
  assert.equal(testProcessRefusal({ NODE_ENV: "test", STORYTREE_DB_LIVE: "1" }), null, "a live-gated suite opts in");
  assert.equal(testProcessRefusal({ NODE_TEST_CONTEXT: "child", STORYTREE_DB_LIVE: "1" }), null);
  for (const env of [
    { NODE_ENV: "test" },
    { NODE_ENV: "test", STORYTREE_DB_LIVE: "0" },
    { NODE_ENV: "test", STORYTREE_DB_LIVE: "true" },
    { NODE_TEST_CONTEXT: "child-v8" },
  ]) {
    assert.equal(
      testProcessRefusal(env),
      "live store refused: this is a test process, and a test never dials the live store.\n" +
        "Inject the store the code under test reads instead (an InMemoryStore, a scripted curator, a fake\n" +
        "ensureDb). A deliberately live-gated suite sets STORYTREE_DB_LIVE=1 and uses createTestPool (ADR-0054).",
      JSON.stringify(env),
    );
  }
});
