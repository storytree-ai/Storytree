import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  CHARTERED_INSTRUMENTS,
  CONTRACT_BINDING_DRIFT,
  MIRROR_PAIR_DRIFT,
  VACUOUS_PROOF,
  WARN_LIST_HYGIENE,
  analyzeGateCheck,
  evaluateDecayCeiling,
  findContractBindingDrift,
  findMirrorPairDrift,
  findOptionsFormSkips,
  findVacuousProof,
  findWarnListHygiene,
  formatDecaySweep,
  isInsideDir,
  runDecaySweep,
  type DecayFinding,
  type DecayInstrument,
  type GateCheckFacts,
  type ProofBinding,
  type SurfaceRoutes,
  type TestFileFacts,
  type WorkspaceFacts,
} from "./verification-decay.js";

/** A workspace with two real packages and an injectable set of existing files. */
function workspace(existing: readonly string[] = []): WorkspaceFacts {
  const files = new Set(existing);
  return {
    packageNames: new Set(["@storytree/cli", "@storytree/library"]),
    packageDirs: ["packages/cli", "packages/library", "packages/library-review", "apps/desktop"],
    exists: (rel) => files.has(rel),
  };
}

function binding(unitId: string, targets: ProofBinding["targets"]): ProofBinding {
  return { unitId, specPath: `stories/x/${unitId}.md`, targets };
}

describe("isInsideDir: segment-aware containment, never a bare prefix", () => {
  it("admits a real child", () => {
    assert.equal(isInsideDir("packages/cli/src/a.ts", "packages/cli"), true);
  });

  it("REFUSES a sibling that merely shares a string prefix", () => {
    // The bug this exists to avoid: `startsWith` calls library-review a member of library, and a
    // path check that silently over-matches is the class this arc fences.
    assert.equal(isInsideDir("packages/library-review/src/a.ts", "packages/library"), false);
  });

  it("refuses the directory itself and an empty dir", () => {
    assert.equal(isInsideDir("packages/cli", "packages/cli"), false);
    assert.equal(isInsideDir("packages/cli/src/a.ts", ""), false);
  });
});

describe("contract-binding-drift: what it locates", () => {
  it("flags a `pnpm --filter` naming a package no workspace provides", () => {
    const findings = findContractBindingDrift(
      [binding("u", [{ kind: "package", value: "@storytree/core", role: "the real typecheck wall" }])],
      workspace(),
    );
    assert.equal(findings.length, 1);
    assert.equal(findings[0]?.instrument, CONTRACT_BINDING_DRIFT);
    assert.match(findings[0]?.detail ?? "", /@storytree\/core/);
    // The consequence is what makes it worth reporting, so the report must carry it.
    assert.match(findings[0]?.detail ?? "", /exits 0 without running/);
  });

  it("flags a bound path that is missing AND outside every workspace package", () => {
    const findings = findContractBindingDrift(
      [binding("u", [{ kind: "path", value: "packages/core/src/proof.ts", role: "real.sourceFile" }])],
      workspace(),
    );
    assert.equal(findings.length, 1);
    assert.match(findings[0]?.detail ?? "", /packages\/core\/src\/proof\.ts/);
  });

  it("reports ONE finding per unit, however many dead targets it names", () => {
    // A spec bound to a dissolved package names it in three arms — but that is one repair, and the
    // ceiling counts repairs. Three findings here would let one stale spec eat three units of budget.
    const findings = findContractBindingDrift(
      [
        binding("u", [
          { kind: "package", value: "@storytree/core", role: "the proof command" },
          { kind: "path", value: "packages/core/src/a.test.ts", role: "real.testFile" },
          { kind: "path", value: "packages/core/src/a.ts", role: "real.sourceFile" },
          { kind: "package", value: "@storytree/core", role: "the real typecheck wall" },
        ]),
      ],
      workspace(),
    );
    assert.equal(findings.length, 1);
    const detail = findings[0]?.detail ?? "";
    assert.match(detail, /a\.test\.ts/);
    assert.match(detail, /a\.ts/);
    assert.match(detail, /@storytree\/core/);
  });
});

describe("contract-binding-drift: what it must NOT flag (the false-positive guards)", () => {
  it("is silent on a not-yet-authored test file inside a package that EXISTS", () => {
    // Ordinary net-new work: `real.testFile` is the file the leaf will author. Flagging this would
    // make the sweep fire on every honest unbuilt capability and destroy the list's readability.
    const findings = findContractBindingDrift(
      [
        binding("pending", [
          { kind: "path", value: "apps/desktop/src/backend/not-yet.test.ts", role: "real.testFile" },
        ]),
      ],
      workspace(),
    );
    assert.deepEqual(findings, []);
  });

  it("is silent on an EXISTING path that lies outside every workspace package", () => {
    // The machine-converted UAT legs of ADR-0184 legitimately bind a `stories/**` spec as their
    // source file. Judging containment alone — without existence — would flag every one of them.
    const findings = findContractBindingDrift(
      [
        binding("uat", [
          { kind: "path", value: "stories/drive-machinery/story.md", role: "real.sourceFile" },
        ]),
      ],
      workspace(["stories/drive-machinery/story.md"]),
    );
    assert.deepEqual(findings, []);
  });

  it("is silent on a live package name and a live path", () => {
    const findings = findContractBindingDrift(
      [
        binding("healthy", [
          { kind: "package", value: "@storytree/cli", role: "the proof command" },
          { kind: "path", value: "packages/cli/src/real.ts", role: "real.sourceFile" },
        ]),
      ],
      workspace(["packages/cli/src/real.ts"]),
    );
    assert.deepEqual(findings, []);
  });

  it("returns nothing at all for an empty binding set — and that is an OK, not a pass", () => {
    assert.deepEqual(findContractBindingDrift([], workspace()), []);
  });
});

