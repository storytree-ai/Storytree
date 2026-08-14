import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

import type { ClaimDocT, ClaimResult } from "@storytree/notice-board";

import { readBrokerHandshake, BrokerClaimLedger } from "./codex-claim-broker-client.js";
import {
  BROKER_HANDSHAKE_ENV,
  BROKER_TOKEN_HEADER,
  brokerHandshakePath,
  guardBrokerRequest,
  handshakeAclArguments,
  isLoopbackHost,
  mintBrokerToken,
  sandboxAccountName,
  tokenMatches,
} from "./codex-claim-broker-door.js";
import { startBrokerServer } from "./codex-claim-broker-server.js";
import {
  BrokerSessionRegistry,
  CODEX_CLAIM_BROKER_PROTOCOL_VERSION,
  handleBrokerRequest,
  parseBrokerRequest,
  serveBrokerRequest,
  type BrokerDeps,
  type BrokerLedger,
  type BrokerTopologyProbe,
} from "./codex-claim-broker.js";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const SESSION = "codex-unit-a1b2c3";
const BRANCH = `claude/${SESSION}`;
const UNIT = "codex-out-of-sandbox-claim-broker";

function claim(overrides: Partial<ClaimDocT> = {}): ClaimDocT {
  return {
    unitId: UNIT,
    sessionId: SESSION,
    branch: BRANCH,
    intent: "build the broker",
    grade: "exploring",
    claimedAt: "2026-08-14T00:00:00.000Z",
    heartbeatAt: "2026-08-14T00:00:00.000Z",
    ...overrides,
  };
}

interface LedgerCalls {
  readonly takes: Array<{ unitId: string; sessionId: string; branch: string; grade?: string }>;
  readonly upgrades: Array<{ unitId: string; sessionId: string; branch: string }>;
  readonly releases: Array<{ unitId: string; sessionId: string }>;
}

function recordingLedger(answers: {
  take?: (req: { unitId: string; sessionId: string; branch: string }) => ClaimResult;
  upgrade?: (unitId: string, sessionId: string, branch: string) => ClaimResult;
  release?: () => boolean;
}): { ledger: BrokerLedger; calls: LedgerCalls } {
  const calls: LedgerCalls = { takes: [], upgrades: [], releases: [] };
  const ledger: BrokerLedger = {
    async take(req) {
      calls.takes.push({
        unitId: req.unitId,
        sessionId: req.sessionId,
        branch: req.branch,
        ...(req.grade === undefined ? {} : { grade: req.grade }),
      });
      return (
        answers.take?.({ unitId: req.unitId, sessionId: req.sessionId, branch: req.branch }) ?? {
          acquired: true,
          claim: claim({ sessionId: req.sessionId, branch: req.branch, unitId: req.unitId }),
          reclaimed: false,
        }
      );
    },
    async upgrade(unitId, sessionId, opts) {
      calls.upgrades.push({ unitId, sessionId, branch: opts.branch });
      return (
        answers.upgrade?.(unitId, sessionId, opts.branch) ?? {
          acquired: true,
          claim: claim({ unitId, sessionId, branch: opts.branch, grade: "work" }),
          reclaimed: false,
        }
      );
    },
    async release(unitId, sessionId) {
      calls.releases.push({ unitId, sessionId });
      return answers.release?.() ?? true;
    },
  };
  return { ledger, calls };
}

/** A probe that says whatever Git would say about a path — the caller never gets a vote. */
function probeSaying(map: Record<string, { sessionId: string; branch: string }>): BrokerTopologyProbe {
  return {
    async derive(worktree) {
      const identity = map[worktree];
      if (identity === undefined) {
        return { ok: false, reason: `not a registered worktree of this repository: ${worktree}` };
      }
      return { ok: true, identity };
    },
  };
}

function deps(over: Partial<BrokerDeps> & { ledger: BrokerLedger }): BrokerDeps {
  return {
    topology: probeSaying({}),
    registry: new BrokerSessionRegistry(),
    ...over,
  };
}

