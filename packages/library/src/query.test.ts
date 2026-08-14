import test from "node:test";
import assert from "node:assert/strict";

import {
  isClauseError,
  matchesAll,
  matchesClause,
  parseQueryClause,
  readPath,
  renderValue,
  type QueryClause,
} from "./query.js";

/**
 * The ad-hoc corpus query predicate (`tool-signal-gaps-arc`, from friction
 * `no-verb-answers-an-ad-hoc-question-of-the-live-store`). Pure over already-fetched documents, so
 * every case here runs with no store, no credential and no connection.
 */

/** Parse and assert it succeeded — the clause language is proved separately below. */
function clause(expr: string): QueryClause {
  const parsed = parseQueryClause(expr);
  assert.ok(!isClauseError(parsed), `expected \`${expr}\` to parse: ${JSON.stringify(parsed)}`);
  return parsed;
}

// ---------------------------------------------------------------------------
// The clause language
// ---------------------------------------------------------------------------

test("each operator parses to its own shape", () => {
  assert.deepEqual(clause("lifecycle=closed"), { path: "lifecycle", op: "eq", value: "closed" });
  assert.deepEqual(clause("lifecycle!=closed"), { path: "lifecycle", op: "ne", value: "closed" });
  assert.deepEqual(clause("title~drift"), { path: "title", op: "contains", value: "drift" });
  assert.deepEqual(clause("anchor?"), { path: "anchor", op: "present", value: "" });
  assert.deepEqual(clause("anchor!?"), { path: "anchor", op: "absent", value: "" });
});

test("`!=` is never mis-split as `=` — longest operator wins", () => {
  const parsed = clause("status!=accepted");
  assert.equal(parsed.op, "ne");
  assert.equal(parsed.value, "accepted");
});

test("a dotted path survives parsing, and a value may contain the operator character", () => {
  assert.deepEqual(clause("outcome.pr=1234"), { path: "outcome.pr", op: "eq", value: "1234" });
  // A `=` inside the VALUE must not re-split: only the first operator separates.
  assert.deepEqual(clause("body~a=b"), { path: "body", op: "contains", value: "a=b" });
});

test("a malformed clause returns a REASON rather than throwing or matching everything", () => {
  for (const bad of ["", "   ", "novalue", "=orphan", "~orphan"]) {
    const parsed = parseQueryClause(bad);
    assert.ok(isClauseError(parsed), `\`${bad}\` should be refused`);
    assert.ok(parsed.reason.length > 0);
  }
});

// ---------------------------------------------------------------------------
// Path reading
// ---------------------------------------------------------------------------

test("readPath walks nested objects", () => {
  assert.deepEqual(readPath({ outcome: { pr: 1234 } }, "outcome.pr"), [1234]);
  assert.deepEqual(readPath({ outcome: { pr: 1234 } }, "outcome.missing"), []);
  assert.deepEqual(readPath({}, "a.b.c"), []);
});

test("readPath traverses arrays ELEMENT-WISE, so a predicate over a list means `any member`", () => {
  const doc = { cites: [{ id: "story:cli" }, { id: "story:library" }] };
  assert.deepEqual(readPath(doc, "cites.id"), ["story:cli", "story:library"]);
});

test("a terminal array flattens, so `field=value` matches any element", () => {
  assert.deepEqual(readPath({ tags: ["a", "b"] }, "tags"), ["a", "b"]);
  assert.ok(matchesClause({ tags: ["a", "b"] }, clause("tags=b")));
});

test("readPath survives nulls and non-objects without throwing", () => {
  assert.deepEqual(readPath({ a: null }, "a.b"), []);
  assert.deepEqual(readPath({ a: "scalar" }, "a.b"), []);
  assert.deepEqual(readPath(null, "a"), []);
});

// ---------------------------------------------------------------------------
// Evaluation
// ---------------------------------------------------------------------------

test("eq is exact and case-sensitive; contains is substring and case-INsensitive", () => {
  const doc = { title: "Arc drill-down makes planned work Reviewable" };
  assert.ok(matchesClause(doc, clause("title~reviewable")), "contains ignores case");
  assert.ok(!matchesClause(doc, clause("title=arc drill-down")), "eq is exact");
  assert.ok(matchesClause(doc, clause("title=Arc drill-down makes planned work Reviewable")));
});

test("a MISSING field counts as `!=` — the clause must not silently drop fieldless rows", () => {
  // The measured trap this guards: `--where lifecycle!=closed` over a kind where some rows carry no
  // `lifecycle` at all. Treating absent as "not matching the negation" would hide exactly the rows
  // the caller is hunting for.
  assert.ok(matchesClause({ id: "x" }, clause("lifecycle!=closed")));
  assert.ok(!matchesClause({ lifecycle: "closed" }, clause("lifecycle!=closed")));
  assert.ok(matchesClause({ lifecycle: "active" }, clause("lifecycle!=closed")));
});

test("present/absent read EMPTINESS, not mere key existence", () => {
  assert.ok(matchesClause({ anchor: { sha: "abc" } }, clause("anchor?")));
  assert.ok(!matchesClause({ anchor: "" }, clause("anchor?")), "empty string is not present");
  assert.ok(!matchesClause({ anchor: [] }, clause("anchor?")), "empty array is not present");
  assert.ok(!matchesClause({}, clause("anchor?")));

  assert.ok(matchesClause({}, clause("anchor!?")));
  assert.ok(matchesClause({ anchor: null }, clause("anchor!?")));
  assert.ok(!matchesClause({ anchor: { sha: "abc" } }, clause("anchor!?")));
});

test("numbers and booleans compare by their rendered form, so `--where pr=1234` works", () => {
  assert.ok(matchesClause({ outcome: { pr: 1234 } }, clause("outcome.pr=1234")));
  assert.ok(matchesClause({ done: true }, clause("done=true")));
});

test("renderValue never throws on an object — a predicate over structure degrades to JSON", () => {
  assert.equal(renderValue({ a: 1 }), '{"a":1}');
  assert.equal(renderValue(null), "");
  assert.equal(renderValue(undefined), "");
});

test("clauses AND together", () => {
  const doc = { lifecycle: "active", kind: "arc", title: "Codex factory parity" };
  assert.ok(matchesAll(doc, [clause("lifecycle=active"), clause("title~codex")]));
  assert.ok(!matchesAll(doc, [clause("lifecycle=active"), clause("title~pixellab")]));
  assert.ok(matchesAll(doc, []), "no clauses matches everything — `--kind` alone is a valid query");
});
