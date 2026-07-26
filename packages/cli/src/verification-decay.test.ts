import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  CHARTERED_INSTRUMENTS,
  CONTRACT_BINDING_DRIFT,
  evaluateDecayCeiling,
  findContractBindingDrift,
  formatDecaySweep,
  isInsideDir,
  runDecaySweep,
  type DecayFinding,
  type DecayInstrument,
  type ProofBinding,
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

describe("the drain ceiling: advisory per finding, fail-closed on the COUNT", () => {
  const f = (n: number): DecayFinding[] =>
    Array.from({ length: n }, (_, i) => ({
      instrument: CONTRACT_BINDING_DRIFT,
      id: `x${i}`,
      where: "w",
      detail: "d",
    }));

  it("stays OK at exactly the ceiling — the baseline starts green", () => {
    assert.equal(evaluateDecayCeiling(f(5), 5).level, "ok");
  });

  it("reds the moment the backlog GROWS past the ceiling", () => {
    const v = evaluateDecayCeiling(f(6), 5);
    assert.equal(v.level, "red");
    assert.equal(v.count, 6);
  });

  it("stays OK when findings are repaired below the ceiling", () => {
    assert.equal(evaluateDecayCeiling(f(2), 5).level, "ok");
    assert.equal(evaluateDecayCeiling([], 5).level, "ok");
  });
});

describe("the sweep runner and its report", () => {
  const inst = (name: string, run: () => DecayFinding[]): DecayInstrument => ({
    name,
    locates: `what ${name} locates`,
    run,
  });

  it("fences a THROWING instrument to itself, as a finding — a sweep that stops sweeping proves nothing", () => {
    const verdict = runDecaySweep(
      [
        inst("boom", () => {
          throw new Error("disk gone");
        }),
        inst("fine", () => []),
      ],
      5,
    );
    assert.match(verdict.findings[0]?.detail ?? "", /disk gone/);
    assert.match(verdict.findings[0]?.detail ?? "", /swept nothing/);
    // It is NOT backlog: a blind instrument located nothing, so it must not consume drain budget.
    assert.equal(verdict.count, 0);
  });

  it("never exits and never throws — it returns the decision for the caller to act on", () => {
    const verdict = runDecaySweep([inst("a", () => f1("a")), inst("b", () => f1("b"))], 1);
    assert.equal(verdict.count, 2);
    assert.equal(verdict.level, "red");
  });

  it("OK report names the instruments that actually ran, so silence is attributable", () => {
    const instruments = [inst("a", () => [])];
    const { failed, lines } = formatDecaySweep(runDecaySweep(instruments, 5), instruments);
    assert.equal(failed, false);
    assert.match(lines.join("\n"), /OK/);
    assert.match(lines.join("\n"), /1 instrument\(s\): a/);
  });

  it("WARN report states the two-phase discipline — a located region is not an established defect", () => {
    const instruments = [inst("a", () => f1("a"))];
    const { failed, lines } = formatDecaySweep(runDecaySweep(instruments, 5), instruments);
    const text = lines.join("\n");
    assert.equal(failed, false, "a finding within the ceiling must not fail the gate");
    assert.match(text, /WARN/);
    assert.match(text, /LOCATE regions; they do not establish defects/);
    assert.match(text, /inputs → wrong outcome/);
    // The instrument's own false-positive surface has to reach the reader.
    assert.match(text, /what a locates/);
  });

  it("RED report fails and says how to return to green", () => {
    const instruments = [inst("a", () => [...f1("a"), ...f1("b")])];
    const { failed, lines } = formatDecaySweep(runDecaySweep(instruments, 1), instruments);
    assert.equal(failed, true);
    assert.match(lines.join("\n"), /RED/);
    assert.match(lines.join("\n"), /raise the ceiling/);
  });

  function f1(id: string): DecayFinding[] {
    return [{ instrument: "a", id, where: "w", detail: "d" }];
  }
});

