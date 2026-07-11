import test from "node:test";
import assert from "node:assert/strict";

import {
  selectWitnessableVerdict,
  DRIVEN_PROOF_MODES,
  type VerdictRow,
  type WitnessPolicy,
  type WitnessDeps,
} from "./witnessable-verdict.js";

const NODE_IDS = ["drive-machinery-a", "drive-machinery-b"];

function policy(overrides: Partial<WitnessPolicy> = {}): WitnessPolicy {
  return {
    driveMachineryNodeIds: NODE_IDS,
    freshnessDays: 7,
    ...overrides,
  };
}

function deps(overrides: Partial<WitnessDeps> = {}): WitnessDeps {
  return {
    ancestorOfHead: () => true,
    now: () => new Date("2026-07-11T00:00:00.000Z"),
    ...overrides,
  };
}

function row(overrides: Partial<VerdictRow> = {}): VerdictRow {
  return {
    unitId: "drive-machinery-a",
    proofMode: "contract",
    outcome: "pass",
    signer: "operator@storytree",
    commitSha: "abc1234",
    at: "2026-07-10T00:00:00.000Z",
    ...overrides,
  };
}

test("selectWitnessableVerdict: a fully-qualifying row is selected (the green case)", () => {
  const result = selectWitnessableVerdict([row()], policy(), deps());
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.verdict.unitId, "drive-machinery-a");
  }
});

test("selectWitnessableVerdict: picks the NEWEST qualifying row among several", () => {
  const older = row({ commitSha: "older1", at: "2026-07-09T00:00:00.000Z" });
  const newer = row({ commitSha: "newer1", at: "2026-07-10T12:00:00.000Z" });
  const middle = row({ commitSha: "middle1", at: "2026-07-10T00:00:00.000Z" });
  const result = selectWitnessableVerdict([older, newer, middle], policy(), deps());
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.verdict.commitSha, "newer1");
  }
});

test("selectWitnessableVerdict: outcome !== pass disqualifies with a reason", () => {
  const result = selectWitnessableVerdict([row({ outcome: "fail" })], policy(), deps());
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.reasons.length, 1);
    assert.match(result.reasons[0]!, /drive-machinery-a/);
  }
});

test("selectWitnessableVerdict: proofMode 'adopted' is never a driven red-green — excluded", () => {
  const result = selectWitnessableVerdict(
    [row({ proofMode: "adopted", signer: "spine@storytree" })],
    policy(),
    deps(),
  );
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.reasons.length, 1);
    assert.match(result.reasons[0]!, /drive-machinery-a/);
  }
});

test("selectWitnessableVerdict: proofMode 'operator-attested' is excluded", () => {
  const result = selectWitnessableVerdict(
    [row({ proofMode: "operator-attested" })],
    policy(),
    deps(),
  );
  assert.equal(result.ok, false);
});

test("selectWitnessableVerdict: every DRIVEN_PROOF_MODES entry qualifies on its own", () => {
  for (const mode of DRIVEN_PROOF_MODES) {
    const result = selectWitnessableVerdict([row({ proofMode: mode })], policy(), deps());
    assert.equal(result.ok, true, `expected proofMode ${mode} to qualify`);
  }
});

test("selectWitnessableVerdict: unitId not in driveMachineryNodeIds disqualifies", () => {
  const result = selectWitnessableVerdict(
    [row({ unitId: "some-other-node" })],
    policy(),
    deps(),
  );
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.match(result.reasons[0]!, /some-other-node/);
  }
});

test("selectWitnessableVerdict: a verdict older than freshnessDays is disqualified", () => {
  const stale = row({ at: "2026-06-01T00:00:00.000Z" }); // well over 7 days before 'now'
  const result = selectWitnessableVerdict([stale], policy({ freshnessDays: 7 }), deps());
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.match(result.reasons[0]!, /drive-machinery-a/);
  }
});

test("selectWitnessableVerdict: a future-dated verdict is fine (age <= 0 <= freshnessDays)", () => {
  const future = row({ at: "2026-07-12T00:00:00.000Z" });
  const result = selectWitnessableVerdict(
    [future],
    policy({ freshnessDays: 7 }),
    deps({ now: () => new Date("2026-07-11T00:00:00.000Z") }),
  );
  assert.equal(result.ok, true);
});

test("selectWitnessableVerdict: a row right at the freshness boundary (exactly freshnessDays old) qualifies", () => {
  // now - at === exactly 7 days
  const boundary = row({ at: "2026-07-04T00:00:00.000Z" });
  const result = selectWitnessableVerdict(
    [boundary],
    policy({ freshnessDays: 7 }),
    deps({ now: () => new Date("2026-07-11T00:00:00.000Z") }),
  );
  assert.equal(result.ok, true);
});

test("selectWitnessableVerdict: commitSha not an ancestor of HEAD disqualifies", () => {
  const result = selectWitnessableVerdict(
    [row()],
    policy(),
    deps({ ancestorOfHead: () => false }),
  );
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.match(result.reasons[0]!, /ancestor/i);
  }
});

test("selectWitnessableVerdict: a malformed 'at' timestamp is a disqualifying reason, never a throw", () => {
  const malformed = row({ at: "not-a-real-timestamp" });
  assert.doesNotThrow(() => selectWitnessableVerdict([malformed], policy(), deps()));
  const result = selectWitnessableVerdict([malformed], policy(), deps());
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.reasons.length, 1);
    assert.match(result.reasons[0]!, /drive-machinery-a/);
  }
});

test("selectWitnessableVerdict: an empty rows array reports a catch-all reason, not a throw", () => {
  const result = selectWitnessableVerdict([], policy(), deps());
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.reasons.length, 1);
  }
});

test("selectWitnessableVerdict: multiple near-misses each produce their own reason", () => {
  const badMode = row({ commitSha: "sha-a", proofMode: "adopted" });
  const badNode = row({ commitSha: "sha-b", unitId: "unrelated-node" });
  const badOutcome = row({ commitSha: "sha-c", outcome: "fail" });
  const result = selectWitnessableVerdict([badMode, badNode, badOutcome], policy(), deps());
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.reasons.length, 3);
  }
});

test("selectWitnessableVerdict: does not mutate the input rows array", () => {
  const rows = [row(), row({ commitSha: "def5678", at: "2026-07-09T00:00:00.000Z" })];
  const snapshot = JSON.parse(JSON.stringify(rows));
  selectWitnessableVerdict(rows, policy(), deps());
  assert.deepEqual(rows, snapshot);
});
