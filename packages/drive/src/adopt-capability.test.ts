import test from "node:test";
import assert from "node:assert/strict";

import type { Status } from "@storytree/proof-protocol";
import { SPINE_PRINCIPAL } from "@storytree/orchestrator";

import {
  pathMatchesDeclared,
  runAdoptCapability,
  selfAuthoredSources,
  type AdoptCapabilityDeps,
  type AdoptCapabilitySpec,
} from "./adopt-capability.js";

// ---------------------------------------------------------------------------
// Fixtures — every seam injected, so the whole suite is offline: no disk, no git,
// no subprocess, no DB.
// ---------------------------------------------------------------------------

const CAP: AdoptCapabilitySpec = {
  id: "hydrated-store-dialing-root",
  tier: "capability",
  title: "The hydrated store dialing root",
  story: "library",
  proofCommand: "pnpm --filter @storytree/library test",
  sourcePaths: ["packages/library/src/store/connection.ts"],
  file: "stories/library/hydrated-store-dialing-root.md",
};

interface Recorded {
  appended: { id: string; kind: string; doc: unknown; actor?: string }[];
  observed: string[];
}

function makeDeps(over: Partial<AdoptCapabilityDeps> = {}, spec: AdoptCapabilitySpec | null = CAP) {
  const rec: Recorded = { appended: [], observed: [] };
  const deps: AdoptCapabilityDeps = {
    loadCapability: () => spec,
    ownStatus: async (): Promise<Status | null> => null,
    branchAuthoredPaths: () => ["packages/cli/src/unrelated.ts"],
    gitState: () => ({ commitSha: "abc1234def5678", clean: true }),
    observe: async (command) => {
      rec.observed.push(command);
      return { code: 0 };
    },
    resolveApprover: () => ({ ok: true, signer: "owner@example.com" }),
    store: {
      appendEvent: async (e) => {
        rec.appended.push(e);
        return e;
      },
    },
    now: () => new Date("2026-08-28T00:00:00.000Z"),
    ...over,
  };
  return { deps, rec };
}

// ---------------------------------------------------------------------------
// The pure fence helpers
// ---------------------------------------------------------------------------

test("pathMatchesDeclared: literal, single-star and double-star, and it never matches across a segment on a lone star", () => {
  assert.equal(pathMatchesDeclared("packages/a/src/x.ts", "packages/a/src/x.ts"), true);
  assert.equal(pathMatchesDeclared("packages/a/src/x.ts", "packages/a/src/y.ts"), false);

  // A lone `*` stays INSIDE one segment — this is what stops a narrow declaration from silently
  // fencing (or failing to fence) a whole subtree.
  assert.equal(pathMatchesDeclared("packages/a/src/x.ts", "packages/a/src/*.ts"), true);
  assert.equal(pathMatchesDeclared("packages/a/src/deep/x.ts", "packages/a/src/*.ts"), false);

  // `**` crosses segments.
  assert.equal(pathMatchesDeclared("packages/a/src/deep/x.ts", "packages/a/**/*.ts"), true);
  assert.equal(pathMatchesDeclared("packages/a/src/x.ts", "packages/a/**"), true);

  // A regex metacharacter in a path is compared literally, never as a pattern.
  assert.equal(pathMatchesDeclared("packages/a+b/x.ts", "packages/a+b/x.ts"), true);
  assert.equal(pathMatchesDeclared("packages/aXb/x.ts", "packages/a+b/x.ts"), false);
});

test("selfAuthoredSources: returns only the branch paths that are this capability's own declared source, sorted", () => {
  const hits = selfAuthoredSources(
    ["packages/z/src/other.ts", "packages/a/src/x.ts", "packages/a/src/b.ts"],
    ["packages/a/src/*.ts"],
  );
  assert.deepEqual(hits, ["packages/a/src/b.ts", "packages/a/src/x.ts"]);
  assert.deepEqual(selfAuthoredSources(["packages/z/src/other.ts"], ["packages/a/src/*.ts"]), []);
});

// ---------------------------------------------------------------------------
// The walls — each refuses, and (the load-bearing part) refuses BEFORE any spend
// ---------------------------------------------------------------------------

test("refuses with no capability id, and never reaches the spec loader", () => {
  let loaded = 0;
  const { deps } = makeDeps({
    loadCapability: () => {
      loaded += 1;
      return CAP;
    },
  });
  return runAdoptCapability(undefined, {}, deps).then((env) => {
    assert.equal(env.ok, false);
    assert.match(env.body, /needs a capability id/);
    assert.equal(loaded, 0);
  });
});

test("refuses an unknown capability", async () => {
  const { deps } = makeDeps({}, null);
  const env = await runAdoptCapability("nope", {}, deps);
  assert.equal(env.ok, false);
  assert.match(env.body, /no capability "nope"/);
});