describe("the escalation backstop (ADR-0252 D1): the continuous half can force the question", () => {
  const inst = (name: string, run: () => DecayFinding[]): DecayInstrument => ({
    name,
    locates: `what ${name} locates`,
    run,
  });
  const blind = (name = CONTRACT_BINDING_DRIFT): DecayInstrument =>
    inst(name, () => {
      throw new Error("loadNodeSpec shape changed");
    });
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
    const verdict = runDecaySweep(instruments, 5);
    const { failed, lines } = formatDecaySweep(verdict, instruments);

    assert.equal(failed, true, "a blind sweep must never exit green");
    assert.equal(verdict.escalations.length, 1);
    const text = lines.join("\n");
    assert.match(text, /ESCALATED/);
    assert.doesNotMatch(text, /WARN/, "a blind sweep is not a backlog warning");
  });

  it("names the required response as a FRESH-SESSION pass, not a repair", () => {
    const instruments = [blind()];
    const text = formatDecaySweep(runDecaySweep(instruments, 5), instruments).lines.join("\n");
    assert.match(text, /FRESH SESSION/);
    assert.match(text, /verification-decay-detection/);
    // The remedy must not read as "drain an item" — that is the ceiling's remedy, not this one.
    assert.match(text, /Raising the drain ceiling CANNOT clear an escalation/);
  });

  it("CANNOT be cleared by raising the ceiling — the two mechanisms are independent", () => {
    // The load-bearing property. Raising DRAIN_CEILING is a legitimate documented move for real
    // backlog growth; if it also discharged escalations, the backstop would be defeated by the
    // routine operation of its neighbour — the "gaming the D3 ceiling" failure mode arriving by
    // accident. Proved at an absurd ceiling so no arithmetic coincidence can carry it.
    const instruments = [blind()];
    const verdict = runDecaySweep(instruments, Number.MAX_SAFE_INTEGER);
    assert.equal(verdict.level, "ok", "the ceiling itself is satisfied");
    assert.equal(formatDecaySweep(verdict, instruments).failed, true, "and the gate still fails");
  });

  it("is not merely the ceiling renamed: a ceiling RED carries no escalation", () => {
    const instruments = [inst("a", () => [located("x"), located("y")])];
    const verdict = runDecaySweep(instruments, 1);
    assert.equal(verdict.level, "red");
    assert.deepEqual(verdict.escalations, []);
    const text = formatDecaySweep(verdict, instruments).lines.join("\n");
    assert.doesNotMatch(text, /ESCALATED/);
    assert.match(text, /raise the ceiling/, "the ceiling's own remedy is unchanged");
  });

  it("reports BOTH independently when a blind instrument sits beside a breached ceiling", () => {
    const instruments = [blind("gone"), inst("a", () => [located("x"), located("y")])];
    const verdict = runDecaySweep(instruments, 1);
    assert.equal(verdict.count, 2, "the ceiling counts located regions only");
    assert.equal(verdict.escalations.length, 1);
    const text = formatDecaySweep(verdict, instruments).lines.join("\n");
    assert.match(text, /ESCALATED/);
    assert.match(text, /RED/);
  });

  it("THE FALSE-POSITIVE GUARD: an ordinary located signal NEVER escalates", () => {
    // The bar is deliberately narrow. An escalation that fires on ordinary backlog would train the
    // reader to clear it, which is precisely how it would stop being a backstop.
    const instruments = [inst("a", () => [located("x")])];
    const verdict = runDecaySweep(instruments, 5);
    assert.deepEqual(verdict.escalations, []);
    assert.equal(formatDecaySweep(verdict, instruments).failed, false);
  });

  it("a healthy sweep stays OK and still says so", () => {
    const instruments = [inst(CONTRACT_BINDING_DRIFT, () => [])];
    const { failed, lines } = formatDecaySweep(runDecaySweep(instruments, 5), instruments);
    assert.equal(failed, false);
    assert.match(lines.join("\n"), /OK/);
  });
});

describe("chartered coverage: an unswept instrument is a machine fact, not a source comment", () => {
  const inst = (name: string): DecayInstrument => ({ name, locates: "…", run: () => [] });

  it("names every chartered instrument that is NOT registered, on a clean run", () => {
    const instruments = [inst(CONTRACT_BINDING_DRIFT)];
    const { failed, lines } = formatDecaySweep(runDecaySweep(instruments, 5), instruments);
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
    const text = formatDecaySweep(runDecaySweep(instruments, 5), instruments).lines.join("\n");
    assert.match(text, /chartered coverage: 4\/4/);
    assert.doesNotMatch(text, /NOT swept/);
  });

  it("the roster is exactly ADR-0252 D1's four cheap instruments", () => {
    assert.equal(CHARTERED_INSTRUMENTS.length, 4);
    assert.ok(CHARTERED_INSTRUMENTS.includes(CONTRACT_BINDING_DRIFT));
  });
});
