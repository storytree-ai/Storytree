// Contract tests for the cross-surface conformance judge (verification-integrity-arc inc 2).
// The judge is pure input → output: two decoded payloads + a spec in, a divergence list out. These
// pin every rule the `check:mirror-conformance` gate leans on, including the one that keeps the
// sanctioned-difference allowlist from decaying into a blanket exemption.

import test from "node:test";
import assert from "node:assert/strict";

import {
  compareMirrors,
  formatDivergences,
  REPORT_LIMIT,
  type Entry,
  type MirrorSpec,
} from "./mirror-conformance.js";

const SPEC: MirrorSpec = {
  surface: "GET /api/docs",
  reference: "studio",
  mirror: "desktop",
  key: "id",
  referenceOnlyFields: [],
};

const spec = (referenceOnlyFields: string[]): MirrorSpec => ({ ...SPEC, referenceOnlyFields });

const doc = (id: string, extra: Entry = {}): Entry => ({ id, title: `T ${id}`, ...extra });

test("identical payloads are conformant — no divergences", () => {
  const payload = [doc("a"), doc("b", { loadBearing: true })];
  assert.deepEqual(compareMirrors(payload, structuredClone(payload), SPEC, "fixture"), []);
});

test("a field the mirror silently drops is a divergence — the 71f68d2b class", () => {
  // The exact shape of the real defect: the studio folded `loadBearing`/`references` onto its
  // DocMeta and the desktop's hand-written copy never got the fold.
  const studio = [doc("adr-1", { loadBearing: true, references: ["doc:adr-2.md"] }), doc("adr-2")];
  const desktop = [doc("adr-1"), doc("adr-2")];

  const found = compareMirrors(studio, desktop, SPEC, "docs/");

  assert.deepEqual(
    found.map((d) => (d.kind === "field" ? `${d.key}:${d.field}` : d.kind)).sort(),
    ["adr-1:loadBearing", "adr-1:references"],
  );
  const loadBearing = found.find((d) => d.kind === "field" && d.field === "loadBearing");
  assert.equal(loadBearing?.kind, "field");
  assert.equal(loadBearing.reference, "true");
  assert.equal(loadBearing.mirror, "(absent)"); // an ABSENT key, not a falsy value
  assert.equal(loadBearing.where, "docs/"); // attributable to the input it was observed over
});

test("an absent key and an explicit undefined-ish value are distinguished", () => {
  // `{}` vs `{loadBearing: false}` is a real difference: the studio omits the key entirely when the
  // tag is absent, and a mirror that emitted `false` would render a different card.
  const found = compareMirrors([doc("a")], [doc("a", { loadBearing: false })], SPEC, "fixture");
  assert.equal(found.length, 1);
  assert.equal(found[0]?.kind, "field");
  assert.deepEqual(
    found.map((d) => (d.kind === "field" ? [d.reference, d.mirror] : null)),
    [["(absent)", "false"]],
  );
});

test("a value the mirror computes differently is a divergence", () => {
  const found = compareMirrors(
    [doc("a", { excerpt: "The first sentence." })],
    [doc("a", { excerpt: "The first sentence" })],
    SPEC,
    "fixture",
  );
  assert.equal(found.length, 1);
  assert.equal(found[0]?.kind, "field");
});

test("a missing entry and an extra entry are each reported", () => {
  const found = compareMirrors([doc("a"), doc("b")], [doc("a"), doc("c")], SPEC, "fixture");
  assert.deepEqual(
    found.map((d) => [d.kind, d.kind === "missing-entry" || d.kind === "extra-entry" ? d.key : ""]),
    [
      ["missing-entry", "b"],
      ["extra-entry", "c"],
    ],
  );
});

test("a differing sort order is a divergence — the array is ordered payload", () => {
  const found = compareMirrors([doc("a"), doc("b")], [doc("b"), doc("a")], SPEC, "fixture");
  assert.equal(found.length, 1);
  assert.equal(found[0]?.kind, "order");
  assert.deepEqual(
    found.map((d) => (d.kind === "order" ? [d.position, d.reference, d.mirror] : null)),
    [[0, "a", "b"]],
  );
});

test("order is NOT compared while the entry sets disagree — no spurious shift reports", () => {
  // Reporting a shifted position for every entry after a missing one would bury the real defect.
  const found = compareMirrors([doc("a"), doc("b"), doc("c")], [doc("b"), doc("c")], SPEC, "fixture");
  assert.deepEqual(found.map((d) => d.kind), ["missing-entry"]);
});

test("an allowlisted reference-only field is exempted", () => {
  const studio = [doc("a", { hostedOnly: "x" }), doc("b")];
  const desktop = [doc("a"), doc("b")];
  assert.deepEqual(compareMirrors(studio, desktop, spec(["hostedOnly"]), "fixture"), []);
});

test("the allowlist is self-pruning — an entry the MIRROR emits is stale", () => {
  // The sanctioned difference has gone away: the desktop now serves the field too, so exempting it
  // would hide any future disagreement about its VALUE.
  const studio = [doc("a", { hostedOnly: "x" })];
  const desktop = [doc("a", { hostedOnly: "x" })];
  const found = compareMirrors(studio, desktop, spec(["hostedOnly"]), "fixture");
  assert.equal(found.length, 1);
  assert.equal(found[0]?.kind, "stale-allowlist");
  assert.match(found[0].reason, /desktop emits it/);
});

test("the allowlist is self-pruning — an entry the REFERENCE never emits is stale", () => {
  // The field was retired from the studio; the exemption now covers nothing and must be removed
  // before it silently starts covering something else.
  const found = compareMirrors([doc("a")], [doc("a")], spec(["retiredField"]), "fixture");
  assert.equal(found.length, 1);
  assert.equal(found[0]?.kind, "stale-allowlist");
  assert.match(found[0].reason, /studio never emits it/);
});

test("empty payloads on both sides are conformant, and an empty allowlist adds no rule", () => {
  assert.deepEqual(compareMirrors([], [], SPEC, "fixture"), []);
});

test("formatDivergences reports a per-field census and elides past the limit", () => {
  const n = REPORT_LIMIT + 5;
  const studio = Array.from({ length: n }, (_, i) => doc(`a${i}`, { loadBearing: true }));
  const desktop = Array.from({ length: n }, (_, i) => doc(`a${i}`));

  const report = formatDivergences(SPEC, compareMirrors(studio, desktop, SPEC, "docs/"));

  assert.match(report, new RegExp(`${n} divergence\\(s\\)`));
  assert.match(report, new RegExp(`fields that diverged: loadBearing \\(${n}\\)`));
  assert.match(report, /… and 5 more/);
  assert.equal(formatDivergences(SPEC, []), ""); // nothing to say when conformant
});
