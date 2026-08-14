import test from "node:test";
import assert from "node:assert/strict";

import { findStandsOnCycles, standsOnNodes } from "./knowledge-dag.js";
import {
  KNOWLEDGE_TIERS,
  projectStandsOnFromCitations,
  type CitationSource,
} from "./standson-bootstrap.js";

/**
 * ADR-0223 dec 5's one-time bootstrap, as a pure function over stored rows.
 *
 * Hermetic by construction — literal rows, no store, no credential (ADR-0302 D3). The applier that
 * dials the live corpus is `packages/cli/src/standson-bootstrap.ts`; it decides nothing these tests
 * do not.
 */

function row(id: string, kind: string, references: unknown[], extra?: Record<string, unknown>): CitationSource {
  return { id, doc: { kind, id, references, ...extra } };
}

/** Feed a plan back through the SHIPPED projection the gate uses, so the two cannot disagree. */
function cyclesInPlan(plan: ReturnType<typeof projectStandsOnFromCitations>): string[][] {
  return findStandsOnCycles(
    standsOnNodes(plan.edges.map((e) => ({ id: e.id, doc: { standsOn: [...e.standsOn] } }))),
  );
}

test("library-standson-bootstrap-seeds-only-down-tier-citations: strictly-more-foundational targets seed an edge, nothing else does", () => {
  const plan = projectStandsOnFromCitations([
    // agent (tier 4) -> principle (tier 2): strictly down-tier, seeds.
    // agent -> a doc: ADR (tier 0): always down-tier, seeds.
    // agent -> definition / friction: outside the DAG entirely, seeds nothing.
    row("an-agent", "agent", [
      "asset:a-principle",
      "doc:decisions/0223-the-knowledge-dag.md",
      "asset:a-definition",
      "asset:a-friction",
    ]),
    // principle (tier 2) -> pattern (tier 2): SAME tier. This is the curation tail ADR-0223 dec 5
    // hands to a human; inferring it is the arbitrary-winner problem ADR-0363 D1 refused.
    // principle -> agent (tier 4): UP-tier, a "used by" rather than a dependency.
    row("a-principle", "principle", ["asset:a-pattern", "asset:an-agent"]),
    row("a-pattern", "pattern", []),
    row("a-definition", "definition", []),
    row("a-friction", "friction", []),
  ]);

  assert.deepEqual(plan.edges, [
    { id: "an-agent", standsOn: ["asset:a-principle", "doc:decisions/0223-the-knowledge-dag.md"] },
  ]);
  assert.equal(plan.edgesPlanned, 2);

  // The definition tier is excluded as a TARGET too (ADR-0363 D1), not merely denied the field.
  assert.equal(plan.skipped.targetOutsideDag, 2);
  assert.equal(plan.skipped.sameTier, 1);
  assert.equal(plan.skipped.upTier, 1);
});

test("library-standson-bootstrap-seeds-only-down-tier-citations: a target cited twice seeds one edge", () => {
  const plan = projectStandsOnFromCitations([
    row("an-agent", "agent", ["asset:a-principle", "asset:a-principle"]),
    row("a-principle", "principle", []),
  ]);

  assert.deepEqual(plan.edges, [{ id: "an-agent", standsOn: ["asset:a-principle"] }]);
});

