import assert from "node:assert/strict";
import test from "node:test";

import {
  CLAIM_AUTHORITY_ENV,
  decideHosting,
  standingPolicyDirectory,
  startDesktopClaimAuthority,
} from "./claim-authority.js";

/** What an installed boundary looks like to the gate: the actuator's standing policy receipt. */
const INSTALLED = () => ["standing-6bb0f51b663e19dfb4cbba11.json"];
const NOT_INSTALLED = () => [];

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

/**
 * ADR-0375 D9's property, preserved exactly: an ordinary member's laptop holds no impersonation grant,
 * so it must never ATTEMPT. What changed is only how that host is recognised — the absence of an
 * installed boundary rather than the absence of a variable.
 */
test("a host with no boundary installed never attempts, and says so rather than failing", async () => {
  const spy = poolSpy();
  const result = await startDesktopClaimAuthority(
    {
      ...HOST,
      env: { COMPUTERNAME: "BOX", USERNAME: "operator" },
      standingPolicies: NOT_INSTALLED,
    },
    { createPool: spy.createPool as never, publishHandshake: () => {}, resolveRepository: () => "/repo" },
  );

  assert.equal(result.ok, false);
  assert.equal(result.ok === false && "disabled" in result && result.disabled, true);
  assert.equal(spy.calls.length, 0, "no pool is opened on a host that is not running the boundary");
});

/**
 * THE test this change exists for.
 *
 * The operator installs the boundary and opens the app. Nothing else. If this goes red, the boundary
 * is back to being a two-step install whose second step is a human remembering — and the failure mode
 * is silent, because the fence then refuses every covered write without saying why.
 */
test("a host WITH the boundary installed hosts the authority with no environment variable set", async () => {
  const spy = poolSpy();
  const result = await startDesktopClaimAuthority(
    {
      ...HOST,
      env: { COMPUTERNAME: "BOX", USERNAME: "operator" },
      standingPolicies: INSTALLED,
    },
    { createPool: spy.createPool as never, publishHandshake: () => {}, resolveRepository: () => "/repo" },
  );

  assert.equal(result.ok, true, "an installed boundary is sufficient on its own");
  assert.equal(spy.calls.length, 1);
  if (result.ok) await result.broker.close();
});

test("the gate answers on the machine, and the variable only overrides it", () => {
  assert.equal(decideHosting({ env: {}, standingPolicies: INSTALLED }).host, true);
  assert.equal(decideHosting({ env: {}, standingPolicies: NOT_INSTALLED }).host, false);

  // Both overrides, in both directions — the debugging escape hatch and the host with no policy.
  assert.equal(
    decideHosting({ env: { [CLAIM_AUTHORITY_ENV]: "0" }, standingPolicies: INSTALLED }).host,
    false,
    "an explicit off beats an installed boundary",
  );
  assert.equal(
    decideHosting({ env: { [CLAIM_AUTHORITY_ENV]: "1" }, standingPolicies: NOT_INSTALLED }).host,
    true,
    "an explicit on beats an absent boundary",
  );

  // A typo must not silently re-create the failure this change removes: it falls through to the
  // machine's own answer and NAMES the value it ignored, rather than reading as off.
  const typo = decideHosting({ env: { [CLAIM_AUTHORITY_ENV]: "ture" }, standingPolicies: INSTALLED });
  assert.equal(typo.host, true, "an unrecognised value never disables a factory host");
  assert.match(typo.reason, /unrecognised/i);
  assert.match(typo.reason, /ture/);
});

/**
 * Every failure direction of the probe means "not a factory host", so none of them may produce an
 * attempt. A machine with no `%ProgramData%` at all is the ordinary case here, not an exotic one.
 */
test("the policy directory resolves under ProgramData, and its absence reads as not-installed", () => {
  assert.match(
    standingPolicyDirectory({ PROGRAMDATA: "D:\\PD" }),
    /D:[\\/]PD[\\/]OpenAI[\\/]Codex[\\/]Storytree[\\/]sessions/,
  );

  const decision = decideHosting({ env: {}, standingPolicies: NOT_INSTALLED });
  assert.equal(decision.host, false);
  assert.match(decision.reason, /no Codex containment boundary is installed/i);
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
