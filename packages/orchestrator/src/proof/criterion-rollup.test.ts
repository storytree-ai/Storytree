import test from "node:test";
import assert from "node:assert/strict";

import type { LegacyUatDispositionLedger } from "@storytree/library";

import { rollupCriterionStatus } from "./uat-proof.js";

const CURRENT = {
  criterionId: "uatc_0123456789abcdef01234567",
  revisionId: "uatr1:2222222222222222",
};
const OLD_REVISION = "uatr1:1111111111111111";
const BASE = {
  proofMode: "story",
  outcome: "pass",
  commitSha: "abc",
  signer: "spine",
  runId: "run",
  evidence: [],
  at: "2026-08-02T00:00:00.000Z",
};

function event(seq: number, doc: unknown) {
  return { kind: "signing", seq, doc };
}

test("only an exact (criterionId, revisionId) verdict earns current proof credit", () => {
  assert.equal(
    rollupCriterionStatus(CURRENT, [event(1, { ...BASE, unitId: CURRENT.criterionId, ...CURRENT })]),
    "healthy",
  );
  assert.equal(
    rollupCriterionStatus(CURRENT, [
      event(1, {
        ...BASE,
        unitId: CURRENT.criterionId,
        criterionId: CURRENT.criterionId,
        revisionId: OLD_REVISION,
      }),
    ]),
    null,
    "stale evidence never silently advances",
  );
  assert.equal(
    rollupCriterionStatus(CURRENT, [event(1, { ...BASE, unitId: CURRENT.criterionId })]),
    null,
    "unbound evidence under the opaque id is still not proof",
  );
});

test("explicitly mapped legacy evidence may project only to its reviewed exact pair", () => {
  const mapped: LegacyUatDispositionLedger = {
    version: 1,
    dispositions: [
      {
        legacyTestId: "demo#uat-1",
        disposition: "mapped",
        ...CURRENT,
        reviewedAt: "2026-08-02",
        rationale: "reviewed continuity",
      },
    ],
  };
  const legacy = event(1, { ...BASE, unitId: "demo#uat-1" });
  assert.equal(rollupCriterionStatus(CURRENT, [legacy], mapped), "healthy");
  assert.equal(
    rollupCriterionStatus({ ...CURRENT, revisionId: OLD_REVISION }, [legacy], mapped),
    null,
  );
});

test("superseded and unresolved legacy evidence earns no current credit", () => {
  for (const disposition of ["superseded", "unresolved"] as const) {
    const ledger: LegacyUatDispositionLedger = {
      version: 1,
      dispositions: [
        {
          legacyTestId: "demo#uat-1",
          disposition,
          reviewedAt: "2026-08-02",
          rationale: "historical only",
        },
      ],
    };
    assert.equal(
      rollupCriterionStatus(CURRENT, [event(1, { ...BASE, unitId: "demo#uat-1" })], ledger),
      null,
    );
  }
});
