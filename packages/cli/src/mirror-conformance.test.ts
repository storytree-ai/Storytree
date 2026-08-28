// Contract tests for the cross-surface conformance judge (verification-integrity-arc inc 2).
// The judge is pure input → output: two decoded payloads + a spec in, a divergence list out. These
// pin every rule the `check:mirror-conformance` gate leans on, including the one that keeps the
// sanctioned-difference allowlist from decaying into a blanket exemption.

import test from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  ACTIVITY_KEY,
  ARCS_KEY,
  compareMirrors,
  FLOOR_HEALTH_KEY,
  formatDivergences,
  MIRRORS,
  projectActivityPayload,
  projectArcsPayload,
  projectFloorHealthPayload,
  projectTraversalPayload,
  registeredMirrorRoutes,
  REPORT_LIMIT,
  TRAVERSAL_KEY,
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
  // has to know what is IN it. Deriving that from the spec keeps one fact in one place; a hand-kept
  // second list of "what is registered" would be two lists of the same fact drifting apart, which is
  // the exact class this whole harness exists to fence.
  //
  // ⚠ THE EXPECTATION BELOW IS HAND-AUTHORED, AND THAT IS THE POINT. This assertion used to read
  // `assert.deepEqual([...routes], MIRRORS.map((m) => m.spec.route))` — an expectation computed from
  // the very table it checks, so it agreed with the registry whatever the registry said. Deleting a
  // row, or losing a route off one, would have left it green
  // (`an-expectation-derived-from-its-subject-cannot-fail`). Spelling the set out means a route
  // leaving the registry is a two-place edit, and the second place reds.
  const routes = registeredMirrorRoutes();
  assert.deepEqual(
    [...routes].sort(),
    [
      "/api/activity",
      "/api/arcs",
      "/api/context-windows",
      "/api/docs",
      "/api/floor-health",
      "/api/traversal",
      "/api/traversal/sessions",
    ],
    "registeredMirrorRoutes must union every row's `route` with its `additionalRoutes`",
  );

  // Every registered path must be a real `/api/*` path — a blank or prose-shaped one would silently
  // register nothing and leave the pair looking covered — and must be NAMED in the human label, so a
  // failure report says which route diverged.
  for (const m of MIRRORS) {
    for (const route of [m.spec.route, ...(m.spec.additionalRoutes ?? [])]) {
      assert.match(route, /^\/api\/[a-z/-]+$/, `${m.spec.surface} has an unusable route`);
      assert.ok(m.spec.surface.includes(route), `the human label must name ${route}`);
    }
  }

  // `additionalRoutes` names FURTHER paths one row's probes already compare — never a second row's
  // primary route, which would leave two rows claiming one pair and hide which probes prove it.
  const primaries = new Set(MIRRORS.map((m) => m.spec.route));
  const extras = MIRRORS.flatMap((m) => m.spec.additionalRoutes ?? []);
  assert.equal(new Set(extras).size, extras.length, "no route may be registered by two rows");
  for (const extra of extras) {
    assert.ok(!primaries.has(extra), `${extra} is already another row's primary route`);
  }
});

/**
 * The registry's rows are DATA, and until this test existed nothing in `pnpm -r test` read most of
 * it: the probe paths, the `key`, the `inputs` set and the two surface names are consumed only by
 * `check:mirror-conformance`, which is a gate script rather than a suite. A row could therefore name
 * a probe that does not exist, or an `inputs` set with no fixture builder, and every unit test would
 * still pass — the harness would simply fail at gate time with a probe-not-found, which is fail-
 * closed but is not the same as being checked.
 */
