import test from "node:test";
import assert from "node:assert/strict";
import { ChangeEvent } from "@storytree/proof-protocol";
import { normalizeSpan, hashSpan, isDescribed, classifyDrift } from "./anchor-compute.js";

// ---------------------------------------------------------------------------
// normalizeSpan / hashSpan — cosmetic edits don't trip; real edits do
// ---------------------------------------------------------------------------

test("normalizeSpan: CRLF/LF, trailing whitespace, blank lines, outer trim", () => {
  assert.equal(normalizeSpan("a\r\nb"), "a\nb");
  assert.equal(normalizeSpan("a   \nb\t"), "a\nb");
  assert.equal(normalizeSpan("a\n\n\nb"), "a\nb");
  // Outer whitespace (incl. the first line's leading indent + the last line's trailing) is trimmed;
  // INTERIOR-line indentation is preserved (that's what catches a reindent — see hashSpan tests).
  assert.equal(normalizeSpan("\n\n  a\n    b  \n\n"), "a\n    b");
});

test("hashSpan: stable + cosmetic-invariant (the false-positive killers)", () => {
  const base = "function f() {\n  return 1;\n}";
  assert.equal(hashSpan(base), hashSpan(base), "deterministic");
  // CRLF vs LF — same hash.
  assert.equal(hashSpan(base), hashSpan(base.replace(/\n/g, "\r\n")));
  // Trailing whitespace — same hash.
  assert.equal(hashSpan(base), hashSpan("function f() {  \n  return 1;\t\n}"));
  // Blank lines added — same hash.
  assert.equal(hashSpan(base), hashSpan("function f() {\n\n  return 1;\n\n}"));
  // Outer blank lines — same hash.
  assert.equal(hashSpan(base), hashSpan("\n\nfunction f() {\n  return 1;\n}\n\n"));
});

test("hashSpan: a MEANINGFUL change trips it (the safe direction for a human UAT)", () => {
  const base = "function f() {\n  return 1;\n}";
  // A real value change.
  assert.notEqual(hashSpan(base), hashSpan("function f() {\n  return 2;\n}"));
  // An identifier rename — IDENTIFIERS ARE RETAINED, so a rename re-witnesses (ADR-0016 d.3).
  assert.notEqual(hashSpan(base), hashSpan("function g() {\n  return 1;\n}"));
  // A reindent (code moved into a block) — leading indentation is meaningful, so it trips.
  assert.notEqual(hashSpan(base), hashSpan("function f() {\n    return 1;\n}"));
});

test("hashSpan is a 128-bit FNV-1a fingerprint (32 hex chars)", () => {
  assert.match(hashSpan("x"), /^[0-9a-f]{32}$/);
  // Distinct inputs → distinct fingerprints (basic distribution sanity).
  assert.notEqual(hashSpan("x"), hashSpan("y"));
});

// ---------------------------------------------------------------------------
// isDescribed — the described-change gate
// ---------------------------------------------------------------------------

const change = (over: Partial<ChangeEvent> = {}): ChangeEvent =>
  ChangeEvent.parse({
    unitId: "library#uat-1",
    hashBefore: "h0",
    hashAfter: "h1",
    author: "me@x",
    at: "2026-06-15T00:00:00Z",
    ...over,
  });

test("isDescribed: non-blank description ⇒ described; absent/blank ⇒ demoted", () => {
  assert.equal(isDescribed(change()), false);
  assert.equal(isDescribed(change({ description: "" })), false);
  assert.equal(isDescribed(change({ description: "   " })), false);
  assert.equal(isDescribed(change({ description: "tightened the guard" })), true);
});

// ---------------------------------------------------------------------------
// classifyDrift — fresh / stale / drifted-undescribed
// ---------------------------------------------------------------------------

test("fresh: currentHash === boundHash, regardless of the change log", () => {
  const flag = classifyDrift("h1", "h1", [change({ description: "noise" })]);
  assert.equal(flag.state, "fresh");
  assert.equal(flag.drifted, false);
  assert.equal(flag.description, undefined);
});

test("stale: span changed AND a DESCRIBED change explains it, carrying the reason", () => {
  const flag = classifyDrift("h1", "h2", [
    change({ hashBefore: "h1", hashAfter: "h2", description: "changed the retry budget" }),
  ]);
  assert.equal(flag.state, "stale");
  assert.equal(flag.drifted, true);
  assert.equal(flag.description, "changed the retry budget");
  assert.equal(flag.currentHash, "h2");
  assert.equal(flag.boundHash, "h1");
});

test("drifted-undescribed: span changed but NO described change — DEMOTED, never a re-UAT trigger", () => {
  const flag = classifyDrift("h1", "h2", [
    change({ hashBefore: "h1", hashAfter: "h2" }), // undescribed
    change({ hashBefore: "h1", hashAfter: "h2", description: "  " }), // blank ⇒ demoted
  ]);
  assert.equal(flag.state, "drifted-undescribed");
  assert.equal(flag.drifted, true);
  assert.equal(flag.description, undefined);
});

test("drifted-undescribed: a changed span with an EMPTY change log is demoted, not stale", () => {
  // The owner's core bias: an out-of-loop hand-edit (hash differs, nobody described it) does NOT
  // re-witness — it surfaces only in the undescribed-divergence audit.
  const flag = classifyDrift("h1", "h2", []);
  assert.equal(flag.state, "drifted-undescribed");
  assert.equal(flag.description, undefined);
});

test("stale wins once ANY described change exists, even alongside undescribed churn", () => {
  const flag = classifyDrift("h1", "h3", [
    change({ hashBefore: "h1", hashAfter: "h2", description: "the real change" }),
    change({ hashBefore: "h2", hashAfter: "h3" }), // later undescribed tweak
  ]);
  assert.equal(flag.state, "stale");
  assert.equal(flag.description, "the real change");
});

test("the LATEST described change is the surfaced reason (valid-time order)", () => {
  const flag = classifyDrift("h1", "h3", [
    change({ at: "2026-06-15T00:00:00Z", description: "first" }),
    change({ at: "2026-06-16T00:00:00Z", description: "second (latest)" }),
  ]);
  assert.equal(flag.state, "stale");
  assert.equal(flag.description, "second (latest)");
});

test("end-to-end: real spans → hashes → classification", () => {
  const proved = "function add(a, b) {\n  return a + b;\n}";
  const boundHash = hashSpan(proved);
  // A purely cosmetic reformat is FRESH (no re-witness).
  const reformatted = "function add(a, b) {\n\n  return a + b;  \n}\n";
  assert.equal(classifyDrift(boundHash, hashSpan(reformatted), []).state, "fresh");
  // A real edit with a description is STALE.
  const edited = "function add(a, b) {\n  return a - b;\n}";
  const flag = classifyDrift(boundHash, hashSpan(edited), [
    change({
      unitId: "math#uat-1",
      hashBefore: boundHash,
      hashAfter: hashSpan(edited),
      description: "add → subtract",
    }),
  ]);
  assert.equal(flag.state, "stale");
  assert.equal(flag.description, "add → subtract");
});
