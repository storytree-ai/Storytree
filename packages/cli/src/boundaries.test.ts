import { test } from "node:test";
import assert from "node:assert/strict";

import {
  checkBoundaries,
  classOf,
  declaredEdgeDriftReport,
  extractImports,
  findCycle,
  formatDriftReport,
  formatRedundantReport,
  redundantDeclaredEdges,
  isFoundational,
  isTestScaffolding,
  mergeDeclaredGraph,
  storyOf,
  stripComments,
  type DeclaredEdgeDriftReport,
  type Ownership,
  type SourceImport,
  type VirtualStorySource,
} from "./boundaries.js";

// A miniature world mirroring the real ONE-class ownership (ADR-0075: the substrate class is gone —
// the ports storage-protocol/proof-protocol are ordinary ROOT organisms, with `foundational` a SUBSET carrying
// the minimality rule, not a separate class). The `@storytree/store` package was DISSOLVED (ADR-0077):
// its substrate + drawers moved into the owning organisms' node-only `./store` subpaths, so it is no
// longer a package here. The cli is the sole remaining hub organism.
const ownership: Ownership = {
  organisms: {
    "@storytree/library": "library",
    "@storytree/orchestrator": "drive-machinery",
    "@storytree/agent": "drive-machinery",
    "@storytree/notice-board": "notice-board",
    "@storytree/studio-members": "studio-members",
    "@storytree/cli": "cli",
    "@storytree/storage-protocol": "storage-protocol",
    "@storytree/proof-protocol": "proof-protocol",
  },
  foundational: ["@storytree/storage-protocol", "@storytree/proof-protocol"],
};

// Consumer-side outbound edges (`depends_on`). The ports are roots; consumers declare the edge to them
// (ADR-0075). The cli hub's outbound edges are declared provider-side in `consumedBy` below.
const storyGraph: Record<string, string[]> = {
  "proof-protocol": [],
  "storage-protocol": ["proof-protocol"],
  library: ["proof-protocol"],
  "drive-machinery": ["library", "storage-protocol", "proof-protocol"],
  "notice-board": ["library"],
  "studio-members": ["library"],
  cli: [],
};

// Provider-side inbound edges (`consumed_by`): each spoke (incl. the ports) owns its "wired into the
// cli hub" edge.
const consumedBy: Record<string, string[]> = {
  "drive-machinery": ["cli"],
  library: ["cli"],
  "notice-board": ["cli"],
  "storage-protocol": ["cli"],
  "proof-protocol": ["cli"],
};

// The real runtime @storytree/* dependency graph (each package.json `dependencies`; devDeps —
// e.g. proof-protocol→library parity — excluded by the caller). With the store package dissolved
// (ADR-0077) its drawers now live with the owning organisms, so the persistence runtime deps it used
// to carry (storage-protocol / notice-board / studio-members / proof-protocol) belong to those organisms; the
// cli consumes the new `./store` subpaths but those are the same packages it already depends on.
const realPackageDeps: Record<string, string[]> = {
  "@storytree/proof-protocol": [],
  "@storytree/storage-protocol": ["@storytree/proof-protocol"], // foundational → foundational ✓
  "@storytree/library": ["@storytree/proof-protocol"], // library depends_on proof-protocol ✓
  "@storytree/orchestrator": [
    "@storytree/agent", // same story (drive-machinery) → intra-organism
    "@storytree/storage-protocol", // drive-machinery depends_on storage-protocol ✓
    "@storytree/library", // drive-machinery depends_on library ✓
    "@storytree/proof-protocol", // drive-machinery depends_on proof-protocol ✓
  ],
  "@storytree/agent": [],
  // ADR-0166: the clean fixture backs every declared package-target edge (rule 4 requires it —
  // notice-board/studio-members really do import @storytree/library).
  "@storytree/notice-board": ["@storytree/library"],
  "@storytree/studio-members": ["@storytree/library"],
  "@storytree/cli": [
    "@storytree/agent", // cli → drive-machinery: covered by drive-machinery.consumed_by ✓
    "@storytree/storage-protocol", // covered by storage-protocol.consumed_by ✓
    "@storytree/library", // covered by library.consumed_by ✓
    "@storytree/notice-board", // covered by notice-board.consumed_by ✓
    "@storytree/orchestrator", // cli → drive-machinery ✓
    "@storytree/proof-protocol", // covered by proof-protocol.consumed_by ✓
  ],
};

test("classOf treats every package (ports included) as an organism; null when unknown", () => {
  assert.equal(classOf("@storytree/library", ownership), "organism");
  assert.equal(classOf("@storytree/cli", ownership), "organism"); // the hub is an organism
  assert.equal(classOf("@storytree/storage-protocol", ownership), "organism"); // ADR-0075: a port is an organism too
  assert.equal(classOf("@storytree/proof-protocol", ownership), "organism");
  assert.equal(classOf("@storytree/mystery", ownership), null);
});

test("isFoundational marks the ports, not ordinary organisms (ADR-0075)", () => {
  assert.equal(isFoundational("@storytree/storage-protocol", ownership), true);
  assert.equal(isFoundational("@storytree/proof-protocol", ownership), true);
  assert.equal(isFoundational("@storytree/library", ownership), false);
  assert.equal(isFoundational("@storytree/cli", ownership), false);
});

test("mergeDeclaredGraph unions depends_on with the inverse of consumed_by", () => {
  const merged = mergeDeclaredGraph(
    { a: ["b"], b: [], c: [] },
    { b: ["c"] }, // c consumes b → edge c → b
  );
  assert.deepEqual(merged.a, ["b"]);
  assert.deepEqual(merged.c, ["b"]); // provider-side edge surfaced consumer-direction
  assert.deepEqual(merged.b, []);
});

test("the real clean graph (ports as declared root organisms) has zero violations", () => {
  const { violations } = checkBoundaries({
    ownership,
    packageDeps: realPackageDeps,
    storyGraph,
    consumedBy,
  });
  assert.deepEqual(violations, [], violations.join("\n"));
});

test("a cli hub edge declared PROVIDER-side (consumed_by) passes", () => {
  // cli → library, covered only by library.consumed_by: [cli] (cli.depends_on is []).
  const packageDeps = { "@storytree/cli": ["@storytree/library"] };
  const { violations } = checkBoundaries({ ownership, packageDeps, storyGraph, consumedBy });
  assert.deepEqual(violations, []);
});

test("a cli hub edge with the provider-side declaration REMOVED is caught", () => {
  const packageDeps = { "@storytree/cli": ["@storytree/library"] };
  const without = { ...consumedBy, library: [] }; // drop library.consumed_by: [cli]
  const { violations } = checkBoundaries({ ownership, packageDeps, storyGraph, consumedBy: without });
  assert.equal(violations.length, 1);
  assert.match(violations[0]!, /undeclared cross-story coupling/);
  assert.match(violations[0]!, /cli.*library/);
});

test("ADR-0075: an organism→PORT edge is allowed only when DECLARED (no port exemption)", () => {
  // cli imports both ports; allowed because storage-protocol/proof-protocol declare consumed_by: [cli].
  const packageDeps = { "@storytree/cli": ["@storytree/storage-protocol", "@storytree/proof-protocol"] };
  assert.deepEqual(checkBoundaries({ ownership, packageDeps, storyGraph, consumedBy }).violations, []);
  // Remove the provider-side declarations → the SAME port imports are now undeclared couplings (the
  // old `substrate` exemption — anyone may depend, no edge — is gone).
  const without = { ...consumedBy, "storage-protocol": [], "proof-protocol": [] };
  const { violations } = checkBoundaries({ ownership, packageDeps, storyGraph, consumedBy: without });
  assert.equal(violations.length, 2, violations.join("\n"));
  assert.ok(violations.every((v) => /undeclared cross-story coupling/.test(v)), violations.join("\n"));
});