function req(body: Record<string, unknown>): Record<string, unknown> {
  return { protocolVersion: CODEX_CLAIM_BROKER_PROTOCOL_VERSION, ...body };
}

// ---------------------------------------------------------------------------
// Grammar — the broker is the new attack surface; a loose grammar is a ladder
// ---------------------------------------------------------------------------

test("the request grammar refuses everything it does not recognise", () => {
  const bad: Array<[string, unknown]> = [
    ["not an object", "take"],
    ["an array", [{ verb: "take" }]],
    ["null", null],
    ["no protocol version", { verb: "take", unitId: UNIT, sessionId: SESSION, branch: BRANCH, intent: "x" }],
    ["a future protocol version", { protocolVersion: 2, verb: "take" }],
    ["an unknown verb", req({ verb: "delete", unitId: UNIT })],
    ["no verb at all", req({ unitId: UNIT })],
    [
      "an extra field riding along",
      req({ verb: "take", unitId: UNIT, sessionId: SESSION, branch: BRANCH, intent: "x", grade: "work" }),
    ],
    ["a missing field", req({ verb: "take", unitId: UNIT, sessionId: SESSION, intent: "x" })],
    [
      "a branch that is not claude/<sessionId>",
      req({ verb: "take", unitId: UNIT, sessionId: SESSION, branch: "main", intent: "x" }),
    ],
    [
      "a branch belonging to another session",
      req({ verb: "take", unitId: UNIT, sessionId: SESSION, branch: "claude/someone-else", intent: "x" }),
    ],
    [
      "a multi-line intent",
      req({ verb: "take", unitId: UNIT, sessionId: SESSION, branch: BRANCH, intent: "a\nb" }),
    ],
    [
      "a session id that is not a minted basename",
      req({ verb: "take", unitId: UNIT, sessionId: "../../etc", branch: "claude/../../etc", intent: "x" }),
    ],
    ["a non-string unit id", req({ verb: "release", unitId: 7, sessionId: SESSION })],
  ];
  for (const [what, raw] of bad) {
    assert.throws(() => parseBrokerRequest(raw), new RegExp(".", "u"), `should refuse ${what}`);
  }
});

test("the grammar accepts exactly the three verbs, with their exact fields", () => {
  assert.deepEqual(
    parseBrokerRequest(req({ verb: "take", unitId: UNIT, sessionId: SESSION, branch: BRANCH, intent: "why" })),
    { verb: "take", unitId: UNIT, sessionId: SESSION, branch: BRANCH, intent: "why" },
  );
  assert.deepEqual(
    parseBrokerRequest(req({ verb: "promote", unitId: UNIT, worktree: "C:/wt/a", intent: "why" })),
    { verb: "promote", unitId: UNIT, worktree: "C:/wt/a", intent: "why" },
  );
  assert.deepEqual(parseBrokerRequest(req({ verb: "release", unitId: UNIT, sessionId: SESSION })), {
    verb: "release",
    unitId: UNIT,
    sessionId: SESSION,
  });
});

test("a malformed request is a refusal, never a throw — the door does not get to crash", async () => {
  const { ledger } = recordingLedger({});
  const answer = await serveBrokerRequest({ verb: "wat" }, deps({ ledger }));
  assert.equal(answer.ok, false);
  assert.match(answer.ok === false ? answer.reason : "", /malformed request/u);
});

// ---------------------------------------------------------------------------
// take — the verb with no topology to check against
// ---------------------------------------------------------------------------

test("take forces the exploring grade — the ungated verb can never mint work authority", async () => {
  const { ledger, calls } = recordingLedger({});
  const answer = await handleBrokerRequest(
    { verb: "take", unitId: UNIT, sessionId: SESSION, branch: BRANCH, intent: "why" },
    deps({ ledger }),
  );
  assert.equal(answer.ok, true);
  assert.equal(calls.takes.length, 1);
  assert.equal(calls.takes[0]?.grade, "exploring");
});

