import test from "node:test";
import assert from "node:assert/strict";

import { InMemoryStore } from "@storytree/storage-protocol";
import type { ClaimDocT, ClaimRequest } from "@storytree/notice-board";

import { run } from "./commands.js";

/**
 * The noticeboard DISPATCH wiring (spine-side, ADR-0033 / ADR-0200 D7 — presence retired): `run`
 * routes the `noticeboard` area to the leaf-proven `noticeboardCommand` with parsed flags, the
 * injected claim stores, and the injectable identity. The command module's own truths live in
 * drive's noticeboard.test.ts; this file only proves the glue.
 */

const NOW_ISO = new Date().toISOString();

function claimDoc(over: Partial<ClaimDocT> & Pick<ClaimDocT, "unitId" | "sessionId">): ClaimDocT {
  return {
    branch: "claude/x",
    intent: "",
    claimedAt: NOW_ISO,
    heartbeatAt: NOW_ISO,
    ...over,
  };
}

function fakeClaims() {
  const claimed: ClaimRequest[] = [];
  const released: string[] = [];
  return {
    claimed,
    released,
    async claim(req: ClaimRequest) {
      claimed.push(req);
      return {
        acquired: true as const,
        reclaimed: false,
        claim: claimDoc({
          unitId: req.unitId,
          sessionId: req.sessionId,
          branch: req.branch,
          intent: req.intent ?? "",
        }),
      };
    },
    async releaseClaimsBySession(sessionId: string): Promise<number> {
      released.push(sessionId);
      return 1;
    },
  };
}

/** A ledger fake carrying only the board's read half (the store verbs are other tests' business). */
function fakeLedgerRead(rows: ClaimDocT[]) {
  return {
    take: async () => ({ acquired: true as const, reclaimed: false, claim: null as never }),
    upgrade: async () => ({ acquired: true as const, reclaimed: false, claim: null as never }),
    downgrade: async () => true,
    release: async () => true,
    claimsFor: async () => [],
    listLiveClaims: async () => rows,
  };
}

test("the noticeboard area routes to the claim-ledger board with the injected ledger read", async () => {
  const ledger = fakeLedgerRead([
    claimDoc({ unitId: "tree-view", sessionId: "alpha-1", branch: "claude/alpha", grade: "work", intent: "building tree-view" }),
  ]);
  const env = await run(["noticeboard"], {
    store: new InMemoryStore(),
    presence: { identity: null, ledger },
  });
  assert.equal(env.ok, true, env.body);
  assert.match(env.body, /Claim ledger \(ADR-0200\)/);
  assert.match(env.body, /alpha-1/);
  assert.match(env.body, /tree-view/);
});

test("without a ledger the board degrades to the empty offline render, never a crash", async () => {
  const env = await run(["noticeboard"], {
    store: new InMemoryStore(),
    presence: { identity: null },
  });
  assert.equal(env.ok, true, env.body);
  assert.match(env.body, /No live claims on the ledger\./);
  assert.doesNotMatch(env.body, /Active sessions/, "the presence board is retired (ADR-0200 D7)");
});

test("declare through the dispatch parses --working-on/--node and takes the work-time claim per node", async () => {
  const claims = fakeClaims();
  const env = await run(
    ["noticeboard", "declare", "--working-on", "wiring the dispatch", "--node", "noticeboard-cli", "--node", "tree-view"],
    {
      store: new InMemoryStore(),
      presence: { identity: { sessionId: "alpha-2", branch: "claude/x" }, claims },
    },
  );
  assert.equal(env.ok, true, env.body);
  assert.deepEqual(
    claims.claimed.map((r) => ({ unitId: r.unitId, sessionId: r.sessionId, branch: r.branch, intent: r.intent, grade: r.grade })),
    [
      // workClaimRequest stamps grade: "work" — the declare glue takes the exclusive work claim
      // on the graded ledger (ADR-0200 D2), semantics unchanged from ADR-0142.
      { unitId: "noticeboard-cli", sessionId: "alpha-2", branch: "claude/x", intent: "orchestrate", grade: "work" },
      { unitId: "tree-view", sessionId: "alpha-2", branch: "claude/x", intent: "orchestrate", grade: "work" },
    ],
  );
  assert.match(env.body, /wisp is lit/);
});

test("done through the dispatch releases the session's claims", async () => {
  const claims = fakeClaims();
  const deps = {
    store: new InMemoryStore(),
    presence: { identity: { sessionId: "alpha-3", branch: "b" }, claims },
  };
  const env = await run(["noticeboard", "done"], deps);
  assert.equal(env.ok, true, env.body);
  assert.deepEqual(claims.released, ["alpha-3"]);
  assert.match(env.body, /Released 1 story claim/);
});

test("declare without a claims store degrades to the db guidance, never a crash", async () => {
  const env = await run(["noticeboard", "declare", "--working-on", "x", "--node", "story-a"], {
    store: new InMemoryStore(),
    presence: { identity: { sessionId: "alpha-4", branch: "b" } },
  });
  assert.equal(env.ok, false);
  assert.ok(env.next?.includes("pnpm db:up"));
});

test("noticeboard --help is an ok envelope and the top help names the area", async () => {
  const helpEnv = await run(["noticeboard", "--help"], {
    store: new InMemoryStore(),
    presence: { identity: null },
  });
  assert.equal(helpEnv.ok, true);
  assert.match(helpEnv.body, /derived from the enclosing/);
  assert.match(helpEnv.body, /claim ledger/);

  const top = await run([], { store: new InMemoryStore() });
  assert.match(top.body, /noticeboard/);
});
