import { test } from "node:test";
import assert from "node:assert/strict";

import {
  EDGE_FREE_KINDS,
  KIND_SPECS,
  Knowledge,
  DependsOnRef,
  arrayFieldsForKind,
  knownFieldsForKind,
  type KnowledgeKind,
} from "./knowledge.js";
import { validateLibraryDoc } from "./library-doc.js";

/**
 * ADR-0223 D1's `dependsOn` admission — the authored dependency edge, distinct from and additive to
 * the `references` citation web.
 *
 * These are SCHEMA assertions only. Whether a given corpus of authored edges is acyclic is
 * `knowledge-dag.ts`'s question and is proven in `knowledge-dag.test.ts`; the two are deliberately
 * separate, because admission must not depend on the corpus and enforcement must not depend on zod.
 */

const KINDS = Object.keys(KIND_SPECS) as KnowledgeKind[];

/** A minimal valid doc for a kind: common fields + every REQUIRED spec field. */
function minimalDoc(kind: KnowledgeKind) {
  const doc: Record<string, unknown> = {
    kind,
    id: `standson-${kind}`,
    title: `dependsOn ${kind}`,
    description: "dependsOn admission fixture",
    references: [],
    createdAt: "2026-08-14T00:00:00.000Z",
    updatedAt: "2026-08-14T00:00:00.000Z",
  };
  for (const spec of KIND_SPECS[kind]) {
    if (spec.required) {
      doc[spec.field] =
        spec.refList === true ? [`asset:standson-${spec.field}`] : `content for ${spec.field}`;
    }
  }
  if (kind === "increment") {
    doc["arcRef"] = "asset:standson-arc";
    doc["parked"] = "2026-08-14T00:00:00.000Z";
  }
  return doc satisfies Record<string, unknown>;
}

test("library-standson-admitted-on-dag-kinds: every kind outside the transient signal tier carries the edge", () => {
  const dagKinds = KINDS.filter((kind) => !EDGE_FREE_KINDS.has(kind));
  assert.ok(dagKinds.length > 0, "the fixture would prove nothing if every kind were edge-free");

  for (const kind of dagKinds) {
    const fields = knownFieldsForKind(kind);
    assert.ok(fields?.has("dependsOn"), `${kind} must carry dependsOn`);

    const parsed = Knowledge.parse({
      ...minimalDoc(kind),
      dependsOn: ["asset:red-green", "doc:decisions/0223-the-knowledge-dag.md"],
    });
    assert.deepEqual(
      (parsed as { dependsOn?: readonly string[] }).dependsOn,
      ["asset:red-green", "doc:decisions/0223-the-knowledge-dag.md"],
      `${kind} must round-trip the authored edge`,
    );
  }

  // The `references` web is UNTOUCHED by the admission (ADR-0223 D2): both fields coexist on the
  // same doc, carrying different targets, neither constraining the other.
  const both = Knowledge.parse({
    ...minimalDoc("principle"),
    references: ["asset:cites-me", "asset:red-green"],
    dependsOn: ["asset:red-green"],
  }) as { references: readonly string[]; dependsOn?: readonly string[] };
  assert.deepEqual(both.references, ["asset:cites-me", "asset:red-green"]);
  assert.deepEqual(both.dependsOn, ["asset:red-green"]);
});

test("library-standson-admitted-on-dag-kinds: the kinds outside the DAG stay edge-free, fail-closed", () => {
  // `definition` joins the two signal kinds for a DIFFERENT reason (ADR-0363 D1, amending ADR-0223
  // dec 3's tier 1): it is durable, but the depth it would contribute buys nothing a reader uses,
  // and it is the corpus's densest mutually-constitutive citation core.
  assert.deepEqual([...EDGE_FREE_KINDS].sort(), ["definition", "friction", "open-question"]);

  for (const kind of KINDS.filter((k) => EDGE_FREE_KINDS.has(k))) {
    assert.equal(
      knownFieldsForKind(kind)?.has("dependsOn"),
      false,
      `${kind} must not carry dependsOn (ADR-0223 D1)`,
    );
    // `.strict()` is what makes the exclusion real rather than advisory: authoring the edge on a
    // signal kind is REFUSED, not silently dropped.
    const result = Knowledge.safeParse({ ...minimalDoc(kind), dependsOn: ["asset:red-green"] });
    assert.equal(result.success, false, `${kind} must refuse an authored dependsOn`);
  }
});

test("library-standson-refs-are-asset-or-adr: the edge admits Library and ADR targets and refuses the rest", () => {
  for (const ok of [
    "asset:red-green",
    "asset:merge-ceremony",
    "asset:ADR_0223-x",
    "doc:decisions/0223-the-knowledge-dag-is-an-authored-standson-edge.md",
    "doc:research/agentic-foundation-survey.md",
  ]) {
    assert.equal(DependsOnRef.safeParse(ok).success, true, `${ok} must be admitted`);
  }

  // `node:` / `story:` / `capability:` name the WORK tree, not knowledge; a bare id names nothing
  // resolvable; an empty target is not a pointer at all.
  for (const bad of [
    "red-green",
    "node:library",
    "story:library",
    "capability:library-cli",
    "asset:",
    "doc:",
    "asset:has spaces",
    "",
  ]) {
    assert.equal(DependsOnRef.safeParse(bad).success, false, `${bad} must be refused`);
  }

  // A malformed entry inside the array reaches the write boundary as a REFUSAL, so a typo cannot
  // persist as a dangling edge the DAG would then walk past in silence.
  assert.throws(() =>
    validateLibraryDoc({ ...minimalDoc("principle"), dependsOn: ["not-a-pointer"] }),
  );
});

test("library-standson-absence-is-preserved: an existing doc without the edge needs no migration", () => {
  for (const kind of KINDS) {
    const before = minimalDoc(kind);
    const parsed = Knowledge.parse(before) as Record<string, unknown>;
    // OPTIONAL, not `.default([])`: absent stays absent, so a doc authored before ADR-0223 both
    // validates and re-serialises byte-identically. A default would stamp `dependsOn: []` across the
    // whole corpus on next write.
    assert.equal(
      "dependsOn" in parsed,
      false,
      `${kind}: an absent dependsOn must not be defaulted into the doc`,
    );
  }
});

test("library-standson-absence-is-preserved: the edit surface can write the edge as an array field", () => {
  // `artifact edit --set` refuses an array field it cannot see as one (it would persist the literal
  // JSON string). The set is derived from the live schema, so this is the assertion that the new
  // field is writable at all through the CLI.
  for (const kind of KINDS.filter((k) => !EDGE_FREE_KINDS.has(k))) {
    assert.ok(
      arrayFieldsForKind(kind)?.has("dependsOn"),
      `${kind}: dependsOn must be visible to the edit surface as an array field`,
    );
  }
});
