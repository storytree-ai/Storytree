/**
 * Proof for the "verdict-glyphs" capability node.
 *
 * Covers:
 *   1. deriveVerdictGlyphs: empty → empty map; pass → ✓; higher-seq fail → ✗;
 *      yet-higher pass → ✓; same result when events fed out of seq order.
 *   2. grants-nothing: malformed doc, wrong kind, wrong unit — none mutate cap-a.
 *   3. glyphFor: null map → ""; map + unknown id → "–"; map + known id → stored glyph.
 *   4. readVerdictGlyphs: null reader → null; rejecting reader → null;
 *      valid reader → same map as deriveVerdictGlyphs.
 *   5. no-roll-up rule (named): passes for cap-a and cap-b only;
 *      glyphFor(map, "demo-story") → "–" — children's passes grant the story nothing.
 *
 * Offline only — no DB, no API keys.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { SIGNING_EVENT_KIND, Verdict } from "@storytree/proof-protocol";

import {
  deriveVerdictGlyphs,
  glyphFor,
  readVerdictGlyphs,
  type VerdictGlyph,
  type VerdictReaderLike,
} from "./tree-verdicts.js";

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

function signingEvent(
  seq: number,
  unitId: string,
  outcome: "pass" | "fail",
): { kind: string; seq: number; doc: unknown } {
  const doc: Verdict = {
    unitId,
    proofMode: "contract",
    outcome,
    commitSha: "abc123",
    signer: "test-signer",
    runId: "run-1",
    evidence: [],
    at: "2026-06-13T00:00:00.000Z",
    outputVersion: "v1",
  };
  return { kind: SIGNING_EVENT_KIND, seq, doc };
}

// ---------------------------------------------------------------------------
// (1) deriveVerdictGlyphs — sequential and out-of-order
// ---------------------------------------------------------------------------

test("deriveVerdictGlyphs: empty events → empty map", () => {
  const result = deriveVerdictGlyphs([]);
  assert.equal(result.size, 0);
});

test("deriveVerdictGlyphs: single pass for cap-a → ✓", () => {
  const events = [signingEvent(1, "cap-a", "pass")];
  const result = deriveVerdictGlyphs(events);
  assert.equal(result.get("cap-a"), "✓" satisfies VerdictGlyph);
});

test("deriveVerdictGlyphs: pass then higher-seq fail for cap-a → ✗", () => {
  const events = [
    signingEvent(1, "cap-a", "pass"),
    signingEvent(2, "cap-a", "fail"),
  ];
  const result = deriveVerdictGlyphs(events);
  assert.equal(result.get("cap-a"), "✗" satisfies VerdictGlyph);
});

test("deriveVerdictGlyphs: pass, fail, yet-higher pass for cap-a → ✓", () => {
  const events = [
    signingEvent(1, "cap-a", "pass"),
    signingEvent(2, "cap-a", "fail"),
    signingEvent(3, "cap-a", "pass"),
  ];
  const result = deriveVerdictGlyphs(events);
  assert.equal(result.get("cap-a"), "✓" satisfies VerdictGlyph);
});

test("deriveVerdictGlyphs: same result when events fed out of seq order", () => {
  const ordered = [
    signingEvent(1, "cap-a", "pass"),
    signingEvent(2, "cap-a", "fail"),
    signingEvent(3, "cap-a", "pass"),
  ];
  const shuffled = [
    signingEvent(3, "cap-a", "pass"),
    signingEvent(1, "cap-a", "pass"),
    signingEvent(2, "cap-a", "fail"),
  ];
  const fromOrdered = deriveVerdictGlyphs(ordered);
  const fromShuffled = deriveVerdictGlyphs(shuffled);
  assert.equal(fromOrdered.get("cap-a"), fromShuffled.get("cap-a"));
  assert.equal(fromOrdered.get("cap-a"), "✓" satisfies VerdictGlyph);
});

// ---------------------------------------------------------------------------
// (2) grants-nothing cases
// ---------------------------------------------------------------------------

test("deriveVerdictGlyphs: malformed doc (missing outcome) grants nothing", () => {
  // A signing event whose doc lacks `outcome` — safeParse fails → no entry
  const badEvent = {
    kind: SIGNING_EVENT_KIND,
    seq: 1,
    doc: {
      unitId: "cap-a",
      proofMode: "contract",
      // outcome intentionally omitted
      commitSha: "abc123",
      signer: "test-signer",
      runId: "run-1",
      at: "2026-06-13T00:00:00.000Z",
    },
  };
  const result = deriveVerdictGlyphs([badEvent]);
  assert.equal(result.has("cap-a"), false);
  assert.equal(result.size, 0);
});

test("deriveVerdictGlyphs: wrong kind event grants nothing to cap-a", () => {
  const workEvent = { kind: "work", seq: 1, doc: { unitId: "cap-a", event: "building", runId: "run-1" } };
  const result = deriveVerdictGlyphs([workEvent]);
  assert.equal(result.has("cap-a"), false);
  assert.equal(result.size, 0);
});

test("deriveVerdictGlyphs: verdict for different unit does not create cap-a entry", () => {
  const events = [signingEvent(1, "cap-b", "pass")];
  const result = deriveVerdictGlyphs(events);
  assert.equal(result.has("cap-a"), false);
  assert.equal(result.get("cap-b"), "✓" satisfies VerdictGlyph);
});

// ---------------------------------------------------------------------------
// (3) glyphFor
// ---------------------------------------------------------------------------

test("glyphFor: null glyphs (offline) → empty string", () => {
  assert.equal(glyphFor(null, "cap-a"), "");
});

test("glyphFor: map present but no entry for unit → – (never built)", () => {
  const map = deriveVerdictGlyphs([signingEvent(1, "cap-a", "pass")]);
  assert.equal(glyphFor(map, "never-built"), "–");
});

test("glyphFor: map present with entry for unit → stored glyph", () => {
  const map = deriveVerdictGlyphs([signingEvent(1, "cap-a", "pass")]);
  assert.equal(glyphFor(map, "cap-a"), "✓");
});

// ---------------------------------------------------------------------------
// (4) readVerdictGlyphs
// ---------------------------------------------------------------------------

test("readVerdictGlyphs: null reader → null", async () => {
  const result = await readVerdictGlyphs(null);
  assert.equal(result, null);
});

test("readVerdictGlyphs: reader whose readEvents rejects → null (swallowed)", async () => {
  const failingReader: VerdictReaderLike = {
    readEvents() {
      return Promise.reject(new Error("DB unavailable"));
    },
  };
  const result = await readVerdictGlyphs(failingReader);
  assert.equal(result, null);
});

test("readVerdictGlyphs: valid reader → same map as deriveVerdictGlyphs", async () => {
  const events = [
    signingEvent(1, "cap-a", "pass"),
    signingEvent(2, "cap-a", "fail"),
    signingEvent(3, "cap-a", "pass"),
    signingEvent(1, "cap-b", "pass"),
  ];
  const fakeReader: VerdictReaderLike = {
    readEvents() {
      return Promise.resolve(events);
    },
  };
  const result = await readVerdictGlyphs(fakeReader);
  assert.notEqual(result, null);
  const expected = deriveVerdictGlyphs(events);
  assert.equal(result!.size, expected.size);
  for (const [id, glyph] of expected) {
    assert.equal(result!.get(id), glyph);
  }
});

// ---------------------------------------------------------------------------
// (5) no-roll-up rule (named)
// ---------------------------------------------------------------------------

test("no-roll-up rule: cap-a and cap-b pass; demo-story has no verdict → – (never built)", () => {
  // Children passing does NOT grant the story a glyph — only a signed verdict
  // under the story's own unitId counts.
  const events = [
    signingEvent(1, "cap-a", "pass"),
    signingEvent(2, "cap-b", "pass"),
  ];
  const map = deriveVerdictGlyphs(events);
  assert.equal(map.has("demo-story"), false, "story absent from map — no roll-up");
  assert.equal(
    glyphFor(map, "demo-story"),
    "–",
    "children's passes grant the story nothing",
  );
});