test("a planted UNDECLARED cross-organism edge — library importing notice-board — is caught", () => {
  // library reaches into another organism with no declaration on either endpoint.
  const packageDeps = {
    ...realPackageDeps,
    "@storytree/library": ["@storytree/notice-board", "@storytree/proof-protocol"],
  };
  const { violations } = checkBoundaries({ ownership, packageDeps, storyGraph, consumedBy });
  assert.equal(violations.length, 1, violations.join("\n"));
  assert.match(violations[0]!, /undeclared cross-story coupling/);
  assert.match(violations[0]!, /library.*notice-board/);
  // The fix-pointing message names BOTH declaration sites (consumer depends_on / provider consumed_by).
  assert.match(violations[0]!, /depends_on/);
  assert.match(violations[0]!, /consumed_by/);
});

test("an undeclared edge passes once it is DECLARED on an endpoint", () => {
  // A fresh top-level consumer `@storytree/report` that studio-members does not reach (so no cycle).
  const withReport: Ownership = {
    organisms: { ...ownership.organisms, "@storytree/report": "report" },
    foundational: ownership.foundational,
  };
  const packageDeps = { "@storytree/report": ["@storytree/studio-members"] };
  // Undeclared → caught.
  const red = checkBoundaries({ ownership: withReport, packageDeps, storyGraph, consumedBy });
  assert.equal(red.violations.length, 1);
  assert.match(red.violations[0]!, /undeclared cross-story coupling/);
  // Declared consumer-side → green (no cycle: studio-members never reaches report).
  const declared = { ...storyGraph, report: ["studio-members"] };
  const green = checkBoundaries({
    ownership: withReport,
    packageDeps,
    storyGraph: declared,
    consumedBy,
  });
  assert.deepEqual(green.violations, [], green.violations.join("\n"));
});

test("a studio-members→organism edge needs a declaration too (no organism is exempt)", () => {
  // studio-members importing notice-board with no declaration → caught. (library included so its
  // declared library edge stays code-backed under the ADR-0166 rule — one violation, not two.)
  const packageDeps = { "@storytree/studio-members": ["@storytree/notice-board", "@storytree/library"] };
  const { violations } = checkBoundaries({
    ownership,
    packageDeps,
    storyGraph,
    consumedBy,
  });
  assert.equal(violations.length, 1);
  assert.match(violations[0]!, /undeclared cross-story coupling/);
  assert.match(violations[0]!, /studio-members.*notice-board/);
});

// ── Consuming surfaces — apps + the public subrepo (ADR-0100) ───────────────────────────────────────
// A surface is a SINK (apps/studio) that wires organisms together. Its outbound code edges are covered
// by the SAME rule as an organism's (declared in the surface's own story depends_on), so the studio's
// real wiring is enforced + rendered — but it is never foundational and draws no inbound edge.
const withStudioSurface: Ownership = {
  organisms: ownership.organisms,
  foundational: ownership.foundational,
  surfaces: { studio: "studio" },
};

test("classOf / storyOf resolve a consuming surface (ADR-0100)", () => {
  assert.equal(classOf("studio", withStudioSurface), "surface");
  assert.equal(storyOf("studio", withStudioSurface), "studio");
  assert.equal(storyOf("@storytree/library", withStudioSurface), "library"); // organisms still resolve
  assert.equal(classOf("studio", ownership), null); // undeclared surface ⇒ unclassified
});

test("a surface's organism dep needs a declared edge, like any coupling (ADR-0100)", () => {
  // studio (surface) → @storytree/library (organism, story `library`).
  const packageDeps = { studio: ["@storytree/library"] };
  // Undeclared → caught as a cross-story coupling (surface story `studio` → organism story `library`).
  const red = checkBoundaries({ ownership: withStudioSurface, packageDeps, storyGraph, consumedBy });
  assert.equal(red.violations.length, 1, red.violations.join("\n"));
  assert.match(red.violations[0]!, /undeclared cross-story coupling/);
  assert.match(red.violations[0]!, /studio.*library/);
  // Declared consumer-side on the surface's own story → green (a sink, so no cycle).
  const declared = { ...storyGraph, studio: ["library"] };
  const green = checkBoundaries({ ownership: withStudioSurface, packageDeps, storyGraph: declared, consumedBy });
  assert.deepEqual(green.violations, [], green.violations.join("\n"));
});

test("an undeclared APP package (not in surfaces) is caught as unclassified (ADR-0100)", () => {
  // The studio app value-importing an organism with NO `surfaces` entry → it can't slip in unowned.
  const packageDeps = { studio: ["@storytree/library"] };
  const { violations } = checkBoundaries({ ownership, packageDeps, storyGraph, consumedBy });
  assert.ok(violations.some((v) => /unclassified package "studio"/.test(v)), violations.join("\n"));
});

test("a surface is not foundational and not subject to the minimality rule (ADR-0100)", () => {
  assert.equal(isFoundational("studio", withStudioSurface), false);
  // studio → a non-foundational organism is fine once declared — the minimality rule never fires.
  const packageDeps = { studio: ["@storytree/notice-board"] };
  const declared = { ...storyGraph, studio: ["notice-board"] };
  const { violations } = checkBoundaries({ ownership: withStudioSurface, packageDeps, storyGraph: declared, consumedBy });
  assert.deepEqual(violations, [], violations.join("\n"));
});

test("a foundational port depending on a non-foundational organism is rejected (ADR-0075 minimality)", () => {
  // storage-protocol reaching into a non-foundational organism — DECLARED, so ONLY the minimality rule fires
  // (proves the rule is independent of the declared-edge coverage rule).
  const packageDeps = { "@storytree/storage-protocol": ["@storytree/studio-members", "@storytree/proof-protocol"] };
  const declared = { ...storyGraph, "storage-protocol": ["proof-protocol", "studio-members"] };
  const { violations } = checkBoundaries({ ownership, packageDeps, storyGraph: declared, consumedBy });
  assert.equal(violations.length, 1, violations.join("\n"));
  assert.match(violations[0]!, /foundational port "@storytree\/storage-protocol" depends on non-foundational/);
  assert.match(violations[0]!, /studio-members/);
});

test("a foundational→foundational edge is fine (storage-protocol → proof-protocol)", () => {
  const packageDeps = { "@storytree/storage-protocol": ["@storytree/proof-protocol"] };
  const { violations } = checkBoundaries({ ownership, packageDeps, storyGraph, consumedBy });
  assert.deepEqual(violations, [], violations.join("\n"));
});

test("a foundational port reaching a browser-unsafe organism cannot pass: declared ⇒ cycle", () => {
  // storage-protocol → library, declared (storage-protocol.depends_on library). library already depends_on
  // proof-protocol... but to force a cycle: declare library → storage-protocol. storage-protocol → library + library → storage-protocol
  // is a cycle. So the browser-safety floor holds even via acyclicity, not just the minimality rule.
  const packageDeps = { "@storytree/storage-protocol": ["@storytree/library", "@storytree/proof-protocol"] };
  const declared = { ...storyGraph, "storage-protocol": ["proof-protocol", "library"], library: ["proof-protocol", "storage-protocol"] };
  const { violations } = checkBoundaries({ ownership, packageDeps, storyGraph: declared, consumedBy });
  assert.ok(violations.some((v) => /cycle/.test(v)), violations.join("\n"));
});