test("a STORY is refused here and pointed at the status-guarded story entry — the mapped-only guard is not walked around at another grain", async () => {
  const { deps, rec } = makeDeps({}, { ...CAP, id: "library", tier: "story" });
  const env = await runAdoptCapability("library", {}, deps);
  assert.equal(env.ok, false);
  assert.match(env.body, /is a STORY/);
  assert.match(env.body, /storytree adopt library --pg/);
  assert.equal(rec.observed.length, 0);
  assert.equal(rec.appended.length, 0);
});

test("a CONTRACT is refused — it is proven by the capability that folds it", async () => {
  const { deps } = makeDeps({}, { ...CAP, tier: "contract" });
  const env = await runAdoptCapability(CAP.id, {}, deps);
  assert.equal(env.ok, false);
  assert.match(env.body, /is a contract, not a capability/);
});

test("NEVER stamps over an own signed pass — an already-healthy capability refuses and nothing is appended", async () => {
  const { deps, rec } = makeDeps({ ownStatus: async () => "healthy" });
  const env = await runAdoptCapability(CAP.id, {}, deps);
  assert.equal(env.ok, false);
  assert.match(env.body, /ALREADY holds its own signed pass/);
  assert.match(env.body, /last-event-wins/);
  assert.equal(rec.observed.length, 0);
  assert.equal(rec.appended.length, 0);
});

test("a signed FAIL is not adopted — a red is fixed, never painted over", async () => {
  const { deps, rec } = makeDeps({ ownStatus: async () => "unhealthy" });
  const env = await runAdoptCapability(CAP.id, {}, deps);
  assert.equal(env.ok, false);
  assert.match(env.body, /holds a signed FAIL/);
  assert.equal(rec.appended.length, 0);
});

test("THE CLASS C WALL: a capability declaring no proof command refuses for free and names what to author", async () => {
  const { deps, rec } = makeDeps({}, { ...CAP, proofCommand: undefined });
  const env = await runAdoptCapability(CAP.id, {}, deps);
  assert.equal(env.ok, false);
  assert.match(env.body, /declares no proof command/);
  // The refusal must also name the two OTHER honest outcomes, so a reader does not conclude that
  // authoring a command is always the right answer (ADR-0465 D1's three piles).
  assert.match(env.body, /unbuilt/);
  assert.match(env.body, /not capability-shaped/);
  assert.equal(rec.observed.length, 0);
});

test("a capability declaring no source paths refuses — its service history cannot be fenced", async () => {
  const { deps, rec } = makeDeps({}, { ...CAP, sourcePaths: [] });
  const env = await runAdoptCapability(CAP.id, {}, deps);
  assert.equal(env.ok, false);
  assert.match(env.body, /declares no source paths/);
  assert.equal(rec.observed.length, 0);
});

test("THE FENCE FAILS CLOSED: an unreadable base refuses rather than adopting unfenced", async () => {
  const { deps, rec } = makeDeps({ branchAuthoredPaths: () => null });
  const env = await runAdoptCapability(CAP.id, {}, deps);
  assert.equal(env.ok, false);
  assert.match(env.body, /fails CLOSED/);
  assert.equal(rec.observed.length, 0);
  assert.equal(rec.appended.length, 0);
});

test("THE SELF-ATTESTATION FENCE: a branch that authored the capability's own source cannot adopt it", async () => {
  const { deps, rec } = makeDeps({
    branchAuthoredPaths: () => ["packages/library/src/store/connection.ts"],
  });
  const env = await runAdoptCapability(CAP.id, {}, deps);
  assert.equal(env.ok, false);
  assert.match(env.body, /THIS BRANCH authored the source/);
  assert.match(env.body, /self-attestation/);
  // It names the offending path, and sends the caller at the honest alternative: drive a real proof.
  assert.match(env.body, /packages\/library\/src\/store\/connection\.ts/);
  assert.match((env.next ?? []).join(" "), /--real/);
  assert.equal(rec.observed.length, 0);
  assert.equal(rec.appended.length, 0);
});

test("the fence matches through a declared GLOB, not only an exact path", async () => {
  const { deps } = makeDeps(
    { branchAuthoredPaths: () => ["packages/library/src/store/pg-store.ts"] },
    { ...CAP, sourcePaths: ["packages/library/src/store/*.ts"] },
  );
  const env = await runAdoptCapability(CAP.id, {}, deps);
  assert.equal(env.ok, false);
  assert.match(env.body, /THIS BRANCH authored the source/);
});

