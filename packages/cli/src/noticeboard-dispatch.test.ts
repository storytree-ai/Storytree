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
    claimsBySession: async () => [],
    // The board's read is the UNFILTERED one (ADR-0346 D1 companion work): staleness is decided
    // once, in the pure fold, so the board can MARK a ghost instead of dropping it.
    listAllClaims: async () => rows,
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

test("without a ledger the board degrades to the UNREAD offline render, never a crash", async () => {
  const env = await run(["noticeboard"], {
    store: new InMemoryStore(),
    presence: { identity: null },
  });
  assert.equal(env.ok, true, env.body);
  // Unknown is not empty (ADR-0346 D1 companion work): a board that never read the store must not
  // report what the store holds.
  assert.match(env.body, /UNREAD — offline/);
  assert.doesNotMatch(env.body, /No claims on the ledger/);
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
    claims.claimed.map((r) => ({
      unitId: r.unitId,
      sessionId: r.sessionId,
      branch: r.branch,
      intent: r.intent,
      role: r.role,
      grade: r.grade,
    })),
    [
      // workClaimRequest stamps grade: "work" — the declare glue takes the exclusive work claim
      // on the graded ledger (ADR-0200 D2), semantics unchanged from ADR-0142 — and since
      // ADR-0346 D3 it also carries the parsed --working-on PROSE through to the store, with the
      // enum the map reads in its own `role` field. The dispatch is what proves the flag actually
      // reaches the write: this asserted `intent: "orchestrate"` while the parsed prose was dropped.
      {
        unitId: "noticeboard-cli",
        sessionId: "alpha-2",
        branch: "claude/x",
        intent: "wiring the dispatch",
        role: "supplementing",
        grade: "work",
      },
      {
        unitId: "tree-view",
        sessionId: "alpha-2",
        branch: "claude/x",
        intent: "wiring the dispatch",
        role: "supplementing",
        grade: "work",
      },
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

test("noticeboard --help teaches the registered linked-worktree identity contract", async () => {
  const helpEnv = await run(["noticeboard", "--help"], {
    store: new InMemoryStore(),
    presence: { identity: null },
  });
  assert.equal(helpEnv.ok, true);
  assert.match(helpEnv.body, /git-registered linked worktree/i);
  assert.match(helpEnv.body, /\.codex\/worktrees/);
  assert.match(helpEnv.body, /primary\s+checkout/i);
  assert.doesNotMatch(helpEnv.body, /identity is derived from the enclosing\s+\.claude\/worktrees\/\<name\> checkout/i);
  assert.match(helpEnv.body, /claim ledger/);

  const top = await run([], { store: new InMemoryStore() });
  assert.match(top.body, /noticeboard/);
});