test("library-standson-bootstrap-is-acyclic-by-construction: a deliberately cyclic citation web projects clean", () => {
  // Every one of these citation rings is real in the live corpus's `references` web, which is
  // unconstrained and legitimately cyclic (ADR-0223 dec 2). None may survive into `standsOn`.
  const cyclicWeb: CitationSource[] = [
    // A mutual SAME-TIER pair — the commonest ring in the corpus (57 such pairs were measured).
    row("principle-a", "principle", ["asset:principle-b"]),
    row("principle-b", "principle", ["asset:principle-a"]),
    // A ring spanning EVERY tier: agent(4) -> process(3) -> guardrail(2) -> techstack(1) -> agent(4).
    // Three legs descend and seed; the single ascending leg that closes the ring is what gets
    // dropped, which is precisely how a total order breaks a cycle without choosing a winner.
    row("an-agent", "agent", ["asset:a-process"]),
    row("a-process", "process", ["asset:a-guardrail"]),
    row("a-guardrail", "guardrail", ["asset:a-techstack"]),
    row("a-techstack", "techstack", ["asset:an-agent"]),
    // A self-citation.
    row("self-citer", "pattern", ["asset:self-citer"]),
  ];

  const web = standsOnNodes(
    cyclicWeb.map((r) => ({
      id: r.id,
      doc: { standsOn: (r.doc as { references: unknown[] }).references },
    })),
  );
  // Guard the guard: the INPUT really is cyclic, so a clean output proves the projection and not a
  // vacuously acyclic fixture.
  assert.ok(findStandsOnCycles(web).length > 0, "fixture must contain citation cycles");

  const plan = projectStandsOnFromCitations(cyclicWeb);
  assert.deepEqual(cyclesInPlan(plan), []);

  // ...and it is not clean merely by being empty: the descending legs DID seed.
  assert.equal(plan.edgesPlanned, 3);
  assert.deepEqual(
    plan.edges.map((e) => e.id).sort(),
    ["a-guardrail", "a-process", "an-agent"],
  );
});

test("library-standson-bootstrap-is-acyclic-by-construction: every seeded edge strictly descends the tier order", () => {
  const kinds = [...KNOWLEDGE_TIERS.keys()];
  const docs: CitationSource[] = kinds.map((kind) =>
    // Every artifact cites every other, in both directions — the densest possible web.
    row(`the-${kind}`, kind, kinds.map((other) => `asset:the-${other}`)),
  );

  const plan = projectStandsOnFromCitations(docs);
  assert.deepEqual(cyclesInPlan(plan), []);

  for (const edge of plan.edges) {
    const sourceTier = KNOWLEDGE_TIERS.get(edge.id.slice("the-".length));
    for (const pointer of edge.standsOn) {
      const targetTier = KNOWLEDGE_TIERS.get(pointer.slice("asset:the-".length));
      assert.ok(
        sourceTier !== undefined && targetTier !== undefined && targetTier < sourceTier,
        `${edge.id} -> ${pointer} does not strictly descend`,
      );
    }
  }
});

test("ADR-0365 D1: uat-criterion sits at tier 6 — it seeds DOWN-tier and never at its tier-6 peer `increment`", () => {
  // Tier 6 now holds TWO kinds. The same-tier rule is what stops them seeding at each other, so a
  // reader adding a third kind here can see the invariant that keeps that safe.
  assert.equal(KNOWLEDGE_TIERS.get("uat-criterion"), 6);
  assert.equal(KNOWLEDGE_TIERS.get("increment"), 6);

  const plan = projectStandsOnFromCitations([
    row("a-uat-criterion", "uat-criterion", [
      "asset:a-principle", // tier 2 — strictly down, seeds
      "asset:an-increment", // tier 6 — SAME tier, must not seed
      "asset:a-definition", // outside the DAG entirely (ADR-0363 D1), must not seed
    ]),
    row("a-principle", "principle", []),
    row("an-increment", "increment", []),
    row("a-definition", "definition", []),
  ]);

  assert.deepEqual(plan.edges.map((e) => e.id), ["a-uat-criterion"]);
  assert.deepEqual(plan.edges[0]?.standsOn, ["asset:a-principle"]);
  assert.equal(
    plan.skipped.sameTier,
    1,
    "the increment citation is counted as the curation tail, not seeded",
  );
  assert.equal(plan.skipped.targetOutsideDag, 1, "the definition citation counts as outside the DAG");
});

