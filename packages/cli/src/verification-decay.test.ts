import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { extractVouchingTestNames } from "@storytree/orchestrator";

import { attributeDecayFindings } from "./decay-attribution.js";
import { DECISION_SOURCE_DRIFT } from "./decision-source-decay.js";
import {
  CHARTERED_INSTRUMENTS,
  CONTRACT_BINDING_DRIFT,
  classifyTarget,
  MIRROR_PAIR_DRIFT,
  UNPROVEN_SEAM_DEFAULT,
  VACUOUS_PROOF,
  WARN_LIST_HYGIENE,
  analyzeGateCheck,
  codeIdentifiers,
  evaluateDecayCeiling,
  extractSeamDefaults,
  findContractBindingDrift,
  findMirrorPairDrift,
  findOptionsFormSkips,
  findUnprovenSeamDefault,
  findVacuousProof,
  findWarnListHygiene,
  formatDecaySweep,
  isInsideDir,
  requireObserved,
  runDecaySweep,
  type DecayFinding,
  type DecayInstrument,
  type GateCheckFacts,
  type ProofBinding,
  type SeamDefaultFacts,
  type SurfaceRoutes,
  type TestFileFacts,
  type WorkspaceFacts,
} from "./verification-decay.js";

/**
 * A workspace with two real packages, an injectable set of existing files, and an injectable set of
 * paths that ever existed in history.
 *
 * `historical` DEFAULTS TO EMPTY, which is the never-written world — so every pre-existing test in
 * this file keeps asserting exactly what it asserted before the renamed/never-written split landed,
 * and any change in their verdicts would be a real regression rather than a fixture artefact.
 */
