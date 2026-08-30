import { test } from "node:test";
import assert from "node:assert/strict";

import type { StoredDoc } from "@storytree/storage-protocol";
import { CURRENT_SCHEMA_VERSION } from "@storytree/library";

import { libraryHealth, type CheckResult } from "./health.js";

/**
 * `referentialIntegrity`, held in ITS OWN PACKAGE.
 *
 * This module's tests have always lived in `packages/cli/src/health.test.ts`, because the CLI is what
 * composes the fs-backed resolvers. That is fine for behaviour and blind for MUTATION: the rung runs
 * per-package, so every line here reported `NO COVERAGE — no test reaches this line` while being
 * thoroughly covered from next door. The cli-side suite is unchanged and remains the broad one; this
 * file covers what ADR-0477 D5 moved, where the rung can see it.
 *
 * WHAT MOVED: the scan read the `references` citation list until ADR-0477 D1 retired it, and now
 * reads the authored `dependsOn` edge. That repoint is a CORRECTION, not a fallback — a check left on
 * the dead field would have kept printing "every pointer resolves" over a scan that had lost its main
 * input, and would have disarmed the fail-closed clause with it (that clause is armed by
 * `decisionPointers > 0`, which an empty scan drives to zero).
 */

const BASE_OPTS = {
  currentSchemaVersion: CURRENT_SCHEMA_VERSION,
  retiredFields: [] as string[],
};

function doc(id: string, over: Record<string, unknown> = {}): StoredDoc {
  return {
    id,
    kind: "definition",
    doc: {
      kind: "definition",
      id,
      title: id,
      description: "a fixture for the health tests",
      schemaVersion: CURRENT_SCHEMA_VERSION,
      oneLine: "one line",
      whatItIs: "what it is",
      createdAt: "2026-08-30T00:00:00.000Z",
      updatedAt: "2026-08-30T00:00:00.000Z",
      ...over,
    },
    createdAt: "2026-08-30T00:00:00.000Z",
    updatedAt: "2026-08-30T00:00:00.000Z",
  };
}

function refIntegrity(rows: readonly StoredDoc[], over: Record<string, unknown> = {}): CheckResult {
  const r = libraryHealth([...rows], { ...BASE_OPTS, ...over }).find(
    (c) => c.name === "referential-integrity",
  );
  assert.ok(r, "the report always carries a referential-integrity result");
  return r;
}

test("referential-integrity scans the AUTHORED dependsOn edge — a dangling asset: pointer is a graph break", () => {
  // The whole repoint in one assertion: an edge that resolves to nothing must FAIL. If this scanned
  // the retired field it would find no pointers at all and report a clean corpus.
  const r = refIntegrity([doc("a", { dependsOn: ["asset:ghost"] })]);
  assert.equal(r.level, "FAIL");
  assert.ok(r.lines.some((l) => l.includes("a -> asset:ghost")));
});

test("referential-integrity PASSES when the dependsOn target is held, and names the schemes it checked", () => {
  const r = refIntegrity([doc("a", { dependsOn: ["asset:b"] }), doc("b")]);
  assert.equal(r.level, "PASS");
  // The clean line is the report's ONLY claim about its own scope, so it must not overstate it:
  // `node:` was a fifth scheme and went with the field that carried it (ADR-0477 D1).
  const line = r.lines.join("\n");
  assert.match(line, /every asset:\/doc:\/story:\/capability: pointer resolves/);
  assert.ok(!line.includes("node:"), "the retired scheme is not claimed as checked");
});

test("a NON-ARRAY dependsOn scans as no pointers rather than throwing", () => {
  // This runs over the LIVE corpus, not a parsed union, so a row from an older schema or a hand-edit
  // must not take the whole report down — and must not be read as one pointer either.
  assert.equal(refIntegrity([doc("a", { dependsOn: "asset:ghost" })]).level, "PASS");
  assert.equal(refIntegrity([doc("a", { dependsOn: 42 })]).level, "PASS");
});

test("NON-STRING dependsOn entries are dropped, and the real pointer beside them is still checked", () => {
  // Both halves matter and they fail in opposite directions: without the filter a numeric entry
  // reaches `ref.startsWith` and throws; with a filter that dropped everything, the genuine dangling
  // pointer beside it goes unseen and the report reads clean.
  const r = refIntegrity([doc("a", { dependsOn: [7, null, { id: "x" }, "asset:ghost"] })]);
  assert.equal(r.level, "FAIL");
  assert.ok(r.lines.some((l) => l.includes("asset:ghost")));
  assert.ok(!r.lines.some((l) => l.includes(" -> 7")), "the non-strings are dropped, not reported");
});

test("a doc: DECISION pointer resolves against the store's own adr-NNNN rows, and the census rides every outcome", () => {
  // ADR-0403 dec 1 made a decision an ordinary row, so `doc:decisions/…` is satisfied by `adr-0017`
  // EXISTING — not by a file. The census line is what distinguishes a check that ran from one that
  // found nothing to do, which is the whole reason the repoint had to keep this arm fed.
  const adr: StoredDoc = {
    id: "adr-0017",
    kind: "adr",
    doc: { kind: "adr", id: "adr-0017", number: 17, title: "t", description: "d", status: "accepted", body: "b", createdAt: "x", updatedAt: "y" },
    createdAt: "x",
    updatedAt: "y",
  };
  const r = refIntegrity([doc("a", { dependsOn: ["doc:decisions/0017-cross-cutting-knowledge-tier.md"] }), adr]);
  assert.equal(r.level, "PASS");
  assert.ok(
    r.lines.some((l) => l.includes("1 decision pointer(s) resolved against 1 adr-NNNN rows in the store")),
    `the census must ride a clean outcome too:\n${r.lines.join("\n")}`,
  );
});

test("FAILS CLOSED: decision pointers with no decision ROWS is NOT CHECKED, never a clean answer", () => {
  // The clause the repoint had to keep armed. It is gated on `decisionPointers > 0`, so a scan that
  // found no pointers at all would DISARM it — and an unreadable store would then report clean.
  const r = refIntegrity([doc("a", { dependsOn: ["doc:decisions/0017-cross-cutting-knowledge-tier.md"] })]);
  assert.equal(r.level, "FAIL");
  assert.ok(r.lines.some((l) => l.includes("NOT CHECKED")), r.lines.join("\n"));
  assert.ok(!r.lines.some((l) => l.includes("resolved against")), "it does not also print a census it cannot stand behind");
});