test("an unclassified package is caught (a new package can't slip in unowned)", () => {
  const packageDeps = { "@storytree/library": ["@storytree/newcomer"] };
  const { violations } = checkBoundaries({ ownership, packageDeps, storyGraph, consumedBy });
  assert.ok(violations.some((v) => /unclassified package "@storytree\/newcomer"/.test(v)));
});

test("a foundational package that is not an organism is caught (ADR-0075: foundational ⊆ organisms)", () => {
  const bad: Ownership = { organisms: {}, foundational: ["@storytree/storage-protocol"] };
  const { violations } = checkBoundaries({ ownership: bad, packageDeps: {}, storyGraph: {} });
  assert.ok(
    violations.some((v) => /foundational package "@storytree\/storage-protocol" is not an organism/.test(v)),
    violations.join("\n"),
  );
});

test("a cross-story dependency cycle is caught (ADR-0058)", () => {
  const cyclic = { a: ["b"], b: ["c"], c: ["a"] };
  const { violations } = checkBoundaries({
    ownership: { organisms: {}, foundational: [] },
    packageDeps: {},
    storyGraph: cyclic,
  });
  assert.equal(violations.length, 1);
  assert.match(violations[0]!, /cycle/);
});

test("a cycle smuggled in through consumed_by is caught (the merged graph is checked)", () => {
  // depends_on a → b; consumed_by says a is consumed by b (edge b → a) → cycle a ⇄ b.
  const { violations } = checkBoundaries({
    ownership: { organisms: {}, foundational: [] },
    packageDeps: {},
    storyGraph: { a: ["b"], b: [] },
    consumedBy: { a: ["b"] },
  });
  assert.equal(violations.length, 1);
  assert.match(violations[0]!, /cycle/);
});

test("findCycle returns null on a DAG and a node path on a cycle", () => {
  assert.equal(findCycle({ a: ["b"], b: [] }), null);
  const c = findCycle({ a: ["b"], b: ["a"] });
  assert.ok(c && c[0] === c[c.length - 1], "cycle path starts and ends at the same node");
});

// ── The v2 source-import scan (ADR-0074 §"does NOT decide") ────────────────────────────────────────
// Closes the two couplings the package.json dep-graph rule can't see: (a) a cross-package RELATIVE
// import that sidesteps both the dep declaration AND the exports barrel, and (b) a runtime source file
// value-importing an organism that is only a devDependency (or undeclared).

// A helper: run only the source-import rules in isolation (no declared deps / story edges to add
// unrelated violations).
function sourceOnly(sourceImports: SourceImport[]): string[] {
  return checkBoundaries({ ownership, packageDeps: {}, storyGraph: {}, consumedBy: {}, sourceImports })
    .violations;
}

test("stripComments removes commented-out imports but keeps real string specifiers", () => {
  const src = [
    `// import { x } from "@storytree/evil";`,
    `/* import { y } from "@storytree/also-evil"; */`,
    `import { z } from "@storytree/library"; // trailing comment`,
    `const url = "https://example.com/not-an-import";`,
  ].join("\n");
  assert.deepEqual(
    extractImports(src).map((g) => g.specifier),
    ["@storytree/library"],
  );
  // stripComments preserves the real string literal untouched.
  assert.match(stripComments(src), /@storytree\/library/);
  assert.doesNotMatch(stripComments(src), /also-evil/);
});

test("extractImports covers static / type / side-effect / dynamic / re-export, with typeOnly", () => {
  const src = [
    `import { a } from "@storytree/library";`,
    `import type { B } from "@storytree/storage-protocol";`,
    `import * as ns from "../../orchestrator/src/x.js";`,
    `import "./side-effect.js";`,
    `export { c } from "@storytree/notice-board";`,
    `export type { D } from "@storytree/proof-protocol";`,
    `const m = await import("@storytree/agent");`,
    `import { value, type T } from "@storytree/studio-members";`,
  ].join("\n");
  const got = extractImports(src);
  const find = (s: string): { specifier: string; typeOnly: boolean } | undefined =>
    got.find((g) => g.specifier === s);
  assert.equal(find("@storytree/library")?.typeOnly, false);
  assert.equal(find("@storytree/storage-protocol")?.typeOnly, true);
  assert.ok(find("../../orchestrator/src/x.js"));
  assert.ok(find("./side-effect.js"));
  assert.equal(find("@storytree/notice-board")?.typeOnly, false);
  assert.equal(find("@storytree/proof-protocol")?.typeOnly, true);
  assert.ok(find("@storytree/agent")); // dynamic import
  assert.equal(find("@storytree/studio-members")?.typeOnly, false); // inline `type T` is NOT a type-only import
});

test("isTestScaffolding flags test files + parity suites, not ordinary source", () => {
  assert.equal(isTestScaffolding("packages/orchestrator/src/store/pg-work-store.test.ts"), true);
  assert.equal(isTestScaffolding("packages/orchestrator/src/store/pg-change-store.live.test.ts"), true);
  assert.equal(isTestScaffolding("packages/storage-protocol/src/store-parity.ts"), true);
  assert.equal(isTestScaffolding("packages/orchestrator/src/proof/rollup-parity.ts"), true);
  assert.equal(isTestScaffolding("packages/orchestrator/src/store/pg-work-store.ts"), false);
});

test("Gap A': the scan catches a planted cross-package RELATIVE import", () => {
  const v = sourceOnly([
    {
      importer: "@storytree/orchestrator",
      file: "packages/orchestrator/src/sequence.ts",
      specifier: "../../library/src/store/pg-store.js", // reaches into another package by path
      typeOnly: false,
    },
  ]);
  assert.equal(v.length, 1, v.join("\n"));
  assert.match(v[0]!, /cross-package relative import/);
  assert.match(v[0]!, /@storytree\/library/); // points at the barrel to use
});

test("Gap A': a type-only relative escape is still caught (the barrel must be used regardless)", () => {
  const v = sourceOnly([
    {
      importer: "@storytree/agent",
      file: "packages/agent/src/step.ts",
      specifier: "../../library/src/schema.js",
      typeOnly: true,
    },
  ]);
  assert.equal(v.length, 1);
  assert.match(v[0]!, /cross-package relative import/);
});

test("a relative import that stays in-package is fine (incl. across subdirs)", () => {
  assert.deepEqual(
    sourceOnly([
      {
        importer: "@storytree/orchestrator",
        file: "packages/orchestrator/src/proof/signer.ts",
        specifier: "../sequence.js", // packages/orchestrator/src/sequence.js — same package
        typeOnly: false,
      },
    ]),
    [],
  );
});

test("Gap B': the scan catches a planted devDep-only RUNTIME @storytree import", () => {
  // studio-members value-imports orchestrator from a runtime (non-test) file; orchestrator is only
  // studio-members's devDependency, so the package.json dep-graph rule never sees it.
  const v = sourceOnly([
    {
      importer: "@storytree/studio-members",
      file: "packages/studio-members/src/store/pg-user-store.ts",
      specifier: "@storytree/orchestrator",
      typeOnly: false,
    },
  ]);
  assert.equal(v.length, 1, v.join("\n"));
  assert.match(v[0]!, /devDep\/undeclared runtime import/);
  assert.match(v[0]!, /@storytree\/orchestrator/);
});

