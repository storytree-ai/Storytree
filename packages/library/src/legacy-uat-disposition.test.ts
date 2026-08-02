import test from "node:test";
import assert from "node:assert/strict";

import {
  LegacyUatDispositionLedger,
  mappedLegacyBinding,
  validateLegacyDispositionCoverage,
} from "./legacy-uat-disposition.js";

const PAIR = {
  criterionId: "uatc_0123456789abcdef01234567",
  revisionId: "uatr1:0123456789abcdef",
};

const ledger = LegacyUatDispositionLedger.parse({
  version: 1,
  dispositions: [
    {
      legacyTestId: "demo#uat-1",
      disposition: "mapped",
      ...PAIR,
      reviewedAt: "2026-08-02",
      rationale: "Reviewed one-to-one continuity during ADR-0253 migration.",
    },
    {
      legacyTestId: "demo#uat-2",
      disposition: "superseded",
      reviewedAt: "2026-08-02",
      rationale: "The old claim was replaced.",
    },
    {
      legacyTestId: "demo#uat-3",
      disposition: "unresolved",
      reviewedAt: "2026-08-02",
      rationale: "The positional key names multiple historical meanings.",
    },
  ],
});

test("every legacy key has one explicit mapped, superseded, or unresolved disposition", () => {
  assert.doesNotThrow(() =>
    validateLegacyDispositionCoverage(
      ["demo#uat-1", "demo#uat-2", "demo#uat-3"],
      ledger,
    ),
  );
  assert.throws(
    () => validateLegacyDispositionCoverage(["demo#uat-1", "demo#uat-4"], ledger),
    /missing.*demo#uat-4/i,
  );
});

test("only mapped legacy evidence resolves to an exact pair", () => {
  assert.deepEqual(mappedLegacyBinding("demo#uat-1", ledger), PAIR);
  assert.equal(mappedLegacyBinding("demo#uat-2", ledger), null);
  assert.equal(mappedLegacyBinding("demo#uat-3", ledger), null);
});

test("duplicate legacy keys and incomplete mapped pairs are refused", () => {
  assert.equal(
    LegacyUatDispositionLedger.safeParse({
      version: 1,
      dispositions: [ledger.dispositions[0], ledger.dispositions[0]],
    }).success,
    false,
  );
  assert.equal(
    LegacyUatDispositionLedger.safeParse({
      version: 1,
      dispositions: [
        {
          legacyTestId: "demo#uat-1",
          disposition: "mapped",
          criterionId: PAIR.criterionId,
          reviewedAt: "2026-08-02",
          rationale: "missing revision",
        },
      ],
    }).success,
    false,
  );
});