function workspace(
  existing: readonly string[] = [],
  historical: readonly string[] = [],
): WorkspaceFacts {
  const files = new Set(existing);
  const history = new Set(historical);
  return {
    packageNames: new Set(["@storytree/cli", "@storytree/library"]),
    packageDirs: ["packages/cli", "packages/library", "packages/library-review", "apps/desktop"],
    exists: (rel) => files.has(rel),
    everExisted: (rel) => history.has(rel),
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

describe("classifyTarget: a renamed binding is distinguishable from a never-written one", () => {
  const missingInPackage = "packages/cli/src/moved-away.test.ts";

  it("calls a missing in-package path RENAMED when it has history", () => {
    assert.equal(
      classifyTarget(
        { kind: "path", value: missingInPackage, role: "real.testFile" },
        workspace([], [missingInPackage]),
      ),
      "renamed",
    );
  });

  it("calls the SAME path PENDING when it has no history", () => {
    // The discrimination in one pair: identical workspace, identical path, opposite verdicts —
    // and the only thing that differs is history. Before this split both answered "not dead".
    assert.equal(
      classifyTarget(
        { kind: "path", value: missingInPackage, role: "real.testFile" },
        workspace([], []),
      ),
      "pending",
    );
  });

  it("calls an existing path LIVE, and never consults history to override existence", () => {
    const facts: WorkspaceFacts = {
      ...workspace([missingInPackage], []),
      everExisted: () => {
        throw new Error("history must not be consulted for a path that exists");
      },
    };
    assert.equal(
      classifyTarget({ kind: "path", value: missingInPackage, role: "real.testFile" }, facts),
      "live",
    );
  });

  it("still calls a missing path OUTSIDE every package DEAD, history or not", () => {
    // Containment, not history, is what separates dead from the in-package pair — a path outside
    // every package has no owning package to be pending work for.
    for (const history of [[], ["packages/core/src/gone.ts"]]) {
      assert.equal(
        classifyTarget(
          { kind: "path", value: "packages/core/src/gone.ts", role: "real.sourceFile" },
          workspace([], history),
        ),
        "dead",
      );
    }
  });
});

describe("contract-binding-drift: the renamed suite is reported, and reported as its own repair", () => {
  const moved = "packages/cli/src/moved-away.test.ts";

  it("flags a renamed binding that the old exemption swallowed", () => {
    const findings = findContractBindingDrift(
      [binding("renamed", [{ kind: "path", value: moved, role: "real.testFile" }])],
      workspace([], [moved]),
    );
    assert.equal(findings.length, 1);
    assert.match(findings[0]?.detail ?? "", /moved-away\.test\.ts/);
  });

  it("names the RIGHT repair, and the `--real` hazard that makes it urgent", () => {
    // A reader who cannot tell renamed from never-written does the wrong repair: a `--real` rebuild
    // AUTHORS the file the stale path names, producing a second suite beside the real one.
    const detail =
      findContractBindingDrift(
        [binding("renamed", [{ kind: "path", value: moved, role: "real.testFile" }])],
        workspace([], [moved]),
      )[0]?.detail ?? "";
    assert.match(detail, /renamed or deleted/);
    assert.match(detail, /re-point the binding/);
    assert.match(detail, /second suite/);
  });

  it("does not report a renamed target with the DEAD phrasing", () => {
    const detail =
      findContractBindingDrift(
        [binding("renamed", [{ kind: "path", value: moved, role: "real.testFile" }])],
        workspace([], [moved]),
      )[0]?.detail ?? "";
    assert.doesNotMatch(detail, /outside every workspace package/);
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

  it("spells a title EXACTLY as ADR-0126's classifier does, so the vacuous-proof join holds", () => {
    // The coupling this instrument rests on: `findVacuousProof` matches these names against
    // `extractVouchingTestNames`'s output. A title shape only ONE of the two readers understands
    // makes the join miss silently — the instrument reports nothing and still looks healthy. This
    // used to be kept true by a hand-copied reader; it is now the same function, and this pins it.
    const src = [
      'test("gated-contract: a title split " + "across two literals",',
      "     { skip: !DB }, () => { assert.equal(actual, expected); });",
    ].join("\n");
    const skipped = [...findOptionsFormSkips(src, "x.test.ts").keys()];
    // Both readers must produce the SAME string for the join to land…
    assert.deepEqual(skipped, ["gated-contract: a title split across two literals"]);
    // …which is only checkable against the other reader itself. (The options-form skip is invisible
    // to `analyzeObservedTests` by design, ADR-0126's named blind spot, so it reads as vouching.)
    assert.deepEqual(extractVouchingTestNames(src), skipped);
    // And the finding the join produces is actually emitted, end to end.
    const findings = findVacuousProof([
      testFile("x.test.ts", { "gated-contract: a title split across two literals": "skip: !DB" }, skipped),
    ]);
    assert.equal(findings.length, 1);
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
    // adversarial pass's question — and the answer is not inferable from the source this rule reads:
    // `check:agents-sync` looked like a list that could not accumulate and was measured otherwise.
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
    assert.deepEqual(v.tallies, [
      { instrument: CONTRACT_BINDING_DRIFT, count: 0, ceiling: 5, authored: 0, inherited: 0, level: "ok" },
    ]);
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
    // The RED line carries the authorship split since ADR-0301 — with no attribution supplied every
    // signal is charged, so `1 yours` here IS the fail-closed default rather than a measured verdict.
    assert.match(text, /mirror-pair-drift: 1 located \(1 yours\), ceiling 0/);
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

describe("requireObserved: an empty enumeration is a BLIND instrument, never a clean one", () => {
  const inst = (name: string, run: () => DecayFinding[], ceiling = 5): DecayInstrument => ({
    name,
    ceiling,
    locates: `what ${name} locates`,
    run,
  });

  it("THE RED: a loader that enumerated NOTHING escalates instead of reporting a clean sweep", () => {
    // Inputs → wrong outcome, MEASURED on the pre-change code against the real
    // `pnpm check:verification-decay` by pointing `storiesDir` at a path that does not exist:
    // `loadProofBindings` returned [], `findContractBindingDrift` produced 0 findings, and the sweep
    // printed "WARN — 23 located signal(s), every instrument within its own drain ceiling" plus
    // "chartered coverage: 4/4 … are sweeping" and EXITED 0. The located count went DOWN (28 → 23), so
    // an instrument that read zero specs made the repo look cleaner. Blinding any of the three GUARDED
    // loaders the same way printed ESCALATED and exited 1 — same failure, opposite verdicts.
    const instruments = [
      inst(CONTRACT_BINDING_DRIFT, () => {
        requireObserved(0, "no unit spec parsed under stories");
        return [];
      }),
    ];
    const verdict = runDecaySweep(instruments);
    const { failed, lines } = formatDecaySweep(verdict, instruments);

    assert.equal(failed, true, "an instrument that observed nothing must never exit green");
    assert.equal(verdict.escalations.length, 1);
    assert.match(lines.join("\n"), /ESCALATED/);
  });

  it("carries the empty enumeration's own message into the report, so it says WHAT went blind", () => {
    const instruments = [
      inst(MIRROR_PAIR_DRIFT, () => {
        requireObserved(0, "studio: no /api/* dispatch found in apps/studio/server");
        return [];
      }),
    ];
    const text = formatDecaySweep(runDecaySweep(instruments), instruments).lines.join("\n");
    assert.match(text, /no \/api\/\* dispatch found in apps\/studio\/server/);
    assert.match(text, /proved nothing/);
  });

  it("THE FALSE-POSITIVE GUARD: observing facts and finding NOTHING WRONG is healthy and stays green", () => {
    // The distinction the threshold turns on. `observed` counts the ENUMERATION, never the findings —
    // an instrument that read 400 specs and found no drift is exactly what a repaired repo looks like,
    // and redding there would fire the backstop on the state the sweep exists to certify.
    const instruments = [
      inst(CONTRACT_BINDING_DRIFT, () => {
        requireObserved(400, "unreachable");
        return [];
      }),
    ];
    const verdict = runDecaySweep(instruments);
    assert.deepEqual(verdict.escalations, []);
    assert.equal(formatDecaySweep(verdict, instruments).failed, false);
  });

  it("does not throw for any non-zero enumeration, however small", () => {
    // One observed fact is a sweep that ran. The rule is blindness, not thinness.
    assert.doesNotThrow(() => requireObserved(1, "x"));
    assert.throws(() => requireObserved(0, "x"), /proved nothing/);
  });
});

describe("chartered coverage: an unswept instrument is a machine fact, not a source comment", () => {
  const inst = (name: string): DecayInstrument => ({ name, ceiling: 5, locates: "…", run: () => [] });

  it("names every chartered instrument that is NOT registered, on a clean run", () => {
    const instruments = [inst(CONTRACT_BINDING_DRIFT)];
    const { failed, lines } = formatDecaySweep(runDecaySweep(instruments), instruments);
    const text = lines.join("\n");
    assert.equal(failed, false, "an unbuilt instrument is an absence, not a signal — it must not red");
    assert.match(text, /chartered coverage: 1\/6/);
    assert.match(text, /mirror-pair-drift/);
    assert.match(text, /vacuous-proof/);
    assert.match(text, /warn-list-hygiene/);
    assert.match(text, /unproven-seam-default/);
    assert.match(text, /decision-source-drift/);
    assert.match(text, /Silence over an unswept instrument is not evidence/);
  });

  it("reports full coverage once every chartered instrument is registered", () => {
    const instruments = CHARTERED_INSTRUMENTS.map(inst);
    const text = formatDecaySweep(runDecaySweep(instruments), instruments).lines.join("\n");
    assert.match(text, /chartered coverage: 6\/6/);
    assert.doesNotMatch(text, /NOT swept/);
  });

  it("the roster is ADR-0252 D1's four, plus ADR-0278's fifth and ADR-0424's sixth", () => {
    assert.equal(CHARTERED_INSTRUMENTS.length, 6);
    // The exported slugs must stay JOINED to the roster: an instrument registered under a name the
    // roster does not carry would sweep while still being reported as NOT swept. `DECISION_SOURCE_DRIFT`
    // is imported from its own module rather than declared here for exactly that reason — the roster
    // carries the literal (importing the const would cycle, since that module imports `DecayFinding`
    // from this one), so this assertion is the only thing joining the two spellings.
    for (const slug of [
      CONTRACT_BINDING_DRIFT,
      MIRROR_PAIR_DRIFT,
      VACUOUS_PROOF,
      WARN_LIST_HYGIENE,
      UNPROVEN_SEAM_DEFAULT,
      DECISION_SOURCE_DRIFT,
    ]) {
      assert.ok(CHARTERED_INSTRUMENTS.includes(slug), `roster is missing ${slug}`);
    }
  });
});

// ---------------------------------------------------------------------------
// unproven-seam-default (ADR-0278)
// ---------------------------------------------------------------------------

/** One file's seam defaults, in the shape the loader produces. */
function seamFile(
  filePath: string,
  defaults: Readonly<Record<string, readonly string[]>>,
): SeamDefaultFacts {
  return { path: filePath, defaults: new Map(Object.entries(defaults)) };
}

describe("unproven-seam-default: what it locates", () => {
  it("locates a fallback symbol that appears in no test file", () => {
    const findings = findUnprovenSeamDefault(
      [seamFile("packages/a/src/branch.ts", { builtinFakeGit: [] })],
      new Set(["somethingElse"]),
    );
    assert.equal(findings.length, 1);
    assert.equal(findings[0]?.instrument, UNPROVEN_SEAM_DEFAULT);
    assert.equal(findings[0]?.where, "packages/a/src/branch.ts");
    assert.equal(findings[0]?.id, `${UNPROVEN_SEAM_DEFAULT}:packages/a/src/branch.ts:builtinFakeGit`);
    assert.match(findings[0]?.detail ?? "", /builtinFakeGit/);
  });

  it("stays SILENT on a default some test names — the drain is what clears it", () => {
    // The instrument's own validation case: `builtinFakeRealpath` was covered in this same landing, and
    // `defaultFakeIo` was already driven by `worktree-idle-signal.test.ts`. Both must go quiet,
    // or the backlog can never be drained and the ceiling stops meaning anything.
    const findings = findUnprovenSeamDefault(
      [seamFile("packages/a/src/write-authority.ts", { builtinFakeRealpath: [] })],
      new Set(["builtinFakeRealpath"]),
    );
    assert.deepEqual(findings, []);
  });

  it("emits ONE finding per SYMBOL, because a file may carry more than one seam", () => {
    const findings = findUnprovenSeamDefault(
      [seamFile("packages/a/src/branch.ts", { builtinFakeGit: [], builtinFakeName: [] })],
      new Set(),
    );
    assert.equal(findings.length, 2);
    // Ids differ, or the ceiling would count two backlog items as one.
    assert.notEqual(findings[0]?.id, findings[1]?.id);
  });

  it("names the untested ARMS of an object seam without counting them separately", () => {
    // Covering the object is what covers the arms, so counting both would inflate the backlog against
    // its own ceiling — but a drain still needs to know which arms exist (`defaultRemoveDir`'s win32
    // branch is the thin instance).
    const findings = findUnprovenSeamDefault(
      [seamFile("packages/a/src/worktree.ts", { defaultFakeIo: ["fakeStatMtime"] })],
      new Set(),
    );
    assert.equal(findings.length, 1);
    assert.match(findings[0]?.detail ?? "", /1 equally untested arm\(s\): fakeStatMtime/);
  });

  it("omits an arm that IS tested, so a partial drain is visible in the detail", () => {
    const findings = findUnprovenSeamDefault(
      [seamFile("packages/a/src/worktree.ts", { defaultFakeIo: ["a", "b"] })],
      new Set(["a"]),
    );
    assert.equal(findings.length, 1);
    assert.match(findings[0]?.detail ?? "", /1 equally untested arm\(s\): b/);
  });

  it("orders findings by path then symbol so the ceiling's view is stable run to run", () => {
    const findings = findUnprovenSeamDefault(
      [
        seamFile("packages/z/src/z.ts", { zeta: [] }),
        seamFile("packages/a/src/a.ts", { beta: [], alpha: [] }),
      ],
      new Set(),
    );
    assert.deepEqual(
      findings.map((f) => f.id),
      [
        `${UNPROVEN_SEAM_DEFAULT}:packages/a/src/a.ts:alpha`,
        `${UNPROVEN_SEAM_DEFAULT}:packages/a/src/a.ts:beta`,
        `${UNPROVEN_SEAM_DEFAULT}:packages/z/src/z.ts:zeta`,
      ],
    );
  });

  it("never escalates — locating a default is an obligation to LOOK, not a defect", () => {
    const findings = findUnprovenSeamDefault(
      [seamFile("packages/a/src/x.ts", { defaultThing: [] })],
      new Set(),
    );
    assert.equal(findings[0]?.escalation, undefined);
  });
});

describe("unproven-seam-default: the coverage oracle", () => {
  it("REGRESSION: a symbol named only in a COMMENT does not count as covered", () => {
    // Measured, not feared: this file's own tests named `builtinRunGit`, `defaultWorktreeCreateIo`
    // and `defaultRemoveDir`, and a raw identifier scan read all three as covered and went silent on
    // three genuine findings. Documenting a finding must not discharge it.
    //
    // The strip fixes the COMMENT and STRING cases. It cannot fix a real symbol used as live code —
    // `{ builtinRunGit: [] }` as a fixture KEY is genuinely code — so the fixtures below deliberately
    // use synthetic names (`builtinFakeGit`, `defaultFakeIo`). That is the discipline any test near a
    // scanned symbol must follow, and the residual is stated at the instrument: an unrelated
    // identifier collision anywhere in the suite silences that finding.
    const src = ["// see defaultRemoveDir's win32 arm", "/* and defaultWorktreeCreateIo too */", "run();"].join(
      "\n",
    );
    const names = codeIdentifiers(src);
    assert.ok(!names.includes("defaultRemoveDir"), "a comment mention must not count");
    assert.ok(!names.includes("defaultWorktreeCreateIo"), "a block-comment mention must not count");
    assert.ok(names.includes("run"), "real code must survive the strip");
  });

  it("REGRESSION: a symbol appearing only inside a STRING does not count as covered", () => {
    const src = ['const fixture = "function builtinRunGit(args) {}";', "drive(fixture);"].join("\n");
    const names = codeIdentifiers(src);
    assert.ok(!names.includes("builtinRunGit"), "a fixture string must not count");
    assert.ok(names.includes("drive"), "real code must survive the strip");
  });

  it("a symbol the test really imports and calls DOES count", () => {
    const src = ['import { builtinRealpath } from "./x.js";', "assert.equal(builtinRealpath(dir), dir);"].join(
      "\n",
    );
    assert.ok(codeIdentifiers(src).includes("builtinRealpath"));
  });

  it("a prose apostrophe does not swallow the code that follows it", () => {
    // Why comments are stripped BEFORE strings: `don't` would otherwise open a string literal and
    // eat real identifiers up to the next apostrophe, silencing them.
    const src = ["// the seam's default isn't driven here", "drivesTheRealThing();"].join("\n");
    assert.ok(codeIdentifiers(src).includes("drivesTheRealThing"));
  });
});

describe("unproven-seam-default: the aperture", () => {
  it("matches the nullish fallback form", () => {
    const src = [
      "function builtinRunGit(args) { return spawn(args); }",
      "export function branchOf(deps) {",
      "  const runGit = deps.runGit ?? builtinRunGit;",
      "}",
    ].join("\n");
    assert.deepEqual([...extractSeamDefaults(src).keys()], ["builtinRunGit"]);
  });

  it("matches the parameter-default form", () => {
    const src = [
      "export const builtinRealpath: RealpathFn = (p) => realpathSync.native(p);",
      "export function canonicalisePath(",
      "  target: string,",
      "  cwd: string,",
      "  realpath: RealpathFn = builtinRealpath,",
      "): Canonical {}",
    ].join("\n");
    assert.deepEqual([...extractSeamDefaults(src).keys()], ["builtinRealpath"]);
  });

  it("IGNORES a scalar default value — a number has no unproven behaviour", () => {
    // The first sweep located 46 by filtering only on "declared in this file", and a third were these.
    // Counting them would inflate the baseline with items no drain could ever discharge.
    const src = [
      "const DEFAULT_MAX_TURNS = 16;",
      'const DEFAULT_ACTOR = "system";',
      'const SURNAMES = ["villani", "elbakyan"];',
      "const EMPTY_KEYS = {};",
      "export function run(opts) {",
      "  const turns = opts.maxTurns ?? DEFAULT_MAX_TURNS;",
      "  const actor = opts.actor ?? DEFAULT_ACTOR;",
      "  const names = opts.names ?? SURNAMES;",
      "  const keys = opts.keys ?? EMPTY_KEYS;",
      "}",
    ].join("\n");
    assert.deepEqual([...extractSeamDefaults(src).keys()], []);
  });

  it("IGNORES a fallback whose symbol is not declared in this file", () => {
    const src = ["export function run(opts) {", "  const io = opts.io ?? importedElsewhere;", "}"].join("\n");
    assert.deepEqual([...extractSeamDefaults(src).keys()], []);
  });

  it("reads an object seam's members past a fixed window, and reports them as arms", () => {
    // REGRESSION: classifying the right-hand side from a 400-char window silently dropped
    // `defaultWorktreeIo` and `defaultWorktreeCreateIo`, whose members sit past it — an under-report,
    // which is the dangerous direction: a smaller, greener number over a sweep that looked at less.
    const filler = Array.from({ length: 40 }, (_, i) => `  // padding line ${i}`).join("\n");
    const src = [
      "function defaultStatMtimeMs(dir) { return statSync(dir).mtimeMs; }",
      "export const defaultWorktreeIo: WorktreeIo = {",
      filler,
      "  statMtimeMs: defaultStatMtimeMs,",
      "};",
      "export function prune(deps) {",
      "  const io = deps.io ?? defaultWorktreeIo;",
      "}",
    ].join("\n");
    const defaults = extractSeamDefaults(src);
    assert.deepEqual([...defaults.keys()], ["defaultWorktreeIo"]);
    assert.deepEqual(defaults.get("defaultWorktreeIo"), ["defaultStatMtimeMs"]);
  });
});

// ---------------------------------------------------------------------------
// ADR-0301: the ceiling charges BY AUTHORSHIP
// ---------------------------------------------------------------------------

describe("ADR-0301: a ceiling breached on INHERITED signals alone does not block the landing", () => {
  // `where` is keyed by INSTRUMENT as well as index: two instruments sharing a path would make one's
  // touched-file set silently attribute the other's signals, which is a fixture artefact and not a
  // property of the code under test.
  const f = (n: number, instrument = UNPROVEN_SEAM_DEFAULT): DecayFinding[] =>
    Array.from({ length: n }, (_, i) => ({
      instrument,
      id: `${instrument}${i}`,
      where: `${instrument}-w${i}.ts`,
      detail: `d${i}`,
    }));
  const at = (ceiling: number, name = UNPROVEN_SEAM_DEFAULT): { name: string; ceiling: number }[] => [
    { name, ceiling },
  ];
  /** Attribute the named ids as inherited; everything else is charged. */
  const owned = (findings: readonly DecayFinding[], inheritedIds: readonly string[]) =>
    attributeDecayFindings(findings, {
      branch: "claude/mine",
      touchedFiles: new Set(findings.filter((x) => !inheritedIds.includes(x.id)).map((x) => x.where)),
      crossInput: new Map(),
      alsoAuthored: new Map(),
    });

  it("is INHERITED, not red, when the whole breach rests on files identical to the merge base", () => {
    // THE MEASURED CASE (PR #1119): `unproven-seam-default: 25 located, ceiling 24`, none of it in the
    // session's diff. Before ADR-0301 that was a RED costing ~15 minutes of stash-and-differential.
    const findings = f(25);
    const v = evaluateDecayCeiling(
      findings,
      at(24),
      owned(
        findings,
        findings.map((x) => x.id),
      ),
    );
    assert.equal(v.level, "inherited");
    assert.equal(v.tallies[0]?.authored, 0);
    assert.equal(v.tallies[0]?.inherited, 25);
    assert.equal(v.count, 25, "the located COUNT is unchanged — the aperture moved, not the number");
  });

  it("REDS when even ONE of an over-ceiling backlog is this branch's", () => {
    const findings = f(25);
    const v = evaluateDecayCeiling(
      findings,
      at(24),
      owned(
        findings,
        findings.slice(1).map((x) => x.id),
      ),
    );
    assert.equal(v.level, "red");
    assert.equal(v.tallies[0]?.authored, 1);
  });

  it("stays OK below the ceiling however the signals are attributed", () => {
    const findings = f(20);
    assert.equal(evaluateDecayCeiling(findings, at(24), owned(findings, [])).level, "ok");
    assert.equal(
      evaluateDecayCeiling(
        findings,
        at(24),
        owned(
          findings,
          findings.map((x) => x.id),
        ),
      ).level,
      "ok",
    );
  });

  it("with NO attribution supplied, reproduces the pre-ADR-0301 behaviour exactly — charged, red", () => {
    // The fail-closed default. Attribution is an addition; its absence must never become an excuse.
    const v = evaluateDecayCeiling(f(25), at(24));
    assert.equal(v.level, "red");
    assert.equal(v.tallies[0]?.authored, 25);
    assert.equal(v.tallies[0]?.inherited, 0);
  });

  it("charges a finding the attributor never classified, rather than defaulting it to inherited", () => {
    // A finding missing from `byId` is an attribution GAP. Reading a gap as inherited would let any
    // classifier bug silently empty the charge.
    const findings = f(25);
    const partial = attributeDecayFindings(findings.slice(0, 3), {
      branch: "b",
      touchedFiles: new Set(),
      crossInput: new Map(),
      alsoAuthored: new Map(),
    });
    const v = evaluateDecayCeiling(findings, at(24), partial);
    assert.equal(v.tallies[0]?.inherited, 3);
    assert.equal(v.tallies[0]?.authored, 22);
    assert.equal(v.level, "red");
  });

  it("scores each instrument's authorship SEPARATELY — an inherited breach cannot absorb an authored one", () => {
    const inheritedOnly = f(25, UNPROVEN_SEAM_DEFAULT);
    const mine = f(6, CONTRACT_BINDING_DRIFT);
    const all = [...inheritedOnly, ...mine];
    const v = evaluateDecayCeiling(
      all,
      [
        { name: UNPROVEN_SEAM_DEFAULT, ceiling: 24 },
        { name: CONTRACT_BINDING_DRIFT, ceiling: 5 },
      ],
      owned(
        all,
        inheritedOnly.map((x) => x.id),
      ),
    );
    assert.equal(v.level, "red", "the authored breach still blocks");
    assert.equal(v.tallies.find((t) => t.instrument === UNPROVEN_SEAM_DEFAULT)?.level, "inherited");
    assert.equal(v.tallies.find((t) => t.instrument === CONTRACT_BINDING_DRIFT)?.level, "red");
  });
});

describe("ADR-0301: the report answers `are these mine?` instead of leaving it to a differential", () => {
  const inst = (name: string, ceiling: number, findings: DecayFinding[]): DecayInstrument => ({
    name,
    ceiling,
    locates: "a located region",
    run: () => findings,
  });
  const f = (n: number, instrument = UNPROVEN_SEAM_DEFAULT): DecayFinding[] =>
    Array.from({ length: n }, (_, i) => ({
      instrument,
      id: `${instrument}${i}`,
      where: `w${i}.ts`,
      detail: `detail-${i}`,
    }));
  const allInherited = (findings: readonly DecayFinding[]) =>
    attributeDecayFindings(findings, {
      branch: "claude/mine",
      touchedFiles: new Set(),
      crossInput: new Map(),
      alsoAuthored: new Map(),
    });

  it("names the PRE-EXISTING BREACH as its own outcome and says the landing is NOT blocked", () => {
    // The single sentence whose absence cost ~15 minutes. A silent green here would be strictly worse
    // than the noisy red it replaces, so the WARN and the standing drain obligation are BOTH asserted.
    const findings = f(25);
    const instruments = [inst(UNPROVEN_SEAM_DEFAULT, 24, findings)];
    const verdict = runDecaySweep(instruments, () => allInherited(findings));
    const { failed, lines } = formatDecaySweep(verdict, instruments);
    const text = lines.join("\n");
    assert.equal(failed, false, "an inherited breach must not fail the gate");
    assert.match(text, /WARN/);
    assert.match(text, /OVER CEILING ON MAIN/);
    assert.match(text, /NONE of it authored by this branch/);
    assert.match(text, /Your landing is NOT blocked/);
    assert.match(text, /never a raised ceiling/, "the forbidden remedy is still named as forbidden");
  });

  it("prints every NOT YOURS signal IN FULL — a count would leave the reader to re-derive the rest", () => {
    const findings = f(3);
    const instruments = [inst(UNPROVEN_SEAM_DEFAULT, 24, findings)];
    const text = formatDecaySweep(
      runDecaySweep(instruments, () => allInherited(findings)),
      instruments,
    ).lines.join("\n");
    assert.match(text, /NOT YOURS \(3\)/);
    for (const one of findings) assert.match(text, new RegExp(one.detail));
  });

  it("splits YOURS from NOT YOURS when a breach is mixed", () => {
    const findings = f(25);
    const attribution = attributeDecayFindings(findings, {
      branch: "claude/mine",
      touchedFiles: new Set(["w0.ts"]),
      crossInput: new Map(),
      alsoAuthored: new Map(),
    });
    const instruments = [inst(UNPROVEN_SEAM_DEFAULT, 24, findings)];
    const { failed, lines } = formatDecaySweep(
      runDecaySweep(instruments, () => attribution),
      instruments,
    );
    const text = lines.join("\n");
    assert.equal(failed, true);
    assert.match(text, /YOURS \(1\):/);
    assert.match(text, /NOT YOURS \(24\)/);
    assert.match(text, /25 located \(1 yours\), ceiling 24/);
  });

  it("says so LOUDLY when attribution could not be measured, so a charge is never mistaken for a verdict", () => {
    const findings = f(25);
    const instruments = [inst(UNPROVEN_SEAM_DEFAULT, 24, findings)];
    const attribution = attributeDecayFindings(findings, {
      branch: null,
      touchedFiles: new Set(),
      crossInput: new Map(),
      alsoAuthored: new Map(),
      unattributable: "no origin/main ref",
    });
    const { failed, lines } = formatDecaySweep(
      runDecaySweep(instruments, () => attribution),
      instruments,
    );
    const text = lines.join("\n");
    assert.equal(failed, true, "unmeasured attribution charges — it never excuses");
    assert.match(text, /ATTRIBUTION UNMEASURED — no origin\/main ref/);
    assert.match(text, /not a claim that it is yours/);
  });

  it("an ATTRIBUTOR THAT THROWS degrades to charging everything, and never takes the sweep down", () => {
    const findings = f(25);
    const instruments = [inst(UNPROVEN_SEAM_DEFAULT, 24, findings)];
    const verdict = runDecaySweep(instruments, () => {
      throw new Error("git exploded");
    });
    assert.equal(verdict.level, "red", "a failed attributor is the pre-ADR-0301 behaviour, not a pass");
    assert.equal(verdict.count, 25, "and the sweep's own findings survive it");
    assert.deepEqual(verdict.escalations, [], "an attribution failure is NOT a blind instrument");
  });

  it("an ESCALATION still fails the gate even when every signal is inherited", () => {
    // The escalation and the ceiling stay independent mechanisms (ADR-0252 D1). Attribution apertures
    // the CEILING; it must never become a second way to clear an escalation.
    const instruments: DecayInstrument[] = [
      {
        name: UNPROVEN_SEAM_DEFAULT,
        ceiling: 24,
        locates: "x",
        run: () => {
          throw new Error("loader blew up");
        },
      },
    ];
    const verdict = runDecaySweep(instruments, (found) => allInherited(found));
    const { failed, lines } = formatDecaySweep(verdict, instruments);
    assert.equal(failed, true);
    assert.match(lines.join("\n"), /ESCALATED/);
  });
});
