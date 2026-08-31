import { test } from "node:test";
import assert from "node:assert/strict";

import {
  edgeFreeReasonFor,
  evaluateCorpusLinkage,
  linkageNodeId,
  resolvePointer,
  carriesUnwalkedPointer,
  WALKED_POINTER_FIELDS,
  type LinkageSource,
} from "./corpus-linkage.js";

/** A stored row, with the two timestamps every case here is indifferent to. */
function row(id: string, kind: string, doc: Record<string, unknown>): LinkageSource {
  return { id, kind, doc, createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-02T00:00:00.000Z" };
}

test("linkageNodeId collapses a decision ROW onto its decision node, and nothing else", () => {
  assert.equal(linkageNodeId("adr-0403"), "decision:0403");
  assert.equal(linkageNodeId("adr-0001"), "decision:0001");
  // Not four digits, so not a decision — `adr-health-notes` is a legal artifact id.
  assert.equal(linkageNodeId("adr-health-notes"), "adr-health-notes");
  assert.equal(linkageNodeId("merge-ceremony"), "merge-ceremony");
});

test("resolvePointer resolves ALL THREE decision spellings onto ONE node", () => {
  const held = new Set(["decision:0403", "merge-ceremony"]);
  for (const pointer of [
    "asset:adr-0403",
    "doc:decisions/0403-decision-log-home.md",
    "doc:docs/decisions/0403-decision-log-home.md",
  ]) {
    assert.deepEqual(
      resolvePointer(pointer, held),
      { sort: "node", nodeId: "decision:0403" },
      `${pointer} must resolve to the one decision node`,
    );
  }
});

test("resolvePointer runs decision resolution BEFORE parseCiteRef", () => {
  // The measured failure this guards: letting `parseCiteRef` claim `asset:adr-NNNN` first turns a
  // decision pointer into an ordinary artifact pointer, so the id `adr-0403` is looked up in the
  // node set and misses — a dangling pointer where there is a live decision.
  const held = new Set(["decision:0403"]);
  assert.deepEqual(resolvePointer("asset:adr-0403", held), { sort: "node", nodeId: "decision:0403" });
  assert.notDeepEqual(resolvePointer("asset:adr-0403", held), { sort: "dangling", pointer: "asset:adr-0403" });
});

test("resolvePointer separates the four non-node outcomes", () => {
  const held = new Set(["merge-ceremony"]);
  assert.deepEqual(resolvePointer("asset:merge-ceremony", held), { sort: "node", nodeId: "merge-ceremony" });
  assert.deepEqual(resolvePointer("story:desktop", held), { sort: "anchor", scheme: "story", id: "desktop" });
  assert.deepEqual(resolvePointer("capability:x", held), { sort: "anchor", scheme: "capability", id: "x" });
  assert.deepEqual(resolvePointer("doc:docs/research/note.md", held), {
    sort: "repo-file",
    pointer: "doc:docs/research/note.md",
  });
  assert.deepEqual(resolvePointer("asset:gone", held), { sort: "dangling", pointer: "asset:gone" });
  assert.deepEqual(resolvePointer("nonsense", held), { sort: "unparseable", pointer: "nonsense" });
});

test("edgeFreeReasonFor puts the STRUCTURAL reasons first", () => {
  // A kind that cannot hold the field is not a kind that failed to author one, so the schema
  // refusal must win even over a row that somehow carries pointers.
  assert.equal(edgeFreeReasonFor("friction", { dependsOn: [] }, []), "schema-refuses-the-field");
  assert.equal(edgeFreeReasonFor("open-question", {}, []), "schema-refuses-the-field");
  // `template` predates the typed kind schema entirely: it has no edge field to leave empty.
  assert.equal(edgeFreeReasonFor("template", {}, []), "outside-the-typed-schema");
});

test("edgeFreeReasonFor tells an unauthored field from one authored empty", () => {
  assert.equal(edgeFreeReasonFor("principle", {}, []), "field-never-authored");
  assert.equal(edgeFreeReasonFor("principle", { dependsOn: [] }, []), "field-authored-empty");
});

test("edgeFreeReasonFor names where the pointers went when there are some", () => {
  assert.equal(
    edgeFreeReasonFor("increment", { cites: ["story:desktop"] }, [
      { sort: "anchor", scheme: "story", id: "desktop" },
    ]),
    "points-outside-the-corpus",
  );
  assert.equal(
    edgeFreeReasonFor("principle", { dependsOn: ["doc:docs/research/x.md"] }, [
      { sort: "repo-file", pointer: "doc:docs/research/x.md" },
    ]),
    "points-outside-the-corpus",
  );
  assert.equal(
    edgeFreeReasonFor("principle", { dependsOn: ["asset:gone"] }, [
      { sort: "dangling", pointer: "asset:gone" },
    ]),
    "pointers-resolve-nowhere",
  );
});

test("the population COLLAPSES the decision tier rather than counting it twice", () => {
  const verdict = evaluateCorpusLinkage([
    row("adr-0403", "adr", { dependsOn: [] }),
    row("adr-0139", "adr", { dependsOn: [] }),
    row("merge-ceremony", "process", { dependsOn: [] }),
  ]);
  assert.equal(verdict.rowsScanned, 3);
  assert.equal(verdict.population, 3, "three rows are three nodes — a decision row IS its node");
  assert.equal(verdict.decisionRows, 2);
  assert.deepEqual(
    verdict.nodes.map((node) => node.nodeId).sort(),
    ["decision:0139", "decision:0403", "merge-ceremony"],
  );
  // The row id survives beside the node id: it is what a CLI read and a trace both name.
  const decision = verdict.nodes.find((node) => node.nodeId === "decision:0403");
  assert.equal(decision?.rowId, "adr-0403");
});

test("an artifact pointing at a decision by `doc:` gives that decision an IN-edge", () => {
  // This is the reading the arc's original ADR figure lacked: 112 decisions have no OUT-edge, but
  // most of them are pointed AT, and only 26 are unlinked in both directions.
  const verdict = evaluateCorpusLinkage([
    row("adr-0403", "adr", {}),
    row("a-principle", "principle", { dependsOn: ["doc:decisions/0403-x.md"] }),
  ]);
  const decision = verdict.nodes.find((node) => node.nodeId === "decision:0403")!;
  const principle = verdict.nodes.find((node) => node.nodeId === "a-principle")!;
  assert.equal(decision.inDegree, 1);
  assert.equal(decision.outDegree, 0);
  assert.equal(decision.edgeFreeReason, null, "pointed at is linked, even with no out-edge");
  assert.equal(principle.outDegree, 1);
  assert.equal(verdict.walkableEdges, 1);
  assert.equal(verdict.unlinked, 0);
});

test("`cites` is walked alongside `dependsOn`, and only its `asset:` half is an edge", () => {
  const verdict = evaluateCorpusLinkage([
    row("inc-1", "increment", { cites: ["story:desktop", "asset:merge-ceremony"] }),
    row("merge-ceremony", "process", {}),
  ]);
  const increment = verdict.nodes.find((node) => node.nodeId === "inc-1")!;
  assert.equal(increment.outDegree, 1, "the asset: half is an edge");
  assert.equal(increment.anchorOut, 1, "the story: half is counted, never walked");
  assert.equal(verdict.anchorPointers, 1);
  assert.equal(increment.edgeFreeReason, null);
});

test("a SELF-pointer never rescues a node from the unlinked population", () => {
  const verdict = evaluateCorpusLinkage([row("lonely", "principle", { dependsOn: ["asset:lonely"] })]);
  const node = verdict.nodes[0]!;
  assert.equal(node.outDegree, 0);
  assert.equal(node.inDegree, 0);
  assert.equal(verdict.unlinked, 1);
  assert.equal(verdict.walkableEdges, 0);
});

test("`supersedes` is counted APART and never rescues a node either", () => {
  // ADR-0403 dec 6 keeps `supersedes` out of the dependency walk. A decision linked only by it is
  // connected in the log's own terms and absent from this graph, and those are different findings.
  const verdict = evaluateCorpusLinkage([
    row("adr-0100", "adr", { supersedes: [] }),
    row("adr-0200", "adr", { supersedes: [100] }),
  ]);
  const old = verdict.nodes.find((node) => node.nodeId === "decision:0100")!;
  const replacement = verdict.nodes.find((node) => node.nodeId === "decision:0200")!;
  assert.equal(replacement.supersedesOut, 1);
  assert.equal(old.supersedesIn, 1);
  assert.equal(old.outDegree + old.inDegree, 0, "supersedes is not a walkable edge");
  assert.equal(verdict.unlinked, 2, "both are unlinked in the dependency graph");
  assert.equal(verdict.walkableEdges, 0);
});

test("duplicate pointers count once, so a repeated edge cannot inflate a degree", () => {
  const verdict = evaluateCorpusLinkage([
    row("a", "principle", { dependsOn: ["asset:b", "asset:b"], cites: ["asset:b"] }),
    row("b", "principle", {}),
  ]);
  assert.equal(verdict.nodes.find((node) => node.nodeId === "a")!.outDegree, 1);
  assert.equal(verdict.nodes.find((node) => node.nodeId === "b")!.inDegree, 1);
  assert.equal(verdict.walkableEdges, 1);
});

test("pointer resolution reports every floor rather than dropping one silently", () => {
  const verdict = evaluateCorpusLinkage([
    row("a", "principle", {
      dependsOn: ["asset:missing", "doc:docs/research/x.md", "doc:decisions/9999-nope.md", "junk"],
      cites: ["story:s"],
    }),
  ]);
  assert.equal(verdict.danglingPointers, 2, "a missing artifact AND a decision nobody holds");
  assert.equal(verdict.repoFilePointers, 1);
  assert.equal(verdict.unparseablePointers, 1);
  assert.equal(verdict.anchorPointers, 1);
});

test("the per-kind roll-up separates ISOLATED from linked-only-off-graph", () => {
  const verdict = evaluateCorpusLinkage([
    // Points at a repo FILE rather than an artifact, so it is unlinked but not isolated.
    row("p1", "principle", { dependsOn: ["doc:docs/research/x.md"] }),
    // Nothing at all.
    row("p2", "principle", {}),
    row("f1", "friction", {}),
  ]);
  const principles = verdict.byKind.find((kindRow) => kindRow.kind === "principle")!;
  assert.equal(principles.total, 2);
  assert.equal(principles.unlinked, 2);
  assert.equal(principles.isolated, 1);
  assert.equal(principles.linkedOnlyOffGraph, 1);
  assert.equal(principles.reasons.get("field-never-authored"), 1, "p2 carries no key at all");
  assert.equal(
    principles.reasons.get("points-outside-the-corpus"),
    1,
    "p1 authored a pointer, at a repo file this graph does not hold",
  );
  const friction = verdict.byKind.find((kindRow) => kindRow.kind === "friction")!;
  assert.equal(friction.reasons.get("schema-refuses-the-field"), 1);
});

test("an untrusted row projects as no edges rather than throwing", () => {
  // This runs over the LIVE corpus, so a row from an older schema must not take the probe down.
  const verdict = evaluateCorpusLinkage([
    row("a", "principle", { dependsOn: "not-an-array" }),
    { id: "b", kind: "principle", doc: null, createdAt: "x", updatedAt: "y" },
    { id: "c", kind: "principle", doc: 42, createdAt: "x", updatedAt: "y" },
    row("d", "adr", { supersedes: ["not-a-number"] }),
  ]);
  assert.equal(verdict.population, 4);
  assert.equal(verdict.unlinked, 4);
  assert.equal(verdict.walkableEdges, 0);
});

test("an empty corpus reports zero MEASURED, never a clean bill of health", () => {
  const verdict = evaluateCorpusLinkage([]);
  assert.equal(verdict.rowsScanned, 0);
  assert.equal(verdict.population, 0);
  assert.equal(verdict.linked, 0);
  assert.equal(verdict.unlinked, 0);
  assert.deepEqual(verdict.byKind, []);
});

test("an array field's NON-STRING and EMPTY entries are dropped, and the rest survive", () => {
  // `stringsOf` runs over untrusted rows, so every branch of its filter is reachable from the live
  // corpus: a null left by an older schema, a number, and the empty string a bad `--set` can write.
  const verdict = evaluateCorpusLinkage([
    row("a", "increment", { cites: ["", "asset:b", 42, null, "asset:c"] }),
    row("b", "principle", {}),
    row("c", "principle", {}),
  ]);
  const source = verdict.nodes.find((node) => node.nodeId === "a")!;
  assert.equal(source.outDegree, 2, "only the two real pointers are edges");
  assert.equal(verdict.unparseablePointers, 0, "an empty string is dropped, never counted a pointer");
  assert.equal(verdict.walkableEdges, 2);
});

test("`supersedes` admits only INTEGERS, so a string or a fraction is dropped", () => {
  const verdict = evaluateCorpusLinkage([
    row("adr-0100", "adr", {}),
    row("adr-0200", "adr", { supersedes: [100, "100", 100.5, null] }),
  ]);
  assert.equal(verdict.nodes.find((node) => node.nodeId === "decision:0200")!.supersedesOut, 1);
  assert.equal(verdict.nodes.find((node) => node.nodeId === "decision:0100")!.supersedesIn, 1);
});

test("`supersedes` naming a decision this corpus does not hold is dropped, not counted", () => {
  const verdict = evaluateCorpusLinkage([row("adr-0200", "adr", { supersedes: [999] })]);
  assert.equal(verdict.nodes[0]!.supersedesOut, 0);
});

test("`references` is counted and is NEVER an edge, NOR an off-graph signal (ADR-0477 D5)", () => {
  // Provenance, not dependency (ADR-0464 D1 retires the surface built on exactly that conflation).
  // The field itself is retired (ADR-0477 D1) and a live row keeps the key only until its next write
  // drains it, so this still REPORTS what it finds — what it no longer does is count toward the
  // isolation sum, which is what kept a cited-but-edge-free node out of `isolated`.
  const verdict = evaluateCorpusLinkage([
    row("a", "principle", { references: ["asset:b", "asset:c", 7] }),
    row("b", "principle", {}),
    row("c", "principle", {}),
  ]);
  const source = verdict.nodes.find((node) => node.nodeId === "a")!;
  assert.equal(source.referenceCount, 2, "the non-string is dropped");
  assert.equal(source.outDegree, 0, "a reference is not a dependency");
  assert.equal(
    verdict.byKind[0]!.isolated,
    3,
    "and it no longer buys the citing node out of `isolated` (ADR-0477 D5)",
  );
  assert.equal(verdict.unlinked, 3);
  assert.equal(verdict.nodes.find((node) => node.nodeId === "b")!.inDegree, 0);
});

test("per-node dangling and repo-file counts are reported beside the corpus-wide totals", () => {
  const verdict = evaluateCorpusLinkage([
    row("a", "principle", { dependsOn: ["asset:gone", "asset:also-gone", "doc:docs/research/x.md"] }),
    row("b", "principle", { dependsOn: ["asset:gone"] }),
  ]);
  const first = verdict.nodes.find((node) => node.nodeId === "a")!;
  assert.equal(first.danglingOut, 2);
  assert.equal(first.repoFileOut, 1);
  assert.equal(verdict.danglingPointers, 3, "corpus-wide, across both rows");
  assert.equal(verdict.repoFilePointers, 1);
  assert.equal(verdict.nodes.find((node) => node.nodeId === "b")!.repoFileOut, 0);
});

test("walkableEdges sums across sources rather than reporting one row's", () => {
  const verdict = evaluateCorpusLinkage([
    row("a", "principle", { dependsOn: ["asset:c"] }),
    row("b", "principle", { dependsOn: ["asset:c"] }),
    row("c", "principle", {}),
  ]);
  assert.equal(verdict.walkableEdges, 2);
  assert.equal(verdict.nodes.find((node) => node.nodeId === "c")!.inDegree, 2);
  assert.equal(verdict.linked, 3);
  assert.equal(verdict.unlinked, 0);
});

test("the per-kind roll-up sorts by unlinked DESCENDING, then by kind", () => {
  const verdict = evaluateCorpusLinkage([
    row("z1", "zebra", {}),
    row("a1", "alpha", {}),
    row("f1", "friction", {}),
    row("f2", "friction", {}),
  ]);
  assert.deepEqual(verdict.byKind.map((kindRow) => kindRow.kind), ["friction", "alpha", "zebra"]);
});

test("a duplicate row id keeps the FIRST, matching evaluateDepthFromWork", () => {
  const verdict = evaluateCorpusLinkage([
    row("a", "principle", { dependsOn: ["asset:b"] }),
    row("a", "principle", { dependsOn: [] }),
    row("b", "principle", {}),
  ]);
  assert.equal(verdict.population, 2);
  assert.equal(verdict.nodes.find((node) => node.nodeId === "a")!.outDegree, 1);
});

test("decisionRows counts the ROWS that collapsed, not the nodes", () => {
  const verdict = evaluateCorpusLinkage([
    row("adr-0001", "adr", {}),
    row("adr-0002", "adr", {}),
    row("not-a-decision", "principle", {}),
  ]);
  assert.equal(verdict.decisionRows, 2);
  assert.equal(verdict.population, 3);
});

test("an unparseable pointer is counted apart from a dangling one", () => {
  const verdict = evaluateCorpusLinkage([
    row("a", "principle", { dependsOn: ["nonsense", "node:x", "asset:gone"] }),
  ]);
  assert.equal(verdict.unparseablePointers, 2);
  assert.equal(verdict.danglingPointers, 1);
  assert.equal(verdict.nodes[0]!.edgeFreeReason, "pointers-resolve-nowhere");
});

test("edgeFreeReasonFor with a RESOLVED pointer is authored-empty, not resolve-nowhere", () => {
  // The `dangling` and `anchor` probes are `.some()` over the outward list, so a list holding ONLY
  // resolved nodes is the case that tells a working predicate from one stuck on true.
  assert.equal(
    edgeFreeReasonFor("principle", { dependsOn: ["asset:x"] }, [{ sort: "node", nodeId: "x" }]),
    "field-authored-empty",
  );
  assert.equal(
    edgeFreeReasonFor("principle", {}, [{ sort: "node", nodeId: "x" }]),
    "field-never-authored",
  );
});

test("a decision superseding ITSELF records nothing", () => {
  const verdict = evaluateCorpusLinkage([row("adr-0100", "adr", { supersedes: [100] })]);
  assert.equal(verdict.nodes[0]!.supersedesOut, 0);
  assert.equal(verdict.nodes[0]!.supersedesIn, 0);
});

test("`supersedes` given a STRING that would pad into a real id still records nothing", () => {
  // `String(x).padStart(4, "0")` turns "200" into `decision:0200`, so a filter that admitted strings
  // would forge a REAL edge rather than a harmless one — which is why the integer test is not enough.
  const verdict = evaluateCorpusLinkage([
    row("adr-0100", "adr", {}),
    row("adr-0200", "adr", {}),
    row("adr-0300", "adr", { supersedes: [100, "200"] }),
  ]);
  assert.equal(verdict.nodes.find((node) => node.nodeId === "decision:0300")!.supersedesOut, 1);
  assert.equal(verdict.nodes.find((node) => node.nodeId === "decision:0200")!.supersedesIn, 0);
  assert.equal(verdict.nodes.find((node) => node.nodeId === "decision:0100")!.supersedesIn, 1);
});

test("anchorOut counts ONLY the anchors, not every pointer beside them", () => {
  const verdict = evaluateCorpusLinkage([
    row("a", "increment", { cites: ["story:s"], dependsOn: ["asset:gone", "doc:docs/research/x.md"] }),
  ]);
  assert.equal(verdict.nodes[0]!.anchorOut, 1);
  assert.equal(verdict.nodes[0]!.danglingOut, 1);
  assert.equal(verdict.nodes[0]!.repoFileOut, 1);
});

test("the per-kind roll-up counts only the UNLINKED, with a linked sibling present", () => {
  const verdict = evaluateCorpusLinkage([
    row("p1", "principle", { dependsOn: ["asset:p2"] }),
    row("p2", "principle", {}),
    row("p3", "principle", {}),
  ]);
  const principles = verdict.byKind.find((kindRow) => kindRow.kind === "principle")!;
  assert.equal(principles.total, 3);
  assert.equal(principles.unlinked, 1, "p1 and p2 are linked to each other");
  assert.equal(principles.isolated, 1);
});

test("EACH off-graph signal on its own is enough to be linked-only-off-graph", () => {
  // The isolation test sums four counters (five until ADR-0477 D5 dropped the citation term). Each
  // case leaves exactly ONE of them non-zero, so a sum that dropped or negated any single term puts
  // that case in the wrong bucket.
  const cases: readonly { readonly label: string; readonly rows: readonly LinkageSource[] }[] = [
    { label: "anchorOut", rows: [row("a", "increment", { cites: ["story:s"] })] },
    { label: "repoFileOut", rows: [row("a", "principle", { dependsOn: ["doc:docs/research/x.md"] })] },
  ];
  for (const { label, rows } of cases) {
    const verdict = evaluateCorpusLinkage(rows);
    const offGraph = verdict.byKind.reduce((sum, kindRow) => sum + kindRow.linkedOnlyOffGraph, 0);
    const isolated = verdict.byKind.reduce((sum, kindRow) => sum + kindRow.isolated, 0);
    assert.equal(offGraph, 1, `${label} alone must put its node in the off-graph bucket`);
    assert.equal(isolated, 0, `${label} alone must leave the isolated bucket empty`);
  }
});

test("BOTH ends of a supersedes edge are off-graph, never isolated", () => {
  const verdict = evaluateCorpusLinkage([
    row("adr-0100", "adr", {}),
    row("adr-0200", "adr", { supersedes: [100] }),
  ]);
  const decisions = verdict.byKind.find((kindRow) => kindRow.kind === "adr")!;
  assert.equal(decisions.linkedOnlyOffGraph, 2, "the superseder by its out, the superseded by its in");
  assert.equal(decisions.isolated, 0);
});

test("isolated and off-graph are counted separately, with UNEQUAL populations", () => {
  // Deliberately 2 vs 1: an equal split cannot tell a correct classifier from one that swapped the
  // two branches.
  const verdict = evaluateCorpusLinkage([
    row("p1", "principle", {}),
    row("p2", "principle", {}),
    row("p3", "principle", { supersedes: [100] }),
    row("adr-0100", "adr", {}),
  ]);
  const principles = verdict.byKind.find((kindRow) => kindRow.kind === "principle")!;
  assert.equal(principles.isolated, 2);
  assert.equal(principles.linkedOnlyOffGraph, 1);
});

test("linked and unlinked partition the population, and neither is the other", () => {
  const verdict = evaluateCorpusLinkage([
    row("a", "principle", { dependsOn: ["asset:b"] }),
    row("b", "principle", {}),
    row("c", "principle", {}),
  ]);
  assert.equal(verdict.linked, 2);
  assert.equal(verdict.unlinked, 1);
  assert.equal(verdict.linked + verdict.unlinked, verdict.population);
});

test("a row whose whole document is null or a scalar still yields a usable node", () => {
  const verdict = evaluateCorpusLinkage([
    { id: "n", kind: "principle", doc: null, createdAt: "x", updatedAt: "y" },
    { id: "s", kind: "principle", doc: "a string", createdAt: "x", updatedAt: "y" },
    { id: "z", kind: "principle", doc: 0, createdAt: "x", updatedAt: "y" },
  ]);
  assert.equal(verdict.population, 3);
  for (const node of verdict.nodes) {
    assert.equal(node.referenceCount, 0);
    assert.equal(node.anchorOut, 0);
    assert.equal(node.edgeFreeReason, "field-never-authored");
  }
});

test("the byKind sort puts the larger unlinked count first even when it was added LAST", () => {
  const verdict = evaluateCorpusLinkage([
    row("z1", "zebra", {}),
    row("a1", "alpha", {}),
    row("m1", "middle", {}),
    row("m2", "middle", {}),
  ]);
  assert.deepEqual(verdict.byKind.map((kindRow) => kindRow.kind), ["middle", "alpha", "zebra"]);
});

test("SIZE beats the alphabet in the per-kind roll-up too", () => {
  // The large kind is named to sort LAST alphabetically, so a comparator that lost its primary term
  // and fell back to the kind name alone reverses this.
  const verdict = evaluateCorpusLinkage([
    row("a1", "alpha", {}),
    row("z1", "zebra", {}),
    row("z2", "zebra", {}),
  ]);
  assert.deepEqual(verdict.byKind.map((kindRow) => kindRow.kind), ["zebra", "alpha"]);
});

test("EACH off-graph term can carry the sum on its own, against a cancelling partner", () => {
  // The isolation test is a four-term sum of non-negative counts, so flipping one `+` to `-` is
  // invisible unless that term EQUALS the rest — which is what each case below arranges. Without
  // this, a dropped term still yields a non-zero total and the node lands in the same bucket.
  const anchorAndRepoFile = evaluateCorpusLinkage([
    row("a", "increment", { cites: ["story:s"], dependsOn: ["doc:docs/research/x.md"] }),
  ]).byKind[0]!;
  assert.equal(anchorAndRepoFile.linkedOnlyOffGraph, 1);
  assert.equal(anchorAndRepoFile.isolated, 0);

  // A decision that supersedes one AND is superseded by another: out and in are both 1.
  const bothEnds = evaluateCorpusLinkage([
    row("adr-0100", "adr", {}),
    row("adr-0200", "adr", { supersedes: [100] }),
    row("adr-0300", "adr", { supersedes: [200] }),
  ]).nodes.find((node) => node.nodeId === "decision:0200")!;
  assert.equal(bothEnds.supersedesOut, 1);
  assert.equal(bothEnds.supersedesIn, 1);
  const decisions = evaluateCorpusLinkage([
    row("adr-0100", "adr", {}),
    row("adr-0200", "adr", { supersedes: [100] }),
    row("adr-0300", "adr", { supersedes: [200] }),
  ]).byKind.find((kindRow) => kindRow.kind === "adr")!;
  assert.equal(decisions.linkedOnlyOffGraph, 3, "all three ends of the chain are off-graph");
  assert.equal(decisions.isolated, 0);

  // A decision carrying an anchor AND a supersedes-in: the two cancel if either term flips sign.
  const anchorAndSuperseded = evaluateCorpusLinkage([
    row("adr-0100", "adr", { cites: ["story:s"] }),
    row("adr-0200", "adr", { supersedes: [100] }),
  ]).nodes.find((node) => node.nodeId === "decision:0100")!;
  assert.equal(anchorAndSuperseded.anchorOut, 1);
  assert.equal(anchorAndSuperseded.supersedesIn, 1);
});


// ── THE FIELD SCOPE: which fields produced the figure, and what the walk cannot see ──────────
//
// `connect-the-fifty-eight-and-fix-the-denominator`. The headline sentence "70% of the library has
// no recorded connection to anything else: nothing points at it and it points at nothing" is FALSE
// AS WRITTEN, and measurably so: this instrument walks `dependsOn` plus the `asset:` half of
// `cites` and NOTHING ELSE, while every increment carries `arcRef`, 88 friction items are named by
// some increment's `frictionRefs`, and 222 of 477 decisions carry `arcRef` — the field `arc show`
// itself derives an arc's decision list from. A node reachable only by one of those reads as
// "connected to nothing" here, which is the instrument's scope talking, not the corpus.
//
// `a-corpus-count-inherits-one-querys-field-scope` is the general shape and its rule is the reason
// the tally below is DISCOVERED rather than declared: "never assume which fields can hold a
// pointer — `dischargedBy` carried two, and nobody would have listed it."

test("WALKED_POINTER_FIELDS states the walk's scope, and it is exactly two fields", () => {
  // The one declared list in this module, and it is declared because it IS the walk's definition.
  // Everything else about the pointer surface is discovered from the rows.
  assert.deepEqual([...WALKED_POINTER_FIELDS], ["cites", "dependsOn"]);
});

test("a node whose ONLY pointer is `arcRef` is UNLINKED and yet points at something real", () => {
  const verdict = evaluateCorpusLinkage([
    row("some-arc", "arc", {}),
    row("inc-01", "increment", { arcRef: "asset:some-arc" }),
  ]);
  const inc = verdict.nodes.find((n) => n.nodeId === "inc-01");
  assert.ok(inc !== undefined);
  // UNLINKED: `arcRef` is not a walked field, so it buys no degree — this is the true half.
  assert.equal(inc.outDegree, 0);
  assert.equal(inc.inDegree, 0);
  assert.notEqual(inc.edgeFreeReason, null);
  // AND YET: it names a row this corpus holds. That is the half the bare headline erases.
  assert.deepEqual([...inc.unwalkedPointerFields], ["arcRef"]);
  assert.equal(carriesUnwalkedPointer(inc), true);
});

test("unlinkedWithTypedPointer separates `no edge` from `connected to nothing`", () => {
  const verdict = evaluateCorpusLinkage([
    row("some-arc", "arc", {}),
    row("inc-01", "increment", { arcRef: "asset:some-arc" }),
    row("alone", "principle", {}),
  ]);
  // Three unlinked nodes — the arc itself is pointed at by nothing WALKED, so it is unlinked too.
  assert.equal(verdict.unlinked, 3);
  // ...but only ONE of them carries a typed pointer at something real.
  assert.equal(verdict.unlinkedWithTypedPointer, 1);
  const alone = verdict.nodes.find((n) => n.nodeId === "alone");
  assert.ok(alone !== undefined);
  assert.equal(carriesUnwalkedPointer(alone), false);
});

test("the field tally reports walked and unwalked fields APART, never as one total", () => {
  const verdict = evaluateCorpusLinkage([
    row("target", "principle", {}),
    row("f-1", "friction", {}),
    row("f-2", "friction", {}),
    row("some-arc", "arc", {}),
    row("inc-01", "increment", { arcRef: "asset:some-arc", frictionRefs: ["asset:f-1", "asset:f-2"] }),
    row("guide", "process", { dependsOn: ["asset:target"] }),
  ]);
  const byField = new Map(verdict.pointerFields.map((f) => [f.field, f]));

  // WALKED — what makes a node "linked".
  assert.deepEqual(byField.get("dependsOn"), {
    field: "dependsOn",
    walked: true,
    pointers: 1,
    nodes: 1,
  });
  // UNWALKED — real, typed, and invisible to every figure above.
  assert.deepEqual(byField.get("arcRef"), { field: "arcRef", walked: false, pointers: 1, nodes: 1 });
  assert.deepEqual(byField.get("frictionRefs"), {
    field: "frictionRefs",
    walked: false,
    pointers: 2,
    nodes: 1,
  });
});

test("the field tally counts POINTERS and NODES apart — one node may carry many", () => {
  const verdict = evaluateCorpusLinkage([
    row("f-1", "friction", {}),
    row("f-2", "friction", {}),
    row("f-3", "friction", {}),
    row("inc-01", "increment", { frictionRefs: ["asset:f-1", "asset:f-2", "asset:f-3"] }),
    row("inc-02", "increment", { frictionRefs: ["asset:f-1"] }),
  ]);
  const refs = verdict.pointerFields.find((f) => f.field === "frictionRefs");
  // Four pointers across two nodes. Summing them into one figure is what hides that one increment
  // carries three-quarters of the relationship.
  assert.deepEqual(refs, { field: "frictionRefs", walked: false, pointers: 4, nodes: 2 });
});

test("an unwalked field naming NOTHING HELD records nothing — a dangling value is not a pointer", () => {
  const verdict = evaluateCorpusLinkage([row("inc-01", "increment", { arcRef: "asset:no-such-arc" })]);
  assert.equal(verdict.pointerFields.length, 0);
  assert.equal(verdict.unlinkedWithTypedPointer, 0);
  const inc = verdict.nodes[0];
  assert.ok(inc !== undefined);
  assert.deepEqual([...inc.unwalkedPointerFields], []);
});

test("a SELF-pointer in an unwalked field records nothing, exactly as in a walked one", () => {
  // The same rule the walk already applies: pointing at yourself is not a connection to anything.
  const verdict = evaluateCorpusLinkage([row("inc-01", "increment", { arcRef: "asset:inc-01" })]);
  assert.equal(verdict.pointerFields.length, 0);
  assert.equal(verdict.unlinkedWithTypedPointer, 0);
});

test("an unwalked pointer resolves a DECISION row through the same collapse the walk uses", () => {
  // `arcRef` on a decision names an arc; but a field naming `adr-NNNN` must land on the decision
  // NODE, or the two halves of this instrument disagree about the same string.
  const verdict = evaluateCorpusLinkage([
    row("adr-0449", "adr", {}),
    row("inc-01", "increment", { supersededByDecision: "asset:adr-0449" }),
  ]);
  const refs = verdict.pointerFields.find((f) => f.field === "supersededByDecision");
  assert.deepEqual(refs, { field: "supersededByDecision", walked: false, pointers: 1, nodes: 1 });
});

test("a `story:` cite counts as pointing outside the corpus, not as connected to nothing", () => {
  const verdict = evaluateCorpusLinkage([row("crit", "uat-criterion", { cites: ["story:desktop"] })]);
  const node = verdict.nodes[0];
  assert.ok(node !== undefined);
  assert.equal(node.anchorOut, 1);
  assert.notEqual(node.edgeFreeReason, null);
  // The anchor is the `story:`/`capability:` half of `cites` — unwalked, and a real destination.
  assert.equal(carriesUnwalkedPointer(node), true);
  assert.equal(verdict.unlinkedWithTypedPointer, 1);
});

test("the field tally sorts by POINTERS descending, ties by field name", () => {
  // ⚠ THE INSERTION ORDER IS DELIBERATELY NOT THE SORTED ORDER. Authored the other way round first,
  // and every one of the four sort mutants survived — `Object.entries` had already produced the
  // expected sequence, so removing the sort, blanking the comparator or flipping its subtraction
  // all left the assertion true. A sort assertion whose fixture arrives pre-sorted tests nothing.
  const verdict = evaluateCorpusLinkage([
    row("a", "principle", {}),
    row("b", "principle", {}),
    row("c", "principle", {}),
    row("src", "process", {
      bbb: ["asset:a"],
      zzz: ["asset:a", "asset:b", "asset:c"],
      aaa: ["asset:a"],
    }),
  ]);
  assert.deepEqual(
    verdict.pointerFields.map((f) => f.field),
    ["zzz", "aaa", "bbb"],
  );
});

test("a node's unwalkedPointerFields are SORTED, not left in authoring order", () => {
  // Same trap one level down: `zRef` is authored first, so an unsorted list would read
  // `["zRef", "aRef"]` and a fixture authored alphabetically could never tell.
  const verdict = evaluateCorpusLinkage([
    row("x", "principle", {}),
    row("y", "principle", {}),
    row("src", "increment", { zRef: "asset:x", aRef: "asset:y" }),
  ]);
  const src = verdict.nodes.find((n) => n.nodeId === "src");
  assert.ok(src !== undefined);
  assert.deepEqual([...src.unwalkedPointerFields], ["aRef", "zRef"]);
});

test("unlinkedWithTypedPointer counts only the UNLINKED — a linked node with an arcRef is excluded", () => {
  // The term exists to qualify `unlinked`, so a LINKED node carrying an unwalked pointer must not
  // enter it: counting one would make the refutation larger than the population it refutes.
  const verdict = evaluateCorpusLinkage([
    row("target", "principle", {}),
    row("some-arc", "arc", {}),
    row("src", "increment", { dependsOn: ["asset:target"], arcRef: "asset:some-arc" }),
  ]);
  const src = verdict.nodes.find((n) => n.nodeId === "src");
  assert.ok(src !== undefined);
  assert.equal(src.edgeFreeReason, null, "src is LINKED — it carries a walked dependsOn edge");
  assert.equal(carriesUnwalkedPointer(src), true, "...and it also carries an unwalked arcRef");
  // `some-arc` and `target` are the unlinked ones, and neither points anywhere.
  assert.equal(verdict.unlinkedWithTypedPointer, 0);
});

test("a walked field never appears in a node's unwalkedPointerFields", () => {
  const verdict = evaluateCorpusLinkage([
    row("target", "principle", {}),
    row("src", "process", { dependsOn: ["asset:target"], cites: ["asset:target"] }),
  ]);
  const src = verdict.nodes.find((n) => n.nodeId === "src");
  assert.ok(src !== undefined);
  assert.deepEqual([...src.unwalkedPointerFields], []);
  assert.equal(carriesUnwalkedPointer(src), false);
});

test("a BARE row name is NOT a pointer — the `category` false positive, pinned", () => {
  // MEASURED, not assumed (live corpus, 2,776 rows, 2026-08-31): accepting a bare row name made
  // `category` the single biggest "pointer field" in the corpus at 2,448 across 2,448 nodes, and
  // every one was an artifact of rendering — `renderStoredDoc` stamps the row's KIND into
  // `category`, and `increment` is itself a definition row. `unlinkedWithTypedPointer` read 1,899
  // of 1,948 on the strength of it: a refutation manufactured out of the renderer.
  const verdict = evaluateCorpusLinkage([
    row("increment", "definition", {}),
    row("inc-01", "increment", { category: "increment" }),
  ]);
  assert.deepEqual(verdict.pointerFields, []);
  assert.equal(verdict.unlinkedWithTypedPointer, 0);
});

test("a scheme-carrying value IS a pointer in ANY field, named or not", () => {
  // The rule is the SCHEME, never a list of blessed field names — `dischargedBy` carried two
  // pointers and nobody would have listed it (`a-corpus-count-inherits-one-querys-field-scope`).
  const verdict = evaluateCorpusLinkage([
    row("decision-note", "principle", {}),
    row("src", "process", { dischargedBy: ["doc:docs/x.md", "asset:decision-note"] }),
  ]);
  assert.deepEqual(verdict.pointerFields, [
    { field: "dischargedBy", walked: false, pointers: 1, nodes: 1 },
  ]);
});
