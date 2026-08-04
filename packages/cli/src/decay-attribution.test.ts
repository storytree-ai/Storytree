import { test } from "node:test";
import assert from "node:assert/strict";

import {
  attributeDecayFindings,
  basisOf,
  type DecayAttributionEvidence,
} from "./decay-attribution.js";
import type { DecayFinding } from "./verification-decay.js";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function finding(partial: Partial<DecayFinding> & Pick<DecayFinding, "id">): DecayFinding {
  return {
    instrument: "unproven-seam-default",
    where: "packages/drive/src/thing.ts",
    detail: "a located region",
    ...partial,
  };
}

/** The ordinary case: git answered every question and the branch touched `touched`. */
function measured(touched: readonly string[], over: Partial<DecayAttributionEvidence> = {}): DecayAttributionEvidence {
  return {
    branch: "claude/mine",
    touchedFiles: new Set(touched),
    crossInput: new Map(),
    alsoAuthored: new Map(),
    ...over,
  };
}

// ---------------------------------------------------------------------------
// basisOf — what a finding rests on
// ---------------------------------------------------------------------------

test("basisOf falls back to `where` when a finding declares no basis", () => {
  assert.deepEqual(basisOf(finding({ id: "a", where: "packages/x/y.ts" })), ["packages/x/y.ts"]);
});

test("basisOf prefers a declared basis, and an EMPTY one degrades to `where` rather than to nothing", () => {
  assert.deepEqual(basisOf(finding({ id: "a", where: "w.ts", basis: ["p.ts", "q.ts"] })), ["p.ts", "q.ts"]);
  // An empty array must not mean "rests on no file" — that would make the finding unattributable-to-
  // any-edit and therefore permanently inherited, the wrongly-excused direction.
  assert.deepEqual(basisOf(finding({ id: "a", where: "w.ts", basis: [] })), ["w.ts"]);
});

// ---------------------------------------------------------------------------
// The ordinary split
// ---------------------------------------------------------------------------

test("a signal whose file this branch never touched is INHERITED and not charged", () => {
  const a = attributeDecayFindings([finding({ id: "a", where: "packages/agent/src/model.ts" })], measured(["packages/cli/src/other.ts"]));
  assert.equal(a.inherited.length, 1);
  assert.equal(a.authored.length, 0);
  assert.equal(a.byId.get("a")?.owner, "inherited");
  assert.match(a.byId.get("a")?.because ?? "", /identical to the merge base/);
});

test("a signal in a file this branch touched is AUTHORED, and the reason names the branch and the file", () => {
  const a = attributeDecayFindings([finding({ id: "a", where: "packages/agent/src/model.ts" })], measured(["packages/agent/src/model.ts"]));
  assert.equal(a.authored.length, 1);
  assert.equal(a.inherited.length, 0);
  assert.equal(a.byId.get("a")?.because, "claude/mine changed packages/agent/src/model.ts");
});

test("an unnamed branch still attributes — it degrades the MESSAGE, never the verdict", () => {
  const a = attributeDecayFindings(
    [finding({ id: "a", where: "x.ts" })],
    measured(["x.ts"], { branch: null }),
  );
  assert.equal(a.byId.get("a")?.owner, "authored");
  assert.match(a.byId.get("a")?.because ?? "", /^this branch changed/);
});

// ---------------------------------------------------------------------------
// The multi-file basis — the mirror-pair / warn-list shape
// ---------------------------------------------------------------------------

test("a multi-file basis is AUTHORED when ANY of its files is touched, including one that is not `where`", () => {
  // The mirror-pair shape: `where` is the desktop file, but the branch added the STUDIO half. Under a
  // `where`-only rule this reads inherited and goes uncharged — the wrongly-excused direction.
  const f = finding({
    id: "mirror-pair-drift:/api/thing",
    instrument: "mirror-pair-drift",
    where: "apps/desktop/src/backend/thing.ts",
    basis: ["apps/desktop/src/backend/thing.ts", "apps/studio/server/thing.ts"],
  });
  const a = attributeDecayFindings([f], measured(["apps/studio/server/thing.ts"]));
  assert.equal(a.authored.length, 1, "the untouched `where` must not excuse a touched basis file");
  assert.match(a.byId.get(f.id)?.because ?? "", /apps\/studio\/server\/thing\.ts/);
});

