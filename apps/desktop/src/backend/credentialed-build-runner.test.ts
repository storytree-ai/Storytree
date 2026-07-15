// Integration test for the credentialed build runner (credentialed-build-runner.ts) — the
// composition that wires CredentialBridge into the sidecar's build invocation path
// (ADR-0109 Step 2 / ADR-0113 §5, the desktop story's local-credential-wiring glue).
//
// WHAT IT PINS: the keychain-brokered credential reaches the AMBIENT env the SDK leaf reads
// (CLAUDE_CODE_OAUTH_TOKEN / ANTHROPIC_API_KEY) for exactly the duration of a build, with the
// secrets.ts precedence posture — explicit env wins, then the keychain via the bridge, then
// the secrets-file tier — and the fail-closed typed rejection when no credential exists
// anywhere (the driver is never invoked without a token).
//
// INTEGRATION TIER: drives the real CredentialBridge + the real CredentialBroker over an
// InMemoryKeychain fake and a stub BuildRunner that snapshots the ambient env it ran under.
// The ambient env is an injected plain object (never process.env), so the test is hermetic.
//
// DELETION TEST: if credentialedBuildRunner were removed, every assertion fails. If the
// keychain→env injection were removed, the injected-token assertions fail. If the explicit-env
// precedence were removed, the env-wins assertion fails. If the fail-closed guard were
// removed, the no-credential rejection assertion fails.

import { test } from "node:test";
import assert from "node:assert/strict";

import type { BuildEnvelope, BuildRunner } from "@storytree/drive/build-worker";

import { CredentialBroker } from "../credential/broker.js";
import { InMemoryKeychain } from "../credential/in-memory-keychain.js";
import { CREDENTIAL_ENV_VAR } from "../credential/kinds.js";

// The module under test — the composition glue this capability's wiring leg adds.
import { credentialedBuildRunner } from "./credentialed-build-runner.js";

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

/** A stub base runner that snapshots the ambient env at invocation time and returns `envelope`. */
function makeStubRunner(
  env: Record<string, string | undefined>,
  envelope: BuildEnvelope = { ok: true, body: "stub: ok" },
): { calls: string[]; envSnapshots: Array<Record<string, string | undefined>>; runner: BuildRunner } {
  const calls: string[] = [];
  const envSnapshots: Array<Record<string, string | undefined>> = [];
  return {
    calls,
    envSnapshots,
    runner: async (unitId) => {
      calls.push(unitId);
      envSnapshots.push({ ...env });
      return envelope;
    },
  };
}

const OAUTH_VAR = CREDENTIAL_ENV_VAR.oauth;
const API_KEY_VAR = CREDENTIAL_ENV_VAR["api-key"];

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

// Pins the CORE outcome (the wiring leg): a keychain-held oauth token reaches the ambient env
// the SDK leaf reads, for the duration of the build, and is scrubbed back out afterwards — no
// long-lived raw token parked in the sidecar's env.
test("credentialed-build-runner: keychain oauth token is injected into the ambient env for the build, then restored", async () => {
  const keychain = new InMemoryKeychain();
  const broker = new CredentialBroker(keychain);
  await broker.store("oauth", "kc-oauth-token-abc");

  const env: Record<string, string | undefined> = {};
  const { calls, envSnapshots, runner: base } = makeStubRunner(env);
  const runner = credentialedBuildRunner({ broker, runner: base, env });

  const result = await runner("some-unit", () => undefined);

  assert.equal(result.ok, true, "the base runner's envelope must propagate");
  assert.deepEqual(calls, ["some-unit"], "the base runner must run exactly once");
  assert.equal(
    envSnapshots[0]?.[OAUTH_VAR],
    "kc-oauth-token-abc",
    "the brokered token must be ambient (CLAUDE_CODE_OAUTH_TOKEN) while the build runs",
  );
  assert.equal(
    env[OAUTH_VAR],
    undefined,
    "the token must be scrubbed from the ambient env once the build resolves",
  );
});

// Pins the PRECEDENCE anchor (the secrets.ts posture): an env var the operator EXPLICITLY set
// is never overridden by the keychain — the base runner runs under the explicit value.
test("credentialed-build-runner: an explicitly-set env credential wins over the keychain", async () => {
  const keychain = new InMemoryKeychain();
  const broker = new CredentialBroker(keychain);
  await broker.store("oauth", "kc-token-must-not-win");

  const env: Record<string, string | undefined> = { [OAUTH_VAR]: "explicit-env-token" };
  const { envSnapshots, runner: base } = makeStubRunner(env);
  const runner = credentialedBuildRunner({
    broker,
    runner: base,
    env,
    explicitEnvVars: new Set([OAUTH_VAR]),
  });

  await runner("some-unit", () => undefined);

  assert.equal(
    envSnapshots[0]?.[OAUTH_VAR],
    "explicit-env-token",
    "an operator-set env credential must never be overridden by the keychain",
  );
});