test("Gap B': a type-only cross-package import is NOT flagged (erased, not a runtime coupling)", () => {
  assert.deepEqual(
    sourceOnly([
      {
        importer: "@storytree/studio-members",
        file: "packages/studio-members/src/store/pg-user-store.ts",
        specifier: "@storytree/orchestrator",
        typeOnly: true,
      },
    ]),
    [],
  );
});

test("ADR-0075: a runtime PORT import is covered by its declared dep, not a blanket exemption", () => {
  // value-importing proof-protocol is fine BECAUSE it is a declared runtime dependency...
  const ok = checkBoundaries({
    ownership,
    packageDeps: { "@storytree/library": ["@storytree/proof-protocol"] },
    storyGraph: { library: ["proof-protocol"], "proof-protocol": [] },
    consumedBy: {},
    sourceImports: [
      {
        importer: "@storytree/library",
        file: "packages/library/src/schema.ts",
        specifier: "@storytree/proof-protocol",
        typeOnly: false,
      },
    ],
  });
  assert.deepEqual(ok.violations, [], ok.violations.join("\n"));
  // ...but a runtime port import with NO declared dep is now flagged (the old substrate skip is gone).
  const bad = sourceOnly([
    {
      importer: "@storytree/notice-board",
      file: "packages/notice-board/src/x.ts",
      specifier: "@storytree/proof-protocol",
      typeOnly: false,
    },
  ]);
  assert.equal(bad.length, 1, bad.join("\n"));
  assert.match(bad[0]!, /devDep\/undeclared runtime import/);
});

test("the scan does NOT flag test-file / parity reuse (the real devDep parity scaffolding)", () => {
  // These are exactly the existing sanctioned reuses (ADR-0010 §5): they MUST stay green.
  assert.deepEqual(
    sourceOnly([
      // orchestrator's store test reuses a parity suite across the boundary.
      {
        importer: "@storytree/orchestrator",
        file: "packages/orchestrator/src/store/pg-work-store.test.ts",
        specifier: "@storytree/storage-protocol",
        typeOnly: false,
      },
      // proof-protocol's parity test imports library (the real proof-protocol↔library devDep).
      {
        importer: "@storytree/proof-protocol",
        file: "packages/proof-protocol/src/parity.test.ts",
        specifier: "@storytree/library",
        typeOnly: false,
      },
      // a parity SUITE definition file reaching cross-package is sanctioned scaffolding too.
      {
        importer: "@storytree/storage-protocol",
        file: "packages/storage-protocol/src/store-parity.ts",
        specifier: "@storytree/orchestrator",
        typeOnly: false,
      },
    ]),
    [],
  );
});

test("the scan ignores type-only, same-package, and bare-external specifiers", () => {
  assert.deepEqual(
    sourceOnly([
      // a type-only port import is erased — never a runtime coupling (rule b skips it).
      {
        importer: "@storytree/library",
        file: "packages/library/src/schema.ts",
        specifier: "@storytree/proof-protocol",
        typeOnly: true,
      },
      // same package.
      {
        importer: "@storytree/library",
        file: "packages/library/src/store/pg-store.ts",
        specifier: "@storytree/library",
        typeOnly: false,
      },
      // bare externals.
      {
        importer: "@storytree/library",
        file: "packages/library/src/store/pg-store.ts",
        specifier: "node:crypto",
        typeOnly: false,
      },
      { importer: "@storytree/library", file: "packages/library/src/store/pg-store.ts", specifier: "pg", typeOnly: false },
      // a same-package relative import.
      { importer: "@storytree/library", file: "packages/library/src/store/pg-store.ts", specifier: "./connection.js", typeOnly: false },
    ]),
    [],
  );
});

test("a runtime @storytree import backed by a declared dependency is NOT flagged", () => {
  // library value-imports proof-protocol and proof-protocol IS a runtime dep + a declared edge.
  const { violations } = checkBoundaries({
    ownership,
    packageDeps: { "@storytree/library": ["@storytree/proof-protocol"] },
    storyGraph: { library: ["proof-protocol"] },
    consumedBy: {},
    sourceImports: [
      {
        importer: "@storytree/library",
        file: "packages/library/src/store/pg-store.ts",
        specifier: "@storytree/proof-protocol",
        typeOnly: false,
      },
    ],
  });
  assert.deepEqual(violations, [], violations.join("\n"));
});

test("a representative clean set of real source imports adds zero source violations", () => {
  const sourceImports: SourceImport[] = [
    { importer: "@storytree/cli", file: "packages/cli/src/commands.ts", specifier: "@storytree/orchestrator", typeOnly: false }, // cli dep ✓
    { importer: "@storytree/library", file: "packages/library/src/store/pg-store.ts", specifier: "@storytree/proof-protocol", typeOnly: false }, // library dep ✓
    { importer: "@storytree/library", file: "packages/library/src/schema.ts", specifier: "@storytree/proof-protocol", typeOnly: false }, // declared port dep ✓
    { importer: "@storytree/orchestrator", file: "packages/orchestrator/src/store/pg-work-store.test.ts", specifier: "@storytree/storage-protocol", typeOnly: false }, // test scaffolding ✓
    { importer: "@storytree/orchestrator", file: "packages/orchestrator/src/proof/signer.ts", specifier: "../anchor-compute.js", typeOnly: false }, // in-package ✓
    { importer: "@storytree/library", file: "packages/library/src/store/pg-store.ts", specifier: "node:crypto", typeOnly: false }, // external ✓
  ];
  const { violations } = checkBoundaries({
    ownership,
    packageDeps: realPackageDeps,
    storyGraph,
    consumedBy,
    sourceImports,
  });
  assert.deepEqual(violations, [], violations.join("\n"));
});

// ===================================================================================================
// The non-blocking declared-edge DRIFT report (ADR-0115). A SIBLING to the blocking gate above: it
// never appends a violation / fails the gate — it computes, per story, the set difference between the
// DECLARED cross-story graph (depends_on ∪ inverse(consumed_by)) and the REAL code-edge graph, and for
// a VIRTUAL story (owns no package, e.g. headless-orchestrator) it DERIVES the real edges from its
// units' `proof.real.sourceFile` text via the existing `extractImports`.
// ===================================================================================================

// A repo-ALIGNED ownership map (the miniature `ownership` above maps @storytree/agent → drive-machinery
// for the boundary tests; the drift fixture needs the REAL mapping where @storytree/agent → the `agent`
// story, so the derivation lands the fixture's edges where ADR-0115 expects them).
const realWorld: Ownership = {
  organisms: {
    "@storytree/library": "library",
    "@storytree/orchestrator": "drive-machinery",
    "@storytree/drive": "drive-machinery",
    "@storytree/agent": "agent",
    "@storytree/notice-board": "notice-board",
    "@storytree/studio-members": "studio-members",
    "@storytree/cli": "cli",
    "@storytree/storage-protocol": "storage-protocol",
    "@storytree/proof-protocol": "proof-protocol",
    "@storytree/forest-world": "forest-world",
  },
  foundational: ["@storytree/storage-protocol", "@storytree/proof-protocol", "@storytree/forest-world"],
  surfaces: { studio: "studio", desktop: "desktop" },
};