describe("mirror-pair-drift: what it locates", () => {
  const surface = (name: string, routes: Record<string, string>): SurfaceRoutes => ({
    surface: name,
    routes: new Map(Object.entries(routes)),
  });
  const studio = surface("studio", {
    "/api/docs": "apps/studio/server/apiRouter.ts",
    "/api/tree": "apps/studio/server/apiRouter.ts",
    "/api/users": "apps/studio/server/apiRouter.ts",
  });
  const desktop = surface("desktop", {
    "/api/docs": "apps/desktop/src/backend/boot-read-routes.ts",
    "/api/tree": "apps/desktop/src/backend/local-backend.ts",
    "/api/chat": "apps/desktop/src/backend/chat-sse-mount.ts",
  });
  const registered = new Set(["/api/docs"]);

  it("flags a route BOTH surfaces serve that no `MIRRORS` row compares", () => {
    const findings = findMirrorPairDrift(studio, desktop, registered);
    assert.equal(findings.length, 1);
    assert.equal(findings[0]?.instrument, MIRROR_PAIR_DRIFT);
    assert.equal(findings[0]?.id, `${MIRROR_PAIR_DRIFT}:/api/tree`);
  });

  it("names BOTH files, so the reader knows where each implementation lives", () => {
    const detail = findMirrorPairDrift(studio, desktop, registered)[0]?.detail ?? "";
    assert.match(detail, /apps\/studio\/server\/apiRouter\.ts/);
    assert.match(detail, /apps\/desktop\/src\/backend\/local-backend\.ts/);
  });

  it("LOCATES, never adjudicates: it must not assert the two are REQUIRED to agree", () => {
    // `/api/me` is the case that keeps this honest — the desktop serves a constant local identity
    // where the studio serves the IAP caller's, so the two MUST differ in value. An instrument that
    // claimed "required to agree" would have adjudicated that, and been wrong about it. What it may
    // say is that two implementations exist and nothing compares them.
    const detail = findMirrorPairDrift(studio, desktop, registered)[0]?.detail ?? "";
    assert.match(detail, /two independent implementations/);
    assert.match(detail, /no observer/);
    assert.doesNotMatch(detail, /required to agree/);
  });

  it("reports one finding per route, in a stable sorted order the ceiling can count", () => {
    const many = surface("desktop", {
      "/api/tree": "d.ts",
      "/api/users": "d.ts",
      "/api/docs": "d.ts",
    });
    const ids = findMirrorPairDrift(studio, many, registered).map((f) => f.id);
    assert.deepEqual(ids, [`${MIRROR_PAIR_DRIFT}:/api/tree`, `${MIRROR_PAIR_DRIFT}:/api/users`]);
  });
});

describe("mirror-pair-drift: what it must NOT flag (the false-positive guards)", () => {
  const surface = (name: string, routes: Record<string, string>): SurfaceRoutes => ({
    surface: name,
    routes: new Map(Object.entries(routes)),
  });

  it("is silent on a route only the REFERENCE serves — one implementation cannot drift from itself", () => {
    const findings = findMirrorPairDrift(
      surface("studio", { "/api/users": "s.ts" }),
      surface("desktop", { "/api/tree": "d.ts" }),
      new Set(),
    );
    assert.deepEqual(findings, []);
  });

  it("is silent on a route only the MIRROR serves", () => {
    const findings = findMirrorPairDrift(
      surface("studio", { "/api/users": "s.ts" }),
      surface("desktop", { "/api/users": "d.ts", "/api/forest/write": "d.ts" }),
      new Set(["/api/users"]),
    );
    assert.deepEqual(findings, []);
  });

  it("THE BOUNDARY GUARD: it is silent on every REGISTERED pair, never re-deriving `MIRRORS`", () => {
    // The whole design constraint (ADR-0251's reconciliation with ADR-0252). `check:mirror-conformance`
    // proves a registered pair EXACTLY and BLOCKS — an equality assertion with no false-positive
    // surface. Re-deriving that here would be both redundant and wrong-postured: this instrument's
    // target is the registry's SILENCE, not its contents.
    const both = { "/api/docs": "f.ts", "/api/tree": "f.ts" };
    const findings = findMirrorPairDrift(
      surface("studio", both),
      surface("desktop", both),
      new Set(["/api/docs", "/api/tree"]),
    );
    assert.deepEqual(findings, []);
  });

  it("returns nothing for two empty route tables — the caller, not the rule, must refuse a vacuous sweep", () => {
    // A rule that cannot distinguish "no pairs" from "the enumeration broke" is why the disk loader
    // THROWS on an empty table rather than returning one: two empty tables intersect to a perfectly
    // clean report.
    assert.deepEqual(
      findMirrorPairDrift(surface("studio", {}), surface("desktop", {}), new Set()),
      [],
    );
  });
});

