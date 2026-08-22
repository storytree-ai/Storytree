import test from "node:test";
import assert from "node:assert/strict";

import { InMemoryStore, type StoredDoc } from "@storytree/storage-protocol";
import { CURRENT_SCHEMA_VERSION, adrDocId } from "@storytree/library";
import { loadFixtureCorpus } from "@storytree/library/fixture";

import {
  libraryHealth,
  libraryHealthCheap,
  worstLevel,
  gateFailures,
  levelCounts,
  GATE_CHECKS,
  type CheckResult,
} from "./health.js";

/**
 * A fixture document, deliberately OPEN and mutable. These tests build a well-formed doc and then
 * delete or overwrite fields to reach the malformed shapes the migration has to survive, so the
 * fixture cannot carry a fixed key set: an annotated literal is the widening
 * `no-known-value-widening` rejects, and `satisfies` would pin exactly the keys the tests break.
 * Routing the literal through a call keeps it open and says why.
 */
function openDoc(fields: Record<string, unknown>): Record<string, unknown> {
  return fields;
}

/**
 * Health-check tests (design §4: docs/research/library-schema-migrations-and-health-checks.md).
 * OFFLINE — no DB, no API key. Two parts:
 *  (a) pure-function tests with stubbed docs for each level of each check;
 *  (b) a FIXTURE gate test — load `@storytree/library/fixture` into an InMemoryStore and assert
 *      gateFailures() is EMPTY (the GATE-class checks — schema-conformance / retired-field /
 *      version-floor — are clean on it). This is what makes `pnpm -r test` (ADR-0022) enforce the
 *      health ENGINE offline.
 *
 * WHAT (b) DOES NOT COVER, because its subject changed under it. It was written as a SEED gate over
 * `apps/studio/data/knowledge.json`, the committed mirror of the corpus — so a green run once did
 * mean the real corpus was schema-clean. ADR-0302 D1 DELETED that file, and the loader it now calls
 * reads a frozen 13-artifact literal that ADR-0302 D3 says is "deliberately NOT a mirror and never
 * reconciled, so it drifts by design". A green run therefore proves the three GATE-class checks
 * classify a known-clean corpus correctly, and says NOTHING about the live one — which on 2026-08-08
 * was RED on `version-floor` (ten docs, no session's own) while this suite passed.
 *
 * That is not a hole to plug here. `storytree library --check` reads the live corpus on demand and
 * is deliberately not a merge gate (ADR-0026 §5, "by design, not every push"); making one would need
 * production-catch evidence and an ADR (ADR-0311 D5, `asset:justify-a-gate-rung`). What this comment
 * buys is that nobody reads a green `pnpm -r test` as the corpus being watched —
 * `stories/cli/verification-decay-instruments.md` already classes this suite as "four checks over a
 * frozen fixture corpus", proving facts about a JUDGE rather than about the world.
 */

const BASE_OPTS = { currentSchemaVersion: CURRENT_SCHEMA_VERSION, retiredFields: ["seeAlso"] };

/** A valid, current-version structured definition unit (the body that lives in StoredDoc.doc). */
function validDefinitionBody(over: Record<string, unknown> = {}) {
  return openDoc({
    kind: "definition",
    id: "good-term",
    title: "Good term",
    description: "A valid definition for the health tests.",
    schemaVersion: CURRENT_SCHEMA_VERSION,
    references: [],
    oneLine: "A throwaway definition used only by the health test suite.",
    whatItIs: "The exact meaning, stated precisely for the test.",
    createdAt: "2026-06-05T00:00:00.000Z",
    updatedAt: "2026-06-09T00:00:00.000Z",
    ...over,
  });
}

/** Wrap a doc body as a StoredDoc (kind mirrors the body's kind/category). */
function stored(body: Record<string, unknown>): StoredDoc {
  const kind =
    typeof body.kind === "string"
      ? body.kind
      : typeof body.category === "string"
        ? body.category
        : "";
  return {
    id: typeof body.id === "string" ? body.id : "",
    kind,
    doc: body,
    createdAt: "2026-06-05T00:00:00.000Z",
    updatedAt: "2026-06-09T00:00:00.000Z",
  };
}

