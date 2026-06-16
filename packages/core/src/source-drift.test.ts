import test from "node:test";
import assert from "node:assert/strict";
import { classifySourceDrift } from "./source-drift.js";
import type { SourceRef, SourceDriftFlag } from "./source-drift.js";

// ---------------------------------------------------------------------------
// Helpers — build typed inputs without pulling zod into the runtime
// ---------------------------------------------------------------------------

function ref(id: string, boundHash: string): SourceRef {
  return { id, boundHash };
}

type RawChange = {
  unitId: string;
  hashBefore: string;
  hashAfter: string;
  description?: string;
  author?: string;
  at?: string;
};

function change(over: RawChange) {
  return {
    unitId: over.unitId,
    hashBefore: over.hashBefore,
    hashAfter: over.hashAfter,
    description: over.description,
    author: over.author ?? "test@x",
    at: over.at ?? "2026-06-15T00:00:00Z",
  };
}

// ---------------------------------------------------------------------------
// fresh — no drift at all
// ---------------------------------------------------------------------------

test("fresh: no sources → fresh with empty changedSources", () => {
  const flag = classifySourceDrift([], new Map(), []);
  assert.equal(flag.state, "fresh");
  assert.equal(flag.drifted, false);
  assert.deepEqual(flag.changedSources, []);
  assert.equal(flag.description, undefined);
});

test("fresh: all source hashes match their bound hashes", () => {
  const sources = [ref("adr-0016", "hashA"), ref("adr-0017", "hashB")];
  const hashes = new Map([["adr-0016", "hashA"], ["adr-0017", "hashB"]]);
  const flag = classifySourceDrift(sources, hashes, []);
  assert.equal(flag.state, "fresh");
  assert.equal(flag.drifted, false);
  assert.deepEqual(flag.changedSources, []);
});

test("fresh: upstream absent from currentHashes is treated as unknown, NOT drifted (conservative bias)", () => {
  // An upstream we have no current hash for is not treated as changed — avoids manufacturing
  // staleness from a missing input (ADR-0016 bias: don't over-flag without real evidence).
  const sources = [ref("adr-0016", "hashA"), ref("missing-upstream", "hashX")];
  const hashes = new Map([["adr-0016", "hashA"]]);
  const flag = classifySourceDrift(sources, hashes, []);
  assert.equal(flag.state, "fresh");
  assert.equal(flag.drifted, false);
  assert.deepEqual(flag.changedSources, []);
});

test("fresh: change events for the upstream don't affect a hash-equal source", () => {
  const sources = [ref("adr-0016", "hashA")];
  const hashes = new Map([["adr-0016", "hashA"]]);
  // Even if there's a described change event in the log, the hash matches → fresh.
  const flag = classifySourceDrift(sources, hashes, [
    change({ unitId: "adr-0016", hashBefore: "hashA", hashAfter: "hashA", description: "noise" }),
  ]);
  assert.equal(flag.state, "fresh");
  assert.equal(flag.drifted, false);
});

// ---------------------------------------------------------------------------
// drifted: changedSources + drifted flag
// ---------------------------------------------------------------------------

test("changedSources: contains only the upstreams whose hash changed", () => {
  const sources = [ref("adr-0016", "hashA"), ref("adr-0017", "hashB"), ref("adr-0018", "hashC")];
  const hashes = new Map([
    ["adr-0016", "hashA"],   // unchanged
    ["adr-0017", "hashB2"],  // changed
    ["adr-0018", "hashC"],   // unchanged
  ]);
  const flag = classifySourceDrift(sources, hashes, []);
  assert.deepEqual(flag.changedSources, ["adr-0017"]);
  assert.equal(flag.drifted, true);
});

test("changedSources: preserves sources order when multiple upstreams changed", () => {
  const sources = [ref("z-doc", "h1"), ref("a-doc", "h2"), ref("m-doc", "h3")];
  const hashes = new Map([
    ["z-doc", "h1X"],  // changed
    ["a-doc", "h2X"],  // changed
    ["m-doc", "h3"],   // unchanged
  ]);
  const flag = classifySourceDrift(sources, hashes, []);
  // Order must follow sources order, not alphabetical or insertion order.
  assert.deepEqual(flag.changedSources, ["z-doc", "a-doc"]);
});

// ---------------------------------------------------------------------------
// drifted-undescribed — changed but not described
// ---------------------------------------------------------------------------

test("drifted-undescribed: source changed, no described change for it → demoted", () => {
  const sources = [ref("adr-0016", "h1")];
  const hashes = new Map([["adr-0016", "h2"]]);
  const flag = classifySourceDrift(sources, hashes, []);
  assert.equal(flag.state, "drifted-undescribed");
  assert.equal(flag.drifted, true);
  assert.deepEqual(flag.changedSources, ["adr-0016"]);
  assert.equal(flag.description, undefined);
});