test("every MIRRORS row names probes that EXIST, under the app dir it declares", () => {
  const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));
  for (const target of MIRRORS) {
    for (const [side, probe] of [
      ["reference", target.reference],
      ["mirror", target.mirror],
    ] as const) {
      assert.ok(
        probe.file.startsWith(`${probe.appDir}/`),
        `${target.spec.surface}: the ${side} probe ${probe.file} must live under its declared appDir ${probe.appDir} — the harness spawns it with that dir as cwd, so its bare specifiers resolve through THAT app's node_modules`,
      );
      assert.ok(
        existsSync(join(repoRoot, probe.file)),
        `${target.spec.surface}: the ${side} probe ${probe.file} does not exist`,
      );
      assert.ok(
        existsSync(join(repoRoot, probe.appDir, "package.json")),
        `${target.spec.surface}: the ${side} appDir ${probe.appDir} is not a workspace app`,
      );
    }
    assert.notEqual(
      target.reference.appDir,
      target.mirror.appDir,
      `${target.spec.surface}: both probes run in the same app — the whole point is that neither imports the other (ADR-0176)`,
    );
  }
});

test("every MIRRORS row declares a usable comparison key, input set and surface pair", () => {
  // The set `check-mirror-conformance.ts` builds a fixture for. A row naming anything else spawns
  // its probes with no arguments, which they answer by exiting 2.
  const inputSets = new Set(["docs-trees", "activity-fixtures", "arc-fixtures", "floor-health-fixtures", "traversal-fixtures"]);
  for (const { spec, inputs } of MIRRORS) {
    assert.ok(inputSets.has(inputs), `${spec.surface}: unknown input set "${inputs}"`);
    assert.ok(spec.key.length > 0, `${spec.surface}: an empty key compares every entry against every other`);
    assert.equal(spec.reference, "studio", `${spec.surface}: the reference surface is the studio's router`);
    assert.equal(spec.mirror, "desktop", `${spec.surface}: the mirror is the desktop backend`);
    // EVERY ROW'S ALLOWLIST IS EMPTY, and each says so in its own "EMPTY BY DESIGN" note: both
    // surfaces serve these wires to the SAME compiled bundle, which reads every field from either,
    // so a difference is a defect rather than a narrowing. Asserted rather than left to the notes —
    // an entry appearing here exempts a real field from comparison, which is the one edit that can
    // quietly shrink what this gate proves.
    assert.deepEqual(
      spec.referenceOnlyFields,
      [],
      `${spec.surface}: a referenceOnlyFields entry exempts a field from the comparison — if that is genuinely deliberate, say so in the row's note and change this assertion deliberately too`,
    );
  }
});

// ---------- projectTraversalPayload: the `/api/traversal*` projection ----------

/**
 * The projection is the only reader of these three routes' payloads, and it is the one that decides
 * what a divergence LOOKS like. Nothing exercised it until this suite: `check:mirror-conformance` is
 * a gate script, so a projection that silently dropped half the body would have compared less and
 * still printed a tick.
 */
test("projectTraversalPayload: the STATUS is a first-class entry, because half the envelope IS the status", () => {
  const entries = projectTraversalPayload({
    "replay-absent": { status: 404, body: { error: "no readable trace" } },
  });
  const response = entries.find((e) => e[TRAVERSAL_KEY] === "response:replay-absent");
  assert.equal(response?.["status"], 404);
  // A mirror answering 500 for every refusal must diverge here, not merely in the message.
  const other = projectTraversalPayload({
    "replay-absent": { status: 500, body: { error: "no readable trace" } },
  });
  assert.notDeepEqual(entries, other);
});

test("projectTraversalPayload: a DEEP body is flattened to one entry per JSON leaf, so a divergence names its path", () => {
  const entries = projectTraversalPayload({
    replay: { status: 200, body: { events: [{ nodeId: "a" }, { nodeId: "b" }], skipped: 0 } },
  });
  const keys = entries.map((e) => e[TRAVERSAL_KEY]);
  assert.ok(keys.includes("replay#.events[0].nodeId"), `expected a leaf for the first event's nodeId, got ${keys.join(", ")}`);
  assert.ok(keys.includes("replay#.events[1].nodeId"));
  assert.ok(keys.includes("replay#.skipped"));
  const nodeId = entries.find((e) => e[TRAVERSAL_KEY] === "replay#.events[0].nodeId");
  assert.equal(nodeId?.["value"], "a");
});

