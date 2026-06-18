import test from "node:test";
import assert from "node:assert/strict";
import { isProvenStatus } from "./proof-status.js";

test("isProvenStatus: only healthy is proven", () => {
  assert.equal(isProvenStatus("healthy"), true);
  assert.equal(isProvenStatus("building"), false);
  assert.equal(isProvenStatus("proposed"), false);
  assert.equal(isProvenStatus("mapped"), false);
});