test("a take refused by contention names the holder AND carries it, so a client need not invent one", async () => {
  const holder = claim({ sessionId: "someone-else", branch: "claude/someone-else", grade: "work" });
  const { ledger } = recordingLedger({ take: () => ({ acquired: false, heldBy: holder }) });
  const answer = await handleBrokerRequest(
    { verb: "take", unitId: UNIT, sessionId: SESSION, branch: BRANCH, intent: "why" },
    deps({ ledger }),
  );
  assert.equal(answer.ok, false);
  if (answer.ok) return;
  assert.match(answer.reason, /REFUSED — held by someone-else/u);
  assert.deepEqual(answer.heldBy, holder);
});

test("a take that lands on a different session refuses rather than reporting success", async () => {
  const { ledger } = recordingLedger({
    take: () => ({
      acquired: true,
      claim: claim({ sessionId: "somebody-else", branch: "claude/somebody-else" }),
      reclaimed: false,
    }),
  });
  const answer = await handleBrokerRequest(
    { verb: "take", unitId: UNIT, sessionId: SESSION, branch: BRANCH, intent: "why" },
    deps({ ledger }),
  );
  assert.equal(answer.ok, false);
  assert.match(answer.ok === false ? answer.reason : "", /landed on somebody-else/u);
});

// ---------------------------------------------------------------------------
// promote — the check a scoped Postgres grant cannot express
// ---------------------------------------------------------------------------

test("promote derives identity from Git and IGNORES what the caller says about itself", async () => {
  // The caller names worktree B. Git says worktree B is session `victim-b`. Whatever the caller
  // might wish to assert about being `attacker-a` never reaches the ledger, because the request
  // grammar gives it nowhere to say so and the broker asks Git instead.
  const { ledger, calls } = recordingLedger({});
  const answer = await handleBrokerRequest(
    { verb: "promote", unitId: UNIT, worktree: "C:/wt/b", intent: "why" },
    deps({
      ledger,
      topology: probeSaying({ "C:/wt/b": { sessionId: "victim-b", branch: "claude/victim-b" } }),
    }),
  );
  assert.equal(answer.ok, true);
  assert.deepEqual(calls.upgrades, [{ unitId: UNIT, sessionId: "victim-b", branch: "claude/victim-b" }]);
});

test("promote refuses a path Git will not vouch for", async () => {
  const { ledger, calls } = recordingLedger({});
  const answer = await handleBrokerRequest(
    { verb: "promote", unitId: UNIT, worktree: "C:/not/a/worktree", intent: "why" },
    deps({ ledger, topology: probeSaying({}) }),
  );
  assert.equal(answer.ok, false);
  assert.match(answer.ok === false ? answer.reason : "", /not a registered worktree/u);
  assert.equal(calls.upgrades.length, 0, "an unresolved topology must never reach the ledger");
});

test("promote refuses when the grade did not actually land on work", async () => {
  const { ledger } = recordingLedger({
    upgrade: (unitId, sessionId, branch) => ({
      acquired: true,
      claim: claim({ unitId, sessionId, branch, grade: "waiting" }),
      reclaimed: false,
    }),
  });
  const answer = await handleBrokerRequest(
    { verb: "promote", unitId: UNIT, worktree: "C:/wt/a", intent: "why" },
    deps({ ledger, topology: probeSaying({ "C:/wt/a": { sessionId: SESSION, branch: BRANCH } }) }),
  );
  assert.equal(answer.ok, false);
  assert.match(answer.ok === false ? answer.reason : "", /returned grade waiting, not work/u);
});

// ---------------------------------------------------------------------------
// release — the one destructive verb, narrowed by memory
// ---------------------------------------------------------------------------

test("release refuses a session this broker did not mint", async () => {
  const { ledger, calls } = recordingLedger({});
  const answer = await handleBrokerRequest(
    { verb: "release", unitId: UNIT, sessionId: "a-session-i-never-took" },
    deps({ ledger }),
  );
  assert.equal(answer.ok, false);
  assert.match(answer.ok === false ? answer.reason : "", /did not mint session/u);
  assert.equal(calls.releases.length, 0, "the ledger must never be asked");
});