// ---------------------------------------------------------------------------
// vacuous-proof (ADR-0252 D1's third cheap instrument)
// ---------------------------------------------------------------------------

/** A test file's facts: options-form skips, and the names the repo's own classifier calls vouching. */
function testFile(
  filePath: string,
  optionsSkipped: Record<string, string>,
  vouching: readonly string[],
): TestFileFacts {
  return {
    path: filePath,
    optionsSkipped: new Map(Object.entries(optionsSkipped)),
    vouching: new Set(vouching),
  };
}

describe("findOptionsFormSkips: reading the skip form the repo's own classifier cannot see", () => {
  it("reads the options form on test / it / describe, quoting the gate back", () => {
    const skips = findOptionsFormSkips(
      [
        'test("a runs", () => { assert.ok(x); });',
        'test("b is gated", { skip: !DB }, () => { assert.ok(x); });',
        'it("c is gated", { todo: "pending" }, () => { assert.ok(x); });',
        'describe("d is gated", { skip: true }, () => {});',
      ].join("\n"),
      "x.test.ts",
    );
    assert.deepEqual([...skips.keys()], ["b is gated", "c is gated", "d is gated"]);
    assert.equal(skips.get("b is gated"), "skip: !DB");
  });

  it("does NOT read a literal `skip: false` as a skip — it skips nothing", () => {
    // The false-positive this exclusion prevents: `nvidia-trellis.test.ts` writes
    // `skip: liveEnabled ? false : "…"`, so in this corpus the value is an EXPRESSION far more often
    // than a bare `true`. A rule keyed on the key's mere presence would flag a test that always runs.
    const skips = findOptionsFormSkips(
      'test("always runs", { skip: false, concurrency: 2 }, () => { assert.ok(x); });',
      "x.test.ts",
    );
    assert.deepEqual([...skips.keys()], []);
  });

  it("does NOT read the `.skip` MODIFIER — that form is already VISIBLE to the classifier", () => {
    // The boundary: this instrument's subject is the INVISIBLE skip. `test.skip(…)` is exactly what
    // `analyzeObservedTests` does parse, so flagging it would re-derive what ADR-0126 already sees.
    const skips = findOptionsFormSkips(
      ['test.skip("modifier", () => { assert.ok(x); });', 'it.todo("todo modifier");'].join("\n"),
      "x.test.ts",
    );
    assert.deepEqual([...skips.keys()], []);
  });

  it("ignores an options object on a call that is not a test declaration", () => {
    const skips = findOptionsFormSkips(
      'request("/api/x", { skip: true }, () => {});\nconfigure("y", { skip: !DB });',
      "x.test.ts",
    );
    assert.deepEqual([...skips.keys()], []);
  });
});

describe("vacuous-proof: what it locates", () => {
  it("locates a test skipped by the options form that the classifier calls vouching", () => {
    const findings = findVacuousProof([
      testFile("packages/a/src/x.live.test.ts", { "c-one: does the thing": "skip: !DB" }, [
        "c-one: does the thing",
      ]),
    ]);
    assert.equal(findings.length, 1);
    assert.equal(findings[0]?.instrument, VACUOUS_PROOF);
    assert.equal(findings[0]?.where, "packages/a/src/x.live.test.ts");
    assert.equal(findings[0]?.id, `${VACUOUS_PROOF}:packages/a/src/x.live.test.ts`);
    assert.match(findings[0]?.detail ?? "", /c-one: does the thing/);
    assert.match(findings[0]?.detail ?? "", /skip: !DB/);
  });

  it("emits ONE finding per FILE listing every test — the ceiling counts repairs, not mentions", () => {
    // `claim-store-grades.live.test.ts` holds four of these and they share ONE repair: the file's
    // live-gating idiom. Counting mentions would let a single file eat four units of a budget that is
    // meant to measure backlog (the granularity #949 settled).
    const findings = findVacuousProof([
      testFile(
        "packages/a/src/grades.live.test.ts",
        { one: "skip: !DB", two: "skip: !DB", three: "skip: !DB", four: "skip: !DB" },
        ["one", "two", "three", "four"],
      ),
    ]);
    assert.equal(findings.length, 1);
    assert.match(findings[0]?.detail ?? "", /^4 test\(s\)/);
  });

  it("orders findings by path so the ceiling's view of the backlog is stable run to run", () => {
    const findings = findVacuousProof([
      testFile("packages/z/src/z.test.ts", { z: "skip: !DB" }, ["z"]),
      testFile("packages/a/src/a.test.ts", { a: "skip: !DB" }, ["a"]),
    ]);
    assert.deepEqual(
      findings.map((f) => f.where),
      ["packages/a/src/a.test.ts", "packages/z/src/z.test.ts"],
    );
  });
});

