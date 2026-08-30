import test from "node:test";
import assert from "node:assert/strict";

import { agentManifestRefs } from "./agent-manifest.js";

/**
 * The agent tier's manifest reader (ADR-0481 D1), as a pure function over a stored row or a wire doc.
 *
 * Hermetic by construction — literal docs, no store, no credential (ADR-0302 D3). The shapes below
 * are TRANSCRIBED from the live corpus on 2026-08-30 rather than invented: the raw row holds arrays
 * at the top level, `renderStoredDoc` nests the same fields under `fields` AND joins each refList
 * into one newline-delimited string, and `stepRefs` survives as an array of `{step, refs}` on both.
 * Every assertion here is written so that a reader knowing only ONE of those shapes fails it — which
 * is the whole failure this module exists to close, and the one that returns a plausible zero rather
 * than an error.
 */

test("agent-manifest-reads-the-raw-row: the three refLists and stepRefs, `asset:` stripped", () => {
  const raw = {
    kind: "agent",
    id: "session-orchestrator",
    context: ["asset:merge-ceremony"],
    rules: ["asset:slow-growth-minimum-to-green", "asset:register-follows-audience"],
    antiPatterns: ["asset:never-bypass-the-gate"],
    stepRefs: [{ step: "session_start", refs: ["asset:pull-based-context-architecture"] }],
  };

  assert.deepEqual(agentManifestRefs(raw), [
    "merge-ceremony",
    "slow-growth-minimum-to-green",
    "register-follows-audience",
    "never-bypass-the-gate",
    "pull-based-context-architecture",
  ]);
});

test("agent-manifest-reads-the-wire-identically: nested under `fields`, refLists newline-joined", () => {
  // The SAME agent as above, exactly as `renderStoredDoc` hands it to the studio panel. A reader
  // taking the wire's TOP level finds nothing at all here and reports a confident zero; one that
  // finds `fields` but expects arrays finds nothing either, because these are strings.
  const wire = {
    id: "session-orchestrator",
    category: "agent",
    title: "The session orchestrator",
    fields: {
      context: "asset:merge-ceremony",
      rules: "asset:slow-growth-minimum-to-green\nasset:register-follows-audience",
      antiPatterns: "asset:never-bypass-the-gate",
      stepRefs: [{ step: "session_start", refs: ["asset:pull-based-context-architecture"] }],
    },
  };

  assert.deepEqual(agentManifestRefs(wire), [
    "merge-ceremony",
    "slow-growth-minimum-to-green",
    "register-follows-audience",
    "never-bypass-the-gate",
    "pull-based-context-architecture",
  ]);
});

test("agent-manifest-refuses-a-non-agent-row: an open-question's `context` is PROSE, not pointers", () => {
  // 26 `open-question` rows carried a `context` field on 2026-08-30 and every one of them is prose.
  // Newline-splitting it without the kind gate manufactures pointers out of English sentences — and
  // they would then be counted as dangling targets, which reads as a corpus problem rather than a
  // reader bug.
  const question = {
    kind: "open-question",
    id: "oq-something",
    context: "The panel reads the wire.\nThe probe reads the raw row.\nThey disagreed.",
  };

  assert.deepEqual(agentManifestRefs(question), []);
});

test("agent-manifest-admits-only-`asset:` pointers: the belt to the kind gate's brace", () => {
  // Prose that reached an agent's refList — through an older schema, a bad edit, a branch this
  // checkout does not have. It is not a pointer and must not become an edge.
  const raw = {
    kind: "agent",
    context: ["asset:real-target", "just some prose", "", "story:studio", "doc:decisions/0001.md"],
  };

  assert.deepEqual(agentManifestRefs(raw), ["real-target"]);
});

test("agent-manifest-dedupes-across-fields: one target named twice is one edge", () => {
  const raw = {
    kind: "agent",
    rules: ["asset:shared"],
    antiPatterns: ["asset:shared"],
    stepRefs: [{ step: "a", refs: ["asset:shared"] }],
  };

  assert.deepEqual(agentManifestRefs(raw), ["shared"]);
});

