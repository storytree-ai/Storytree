// check:web-experience-closure — the no-WebGL-in-Act-1 static-import-closure guard (ADR-0336).
//
// Tests the pure site-level judge only: `checkExperienceClosure` reuses the retired judge's
// closure-walk primitives (`web-experience-check.ts` — those are exercised by their own test file,
// `web-experience-check.test.ts`, which stays green and unaffected). This file's job is narrower: does
// the SITE-LEVEL wiring — entry detection, per-page closure walk, page-tagged findings, the bootstrap
// SKIP — behave correctly with the marker contract dropped, per ADR-0336 D1/D2.
//
// Proof: node --import tsx --test packages/cli/src/check-web-experience-closure.test.ts

import assert from "node:assert/strict";
import { test } from "node:test";

import { checkExperienceClosure } from "./check-web-experience-closure.js";

test("cwec-webgl-free-closure-is-green: an entry with a WebGL-free Act 1 closure has no findings", () => {
  const files = new Map<string, string>([
    ["src/pages/index.astro", `<main data-experience-entry></main>\nimport { act1 } from '../scripts/act1';`],
    ["src/scripts/act1.ts", `import { canvas } from './canvas.ts'; import { audio } from './audio.ts';`],
    ["src/scripts/canvas.ts", `/* plain Canvas 2D API */`],
    ["src/scripts/audio.ts", `/* Web Audio API */`],
  ]);
  const result = checkExperienceClosure(files);
  assert.equal(result.kind, "checked");
  assert.deepEqual(result.kind === "checked" ? result.findings : null, []);
});

test("cwec-direct-three-import-reds: a static import of three from the entry page itself is a finding", () => {
  const files = new Map<string, string>([
    ["src/pages/index.astro", `<main data-experience-entry></main>\nimport * as THREE from 'three';`],
  ]);
  const result = checkExperienceClosure(files);
  assert.equal(result.kind, "checked");
  const findings = result.kind === "checked" ? result.findings : [];
  assert.equal(findings.length, 1);
  assert.equal(findings[0]?.page, "src/pages/index.astro");
  assert.equal(findings[0]?.specifier, "three");
});

test("cwec-transitive-r3f-import-reds: three reachable via a chain of static imports is a finding naming the specifier", () => {
  const files = new Map<string, string>([
    ["src/pages/index.astro", `<main data-experience-entry></main>\nimport { storm } from '../scripts/storm';`],
    ["src/scripts/storm.ts", `import { grain } from './grain.ts';`],
    ["src/scripts/grain.ts", `import { Canvas } from '@react-three/fiber';`],
  ]);
  const result = checkExperienceClosure(files);
  assert.equal(result.kind, "checked");
  const findings = result.kind === "checked" ? result.findings : [];
  assert.equal(findings.length, 1);
  assert.equal(findings[0]?.specifier, "@react-three/fiber");
});

test("cwec-dynamic-import-is-the-sanctioned-seam: three reached only via dynamic import() is green", () => {
  const files = new Map<string, string>([
    [
      "src/pages/index.astro",
      `<main data-experience-entry></main>\nimport { canvas } from '../scripts/canvas';`,
    ],
    [
      "src/scripts/canvas.ts",
      `/* no WebGL */ export const loadScene = () => import('three');`,
    ],
  ]);
  const result = checkExperienceClosure(files);
  assert.equal(result.kind, "checked");
  assert.deepEqual(result.kind === "checked" ? result.findings : null, []);
});

test("cwec-extensionless-specifier-resolves: an extensionless frontmatter import still walks into the graph", () => {
  const entryPage = [
    "---",
    "import { bootStorm } from '../scripts/act1';",
    "---",
    "<main data-experience-entry></main>",
  ].join("\n");
  const files = new Map<string, string>([
    ["src/pages/index.astro", entryPage],
    ["src/scripts/act1.ts", `import { forest } from './forest-world-r3f/scene';`],
    ["src/scripts/forest-world-r3f/scene.ts", `/* the synced r3f island */`],
  ]);
  const result = checkExperienceClosure(files);
  assert.equal(result.kind, "checked");
  const findings = result.kind === "checked" ? result.findings : [];
  assert.equal(findings.length, 1);
  assert.match(findings[0]?.specifier ?? "", /forest-world-r3f/);
});

test("cwec-marker-absence-is-not-a-finding: a WebGL-free entry with neither skip nor fallback marker is still green", () => {
  // The whole point of ADR-0336 D2: this rung asserts closure only, never marker presence.
  const files = new Map<string, string>([
    ["src/pages/index.astro", `<main data-experience-entry></main>\nimport { canvas } from '../scripts/canvas';`],
    ["src/scripts/canvas.ts", `/* plain Canvas 2D API, no skip/fallback markers anywhere on this page */`],
  ]);
  const result = checkExperienceClosure(files);
  assert.equal(result.kind, "checked");
  assert.deepEqual(result.kind === "checked" ? result.findings : null, []);
});

test("cwec-absent-experience-entry-skips: no page carries data-experience-entry → SKIP, never red or silent-green", () => {
  const todaysSite = new Map<string, string>([
    ["src/pages/index.astro", `<main><h1>storytree</h1><p>the pre-experience landing page</p></main>`],
    ["src/pages/how-it-works.astro", `<main>a plain info page</main>`],
  ]);
  const result = checkExperienceClosure(todaysSite);
  assert.equal(result.kind, "skip", "no entry marker → SKIP, never a failure");
  assert.match(
    result.kind === "skip" ? result.reason : "",
    /bootstrap allowance/,
    "the SKIP is loud about why",
  );

  assert.equal(checkExperienceClosure(new Map()).kind, "skip", "an empty site tree also SKIPs");
});

test("cwec-multiple-entries-each-tagged: findings across two entry pages are each tagged with their own page", () => {
  const files = new Map<string, string>([
    ["src/pages/a.astro", `<main data-experience-entry></main>\nimport * as THREE from 'three';`],
    ["src/pages/b.astro", `<main data-experience-entry></main>\nimport { c } from '../scripts/clean';`],
    ["src/scripts/clean.ts", `/* no WebGL */`],
  ]);
  const result = checkExperienceClosure(files);
  assert.equal(result.kind, "checked");
  const findings = result.kind === "checked" ? result.findings : [];
  assert.equal(findings.length, 1);
  assert.equal(findings[0]?.page, "src/pages/a.astro");
});
