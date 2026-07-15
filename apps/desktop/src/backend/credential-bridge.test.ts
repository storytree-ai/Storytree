// Integration test for the credential bridge (apps/desktop/src/backend/credential-bridge.ts).
//
// WHAT IT PINS: the bridge reads the brokered credential from the in-process keychain and
// passes it to the driver invocation seam — the credential reaches the backend driver
// in-process (under the correct env var), and NO renderer-reachable method returns the raw
// token. This is the complete hand-off: broker read → driver env injection → renderer safety.
//
// INTEGRATION TIER: drives the real CredentialBroker over an InMemoryKeychain fake (a
// stored token) and a stub driver invocation that records what credential env it received.
// No real OS keychain, no live SDK, no DB.
//
// DELETION TEST: if CredentialBridge were removed, every assertion here would fail. If the
// credential-to-driver hand-off were removed, the env-content assertions would fail. If a raw
// token getter were added to the bridge, the renderer-safety assertions would fail.

import { test } from "node:test";
import assert from "node:assert/strict";

import { CredentialBroker } from "../credential/broker.js";
import { InMemoryKeychain } from "../credential/in-memory-keychain.js";
import { CREDENTIAL_ENV_VAR } from "../credential/kinds.js";

// The module under test — does not exist until the implementation phase (right-kind red).
import { CredentialBridge } from "./credential-bridge.js";

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