describe("vacuous-proof: what it must NOT flag (the false-positive guards)", () => {
  it("does NOT flag the VISIBLE placeholder idiom — options-skipped but asserting nothing", () => {
    // `store.test.ts`'s honest shape: `if (LIVE) { suite() } else { test(…, { skip: true }, () => {}) }`.
    // The classifier reports it NOT vouching, so it can never make a contract read covered — nothing
    // is misled, and flagging it would price the very idiom that fixes this class. This is the
    // tightening that keeps both halves of the rule load-bearing.
    assert.deepEqual(
      findVacuousProof([
        testFile("packages/a/src/store.test.ts", { "parity (skipped: set DB_LIVE=1)": "skip: true" }, []),
      ]),
      [],
    );
  });

  it("does NOT flag a vouching test that carries no options-form skip", () => {
    assert.deepEqual(
      findVacuousProof([testFile("packages/a/src/x.test.ts", {}, ["c-one", "c-two"])]),
      [],
    );
  });

  it("does NOT flag an options-form skip whose name the classifier does not call vouching", () => {
    // Both halves are required. Only the INTERSECTION is the class: skipped AND read as running.
    assert.deepEqual(
      findVacuousProof([
        testFile("packages/a/src/x.test.ts", { gated: "skip: !DB" }, ["some other test"]),
      ]),
      [],
    );
  });

  it("is silent on a clean corpus", () => {
    assert.deepEqual(findVacuousProof([testFile("packages/a/src/x.test.ts", {}, [])]), []);
  });

  it("OBSERVES and never adjudicates — the detail claims no contract is falsely covered", () => {
    // The wording guard PR #956 had to learn the hard way. The adjudication this instrument is tempted
    // into is "so that contract is not really proven" — but whether ANYTHING is misled depends on the
    // story corpus, which this rule deliberately does not consult (an invisible skip on a test naming
    // no contract misleads nobody). It states two mechanical facts and stops.
    const detail =
      findVacuousProof([testFile("packages/a/src/x.test.ts", { g: "skip: !DB" }, ["g"])])[0]?.detail ?? "";
    for (const adjudication of ["falsely covered", "not proven", "is not a proof", "should not skip"]) {
      assert.ok(!detail.includes(adjudication), `detail must not adjudicate: "${adjudication}"`);
    }
    assert.match(detail, /does not parse/);
    assert.match(detail, /No static observer in this repo distinguishes them/);
  });

  it("never ESCALATES — it is an ordinary located region with a real false-positive surface", () => {
    // The escalation line is for the class the cheap half CANNOT SETTLE (a blind instrument). A
    // heuristic that over-reports by design is the definition of an ordinary finding, and an
    // escalation that fires on one would train the reader to clear it.
    const findings = findVacuousProof([
      testFile("packages/a/src/x.test.ts", { g: "skip: !DB" }, ["g"]),
      testFile("packages/b/src/y.test.ts", { h: "skip: true" }, ["h"]),
    ]);
    assert.equal(findings.length, 2);
    for (const f of findings) assert.equal(f.escalation, undefined);
    assert.deepEqual(evaluateDecayCeiling(findings, [{ name: VACUOUS_PROOF, ceiling: 2 }]).escalations, []);
  });
});

// ---------------------------------------------------------------------------
// warn-list hygiene
// ---------------------------------------------------------------------------

/** Assemble a gate check from source lines — the entry, plus any extra "imported" renderer. */
function check(script: string, entryLines: readonly string[], judge?: readonly string[]): GateCheckFacts {
  const entryFile = `packages/cli/src/${script.replace(":", "-")}.ts`;
  const sources = [{ path: entryFile, text: entryLines.join("\n") }];
  if (judge !== undefined) sources.push({ path: `packages/cli/src/${script}-gate.ts`, text: judge.join("\n") });
  return { script, entryFile, sources };
}

const TAG_DECL = 'const TAG = "[check:demo]";';
/** The `check:corpus-sync` shape: a WARN headline that states its own item count. */
const COUNTED_WARN = [
  TAG_DECL,
  "function main(): void {",
  "  console.warn(`${TAG} WARN — ${diff.missing.length} artifact(s) are missing; run the sync.`);",
  "}",
];
/** The `check:surface-coverage` shape: a WARN headline with no count, one printed line per item. */
const PER_ITEM_WARN = [
  TAG_DECL,
  "const lines: string[] = [];",
  "lines.push(`${TAG} WARN — the bijection has gaps. Advisory only.`);",
  "for (const orphan of report.orphans) lines.push(`${TAG}     ${orphan}`);",
];

