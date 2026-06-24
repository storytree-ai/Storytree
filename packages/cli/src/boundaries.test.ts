import { test } from "node:test";
import assert from "node:assert/strict";

import {
  checkBoundaries,
  classOf,
  extractImports,
  findCycle,
  isFoundational,
  isTestScaffolding,
  mergeDeclaredGraph,
  storyOf,
  stripComments,
  type Ownership,
  type SourceImport,
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
  "notice-board": ["library", "drive-machinery"],
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
  "@storytree/notice-board": [],
  "@storytree/studio-members": [],
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
  // studio-members importing notice-board with no declaration → caught.
  const packageDeps = { "@storytree/studio-members": ["@storytree/notice-board"] };
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
