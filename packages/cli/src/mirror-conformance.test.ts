// Contract tests for the cross-surface conformance judge (verification-integrity-arc inc 2).
// The judge is pure input → output: two decoded payloads + a spec in, a divergence list out. These
// pin every rule the `check:mirror-conformance` gate leans on, including the one that keeps the
// sanctioned-difference allowlist from decaying into a blanket exemption.

import test from "node:test";
import assert from "node:assert/strict";

import {
  ACTIVITY_KEY,
  compareMirrors,
  formatDivergences,
  MIRRORS,
  projectActivityPayload,
  registeredMirrorRoutes,
  REPORT_LIMIT,
  type Entry,
  type MirrorSpec,
} from "./mirror-conformance.js";

const SPEC: MirrorSpec = {
  surface: "GET /api/docs",
  route: "/api/docs",
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

test("the registry exposes its routes as DATA, so a second reader never scrapes them from prose", () => {
  // `mirror-pair-drift` in `check:verification-decay` locates pairs MISSING from this registry, so it
  // has to know what is IN it. Deriving that from `MirrorSpec.route` keeps one fact in one place; a
  // hand-kept second list of "what is registered" would be two lists of the same fact drifting apart,
  // which is the exact class this whole harness exists to fence.
  const routes = registeredMirrorRoutes();
  assert.deepEqual([...routes], MIRRORS.map((m) => m.spec.route));
  assert.ok(routes.has("/api/docs"));

  // Every row's `route` must be a real `/api/*` path — a blank or prose-shaped one would silently
  // register nothing and leave the pair looking covered.
  for (const m of MIRRORS) {
    assert.match(m.spec.route, /^\/api\/[a-z/-]+$/, `${m.spec.surface} has an unusable route`);
    assert.ok(m.spec.surface.includes(m.spec.route), "the human label must name the route it registers");
  }
});

// ---------- projectActivityPayload: the `/api/activity` projection ----------

const ACTIVITY_SPEC: MirrorSpec = {
  surface: "GET /api/activity",
  route: "/api/activity",
  reference: "studio",
  mirror: "desktop",
  key: ACTIVITY_KEY,
  referenceOnlyFields: [],
};

const claim = (sessionId: string, grade: string): Entry => ({
  unitId: "cli",
  kind: "claim",
  sessionId,
  grade,
});

test("the activity projection emits one marker per layer plus one entry per row", () => {
  const entries = projectActivityPayload({
    claims: [claim("s-1", "work")],
    builds: null,
    departures: [],
  });
  // Keys SORTED, so the entry order is the payload's key SET and never its key ORDER.
  assert.deepEqual(entries.map((e) => e[ACTIVITY_KEY]), [
    "layer:builds",
    "layer:claims",
    "claims#0",
    "layer:departures",
  ]);
  assert.deepEqual(entries[0], { [ACTIVITY_KEY]: "layer:builds", shape: "null", rows: null });
  assert.deepEqual(entries[1], { [ACTIVITY_KEY]: "layer:claims", shape: "array", rows: 1 });
});

test("a layer the mirror omits ENTIRELY diverges even at zero rows — the `departures` class", () => {
  // The real 6dbc1b80 defect: the desktop route served `{builds, claims}` while the studio served
  // `{builds, claims, departures}`. Rows alone cannot catch it — an omitted layer and an EMPTY one
  // both contribute zero rows — which is the whole reason each layer carries a marker entry.
  const studio = projectActivityPayload({ builds: [], claims: [], departures: [] });
  const desktop = projectActivityPayload({ builds: [], claims: [] });

  const divergences = compareMirrors(studio, desktop, ACTIVITY_SPEC, "advisory-absence");
  assert.deepEqual(divergences, [
    { kind: "missing-entry", where: "advisory-absence", key: "layer:departures" },
  ]);
});

test("a field a row drops is reported per row, by name — the ADR-0200 `grade` class", () => {
  // The originating defect: the desktop's re-composed fold reached the wire without `grade`, so
  // every exploring/waiting claim rendered as a whole-island work orbit.
  const studio = projectActivityPayload({ claims: [claim("s-1", "exploring"), claim("s-2", "waiting")] });
  const desktop = projectActivityPayload({
    claims: [{ unitId: "cli", kind: "claim", sessionId: "s-1" }, { unitId: "cli", kind: "claim", sessionId: "s-2" }],
  });

  const divergences = compareMirrors(studio, desktop, ACTIVITY_SPEC, "populated");
  assert.deepEqual(divergences, [
    { kind: "field", where: "populated", key: "claims#0", field: "grade", reference: '"exploring"', mirror: "(absent)" },
    { kind: "field", where: "populated", key: "claims#1", field: "grade", reference: '"waiting"', mirror: "(absent)" },
  ]);
});

test("`null` and `[]` are distinguished — the advisory-absence promise is not `[]`", () => {
  const studio = projectActivityPayload({ claims: null });
  const desktop = projectActivityPayload({ claims: [] });

  const divergences = compareMirrors(studio, desktop, ACTIVITY_SPEC, "advisory-absence");
  assert.deepEqual(divergences, [
    { kind: "field", where: "advisory-absence", key: "layer:claims", field: "shape", reference: '"null"', mirror: '"array"' },
    { kind: "field", where: "advisory-absence", key: "layer:claims", field: "rows", reference: "null", mirror: "0" },
  ]);
});

test("a row carrying its own `_key` cannot displace the synthetic one and collapse two entries", () => {
  const entries = projectActivityPayload({ claims: [{ [ACTIVITY_KEY]: "spoofed" }, { [ACTIVITY_KEY]: "spoofed" }] });
  assert.deepEqual(entries.map((e) => e[ACTIVITY_KEY]), ["layer:claims", "claims#0", "claims#1"]);
});

test("a payload that is not a JSON object is a THROW, never a silently empty projection", () => {
  // Fail-closed: an empty projection would compare two nothings and pass.
  for (const bad of [null, [], "{}", 7]) {
    assert.throws(() => projectActivityPayload(bad), /must be a JSON object/);
  }
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
