import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { CredentialBroker } from "./broker.js";
import { InMemoryKeychain } from "./in-memory-keychain.js";
import { CREDENTIAL_ENV_VAR } from "./kinds.js";

// Contract `keychain-round-trip` — a token stored round-trips, and clearing removes it.
test("keychain-round-trip: a stored token reads back, then clears to null", async () => {
  const keychain = new InMemoryKeychain();
  const broker = new CredentialBroker(keychain);

  await broker.store("oauth", "sk-oauth-abc123");
  assert.equal(await broker.read("oauth"), "sk-oauth-abc123");

  assert.equal(await broker.clear("oauth"), true);
  assert.equal(await broker.read("oauth"), null);
});

// Each supported credential is held under its own account and maps to exactly one env var.
test("two-kind-keychain-independence: credential kinds are mapped, namespaced, read, and cleared independently", async () => {
  const keychain = new InMemoryKeychain();
  const broker = new CredentialBroker(keychain);

  await broker.store("oauth", "oauth-token");
  await broker.store("api-key", "api-key-token");

  assert.equal(await broker.read("oauth"), "oauth-token");
  assert.equal(await broker.read("api-key"), "api-key-token");
  assert.equal(new Set([broker.account("oauth"), broker.account("api-key")]).size, 2);

  assert.deepEqual(CREDENTIAL_ENV_VAR, {
    oauth: "CLAUDE_CODE_OAUTH_TOKEN",
    "api-key": "ANTHROPIC_API_KEY",
  });

  assert.equal(await broker.clear("oauth"), true);
  assert.equal(await broker.read("oauth"), null);
  assert.equal(await broker.read("api-key"), "api-key-token");

  assert.equal(await broker.clear("api-key"), true);
  assert.equal(await broker.read("api-key"), null);
});

// Contract `keychain-only-no-leak` — the credential's ONLY sink is the keychain port;
// the broker has no code path to plaintext disk or to the renderer's localStorage.
test("keychain-only-no-leak: the credential's only sink is the keychain", async () => {
  const keychain = new InMemoryKeychain();
  const broker = new CredentialBroker(keychain);
  const secret = "super-secret-oauth-token-xyz";

  await broker.store("oauth", secret);

  // Behavioural: the credential lives ONLY in the keychain port — nowhere else.
  assert.deepEqual([...keychain.snapshot().values()], [secret]);

  // Structural: the broker source has no code path off the keychain port — it imports
  // no filesystem and references no localStorage, so the credential can reach neither
  // plaintext disk nor the renderer. (The tsconfig's no-dom lib makes `localStorage`
  // a compile error too; this asserts the boundary independently of the build.) We scan
  // the CODE only — comments are stripped so prose describing the boundary can't trip it.
  const brokerCode = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "broker.ts"), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/.*$/gm, "");
  assert.ok(!/localStorage/.test(brokerCode), "broker must not reference localStorage");
  assert.ok(!/\bfrom\s+["']node:fs["']|\brequire\(\s*["']fs["']|writeFile/.test(brokerCode), "broker must not write to the filesystem");
});