test("projectTraversalPayload: an array's LENGTH and an object's KEY SET ride the flattening", () => {
  // Without these, a mirror emitting a shorter list or an extra field would compare equal on every
  // leaf they happen to share.
  const shortList = projectTraversalPayload({ s: { status: 200, body: { sessions: [{ id: "a" }] } } });
  const longList = projectTraversalPayload({ s: { status: 200, body: { sessions: [{ id: "a" }, { id: "b" }] } } });
  assert.notDeepEqual(shortList, longList);

  const lean = projectTraversalPayload({ s: { status: 200, body: { a: 1 } } });
  const fat = projectTraversalPayload({ s: { status: 200, body: { a: 1, b: 2 } } });
  assert.notDeepEqual(lean, fat);
});

test("projectTraversalPayload: array ORDER is a divergence — the replay's event order is the time axis", () => {
  const forward = projectTraversalPayload({ r: { status: 200, body: { events: ["a", "b"] } } });
  const backward = projectTraversalPayload({ r: { status: 200, body: { events: ["b", "a"] } } });
  assert.notDeepEqual(forward, backward);
});

test("projectTraversalPayload: entries come out in request-label order, never the probe's iteration order", () => {
  const one = projectTraversalPayload({ zebra: { status: 200, body: null }, alpha: { status: 400, body: null } });
  const two = projectTraversalPayload({ alpha: { status: 400, body: null }, zebra: { status: 200, body: null } });
  assert.deepEqual(one, two);
  assert.deepEqual(
    one.map((e) => e[TRAVERSAL_KEY]),
    ["response:alpha", "alpha#", "response:zebra", "zebra#"],
  );
});

test("projectTraversalPayload: null and undefined leaves are kept apart from a missing key", () => {
  const withNull = projectTraversalPayload({ r: { status: 200, body: { absence: null } } });
  const withValue = projectTraversalPayload({ r: { status: 200, body: { absence: "no-window-transcript" } } });
  assert.notDeepEqual(withNull, withValue);
  assert.equal(withNull.find((e) => e[TRAVERSAL_KEY] === "r#.absence")?.["value"], null);
});

test("projectTraversalPayload: an object's KEY SET is order-independent — two spellings of one body agree", () => {
  // The key marker is sorted before it is joined. Unsorted, two probes that happened to build the
  // same object in a different key order would report a divergence that is not one — a FALSE red on
  // a pair that agrees, which is the failure mode that teaches a reader to distrust the rung.
  const a = projectTraversalPayload({ r: { status: 200, body: { beta: 1, alpha: 2 } } });
  const b = projectTraversalPayload({ r: { status: 200, body: { alpha: 2, beta: 1 } } });
  assert.deepEqual(a, b);
  assert.equal(a.find((e) => e[TRAVERSAL_KEY] === "r#.{}")?.["value"], undefined);
  assert.ok(a.some((e) => String(e["value"]) === "alpha,beta"), "the key set rides the flattening, sorted");
});

test("projectTraversalPayload: the ARRAY and OBJECT markers are distinct, so a list never reads as a map", () => {
  const list = projectTraversalPayload({ r: { status: 200, body: { x: [] } } });
  const map = projectTraversalPayload({ r: { status: 200, body: { x: {} } } });
  assert.notDeepEqual(list, map);
  assert.ok(list.some((e) => e[TRAVERSAL_KEY] === "r#.x[]" && e["value"] === "length:0"));
  assert.ok(map.some((e) => e[TRAVERSAL_KEY] === "r#.x{}" && e["value"] === ""));
});

test("projectTraversalPayload: the response SHAPE names what the body is, apart from its content", () => {
  const shapeOf = (body: unknown): unknown =>
    projectTraversalPayload({ r: { status: 200, body } }).find((e) => e[TRAVERSAL_KEY] === "response:r")?.["shape"];
  // A mirror answering `[]` where its reference answers `null` — the advisory-absence conflation the
  // whole harness exists to catch — differs HERE even before any leaf is compared.
  assert.equal(shapeOf(null), "null");
  assert.equal(shapeOf([]), "array");
  assert.equal(shapeOf({}), "object");
  assert.equal(shapeOf("text"), "string");
  assert.equal(shapeOf(7), "number");
});