test("a blank approver refuses BEFORE the suite runs — adoption must be attributable to a person", async () => {
  const { deps, rec } = makeDeps({
    resolveApprover: () => ({ ok: false, error: "no signer resolved" }),
  });
  const env = await runAdoptCapability(CAP.id, {}, deps);
  assert.equal(env.ok, false);
  assert.match(env.body, /accepts RISK/);
  assert.equal(rec.observed.length, 0, "the approver wall must precede any spend");
});

test("refuses offline — a verdict that evaporates greens nothing", async () => {
  const { deps, rec } = makeDeps({ store: null });
  const env = await runAdoptCapability(CAP.id, {}, deps);
  assert.equal(env.ok, false);
  assert.match(env.body, /live store/);
  assert.equal(rec.observed.length, 0);
});

test("refuses a DIRTY tree — an adopted verdict pins the commit it observed", async () => {
  const { deps, rec } = makeDeps({
    gitState: () => ({ commitSha: "abc1234def5678", clean: false }),
  });
  const env = await runAdoptCapability(CAP.id, {}, deps);
  assert.equal(env.ok, false);
  assert.match(env.body, /clean committed HEAD/);
  assert.equal(rec.observed.length, 0);
});

test("refuses when git cannot be read at all", async () => {
  const { deps } = makeDeps({ gitState: () => null });
  const env = await runAdoptCapability(CAP.id, {}, deps);
  assert.equal(env.ok, false);
  assert.match(env.body, /could not read git state/);
});

test("a RED command signs nothing — the bar does not move when the suite does not pass", async () => {
  const { deps, rec } = makeDeps({ observe: async () => ({ code: 1 }) });
  const env = await runAdoptCapability(CAP.id, {}, deps);
  assert.equal(env.ok, false);
  assert.match(env.body, /was NOT adopted/);
  assert.equal(rec.appended.length, 0, "no verdict row on a red");
});

// ---------------------------------------------------------------------------
// The happy path — what the signed row actually claims
// ---------------------------------------------------------------------------

test("adopts: observes the declared command, signs ONE `adopted` verdict whose unitId is the CAPABILITY, spine-signed and owner-approved", async () => {
  const { deps, rec } = makeDeps();
  const env = await runAdoptCapability(CAP.id, { signer: "owner@example.com" }, deps);

  assert.equal(env.ok, true);
  assert.deepEqual(rec.observed, ["pnpm --filter @storytree/library test"]);
  assert.equal(rec.appended.length, 1);

  const row = rec.appended[0];
  assert.ok(row !== undefined);
  const verdict = row.doc as {
    unitId: string;
    proofMode: string;
    outcome: string;
    signer: string;
    approvedBy?: string;
    commitSha: string;
    criterionId?: string;
  };
  // The verdict binds to the CAPABILITY, so `rollupStatus` folds it exactly like any other own
  // verdict — the plant greens through a signed row, never through authored paint.
  assert.equal(verdict.unitId, "hydrated-store-dialing-root");
  assert.equal(verdict.proofMode, "adopted");
  assert.equal(verdict.outcome, "pass");
  assert.equal(verdict.commitSha, "abc1234def5678");
  // The MACHINE signs (it watched the exit code); the OWNER is recorded as the party accepting the
  // risk. Neither is the other, and no model appears anywhere.
  assert.equal(verdict.signer, SPINE_PRINCIPAL);
  assert.equal(verdict.approvedBy, "owner@example.com");
  assert.equal(row.actor, SPINE_PRINCIPAL);
  // No criterion binding — this is the brownfield class, not a machine UAT leg.
  assert.equal(verdict.criterionId, undefined);
});

test("the render states the basis rather than claiming a driven pass, and never ranks the two", async () => {
  const { deps } = makeDeps();
  const env = await runAdoptCapability(CAP.id, {}, deps);
  assert.equal(env.ok, true);
  assert.match(env.body, /NOT a driven red→green/);
  assert.match(env.body, /differ in KIND, not in rank/);
  // ADR-0465 D5's route back is part of what the adoption says about itself.
  assert.match(env.body, /Green until notified otherwise/);
  // It records who accepted the risk, and says plainly that they are not the signer.
  assert.match(env.body, /ACCEPTED THE RISK/);
  assert.match(env.body, new RegExp(SPINE_PRINCIPAL));
});

test("a capability whose own status is null but which is covered elsewhere still adopts — coverage is not a refusal", async () => {
  // ADR-0465's population is the caps holding NEITHER an own verdict NOR a covering gate, but the
  // wall here is deliberately keyed to the cap's OWN status: a covering gate is someone else's
  // verdict, and refusing on it would make this entry depend on a fold it does not own.
  const { deps, rec } = makeDeps({ ownStatus: async () => null });
  const env = await runAdoptCapability(CAP.id, {}, deps);
  assert.equal(env.ok, true);
  assert.equal(rec.appended.length, 1);
});