test("release is admitted only for a session this broker took, and only after the take", async () => {
  const { ledger, calls } = recordingLedger({});
  const shared = deps({ ledger });

  const early = await handleBrokerRequest({ verb: "release", unitId: UNIT, sessionId: SESSION }, shared);
  assert.equal(early.ok, false, "before the take, even the right session is refused");

  await handleBrokerRequest(
    { verb: "take", unitId: UNIT, sessionId: SESSION, branch: BRANCH, intent: "why" },
    shared,
  );
  const late = await handleBrokerRequest({ verb: "release", unitId: UNIT, sessionId: SESSION }, shared);
  assert.equal(late.ok, true);
  assert.deepEqual(calls.releases, [{ unitId: UNIT, sessionId: SESSION }]);
});

test("a refused take is not remembered — a session the broker failed to mint cannot be released", async () => {
  const { ledger, calls } = recordingLedger({
    take: () => ({ acquired: false, heldBy: claim({ sessionId: "holder", branch: "claude/holder" }) }),
  });
  const shared = deps({ ledger });
  await handleBrokerRequest(
    { verb: "take", unitId: UNIT, sessionId: SESSION, branch: BRANCH, intent: "why" },
    shared,
  );
  const answer = await handleBrokerRequest({ verb: "release", unitId: UNIT, sessionId: SESSION }, shared);
  assert.equal(answer.ok, false);
  assert.equal(calls.releases.length, 0);
});

// ---------------------------------------------------------------------------
// Fail-closed on an unreachable store
// ---------------------------------------------------------------------------

test("an unreachable store is a refusal on every verb — never a throw, never a success", async () => {
  const boom = (): never => {
    throw new Error("ECONNREFUSED 34.87.0.1:5432");
  };
  const ledger: BrokerLedger = { take: boom, upgrade: boom, release: boom };
  const registry = new BrokerSessionRegistry();
  registry.remember(SESSION);
  const shared: BrokerDeps = {
    ledger,
    registry,
    topology: probeSaying({ "C:/wt/a": { sessionId: SESSION, branch: BRANCH } }),
  };

  for (const request of [
    { verb: "take", unitId: UNIT, sessionId: SESSION, branch: BRANCH, intent: "why" },
    { verb: "promote", unitId: UNIT, worktree: "C:/wt/a", intent: "why" },
    { verb: "release", unitId: UNIT, sessionId: SESSION },
  ] as const) {
    const answer = await handleBrokerRequest(request, shared);
    assert.equal(answer.ok, false, `${request.verb} must fail closed`);
    assert.match(answer.ok === false ? answer.reason : "", /failed closed.*ECONNREFUSED/su);
    assert.equal(
      answer.ok === false ? answer.heldBy : undefined,
      undefined,
      "an outage must not masquerade as contention",
    );
  }
});

// ---------------------------------------------------------------------------
// The door — "outside the sandbox" means little if any local process can knock
// ---------------------------------------------------------------------------

test("the guard admits only a loopback POST to the one path carrying the right token", () => {
  const token = mintBrokerToken();
  const ok = {
    method: "POST",
    url: "/claim",
    headers: { host: "127.0.0.1:5599", [BROKER_TOKEN_HEADER]: token },
  };
  assert.equal(guardBrokerRequest(ok, token).ok, true);

  const refusals: Array<[string, Parameters<typeof guardBrokerRequest>[0]]> = [
    ["a GET", { ...ok, method: "GET" }],
    ["another path", { ...ok, url: "/claims" }],
    ["a non-loopback Host (DNS rebinding)", { ...ok, headers: { ...ok.headers, host: "evil.example" } }],
    ["a cross-origin post", { ...ok, headers: { ...ok.headers, origin: "https://evil.example" } }],
    ["no token", { ...ok, headers: { host: "127.0.0.1" } }],
    ["a wrong token", { ...ok, headers: { ...ok.headers, [BROKER_TOKEN_HEADER]: mintBrokerToken() } }],
    ["a token prefix", { ...ok, headers: { ...ok.headers, [BROKER_TOKEN_HEADER]: token.slice(0, 8) } }],
  ];
  for (const [what, request] of refusals) {
    assert.equal(guardBrokerRequest(request, token).ok, false, `should refuse ${what}`);
  }
});

