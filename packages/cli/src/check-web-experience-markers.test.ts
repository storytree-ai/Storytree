// check:web-experience-markers — the skip/fallback marker-presence guard (ADR-0454).
//
// Tests the pure site-level judge only: `checkExperienceMarkers` reuses the retired judge's marker
// primitives (`web-experience-check.ts` — exercised by its own `web-experience-check.test.ts`, which
// stays green and unaffected). This file's job is narrower: does the SITE-LEVEL wiring — entry
// detection, per-page marker search, page-tagged findings, the bootstrap SKIP — behave correctly with
// the static-import-closure property dropped, mirroring what ADR-0336 did for that other third.
//
// Proof: node --import tsx --test packages/cli/src/check-web-experience-markers.test.ts

import assert from "node:assert/strict";
import { test } from "node:test";

import { checkExperienceMarkers } from "./check-web-experience-markers.js";

test("cwem-both-markers-present-is-green: an entry carrying both markers has no findings", () => {
  const files = new Map<string, string>([
    [
      "src/pages/index.astro",
      `<main data-experience-entry><a data-experience-skip>Skip</a><div data-experience-fallback>Calm</div></main>`,
    ],
  ]);
  const result = checkExperienceMarkers(files);
  assert.equal(result.kind, "checked");
  assert.deepEqual(result.kind === "checked" ? result.findings : null, []);
});

test("cwem-missing-skip-marker-reds: an entry without data-experience-skip is a finding naming the page", () => {
  const files = new Map<string, string>([
    ["src/pages/index.astro", `<main data-experience-entry><div data-experience-fallback>Calm</div></main>`],
  ]);
  const result = checkExperienceMarkers(files);
  assert.equal(result.kind, "checked");
  const findings = result.kind === "checked" ? result.findings : [];
  assert.equal(findings.length, 1);
  assert.equal(findings[0]?.page, "src/pages/index.astro");
  assert.equal(findings[0]?.kind, "missing-skip-marker");
});

test("cwem-missing-fallback-marker-reds: an entry without data-experience-fallback is a finding naming the page", () => {
  const files = new Map<string, string>([
    ["src/pages/index.astro", `<main data-experience-entry><a data-experience-skip>Skip</a></main>`],
  ]);
  const result = checkExperienceMarkers(files);
  assert.equal(result.kind, "checked");
  const findings = result.kind === "checked" ? result.findings : [];
  assert.equal(findings.length, 1);
  assert.equal(findings[0]?.kind, "missing-fallback-marker");
});

test("cwem-both-markers-missing-reds-twice: an entry with neither marker is two findings", () => {
  const files = new Map<string, string>([["src/pages/index.astro", `<main data-experience-entry></main>`]]);
  const result = checkExperienceMarkers(files);
  assert.equal(result.kind, "checked");
  const findings = result.kind === "checked" ? result.findings : [];
  assert.equal(findings.length, 2);
  assert.deepEqual(
    findings.map((f) => f.kind).sort(),
    ["missing-fallback-marker", "missing-skip-marker"],
  );
});

test("cwem-webgl-leak-is-not-a-finding: this judge never asserts the static-import-closure property", () => {
  // The whole point of ADR-0454, mirroring ADR-0336 D2 for the sibling rung: this rung asserts
  // marker presence only, never the no-WebGL wall (that is check:web-experience-closure's job).
  const files = new Map<string, string>([
    [
      "src/pages/index.astro",
      `<main data-experience-entry><a data-experience-skip>Skip</a><div data-experience-fallback>Calm</div></main>\nimport * as THREE from 'three';`,
    ],
  ]);
  const result = checkExperienceMarkers(files);
  assert.equal(result.kind, "checked");
  assert.deepEqual(result.kind === "checked" ? result.findings : null, []);
});

test("cwem-absent-experience-entry-skips: no page carries data-experience-entry → SKIP, never red or silent-green", () => {
  const todaysSite = new Map<string, string>([
    ["src/pages/index.astro", `<main><h1>storytree</h1><p>the pre-experience landing page</p></main>`],
  ]);
  const result = checkExperienceMarkers(todaysSite);
  assert.equal(result.kind, "skip", "no entry marker → SKIP, never a failure");
  assert.match(
    result.kind === "skip" ? result.reason : "",
    /bootstrap allowance/,
    "the SKIP is loud about why",
  );

  assert.equal(checkExperienceMarkers(new Map()).kind, "skip", "an empty site tree also SKIPs");
});

test("cwem-multiple-entries-each-tagged: findings across two entry pages are each tagged with their own page", () => {
  const files = new Map<string, string>([
    ["src/pages/a.astro", `<main data-experience-entry></main>`],
    [
      "src/pages/b.astro",
      `<main data-experience-entry><a data-experience-skip>Skip</a><div data-experience-fallback>Calm</div></main>`,
    ],
  ]);
  const result = checkExperienceMarkers(files);
  assert.equal(result.kind, "checked");
  const findings = result.kind === "checked" ? result.findings : [];
  assert.equal(findings.length, 2);
  assert.ok(findings.every((f) => f.page === "src/pages/a.astro"));
});