test("projectTraversalPayload: an ABSENT status is null rather than dropped", () => {
  // A probe that failed to record a status must not compare equal to one that recorded 200.
  const missing = projectTraversalPayload({ r: { body: null } });
  assert.equal(missing.find((e) => e[TRAVERSAL_KEY] === "response:r")?.["status"], null);
  assert.notDeepEqual(missing, projectTraversalPayload({ r: { status: 200, body: null } }));
});

test("projectTraversalPayload: a payload that is not keyed by request label is REFUSED, never silently empty", () => {
  for (const bad of [null, 42, ["a"], "text"]) {
    assert.throws(() => projectTraversalPayload(bad), /keyed by request label/);
  }
  assert.throws(
    () => projectTraversalPayload({ label: "not an answer object" }),
    /must be a \{ status, body \} object/,
  );
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

// ---------- projectArcsPayload: the `/api/arcs` projection ----------

const ARCS_SPEC: MirrorSpec = {
  surface: "GET /api/arcs",
  route: "/api/arcs",
  reference: "studio",
  mirror: "desktop",
  key: ARCS_KEY,
  referenceOnlyFields: [],
};

const answer = (status: number, body: unknown): Entry => ({ status, body });

test("the arcs projection emits a response marker per label, plus one entry per arc", () => {
  const entries = projectArcsPayload({
    list: answer(200, { arcs: [{ id: "b-arc", waiting: false }, { id: "a-arc", waiting: true }] }),
    one: answer(200, { id: "a-arc", waiting: true }),
  });
  // Labels SORTED, so the entry order is the request SET and never the probe's iteration order.
  // Arc rows keep the payload's own order — the list is id-sorted by drive, and a mirror that
  // re-sorted it would render a different list.
  assert.deepEqual(entries.map((e) => e[ARCS_KEY]), [
    "response:list",
    "list:arcs",
    "list#b-arc",
    "list#a-arc",
    "response:one",
    "one#body",
  ]);
  assert.deepEqual(entries[0], {
    [ARCS_KEY]: "response:list",
    status: 200,
    shape: "object",
    keys: "arcs",
  });
  assert.deepEqual(entries[1], { [ARCS_KEY]: "list:arcs", shape: "array", rows: 2 });
});

test("a STATUS that diverges is a divergence — most of this envelope is expressed as a code", () => {
  // The class the arcs pair exists to fence: the 405 (read-only BY DECISION, ADR-0267 D6), the 503
  // (no store, for one id) and the 404 (unknown id) are the hand-copied part. A body-only
  // projection would compare three error objects and never notice they arrived under different codes.
  const studio = projectArcsPayload({ write: answer(405, { error: "method not allowed" }) });
  const desktop = projectArcsPayload({ write: answer(404, { error: "method not allowed" }) });

  assert.deepEqual(compareMirrors(studio, desktop, ARCS_SPEC, "arcs-populated"), [
    { kind: "field", where: "arcs-populated", key: "response:write", field: "status", reference: "405", mirror: "404" },
  ]);
});

test("`{ arcs: null }` and `{ arcs: [] }` are distinguished — no store is not no arcs", () => {
  // The exact defect a desktop mirror invites: answering a confident empty portfolio where the
  // reference says "this backend has no document store". The compiled arc lens renders the two
  // differently, so blurring them is worse than a 404.
  const studio = projectArcsPayload({ list: answer(200, { arcs: null }) });
  const desktop = projectArcsPayload({ list: answer(200, { arcs: [] }) });

  assert.deepEqual(compareMirrors(studio, desktop, ARCS_SPEC, "arcs-no-store"), [
    { kind: "field", where: "arcs-no-store", key: "list:arcs", field: "shape", reference: '"null"', mirror: '"array"' },
    { kind: "field", where: "arcs-no-store", key: "list:arcs", field: "rows", reference: "null", mirror: "0" },
  ]);
});

test("an envelope key the mirror drops is a divergence even when every shared field agrees", () => {
  const studio = projectArcsPayload({ list: answer(200, { arcs: [] }) });
  const desktop = projectArcsPayload({ list: answer(200, {}) });

  const divergences = compareMirrors(studio, desktop, ARCS_SPEC, "arcs-no-store");
  assert.ok(
    divergences.some((d) => d.kind === "field" && d.field === "keys"),
    "the response marker's key SET catches an envelope that lost `arcs` entirely",
  );
  assert.ok(
    divergences.some((d) => d.kind === "missing-entry" && d.key === "list:arcs"),
    "and the layer marker goes missing with it",
  );
});

test("an arc the mirror drops is reported BY ID, not as an order shift", () => {
  const studio = projectArcsPayload({ list: answer(200, { arcs: [{ id: "a" }, { id: "b" }] }) });
  const desktop = projectArcsPayload({ list: answer(200, { arcs: [{ id: "a" }] }) });

  const divergences = compareMirrors(studio, desktop, ARCS_SPEC, "arcs-populated");
  assert.ok(divergences.some((d) => d.kind === "missing-entry" && d.key === "list#b"));
});

test("an arcs payload that is not a JSON object is a THROW, never a silently empty projection", () => {
  // Fail-closed on both levels: the envelope, and each label's `{ status, body }` answer.
  for (const bad of [null, [], "{}", 7]) {
    assert.throws(() => projectArcsPayload(bad), /must be a JSON object/);
  }
  assert.throws(() => projectArcsPayload({ list: "200 OK" }), /must be a \{ status, body \} object/);
});

// ---------- projectFloorHealthPayload: the `/api/floor-health` projection ----------

const FLOOR_HEALTH_SPEC: MirrorSpec = {
  surface: "GET /api/floor-health",
  route: "/api/floor-health",
  reference: "studio",
  mirror: "desktop",
  key: FLOOR_HEALTH_KEY,
  referenceOnlyFields: [],
};

/** A reading shaped like drive's: the rules, the window, and the ONE number (ADR-0316 D2/D3). */
const reading = (extra: Record<string, unknown> = {}) => ({
  window: {},
  collapsingRule: "two live filings are ONE cause when an AUTHOR joined them…",
  attributionRule: "attributed to the route STANDING WHEN IT LANDED…",
  distinctCauses: 2,
  unjoined: 1,
  ...extra,
} satisfies Record<string, unknown>);

const loud = { cause: "a-live-guardrail", members: ["a-live-guardrail"], route: "guardrail", recurrences: 4 };

test("the floor-health projection emits a response marker, a reading marker and the reading's fields", () => {
  const entries = projectFloorHealthPayload({
    read: answer(200, { reading: reading({ loudest: loud }) }),
    write: answer(405, { error: "method not allowed — … it does not adjudicate (ADR-0316 D4)" }),
  });
  // Labels SORTED, so the entry order is the request SET and never the probe's iteration order.
  assert.deepEqual(entries.map((e) => e[FLOOR_HEALTH_KEY]), [
    "response:read",
    "read:reading",
    "read#reading",
    "response:write",
    "write#body",
  ]);
  assert.deepEqual(entries[0], {
    [FLOOR_HEALTH_KEY]: "response:read",
    status: 200,
    shape: "object",
    keys: "reading",
  });
  assert.deepEqual(entries[1], {
    [FLOOR_HEALTH_KEY]: "read:reading",
    shape: "object",
    keys: "attributionRule,collapsingRule,distinctCauses,loudest,unjoined,window",
  });
});

test("a QUIET reading and a NULL reading are distinguished — no instrument is not all clear", () => {
  // THE load-bearing assertion of this row, and the reason the harness carries both a `quiet` arm and
  // a `no-store` arm. `{ reading: null }` means "this backend has no document store"; a reading with
  // no `loudest` means "the floor is quiet". `apps/studio/src/lib/floorHealth.ts` renders those
  // differently on purpose — a missing instrument presented as "all clear" is the exact failure
  // ADR-0316's band exists to avoid — so a mirror that collapsed one into the other must go red.
  const studio = projectFloorHealthPayload({ read: answer(200, { reading: null }) });
  const desktop = projectFloorHealthPayload({ read: answer(200, { reading: reading() }) });

  const divergences = compareMirrors(studio, desktop, FLOOR_HEALTH_SPEC, "floor-health-no-store");
  assert.ok(
    divergences.some(
      (d) => d.kind === "field" && d.key === "read:reading" && d.field === "shape",
    ),
    "the reading marker's SHAPE keeps null apart from an object",
  );
  assert.ok(
    divergences.some((d) => d.kind === "extra-entry" && d.key === "read#reading"),
    "and the mirror's invented reading shows up as an entry the reference never emitted",
  );
});

test("a STATUS that diverges is a divergence — report-only is a DECISION, expressed as a code", () => {
  // ADR-0316 D4's 405 is the hand-copied half of this envelope. A body-only projection would compare
  // two error objects and never notice one surface refused with a different code — or, worse, that a
  // mirror let a write fall through to the generic 404 and so never refused BY DECISION at all.
  const studio = projectFloorHealthPayload({ write: answer(405, { error: "method not allowed" }) });
  const desktop = projectFloorHealthPayload({ write: answer(404, { error: "method not allowed" }) });

  assert.deepEqual(compareMirrors(studio, desktop, FLOOR_HEALTH_SPEC, "floor-health-populated"), [
    {
      kind: "field",
      where: "floor-health-populated",
      key: "response:write",
      field: "status",
      reference: "405",
      mirror: "404",
    },
  ]);
});

test("a reading field the mirror computes differently is reported BY NAME", () => {
  // The figure is shared code (`loadFloorHealthReading`), so this should never happen — but "should
  // never" is what the /api/docs drift was too. Per-field rather than a whole-body JSON compare, so
  // the failure names `loudest` instead of printing two readings side by side.
  const studio = projectFloorHealthPayload({ read: answer(200, { reading: reading({ loudest: loud }) }) });
  const desktop = projectFloorHealthPayload({
    read: answer(200, { reading: reading({ loudest: { ...loud, recurrences: 2 } }) }),
  });

  const divergences = compareMirrors(studio, desktop, FLOOR_HEALTH_SPEC, "floor-health-populated");
  assert.deepEqual(
    divergences.map((d) => (d.kind === "field" ? `${d.key}.${d.field}` : d.kind)),
    ["read#reading.loudest"],
  );
});

test("a reading key the mirror drops is a divergence even when every shared field agrees", () => {
  // A mirror that served the figure but lost `window` would strip the provenance ADR-0316 D2 requires
  // every figure to arrive with — invisible if only shared keys were compared.
  const studio = projectFloorHealthPayload({ read: answer(200, { reading: reading() }) });
  const { window: _dropped, ...withoutWindow } = reading();
  const desktop = projectFloorHealthPayload({ read: answer(200, { reading: withoutWindow }) });

  const divergences = compareMirrors(studio, desktop, FLOOR_HEALTH_SPEC, "floor-health-populated");
  assert.ok(
    divergences.some((d) => d.kind === "field" && d.key === "read:reading" && d.field === "keys"),
    "the reading marker's key SET catches a reading that lost a field entirely",
  );
  assert.ok(
    divergences.some((d) => d.kind === "field" && d.key === "read#reading" && d.field === "window"),
    "and the field itself is reported absent",
  );
});

test("a reading carrying its own `_key` cannot displace the synthetic one", () => {
  const entries = projectFloorHealthPayload({
    read: answer(200, { reading: { [FLOOR_HEALTH_KEY]: "spoofed", distinctCauses: 1 } }),
  });
  assert.deepEqual(entries.map((e) => e[FLOOR_HEALTH_KEY]), [
    "response:read",
    "read:reading",
    "read#reading",
  ]);
});

test("a floor-health payload that is not a JSON object is a THROW, never a silently empty projection", () => {
  // Fail-closed on both levels: the envelope, and each label's `{ status, body }` answer.
  for (const bad of [null, [], "{}", 7]) {
    assert.throws(() => projectFloorHealthPayload(bad), /must be a JSON object/);
  }
  assert.throws(() => projectFloorHealthPayload({ read: "200 OK" }), /must be a \{ status, body \} object/);
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