test("loopback authorities are recognised and nothing else is", () => {
  for (const host of ["127.0.0.1", "127.0.0.1:1", "localhost", "localhost:8080", "[::1]", "[::1]:9"]) {
    assert.equal(isLoopbackHost(host), true, host);
  }
  for (const host of ["", undefined, "0.0.0.0", "10.0.0.5", "example.com", "127.0.0.1.evil.com"]) {
    assert.equal(isLoopbackHost(host), false, String(host));
  }
});

test("token comparison is length-safe and rejects near misses", () => {
  const token = mintBrokerToken();
  assert.equal(tokenMatches(token, token), true);
  assert.equal(tokenMatches(token, undefined), false);
  assert.equal(tokenMatches(token, ""), false);
  assert.equal(tokenMatches(token, `${token}x`), false);
  assert.equal(tokenMatches(token, token.slice(0, -1)), false);
});

test("the handshake ACL breaks inheritance FIRST, then grants exactly two principals", () => {
  const args = handshakeAclArguments({
    handshakePath: "C:/Users/op/.storytree/codex-broker/handshake.json",
    operatorAccount: "BOX\\op",
    sandboxAccount: sandboxAccountName("BOX"),
  });
  assert.equal(args[0], "C:/Users/op/.storytree/codex-broker/handshake.json");
  assert.equal(
    args[1],
    "/inheritance:r",
    "without breaking inheritance first, every grant below is decoration on a file the machine can already read",
  );
  assert.deepEqual(args.slice(2), ["/grant:r", "BOX\\op:(R,W)", "/grant:r", "BOX\\CodexSandboxUsers:(R)"]);
  assert.equal(sandboxAccountName("BOX"), "BOX\\CodexSandboxUsers");
});

// ---------------------------------------------------------------------------
// End to end over a real socket
// ---------------------------------------------------------------------------

test("the broker answers take and promote over a real loopback socket, and refuses an untokened caller", async () => {
  const { ledger, calls } = recordingLedger({});
  const token = mintBrokerToken();
  const broker = await startBrokerServer({
    token,
    deps: deps({
      ledger,
      topology: probeSaying({ "C:/wt/a": { sessionId: SESSION, branch: BRANCH } }),
    }),
  });
  try {
    const post = (body: unknown, headers: Record<string, string>) =>
      fetch(`http://127.0.0.1:${broker.port}/claim`, {
        method: "POST",
        headers: { "content-type": "application/json", ...headers },
        body: JSON.stringify(body),
      });

    const denied = await post(req({ verb: "release", unitId: UNIT, sessionId: SESSION }), {});
    assert.equal(denied.status, 403, "a caller that cannot read the handshake cannot knock");
    assert.equal(calls.releases.length, 0);

    const taken = await post(
      req({ verb: "take", unitId: UNIT, sessionId: SESSION, branch: BRANCH, intent: "why" }),
      { [BROKER_TOKEN_HEADER]: token },
    );
    assert.equal(taken.status, 200);
    assert.equal(((await taken.json()) as { ok: boolean }).ok, true);

    const promoted = await post(req({ verb: "promote", unitId: UNIT, worktree: "C:/wt/a", intent: "why" }), {
      [BROKER_TOKEN_HEADER]: token,
    });
    const body = (await promoted.json()) as { ok: boolean; claim?: ClaimDocT };
    assert.equal(body.ok, true);
    assert.equal(body.claim?.grade, "work");
    assert.deepEqual(calls.upgrades, [{ unitId: UNIT, sessionId: SESSION, branch: BRANCH }]);
  } finally {
    await broker.close();
  }
});