describe("warn-list-hygiene: what it locates", () => {
  it("flags an advisory check whose WARN states an item count and which can never fail", () => {
    const findings = findWarnListHygiene([check("check:demo", COUNTED_WARN)]);
    assert.equal(findings.length, 1);
    const found = findings[0];
    assert.ok(found !== undefined);
    assert.equal(found.instrument, WARN_LIST_HYGIENE);
    assert.equal(found.id, `${WARN_LIST_HYGIENE}:check:demo`);
    // The report points at the ENTRY file — where a ceiling would be declared.
    assert.equal(found.where, "packages/cli/src/check-demo.ts");
    assert.match(found.detail, /states an item COUNT/);
  });

  it("flags a check whose only witness is a line emitted PER ITEM — no count anywhere", () => {
    const findings = findWarnListHygiene([check("check:demo", PER_ITEM_WARN)]);
    assert.equal(findings.length, 1, "either witness alone is sufficient evidence of a worklist");
    assert.match(findings[0]?.detail ?? "", /PER ITEM of a collection/);
  });

  it("reads the RENDERER, not only the entry — this repo splits advisory checks entrypoint/judge", () => {
    // The entry prints nothing itself; every line is built in the imported judge (`check:coverage`).
    const entry = [TAG_DECL, "for (const line of runGate().lines) console.warn(line);"];
    const findings = findWarnListHygiene([check("check:demo", entry, COUNTED_WARN)]);
    assert.equal(findings.length, 1, "a rule reading only the entry sees no output in the checks that matter");
  });

  it("orders findings by script so the ceiling's view of the backlog is stable run to run", () => {
    const findings = findWarnListHygiene([
      check("check:zebra", COUNTED_WARN),
      check("check:alpha", COUNTED_WARN),
    ]);
    assert.deepEqual(
      findings.map((f) => f.id),
      [`${WARN_LIST_HYGIENE}:check:alpha`, `${WARN_LIST_HYGIENE}:check:zebra`],
    );
  });
});

describe("warn-list-hygiene: what it must NOT flag (the false-positive guards)", () => {
  it("does not flag a check that CAN fail — a bounded worklist is the repair, not the defect", () => {
    // The `check:friction-drain` / `check:verification-decay` shape: a ceiling that exits non-zero.
    const bounded = [...COUNTED_WARN, "if (verdict.level === \"red\") process.exitCode = 1;"];
    assert.deepEqual(findWarnListHygiene([check("check:demo", bounded)]), []);
  });

  it("does not flag a check that fails via process.exit(1)", () => {
    const bounded = [...COUNTED_WARN, "if (report.breached) process.exit(1);"];
    assert.deepEqual(findWarnListHygiene([check("check:demo", bounded)]), []);
  });

  it("still flags a check whose only exit is process.exit(0) — that bounds nothing", () => {
    const unbounded = [...COUNTED_WARN, "process.exit(0);"];
    assert.equal(findWarnListHygiene([check("check:demo", unbounded)]).length, 1);
  });

  it("does not flag a SINGLE-FACT warn — nothing there can accumulate", () => {
    // The measured false positives of the untightened rule: `check:node-version`, `check:dist-drift`,
    // `check:deploy-health` each WARN about ONE fact, so a ceiling would be ceremony.
    const singleFact = [TAG_DECL, "console.warn(`${TAG} WARN — ${message}`);"];
    assert.deepEqual(findWarnListHygiene([check("check:demo", singleFact)]), []);
  });

  it("does not flag a check that never carries a WARN level", () => {
    const silent = [TAG_DECL, "console.log(`${TAG} OK — ${items.length} item(s) scanned.`);"];
    assert.deepEqual(findWarnListHygiene([check("check:demo", silent)]), []);
  });

  it("does not read WARN out of a COMMENT — only a printed literal sets the level", () => {
    // Load-bearing, not fastidious: `adr-health.ts` carries the exact string `WARN —` in a comment,
    // so a raw-text scan would call a blocking check advisory.
    const prose = [
      "// Every state here is a WARN — see ADR-0252 for why this one blocks instead.",
      TAG_DECL,
      "console.log(`${TAG} ${items.length} item(s) scanned.`);",
    ];
    assert.deepEqual(findWarnListHygiene([check("check:demo", prose)]), []);
  });

  it("does not treat a loop over NON-output literals as a per-item witness", () => {
    const noisy = [
      TAG_DECL,
      "console.warn(`${TAG} WARN — something happened`);",
      "for (const x of xs) debug(`plain ${x}`);",
    ];
    assert.deepEqual(findWarnListHygiene([check("check:demo", noisy)]), []);
  });
});

describe("warn-list-hygiene: it LOCATES and never adjudicates", () => {
  it("states only what is mechanical — never that the list is too long or needs a ceiling", () => {
    // The equivalent of `mirror-pair-drift`'s "required to agree" guard and `vacuous-proof`'s
    // "falsely covered" guard. Whether a worklist can accumulate depends on its remedy, which is the
    // adversarial pass's question: `check:agents-sync` drains to zero on one idempotent command.
    const detail = findWarnListHygiene([check("check:demo", COUNTED_WARN)])[0]?.detail ?? "";
    for (const adjudication of [
      /too long/i,
      /unreadable/i,
      /nobody reads/i,
      /has rotted/i,
      /needs a ceiling/i,
      /must have a ceiling/i,
      /should fail/i,
    ]) {
      assert.doesNotMatch(detail, adjudication);
    }
  });

  it("never escalates an ordinary located signal", () => {
    // The escalation line is reserved for the class the cheap half CANNOT settle (a blind sweep).
    for (const f of findWarnListHygiene([check("check:demo", COUNTED_WARN)])) {
      assert.equal(f.escalation, undefined);
    }
  });
});

