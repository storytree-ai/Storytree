import assert from "node:assert/strict";
import test from "node:test";

import { BROKER_HANDSHAKE_ENV } from "./codex-claim-broker-client.js";
import { buildManagedCodexWorktreeCreate } from "./codex-worktree-create-bundle.js";

/**
 * The bootstrap payload's defining property after ADR-0368: it holds NO credential and opens NO
 * database connection.
 *
 * This is asserted against the BUNDLE rather than the source, deliberately. The source importing
 * nothing credential-shaped is easy to read and easy to reintroduce — a transitive import through
 * `worktree-create.ts`'s dependency graph would put the Cloud SQL connector back in the shipped
 * payload while every source file still looked innocent. The bundle is what actually runs inside the
 * sandbox, so the bundle is what has to be clean.
 *
 * The failure this guards against is not hypothetical: it is exactly the circularity ADR-0355's
 * `## Delivery status` records, where the payload reached for gcloud ADC and `~/.storytree/secrets.json`
 * as an account `Protect-SandboxCredentials` had just denied them to.
 */
test("the shipped lobby bootstrap payload carries no credential and no database client", () => {
  const bundle = buildManagedCodexWorktreeCreate();

  for (const [what, needle] of [
    ["the local secrets hydrator", "loadLocalSecrets"],
    ["the Cloud SQL connector", "cloud-sql-connector"],
    ["the Cloud SQL connector class", "Connector"],
    ["the Postgres pool", "STORYTREE_DB_USER"],
    ["the impersonation switch", "STORYTREE_DB_IMPERSONATE_SERVICE_ACCOUNT"],
    ["the library store", "PgLibraryStore"],
    ["the direct claim store", "PgClaimStore"],
  ] as const) {
    assert.equal(
      bundle.includes(needle),
      false,
      `the bootstrap payload must not ship ${what} (found "${needle}") — it runs as the sandbox account, ` +
        `which every credential path is denied to`,
    );
  }
});

test("the bootstrap reaches the ledger only through the operator broker's handshake", () => {
  const bundle = buildManagedCodexWorktreeCreate();
  assert.ok(
    bundle.includes(BROKER_HANDSHAKE_ENV),
    "the payload must read the broker handshake — that is now its only route to the claim ledger",
  );
  assert.match(
    bundle,
    /x-storytree-codex-broker-token/u,
    "the payload must present the door token it read from the handshake",
  );
});

test("the bootstrap asks no Library read, so a null universe stands claims down rather than refusing them", () => {
  const bundle = buildManagedCodexWorktreeCreate();
  // `claim-universe.ts` treats a null library store as an INCOMPLETE universe and answers
  // `unverified`, so the claim proceeds exactly as it did before that check existed. That is the
  // deliberate direction — a false refusal blocks a session from work it owns, where the leak it
  // replaces merely fails to catch a typo. Asserting it here records that the degradation is chosen.
  assert.match(
    bundle,
    /library: null|library:null/u,
    "the bootstrap must pass a null library rather than reaching for a store it cannot read",
  );
});