// The real `packages/drive/src/orchestrate.ts` import shape (ADR-0115 fixture): runtime value-imports
// of @storytree/agent + @storytree/library, plus a TYPE-ONLY @storytree/storage-protocol (erased) and a
// type-only re-import of @storytree/agent.
const ORCHESTRATE_TS = `
import type { Store } from "@storytree/storage-protocol";
import type { SdkQueryFn, HeadlessOrchestratorResult, OrientationRunner } from "@storytree/agent";
import { runHeadlessOrchestrator } from "@storytree/agent";
import { renderAgentPrompt } from "@storytree/library/store";
export async function orchestrate(): Promise<void> {}
`;

test("declaredEdgeDriftReport: per-story set difference for a PACKAGE-OWNING story", () => {
  // notice-board declares [library, drive-machinery] but its code only imports library — so
  // drive-machinery is declared-but-unbacked; and it imports studio-members with NO declaration — so
  // studio-members is backed-but-undeclared.
  const report = declaredEdgeDriftReport({
    ownership: realWorld,
    storyGraph: { "notice-board": ["library", "drive-machinery"], library: [], "drive-machinery": [], "studio-members": [] },
    consumedBy: {},
    packageDeps: { "@storytree/notice-board": ["@storytree/library", "@storytree/studio-members"] },
  });
  assert.deepEqual(report.byStory["notice-board"], {
    virtual: false,
    declaredButUnbacked: ["drive-machinery"],
    backedButUndeclared: ["studio-members"],
  });
});

test("declaredEdgeDriftReport: a provider-side consumed_by declaration counts as declared (no false drift)", () => {
  // cli imports library; the edge is declared PROVIDER-side (library.consumed_by: [cli]) — so it is
  // backed AND declared: no drift in either direction.
  const report = declaredEdgeDriftReport({
    ownership: realWorld,
    storyGraph: { cli: [], library: [] },
    consumedBy: { library: ["cli"] },
    packageDeps: { "@storytree/cli": ["@storytree/library"] },
  });
  assert.equal(report.byStory["cli"], undefined);
  assert.equal(report.byStory["library"], undefined);
});

test("declaredEdgeDriftReport: derives a VIRTUAL story's real edges from sourceFile imports (the headless-orchestrator fixture)", () => {
  // The exact ADR-0115 fixture: headless-orchestrator owns no package; declared
  // [agent, drive-machinery, library, notice-board]; its orchestrator-composition unit's sourceFile
  // (orchestrate.ts) runtime-imports agent + library and type-only storage-protocol.
  const report = declaredEdgeDriftReport({
    ownership: realWorld,
    storyGraph: {
      "headless-orchestrator": ["agent", "drive-machinery", "library", "notice-board"],
      agent: [],
      "drive-machinery": [],
      library: [],
      "notice-board": [],
    },
    consumedBy: {},
    packageDeps: {},
    virtualStorySources: [
      { story: "headless-orchestrator", file: "packages/drive/src/orchestrate.ts", content: ORCHESTRATE_TS },
    ],
  });
  const drift = report.byStory["headless-orchestrator"];
  assert.ok(drift, "headless-orchestrator must have a drift entry");
  assert.equal(drift.virtual, true);
  // The type-only @storytree/storage-protocol import must NOT surface anywhere (computed before the
  // deepEqual below, which narrows an `[]` expectation to never[] and would break a later .includes).
  const flagged = [...drift.declaredButUnbacked, ...drift.backedButUndeclared];
  assert.ok(!flagged.includes("storage-protocol"), "type-only storage-protocol must never be flagged");
  // Derived real edges = {agent, library} (runtime imports); so the host edge drive-machinery and the
  // injected-runner edge notice-board are flagged, and nothing is backed-but-undeclared.
  assert.deepEqual(drift.declaredButUnbacked, ["drive-machinery", "notice-board"]);
  assert.deepEqual(drift.backedButUndeclared, []);
});

test("declaredEdgeDriftReport: a type-only @storytree import does NOT back an edge (erased)", () => {
  // Same virtual story, but the ONLY agent import is `import type` → agent is declared yet unbacked.
  const typeOnlyAgent = `import type { Foo } from "@storytree/agent";\nexport const x = 1;\n`;
  const report = declaredEdgeDriftReport({
    ownership: realWorld,
    storyGraph: { v: ["agent"], agent: [] },
    consumedBy: {},
    packageDeps: {},
    virtualStorySources: [{ story: "v", file: "packages/drive/src/v.ts", content: typeOnlyAgent }],
  });
  assert.deepEqual(report.byStory["v"], { virtual: true, declaredButUnbacked: ["agent"], backedButUndeclared: [] });
  // Flip to a VALUE import → the edge is backed → no drift at all.
  const valueAgent = `import { foo } from "@storytree/agent";\nexport const x = foo;\n`;
  const green = declaredEdgeDriftReport({
    ownership: realWorld,
    storyGraph: { v: ["agent"], agent: [] },
    consumedBy: {},
    packageDeps: {},
    virtualStorySources: [{ story: "v", file: "packages/drive/src/v.ts", content: valueAgent }],
  });
  assert.equal(green.byStory["v"], undefined);
});

test("declaredEdgeDriftReport: derivation ignores non-@storytree, relative, and self specifiers", () => {
  const content = `
import { readFileSync } from "node:fs";
import { z } from "zod";
import { local } from "./local.js";
import { sibling } from "../other/sibling.js";
import { real } from "@storytree/agent";
export const x = [readFileSync, z, local, sibling, real];
`;
  const report = declaredEdgeDriftReport({
    ownership: realWorld,
    storyGraph: { v: [], agent: [] },
    consumedBy: {},
    packageDeps: {},
    virtualStorySources: [{ story: "v", file: "packages/drive/src/v.ts", content }],
  });
  // Only the @storytree/agent VALUE import derives an edge → agent is backed-but-undeclared (v declares
  // nothing). node:/zod/relative specifiers contribute nothing.
  assert.deepEqual(report.byStory["v"], { virtual: true, declaredButUnbacked: [], backedButUndeclared: ["agent"] });
});

test("declaredEdgeDriftReport: test-scaffolding source files are skipped in derivation", () => {
  const report = declaredEdgeDriftReport({
    ownership: realWorld,
    storyGraph: { v: ["agent"], agent: [] },
    consumedBy: {},
    packageDeps: {},
    virtualStorySources: [
      // a .test.ts file value-importing agent is sanctioned scaffolding → not a real edge.
      { story: "v", file: "packages/drive/src/orchestrate.test.ts", content: `import { foo } from "@storytree/agent";` },
    ],
  });
  // agent stays declared-but-unbacked (the test import doesn't count as backing).
  assert.deepEqual(report.byStory["v"], { virtual: true, declaredButUnbacked: ["agent"], backedButUndeclared: [] });
});

test("declaredEdgeDriftReport: aggregates derived edges across a virtual story's multiple units", () => {
  const report = declaredEdgeDriftReport({
    ownership: realWorld,
    storyGraph: { v: ["agent", "library"], agent: [], library: [] },
    consumedBy: {},
    packageDeps: {},
    virtualStorySources: [
      { story: "v", file: "packages/drive/src/a.ts", content: `import { a } from "@storytree/agent";` },
      { story: "v", file: "packages/agent/src/b.ts", content: `import { b } from "@storytree/library";` },
    ],
  });
  // Both units' edges aggregate → agent AND library are backed → no drift.
  assert.equal(report.byStory["v"], undefined);
});

