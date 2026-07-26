import assert from "node:assert/strict";
import test from "node:test";

import { evaluateNodeVersion, parseMajor, parseRequiredMajor } from "./check-node-version.js";

test("parseMajor reads the major from both v-prefixed and bare versions", () => {
  assert.equal(parseMajor("v24.15.0"), 24);
  assert.equal(parseMajor("22.22.2"), 22);
  assert.equal(parseMajor("nonsense"), null);
});

test("parseRequiredMajor reads the floor out of a >=N range", () => {
  assert.equal(parseRequiredMajor(">=24"), 24);
  assert.equal(parseRequiredMajor(">= v20.1.0"), 20);
  assert.equal(parseRequiredMajor("^24.0.0"), null, "only the >=N shape is understood");
});

test("a runtime at or above the floor is OK", () => {
  assert.equal(evaluateNodeVersion("v24.15.0", ">=24").verdict, "ok");
  assert.equal(evaluateNodeVersion("v25.0.0", ">=24").verdict, "ok");
});

test("the measured remote-container drift (Node 22 against a >=24 floor) WARNs", () => {
  const res = evaluateNodeVersion("v22.22.2", ">=24");
  assert.equal(res.verdict, "warn");
  assert.match(res.message, /BELOW engines\.node/);
  assert.match(res.message, /does not guarantee a green CI/);
});

test("an unparseable engines range or runtime SKIPs rather than warning (advisory rungs stay quiet)", () => {
  assert.equal(evaluateNodeVersion("v24.15.0", "^24.0.0").verdict, "skip");
  assert.equal(evaluateNodeVersion("weird", ">=24").verdict, "skip");
  assert.equal(evaluateNodeVersion("v24.15.0", undefined).verdict, "skip");
});