test("ADR-0365 D2: an increment's arc containment is NOT a standsOn edge — only its down-tier citations seed", () => {
  // The ~689-edge question. Containment lives on `arcRef`, which the seed must never read as a
  // citation: it is a provenance overlay, not a dependency (ADR-0223 dec 4, adjudicated by 0365 D2).
  const plan = projectStandsOnFromCitations([
    { id: "an-increment", doc: { kind: "increment", arcRef: "asset:an-arc", references: ["asset:a-process"] } },
    row("an-arc", "arc", []),
    row("a-process", "process", []),
  ]);

  assert.deepEqual(plan.edges.map((e) => e.id), ["an-increment"]);
  assert.deepEqual(
    plan.edges[0]?.standsOn,
    ["asset:a-process"],
    "the arc it belongs to is absent — containment never becomes a dependency edge",
  );
});

test("library-standson-bootstrap-never-overwrites-authored-edges: an authored edge survives an EXTENDING pass, first and in order", () => {
  // ADR-0373 replaced skip-whole with extend. The contract this test names is unchanged and is the
  // one that matters — nothing authored is removed, reordered, or replaced — but the seed now APPENDS
  // to a curated artifact instead of walking past it. It had to: every agent was already seeded from
  // its envelope `references` by the first pass, so skip-whole would have read the new refList fields
  // and written none of them.
  const plan = projectStandsOnFromCitations([
    row("curated-agent", "agent", ["asset:a-principle"], { standsOn: ["asset:a-guardrail"] }),
    // An EMPTY array is not authorship — it records no edge, so this one is seeded from empty.
    row("empty-agent", "agent", ["asset:a-principle"], { standsOn: [] }),
    row("a-principle", "principle", []),
    row("a-guardrail", "guardrail", []),
  ]);

  assert.deepEqual(plan.edges, [
    // Authored FIRST, in authored order, then the new edge — the applier patches the whole field, so
    // the emitted array is the artifact's full intended set rather than a delta.
    { id: "curated-agent", standsOn: ["asset:a-guardrail", "asset:a-principle"] },
    { id: "empty-agent", standsOn: ["asset:a-principle"] },
  ]);
  assert.equal(plan.extended, 1, "one artifact was extended rather than seeded from empty");
  assert.equal(plan.edgesPlanned, 2, "counts NEW edges only — the authored one is not re-counted");
  assert.equal(plan.skipped.alreadyAuthored, 0, "nothing was a no-op here");
});

test("library-standson-bootstrap-never-overwrites-authored-edges: an artifact with nothing to add is a NO-OP, not an extension", () => {
  const plan = projectStandsOnFromCitations([
    // Already carries exactly the edge its citation would seed: the pass must emit nothing at all,
    // or every re-run would rewrite the whole corpus and churn `updatedAt` across it.
    row("settled-agent", "agent", ["asset:a-principle"], { standsOn: ["asset:a-principle"] }),
    row("a-principle", "principle", []),
  ]);

  assert.deepEqual(plan.edges, []);
  assert.equal(plan.extended, 0);
  assert.equal(plan.skipped.alreadyAuthored, 1);
});

test("ADR-0373: an agent's injected refList fields seed edges, not just its envelope references", () => {
  // The decision this test carries: `context` / `rules` / `antiPatterns` are STRONGER than a
  // see-also citation, because the agent renderer injects the cited unit's text into the system
  // prompt — change the target and the agent changes with no edit to the agent. The seed was
  // recording the weakest relation in the corpus and ignoring the strongest.
  const plan = projectStandsOnFromCitations([
    row("an-agent", "agent", ["asset:cited-principle"], {
      context: ["asset:a-process", "asset:a-definition"],
      rules: ["asset:a-principle", "asset:a-pattern"],
      antiPatterns: ["asset:a-guardrail"],
    }),
    row("cited-principle", "principle", []),
    row("a-principle", "principle", []),
    row("a-pattern", "pattern", []),
    row("a-guardrail", "guardrail", []),
    row("a-process", "process", []),
    row("a-definition", "definition", []),
  ]);

  assert.deepEqual(plan.edges, [
    {
      id: "an-agent",
      standsOn: [
        "asset:cited-principle", // envelope references first
        "asset:a-process", // context
        "asset:a-principle", // rules
        "asset:a-pattern",
        "asset:a-guardrail", // antiPatterns — injected exactly like rules, so it seeds too
      ],
    },
  ]);
  // The definition in `context` is still excluded (ADR-0363 D1): admitting a new SOURCE field never
  // admits a new TARGET kind.
  assert.equal(plan.skipped.targetOutsideDag, 1);
});