test("declaredEdgeDriftReport: a package-owning story drops intra-organism (self) code edges", () => {
  // orchestrator and drive are BOTH owned by drive-machinery — an orchestrator→drive import is
  // intra-organism, never a cross-story edge, so it is not backed-but-undeclared.
  const report = declaredEdgeDriftReport({
    ownership: realWorld,
    storyGraph: { "drive-machinery": [] },
    consumedBy: {},
    packageDeps: { "@storytree/orchestrator": ["@storytree/drive"] },
  });
  assert.equal(report.byStory["drive-machinery"], undefined);
});

test("declaredEdgeDriftReport: both edge lists are deterministically sorted", () => {
  const report = declaredEdgeDriftReport({
    ownership: realWorld,
    storyGraph: { v: ["notice-board", "agent", "library"], agent: [], library: [], "notice-board": [] },
    consumedBy: {},
    packageDeps: {},
    virtualStorySources: [],
  });
  // No source files → nothing backed → all three declared edges flagged, sorted ascending.
  assert.deepEqual(report.byStory["v"]!.declaredButUnbacked, ["agent", "library", "notice-board"]);
});

test("declaredEdgeDriftReport: a story with no asymmetry produces no entry, and the report does not raise", () => {
  // Declared exactly matches real (cli → library, declared + backed). No throw, empty byStory.
  const report = declaredEdgeDriftReport({
    ownership: realWorld,
    storyGraph: { cli: ["library"], library: [] },
    consumedBy: {},
    packageDeps: { "@storytree/cli": ["@storytree/library"] },
  });
  assert.deepEqual(report.byStory, {});
});

test("formatDriftReport: an empty report renders a clean, explicitly non-blocking line", () => {
  const text = formatDriftReport({ byStory: {} });
  assert.match(text, /ADR-0115/);
  assert.match(text, /NON-BLOCKING/);
  assert.match(text, /no declared-vs-code edge drift/i);
});

test("formatDriftReport: names each story and both asymmetry kinds, marked non-blocking", () => {
  const report: DeclaredEdgeDriftReport = {
    byStory: {
      "headless-orchestrator": { virtual: true, declaredButUnbacked: ["drive-machinery", "notice-board"], backedButUndeclared: [] },
      "some-story": { virtual: false, declaredButUnbacked: [], backedButUndeclared: ["agent"] },
    },
  };
  const text = formatDriftReport(report);
  assert.match(text, /NON-BLOCKING/);
  assert.match(text, /headless-orchestrator/);
  assert.match(text, /drive-machinery, notice-board/);
  assert.match(text, /some-story/);
  assert.match(text, /agent/);
  // Names both directions of asymmetry.
  assert.match(text, /declared but code-unbacked/i);
  assert.match(text, /backed but undeclared/i);
});

test("declaredEdgeDriftReport: VirtualStorySource passed for a PACKAGE-OWNING story is ignored (defensive)", () => {
  // agent owns @storytree/agent (not virtual); a stray source record for it must not derive edges —
  // package-owning stories' real edges come only from packageDeps.
  const report = declaredEdgeDriftReport({
    ownership: realWorld,
    storyGraph: { agent: [], library: [] },
    consumedBy: {},
    packageDeps: {},
    virtualStorySources: [
      { story: "agent", file: "packages/agent/src/x.ts", content: `import { y } from "@storytree/library";` },
    ],
  });
  // The stray record is ignored → agent has no backed edge → no entry (not flagged as backed library).
  assert.equal(report.byStory["agent"], undefined);
});

// ===================================================================================================
// ADR-0166: the declared-edge HONESTY gates. Rule 4 (blocking): a PACKAGE-OWNING story's declared
// `depends_on` edge to another PACKAGE-OWNING story must be code-backed (some package of the consumer
// runtime-depends on some package of the target) OR annotated in the consumer's `artifact_edges`
// (a deliberate build-artifact / write-target / injected-seam edge). Virtual endpoints stay advisory
// (the drift report). Plus the advisory redundant-transitive report (`redundantDeclaredEdges`).
// ===================================================================================================

test("ADR-0166: a package-owning story's unbacked declared package-target edge is a violation", () => {
  // notice-board (owns a package) declares drive-machinery (owns packages) with NO code backing.
  const graph = { ...storyGraph, "notice-board": ["library", "drive-machinery"] };
  const { violations } = checkBoundaries({
    ownership,
    packageDeps: realPackageDeps,
    storyGraph: graph,
    consumedBy,
  });
  assert.equal(violations.length, 1, violations.join("\n"));
  assert.match(violations[0]!, /declared but code-unbacked/);
  assert.match(violations[0]!, /notice-board.*drive-machinery/);
  assert.match(violations[0]!, /artifact_edges/); // the fix-pointing escape for a genuine honesty edge
});

test("ADR-0166: an artifact_edges annotation covers a deliberate non-import edge", () => {
  const graph = { ...storyGraph, "notice-board": ["library", "drive-machinery"] };
  const { violations } = checkBoundaries({
    ownership,
    packageDeps: realPackageDeps,
    storyGraph: graph,
    consumedBy,
    artifactEdges: { "notice-board": ["drive-machinery"] },
  });
  assert.deepEqual(violations, [], violations.join("\n"));
});

test("ADR-0166: virtual endpoints stay advisory — no blocking on a virtual consumer or target", () => {
  // Virtual consumer: story v owns no package; its unbacked declared edge is drift-report territory.
  const withVirtualConsumer = { ...storyGraph, v: ["library"] };
  assert.deepEqual(
    checkBoundaries({ ownership, packageDeps: realPackageDeps, storyGraph: withVirtualConsumer, consumedBy })
      .violations,
    [],
  );
  // Virtual target: notice-board declares an edge to virtual story w — unbackable by construction.
  const withVirtualTarget = { ...storyGraph, "notice-board": ["library", "w"], w: [] };
  assert.deepEqual(
    checkBoundaries({ ownership, packageDeps: realPackageDeps, storyGraph: withVirtualTarget, consumedBy })
      .violations,
    [],
  );
});

test("ADR-0166: an artifact_edges entry that is not a declared depends_on edge is a misconfiguration", () => {
  // A typo'd annotation must fail LOUD — silently matching nothing would disarm the gate.
  const { violations } = checkBoundaries({
    ownership,
    packageDeps: realPackageDeps,
    storyGraph,
    consumedBy,
    artifactEdges: { "notice-board": ["drive-machinery"] }, // notice-board's depends_on is [library]
  });
  assert.equal(violations.length, 1, violations.join("\n"));
  assert.match(violations[0]!, /artifact_edges/);
  assert.match(violations[0]!, /not a declared depends_on edge/);
});

test("ADR-0166: an artifact_edges annotation on a CODE-BACKED edge is stale and rejected", () => {
  // notice-board really imports library — annotating that edge as a non-import artifact edge lies.
  const { violations } = checkBoundaries({
    ownership,
    packageDeps: realPackageDeps,
    storyGraph,
    consumedBy,
    artifactEdges: { "notice-board": ["library"] },
  });
  assert.equal(violations.length, 1, violations.join("\n"));
  assert.match(violations[0]!, /stale artifact_edges/);
});

