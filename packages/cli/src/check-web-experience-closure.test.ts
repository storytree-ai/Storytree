// check:web-experience-closure — the no-WebGL-in-Act-1 static-import-closure guard (ADR-0336).
//
// Tests the pure site-level judge only: `checkExperienceClosure` reuses the retired judge's
// closure-walk primitives (`web-experience-check.ts` — those are exercised by their own test file,
// `web-experience-check.test.ts`, which stays green and unaffected). This file's job is narrower: does
// the SITE-LEVEL wiring — entry detection, per-page closure walk, page-tagged findings, the bootstrap
// SKIP — behave correctly with the marker contract dropped, per ADR-0336 D1/D2.
//
// Proof: node --import tsx --test packages/cli/src/check-web-experience-closure.test.ts
//
// ── THE REFUSALS, COMMITTED (2026-08-28) ──────────────────────────────────────────────────────────
//
// This rung was one of the "green that verified nothing" family. It carried TWO defects that
// CANCELLED, so it printed OK over a graph it had never walked:
//   · the import scanner's clause class excluded `\n`, so it could not see a multi-line import —
//     which is how most of this repo, and `web/src/scripts/act1-storm.ts` itself, writes one; and
//   · the closure was seeded at the Astro page FILE, so it walked build-time frontmatter that ships
//     no bytes — and `web/src/pages/index.astro` genuinely reaches `act2-director` that way.
// Fixing either alone is wrong in an obvious direction. Measured on the real checkout at web
// `c61fbbaf`: scanner-fixed-only reds the gate on a non-defect; seed-fixed-only keeps the blindness.
//
// Every test below was mutation-tested against a deliberately broken instrument. Each mutation was
// applied alone, to the repaired code, and the suite re-run — the matrix is the evidence that these
// assertions can fail, not merely that they pass:
//
//   MUTATION                                                        KILLED BY
//   1. restore the `\n`-excluding clause class in STATIC_IMPORT_RE   multiline-client-import-reds,
//                                                                   frontmatter-only-reach,
//                                                                   hydrated-island-is-a-client-leak
//   2. seed the walk at the page file again (frontmatter over-reach) frontmatter-only-reach,
//                                                                   hydrated-island-is-a-client-leak
//   3. stop blanking comments before matching                       commented-out-import-is-not-a-leak
//   4. stop promoting `client:*` islands to client entries          hydrated-island-is-a-client-leak
//   5. stop following `.astro` components into their script blocks   astro-component-script-block-is-
//      (i.e. the single-file seed split, before collectEntrySeeds)   a-client-leak
//
// ⚠ MUTATION 5 IS THE HOLE THE FIRST REPAIR OPENED. Splitting the ENTRY PAGE into build-time
// frontmatter and shipped `<script>` is right about the page and wrong about everything its
// frontmatter reaches: Astro bundles the `<script>` block of every `.astro` component it renders,
// hydration irrelevant. `index.astro` → `Base.astro` → `Nav`/`Footer` are all frontmatter-reached,
// so a script added to any of them would have shipped while this rung filed its WebGL as a note.
// `collectEntrySeeds` walks across `.astro` boundaries for exactly that reason. None of the three
// carries a script block today — which is the point: a guard that holds only while nobody exercises
// it is not a guard.
//
// ⚠ MUTATION 3 SURVIVED ON THE FIRST ATTEMPT, and that is the most useful line in this header. The
// original fixture wrote its commented-out import as a `*`-prefixed block-comment line — the natural
// shape — and a `*`-prefixed line never satisfied the statement anchor in the first place, so the
// test passed whether comments were blanked or not. It was a cannot-fail test guarding a cannot-fail
// rung. The fixture is now written FLUSH, and the test also asserts the opposite direction (a REAL
// import carrying a paren-bearing trailing comment is still walked), because `(` fences the import
// clause and an unblanked comment would silently drop that edge. Mutation-test the test.
//
// A SECOND cannot-fail fixture was caught the same way. `cwec-hydrated-island-is-a-client-leak`
// wrote its component with no `---` fence, and an unfenced file is not an Astro file: the seed
// splitter fails WIDE on one and calls every import a client import. The control half therefore
// passed for a reason unrelated to hydration. The fixture is now a real fenced component.
//
// ⚠ AND A THIRD CANNOT-FAIL FIXTURE, found by the MUTATION RUNG rather than by hand. The test
// asserting that a `<script>` with attributes is read went green against an instrument whose script
// matcher had been broken outright. Its fixture used an EMPTY frontmatter fence (`---\n---`), and
// the fence pattern did not match that at all — so the page fell into the no-fence FAIL-WIDE branch,
// where every import counts as client. Fail-wide and correct agree on a page with empty frontmatter,
// so the test passed without once reaching the code it named. Empty frontmatter is ordinary Astro;
// the matcher was wrong, and `extractAstroEntrySeeds: an EMPTY frontmatter fence is still a fence`
// now pins it, with a discriminator that fails if the fail-wide path is ever taken again.
//
// THE STANDING RESULT: `pnpm check:mutation-diff` reports PASS on these lines — every mutant killed
// by this branch's own tests. Reaching that took the suite from 91 unresolved mutants to zero and
// surfaced the fence defect above. What remains excluded is annotated in the source one mutant at a
// time, and the two reasons are kept distinct: NOT KILLABLE BY ASSERTION (the mutant hangs the
// lexer or the walk, and Stryker credits no test to a timeout) versus EQUIVALENT (no input can
// distinguish it — each of those was checked against real inputs, not argued).
//
// GROUND TRUTH the seed rests on, measured rather than assumed (2026-08-28, `astro build` at web
// `c61fbbaf`): the entry page ships ONE 20,826-byte chunk with zero static imports and one dynamic
// `import("./inflection")`; no `three`, `@react-three/*` or `act2-director` appears in it, and the
// whole `_astro` output directory is 80 KB. The page's client closure really is WebGL-free and its
// file-level closure really is not — only one of those is a property about what Act 1 ships.

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