function find(results: readonly CheckResult[], name: string): CheckResult {
  const r = results.find((x) => x.name === name);
  assert.ok(r, `missing check ${name}`);
  return r;
}

// --- (a) pure-function tests -------------------------------------------------------------------

test("schema-conformance PASS on a valid current-version structured doc", () => {
  const results = libraryHealth([stored(validDefinitionBody())], BASE_OPTS);
  assert.equal(find(results, "schema-conformance").level, "PASS");
});

test("schema-conformance FAIL on a structured doc missing a required field", () => {
  // Drop the required `whatItIs` — upcastAndValidate can't forward it, so it throws => FAIL.
  const bad = validDefinitionBody();
  delete bad.whatItIs;
  const results = libraryHealth([stored(bad)], BASE_OPTS);
  const r = find(results, "schema-conformance");
  assert.equal(r.level, "FAIL");
  assert.ok(r.lines.some((l) => l.includes("good-term")), "names the offending id");
});

test("schema-conformance skips non-structured (template) docs", () => {
  // A template asset has no structured `kind`; it is not subject to the schema-conformance check.
  const tpl = stored({ id: "template-definition", category: "template", title: "T", description: "d", body: "b", references: [] });
  const results = libraryHealth([tpl], BASE_OPTS);
  assert.equal(find(results, "schema-conformance").level, "PASS");
});

test("retired-field PASS when no doc carries a retired field", () => {
  const results = libraryHealth([stored(validDefinitionBody())], BASE_OPTS);
  assert.equal(find(results, "retired-field").level, "PASS");
});

test("retired-field FAIL when a doc still carries 'seeAlso' in its stored body", () => {
  // The stored body carries seeAlso (a concurrently-authored old-shape doc). retired-field inspects
  // the STORED body directly, so it catches this even though schema-conformance would upcast it away.
  const results = libraryHealth([stored(validDefinitionBody({ seeAlso: ["asset:x"] }))], BASE_OPTS);
  const r = find(results, "retired-field");
  assert.equal(r.level, "FAIL");
  assert.ok(r.lines.some((l) => l.includes("seeAlso")));
});

test("version-floor PASS when every structured doc is at the current version", () => {
  const results = libraryHealth([stored(validDefinitionBody())], BASE_OPTS);
  assert.equal(find(results, "version-floor").level, "PASS");
});

test("version-floor FAIL when a structured doc sits below the current version", () => {
  const results = libraryHealth([stored(validDefinitionBody({ schemaVersion: 0 }))], BASE_OPTS);
  const r = find(results, "version-floor");
  assert.equal(r.level, "FAIL");
  assert.ok(r.lines.some((l) => l.includes("good-term")));
});

test("referential-integrity PASS when every pointer resolves", () => {
  const a = stored(validDefinitionBody({ id: "a", references: ["asset:b"] }));
  const b = stored(validDefinitionBody({ id: "b" }));
  const results = libraryHealth([a, b], { ...BASE_OPTS, docExists: () => true });
  assert.equal(find(results, "referential-integrity").level, "PASS");
});

test("referential-integrity FAIL on a dangling asset: pointer (a real graph break)", () => {
  const a = stored(validDefinitionBody({ id: "a", references: ["asset:ghost"] }));
  const results = libraryHealth([a], BASE_OPTS);
  const r = find(results, "referential-integrity");
  assert.equal(r.level, "FAIL");
  assert.ok(r.lines.some((l) => l.includes("asset:ghost")));
});

test("referential-integrity WARN on a dangling doc: pointer (softer — a doc can move)", () => {
  const a = stored(validDefinitionBody({ id: "a", references: ["doc:missing/file.md"] }));
  const results = libraryHealth([a], { ...BASE_OPTS, docExists: () => false });
  const r = find(results, "referential-integrity");
  assert.equal(r.level, "WARN");
  assert.ok(r.lines.some((l) => l.includes("doc:missing/file.md")));
});

