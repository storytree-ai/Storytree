import assert from "node:assert/strict";
import test from "node:test";

import { resolveStoreDoor } from "@storytree/drive";
import { HttpStore, HttpStoreError } from "@storytree/storage-protocol";

import {
  CREDENTIAL_FREE_STORE_DOOR_URL,
  credentialFreeTestEnvironment,
  isStandardTestLeg,
} from "./gate-test-environment.js";

test("the declared and affected test legs are credential-free, but a check command is not", () => {
  assert.equal(isStandardTestLeg("pnpm -r --no-bail test"), true);
  assert.equal(isStandardTestLeg("pnpm --filter @storytree/cli --filter @storytree/drive test"), true);
  assert.equal(isStandardTestLeg("pnpm check:unit-test"), false);
});

test("the standard test leg replaces an ambient store door with a fail-closed local sentinel", async () => {
  const environment = credentialFreeTestEnvironment("pnpm -r --no-bail test", {
    PATH: "test-path",
    STORYTREE_DB_USER: "hydrated-developer-user",
    STORYTREE_STORE_URL: "https://live.example/api/store",
  });

  assert.equal(environment.PATH, "test-path", "ordinary execution settings stay intact");
  assert.equal(environment.STORYTREE_DB_USER, "hydrated-developer-user", "the proof does not rely on stripping secrets");
  assert.equal(environment.STORYTREE_STORE_URL, CREDENTIAL_FREE_STORE_DOOR_URL);
  const door = resolveStoreDoor(environment);
  assert.ok(door, "the store-door precedence wins over the direct connector path");
  await assert.rejects(
    () => new HttpStore(door).getDoc("an-implicit-live-read"),
    // The MECHANISM, not the runtime's wording. This used to match
    // `/fetch failed|ECONNREFUSED|bad port/i`, which pins undici's phrasing: bun's fetch says "Was
    // there a typo in the url or port?" instead and the leg went red under `bun test` for a reason
    // that had nothing to do with the claim (`bun-runtime-migration-arc` inc-11). A transport
    // failure against the SENTINEL door is what the test is actually about, and asserting it
    // structurally is stricter than the wording was — it pins WHICH door was dialed, which no
    // message regex ever did.
    (err: unknown) => {
      assert.ok(err instanceof HttpStoreError, `expected an HttpStoreError, got ${String(err)}`);
      assert.equal(err.status, 0, "a transport failure — nothing answered, so there is no HTTP status");
      assert.ok(
        err.url.startsWith(CREDENTIAL_FREE_STORE_DOOR_URL),
        `the read must dial the credential-free sentinel, not a hydrated door — got ${err.url}`,
      );
      return true;
    },
    "an implicit live Library read fails locally instead of falling through to hydrated direct credentials",
  );
});

test("a non-test gate leg keeps its environment, and an explicit fixture door can still override the sentinel", () => {
  const ambient = { STORYTREE_STORE_URL: "http://127.0.0.1:4111/api/store" };
  assert.equal(credentialFreeTestEnvironment("pnpm -r --no-bail typecheck", ambient), ambient);

  const fixtureEnvironment = {
    ...credentialFreeTestEnvironment("pnpm -r --no-bail test", ambient),
    STORYTREE_STORE_URL: "http://127.0.0.1:4111/api/store",
  };
  assert.equal(resolveStoreDoor(fixtureEnvironment)?.baseUrl, "http://127.0.0.1:4111/api/store");
});
