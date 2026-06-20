import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { InMemoryStore } from "@storytree/storage-protocol";
import { hashSpan } from "@storytree/orchestrator";
import type { DriftFlag } from "@storytree/proof-protocol";

import { driftEnvelope, runDrift, driftHelp } from "./drift.js";
import { run } from "./commands.js";

const flag = (over: Partial<DriftFlag>): DriftFlag => ({
  state: "fresh",
  drifted: false,
  description: undefined,
  boundHash: "b",
  currentHash: "b",
  ...over,
});

// ---------------------------------------------------------------------------
// driftEnvelope — distinct rendering per state
// ---------------------------------------------------------------------------

test("driftEnvelope: FRESH is ok, distinct, no 'changed:' line", () => {
  const e = driftEnvelope("math#uat-1", flag({ state: "fresh" }));
  assert.equal(e.ok, true);
  assert.match(e.body, /✓ math#uat-1 — FRESH/);
  assert.doesNotMatch(e.body, /changed:/);
});

test("driftEnvelope: STALE is distinct and carries the reason + the new bound hash", () => {
  const e = driftEnvelope("math#uat-1", flag({ state: "stale", drifted: true, description: "add → subtract", boundHash: "b", currentHash: "c" }));
  assert.equal(e.ok, true);
  assert.match(e.body, /⚠ math#uat-1 — STALE/);
  assert.match(e.body, /changed: add → subtract/);
  assert.ok(e.next?.some((n) => n.includes("c")), "surfaces the current hash to re-bind");
});

test("driftEnvelope: DRIFTED-UNDESCRIBED is its OWN state, never stale, never green", () => {
  const e = driftEnvelope("math#uat-1", flag({ state: "drifted-undescribed", drifted: true, currentHash: "c" }));
  assert.equal(e.ok, true);
  assert.match(e.body, /\? math#uat-1 — DRIFTED \(undescribed\)/);
  assert.match(e.body, /DEMOTED .* NOT a re-UAT trigger/);
  assert.doesNotMatch(e.body, /changed:/);
});

test("driftEnvelope: the three states render with DISTINCT glyphs", () => {
  const g = (s: DriftFlag["state"]) => driftEnvelope("u", flag({ state: s })).body[0];
  assert.equal(new Set([g("fresh"), g("stale"), g("drifted-undescribed")]).size, 3);
});

// ---------------------------------------------------------------------------
// runDrift — read + fingerprint + classify (injected reader)
// ---------------------------------------------------------------------------

const reader = (content: string) => () => content;

test("runDrift: file matches the bound hash → FRESH", () => {
  const content = "function f() {\n  return 1;\n}";
  const e = runDrift({ file: "x.ts", bound: hashSpan(content) }, reader(content));
  assert.match(e.body, /FRESH/);
});

test("runDrift: file differs with NO --change → DRIFTED-UNDESCRIBED (demoted)", () => {
  const e = runDrift({ file: "x.ts", bound: "an-old-hash" }, reader("changed code"));
  assert.match(e.body, /DRIFTED \(undescribed\)/);
});

test("runDrift: file differs WITH --change → STALE carrying the reason", () => {
  const e = runDrift(
    { file: "x.ts", bound: "an-old-hash", changes: ["tightened the retry budget"] },
    reader("changed code"),
  );
  assert.match(e.body, /STALE/);
  assert.match(e.body, /changed: tightened the retry budget/);
});

test("runDrift: a blank --change does NOT promote a divergence (stays demoted)", () => {
  const e = runDrift({ file: "x.ts", bound: "old", changes: ["   "] }, reader("new"));
  assert.match(e.body, /DRIFTED \(undescribed\)/);
});

test("runDrift: the LAST --change is the surfaced reason", () => {
  const e = runDrift(
    { file: "x.ts", bound: "old", changes: ["first", "second (latest)"] },
    reader("new"),
  );
  assert.match(e.body, /changed: second \(latest\)/);
});

test("runDrift: cosmetic-only edit is FRESH (the normalize seam — no false re-proof)", () => {
  const proved = "function f() {\n  return 1;\n}";
  const bound = hashSpan(proved);
  const reformatted = "function f() {\n\n  return 1;  \r\n}\n"; // blank line + trailing ws + CRLF
  const e = runDrift({ file: "x.ts", bound, changes: ["noise"] }, reader(reformatted));
  assert.match(e.body, /FRESH/, "a cosmetic reformat must not go stale");
});

test("runDrift: missing --file / --bound are usage guidance (ok:false), not throws", () => {
  assert.equal(runDrift({ bound: "h" }, reader("x")).ok, false);
  assert.equal(runDrift({ file: "x.ts" }, reader("x")).ok, false);
});

test("runDrift: an unreadable file is guidance, not a throw", () => {
  const e = runDrift({ file: "nope.ts", bound: "h" }, () => {
    throw new Error("ENOENT");
  });
  assert.equal(e.ok, false);
  assert.match(e.body, /cannot read nope\.ts/);
});

// ---------------------------------------------------------------------------
// run() dispatch — arg parsing (--file / --bound / repeated --change) end-to-end
// ---------------------------------------------------------------------------

test("run(['drift', ...]) dispatches through to the real file read + classify", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "drift-"));
  const file = path.join(dir, "span.ts");
  const content = "export const x = 1;\n";
  writeFileSync(file, content, "utf8");
  const deps = { store: new InMemoryStore(), writable: false };
  try {
    const fresh = await run(["drift", "--file", file, "--bound", hashSpan(content)], deps);
    assert.match(fresh.body, /FRESH/);

    const undescribed = await run(["drift", "--file", file, "--bound", "stale-hash"], deps);
    assert.match(undescribed.body, /DRIFTED \(undescribed\)/);

    const stale = await run(
      ["drift", "--file", file, "--bound", "stale-hash", "--change", "a", "--change", "b wins"],
      deps,
    );
    assert.match(stale.body, /STALE/);
    assert.match(stale.body, /changed: b wins/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("run(['drift']) with no args is usage guidance; --help is the help page", async () => {
  const deps = { store: new InMemoryStore(), writable: false };
  const bare = await run(["drift"], deps);
  assert.equal(bare.ok, false);
  assert.match(bare.body, /missing --file/);
  const helped = await run(["drift", "--help"], deps);
  assert.equal(helped.ok, true);
  assert.match(helped.body, /storytree drift —/);
  assert.deepEqual(helped.body, driftHelp().body);
});

test("topHelp lists the drift area so an agent can discover it", async () => {
  const store = new InMemoryStore();
  const top = await run([], { store });
  assert.match(top.body, /^\s+drift\s+/m);
});