test("referential-integrity skips doc: resolution when no docExists is injected", () => {
  const a = stored(validDefinitionBody({ id: "a", references: ["doc:missing/file.md"] }));
  const results = libraryHealth([a], BASE_OPTS); // no docExists
  assert.equal(find(results, "referential-integrity").level, "PASS");
});

// --- doc: pointers at DECISION RECORDS, resolved against the STORE ------------------------------
/**
 * A FAKE `docs/` TREE, not a `() => true` stub. The resolver the CLI injects is docs-RELATIVE
 * (`path.join(<repoRoot>/docs, rel)`), so a stub that answers true for everything cannot tell a
 * resolved pointer from a mis-built path, and a suite built on one goes green on a path bug. This
 * set says which files exist; anything else is genuinely absent.
 *
 * IT DELIBERATELY HOLDS NO `decisions/…` ENTRY. A decision stopped being a file when ADR-0403 dec 1
 * made it an `adr-NNNN` Library row and PR #1546 deleted `docs/decisions/`, so a decision pointer
 * that resolved off this tree would be proving the removed behaviour still works. It resolves
 * against {@link adrRow} rows in the projection instead, and the disk must never be consulted for
 * one — asserted below rather than assumed.
 */
const DOCS_TREE: ReadonlySet<string> = new Set([
  "research/library-schema-migrations-and-health-checks.md",
  // A foreign tree that merely CONTAINS a `decisions/` directory — see the anchoring test below.
  "vendor/decisions/0001-not-ours.md",
]);
const FAKE_DOCS = { ...BASE_OPTS, docExists: (rel: string) => DOCS_TREE.has(rel) };

/** The slug of the one decision these tests hold a row for — the file spellings both name it. */
const SLUG_0209 = "0209-tier-model-judged-uat-below-irreducible-human-witness.md";

/**
 * A decision ROW — what a `doc:decisions/NNNN-….md` pointer resolves against since ADR-0403 dec 1.
 *
 * A faithful `adr` body rather than a bare `{id}`, so the row is the kind of thing the live store
 * actually returns: the resolver keys on the id today, and a fixture that only carried an id would
 * still pass if it ever started keying on `kind` or `number` while the live corpus did not.
 */
function adrRow(number: number): StoredDoc {
  const label = `ADR-${String(number).padStart(4, "0")}`;
  return stored(
    openDoc({
      kind: "adr",
      id: adrDocId(number),
      title: `${label}: a decision this fixture holds`,
      description: "A decision row, so a decision pointer at it has something to resolve against.",
      schemaVersion: CURRENT_SCHEMA_VERSION,
      references: [],
      number,
      status: "accepted",
      body: `# ${label}\n\n## Status\n\naccepted\n`,
      createdAt: "2026-06-05T00:00:00.000Z",
      updatedAt: "2026-06-09T00:00:00.000Z",
    }),
  );
}

/**
 * The referential-integrity result for one doc holding `refs`, against a projection that also holds
 * `rows` — by default the single decision row ADR-0209. Pass `[]` for the no-decision-index case.
 */
function refLines(refs: string[], rows: readonly StoredDoc[] = [adrRow(209)]): CheckResult {
  const a = stored(validDefinitionBody({ id: "a", references: refs }));
  return find(libraryHealth([a, ...rows], FAKE_DOCS), "referential-integrity");
}

test("referential-integrity resolves ALL THREE spellings of a decision that exists as a ROW", () => {
  // ADR-0403 dec 7 keeps all three live and rewrites none of them, so a reader accepting one and
  // not another returns a confident, plausible, wrong answer. All three name ADR-0209 here.
  for (const ref of [`doc:decisions/${SLUG_0209}`, `doc:docs/decisions/${SLUG_0209}`, "asset:adr-0209"]) {
    const r = refLines([ref]);
    assert.equal(r.level, "PASS", `${ref} names a decision the store holds — it must resolve`);
  }
});

