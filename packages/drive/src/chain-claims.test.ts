// The chain claims the NODES it writes (`chain-claims-its-nodes`, `parallel-red-green-arc`).
//
// THE RED these lock down: `buildNodeReal` takes no claim, so a story chain held ONE claim on
// `story.id` — a proxy for a set — while the thing ADR-0121 actually measured (two runs proving the
// same NODES, duplicate signed verdicts, double billing) went unfenced per member. Every case below
// fails against a story-grain take, because a story-grain take neither names members nor lets
// disjoint members proceed.

import { test } from "node:test";
import assert from "node:assert/strict";

import type { ClaimAcquired, ClaimDocT, ClaimRequest, ClaimResult } from "@storytree/notice-board";

import {
  acquireChainClaims,
  canonicalClaimOrder,
  chainClaimExitNotice,
  chainClaimRefusalBody,
  releaseChainClaims,
  type ChainClaimDeps,
  type HeldClaim,
} from "./chain-claims.js";

function claimDoc(over: Partial<ClaimDocT> = {}): ClaimDocT {
  return {
    unitId: "build-drive-cli",
    sessionId: "other-session",
    branch: "claude/other",
    intent: "real",
    grade: "work",
    claimedAt: "2026-08-08T01:00:00.000Z",
    heartbeatAt: "2026-08-08T01:00:00.000Z",
    ...over,
  } as ClaimDocT;
}

/**
 * A fake ledger with the one property that matters: rows keyed `(unitId, sessionId)`, so a take by
 * the session that already holds the row is RE-ENTRANT and reports the absorbed row as `displaced` —
 * the asymmetry the rollback and exit paths both turn on.
 */
function fakeLedger(seed: ClaimDocT[] = []): ChainClaimDeps & {
  takes: () => string[];
  releases: () => string[];
  rows: () => string[];
  logged: () => string;
} {
  const rows = new Map<string, ClaimDocT>();
  for (const row of seed) rows.set(`${row.unitId}::${row.sessionId}`, row);
  const takes: string[] = [];
  const releases: string[] = [];
  const lines: string[] = [];
  return {
    claim: async (req: ClaimRequest): Promise<ClaimResult> => {
      takes.push(req.unitId);
      const mine = rows.get(`${req.unitId}::${req.sessionId}`);
      const holder = [...rows.values()].find(
        (r) => r.unitId === req.unitId && r.sessionId !== req.sessionId,
      );
      if (holder !== undefined) return { acquired: false, heldBy: holder };
      const fresh = claimDoc({
        unitId: req.unitId,
        sessionId: req.sessionId,
        branch: req.branch,
        intent: req.intent ?? "",
      });
      rows.set(`${req.unitId}::${req.sessionId}`, fresh);
      const acquired: ClaimAcquired = { acquired: true, claim: fresh, reclaimed: false };
      if (mine !== undefined) acquired.displaced = mine;
      return acquired;
    },
    release: async (unitId: string, sessionId: string): Promise<boolean> => {
      releases.push(unitId);
      return rows.delete(`${unitId}::${sessionId}`);
    },
    log: (m: string) => lines.push(m),
    now: () => new Date("2026-08-08T02:00:00.000Z"),
    takes: () => takes,
    releases: () => releases,
    rows: () => [...rows.keys()].sort(),
    logged: () => lines.join("\n"),
  };
}

const ME = { sessionId: "mine", branch: "claude/mine", intent: "story:real", caller: "story build s --real" };

// ── the canonical take order (module note, detail 1) ─────────────────────────

test("canonicalClaimOrder: deduplicates and sorts — the take order is canonical, never the drive order", () => {
  assert.deepEqual(canonicalClaimOrder(["c", "a", "b", "a"]), ["a", "b", "c"]);
});

test("dedup is load-bearing: a repeated id would make the second take re-entrant on the row the FIRST take created", async () => {
  const led = fakeLedger();
  const out = await acquireChainClaims(led, { ...ME, unitIds: ["cap-a", "cap-a"] });
  assert.equal(out.ok, true);
  assert.equal(led.takes().length, 1);
  // If it had taken twice, the second would report `displaced` and the run would LEAK the claim by
  // "keeping" a row its own take created.
  assert.ok(out.ok && out.held[0]?.displaced === undefined);
});

// ── the set take ─────────────────────────────────────────────────────────────