// Pins the DUAL-KIND support (ADR-0109 §2): with only the metered key held, ANTHROPIC_API_KEY
// is the var injected — the same in-process path, kind-tagged.
test("credentialed-build-runner: api-key kind is injected under ANTHROPIC_API_KEY when oauth is absent", async () => {
  const keychain = new InMemoryKeychain();
  const broker = new CredentialBroker(keychain);
  await broker.store("api-key", "kc-api-key-xyz");

  const env: Record<string, string | undefined> = {};
  const { envSnapshots, runner: base } = makeStubRunner(env);
  const runner = credentialedBuildRunner({ broker, runner: base, env });

  await runner("some-unit", () => undefined);

  assert.equal(
    envSnapshots[0]?.[API_KEY_VAR],
    "kc-api-key-xyz",
    "the metered key must reach the ambient env under ANTHROPIC_API_KEY",
  );
  assert.equal(envSnapshots[0]?.[OAUTH_VAR], undefined, "no oauth var must be forged");
});

// Pins the kind PREFERENCE: when both kinds are held, the subscription oauth token is the one
// brokered (the desktop's primary path, ADR-0109 §5) — never both at once.
test("credentialed-build-runner: oauth is preferred when both kinds are held", async () => {
  const keychain = new InMemoryKeychain();
  const broker = new CredentialBroker(keychain);
  await broker.store("oauth", "kc-oauth");
  await broker.store("api-key", "kc-api-key");

  const env: Record<string, string | undefined> = {};
  const { envSnapshots, runner: base } = makeStubRunner(env);
  const runner = credentialedBuildRunner({ broker, runner: base, env });

  await runner("some-unit", () => undefined);

  assert.equal(envSnapshots[0]?.[OAUTH_VAR], "kc-oauth", "oauth must be the brokered kind");
  assert.equal(
    envSnapshots[0]?.[API_KEY_VAR],
    undefined,
    "the api-key must not ride along when oauth is brokered",
  );
});

// Pins the SECRETS-FILE tier: keychain empty but the env already carries a (file-hydrated)
// token → the build runs under it untouched. The keychain tier only fills, never blanks.
test("credentialed-build-runner: falls through to a file-hydrated env token when the keychain is empty", async () => {
  const keychain = new InMemoryKeychain();
  const broker = new CredentialBroker(keychain); // nothing stored

  const env: Record<string, string | undefined> = { [OAUTH_VAR]: "file-hydrated-token" };
  const { calls, envSnapshots, runner: base } = makeStubRunner(env);
  const runner = credentialedBuildRunner({ broker, runner: base, env });

  await runner("some-unit", () => undefined);

  assert.deepEqual(calls, ["some-unit"], "the build must still run on the secrets-file tier");
  assert.equal(
    envSnapshots[0]?.[OAUTH_VAR],
    "file-hydrated-token",
    "the file-hydrated token must be left in place",
  );
});

// Pins the FAIL-CLOSED guard (cb-fails-closed-when-unsigned): no env, no keychain, no file →
// the bridge's typed rejection surfaces and the base runner is NEVER invoked — an honest
// not-signed-in failure, never an empty token silently accepted.
test("credentialed-build-runner: rejects with the bridge's typed error when no credential exists anywhere", async () => {
  const keychain = new InMemoryKeychain();
  const broker = new CredentialBroker(keychain); // nothing stored

  const env: Record<string, string | undefined> = {};
  const { calls, runner: base } = makeStubRunner(env);
  const runner = credentialedBuildRunner({ broker, runner: base, env });

  await assert.rejects(
    () => runner("some-unit", () => undefined),
    (err: unknown) => {
      assert.ok(err instanceof Error, "must reject with an Error");
      assert.ok(
        /no.*credential|not.*stored/i.test(err.message),
        `the message must indicate the missing credential; got: "${err.message}"`,
      );
      return true;
    },
  );
  assert.equal(calls.length, 0, "the base runner must never run without a credential");
});

test("credentialed-build-runner: a stray CURSOR_API_KEY env does not count as Claude auth", async () => {
  const broker = new CredentialBroker(new InMemoryKeychain());
  const env: Record<string, string | undefined> = {
    CURSOR_API_KEY: "cursor-env-test-value",
  };
  const { calls, runner: base } = makeStubRunner(env);
  const runner = credentialedBuildRunner({
    broker,
    runner: base,
    env,
    explicitEnvVars: new Set(["CURSOR_API_KEY"]),
  });

  await assert.rejects(
    () => runner("some-unit", () => undefined),
    /no.*credential|not.*stored/i,
  );
  assert.deepEqual(calls, [], "Cursor's env must not invoke the Claude runner");
});

// Pins ENVELOPE FIDELITY: the base runner's full envelope — including `next` — survives the
// bridge hop (BridgeResult carries only {ok, body}; the wrapper must not lose the rest).
test("credentialed-build-runner: the base runner's full envelope (incl. next) survives the bridge path", async () => {
  const keychain = new InMemoryKeychain();
  const broker = new CredentialBroker(keychain);
  await broker.store("oauth", "kc-token");

  const env: Record<string, string | undefined> = {};
  const envelope: BuildEnvelope = { ok: true, body: "done", next: ["storytree adr list"] };
  const { runner: base } = makeStubRunner(env, envelope);
  const runner = credentialedBuildRunner({ broker, runner: base, env });

  const result = await runner("some-unit", () => undefined);

  assert.deepEqual(result, envelope, "the envelope must pass through byte-for-byte");
});