test("referential-integrity still REPORTS a decision the store does not hold, in EITHER spelling", () => {
  // THE HONESTY BAR. Without this the fix degrades into "decision pointers are never checked" —
  // green, and worthless. 0000 is in no projection these tests build, and must report as absent
  // from the STORE (not as a missing file, which is the claim that stopped being true).
  for (const ref of ["doc:decisions/0000-no-such.md", "doc:docs/decisions/0000-no-such.md"]) {
    const r = refLines([ref]);
    assert.equal(r.level, "WARN", `${ref} names nothing — it must still be reported`);
    assert.ok(r.lines.some((l) => l.includes(ref)), "the report names the pointer as authored");
    assert.ok(
      r.lines.some((l) => l.includes("adr-0000") && l.includes("not in the store")),
      "and names the row it looked for, so a reader can go and check",
    );
  }
});

test("a decision pointer never reaches docExists — the filesystem is not a fallback", () => {
  // The bug was a decision pointer being answered by the disk. Asserting only the VERDICT would
  // stay green on a fix that asked the disk first and the store second, which reintroduces it the
  // day someone restores a stray `docs/decisions/` file. So the resolver records what it was asked.
  const asked: string[] = [];
  const a = stored(validDefinitionBody({ id: "a", references: [`doc:decisions/${SLUG_0209}`] }));
  const results = libraryHealth([a, adrRow(209)], {
    ...BASE_OPTS,
    docExists: (rel: string) => {
      asked.push(rel);
      return true;
    },
  });
  assert.equal(find(results, "referential-integrity").level, "PASS");
  assert.deepEqual(asked, [], "a decision pointer must be resolved by the store alone");
});

test("omitting docExists skips research notes but can NOT switch decision checking off", () => {
  // `docExists` is optional and fail-OPEN, which is defensible for a tree this check does not own.
  // Decisions live in the store this report is already reading, so an omittable resolver would be a
  // way to make the whole tier go unchecked while the report still printed a clean line.
  const a = stored(
    validDefinitionBody({
      id: "a",
      references: ["doc:decisions/0000-no-such.md", "doc:research/no-such-note.md"],
    }),
  );
  const r = find(libraryHealth([a, adrRow(209)], BASE_OPTS), "referential-integrity"); // no docExists
  assert.equal(r.level, "WARN");
  assert.ok(r.lines.some((l) => l.includes("doc:decisions/0000-no-such.md")), "decision still checked");
  assert.ok(
    !r.lines.some((l) => l.includes("doc:research/no-such-note.md")),
    "the disk-backed half is skipped, as it always was",
  );
});

test("referential-integrity FAILS CLOSED when there are decision pointers but no decision ROWS", () => {
  // Zero decision rows is never a clean index — it means an unreadable, unmigrated or wrong store.
  // Both available answers would be confidently wrong (all resolve = the silent zero this arc
  // exists to clear; all dangle = the 645-line false alarm it just cleared), so it reports neither.
  const r = refLines([`doc:decisions/${SLUG_0209}`, "doc:docs/decisions/0000-no-such.md"], []);
  assert.equal(r.level, "FAIL", "a report that cannot read its subject must not read as clean");
  assert.ok(r.lines.some((l) => l.includes("2 decision pointer(s) NOT CHECKED")));
  assert.ok(
    !r.lines.some((l) => l.includes("not in the store")),
    "and it does not dress an unreadable index up as dangling pointers",
  );
});

test("no decision pointer to check is not a failure — the fail-closed branch needs a subject", () => {
  // A corpus that cites no decisions has nothing to be unable to check, so an empty decision index
  // is unremarkable there. Without this the fail-closed branch would red every decision-free
  // projection, including the frozen 13-artifact fixture.
  const r = refLines(["doc:research/library-schema-migrations-and-health-checks.md"], []);
  assert.equal(r.level, "PASS");
  assert.ok(!r.lines.some((l) => l.includes("NOT CHECKED")));
});

test("referential-integrity reports how many decision pointers it checked, against how many rows", () => {
  // A check that ran and a check that found nothing to do are indistinguishable in a report that
  // only ever prints failures — which is how an instrument comes to read as clean after its subject
  // has moved out from under it. The census rides every outcome, clean or not.
  const r = refLines([`doc:decisions/${SLUG_0209}`, `doc:docs/decisions/${SLUG_0209}`]);
  assert.equal(r.level, "PASS");
  assert.ok(
    r.lines.some((l) => /2 decision pointer\(s\) resolved against 1 adr-NNNN rows/.test(l)),
    `expected a decision census line, got: ${r.lines.join(" | ")}`,
  );
});

