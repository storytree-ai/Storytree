import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  CHARTERED_INSTRUMENTS,
  CONTRACT_BINDING_DRIFT,
  MIRROR_PAIR_DRIFT,
  evaluateDecayCeiling,
  findContractBindingDrift,
  findMirrorPairDrift,
  formatDecaySweep,
  isInsideDir,
  runDecaySweep,
  type DecayFinding,
  type DecayInstrument,
  type ProofBinding,
  type SurfaceRoutes,
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
    assert.ok(CHARTERED_INSTRUMENTS.includes(CONTRACT_BINDING_DRIFT));
  });
});