test("a multi-file basis stays INHERITED when none of its files is touched", () => {
  const f = finding({ id: "m", basis: ["a.ts", "b.ts"] });
  assert.equal(attributeDecayFindings([f], measured(["c.ts"])).inherited.length, 1);
});

// ---------------------------------------------------------------------------
// The two escape hatches — both only ever move a finding TOWARDS being charged
// ---------------------------------------------------------------------------

test("a cross-input guard charges an instrument's WHOLE population, untouched files included", () => {
  const mine = finding({ id: "cbd:a", instrument: "contract-binding-drift", where: "stories/a.md" });
  const other = finding({ id: "vp:b", instrument: "vacuous-proof", where: "packages/x/y.test.ts" });
  const a = attributeDecayFindings(
    [mine, other],
    measured([], { crossInput: new Map([["contract-binding-drift", "this branch deleted file(s)"]]) }),
  );
  assert.equal(a.byId.get("cbd:a")?.owner, "authored");
  assert.equal(a.byId.get("cbd:a")?.because, "this branch deleted file(s)");
  // ...and ONLY that instrument. A guard is per-instrument precision loss, never a global one.
  assert.equal(a.byId.get("vp:b")?.owner, "inherited");
});

test("a shell-proved finding is charged even though every file it rests on is untouched", () => {
  const f = finding({ id: "usd:x" });
  const a = attributeDecayFindings(
    [f],
    measured([], { alsoAuthored: new Map([["usd:x", "this branch's test edits removed the last mention"]]) }),
  );
  assert.equal(a.byId.get("usd:x")?.owner, "authored");
  assert.match(a.byId.get("usd:x")?.because ?? "", /removed the last mention/);
});

test("alsoAuthored keys on the FINDING id, so a sibling signal in the same file stays inherited", () => {
  const hit = finding({ id: "usd:file:alpha", where: "packages/drive/src/io.ts" });
  const miss = finding({ id: "usd:file:beta", where: "packages/drive/src/io.ts" });
  const a = attributeDecayFindings(
    [hit, miss],
    measured([], { alsoAuthored: new Map([["usd:file:alpha", "proved"]]) }),
  );
  assert.equal(a.byId.get("usd:file:alpha")?.owner, "authored");
  assert.equal(a.byId.get("usd:file:beta")?.owner, "inherited");
});

// ---------------------------------------------------------------------------
// Fail-closed on unmeasurable attribution (ADR-0290 D7's posture, ADR-0301)
// ---------------------------------------------------------------------------

test("unmeasurable attribution charges EVERY signal and says why — it never excuses one", () => {
  const findings = [finding({ id: "a" }), finding({ id: "b", where: "elsewhere.ts" })];
  const a = attributeDecayFindings(findings, measured([], { unattributable: "no merge base" }));
  assert.equal(a.authored.length, 2);
  assert.equal(a.inherited.length, 0);
  for (const id of ["a", "b"]) {
    assert.equal(a.byId.get(id)?.because, "attribution unmeasured — charged, not excused");
  }
  assert.equal(a.unattributable, "no merge base", "the reason is echoed so the caller can print it");
});

test("unmeasurable OUTRANKS every other signal, so a stale touched-set cannot excuse anything", () => {
  // The precedence guard: if `unattributable` were checked last, an evidence object carrying an empty
  // touched-set alongside it would classify everything as inherited — a green over an unmeasured tree.
  const a = attributeDecayFindings(
    [finding({ id: "a", where: "untouched.ts" })],
    measured([], { unattributable: "git could not diff" }),
  );
  assert.equal(a.byId.get("a")?.owner, "authored");
});

test("with nothing measured and nothing touched, a signal is inherited — the mechanism does not charge by default", () => {
  // The counterweight to the test above: fail-closed must be reachable ONLY through a measured signal,
  // or the split would be decorative and every report would read NOT YOURS: 0.
  assert.equal(attributeDecayFindings([finding({ id: "a" })], measured([])).inherited.length, 1);
});