test("ADR-0373: a uat-criterion's refs seed — the field ADR-0365 measured at tier 6 seeding zero", () => {
  // `refs` is `references` under a per-kind name; it went unseeded only because of where it is filed.
  // All 59 uat-criteria carry an EMPTY envelope `references`, so before this the whole tier seeded 0.
  const plan = projectStandsOnFromCitations([
    row("a-criterion", "uat-criterion", [], {
      refs: ["asset:a-principle", "asset:a-process"],
    }),
    row("a-principle", "principle", []),
    row("a-process", "process", []),
  ]);

  assert.deepEqual(plan.edges, [
    { id: "a-criterion", standsOn: ["asset:a-principle", "asset:a-process"] },
  ]);
});

test("ADR-0373: a refList field on a kind that does not declare one is ignored", () => {
  // The map is the allow-list. A `rules`-shaped property on a principle is not a citation field, and
  // reading it would silently widen the decision to kinds nobody adjudicated.
  const plan = projectStandsOnFromCitations([
    row("a-principle", "principle", [], { rules: ["asset:a-techstack"], refs: ["asset:a-techstack"] }),
    row("a-techstack", "techstack", []),
  ]);

  assert.deepEqual(plan.edges, []);
});

test("ADR-0373: a target named in BOTH references and a refList seeds one edge", () => {
  const plan = projectStandsOnFromCitations([
    row("an-agent", "agent", ["asset:a-principle"], { rules: ["asset:a-principle"] }),
    row("a-principle", "principle", []),
  ]);

  assert.deepEqual(plan.edges, [{ id: "an-agent", standsOn: ["asset:a-principle"] }]);
  assert.equal(plan.edgesPlanned, 1);
});

test("library-standson-bootstrap-reports-what-it-skipped: the plan carries its denominators and a reason for every drop", () => {
  const plan = projectStandsOnFromCitations([
    row("an-agent", "agent", [
      "asset:a-principle", // seeds
      "asset:gone", // target absent from the corpus — a stale citation
      "asset:a-definition", // target outside the DAG
      "doc:0241", // malformed: satisfies StandsOnRef but names no path
      "doc:0235-record-context-traversal.md", // malformed: a filename, still not a relpath
    ]),
    row("a-principle", "principle", ["asset:a-pattern"]), // same tier
    row("a-pattern", "pattern", ["asset:an-agent"]), // up tier
    row("a-definition", "definition", ["asset:a-principle"]), // outside the DAG: not even scanned
    row("a-friction", "friction", ["asset:a-principle"]), // outside the DAG: not even scanned
  ]);

  // The denominator counts only artifacts the DAG orients — the two excluded kinds are not
  // "zero-edge documents", they are not documents of this graph at all.
  assert.equal(plan.docsScanned, 3);
  assert.equal(plan.edgesPlanned, 1);
  assert.deepEqual(plan.skipped, {
    sameTier: 1,
    upTier: 1,
    targetOutsideDag: 1,
    targetAbsent: 1,
    malformed: 2,
    alreadyAuthored: 0,
  });
  assert.equal(plan.extended, 0);

  // A malformed pointer is DROPPED, never written: it would land in a validated field as a
  // permanently dangling target that no later reader could distinguish from a real ADR.
  assert.deepEqual(plan.edges, [{ id: "an-agent", standsOn: ["asset:a-principle"] }]);
});

test("library-standson-bootstrap-reports-what-it-skipped: an empty corpus reports zero rather than nothing", () => {
  const plan = projectStandsOnFromCitations([]);

  assert.deepEqual(plan.edges, []);
  assert.equal(plan.docsScanned, 0);
  assert.equal(plan.edgesPlanned, 0);
});