test("cwec-extensionless-specifier-resolves: an extensionless CLIENT import still walks into the graph", () => {
  // RE-POINTED 2026-08-28, lesson kept. This test's subject is extension resolution — that
  // `../scripts/act1` finds `act1.ts` — and that property is unchanged and still worth a test. Its
  // FIXTURE used to put the import in Astro frontmatter, which the rung no longer counts (frontmatter
  // is build-time and ships nothing), so it was asserting extension resolution through a door that
  // is now correctly shut. Moving the same import into the page's `<script>` block tests the same
  // resolution rule against the graph the visitor actually downloads. The frontmatter half of the
  // old fixture is not discarded — it becomes the control in the next test.
  const entryPage = [
    "---",
    "const title = 'storm';",
    "---",
    "<main data-experience-entry></main>",
    "<script>",
    "  import { bootStorm } from '../scripts/act1';",
    "  bootStorm();",
    "</script>",
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

test("cwec-multiline-client-import-reds: the MULTI-LINE import form the old scanner could not see is a finding", () => {
  // ⚠ THE REGRESSION THIS RUNG EXISTS TO NEVER REPEAT (2026-08-28).
  //
  // `STATIC_IMPORT_RE`'s clause class excluded `\n`, so it could not match an import written across
  // lines — which is how most of this repo, and `web/src/scripts/act1-storm.ts` itself, writes one.
  // The scanner returned [] for the chain below and the rung printed OK over a graph it had never
  // walked. Both fixtures reach `three` through the SAME chain and differ ONLY in whether one import
  // is reflowed onto one line; a scanner that reports them differently is blind, and the assertion
  // that they agree is what holds the repair up.
  const chain = (importStatement: string) =>
    new Map<string, string>([
      [
        "src/pages/index.astro",
        ["---", "---", "<main data-experience-entry></main>", "<script>", "  import { runStorm } from '../scripts/act1-storm';", "  runStorm();", "</script>"].join("\n"),
      ],
      ["src/scripts/act1-storm.ts", `${importStatement}\nexport const runStorm = () => BOOT_BANNER;`],
      ["src/scripts/storm-script.ts", `import * as THREE from 'three';\nexport const BOOT_BANNER = 'x';`],
    ]);

  const multiLine = checkExperienceClosure(
    chain("import {\n  BOOT_BANNER,\n  PROMPT_CHIPS,\n} from './storm-script';"),
  );
  const singleLine = checkExperienceClosure(
    chain("import { BOOT_BANNER, PROMPT_CHIPS } from './storm-script';"),
  );

  const specs = (r: typeof multiLine): string[] =>
    (r.kind === "checked" ? r.findings : []).map((f) => f.specifier);

  assert.deepEqual(
    specs(multiLine),
    ["three"],
    "a multi-line import must be walked — this exact case returned [] before 2026-08-28",
  );
  assert.deepEqual(
    specs(singleLine),
    ["three"],
    "the same chain on one line — the CONTROL, read in the same run, proving the fixture is not why",
  );
  assert.deepEqual(specs(multiLine), specs(singleLine), "reflowing an import must not move the verdict");
});

test("cwec-frontmatter-only-reach-is-reported-not-failed: build-time WebGL is a note, never a leak", () => {
  // The other half of the same repair. `web/src/pages/index.astro` really does reach `act2-director`
  // through a frontmatter import that serialises a map at BUILD time — measured on the built output
  // (2026-08-28), the page ships one 20,826-byte chunk containing no `three` and no `act2-director`.
  // Failing on that is a false red; dropping it silently is an unstated exclusion. It is REPORTED.
  const entryPage = [
    "---",
    "import { forestSvg } from '../scripts/snapshot-map';",
    "---",
    "<main data-experience-entry></main>",
    "<script>",
    "  import { runStorm } from '../scripts/act1-storm';",
    "  runStorm();",
    "</script>",
  ].join("\n");
  const files = new Map<string, string>([
    ["src/pages/index.astro", entryPage],
    ["src/scripts/snapshot-map.ts", `import {\n  buildDisc,\n} from '../lib/forest-world-r3f/act2-director';`],
    ["src/scripts/lib/forest-world-r3f/act2-director.ts", `/* unreached */`],
    ["src/lib/forest-world-r3f/act2-director.ts", `import * as THREE from 'three';`],
    ["src/scripts/act1-storm.ts", `/* plain DOM, no WebGL */`],
  ]);
  const result = checkExperienceClosure(files);
  assert.equal(result.kind, "checked");
  assert.deepEqual(result.kind === "checked" ? result.findings : null, [], "build-time is not a leak");
  const notes = (result.kind === "checked" ? result.buildTimeReaches : []).map((f) => f.specifier);
  assert.ok(
    notes.some((sp) => /forest-world-r3f/.test(sp)),
    "the build-time reach must be REPORTED — a silent exclusion is indistinguishable from not looking",
  );
});

test("cwec-hydrated-island-is-a-client-leak: a client:* directive promotes its frontmatter import", () => {
  // The one way a frontmatter import DOES reach the visitor. Excluding frontmatter wholesale would
  // open exactly this hole, so the seed promotes any component carrying a hydration directive. The
  // site has no island today — this test is what stops adopting one from stepping outside the guard.
  const withIsland = [
    "---",
    "import ForestIsland from '../components/ForestIsland.astro';",
    "---",
    "<main data-experience-entry></main>",
    "<ForestIsland client:load />",
  ].join("\n");
  const withoutDirective = withIsland.replace(" client:load", "");
  const files = (page: string) =>
    new Map<string, string>([
      ["src/pages/index.astro", page],
      // A REAL Astro component: imports live inside the `---` fence. Written without one it is not
      // an Astro file at all, and `extractAstroEntrySeeds` fails WIDE on an unfenced file (treating
      // every import as client) — which would have made the control half of this test pass for a
      // reason that has nothing to do with hydration.
      [
        "src/components/ForestIsland.astro",
        ["---", "import {", "  Canvas,", "} from '@react-three/fiber';", "---", "<div />"].join("\n"),
      ],
    ]);

  const hydrated = checkExperienceClosure(files(withIsland));
  assert.deepEqual(
    (hydrated.kind === "checked" ? hydrated.findings : []).map((f) => f.specifier),
    ["@react-three/fiber"],
    "a hydrated island ships — its import is a client entry",
  );

  // The CONTROL, same fixture, same run: without the directive the component is build-time only.
  const inert = checkExperienceClosure(files(withoutDirective));
  assert.deepEqual(
    (inert.kind === "checked" ? inert.findings : []).map((f) => f.specifier),
    [],
    "the identical component with no hydration directive renders to markup and ships nothing",
  );
});

test("cwec-astro-component-script-block-is-a-client-leak: a frontmatter-reached component still ships its scripts", () => {
  // ⚠ THE HOLE THE FIRST REPAIR OPENED, closed 2026-08-28 in the same landing.
  //
  // Splitting the entry page into "frontmatter = build-time" / "<script> = client" is right about
  // the PAGE and wrong about everything the page's frontmatter reaches. Astro bundles and ships the
  // `<script>` block of EVERY `.astro` component it renders — a script tag is not an island, so
  // hydration has nothing to do with it. `web/src/pages/index.astro` imports `Base.astro`, which
  // imports `Nav.astro` and `Footer.astro`; a `<script>` added to any of those reaches the visitor.
  // With the single-file split, its WebGL was filed as a build-time NOTE and the gate stayed green.
  // That is a false green, which is worse than a red because it is read as reassurance.
  //
  // The two fixtures differ ONLY in whether the layout's import sits in its frontmatter or in its
  // script block. The verdicts must differ, and in this direction.
  const page = [
    "---",
    "import Base from '../layouts/Base.astro';",
    "---",
    "<main data-experience-entry></main>",
  ].join("\n");
  const layout = (region: "frontmatter" | "script") =>
    region === "script"
      ? ["---", "---", "<slot />", "<script>", "  import { boot } from '../scripts/heavy';", "</script>"].join("\n")
      : ["---", "import { boot } from '../scripts/heavy';", "---", "<slot />"].join("\n");
  const files = (region: "frontmatter" | "script") =>
    new Map<string, string>([
      ["src/pages/index.astro", page],
      ["src/layouts/Base.astro", layout(region)],
      ["src/scripts/heavy.ts", "import {\n  Canvas,\n} from '@react-three/fiber';"],
    ]);

  const shipped = checkExperienceClosure(files("script"));
  assert.deepEqual(
    (shipped.kind === "checked" ? shipped.findings : []).map((f) => f.specifier),
    ["@react-three/fiber"],
    "a script block in a frontmatter-reached component IS downloaded — this must red the gate",
  );

  // The CONTROL, same run, same chain: the identical import in the layout's FRONTMATTER renders to
  // markup and ships nothing, so it stays a note. Without this half the test above would pass just
  // as well against an instrument that failed on every reach, build-time ones included.
  const inert = checkExperienceClosure(files("frontmatter"));
  assert.deepEqual(
    (inert.kind === "checked" ? inert.findings : []).map((f) => f.specifier),
    [],
    "the same import in the component's frontmatter is build-time and must stay a note",
  );
  assert.ok(
    (inert.kind === "checked" ? inert.buildTimeReaches : []).some((f) =>
      /react-three/.test(f.specifier),
    ),
    "and it must still be REPORTED — a silent exclusion is indistinguishable from not looking",
  );
});

test("cwec-commented-out-import-is-not-a-leak: prose about the rung must not red the rung", () => {
  // The "a source-text check trips on its own rationale" trap. `web/src/pages/index.astro` carries a
  // comment block that discusses this very check and names `three`; a scanner matching raw text
  // reports it as a leak. Comments are blanked before matching, so both forms are inert.
  const files = new Map<string, string>([
    [
      "src/pages/index.astro",
      [
        "---",
        "---",
        "<main data-experience-entry></main>",
        "<script>",
        // ⚠ FIXTURE NOTE. The comment body is deliberately written FLUSH — no leading `*` on the",
        // import line. A `*`-prefixed comment line never matched the statement anchor in the first",
        // place, so a fixture in that (more natural-looking) shape passes whether comments are
        // blanked or not, and asserts nothing. Caught by mutation-testing this very test on
        // 2026-08-28: with `stripComments` removed it still went green, which is the same
        // cannot-fail defect the rung itself was repaired for. Flush is the form that discriminates.
        "  /*",
        "Historical note: this page used to do",
        "import * as THREE from 'three';",
        "before the inflection moved it behind a dynamic import.",
        "  */",
        "  // import { Canvas } from '@react-three/fiber';",
        "  import {",
        "    boot, // the (only) entry point — the parens matter, see below",
        "  } from '../scripts/act1';",
        "  boot();",
        "</script>",
      ].join("\n"),
    ],
    ["src/scripts/act1.ts", `/* plain DOM */`],
  ]);
  const result = checkExperienceClosure(files);
  assert.equal(result.kind, "checked");
  assert.deepEqual(
    result.kind === "checked" ? result.findings : null,
    [],
    "a commented-out import loads nothing and must not red the gate",
  );

  // The OTHER direction, and the assertion that stops THIS test passing vacuously: blanking comments
  // must not cost a REAL import. `(` is one of the characters that fences the import clause, so an
  // unblanked trailing `// … (only) …` note breaks the match and silently drops the edge — a miss
  // that looks exactly like a clean graph. The same page, with the same comment-bearing multi-line
  // import, must still reach `three` when the chain genuinely leads there.
  const reaching = new Map(files);
  reaching.set(
    "src/scripts/act1.ts",
    "import {\n  scene, // build the (whole) scene\n} from './scene';",
  );
  reaching.set("src/scripts/scene.ts", `import * as THREE from 'three';`);
  const red = checkExperienceClosure(reaching);
  assert.deepEqual(
    (red.kind === "checked" ? red.findings : []).map((f) => f.specifier),
    ["three"],
    "a real import carrying a paren-bearing trailing comment must still be walked",
  );
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