test("the client speaks the ledger seams the bootstrap already drives", async () => {
  const { ledger, calls } = recordingLedger({});
  const token = mintBrokerToken();
  const broker = await startBrokerServer({
    token,
    deps: deps({
      ledger,
      topology: probeSaying({ "C:/wt/a": { sessionId: SESSION, branch: BRANCH } }),
    }),
  });
  try {
    let worktree: string | undefined;
    const client = new BrokerClaimLedger(broker.handshake, () => worktree);

    const taken = await client.take({ unitId: UNIT, sessionId: SESSION, branch: BRANCH, intent: "why" });
    assert.equal(taken.acquired, true);

    // Before the worktree exists there is no identity to derive — and the client says so rather than
    // sending an assertion the broker would have to trust.
    await assert.rejects(
      () => client.upgrade(UNIT, SESSION, { branch: BRANCH, intent: "why" }),
      /no minted worktree/u,
    );

    worktree = "C:/wt/a";
    const promoted = await client.upgrade(UNIT, "a-lie-about-who-i-am", { branch: "claude/a-lie", intent: "why" });
    assert.equal(promoted.acquired, true);
    assert.deepEqual(
      calls.upgrades,
      [{ unitId: UNIT, sessionId: SESSION, branch: BRANCH }],
      "the lie never reached the ledger — Git decided",
    );

    assert.equal(await client.release(UNIT, SESSION), true);
    await assert.rejects(() => client.claimsFor(UNIT), /exposes no board read/u);
  } finally {
    await broker.close();
  }
});

test("a contention refusal reaches the client as heldBy; a fault reaches it as a throw", async () => {
  const holder = claim({ sessionId: "holder", branch: "claude/holder", grade: "work" });
  const { ledger } = recordingLedger({ take: () => ({ acquired: false, heldBy: holder }) });
  const token = mintBrokerToken();
  const broker = await startBrokerServer({ token, deps: deps({ ledger }) });
  try {
    const client = new BrokerClaimLedger(broker.handshake, () => "C:/wt/a");
    const contended = await client.take({ unitId: UNIT, sessionId: SESSION, branch: BRANCH, intent: "why" });
    assert.equal(contended.acquired, false);
    assert.equal(contended.acquired === false ? contended.heldBy.sessionId : "", "holder");

    // A topology the broker will not vouch for carries no holder — so it must NOT read as "busy".
    await assert.rejects(
      () => client.upgrade(UNIT, SESSION, { branch: BRANCH, intent: "why" }),
      /not a registered worktree/u,
    );
  } finally {
    await broker.close();
  }
});

test("the client refuses a handshake it cannot trust rather than negotiating down", () => {
  assert.throws(() => readBrokerHandshake("./no-such-handshake.json"), /handshake unreadable/u);
});

test("broker and bootstrap resolve the SAME handshake path, and never one the profile denies", () => {
  const env = { LOCALAPPDATA: "C:\\Users\\op\\AppData\\Local", USERPROFILE: "C:\\Users\\op" };

  const resolved = brokerHandshakePath(env);
  assert.equal(
    resolved,
    path.join("C:\\Users\\op\\AppData\\Local", "Storytree", "codex-broker", "handshake.json"),
  );

  // The trap this guards: `~/.storytree` is a DENIED root in the generated profile — it is the one
  // home storytree-owned secrets live in. A handshake there is unreadable by the very account that
  // has to read it, and the failure surfaces only at live-smoke time as an unexplained bootstrap
  // refusal rather than as anything pointing at the path.
  assert.doesNotMatch(
    resolved.replaceAll("\\", "/"),
    /\/\.storytree(\/|$)/u,
    "the handshake must never live under the denied secrets home",
  );

  assert.equal(
    brokerHandshakePath({ ...env, [BROKER_HANDSHAKE_ENV]: "D:\\elsewhere\\hs.json" }),
    "D:\\elsewhere\\hs.json",
    "an explicit override wins outright",
  );
  assert.equal(
    brokerHandshakePath({ ...env, STORYTREE_CODEX_BROKER_DIR: "D:\\dir" }),
    path.join("D:\\dir", "handshake.json"),
    "the directory override keeps the shared filename",
  );
});
