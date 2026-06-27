import { test } from "node:test";
import assert from "node:assert/strict";
import { SIGNING_EVENT_KIND } from "@storytree/proof-protocol";
import { deriveUnitStatuses, renderUnitStatusFile, type StatusEvent } from "./build-unit-status.js";

/**
 * Red→green for the unit-status derivation (ADR-0120, finding 1). Pure: synthetic verdict events in,
 * status rows out — no DB. The derivation is the projection that finally makes PROVEN progress visible
 * on disk; the load-bearing behaviour is "latest signed verdict per unit decides", mirroring the tree
 * world's verdict-derived green (a latest-FAIL abstains, so it is omitted — never a false healthy).
 */

function verdict(seq: number, unitId: string, outcome: "pass" | "fail"): StatusEvent {
  return {
    kind: SIGNING_EVENT_KIND,
    seq,
    doc: {
      unitId,
      proofMode: "contract",
      outcome,
      commitSha: "abc1234",
      signer: "spine",
      runId: `run-${seq}`,
      at: "2026-01-01T00:00:00.000Z",
    },
  };
}

test("deriveUnitStatuses: a latest-pass unit is healthy; a latest-fail unit is omitted", () => {
  const rows = deriveUnitStatuses([verdict(1, "u1", "pass"), verdict(2, "u2", "fail"), verdict(3, "u3", "pass")]);
  assert.deepEqual(rows.map((r) => r.id), ["u1", "u3"], "only proven (latest-pass) units, sorted by id");
  assert.ok(rows.every((r) => r.status === "healthy"));
  assert.equal(rows[0]!.latestVerdict.outcome, "pass");
  assert.equal(rows[0]!.latestVerdict.runId, "run-1");
});

test("deriveUnitStatuses: the verdict projection decides — re-proven heals, drift surfaces, never-proven omitted", () => {
  // fail then pass → re-proven healthy.
  const reproven = deriveUnitStatuses([verdict(1, "u1", "fail"), verdict(2, "u1", "pass")]);
  assert.deepEqual(reproven.map((r) => r.id), ["u1"]);
  assert.equal(reproven[0]!.status, "healthy");
  // pass then fail → a once-proven unit that DRIFTED: surfaced as unhealthy (observability-first),
  // never silently dropped — that is the regression you most want visible.
  const drifted = deriveUnitStatuses([verdict(1, "u1", "pass"), verdict(2, "u1", "fail")]);
  assert.deepEqual(drifted.map((r) => r.id), ["u1"]);
  assert.equal(drifted[0]!.status, "unhealthy");
  // only-ever-fail → the projection abstains (null) → omitted, never a false entry.
  assert.deepEqual(deriveUnitStatuses([verdict(1, "u2", "fail")]).map((r) => r.id), []);
});

test("deriveUnitStatuses: malformed signing docs and non-signing events grant nothing", () => {
  const rows = deriveUnitStatuses([
    { kind: SIGNING_EVENT_KIND, seq: 1, doc: { unitId: "bad", outcome: "pass" } }, // not a full Verdict
    { kind: "work", seq: 2, doc: { unitId: "u1" } }, // not a signing event
    verdict(3, "u1", "pass"),
  ]);
  assert.deepEqual(rows.map((r) => r.id), ["u1"], "only the well-formed verdict counts");
});

test("renderUnitStatusFile: stable @generated JSON, marked DO NOT EDIT, trailing newline", () => {
  const out = renderUnitStatusFile(deriveUnitStatuses([verdict(1, "u1", "pass")]));
  assert.match(out, /DO NOT EDIT/);
  assert.ok(out.endsWith("\n"));
  const parsed = JSON.parse(out) as { units: { id: string }[] };
  assert.deepEqual(parsed.units.map((u) => u.id), ["u1"]);
});