test("agent-manifest-is-total-over-junk: a surprise row projects as no manifest, never a throw", () => {
  // This runs over the LIVE corpus, so a row written by a newer schema must not take a surface down.
  for (const doc of [null, undefined, "a string", 42, [], { kind: "agent" }, { kind: "agent", rules: 7 }]) {
    assert.deepEqual(agentManifestRefs(doc), []);
  }
  // A `stepRefs` entry that is not an object, and one whose `refs` is not a list.
  assert.deepEqual(
    agentManifestRefs({ kind: "agent", stepRefs: ["not-an-object", null, { step: "a", refs: 3 }] }),
    [],
  );
});

test("agent-manifest-takes-the-row's-own-kind-over-a-rendered-one", () => {
  // `kind` on the raw row, `category` on the wire — both spellings are live, exactly as `kindOfDoc`
  // reads them. A row whose own `kind` says it is not an agent is not one, whatever a nested
  // rendering claims.
  assert.deepEqual(agentManifestRefs({ kind: "principle", fields: { category: "agent" }, rules: ["asset:x"] }), []);
  assert.deepEqual(agentManifestRefs({ category: "agent", fields: { rules: "asset:x" } }), ["x"]);
});

test("agent-manifest-trims-a-pointer-on-both-sides-of-the-scheme", () => {
  // The wire's refLists are newline-joined, so an authored trailing space or a CRLF line ending
  // arrives ATTACHED to the id. Untrimmed, `asset:merge-ceremony ` resolves against no artifact and
  // is counted as a dangling target — a corpus complaint produced entirely by a reader.
  const raw = { kind: "agent", rules: ["  asset:padded-outside  ", "asset:  padded-inside  "] };
  assert.deepEqual(agentManifestRefs(raw), ["padded-outside", "padded-inside"]);

  const wire = { category: "agent", fields: { rules: "asset:first\r\nasset:second" } };
  assert.deepEqual(agentManifestRefs(wire), ["first", "second"]);
});

test("agent-manifest-drops-a-scheme-naming-nothing, and a non-string entry beside a real one", () => {
  // A bare `asset:` names no artifact. Admitting it would add `""` to the edge set, which then reads
  // as a dangling pointer rather than as the empty field it is.
  assert.deepEqual(agentManifestRefs({ kind: "agent", rules: ["asset:", "asset:   ", "asset:real"] }), ["real"]);
  // A non-string entry sitting BESIDE a good one — the shape that proves the guard skips the entry
  // rather than abandoning the field.
  assert.deepEqual(agentManifestRefs({ kind: "agent", rules: [42, "asset:real", null, { a: 1 }] }), ["real"]);
});

test("agent-manifest-survives-a-`fields`-that-is-not-an-object, and still reads the top level", () => {
  // `renderStoredDoc`'s degraded branch emits no `fields` at all, and a row from another branch could
  // carry anything there. Spreading a string would merge its CHARACTERS into the bag.
  for (const fields of [null, "a string", 42]) {
    assert.deepEqual(agentManifestRefs({ kind: "agent", fields, rules: ["asset:x"] }), ["x"]);
  }
});

test("agent-manifest-refuses-a-`fields`-that-is-not-a-RECORD: a callable's own keys are not manifest fields", () => {
  // The sibling above proves the `fields` guard is REACHED. This one proves it does WORK, and the
  // distinction is the whole point: `null`, `"a string"` and `42` contribute NO own enumerable
  // properties when spread, so that test stays green with the guard deleted — it pins the outcome,
  // not the guard, and a reader could delete the check without a single assertion moving.
  //
  // A FUNCTION is the value that separates the two programs. It is the one `typeof !== "object"`
  // value that carries ARBITRARY own enumerable properties, so an ungated `{ ...fields, ...top }`
  // merges `fields.rules` into the bag and mints an edge to an artifact no agent ever named. That is
  // this module's own failure mode one level up from the `asset:` guard — a reader manufacturing a
  // pointer out of something that was never one — and here it fabricates a target rather than a
  // sentence, which is worse, because a fabricated `asset:` id is indistinguishable from a real edge.
  const callableFields = (): void => {};
  callableFields.rules = ["asset:ghost"];

  assert.deepEqual(
    agentManifestRefs({ kind: "agent", fields: callableFields, context: ["asset:real"] }),
    ["real"],
  );
});