describe("analyzeGateCheck: the three facts, read from the AST", () => {
  it("separates the level, the bound, and the witnesses", () => {
    const shape = analyzeGateCheck(check("check:demo", COUNTED_WARN).sources);
    assert.equal(shape.warns, true);
    assert.equal(shape.canFail, false);
    assert.equal(shape.witnesses.length, 1);
  });

  it("collects BOTH witnesses when a check reports a count and enumerates its items", () => {
    const shape = analyzeGateCheck(check("check:demo", [...COUNTED_WARN, ...PER_ITEM_WARN]).sources);
    assert.equal(shape.witnesses.length, 2, "the coverage/surface-coverage shape carries both");
  });
});

describe("the drain ceiling: advisory per finding, fail-closed on the COUNT", () => {
  const f = (n: number, instrument = CONTRACT_BINDING_DRIFT): DecayFinding[] =>
    Array.from({ length: n }, (_, i) => ({ instrument, id: `${instrument}${i}`, where: "w", detail: "d" }));
  const at = (ceiling: number, name = CONTRACT_BINDING_DRIFT): { name: string; ceiling: number }[] => [
    { name, ceiling },
  ];

  it("stays OK at exactly the ceiling — the baseline starts green", () => {
    assert.equal(evaluateDecayCeiling(f(5), at(5)).level, "ok");
  });

  it("reds the moment the backlog GROWS past the ceiling", () => {
    const v = evaluateDecayCeiling(f(6), at(5));
    assert.equal(v.level, "red");
    assert.equal(v.count, 6);
  });

  it("stays OK when findings are repaired below the ceiling", () => {
    assert.equal(evaluateDecayCeiling(f(2), at(5)).level, "ok");
    assert.equal(evaluateDecayCeiling([], at(5)).level, "ok");
  });

  it("reports a tally for a CLEAN instrument too, so 0/n is visible rather than absent", () => {
    const v = evaluateDecayCeiling([], at(5));
    assert.deepEqual(v.tallies, [{ instrument: CONTRACT_BINDING_DRIFT, count: 0, ceiling: 5, level: "ok" }]);
  });
});