test("referential-integrity leaves NON-decision doc: pointers exactly as authored", () => {
  // `doc:` is the scheme for ANY repository file, so research notes must keep resolving on disk —
  // and a missing one must still WARN rather than be swept into the decision arm.
  assert.equal(refLines(["doc:research/library-schema-migrations-and-health-checks.md"]).level, "PASS");
  assert.equal(refLines(["doc:research/no-such-note.md"]).level, "WARN");
});

test("referential-integrity does not treat a FOREIGN decisions/ tree as ours", () => {
  // `parseDecisionPointer` anchors at the start of the relative path precisely so a `vendor/`
  // directory's numbering cannot collide with the decision log's. It is therefore NOT a decision
  // pointer, must resolve on DISK as written, and must never be looked up as `adr-0001`.
  assert.equal(refLines(["doc:vendor/decisions/0001-not-ours.md"]).level, "PASS");
});

test("referential-integrity WARNs on a dangling node: pointer (ADR-0107 D2's third token)", () => {
  // A `node:<id>` ref used to fall through every arm and be silently ignored, so a citation of a
  // retired story dangled invisibly. WARN, not FAIL — like doc:, it points OUT of the library.
  const a = stored(validDefinitionBody({ id: "a", references: ["node:no-such-story"] }));
  const results = libraryHealth([a], { ...BASE_OPTS, nodeExists: () => false });
  const r = find(results, "referential-integrity");
  assert.equal(r.level, "WARN");
  assert.ok(r.lines.some((l) => l.includes("node:no-such-story")));
  assert.deepEqual(gateFailures(results), [], "still WARN-class — never a gate break");
});

test("referential-integrity PASSes a resolving node: pointer, and skips it with no resolver", () => {
  const a = stored(validDefinitionBody({ id: "a", references: ["node:cli"] }));
  assert.equal(
    find(libraryHealth([a], { ...BASE_OPTS, nodeExists: () => true }), "referential-integrity").level,
    "PASS",
  );
  assert.equal(
    find(libraryHealth([a], BASE_OPTS), "referential-integrity").level,
    "PASS",
    "no nodeExists injected => node: resolution is skipped, never failed",
  );
});

test("worstLevel / gateFailures / levelCounts agree on a FAIL-class break", () => {
  // A missing required field -> schema-conformance FAIL (a GATE check).
  const bad = validDefinitionBody();
  delete bad.whatItIs;
  const results = libraryHealth([stored(bad)], BASE_OPTS);
  assert.equal(worstLevel(results), "FAIL");
  const gf = gateFailures(results);
  assert.equal(gf.length, 1);
  assert.equal(gf[0]?.name, "schema-conformance");
  assert.ok(GATE_CHECKS.has("schema-conformance"));
  assert.equal(levelCounts(results).fail, 1);
});

test("gateFailures is EMPTY when only a WARN-class check is non-green", () => {
  // A dangling doc: pointer -> referential-integrity WARN (NOT a gate check) => no gate failures.
  const a = stored(validDefinitionBody({ id: "a", references: ["doc:missing/file.md"] }));
  const results = libraryHealth([a], { ...BASE_OPTS, docExists: () => false });
  assert.equal(worstLevel(results), "WARN");
  assert.deepEqual(gateFailures(results), []);
});

test("libraryHealthCheap omits the fs-heavy referential-integrity check", () => {
  const cheap = libraryHealthCheap([stored(validDefinitionBody())], BASE_OPTS);
  assert.equal(cheap.find((r) => r.name === "referential-integrity"), undefined);
  assert.ok(cheap.find((r) => r.name === "schema-conformance"));
});

// --- (b) FIXTURE gate test ---------------------------------------------------------------------

