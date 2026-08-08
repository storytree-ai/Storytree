import { test } from "node:test";
import assert from "node:assert/strict";

import { CiteRef, Increment, parseCiteRef } from "./knowledge.js";
import { groupSources } from "./knowledge-sources.js";
import { validateLibraryDoc } from "./library-doc.js";
import { CURRENT_SCHEMA_VERSION } from "./migrations.js";

/**
 * ADR-0306 D1/D2 — the typed work-hierarchy citation edge, at the schema.
 *
 * The two clauses these tests exist to pin are the ones that are cheap to get backwards:
 * `cites` accepts three schemes and only three, and an UNRESOLVABLE ref is never refused at the
 * write boundary. The second is not a schema property that can be asserted directly (the schema
 * cannot resolve anything), so it is proved the way the substrate actually experiences it: a doc
 * citing a story that exists nowhere VALIDATES.
 */

const INCREMENT_BASE = {
  kind: "increment" as const,
  id: "an-increment",
  title: "An increment",
  description: "one unit of arc work",
  objective: "deliver one thing",
  body: "the choreography",
  arcRef: "asset:an-arc",
  status: "proposal" as const,
  parked: "2026-08-08T00:00:00Z",
  schemaVersion: CURRENT_SCHEMA_VERSION,
  references: [],
  createdAt: "2026-08-08T00:00:00Z",
  updatedAt: "2026-08-08T00:00:00Z",
};

test("cites accepts the three schemes ADR-0306 D2 names, mixed in one list", () => {
  const parsed = Increment.parse({
    ...INCREMENT_BASE,
    cites: ["story:library", "capability:library-cli", "asset:merge-ceremony"],
  });
  assert.deepEqual(parsed.cites, ["story:library", "capability:library-cli", "asset:merge-ceremony"]);
});

test("cites is optional, and an increment carrying none still validates", () => {
  // ADR-0308 D2: greenfield, planning, ADR work and arc landings name no capability at all. An
  // increment citing nothing is CORRECT, not under-specified — so absence must not be a schema error
  // and no surface may read it as a defect.
  const parsed = Increment.parse(INCREMENT_BASE);
  assert.equal(parsed.cites, undefined);
});

test("a doc: ref is refused in cites, for the reason it is refused in a ref list", () => {
  // ADR-0029: ADRs are SEARCHED just-in-time, never preloaded into assembled context. ADR-0306
  // extends the pointer vocabulary without extending that exemption, and says so explicitly.
  assert.equal(CiteRef.safeParse("doc:decisions/0306-typed-refs.md").success, false);
  assert.equal(CiteRef.safeParse("node:library").success, false, "node: is the tier-BLIND anchor");
  assert.equal(CiteRef.safeParse("library").success, false, "a bare id names no tier");
  assert.equal(CiteRef.safeParse("story:").success, false, "a scheme with no id names nothing");
});

test("one message names all three legal schemes, rather than a three-branch union dump", () => {
  const bad = CiteRef.safeParse("plan:something");
  assert.equal(bad.success, false);
  const message = bad.success ? "" : (bad.error.issues[0]?.message ?? "");
  for (const scheme of ["story:<id>", "capability:<id>", "asset:<id>"]) {
    assert.ok(message.includes(scheme), `the refusal should name ${scheme}; got: ${message}`);
  }
});

test("AN UNRESOLVABLE REF IS WRITABLE — the clause ADR-0306 D1 turns on", () => {
  // The work hierarchy is disk-canonical and BRANCH-DEPENDENT (ADR-0002/0010). Rejecting a ref that
  // resolves to nothing would make an increment unwritable on precisely the branch that creates the
  // story it plans, so an unresolvable ref is a REPORT (arc show / library --check) and never a
  // write-time refusal. Nothing here consults a stories tree, and that is the point.
  const doc = {
    ...INCREMENT_BASE,
    cites: ["story:a-story-no-branch-has-yet", "capability:not-here-either"],
  };
  assert.doesNotThrow(() => validateLibraryDoc(doc));
});

test("parseCiteRef splits the three schemes and refuses everything else", () => {
  assert.deepEqual(parseCiteRef("story:library"), { scheme: "story", id: "library" });
  assert.deepEqual(parseCiteRef("capability:library-cli"), {
    scheme: "capability",
    id: "library-cli",
  });
  assert.deepEqual(parseCiteRef("asset:merge-ceremony"), { scheme: "asset", id: "merge-ceremony" });
  for (const bad of ["node:library", "doc:decisions/x.md", "library", "story:", ":library", ""]) {
    assert.equal(parseCiteRef(bad), null, `${bad} should not parse as a citation pointer`);
  }
});

test("story:/capability: group under Story nodes, and the label carries the tier", () => {
  // They share the group with `node:` because they point at the same place — the work tree, not at
  // knowledge — and SOURCE_GROUP_ORDER's tail is a pinned invariant. The TIER is what these tokens
  // add over `node:`, so the label is what has to carry it: without it a reader could not tell a
  // cited story from a cited capability, which is the whole reason the schemes are typed.
  const groups = groupSources(["story:library", "capability:library-cli", "node:agent"], () => null);
  assert.deepEqual(
    groups.map((g) => g.group),
    ["Story nodes"],
  );
  assert.deepEqual(groups[0]?.items, [
    { ref: "story:library", label: "library (story)" },
    { ref: "capability:library-cli", label: "library-cli (capability)" },
    { ref: "node:agent", label: "agent" },
  ]);
});