/** A stub driver that captures every env it is called with and returns ok:true. */
function makeStubDriver(): {
  capturedEnvs: Array<Record<string, string>>;
  driver: (
    unitId: string,
    env: Record<string, string>,
    sink: (line: string) => void,
  ) => Promise<{ ok: boolean; body: string }>;
} {
  const capturedEnvs: Array<Record<string, string>> = [];
  return {
    capturedEnvs,
    driver: async (
      _unitId: string,
      env: Record<string, string>,
      _sink: (line: string) => void,
    ): Promise<{ ok: boolean; body: string }> => {
      capturedEnvs.push({ ...env });
      return { ok: true, body: "stub: ok" };
    },
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

// Pins the CORE outcome: the brokered oauth token reaches the driver invocation in-process,
// under the env var key CLAUDE_CODE_OAUTH_TOKEN, not as a bare return value.
test("credential-bridge: brokered oauth token reaches the driver env under CLAUDE_CODE_OAUTH_TOKEN", async () => {
  const keychain = new InMemoryKeychain();
  const broker = new CredentialBroker(keychain);

  const testToken = "sk-ant-oauth-test-token-abc123";
  await broker.store("oauth", testToken);

  const { capturedEnvs, driver } = makeStubDriver();
  const bridge = new CredentialBridge(broker, driver, {});

  const result = await bridge.build("some-unit-id", "oauth", () => undefined);

  assert.equal(result.ok, true, "build must propagate the driver's ok:true result");
  assert.equal(capturedEnvs.length, 1, "the driver must be called exactly once");

  const receivedEnv = capturedEnvs[0];
  assert.ok(receivedEnv !== undefined, "capturedEnvs[0] must exist");

  // Deletion test: if the bridge stopped injecting the token, this assertion fails.
  assert.equal(
    receivedEnv[CREDENTIAL_ENV_VAR.oauth],
    testToken,
    "the brokered token must reach the driver under CLAUDE_CODE_OAUTH_TOKEN",
  );
});

// Pins the DUAL-KIND support (ADR-0109 §2): the api-key kind maps to ANTHROPIC_API_KEY.
test("credential-bridge: brokered api-key token reaches the driver env under ANTHROPIC_API_KEY", async () => {
  const keychain = new InMemoryKeychain();
  const broker = new CredentialBroker(keychain);

  const apiKey = "sk-ant-api-key-xyz789";
  await broker.store("api-key", apiKey);

  const { capturedEnvs, driver } = makeStubDriver();
  const bridge = new CredentialBridge(broker, driver, {});

  await bridge.build("some-unit-id", "api-key", () => undefined);

  const receivedEnv = capturedEnvs[0];
  assert.ok(receivedEnv !== undefined, "capturedEnvs[0] must exist");

  assert.equal(
    receivedEnv[CREDENTIAL_ENV_VAR["api-key"]],
    apiKey,
    "the brokered api-key token must reach the driver under ANTHROPIC_API_KEY",
  );
});

// Pins the RENDERER SAFETY boundary (ADR-0109 d.4): the bridge's build() result does NOT
// carry the raw token back, and no method on the public surface exposes it.
test("credential-bridge: no renderer-reachable path returns the raw token", async () => {
  const keychain = new InMemoryKeychain();
  const broker = new CredentialBroker(keychain);

  const secret = "super-secret-renderer-must-not-see-xyz";
  await broker.store("oauth", secret);

  const { driver } = makeStubDriver();
  const bridge = new CredentialBridge(broker, driver, {});

  // The build() return value must not carry the raw token.
  const buildResult = await bridge.build("some-unit-id", "oauth", () => undefined);
  const resultMap = buildResult as unknown as Record<string, unknown>;
  assert.equal(
    resultMap["token"],
    undefined,
    "build result must NOT carry a 'token' field — the renderer must never receive the raw token",
  );
  assert.ok(
    !Object.values(resultMap).includes(secret),
    "build result must NOT contain the raw token value in any field",
  );

  // No token-getter method exists on the bridge's public surface.
  const proto = Object.getPrototypeOf(bridge) as object;
  const publicMethods = Object.getOwnPropertyNames(proto).filter(
    (k) => k !== "constructor",
  );
  const tokenGetters = publicMethods.filter((k) =>
    /token|secret|credential|password/i.test(k),
  );
  assert.deepEqual(
    tokenGetters,
    [],
    `bridge must NOT expose renderer-reachable token getters; found: [${tokenGetters.join(", ")}]`,
  );
});

// Pins the GUARD: when no credential is held, the bridge rejects with a typed error and
// the driver is never called. The renderer receives an error status, not an empty token.
test("credential-bridge: build rejects with a typed error when no credential is held", async () => {
  const keychain = new InMemoryKeychain();
  const broker = new CredentialBroker(keychain);
  // No token stored — keychain is empty.

  const { capturedEnvs, driver } = makeStubDriver();
  const bridge = new CredentialBridge(broker, driver, {});

  await assert.rejects(
    () => bridge.build("some-unit-id", "oauth", () => undefined),
    (err: unknown) => {
      assert.ok(err instanceof Error, "must throw an Error");
      assert.ok(
        /no.*credential|credential.*not.*found|no.*token|token.*absent|not.*stored/i.test(
          err.message,
        ),
        `error message must indicate missing credential; got: "${err.message}"`,
      );
      return true;
    },
    "bridge must reject when no credential is held — driver must not be called without a token",
  );

  // The driver must NOT have been called — no empty-string token injection.
  assert.equal(
    capturedEnvs.length,
    0,
    "the driver must NOT be invoked when no credential is held",
  );
});

test("credential-bridge: api-key is scoped to ANTHROPIC_API_KEY for the driver call", async () => {
  const broker = new CredentialBroker(new InMemoryKeychain());
  await broker.store("api-key", "api-test-value");
  const env: Record<string, string | undefined> = {};
  let during: Record<string, string | undefined> = {};

  const bridge = new CredentialBridge(
    broker,
    async () => {
      during = { ...env };
      return { ok: true, body: "stub: ok" };
    },
    env,
  );

  await bridge.build("some-unit-id", "api-key", () => undefined);

  assert.equal(during.ANTHROPIC_API_KEY, "api-test-value");
  assert.equal(during.CLAUDE_CODE_OAUTH_TOKEN, undefined);
  assert.equal(during.CURSOR_API_KEY, undefined);
  assert.equal(env.ANTHROPIC_API_KEY, undefined);
});

test("credential-bridge: restores the target env after a thrown driver", async () => {
  const broker = new CredentialBroker(new InMemoryKeychain());
  await broker.store("api-key", "api-test-value");
  const env: Record<string, string | undefined> = {
    ANTHROPIC_API_KEY: "previous-value",
  };

  const bridge = new CredentialBridge(
    broker,
    async () => {
      assert.equal(env.ANTHROPIC_API_KEY, "api-test-value");
      throw new Error("driver failed");
    },
    env,
  );

  await assert.rejects(
    () => bridge.build("some-unit-id", "api-key", () => undefined),
    /driver failed/,
  );
  assert.equal(env.ANTHROPIC_API_KEY, "previous-value");
});