test("FIXTURE gate: the frozen fixture corpus has NO gate failures (schema/retired/version clean)", async () => {
  const store = new InMemoryStore();
  await loadFixtureCorpus(store);
  const docs = await store.queryDocs();
  const results = libraryHealth(docs, BASE_OPTS);
  const gf = gateFailures(results);
  assert.deepEqual(
    gf.map((r) => `${r.name}: ${r.lines.join("; ")}`),
    [],
    "the GATE-class checks must be clean on the frozen fixture (NOT a claim about the live corpus)",
  );
  // referential-integrity may be WARN — do NOT assert it as gating here.
});

// --- ADR-0306 D1: an increment's `cites` is RESOLVED and REPORTED, never gated ------------------

/** A valid closed increment carrying `cites` — the only kind that declares the field. */
function incrementWithCites(cites: string[]): StoredDoc {
  return stored({
    kind: "increment",
    id: "an-increment",
    title: "An increment",
    description: "one unit of arc work",
    objective: "deliver one thing",
    body: "the choreography",
    arcRef: "asset:an-arc",
    status: "ready",
    cites,
    schemaVersion: CURRENT_SCHEMA_VERSION,
    references: [],
    createdAt: "2026-08-08T00:00:00.000Z",
    updatedAt: "2026-08-08T00:00:00.000Z",
  });
}

test("referential-integrity WARNs on a story:/capability: ref this checkout cannot resolve", () => {
  // WARN-class, and that is a DECISION rather than leniency: what these point at is branch-dependent,
  // so an increment citing a story its own branch has not landed yet is legal (ADR-0306 D1). Failing
  // it would be a write-time rejection wearing a gate's clothes.
  const results = libraryHealth([incrementWithCites(["story:ghost", "capability:also-ghost"])], {
    ...BASE_OPTS,
    workUnitTier: () => null,
  });
  const r = find(results, "referential-integrity");
  assert.equal(r.level, "WARN");
  assert.ok(r.lines.some((l) => l.includes("story:ghost (no such story in this checkout)")));
  assert.ok(r.lines.some((l) => l.includes("capability:also-ghost (no such capability in this checkout)")));
  assert.deepEqual(gateFailures(results), [], "never a gate break — ADR-0306 D1 forbids the refusal");
});

test("referential-integrity reports a TIER MISMATCH as its own fault, not as absence", () => {
  const results = libraryHealth([incrementWithCites(["story:library-cli"])], {
    ...BASE_OPTS,
    workUnitTier: (id) => (id === "library-cli" ? "capability" : null),
  });
  const r = find(results, "referential-integrity");
  assert.equal(r.level, "WARN");
  assert.ok(
    r.lines.some((l) => l.includes("story:library-cli (exists, but as a capability — wrong scheme)")),
    `expected a wrong-scheme line, got: ${r.lines.join(" | ")}`,
  );
});

test("cites resolution is SKIPPED with no workUnitTier injected — never failed", () => {
  // The fail-open posture `docExists` and `nodeExists` already have, and load-bearing here: an
  // omitted resolver must not read as "nothing resolves", or every DB-free caller reds every ref.
  const results = libraryHealth([incrementWithCites(["story:ghost"])], BASE_OPTS);
  assert.equal(find(results, "referential-integrity").level, "PASS");
});

test("a resolving cites list passes, and a dangling asset: inside cites is still a FAIL", () => {
  const good = libraryHealth([incrementWithCites(["story:library"])], {
    ...BASE_OPTS,
    workUnitTier: (id) => (id === "library" ? "story" : null),
  });
  assert.equal(find(good, "referential-integrity").level, "PASS");

  // An `asset:` pointer inside `cites` is IN-library, so a break is a real graph break and keeps the
  // FAIL it has everywhere else. The scheme decides the severity, not the field it was written in.
  const bad = libraryHealth([incrementWithCites(["asset:no-such-artifact"])], {
    ...BASE_OPTS,
    workUnitTier: () => null,
  });
  const r = find(bad, "referential-integrity");
  assert.equal(r.level, "FAIL");
  assert.ok(r.lines.some((l) => l.includes("asset:no-such-artifact (no such artifact)")));
});
