import test from "node:test";
import assert from "node:assert/strict";

import { InMemoryStore } from "@storytree/storage-protocol";
import type { ClaimAuditQuery, ClaimAuditRow, ClaimDocT, ClaimResult } from "@storytree/notice-board";
import type { ClaimHistoryStoreLike, ClaimLedgerStoreLike } from "@storytree/drive";

import { CLI_OPTIONS, run } from "./commands.js";

/**
 * The `noticeboard history` DISPATCH wiring (ADR-0310 D1, increment 1 of `first-class-edges-arc`):
 * `run` routes the verb to `claimHistoryCommand` with the parsed window/scope/view flags and the
 * injected audit-log store — and does NOT let it fall through to the claim-ledger verbs or to
 * declare/done. The command module's own truths live in drive's noticeboard-history.test.ts; this
 * file proves only the glue, plus the two things only the CLI can prove: that the flags are declared
 * (parseArgs would otherwise reject them outright) and that the verb needs no worktree identity.
 */

const AUDIT_ROWS: ClaimAuditRow[] = [
  {
    seq: 1,
    unitId: "cli",
    type: "claimed",
    sessionId: "wt-first",
    doc: { sessionId: "wt-first", grade: "work", branch: "claude/first", intent: "the gate runner" },
    at: "2026-08-04T02:00:00.000Z",
  },
  {
    seq: 2,
    unitId: "cli",
    type: "conflict-refused",
    sessionId: "wt-second",
    doc: { sessionId: "wt-first", grade: "work", branch: "claude/first", intent: "the gate runner" },
    at: "2026-08-04T02:02:00.000Z",
  },
];

interface FakeAudit extends ClaimHistoryStoreLike {
  queries: ClaimAuditQuery[];
}

/**
 * The audit half only. The ledger verbs are stubbed to THROW: if the dispatch ever routed `history`
 * through them, the test would fail loudly rather than pass on a coincidentally similar render.
 */
function fakeAudit(rows: ClaimAuditRow[] = AUDIT_ROWS): FakeAudit & ClaimLedgerStoreLike {
  const self = {
    queries: [] as ClaimAuditQuery[],
    async auditHistory(query: ClaimAuditQuery): Promise<ClaimAuditRow[]> {
      self.queries.push(query);
      return rows;
    },
    async take(): Promise<ClaimResult> {
      throw new Error("history must never reach a claim-taking path");
    },
    async upgrade(): Promise<ClaimResult> {
      throw new Error("history must never reach a claim-taking path");
    },
    async downgrade(): Promise<boolean> {
      throw new Error("history must never reach a claim-taking path");
    },
    async release(): Promise<boolean> {
      throw new Error("history must never reach a claim-taking path");
    },
    async claimsFor(): Promise<ClaimDocT[]> {
      throw new Error("history reads the audit log, never the live claim rows");
    },
  };
  return self;
}

const IDENTITY = { sessionId: "wt-dispatch", branch: "claude/dispatch" };

function depsWith(ledger: (ClaimLedgerStoreLike & Partial<ClaimHistoryStoreLike>) | null) {
  return { store: new InMemoryStore(), presence: { identity: IDENTITY, ledger } };
}

const MS_PER_DAY = 86_400_000;

test("noticeboard history routes to the audit read with the default 30-day window", async () => {
  const audit = fakeAudit();
  const env = await run(["noticeboard", "history"], depsWith(audit));
  assert.equal(env.ok, true, env.body);
  assert.equal(audit.queries.length, 1, "one audit read, and no claim path touched");
  assert.equal(audit.queries[0]?.sinceMs, 30 * MS_PER_DAY);
  assert.match(env.body, /Claim audit log \(events\.claim_event\)/);
});

test("noticeboard history <unit> --days/--session/--type/--limit all parse and push down", async () => {
  const audit = fakeAudit();
  const env = await run(
    [
      "noticeboard",
      "history",
      "cli",
      "--days",
      "7",
      "--session",
      "wt-second",
      "--type",
      "conflict-refused",
      "--limit",
      "50",
    ],
    depsWith(audit),
  );
  assert.equal(env.ok, true, env.body);
  assert.deepEqual(audit.queries[0], {
    unitId: "cli",
    sessionId: "wt-second",
    type: "conflict-refused",
    sinceMs: 7 * MS_PER_DAY,
    limit: 50,
  });
});

