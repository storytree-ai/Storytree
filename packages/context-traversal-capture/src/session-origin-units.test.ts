/**
 * WHAT THIS SESSION WAS WORKING ON — story `context-traversal-capture`, capability
 * `terminal-capture-activation` (ADR-0541 D2), the second and automatic declaration channel beside
 * ADR-0487's `SessionStart` nudge.
 *
 * Its sibling `session-origin.test.ts` covers the ORIGIN half — how a session came to exist. This
 * file covers the UNIT half — what it claimed — and above all the seam between them: recording a
 * unit must never become a claim of origin, and declaring an origin must never delete a unit.
 *
 * Pure by construction like its sibling: every case injects the environment and the declaration
 * rather than touching `process.env` or the disk.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  declareSessionOrigin,
  foldSessionOrigin,
  lineCutFor,
  parseSessionOriginDeclaration,
  resolveSessionOrigin,
  resolveSessionUnits,
  withClaimedUnits,
  SESSION_ORIGIN_ENV,
} from "./session-origin.js";
import type { SessionOriginDeclaration } from "./session-origin.js";

const AT = "2026-09-07T00:00:00.000Z";
const LATER = "2026-09-07T02:00:00.000Z";

// ---------------------------------------------------------------------------
// withClaimedUnits — the declaration `noticeboard declare` writes
// ---------------------------------------------------------------------------

test("a session that has never declared records its unit WITHOUT claiming an origin", () => {
  // ⚠ The whole point of D2's second channel, and the fence on it. Before it, the unit rode an
  // established `cut` origin and was dropped without one — so a human-started session that claimed
  // real work recorded nothing at all. It now records the unit, and STILL says nothing about how it
  // came to exist: stamping an origin here would be exactly the inference ADR-0484 D7 refuses,
  // arriving through a back door on a path nobody would read as a provenance claim.
  const declaration = withClaimedUnits(null, ["map-arc-inc-01"], AT);
  assert.deepEqual(declaration, {
    v: 1,
    origin: null,
    cutBy: null,
    cutFor: null,
    units: ["map-arc-inc-01"],
    declaredAt: AT,
  });
  assert.equal(resolveSessionOrigin({ env: {}, declaration }), null);
});

test("a session claiming SEVERAL units records several, never one", () => {
  assert.deepEqual(withClaimedUnits(null, ["cap-a", "cap-b", "cap-c"], AT)?.units, [
    "cap-a",
    "cap-b",
    "cap-c",
  ]);
});

test("units ACCUMULATE across declares and never replace", () => {
  const first = withClaimedUnits(null, ["cap-a"], AT);
  const second = withClaimedUnits(first, ["cap-b"], LATER);
  assert.deepEqual(second?.units, ["cap-a", "cap-b"]);
  // `declaredAt` keeps the moment the session FIRST said something: restamping it would report a
  // later re-declare as the first one.
  assert.equal(second?.declaredAt, AT);
});

test("nothing new to record returns null, so the file is not rewritten", () => {
  const first = withClaimedUnits(null, ["cap-a"], AT);
  assert.equal(withClaimedUnits(first, ["cap-a"], LATER), null);
  assert.equal(withClaimedUnits(first, ["", "   "], LATER), null);
  assert.equal(withClaimedUnits(null, [], AT), null);
});

test("an ESTABLISHED origin survives a later claim untouched", () => {
  const declared: SessionOriginDeclaration = {
    v: 1,
    origin: "cut",
    cutBy: "predecessor-window",
    cutFor: "some-arc",
    units: [],
    declaredAt: AT,
  };
  const after = withClaimedUnits(declared, ["cap-a"], LATER);
  assert.equal(after?.origin, "cut");
  assert.equal(after?.cutBy, "predecessor-window");
  assert.equal(after?.cutFor, "some-arc");
  assert.deepEqual(after?.units, ["cap-a"]);
});

// ---------------------------------------------------------------------------
// The two channels must not overwrite each other
// ---------------------------------------------------------------------------

test("re-declaring an ORIGIN does not delete the units already claimed", () => {
  // The write is a whole-file REPLACE, so this is the failure the judge's `existing` parameter
  // exists to make impossible: a session claims work, later runs `traversal origin`, and silently
  // loses the record of what it was working on.
  const existing = withClaimedUnits(null, ["cap-a", "cap-b"], AT);
  const outcome = declareSessionOrigin({ origin: "human" }, LATER, existing);
  assert.ok("declaration" in outcome);
  assert.deepEqual(outcome.declaration.units, ["cap-a", "cap-b"]);
  assert.equal(outcome.declaration.origin, "human");
});

test("the origin verb's three refusals are unchanged by the units carrying through", () => {
  const existing = withClaimedUnits(null, ["cap-a"], AT);
  assert.deepEqual(declareSessionOrigin({ origin: "agent" }, LATER, existing), {
    refusedBecause: "origin-word-unknown",
  });
  assert.deepEqual(declareSessionOrigin({ origin: "human", cutFor: "x" }, LATER, existing), {
    refusedBecause: "human-carries-no-cut-riders",
  });
  assert.deepEqual(declareSessionOrigin({ cutFor: "x" }, LATER, existing), {
    refusedBecause: "cut-for-alone-declares-nothing",
  });
});

test("a units-only declaration wins NOTHING about origin — the environment still establishes it", () => {
  // A claim erasing a claim is the failure: `noticeboard declare` writes this file, and if the
  // reader treated it as the winning answer for ORIGIN too, claiming work would silently
  // un-declare an origin the launcher had already set.
  const declaration = withClaimedUnits(null, ["cap-a"], AT);
  assert.deepEqual(resolveSessionOrigin({ env: { [SESSION_ORIGIN_ENV]: "human" }, declaration }), {
    kind: "human",
    cutBy: null,
    cutFor: null,
  });
});

test("a declaration written before units existed reads as claiming none, and an unknown origin word is STILL no claim at all", () => {
  assert.deepEqual(parseSessionOriginDeclaration({ v: 1, origin: "cut", cutBy: "a" }), {
    v: 1,
    origin: "cut",
    cutBy: "a",
    cutFor: null,
    units: [],
    declaredAt: null,
  });
  // An unusable `units` degrades to none rather than rejecting the ORIGIN — the rider rule.
  assert.deepEqual(parseSessionOriginDeclaration({ v: 1, origin: "cut", units: "cap-a" })?.units, []);
  // ⚠ ABSENT and UNRECOGNISED must not collapse: the first is the units-only shape and is accepted,
  // the second is a file this reader cannot vouch for and is rejected whole.
  assert.deepEqual(parseSessionOriginDeclaration({ v: 1, units: ["cap-a"] })?.origin, null);
  assert.equal(parseSessionOriginDeclaration({ v: 1, origin: "agent", units: ["cap-a"] }), null);
});

// ---------------------------------------------------------------------------
// resolveSessionUnits / lineCutFor — the plural rider a trace line carries
// ---------------------------------------------------------------------------

test("the origin's cutFor and the claimed units are UNIONED, deduped, first-seen order", () => {
  const declaration = withClaimedUnits(null, ["cap-a", "some-arc"], AT);
  assert.deepEqual(
    resolveSessionUnits({ origin: { kind: "cut", cutBy: "p", cutFor: "some-arc" }, declaration }),
    ["some-arc", "cap-a"],
  );
});

test("units are recorded WITHOUT an origin, and an origin without units is fine too", () => {
  assert.deepEqual(
    resolveSessionUnits({ origin: null, declaration: withClaimedUnits(null, ["cap-a"], AT) }),
    ["cap-a"],
  );
  assert.deepEqual(
    resolveSessionUnits({ origin: { kind: "human", cutBy: null, cutFor: null }, declaration: null }),
    [],
  );
  assert.deepEqual(resolveSessionUnits({ origin: null, declaration: null }), []);
});

test("one unit stays a BARE STRING so every earlier line's bytes still read the same", () => {
  assert.equal(lineCutFor(["cap-a"]), "cap-a");
  assert.equal(lineCutFor([]), null);
  assert.deepEqual(lineCutFor(["cap-a", "cap-b"]), ["cap-a", "cap-b"]);
});

test("the fold reads a LIST rider, and a bare string still names one", () => {
  // One appended batch carries one identity stamp, so a session claiming several units has nowhere
  // to put the plural but inside the rider. The fold is the one place that decides what names
  // somebody, so it is the one place that has to learn the list form — and the Postgres reader gets
  // it for free by calling the same function.
  const folded = foldSessionOrigin([
    { origin: "cut", cutBy: "p", cutFor: ["cap-a", "cap-b"] },
    { origin: "cut", cutBy: "p", cutFor: "cap-b" },
    { origin: "cut", cutBy: "p", cutFor: "cap-c" },
  ]);
  assert.deepEqual(folded.cutFor, ["cap-a", "cap-b", "cap-c"]);
  assert.deepEqual(folded.cutBy, ["p"]);
});

test("a list rider's junk entries name nobody, and a junk rider is not an origin claim", () => {
  const folded = foldSessionOrigin([
    { origin: undefined, cutBy: null, cutFor: ["", 42, null, "cap-a"] },
    { origin: undefined, cutBy: null, cutFor: {} },
  ]);
  assert.deepEqual(folded.cutFor, ["cap-a"]);
  assert.equal(folded.reading, "unknown");
});
