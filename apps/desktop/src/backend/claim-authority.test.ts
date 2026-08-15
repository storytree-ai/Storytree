import assert from "node:assert/strict";
import test from "node:test";

import {
  CLAIM_AUTHORITY_ENV,
  startDesktopClaimAuthority,
} from "./claim-authority.js";

/**
 * The pool a test can watch without opening one. `createPool` is the single place the broker's
 * identity is chosen, so watching its ARGUMENTS is the whole point — see the first test.
 */
function poolSpy(): {
  readonly calls: unknown[];
  readonly createPool: (opts?: unknown) => Promise<{ pool: unknown; connector: unknown }>;
} {
  const calls: unknown[] = [];
  return {
    calls,
    createPool: async (opts?: unknown) => {
      calls.push(opts);
      return {
        // `end` is not decoration: `closePool` calls it on every teardown path, so a double without
        // it makes the composition's own cleanup throw and MASKS the error under test.
        pool: {
          query: async () => ({ rows: [] }),
          connect: async () => ({}),
          on: () => {},
          end: async () => {},
        },
        connector: { close: () => {} },
      };
    },
  };
}

const HOST = {
  env: { [CLAIM_AUTHORITY_ENV]: "1", COMPUTERNAME: "BOX", USERNAME: "operator" },
  cwd: "/repo",
  log: () => {},
};

/**
 * THE test this module exists for.
 *
 * The desktop backend already holds `createPool()` with NO arguments — its full library identity. A
 * broker that rode that pool would take claims correctly, promote correctly, answer every verb
 * correctly, and pass every functional test ever written against it, while connected as a principal
 * reaching all 19 tables in `events` instead of the 2 the claim-writer reaches. Nothing observable
 * would differ. That is exactly why the assertion has to be on the OPTIONS rather than on any
 * behaviour: the narrow identity (PR #1323) landed BEFORE the broker so the broker was never BUILT
 * holding anything broader, and this is what keeps that true.
 */
test("the desktop hosts the authority on the claim-writer identity, never its own library pool", async () => {
  const spy = poolSpy();
  const result = await startDesktopClaimAuthority(HOST, {
    createPool: spy.createPool as never,
    publishHandshake: () => {},
    resolveRepository: () => "/repo",
  });

  assert.equal(result.ok, true);
  assert.equal(spy.calls.length, 1, "exactly one pool is opened for the authority");
  assert.deepEqual(spy.calls[0], {
    user: "storytree-codex-claim-writer@storytree-498613.iam",
    impersonateServiceAccount:
      "storytree-codex-claim-writer@storytree-498613.iam.gserviceaccount.com",
  });

  // The negative half: an ARGUMENTLESS createPool is precisely the desktop's own identity, and is the
  // shape this test exists to reject. Asserting deepEqual above already excludes it, but saying so
  // explicitly is what stops a later "simplification" to `createPool()` from reading as harmless.
  assert.notDeepEqual(spy.calls[0], undefined);
  assert.notDeepEqual(spy.calls[0], {});

  if (result.ok) await result.broker.close();
});

test("the authority is off unless the operator opts in, and says so rather than failing", async () => {
  const spy = poolSpy();
  const result = await startDesktopClaimAuthority(
    { ...HOST, env: { COMPUTERNAME: "BOX", USERNAME: "operator" } },
    { createPool: spy.createPool as never, publishHandshake: () => {}, resolveRepository: () => "/repo" },
  );

  assert.equal(result.ok, false);
  assert.equal(result.ok === false && "disabled" in result && result.disabled, true);
  assert.equal(spy.calls.length, 0, "no pool is opened when the operator did not ask for one");
});

/**
 * A desktop launch must survive an authority it cannot host. The Codex fence fails closed on its own
 * when the authority is absent — the hook refuses every covered write and names this process — so an
 * absent authority is a Codex-lifecycle outage, never a desktop outage. Making it a desktop outage
 * would mean a member with no impersonation grant could not open the app at all.
 */
test("a credential failure degrades quiet instead of taking the desktop down", async () => {
  const result = await startDesktopClaimAuthority(HOST, {
    createPool: (async () => {
      throw new Error("no IAM principal resolved for the claim writer");
    }) as never,
    publishHandshake: () => {},
    resolveRepository: () => "/repo",
  });

  assert.equal(result.ok, false);
  assert.equal(result.ok === false && "disabled" in result, false, "a real failure is not a disable");
  assert.match(
    result.ok === false ? result.error : "",
    /could not host the Codex claim authority/i,
  );
});

/**
 * A handshake this process cannot scope is a door with no lock. The resident composition tears the
 * server and the pool back down and rethrows rather than serving openly; this proves the desktop sees
 * that as a refusal rather than as a running authority.
 */
test("a handshake that cannot be scoped refuses to serve", async () => {
  const spy = poolSpy();
  const result = await startDesktopClaimAuthority(HOST, {
    createPool: spy.createPool as never,
    publishHandshake: () => {
      throw new Error("cannot scope the handshake ACL: COMPUTERNAME/USERNAME are not set");
    },
    resolveRepository: () => "/repo",
  });

  assert.equal(result.ok, false);
  assert.match(result.ok === false ? result.error : "", /cannot scope the handshake ACL/i);
});