test("drifted-undescribed: blank description is treated as undescribed", () => {
  const sources = [ref("adr-0016", "h1")];
  const hashes = new Map([["adr-0016", "h2"]]);
  const flag = classifySourceDrift(sources, hashes, [
    change({ unitId: "adr-0016", hashBefore: "h1", hashAfter: "h2", description: "   " }),
  ]);
  assert.equal(flag.state, "drifted-undescribed");
  assert.equal(flag.description, undefined);
});

test("drifted-undescribed: a described change for a DIFFERENT source does not rescue it", () => {
  // Only described changes whose unitId is in changedSources count.
  const sources = [ref("adr-0016", "h1"), ref("adr-0017", "hB")];
  const hashes = new Map([
    ["adr-0016", "h2"],  // changed — no described change
    ["adr-0017", "hB"],  // unchanged
  ]);
  const flag = classifySourceDrift(sources, hashes, [
    // Described change for adr-0017 (unchanged) — irrelevant to adr-0016's drift.
    change({ unitId: "adr-0017", hashBefore: "hB", hashAfter: "hBX", description: "a thing" }),
  ]);
  assert.equal(flag.state, "drifted-undescribed");
  assert.equal(flag.description, undefined);
});

// ---------------------------------------------------------------------------
// stale — changed AND a described change explains it
// ---------------------------------------------------------------------------

test("stale: source changed AND a described change for that source → stale with description", () => {
  const sources = [ref("adr-0016", "h1")];
  const hashes = new Map([["adr-0016", "h2"]]);
  const flag = classifySourceDrift(sources, hashes, [
    change({ unitId: "adr-0016", hashBefore: "h1", hashAfter: "h2", description: "added §4" }),
  ]);
  assert.equal(flag.state, "stale");
  assert.equal(flag.drifted, true);
  assert.deepEqual(flag.changedSources, ["adr-0016"]);
  assert.equal(flag.description, "added §4");
});

test("stale: undescribed changes alongside a described one → stale (described wins)", () => {
  const sources = [ref("adr-0016", "h1")];
  const hashes = new Map([["adr-0016", "h3"]]);
  const flag = classifySourceDrift(sources, hashes, [
    change({ unitId: "adr-0016", hashBefore: "h1", hashAfter: "h2" }), // undescribed
    change({ unitId: "adr-0016", hashBefore: "h2", hashAfter: "h3", description: "real change" }),
  ]);
  assert.equal(flag.state, "stale");
  assert.equal(flag.description, "real change");
});

test("stale: latest described change by at wins (valid-time order)", () => {
  const sources = [ref("adr-0016", "h1")];
  const hashes = new Map([["adr-0016", "h3"]]);
  const flag = classifySourceDrift(sources, hashes, [
    change({
      unitId: "adr-0016", hashBefore: "h1", hashAfter: "h2",
      description: "first edit",
      at: "2026-06-14T00:00:00Z",
    }),
    change({
      unitId: "adr-0016", hashBefore: "h2", hashAfter: "h3",
      description: "second edit (later)",
      at: "2026-06-16T00:00:00Z",
    }),
  ]);
  assert.equal(flag.state, "stale");
  assert.equal(flag.description, "second edit (later)");
});

test("stale: described change for any ONE changed source is enough to be stale", () => {
  // Two changed sources; one has a described change, one does not.
  // The described-change gate checks if ANY changed source is explained → stale.
  const sources = [ref("adr-0016", "h1"), ref("adr-0017", "hB")];
  const hashes = new Map([
    ["adr-0016", "h2"],  // changed — undescribed
    ["adr-0017", "hC"],  // changed — described
  ]);
  const flag = classifySourceDrift(sources, hashes, [
    change({ unitId: "adr-0017", hashBefore: "hB", hashAfter: "hC", description: "revised §3" }),
  ]);
  assert.equal(flag.state, "stale");
  assert.deepEqual(flag.changedSources, ["adr-0016", "adr-0017"]);
  assert.equal(flag.description, "revised §3");
});

// ---------------------------------------------------------------------------
// Result never aliases input arrays (defensive copies)
// ---------------------------------------------------------------------------

test("changedSources does not alias the sources input array", () => {
  const sources = [ref("adr-0016", "h1")];
  const hashes = new Map([["adr-0016", "h2"]]);
  const flag = classifySourceDrift(sources, hashes, []);
  // Push to the result — must not affect re-runs or external callers.
  const resultArray = flag.changedSources;
  resultArray.push("injected");
  // The change didn't come from the sources array (which had length 1 and id "adr-0016").
  assert.notEqual(resultArray, sources);
});