test("ADR-0166: a story whose packages are absent from packageDeps is skipped (insufficient data)", () => {
  // Narrow fixture — only cli's deps are known; notice-board's declared library edge must not red.
  const { violations } = checkBoundaries({
    ownership,
    packageDeps: { "@storytree/cli": ["@storytree/library"] },
    storyGraph,
    consumedBy,
  });
  assert.deepEqual(violations, [], violations.join("\n"));
});

test("ADR-0166: redundantDeclaredEdges flags an unbacked redundant-transitive declared edge", () => {
  // v declares the chain head AND the transitive tail: v → a → b plus a direct v → b, no code backing.
  const rep = redundantDeclaredEdges({
    ownership: realWorld,
    storyGraph: { v: ["a", "b"], a: ["b"], b: [] },
    packageDeps: {},
  });
  assert.deepEqual(rep, { v: ["b"] });
});

test("ADR-0166: a CODE-BACKED redundant edge is required by the blocking gate — never flagged", () => {
  // The binding-staleness pattern: s declares drive-machinery AND proof-protocol; drive-machinery →
  // proof-protocol makes the edge transitively reachable, but s's own code imports proof-protocol.
  const rep = redundantDeclaredEdges({
    ownership: realWorld,
    storyGraph: {
      s: ["drive-machinery", "proof-protocol"],
      "drive-machinery": ["proof-protocol"],
      "proof-protocol": [],
    },
    packageDeps: {},
    virtualStorySources: [
      { story: "s", file: "packages/drive/src/s.ts", content: `import { anchor } from "@storytree/proof-protocol";` },
    ],
  });
  assert.deepEqual(rep, {});
});

test("ADR-0166: an artifact_edges-annotated redundant edge is suppressed (human-resolved)", () => {
  const rep = redundantDeclaredEdges({
    ownership: realWorld,
    storyGraph: { v: ["a", "b"], a: ["b"], b: [] },
    packageDeps: {},
    artifactEdges: { v: ["b"] },
  });
  assert.deepEqual(rep, {});
});

test("ADR-0166: redundancy is judged over depends_on only, not the merged consumed_by graph", () => {
  // v → b is reachable only through a provider-side consumed_by edge (v consumed_by → v→a? no:
  // a.consumed_by [v] declares v → a). The roads the forest draws are depends_on; a consumed_by
  // path must not make a depends_on edge "redundant".
  const rep = redundantDeclaredEdges({
    ownership: realWorld,
    storyGraph: { v: ["b"], a: ["b"], b: [] },
    consumedBy: { a: ["v"] }, // v → a exists only provider-side
    packageDeps: {},
  });
  assert.deepEqual(rep, {});
});

test("ADR-0166: formatRedundantReport renders the advisory WARN text", () => {
  const text = formatRedundantReport({ v: ["b"], w: ["c", "d"] });
  assert.match(text, /NON-BLOCKING/);
  assert.match(text, /redundant/i);
  assert.match(text, /"v".*b/);
  assert.match(text, /"w".*c, d/);
  assert.match(formatRedundantReport({}), /no unbacked redundant/i);
});

test("ADR-0166: artifact-annotated edges leave the drift report's unbacked list (human-resolved)", () => {
  const report = declaredEdgeDriftReport({
    ownership: realWorld,
    storyGraph: { v: ["agent"], agent: [] },
    consumedBy: {},
    packageDeps: {},
    virtualStorySources: [],
    artifactEdges: { v: ["agent"] },
  });
  assert.equal(report.byStory["v"], undefined);
});

// ===================================================================================================
// Rule 5: the HOSTED-STORY LANDLORD rule — a real-world drift incident turned into mechanical
// pushback (sibling to rule 4, ADR-0166). A story S whose unit `sourceFile`s live inside another
// story T's building (a foreign packages/<x> or apps/<x> dir) is BLOCKED unless the merged declared
// graph (depends_on ∪ inverse(consumed_by)) connects S and T in EITHER direction — the same
// either-endpoint philosophy ADR-0074 §4 already uses for code-edge coverage. This is what keeps the
// legitimate code-backed HUB pattern (notice-board's tree-view sources physically living in
// packages/cli, covered by the real cli → notice-board edge) clean while blocking a story that claims
// a neighbour's files while declaring depends_on: [] (an orphaned island in the forest render).
// ===================================================================================================

// Isolate rule 5: packageDeps: {} sidesteps rules 0/1/3/4 (their loops all key off packageDeps), and
// the real storyGraph/consumedBy above is already proven acyclic (rule 2 stays silent too) — so any
// violation observed here can only be rule 5's.
function landlordOnly(
  unitSourceFiles: Record<string, string[]>,
  dirOwners: Record<string, string>,
): string[] {
  return checkBoundaries({
    ownership,
    packageDeps: {},
    storyGraph,
    consumedBy,
    unitSourceFiles,
    dirOwners,
  } as Parameters<typeof checkBoundaries>[0]).violations;
}

test("rule 5 (landlord): a story's unit hosted in another's building with NO declared edge either way is blocked", () => {
  // studio-members claims files inside notice-board's building; storyGraph/consumedBy declare no edge
  // between studio-members and notice-board in either direction.
  const violations = landlordOnly(
    { "studio-members": ["packages/notice-board/src/a.ts", "packages/notice-board/src/b.ts"] },
    { "packages/notice-board": "notice-board" },
  );
  assert.equal(violations.length, 1, violations.join("\n")); // deduped: 2 files, 1 (S,T) pair
  assert.match(violations[0]!, /studio-members/);
  assert.match(violations[0]!, /notice-board/);
  assert.match(violations[0]!, /packages\/notice-board/);
  assert.match(violations[0]!, /packages\/notice-board\/src\/[ab]\.ts/); // ONE example file
  assert.match(violations[0]!, /depends_on/); // fix pointer names the declaration site
});

test("rule 5 (landlord): a file in the story's OWN building is never a violation", () => {
  assert.deepEqual(
    landlordOnly({ library: ["packages/library/src/foo.ts"] }, { "packages/library": "library" }),
    [],
  );
});

test("rule 5 (landlord): an UNMAPPED building (insufficient dirOwners data) is skipped, never a violation", () => {
  assert.deepEqual(landlordOnly({ library: ["packages/unknown-pkg/src/foo.ts"] }, {}), []);
});

test("rule 5 (landlord): a non packages/apps root (scripts, stories, a bare filename) is out of the boundary surface", () => {
  assert.deepEqual(
    landlordOnly(
      { library: ["scripts/foo.ts", "stories/library/story.md", "bare-file.ts"] },
      { "packages/library": "library" },
    ),
    [],
  );
});

test("rule 5 (landlord): a REVERSE declared edge (host → hosted story) covers the hosted files — the notice-board/cli hub pattern", () => {
  // notice-board's tree-view sources physically live in packages/cli; the real cli → notice-board
  // edge (declared provider-side: notice-board.consumed_by: [cli]) covers them without notice-board
  // having to declare a spurious dependency on cli.
  assert.deepEqual(
    landlordOnly({ "notice-board": ["packages/cli/src/tree-view.ts"] }, { "packages/cli": "cli" }),
    [],
  );
});

test("rule 5 (landlord): a FORWARD declared edge (hosted story → host) also covers it", () => {
  // library declares consumed_by: [cli] (cli → library); a cli-owned unit whose sourceFile happens to
  // sit in packages/library is covered by that same declared edge.
  assert.deepEqual(
    landlordOnly({ cli: ["packages/library/src/thing.ts"] }, { "packages/library": "library" }),
    [],
  );
});

