import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import path from "node:path";
import { test } from "node:test";

import { defaultSecretsFile, loadLocalSecrets, SECRET_KEYS } from "./secrets.js";

function withFixture(content: string | null, env: NodeJS.ProcessEnv): string[] {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "storytree-secrets-"));
  const file = path.join(dir, "secrets.json");
  try {
    if (content !== null) fs.writeFileSync(file, content);
    return loadLocalSecrets({ ...env, STORYTREE_SECRETS_FILE: file });
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

test("fills only unset known keys from the file; env always wins", () => {
  const env: NodeJS.ProcessEnv = { STORYTREE_DB_USER: "already@set.example" };
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "storytree-secrets-"));
  const file = path.join(dir, "secrets.json");
  fs.writeFileSync(
    file,
    JSON.stringify({
      CLAUDE_CODE_OAUTH_TOKEN: "tok-from-file",
      CURSOR_API_KEY: "cursor-from-file",
      STORYTREE_DB_USER: "file@user.example",
      NOT_A_KNOWN_KEY: "must-not-leak",
    }),
  );
  const target: NodeJS.ProcessEnv = { ...env, STORYTREE_SECRETS_FILE: file };
  const filled = loadLocalSecrets(target);
  fs.rmSync(dir, { recursive: true, force: true });
  assert.deepEqual(filled, ["CLAUDE_CODE_OAUTH_TOKEN", "CURSOR_API_KEY"]);
  assert.equal(target["CLAUDE_CODE_OAUTH_TOKEN"], "tok-from-file");
  assert.equal(target["CURSOR_API_KEY"], "cursor-from-file");
  assert.equal(target["STORYTREE_DB_USER"], "already@set.example"); // env wins
  assert.equal(target["NOT_A_KNOWN_KEY"], undefined); // no arbitrary injection
});

test("missing file, malformed JSON, and non-object payloads are silent no-ops", () => {
  assert.deepEqual(withFixture(null, {}), []);
  assert.deepEqual(withFixture("not json {", {}), []);
  assert.deepEqual(withFixture('"just a string"', {}), []);
  assert.deepEqual(withFixture(JSON.stringify({ CLAUDE_CODE_OAUTH_TOKEN: "   " }), {}), []); // blank refused
});

test("the default location is ~/.storytree/secrets.json and the key list is exact", () => {
  assert.equal(defaultSecretsFile(), path.join(os.homedir(), ".storytree", "secrets.json"));
  assert.deepEqual(
    [...SECRET_KEYS],
    ["CLAUDE_CODE_OAUTH_TOKEN", "CURSOR_API_KEY", "STORYTREE_DB_USER"],
  );
});
