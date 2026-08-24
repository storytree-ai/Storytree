import assert from "node:assert/strict";
import test from "node:test";

import { decisionSupportResolver, type SupportOnlyDecision } from "./decision-support-seam.js";

test("decision-support-seam-never-reads-supersedes: the parameter type performs the exclusion", () => {
  // The whole point of the seam (ADR-0403 dec 6, restated by ADR-0431 D6b): a caller hands over a
  // WHOLE record, `supersedes` and all, and the callee cannot see it. Passing one here is what makes
  // this a test rather than a restatement — a resolver that read the field would return 99.
  const rows = [
    { number: 20, dependsOn: ["asset:adr-0010"], supersedes: [99] },
    { number: 10, dependsOn: [] },
  ];
  const resolver = decisionSupportResolver(rows);
  assert.deepEqual([...resolver.dependsOnOf(20)], ["asset:adr-0010"]);
  assert.deepEqual([...resolver.dependsOnOf(10)], []);
  // 99 is not reachable from anything the seam exposes, and there is no verb that could return it.
  assert.deepEqual([...resolver.decisions].sort((a, b) => a - b), [10, 20]);
});

test("decision-support-seam-has-no-edge-type-parameter: one verb, naming its one edge", () => {
  // ADR-0431 D1 removed the second support edge, and this is the shape assertion that says it was
  // removed the RIGHT way. `amendsOf` is gone rather than collapsed into a `resolve(edge)` flag —
  // the moment such a flag existed, `supersedes` would be one string literal away from walkable.
  const resolver = decisionSupportResolver([{ number: 1, dependsOn: [] }]);
  const verbs = Object.keys(resolver).filter((k) => typeof (resolver as never)[k] === "function");
  assert.deepEqual(verbs, ["dependsOnOf"], "exactly one verb, and it names its own edge");
  assert.equal(resolver.dependsOnOf.length, 1, "it takes a decision number and nothing else");
});

test("decision-support-seam-returns-pointers-exactly-as-stored, never parsed here", () => {
  // The seam reports WHERE edges came from and never learns what they mean. All three live
  // spellings pass through untouched; resolving which names a decision is the WALK's job, through
  // the one parser in `decision-pointer.ts`.
  const stored = ["asset:adr-0010", "asset:merge-ceremony", "doc:docs/research/x.md"];
  const resolver = decisionSupportResolver([{ number: 7, dependsOn: stored }]);
  assert.deepEqual([...resolver.dependsOnOf(7)], stored);
});

test("decision-support-seam-separates-a-blind-reader-from-an-unwired-log (ADR-0419 D3)", () => {
  // PRESENCE, not non-emptiness. A row that authored no edge but CAN carry the field is a sighted
  // reader reporting an empty answer; a row with no field at all is a reader that cannot see. Both
  // answer `dependsOnOf` with `[]`, and only this denominator tells them apart — which is the whole
  // reason the field is optional rather than defaulted.
  const sighted = decisionSupportResolver([
    { number: 1, dependsOn: [] },
    { number: 2, dependsOn: ["asset:adr-0001"] },
  ]);
  assert.equal(sighted.decisionsCarryingDependsOn, 2);

  const blind: SupportOnlyDecision[] = [{ number: 1 }, { number: 2 }];
  const unsighted = decisionSupportResolver(blind);
  assert.equal(unsighted.decisionsCarryingDependsOn, 0);
  assert.deepEqual([...unsighted.dependsOnOf(1)], [], "and it still answers, rather than throwing");
});

test("decision-support-seam-reports-its-own-denominator: a thin read can never hide", () => {
  // A resolver that saw nothing must be distinguishable from a decision log that is genuinely
  // shallow — otherwise a walk reports depth 2 over an empty read and looks healthy.
  assert.equal(decisionSupportResolver([]).decisions.length, 0);
  assert.equal(decisionSupportResolver([{ number: 4, dependsOn: [] }]).decisions.length, 1);
});

test("decision-support-seam-is-total: an unheld decision answers empty rather than throwing", () => {
  // The walk resolves pointers authored by a corpus this resolver did not author, so a miss is an
  // ordinary state and never an exception.
  const resolver = decisionSupportResolver([{ number: 1, dependsOn: [] }]);
  assert.deepEqual([...resolver.dependsOnOf(4242)], []);
});

test("decision-support-seam-first-row-wins-WHOLESALE-on-a-duplicate-number", () => {
  // Matching `findDependsOnCycles` and `evaluateDepthFromWork`. WHOLESALE matters: a later row must
  // not contribute its field PRESENCE to an earlier row either, which would be a half-merged
  // decision no author ever wrote.
  const resolver = decisionSupportResolver([
    { number: 5, dependsOn: ["asset:adr-0001"] },
    { number: 5, dependsOn: ["asset:adr-0002", "asset:adr-0003"] },
  ]);
  assert.deepEqual([...resolver.dependsOnOf(5)], ["asset:adr-0001"]);
  assert.equal(resolver.decisionsCarryingDependsOn, 1, "the loser contributes no presence either");
  assert.deepEqual([...resolver.decisions], [5], "and the number appears once");

  // The same rule when the LOSER is the one carrying the field.
  const blindFirst = decisionSupportResolver([{ number: 6 }, { number: 6, dependsOn: ["asset:adr-0001"] }]);
  assert.equal(blindFirst.decisionsCarryingDependsOn, 0);
  assert.deepEqual([...blindFirst.dependsOnOf(6)], []);
});

test("decision-support-seam-copies-its-input: a caller's array cannot mutate the resolver", () => {
  const pointers = ["asset:adr-0001"];
  const resolver = decisionSupportResolver([{ number: 9, dependsOn: pointers }]);
  pointers.push("asset:adr-0002");
  assert.deepEqual([...resolver.dependsOnOf(9)], ["asset:adr-0001"]);
});