test("noticeboard history --refusals renders the refusal view through the dispatch", async () => {
  const audit = fakeAudit();
  const env = await run(["noticeboard", "history", "--refusals"], depsWith(audit));
  assert.equal(env.ok, true, env.body);
  assert.equal(audit.queries[0]?.type, "conflict-refused", "the boolean becomes the type filter");
  assert.match(env.body, /wt-second REFUSED — held by wt-first/);
});

test("noticeboard history --holdings renders the hold-span view through the dispatch", async () => {
  const audit = fakeAudit();
  const env = await run(["noticeboard", "history", "--holdings"], depsWith(audit));
  assert.equal(env.ok, true, env.body);
  assert.match(env.body, /Hold spans \(/);
  assert.equal(audit.queries[0]?.type, undefined, "--holdings is a view, not a filter");
});

test("noticeboard history --days all lifts the window (the flag reaches the parser, not parseArgs)", async () => {
  const audit = fakeAudit();
  const env = await run(["noticeboard", "history", "--days", "all"], depsWith(audit));
  assert.equal(env.ok, true, env.body);
  assert.equal(audit.queries[0]?.sinceMs, undefined);
});

test("noticeboard history needs NO worktree identity — it writes nothing", async () => {
  // declare/claim/release all refuse without a derived identity. A read must not inherit that gate:
  // asking what happened on the ledger is not an act on the ledger.
  const audit = fakeAudit();
  const env = await run(
    ["noticeboard", "history", "--refusals"],
    { store: new InMemoryStore(), presence: { identity: null, ledger: audit } },
  );
  assert.equal(env.ok, true, env.body);
  assert.equal(audit.queries.length, 1);
});

test("noticeboard history without the live store refuses with db:up — never an empty render", async () => {
  const env = await run(["noticeboard", "history"], depsWith(null));
  assert.equal(env.ok, false);
  assert.match(env.body, /requires the live store \(--pg\)/);
});

test("a ledger fake WITHOUT the audit half degrades to the same refusal, not a crash", async () => {
  // Older test fakes (and any future partial store) carry the claim verbs but no `auditHistory`.
  // The house pattern for every read half on this seam: degrade politely.
  const ledgerOnly: ClaimLedgerStoreLike = {
    async take(): Promise<ClaimResult> {
      throw new Error("unused");
    },
    async upgrade(): Promise<ClaimResult> {
      throw new Error("unused");
    },
    async downgrade(): Promise<boolean> {
      return false;
    },
    async release(): Promise<boolean> {
      return false;
    },
    async claimsFor(): Promise<ClaimDocT[]> {
      return [];
    },
  };
  const env = await run(["noticeboard", "history"], depsWith(ledgerOnly));
  assert.equal(env.ok, false);
  assert.match(env.body, /requires the live store \(--pg\)/);
});

test("`history` is not swallowed by declare/done's unknown-sub-command arm", async () => {
  // The routing order matters: `history` is neither a ledger verb nor declare/done, so without its
  // own arm it would fall through to noticeboardCommand and render "Unknown noticeboard sub-command".
  const env = await run(["noticeboard", "history"], depsWith(fakeAudit()));
  assert.doesNotMatch(env.body, /Unknown noticeboard sub-command/);
});

test("the history flags are DECLARED in CLI_OPTIONS (parseArgs would reject them otherwise)", () => {
  for (const flag of ["days", "session", "type", "limit"]) {
    assert.equal(
      (CLI_OPTIONS as Record<string, { type: string }>)[flag]?.type,
      "string",
      `--${flag} must be a declared string flag`,
    );
  }
  for (const flag of ["refusals", "holdings"]) {
    assert.equal(
      (CLI_OPTIONS as Record<string, { type: string }>)[flag]?.type,
      "boolean",
      `--${flag} must be a declared boolean flag`,
    );
  }
});

test("noticeboard --help documents the audit-log verb and what it answers that the board cannot", async () => {
  const env = await run(["noticeboard", "--help"], depsWith(fakeAudit()));
  assert.match(env.body, /storytree noticeboard history/);
  assert.match(env.body, /reads TRANSITIONS/, "the help must name the distinction, not just the verb");
  assert.match(env.body, /--refusals/);
  assert.match(env.body, /--holdings/);
});
