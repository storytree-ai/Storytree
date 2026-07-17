import test from "node:test";
import assert from "node:assert/strict";

import { InMemoryStore } from "@storytree/storage-protocol";
import type { ClaimDocT, ClaimRequest, ClaimResult } from "@storytree/notice-board";

import { run } from "./commands.js";
import type { ClaimLedgerStoreLike } from "@storytree/drive";

/**
 * The claim-ledger DISPATCH wiring (spine-side, ADR-0200 D2): `run` routes the noticeboard
 * claim / upgrade / downgrade / release / claims verbs to the leaf-proven `claimLedgerCommand`
 * with the parsed --grade/--intent flags, the injected ledger store, and the injectable identity —
 * while declare/done keep their exact existing path. The command module's own truths live in
 * drive's noticeboard-claims.test.ts; this file only proves the glue.
 */

const NOW_ISO = new Date().toISOString();

function claimDoc(over: Partial<ClaimDocT> & Pick<ClaimDocT, "unitId" | "sessionId">): ClaimDocT {
  return {
    branch: "claude/other",
    intent: "",
    claimedAt: NOW_ISO,
    heartbeatAt: NOW_ISO,
    ...over,
  };
}

interface FakeLedger extends ClaimLedgerStoreLike {
  takes: ClaimRequest[];
  upgrades: Array<{ unitId: string; sessionId: string; opts?: { branch?: string; intent?: string } }>;
  downgrades: Array<{ unitId: string; sessionId: string; grade: string }>;
  releases: Array<{ unitId: string; sessionId: string }>;
  rows: ClaimDocT[];
}

function fakeLedger(rows: ClaimDocT[] = []): FakeLedger {
  const self: FakeLedger = {
    takes: [],
    upgrades: [],
    downgrades: [],
    releases: [],
    rows,
    async take(req): Promise<ClaimResult> {
      self.takes.push(req);
      return {
        acquired: true,
        reclaimed: false,
        claim: claimDoc({
          unitId: req.unitId,
          sessionId: req.sessionId,
          branch: req.branch,
          intent: req.intent ?? "",
          ...(req.grade !== undefined ? { grade: req.grade } : {}),
        }),
      };
    },
    async upgrade(unitId, sessionId, opts): Promise<ClaimResult> {
      self.upgrades.push({ unitId, sessionId, ...(opts !== undefined ? { opts } : {}) });
      return {
        acquired: true,
        reclaimed: false,
        claim: claimDoc({ unitId, sessionId, grade: "work", branch: opts?.branch ?? "?" }),
      };
    },
    async downgrade(unitId, sessionId, grade): Promise<boolean> {
      self.downgrades.push({ unitId, sessionId, grade });
      return true;
    },
    async release(unitId, sessionId): Promise<boolean> {
      self.releases.push({ unitId, sessionId });
      return true;
    },
    async claimsFor(): Promise<ClaimDocT[]> {
      return self.rows;
    },
  };
  return self;
}

const IDENTITY = { sessionId: "wt-dispatch", branch: "claude/dispatch" };

function depsWith(ledger: ClaimLedgerStoreLike | null) {
  return {
    store: new InMemoryStore(),
    presence: { identity: IDENTITY, ledger },
  };
}

test("noticeboard claim through the dispatch parses --grade/--intent and uses the injected identity", async () => {
  const ledger = fakeLedger();
  const env = await run(
    ["noticeboard", "claim", "story-x", "--grade", "exploring", "--intent", "reading the spec"],
    depsWith(ledger),
  );
  assert.equal(env.ok, true, env.body);
  assert.deepEqual(ledger.takes, [
    {
      unitId: "story-x",
      sessionId: "wt-dispatch",
      branch: "claude/dispatch",
      intent: "reading the spec",
      grade: "exploring",
    },
  ]);
});

test("noticeboard upgrade through the dispatch passes the identity branch to the store", async () => {
  const ledger = fakeLedger();
  const env = await run(["noticeboard", "upgrade", "story-x"], depsWith(ledger));
  assert.equal(env.ok, true, env.body);
  assert.deepEqual(ledger.upgrades, [
    { unitId: "story-x", sessionId: "wt-dispatch", opts: { branch: "claude/dispatch" } },
  ]);
});

test("noticeboard downgrade through the dispatch parses --grade", async () => {
  const ledger = fakeLedger();
  const env = await run(
    ["noticeboard", "downgrade", "story-x", "--grade", "waiting"],
    depsWith(ledger),
  );
  assert.equal(env.ok, true, env.body);
  assert.deepEqual(ledger.downgrades, [
    { unitId: "story-x", sessionId: "wt-dispatch", grade: "waiting" },
  ]);
});

test("noticeboard release through the dispatch drops this session's claim on the unit", async () => {
  const ledger = fakeLedger();
  const env = await run(["noticeboard", "release", "story-x"], depsWith(ledger));
  assert.equal(env.ok, true, env.body);
  assert.deepEqual(ledger.releases, [{ unitId: "story-x", sessionId: "wt-dispatch" }]);
});

test("noticeboard claims through the dispatch renders the queue-order read view", async () => {
  const ledger = fakeLedger([
    claimDoc({ unitId: "story-x", sessionId: "holder-wt", grade: "work", intent: "real" }),
    claimDoc({ unitId: "story-x", sessionId: "waiter-wt", grade: "waiting" }),
  ]);
  const env = await run(["noticeboard", "claims", "story-x"], depsWith(ledger));
  assert.equal(env.ok, true, env.body);
  assert.match(env.body, /\[work\]\s+holder-wt/);
  assert.match(env.body, /\[waiting\]\s+waiter-wt/);
});

test("without a ledger store the verbs degrade to the db guidance, never a crash", async () => {
  const env = await run(["noticeboard", "claim", "story-x", "--intent", "x"], depsWith(null));
  assert.equal(env.ok, false);
  assert.ok(env.next?.includes("pnpm db:up"));
});

test("noticeboard --help names the ledger verbs alongside declare/done", async () => {
  const env = await run(["noticeboard", "--help"], depsWith(null));
  assert.equal(env.ok, true);
  for (const verb of ["claim", "upgrade", "downgrade", "release", "claims", "declare", "done"]) {
    assert.match(env.body, new RegExp(`noticeboard ${verb}`), verb);
  }
});