test("rule 5 (landlord): distinct (S,T) pairs each yield their own violation, deduped per pair", () => {
  const violations = landlordOnly(
    {
      "studio-members": ["packages/notice-board/src/a.ts"],
      "drive-machinery": ["packages/studio-members/src/b.ts", "packages/studio-members/src/c.ts"],
    },
    { "packages/notice-board": "notice-board", "packages/studio-members": "studio-members" },
  );
  assert.equal(violations.length, 2, violations.join("\n"));
  assert.equal(violations.filter((v) => /drive-machinery/.test(v)).length, 1, violations.join("\n"));
  assert.equal(
    violations.filter((v) => /packages\/notice-board/.test(v)).length,
    1,
    violations.join("\n"),
  );
});

test("rule 5 (landlord): unitSourceFiles ABSENT skips the rule entirely, even with dirOwners present", () => {
  // Same shape as the first violation case, but unitSourceFiles is simply not passed — a narrow
  // fixture that populates only the dep-graph inputs must be unaffected (ADR-0166's own
  // insufficient-data posture; the real gatherer always passes the map).
  const { violations } = checkBoundaries({
    ownership,
    packageDeps: {},
    storyGraph,
    consumedBy,
    dirOwners: { "packages/notice-board": "notice-board" },
  } as Parameters<typeof checkBoundaries>[0]);
  assert.deepEqual(violations, []);
});

// ===================================================================================================
// The NEW packages-forward-refusal rule (ADR-0192): a sibling to rule 5, sharing its evidence
// (buildingDirOf / unitSourceFiles / dirOwners / the per-(S,T) dedup). The frozen grandfather
// register (`hostedStories`) makes rule 5's either-declared-edge escape hatch INSUFFICIENT for a
// story that isn't registered — a NEW story can no longer squat in a foreign building at all, even
// with a declared edge to the host (ADR-0192 decision 2).
// ===================================================================================================

test("packages-forward-refusal: a mapped foreign-hosting pair is refused even with a DECLARED edge, when the hosted story is NOT in the frozen register", () => {
  // studio-members's unit lives inside notice-board's building. Declare the edge here (forward, via
  // storyGraph) so rule 5 alone is SILENT about it — isolating this assertion to the NEW rule, which
  // must refuse the pair anyway because studio-members is absent from the (empty) register.
  const violations = checkBoundaries({
    ownership,
    packageDeps: {},
    storyGraph: { ...storyGraph, "studio-members": ["notice-board"] },
    consumedBy,
    unitSourceFiles: { "studio-members": ["packages/notice-board/src/a.ts"] },
    dirOwners: { "packages/notice-board": "notice-board" },
    hostedStories: [], // the frozen grandfather register — empty: nobody is grandfathered
  } as Parameters<typeof checkBoundaries>[0]).violations;

  assert.equal(
    violations.length,
    1,
    `expected exactly one packages-forward refusal despite the declared edge, got: ${violations.join("\n")}`,
  );
  assert.match(violations[0]!, /studio-members/);
  assert.match(violations[0]!, /notice-board/);
});

test("packages-forward-refusal: a REGISTERED hosted story raises no refusal (grandfathered; rule 5 governs its edge independently)", () => {
  // The notice-board/cli hub pattern with notice-board on the register: the hosting pair exists and
  // the cli → notice-board edge (consumedBy) keeps rule 5 silent — a grandfathered story is clean.
  const violations = checkBoundaries({
    ownership,
    packageDeps: {},
    storyGraph,
    consumedBy,
    unitSourceFiles: { "notice-board": ["packages/cli/src/tree-view.ts"] },
    dirOwners: { "packages/cli": "cli" },
    hostedStories: ["notice-board"],
  } as Parameters<typeof checkBoundaries>[0]).violations;
  assert.deepEqual(violations, []);
});

test("packages-forward-refusal: a STALE register entry (no hosting evidence) is itself a violation pointing at removal", () => {
  // studio-members is registered but claims no file in any foreign building — the entry must go
  // (the self-pruning migration worklist: a migration PR also shrinks the register).
  const violations = checkBoundaries({
    ownership,
    packageDeps: {},
    storyGraph,
    consumedBy,
    unitSourceFiles: { library: ["packages/library/src/foo.ts"] }, // own building — no pairs at all
    dirOwners: { "packages/library": "library" },
    hostedStories: ["studio-members"],
  } as Parameters<typeof checkBoundaries>[0]).violations;
  assert.equal(violations.length, 1, violations.join("\n"));
  assert.match(violations[0]!, /stale-register/);
  assert.match(violations[0]!, /studio-members/);
  assert.match(violations[0]!, /remove the entry/);
});

test("packages-forward-refusal: hostedStories ABSENT skips the rule entirely (narrow fixtures unaffected)", () => {
  // Identical arrangement to the refusal case above, register simply not passed: rule 6 is skipped
  // (and the declared edge keeps rule 5 silent), so the fixture is clean — absent ≠ empty.
  const violations = checkBoundaries({
    ownership,
    packageDeps: {},
    storyGraph: { ...storyGraph, "studio-members": ["notice-board"] },
    consumedBy,
    unitSourceFiles: { "studio-members": ["packages/notice-board/src/a.ts"] },
    dirOwners: { "packages/notice-board": "notice-board" },
  } as Parameters<typeof checkBoundaries>[0]).violations;
  assert.deepEqual(violations, []);
});

test("packages-forward-refusal: own-building, off-surface, and unmapped paths contribute no hosting evidence (clean under a defined register)", () => {
  // The same evidence skips rule 5 makes, proven against rule 6 with the register DEFINED (empty):
  // none of these files forms a mapped foreign-hosting pair, so nothing is refused — and an empty
  // register has no entries to go stale.
  const violations = checkBoundaries({
    ownership,
    packageDeps: {},
    storyGraph,
    consumedBy,
    unitSourceFiles: {
      library: ["packages/library/src/foo.ts", "scripts/foo.ts", "packages/unknown-pkg/src/bar.ts"],
    },
    dirOwners: { "packages/library": "library" },
    hostedStories: [],
  } as Parameters<typeof checkBoundaries>[0]).violations;
  assert.deepEqual(violations, []);
});

test("packages-forward-refusal: one refusal per (S, T) pair across multiple foreign hosts, deduped and deterministically ordered", () => {
  // studio-members hosts files in TWO foreign buildings with BOTH edges declared (rule 5 silent for
  // both) and is unregistered: exactly one refusal per (S, T) pair — 3 files, 2 pairs — ordered by
  // the sorted "S T" key (library before notice-board).
  const violations = checkBoundaries({
    ownership,
    packageDeps: {},
    storyGraph: { ...storyGraph, "studio-members": ["notice-board", "library"] },
    consumedBy,
    unitSourceFiles: {
      "studio-members": [
        "packages/notice-board/src/a.ts",
        "packages/notice-board/src/b.ts",
        "packages/library/src/c.ts",
      ],
    },
    dirOwners: { "packages/notice-board": "notice-board", "packages/library": "library" },
    hostedStories: [],
  } as Parameters<typeof checkBoundaries>[0]).violations;
  assert.equal(violations.length, 2, violations.join("\n"));
  assert.match(violations[0]!, /packages-forward refusal/);
  assert.match(violations[0]!, /packages\/library/);
  assert.match(violations[1]!, /packages-forward refusal/);
  assert.match(violations[1]!, /packages\/notice-board/);
});