test("THE RED: the chain claims EVERY member it will drive, not the story id", async () => {
  const led = fakeLedger();
  const out = await acquireChainClaims(led, { ...ME, unitIds: ["cap-b", "cap-a", "cap-c"] });
  assert.equal(out.ok, true);
  assert.deepEqual(led.takes(), ["cap-a", "cap-b", "cap-c"]);
  assert.deepEqual(
    out.ok ? out.held.map((h) => h.unitId) : [],
    ["cap-a", "cap-b", "cap-c"],
  );
  // Nothing claimed the story: a story-grain row is a proxy for a set, and the set is now held itself.
  assert.ok(!led.takes().includes("s"));
});

test("a refusal ROLLS BACK the claims already taken — a refused chain leaves the ledger as it found it", async () => {
  const led = fakeLedger([claimDoc({ unitId: "cap-b", sessionId: "sibling" })]);
  const out = await acquireChainClaims(led, { ...ME, unitIds: ["cap-a", "cap-b", "cap-c"] });
  assert.equal(out.ok, false);
  assert.equal(out.ok === false && out.refusedUnit, "cap-b");
  assert.equal(out.ok === false && out.heldBy.sessionId, "sibling");
  // cap-a was taken, then given back. cap-c was never reached.
  assert.deepEqual(led.releases(), ["cap-a"]);
  assert.deepEqual(led.rows(), ["cap-b::sibling"]);
});

test("rollback obeys the borrow-vs-take asymmetry: a row the session already held is LEFT, never destroyed", async () => {
  // The ADR-0199 class: `events.node_claim` is keyed (unit, session), so the take OVERWRITES this
  // session's own declaration. Rolling that back unconditionally deletes a claim the chain never took.
  const led = fakeLedger([
    claimDoc({ unitId: "cap-a", sessionId: "mine", intent: "orchestrate" }),
    claimDoc({ unitId: "cap-c", sessionId: "sibling" }),
  ]);
  const out = await acquireChainClaims(led, { ...ME, unitIds: ["cap-a", "cap-b", "cap-c"] });
  assert.equal(out.ok, false);
  // cap-b was taken by this run and released; cap-a was BORROWED and survives.
  assert.deepEqual(led.releases(), ["cap-b"]);
  assert.deepEqual(led.rows(), ["cap-a::mine", "cap-c::sibling"]);
});

test("THE ADR-0270 D1 RESOLUTION: two sessions on DISJOINT capabilities of one story both acquire", async () => {
  // Today both demand the story id and the second is refused outright. Holding disjoint member
  // claims they never meet — no narrowing rule, no partial-build special case.
  const led = fakeLedger();
  const a = await acquireChainClaims(led, { ...ME, unitIds: ["cap-a", "cap-b"] });
  const b = await acquireChainClaims(led, {
    sessionId: "sibling",
    branch: "claude/sibling",
    intent: "story:real",
    caller: "story build s --real",
    unitIds: ["cap-c", "cap-d"],
  });
  assert.equal(a.ok, true);
  assert.equal(b.ok, true);
  assert.deepEqual(led.rows(), ["cap-a::mine", "cap-b::mine", "cap-c::sibling", "cap-d::sibling"]);
});

test("the canonical order makes MUTUAL refusal unreachable: overlapping sets contend at their least common member", async () => {
  // The hazard a set take introduces if each contender used its own drive order: A holds `y` and
  // wants `x`, B holds `x` and wants `y`, and both roll back having proved nothing. Under one global
  // order both reach the least common member FIRST, so exactly one wins.
  const led = fakeLedger();
  const a = await acquireChainClaims(led, { ...ME, unitIds: ["y", "x"] }); // drive order y→x
  const b = await acquireChainClaims(led, {
    sessionId: "sibling",
    branch: "claude/sibling",
    intent: "story:real",
    caller: "story build s --real",
    unitIds: ["x", "y"], // drive order x→y
  });
  assert.equal(a.ok, true, "the first contender holds the whole set");
  assert.equal(b.ok, false, "the second is refused — but only one of them is");
  assert.equal(b.ok === false && b.refusedUnit, "x", "both tried the least member first");
  assert.deepEqual(led.rows(), ["x::mine", "y::mine"], "the loser left nothing behind");
});

// ── the exit path ────────────────────────────────────────────────────────────