describe("the ceiling is PER INSTRUMENT: unrelated backlogs are not fungible", () => {
  const f = (n: number, instrument: string): DecayFinding[] =>
    Array.from({ length: n }, (_, i) => ({ instrument, id: `${instrument}${i}`, where: "w", detail: "d" }));

  it("holds each instrument to its OWN ceiling, and reds only the one that grew", () => {
    const v = evaluateDecayCeiling(
      [...f(5, CONTRACT_BINDING_DRIFT), ...f(11, MIRROR_PAIR_DRIFT)],
      [
        { name: CONTRACT_BINDING_DRIFT, ceiling: 5 },
        { name: MIRROR_PAIR_DRIFT, ceiling: 10 },
      ],
    );
    assert.equal(v.level, "red");
    assert.equal(v.tallies.find((t) => t.instrument === CONTRACT_BINDING_DRIFT)?.level, "ok");
    assert.equal(v.tallies.find((t) => t.instrument === MIRROR_PAIR_DRIFT)?.level, "red");
  });

  it("THE FUNGIBILITY GUARD: repairing one instrument's signal buys NO budget for another", () => {
    // Inputs → wrong outcome under a single shared total: with ceiling 15, repairing 1 stale binding
    // (5 → 4) leaves room for an 11th unobserved mirror pair, and the gate stays green over a repo
    // that grew a new unobserved mirror. The two backlogs have nothing to do with each other, and a
    // budget one can discharge from the other stops measuring either.
    const v = evaluateDecayCeiling(
      [...f(4, CONTRACT_BINDING_DRIFT), ...f(11, MIRROR_PAIR_DRIFT)],
      [
        { name: CONTRACT_BINDING_DRIFT, ceiling: 5 },
        { name: MIRROR_PAIR_DRIFT, ceiling: 10 },
      ],
    );
    assert.equal(v.count, 15, "the shared total is unchanged at 15 …");
    assert.equal(v.ceiling, 15, "… and equal to the summed ceilings, so one total would pass");
    assert.equal(v.level, "red", "but the instrument that GREW is still red");
  });

  it("A NEW INSTRUMENT'S honest baseline does NOT red the gate", () => {
    // The other half of why the ceiling had to split. ADR-0252 charters FOUR instruments; under one
    // shared total each new one arrives carrying its whole baseline as growth and reds on landing —
    // so the cheapest way to add an instrument is to weaken it until it finds little. A mechanism
    // that pays you to look less is the failure this arc exists to fence.
    const v = evaluateDecayCeiling(
      [...f(5, CONTRACT_BINDING_DRIFT), ...f(10, MIRROR_PAIR_DRIFT)],
      [
        { name: CONTRACT_BINDING_DRIFT, ceiling: 5 },
        { name: MIRROR_PAIR_DRIFT, ceiling: 10 },
      ],
    );
    assert.equal(v.level, "ok");
    assert.equal(v.count, 15);
  });

  it("holds a finding from an UNDECLARED instrument to zero — unattributed backlog fails closed", () => {
    const v = evaluateDecayCeiling(f(1, "stowaway"), [{ name: CONTRACT_BINDING_DRIFT, ceiling: 5 }]);
    assert.equal(v.level, "red");
    assert.equal(v.tallies.find((t) => t.instrument === "stowaway")?.ceiling, 0);
  });

  it("the RED report names the breached instrument and says another's repair cannot clear it", () => {
    const instruments: DecayInstrument[] = [
      { name: CONTRACT_BINDING_DRIFT, ceiling: 5, locates: "…", run: () => f(1, CONTRACT_BINDING_DRIFT) },
      { name: MIRROR_PAIR_DRIFT, ceiling: 0, locates: "…", run: () => f(1, MIRROR_PAIR_DRIFT) },
    ];
    const text = formatDecaySweep(runDecaySweep(instruments), instruments).lines.join("\n");
    assert.match(text, /mirror-pair-drift: 1 located, ceiling 0/);
    assert.match(text, /repairing another instrument's signal cannot\s+clear it/);
    assert.match(text, /contract-binding-drift \(1\/5\)/, "the healthy instrument still scores against its own");
  });
});

describe("the sweep runner and its report", () => {
  const inst = (name: string, run: () => DecayFinding[], ceiling = 5): DecayInstrument => ({
    name,
    ceiling,
    locates: `what ${name} locates`,
    run,
  });

  it("fences a THROWING instrument to itself, as a finding — a sweep that stops sweeping proves nothing", () => {
    const verdict = runDecaySweep([
      inst("boom", () => {
        throw new Error("disk gone");
      }),
      inst("fine", () => []),
    ]);
    assert.match(verdict.findings[0]?.detail ?? "", /disk gone/);
    assert.match(verdict.findings[0]?.detail ?? "", /swept nothing/);
    // It is NOT backlog: a blind instrument located nothing, so it must not consume drain budget.
    assert.equal(verdict.count, 0);
  });

  it("never exits and never throws — it returns the decision for the caller to act on", () => {
    const verdict = runDecaySweep([inst("a", () => f1("a"), 0), inst("b", () => f1("b"), 0)]);
    assert.equal(verdict.count, 2);
    assert.equal(verdict.level, "red");
  });

  it("OK report names the instruments that actually ran, so silence is attributable", () => {
    const instruments = [inst("a", () => [])];
    const { failed, lines } = formatDecaySweep(runDecaySweep(instruments), instruments);
    assert.equal(failed, false);
    assert.match(lines.join("\n"), /OK/);
    assert.match(lines.join("\n"), /1 instrument\(s\): a/);
  });

  it("WARN report states the two-phase discipline — a located region is not an established defect", () => {
    const instruments = [inst("a", () => f1("a"))];
    const { failed, lines } = formatDecaySweep(runDecaySweep(instruments), instruments);
    const text = lines.join("\n");
    assert.equal(failed, false, "a finding within the ceiling must not fail the gate");
    assert.match(text, /WARN/);
    assert.match(text, /LOCATE regions; they do not establish defects/);
    assert.match(text, /inputs → wrong outcome/);
    // The instrument's own false-positive surface has to reach the reader.
    assert.match(text, /what a locates/);
  });

  it("RED report fails and says how to return to green", () => {
    const instruments = [inst("a", () => [...f1("a", "x"), ...f1("a", "y")], 1)];
    const { failed, lines } = formatDecaySweep(runDecaySweep(instruments), instruments);
    assert.equal(failed, true);
    assert.match(lines.join("\n"), /RED/);
    assert.match(lines.join("\n"), /raise that instrument's `ceiling`/);
  });

  function f1(instrument: string, id = instrument): DecayFinding[] {
    return [{ instrument, id, where: "w", detail: "d" }];
  }
});

describe("the escalation backstop (ADR-0252 D1): the continuous half can force the question", () => {
  const inst = (name: string, run: () => DecayFinding[], ceiling = 5): DecayInstrument => ({
    name,
    ceiling,
    locates: `what ${name} locates`,
    run,
  });
  const blind = (name = CONTRACT_BINDING_DRIFT, ceiling = 5): DecayInstrument =>
    inst(
      name,
      () => {
        throw new Error("loadNodeSpec shape changed");
      },
      ceiling,
    );
  const located = (id: string): DecayFinding => ({
    instrument: CONTRACT_BINDING_DRIFT,
    id,
    where: "w",
    detail: "d",
  });

  it("THE RED: a dead instrument fails the gate that a green backlog would otherwise pass", () => {
    // Inputs → wrong outcome, measured on the pre-change code: the sole registered instrument throws
    // (its spec enumeration raises), so it sweeps zero specs. Before the backstop, the failure was
    // filed as ONE ordinary signal — count 1, ceiling 5 — and the gate printed
    // "WARN … within the drain ceiling" and EXITED 0. A green gate over a blind sweep: the exact
    // can-never-go-red class this arc exists to fence, inside the instrument built to fence it.
    const instruments = [blind()];
    const verdict = runDecaySweep(instruments);
    const { failed, lines } = formatDecaySweep(verdict, instruments);

    assert.equal(failed, true, "a blind sweep must never exit green");
    assert.equal(verdict.escalations.length, 1);
    const text = lines.join("\n");
    assert.match(text, /ESCALATED/);
    assert.doesNotMatch(text, /WARN/, "a blind sweep is not a backlog warning");
  });

  it("names the required response as a FRESH-SESSION pass, not a repair", () => {
    const instruments = [blind()];
    const text = formatDecaySweep(runDecaySweep(instruments), instruments).lines.join("\n");
    assert.match(text, /FRESH SESSION/);
    assert.match(text, /verification-decay-detection/);
    // The remedy must not read as "drain an item" — that is the ceiling's remedy, not this one.
    assert.match(text, /Raising the drain ceiling CANNOT clear an escalation/);
  });

  it("CANNOT be cleared by raising the ceiling — the two mechanisms are independent", () => {
    // The load-bearing property. Raising an instrument's ceiling is a legitimate documented move for
    // real backlog growth; if it also discharged escalations, the backstop would be defeated by the
    // routine operation of its neighbour — the "gaming the D3 ceiling" failure mode arriving by
    // accident. Proved at an absurd ceiling so no arithmetic coincidence can carry it.
    const instruments = [blind(CONTRACT_BINDING_DRIFT, Number.MAX_SAFE_INTEGER)];
    const verdict = runDecaySweep(instruments);
    assert.equal(verdict.level, "ok", "the ceiling itself is satisfied");
    assert.equal(formatDecaySweep(verdict, instruments).failed, true, "and the gate still fails");
  });

  it("is not merely the ceiling renamed: a ceiling RED carries no escalation", () => {
    const instruments = [inst(CONTRACT_BINDING_DRIFT, () => [located("x"), located("y")], 1)];
    const verdict = runDecaySweep(instruments);
    assert.equal(verdict.level, "red");
    assert.deepEqual(verdict.escalations, []);
    const text = formatDecaySweep(verdict, instruments).lines.join("\n");
    assert.doesNotMatch(text, /ESCALATED/);
    assert.match(text, /raise that instrument's `ceiling`/, "the ceiling's own remedy is unchanged");
  });

  it("reports BOTH independently when a blind instrument sits beside a breached ceiling", () => {
    const instruments = [blind("gone"), inst(CONTRACT_BINDING_DRIFT, () => [located("x"), located("y")], 1)];
    const verdict = runDecaySweep(instruments);
    assert.equal(verdict.count, 2, "the ceiling counts located regions only");
    assert.equal(verdict.escalations.length, 1);
    const text = formatDecaySweep(verdict, instruments).lines.join("\n");
    assert.match(text, /ESCALATED/);
    assert.match(text, /RED/);
  });

  it("THE FALSE-POSITIVE GUARD: an ordinary located signal NEVER escalates", () => {
    // The bar is deliberately narrow. An escalation that fires on ordinary backlog would train the
    // reader to clear it, which is precisely how it would stop being a backstop.
    const instruments = [inst(CONTRACT_BINDING_DRIFT, () => [located("x")])];
    const verdict = runDecaySweep(instruments);
    assert.deepEqual(verdict.escalations, []);
    assert.equal(formatDecaySweep(verdict, instruments).failed, false);
  });

  it("a healthy sweep stays OK and still says so", () => {
    const instruments = [inst(CONTRACT_BINDING_DRIFT, () => [])];
    const { failed, lines } = formatDecaySweep(runDecaySweep(instruments), instruments);
    assert.equal(failed, false);
    assert.match(lines.join("\n"), /OK/);
  });
});

describe("chartered coverage: an unswept instrument is a machine fact, not a source comment", () => {
  const inst = (name: string): DecayInstrument => ({ name, ceiling: 5, locates: "…", run: () => [] });

  it("names every chartered instrument that is NOT registered, on a clean run", () => {
    const instruments = [inst(CONTRACT_BINDING_DRIFT)];
    const { failed, lines } = formatDecaySweep(runDecaySweep(instruments), instruments);
    const text = lines.join("\n");
    assert.equal(failed, false, "an unbuilt instrument is an absence, not a signal — it must not red");
    assert.match(text, /chartered coverage: 1\/4/);
    assert.match(text, /mirror-pair-drift/);
    assert.match(text, /vacuous-proof/);
    assert.match(text, /warn-list-hygiene/);
    assert.match(text, /Silence over an unswept instrument is not evidence/);
  });

  it("reports full coverage once every chartered instrument is registered", () => {
    const instruments = CHARTERED_INSTRUMENTS.map(inst);
    const text = formatDecaySweep(runDecaySweep(instruments), instruments).lines.join("\n");
    assert.match(text, /chartered coverage: 4\/4/);
    assert.doesNotMatch(text, /NOT swept/);
  });

  it("the roster is exactly ADR-0252 D1's four cheap instruments", () => {
    assert.equal(CHARTERED_INSTRUMENTS.length, 4);
    // The exported slugs must stay JOINED to the roster: an instrument registered under a name the
    // roster does not carry would sweep while still being reported as NOT swept.
    for (const slug of [CONTRACT_BINDING_DRIFT, MIRROR_PAIR_DRIFT, VACUOUS_PROOF, WARN_LIST_HYGIENE]) {
      assert.ok(CHARTERED_INSTRUMENTS.includes(slug), `roster is missing ${slug}`);
    }
  });
});