test("release splits taken from borrowed: only rows this run's own take created go away", async () => {
  const borrowed = claimDoc({ unitId: "cap-a", sessionId: "mine", intent: "orchestrate" });
  const led = fakeLedger([
    borrowed,
    claimDoc({ unitId: "cap-b", sessionId: "mine" }),
  ]);
  const held: HeldClaim[] = [{ unitId: "cap-a", displaced: borrowed }, { unitId: "cap-b" }];
  const out = await releaseChainClaims(led, held, { sessionId: "mine", caller: "story build s --real" });
  assert.deepEqual(out.released, ["cap-b"]);
  assert.deepEqual(out.kept.map((k) => k.unitId), ["cap-a"]);
  assert.deepEqual(led.rows(), ["cap-a::mine"]);
});

test("the exit reports ONCE for the whole chain, naming both sets", async () => {
  const borrowed = claimDoc({ unitId: "cap-a", sessionId: "mine" });
  const led = fakeLedger([borrowed, claimDoc({ unitId: "cap-b", sessionId: "mine" })]);
  await releaseChainClaims(
    led,
    [{ unitId: "cap-a", displaced: borrowed }, { unitId: "cap-b" }],
    { sessionId: "mine", caller: "story build s --real" },
  );
  const logged = led.logged();
  // One block, not one per unit — a seven-node chain must not emit seven seven-line warnings.
  assert.equal(logged.split("[claim]").length - 1, 1);
  assert.match(logged, /RELEASED[^\n]*cap-b/);
  assert.match(logged, /KEPT[^\n]*cap-a/);
});

test("release is FAIL-SOFT and still reports: a store failure never fails an otherwise-good build", async () => {
  const lines: string[] = [];
  const deps: ChainClaimDeps = {
    claim: async () => {
      throw new Error("unused");
    },
    release: async () => {
      throw new Error("pool closed");
    },
    log: (m: string) => lines.push(m),
    now: () => new Date("2026-08-08T02:00:00.000Z"),
  };
  const out = await releaseChainClaims(deps, [{ unitId: "cap-a" }], {
    sessionId: "mine",
    caller: "story build s --real",
  });
  assert.deepEqual(out.released, []);
  // The failure line survives the consolidation — it is the one thing worth printing verbatim.
  assert.match(lines.join("\n"), /pool closed/);
});

test("a release that deleted nothing is not an event: no notice is invented for an empty exit", async () => {
  const led = fakeLedger();
  await releaseChainClaims(led, [], { sessionId: "mine", caller: "story build s --real" });
  assert.equal(led.logged(), "");
});

test("chainClaimExitNotice states what went away, what stayed, and how to re-take", () => {
  const notice = chainClaimExitNotice({
    caller: "story build s --real",
    sessionId: "mine",
    released: ["cap-b"],
    kept: ["cap-a"],
    at: "2026-08-08T02:00:00.000Z",
  });
  assert.match(notice, /RELEASED.*cap-b/);
  assert.match(notice, /KEPT.*cap-a/);
  assert.match(notice, /noticeboard declare/);
});

// ── the refusal (ADR-0270 D3) ────────────────────────────────────────────────

test("THE RED: the refusal names the CAPABILITY actually held, not the story (ADR-0270 D3)", () => {
  const body = chainClaimRefusalBody({
    storyId: "drive-machinery",
    refusedUnit: "build-drive-cli",
    heldBy: claimDoc({ unitId: "build-drive-cli", sessionId: "sibling", branch: "claude/sib" }),
    requested: ["build-drive-cli", "orchestrate-drive-cli"],
  });
  assert.match(body, /node "build-drive-cli"/);
  assert.match(body, /sibling \(branch claude\/sib\)/);
  // The story is named as CONTEXT for the member, never as the thing that is claimed.
  assert.doesNotMatch(body, /story "drive-machinery" is already/);
  // And it tells the reader the disjoint remainder is drivable — the D1 tension, resolved.
  assert.match(body, /orchestrate-drive-cli/);
  assert.match(body, /ADR-0270 D1/);
});

test("the refusal is honest when there IS no disjoint remainder", () => {
  const body = chainClaimRefusalBody({
    storyId: "s",
    refusedUnit: "only",
    heldBy: claimDoc({ unitId: "only", sessionId: "sibling" }),
    requested: ["only"],
  });
  assert.match(body, /no disjoint remainder/);
  assert.doesNotMatch(body, /ADR-0270 D1/);
});
