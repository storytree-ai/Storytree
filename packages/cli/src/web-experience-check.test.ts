// check:web-experience — the experience-rollout-guardrails capability (ADR-0134).
//
// This file tests the PURE CORE of the check: three judges that combine into a single verdict
// over a fixture site-tree (why this is a capability, not a contract):
//
//   1. THE MARKER CONTRACT — the experience entry page must carry data-experience-skip
//      (the persistent skip-to-calm control) and data-experience-fallback (the
//      prefers-reduced-motion / no-WebGL path). Presence, not adequacy (static markers
//      are cheap and stable across redesigns, per the data-grounds precedent ADR-0056).
//
//   2. THE NO-WEBGL-IN-ACT-1 WALL (ADR-0134 §1/§2) — the judge walks the static import
//      closure from the Act 1 entry module (the storm's script entry) and rejects if the
//      closure reaches `three`, any `@react-three/*` package, or any path containing
//      `forest-world-r3f`. Dynamic import() at the inflection is the sanctioned lazy-load
//      seam and is NOT counted (it doesn't reach the first-paint bundle).
//
//   3. THE BOOTSTRAP ALLOWANCE — absent an experience entry in web/ the CLI shell SKIPs
//      rather than failing (the guard lands before the storm). The pure `checkExperienceEntry`
//      tested here is only called when an entry already exists.
//
// The implementation shell (`main()` in web-experience-check.ts) handles the web/ submodule
// local-SKIP / CI-fail posture and bootstrap allowance, following check-web-engine's pattern.
//
// Proof: node --import tsx --test packages/cli/src/web-experience-check.test.ts

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  checkExperienceEntry,
  checkExperienceSite,
  collectEntrySeeds,
  extractAstroEntrySeeds,
  extractStaticImports,
  stripComments,
  findExperienceMarkers,
  isWebGlSpecifier,
  walkStaticClosure,
  withExtensionFallback,
} from "./web-experience-check.js";

// ── findExperienceMarkers ─────────────────────────────────────────────────────
// Check the experience entry page for the two required affordance markers.

test("findExperienceMarkers detects both data-experience-skip and data-experience-fallback", () => {
  const html = `
    <button data-experience-skip aria-label="Skip to calm">Skip</button>
    <div data-experience-fallback hidden>Reduced motion fallback</div>
  `;
  const m = findExperienceMarkers(html);
  assert.equal(m.hasSkip, true, "data-experience-skip present");
  assert.equal(m.hasFallback, true, "data-experience-fallback present");
});

test("findExperienceMarkers returns both false when neither marker is present", () => {
  const m = findExperienceMarkers("<main><p>No affordance markers here</p></main>");
  assert.equal(m.hasSkip, false);
  assert.equal(m.hasFallback, false);
});

test("findExperienceMarkers detects skip without fallback", () => {
  const m = findExperienceMarkers('<button data-experience-skip>Skip to calm</button>');
  assert.equal(m.hasSkip, true);
  assert.equal(m.hasFallback, false);
});

test("findExperienceMarkers detects fallback without skip", () => {
  const m = findExperienceMarkers('<div data-experience-fallback>Reduced motion path</div>');
  assert.equal(m.hasSkip, false);
  assert.equal(m.hasFallback, true);
});

// ── extractStaticImports ──────────────────────────────────────────────────────
// Pull the specifiers the bundler sees at first paint — static edges only.

test("extractStaticImports collects named, default, namespace, and export-from specifiers", () => {
  const src = [
    `import { storm } from './storm.ts';`,
    `import defaultExport from '../audio.ts';`,
    `import * as ns from 'gsap';`,
    `export { render } from './render.ts';`,
    `export * from './utils.ts';`,
  ].join("\n");
  const specs = extractStaticImports(src);
  assert.ok(specs.includes("./storm.ts"), "named import");
  assert.ok(specs.includes("../audio.ts"), "default import");
  assert.ok(specs.includes("gsap"), "bare specifier");
  assert.ok(specs.includes("./render.ts"), "export-from");
  assert.ok(specs.includes("./utils.ts"), "export-star-from");
});

test("extractStaticImports excludes dynamic import() calls", () => {
  const src = [
    `import { a } from './static.ts';`,
    `const m1 = await import('./dynamic.ts');`,
    `const m2 = import('./lazy.ts');`,
  ].join("\n");
  const specs = extractStaticImports(src);
  assert.ok(specs.includes("./static.ts"), "static import is included");
  assert.ok(!specs.includes("./dynamic.ts"), "await import() is excluded");
  assert.ok(!specs.includes("./lazy.ts"), "bare import() is excluded");
});

test("extractStaticImports excludes import type declarations (no runtime load)", () => {
  const src = [
    `import type { Foo } from './types.ts';`,
    `import { Bar } from './values.ts';`,
  ].join("\n");
  const specs = extractStaticImports(src);
  assert.ok(!specs.includes("./types.ts"), "import type excluded");
  assert.ok(specs.includes("./values.ts"), "value import included");
});

test("extractStaticImports sees the MULTI-LINE form, in every shape this repo writes it", () => {
  // ⚠ THE 2026-08-28 REGRESSION. `STATIC_IMPORT_RE`'s clause class excluded `\n`, so EVERY case
  // below returned []. That is not a partial answer — a skipped import and an absent import produce
  // the same empty result, so `check:web-experience-closure` reported a clean closure over a graph
  // it had never walked. Each shape is listed separately because they fail independently: the fix
  // has to survive the clause spanning lines, the `from` sitting on its own line, and a trailing
  // comment inside the braces.
  const cases: ReadonlyArray<readonly [string, string]> = [
    ["braces across lines", `import {\n  Canvas,\n  useFrame,\n} from 'three';`],
    ["from on its own line", `import React,\n  { useState }\nfrom 'three';`],
    ["namespace, wrapped", `import * as THREE\n  from 'three';`],
    ["export-from across lines", `export {\n  Scene,\n} from 'three';`],
    ["trailing comment with parens", `import {\n  Canvas, // the (only) one\n} from 'three';`],
  ];
  for (const [label, src] of cases) {
    assert.deepEqual(extractStaticImports(src), ["three"], `${label} must be seen`);
  }

  // The CONTROL, read in the same run: the one-line form of the first case. A scanner that reports
  // these two differently is blind, and reflowing an import must never move a verdict.
  assert.deepEqual(
    extractStaticImports(`import { Canvas, useFrame } from 'three';`),
    extractStaticImports(`import {\n  Canvas,\n  useFrame,\n} from 'three';`),
  );
});

test("extractStaticImports is not fooled by prose: comments in, comments out", () => {
  // The "a source-text check trips on its own rationale" trap. `web/src/pages/index.astro` carries a
  // comment discussing this rung that names `three`; matching raw text would call it a leak.
  const blockComment = `/*\nimport * as THREE from 'three';\n*/\nimport { a } from './a';`;
  assert.deepEqual(extractStaticImports(blockComment), ["./a"], "a block-commented import is inert");
  assert.deepEqual(
    extractStaticImports(`// import { X } from 'three';\nimport { a } from './a';`),
    ["./a"],
    "a line-commented import is inert",
  );
  // And the other direction — blanking comments must not cost a specifier that merely LOOKS like one.
  assert.deepEqual(
    extractStaticImports(`import { a } from './a//b';`),
    ["./a//b"],
    "a `//` inside the specifier string is not a comment",
  );
});

test("extractStaticImports excludes import/export type even when double-spaced", () => {
  // The old guard was `import\s+(?!type…)`: on `import  type { X }` the `\s+` backtracks to one
  // space, the lookahead then tests against a SPACE rather than `type`, and the declaration matched.
  assert.deepEqual(extractStaticImports(`import  type { X } from 'three';`), []);
  assert.deepEqual(extractStaticImports(`export type { X } from 'three';`), []);
  assert.deepEqual(extractStaticImports(`import type {\n  X,\n} from 'three';`), []);
});

test("extractStaticImports: the whitespace in an import statement is not fixed-width", () => {
  // Each row below fails under a DIFFERENT single-character loosening of the statement regex
  // (`\s*` → `\s`, `\bfrom\s*` → `\bfrom\s`). They look like pedantic spacing cases; they are the
  // only inputs that can tell a "one space" matcher from an "any run of whitespace" one, and this
  // repo's own source contains all of these shapes.
  assert.deepEqual(extractStaticImports("import  { X } from 'three';"), ["three"], "two spaces after import");
  assert.deepEqual(extractStaticImports("import { X } from  'three';"), ["three"], "two spaces after from");
  assert.deepEqual(extractStaticImports("import {\n  X,\n}\nfrom\n'three';"), ["three"], "newlines either side of from");
  assert.deepEqual(extractStaticImports("export  { S } from 'three';"), ["three"], "two spaces after export");
  assert.deepEqual(extractStaticImports("export { S } from  'three';"), ["three"], "two spaces after export's from");
});

test("extractStaticImports: the STATEMENT ANCHOR is the boundary, not merely 'some character'", () => {
  // `(?:^|[;\n])` must accept a semicolon with NOTHING after it. Written as "any character that is
  // not a semicolon" the pattern still matches every spaced case (it just eats the space instead),
  // so a tight `;import` / `;export` is the only input that tells the two apart — and minified or
  // hand-tightened source is exactly where it would matter.
  assert.deepEqual(extractStaticImports("const a = 1;export { S } from 'three';"), ["three"]);
  assert.deepEqual(extractStaticImports("const a = 1;import { X } from 'three';"), ["three"]);
  // And an INDENTED statement: `\s*` must span the indent. `\S*` would match only an empty run.
  assert.deepEqual(extractStaticImports("  export { S } from 'three';"), ["three"]);
  assert.deepEqual(extractStaticImports("\n    import { X } from 'three';"), ["three"]);
  // Zero whitespace between the keyword and its clause — legal, and the case that separates
  // "exactly one space" from "any run, including none".
  assert.deepEqual(extractStaticImports("export{ S } from 'three';"), ["three"]);
});

test("extractStaticImports: a BARE side-effect import is a real edge", () => {
  // `import '…';` with no `from` — the shape a stylesheet or a polyfill arrives in, and exactly what
  // `web/src/pages/index.astro` uses for `../styles/tree-world-map.css`. It ships, so it is part of
  // the closure; a matcher that requires a `from` clause would drop the whole class silently.
  assert.deepEqual(extractStaticImports("import './styles.css';"), ["./styles.css"]);
  // Double-spaced, with no `from` anywhere: the whitespace run must be spanned in full, and there
  // is no permissive clause left to absorb the remainder when it is not.
  assert.deepEqual(extractStaticImports("import  './styles.css';"), ["./styles.css"]);
  assert.deepEqual(extractStaticImports("import 'three';\nimport { a } from './a';"), ["three", "./a"]);
});

test("extractStaticImports: `export  type` is excluded even when double-spaced", () => {
  // The import side of this is covered above; the export side has its own lookahead and its own
  // chance to be wrong. A type-only re-export loads nothing at runtime.
  assert.deepEqual(extractStaticImports("export  type { X } from 'three';"), []);
});

// ── stripComments ─────────────────────────────────────────────────────────────

test("stripComments blanks comments, preserves offsets and line structure, and spares strings", () => {
  const src = `const a = 1; // note\n/* block\n   lines */ const b = "http://x//y";`;
  const out = stripComments(src);
  assert.equal(out.length, src.length, "offsets are preserved — comment bytes become spaces");
  assert.equal(out.split("\n").length, src.split("\n").length, "line structure survives");
  assert.ok(!out.includes("note"), "line comment blanked");
  assert.ok(!out.includes("block"), "block comment blanked");
  assert.ok(out.includes(`"http://x//y"`), "a `//` inside a string literal is NOT a comment");
  assert.ok(out.includes("const a = 1;") && out.includes("const b ="), "code survives verbatim");
});

test("stripComments: EXACT output for every lexer branch, offsets preserved", () => {
  // ⚠ EXACT-STRING assertions on purpose. `stripComments` is a hand-written lexer with six modes
  // and a dozen character comparisons; an `includes`-style assertion leaves almost all of them
  // free to be wrong. Each row below is a branch, and the expected string is written out in full so
  // that flipping any single comparison changes it. Length equality is asserted for every row
  // because the offset-preserving property is what lets the caller match over the result.
  const cases: ReadonlyArray<readonly [string, string, string]> = [
    ["line comment → spaces, newline survives", "a// x\nb", "a    \nb"],
    ["block comment → spaces, inline", "a/* x */b", "a       b"],
    ["block comment spanning lines keeps them", "a/*\nx\n*/b", "a  \n \n  b"],
    ["CR is preserved, and only LF ends a line comment", "a//x\r\nb", "a   \r\nb"],
    ["double-quoted string is verbatim, `//` inside is not a comment", 'x = "a//b";', 'x = "a//b";'],
    ["single-quoted string is verbatim", "x = 'a/*b*/c';", "x = 'a/*b*/c';"],
    ["template literal is verbatim", "x = `a//b`;", "x = `a//b`;"],
    ["an escaped quote does not close the string", '"a\\"b"//x', '"a\\"b"   '],
    ["a lone trailing backslash at EOF is copied, not read past", '"a\\', '"a\\'],
    ["an unterminated block comment blanks to EOF", "a/*b", "a   "],
    ["an unterminated line comment blanks to EOF", "a//b", "a   "],
    ["`/` that starts neither comment form is code", "a / b", "a / b"],
    ["`*/` outside a block comment is code", "a */ b", "a */ b"],
    ["a string opened after a comment still lexes", "//x\n'y//z'", "   \n'y//z'"],
    ["empty input", "", ""],
    // ⚠ EACH LITERAL TYPE MUST BE FOLLOWED BY A COMMENT. Without trailing code, a mutant that
    // corrupts the mode a quote ENTERS (or the char that CLOSES it) leaves the literal unterminated
    // and copies the rest of the input verbatim — which is byte-identical to the correct answer when
    // the literal is the last thing on the line. These three rows are what make the close observable.
    ["single-quoted literal CLOSES, so a following comment is blanked", "x = 'a'; // c", "x = 'a';     "],
    ["double-quoted literal CLOSES", 'x = "a"; // c', 'x = "a";     '],
    ["template literal CLOSES", "x = `a`; // c", "x = `a`;     "],
    ["block comment CLOSES, so following code survives", "/*c*/x", "     x"],
    ["a `*` inside a block comment does not close it", "/*a*b*/x", "       x"],
    ["adjacent comments each close", "/*a*//*b*/x", "          x"],
    // A `/` inside a block comment must not close it: the close is `*` FOLLOWED BY `/`, and a
    // mutant that drops either half of that pair is only observable when the other half appears
    // alone. `/*a*b*/` covers the lone `*`; this row covers the lone `/`.
    ["a `/` inside a block comment does not close it", "/*a/b*/x", "       x"],
    // A quote of one kind inside a literal of another must be inert. Each row is what makes the
    // corresponding `mode === …` half of the close test observable — without them, a mutant that
    // ignores the mode closes on the right character anyway and nothing changes.
    ["a single quote inside a double-quoted literal", 'x = "a\'b"; // c', 'x = "a\'b";     '],
    ["a double quote inside a single-quoted literal", 'x = \'a"b\'; // c', 'x = \'a"b\';     '],
    ["a backtick inside a double-quoted literal", 'x = "a`b"; // c', 'x = "a`b";     '],
    ["a double quote inside a template literal", 'x = `a"b`; // c', 'x = `a"b`;     '],
    // Two characters inside the literal: makes "any char closes it" distinguishable from "the
    // matching quote closes it", which a one-character literal cannot show.
    ["two characters inside a single-quoted literal", "x = 'ab'; // c", "x = 'ab';     "],
  ];
  for (const [label, src, expected] of cases) {
    assert.equal(stripComments(src), expected, label);
    assert.equal(stripComments(src).length, src.length, `${label}: offsets must be preserved`);
  }
});

test("stripComments: a comment cannot hide a real import, and a string cannot fake one", () => {
  // The two directions that matter to the caller, asserted through the caller rather than by eye.
  assert.deepEqual(extractStaticImports("/* import x from 'three'; */\nimport y from './y';"), [
    "./y",
  ]);
  assert.deepEqual(extractStaticImports("const s = \"import x from 'three';\";"), []);
});

// ── extractAstroEntrySeeds ────────────────────────────────────────────────────

test("extractAstroEntrySeeds splits what the browser downloads from what only the build sees", () => {
  // Astro frontmatter runs at BUILD time and ships no bytes; `<script>` blocks are bundled and do.
  // Seeding the closure at the page FILE conflated the two, which is why the rung reported a leak
  // (`act2-director`) that costs the visitor nothing. Measured 2026-08-28 on the built output: the
  // real entry page ships one 20,826-byte chunk containing neither `three` nor `act2-director`.
  const page = [
    "---",
    "import Base from '../layouts/Base.astro';",
    "import {",
    "  forestSvg,",
    "} from '../scripts/snapshot-map';",
    "---",
    "<main data-experience-entry></main>",
    "<script>",
    "  import { runStorm } from '../scripts/act1-storm';",
    "</script>",
  ].join("\n");
  const seeds = extractAstroEntrySeeds(page);
  assert.deepEqual(seeds.client, ["../scripts/act1-storm"], "only the bundled script ships");
  assert.deepEqual(
    [...seeds.buildTime].sort(),
    ["../layouts/Base.astro", "../scripts/snapshot-map"],
    "frontmatter is build-time — including the multi-line import, which must still be SEEN to be classified",
  );
});

test("extractAstroEntrySeeds promotes a hydrated island — the one frontmatter import that ships", () => {
  const withDirective = [
    "---",
    "import ForestIsland from '../components/ForestIsland.astro';",
    "import Base from '../layouts/Base.astro';",
    "---",
    "<Base><ForestIsland client:visible /></Base>",
  ].join("\n");
  assert.deepEqual(
    extractAstroEntrySeeds(withDirective).client,
    ["../components/ForestIsland.astro"],
    "a client:* island is downloaded, so its frontmatter import is a client entry",
  );
  // CONTROL, same fixture minus the directive: it renders to markup and ships nothing.
  assert.deepEqual(
    extractAstroEntrySeeds(withDirective.replace(" client:visible", "")).client,
    [],
    "without a hydration directive the identical component is build-time only",
  );
});

test("extractAstroEntrySeeds fails WIDE on a page with no frontmatter fence", () => {
  // A plain `.html` entry is not an Astro page: there is no build-time region, so every import it
  // carries reaches the browser. Treating the whole file as the client seed is the conservative
  // direction, matching the gate classifier's posture elsewhere.
  assert.deepEqual(
    extractAstroEntrySeeds(`<main data-experience-entry></main>\nimport * as THREE from 'three';`).client,
    ["three"],
  );
});

test("extractAstroEntrySeeds: buildTime is EMPTY for an unfenced page, and excludes promoted islands", () => {
  // Both halves of the return value are asserted, not just `client`. A rung that reads only one
  // field lets the other be arbitrarily wrong — and `buildTime` is what D3's audit note prints.
  const unfenced = extractAstroEntrySeeds("<main></main>\nimport * as THREE from 'three';");
  assert.deepEqual(unfenced.client, ["three"]);
  assert.deepEqual(unfenced.buildTime, [], "an unfenced page has no build-time region at all");

  const island = [
    "---",
    "import ForestIsland from '../components/ForestIsland.astro';",
    "import Base from '../layouts/Base.astro';",
    "---",
    "<Base><ForestIsland client:visible /></Base>",
  ].join("\n");
  const seeds = extractAstroEntrySeeds(island);
  assert.deepEqual(seeds.client, ["../components/ForestIsland.astro"]);
  assert.deepEqual(
    seeds.buildTime,
    ["../layouts/Base.astro"],
    "a promoted island must be REMOVED from buildTime — else it is reported inert as well as walked",
  );
});

test("extractAstroEntrySeeds: a client: directive on an unknown component adds nothing", () => {
  // `bindings.get(...)` returns undefined for a tag with no frontmatter import. Without the guard
  // an `undefined` enters the client seed set and the caller walks it as a path.
  const page = ["---", "---", "<Mystery client:load />"].join("\n");
  const seeds = extractAstroEntrySeeds(page);
  assert.deepEqual(seeds.client, [], "no binding → nothing to promote");
});

test("extractAstroEntrySeeds: an EMPTY frontmatter fence is still a fence", () => {
  // ⚠ THE REGRESSION THAT MADE OTHER TESTS VACUOUS. `---\n---` is ordinary Astro — it is what a page
  // with no build-time code looks like — but the original matcher required a newline before the
  // closing fence and so did not match it. Such a page fell into the no-fence FAIL-WIDE branch,
  // where the whole body becomes the client seed. That gives the RIGHT answer for a page with empty
  // frontmatter, which is exactly why nothing caught it: fail-wide and correct agree here.
  //
  // It was found by mutation testing. A mutant that broke `SCRIPT_BLOCK_RE` outright did not fail
  // the test written to cover script blocks, because that test's empty-frontmatter fixture never
  // reached the script path at all. The assertion below is what pins the fence itself.
  const page = ["---", "---", "<script>", "  import { boot } from './b';", "</script>"].join("\n");
  const seeds = extractAstroEntrySeeds(page);
  assert.deepEqual(seeds.client, ["./b"], "the script block is the client seed");
  assert.deepEqual(seeds.buildTime, [], "an empty frontmatter contributes nothing");

  // The DISCRIMINATOR, in the same run: with a real fence, a body import OUTSIDE a script block is
  // not a client seed. Under fail-wide it would be. If the fence ever stops matching again, this
  // fails — where the assertions above would go on passing.
  const withStrayImport = ["---", "---", "<main></main>", "import * as THREE from 'three';"].join("\n");
  assert.deepEqual(
    extractAstroEntrySeeds(withStrayImport).client,
    [],
    "a fenced page ships only its script blocks — reaching this via fail-wide would report ['three']",
  );
});

test("extractAstroEntrySeeds: the fence tolerates trailing spaces and an EOF close", () => {
  // Two independent loosenings of the fence pattern, each invisible without its own input:
  // `[ \t]*` after the opening `---` (an editor leaves trailing whitespace there all the time), and
  // the `|$` alternative that lets a page END on its closing fence with no trailing newline.
  const trailingSpace = ["--- ", "import a from './a';", "---", "<main></main>"].join("\n");
  assert.deepEqual(
    extractAstroEntrySeeds(trailingSpace).buildTime,
    ["./a"],
    "trailing whitespace after the opening fence must not stop it being a fence",
  );
  const closesAtEof = ["---", "import a from './a';", "---"].join("\n");
  assert.deepEqual(
    extractAstroEntrySeeds(closesAtEof).buildTime,
    ["./a"],
    "a page may end on its closing fence",
  );
});

test("extractAstroEntrySeeds: a hydrated island is found past its other attributes", () => {
  // `client:*` is rarely the first attribute on the tag. A matcher that only reaches the directive
  // when it sits immediately after the component name would miss every realistic island — and
  // missing one is a shipped WebGL bundle reported as build-time.
  const page = [
    "---",
    "import ForestIsland from '../components/ForestIsland.astro';",
    "---",
    '<ForestIsland id="hero" data-kind="forest" client:visible />',
  ].join("\n");
  assert.deepEqual(
    extractAstroEntrySeeds(page).client,
    ["../components/ForestIsland.astro"],
    "attributes before the directive must not hide it",
  );
});

test("extractAstroEntrySeeds: a default import carrying a named clause still binds the component", () => {
  // `import Base, { thing } from '…'` — the binding used to resolve a `client:*` tag is the DEFAULT
  // one, and the named clause after the comma must be skipped over rather than ending the match.
  const page = [
    "---",
    "import ForestIsland, { PRESETS } from '../components/ForestIsland.astro';",
    "---",
    "<ForestIsland client:load />",
  ].join("\n");
  assert.deepEqual(extractAstroEntrySeeds(page).client, ["../components/ForestIsland.astro"]);
});

test("extractAstroEntrySeeds: the island BINDING regex has the same anchor and whitespace rules", () => {
  // `DEFAULT_IMPORT_RE` resolves a `client:*` tag back to the module it imports. It is a second,
  // separate statement matcher, so it gets its own chance to be wrong in the same three ways —
  // anchor, indent, and the size of the whitespace run. Each row promotes an island only if the
  // binding was found, so a missed binding shows up as an empty client seed.
  const withFrontmatter = (fm: string) =>
    extractAstroEntrySeeds(["---", fm, "---", "<ForestIsland client:load />"].join("\n")).client;

  assert.deepEqual(withFrontmatter("import ForestIsland from '../c/F.astro';"), ["../c/F.astro"]);
  assert.deepEqual(
    withFrontmatter("  import ForestIsland from '../c/F.astro';"),
    ["../c/F.astro"],
    "an indented frontmatter import still binds",
  );
  assert.deepEqual(
    withFrontmatter("const a = 1;import ForestIsland from '../c/F.astro';"),
    ["../c/F.astro"],
    "a semicolon with nothing after it is a statement boundary",
  );
  assert.deepEqual(
    withFrontmatter("import  ForestIsland from '../c/F.astro';"),
    ["../c/F.astro"],
    "two spaces after import",
  );
  assert.deepEqual(
    withFrontmatter("import ForestIsland from  '../c/F.astro';"),
    ["../c/F.astro"],
    "two spaces after from — the whitespace run before the specifier is spanned in full too",
  );
  assert.deepEqual(
    withFrontmatter("import  type ForestIsland from '../c/F.astro';"),
    [],
    "a double-spaced `import type` binds nothing — it is erased at build and ships no module",
  );
});

test("extractAstroEntrySeeds: only the BODY is scanned for script blocks, never the frontmatter", () => {
  // The body is the page MINUS the fenced region. Scanning the whole file instead would read markup
  // that frontmatter merely builds as a STRING as though the page contained it — and this site's
  // frontmatter really does serialise markup (that is what the snapshot map does).
  const page = [
    "---",
    "const snippet = \"<script>import x from 'three';</script>\";",
    "---",
    "<main></main>",
  ].join("\n");
  const seeds = extractAstroEntrySeeds(page);
  assert.deepEqual(
    seeds.client,
    [],
    "a <script> inside a frontmatter STRING is data, not a shipped script block",
  );
});

test("extractAstroEntrySeeds: a spaced closing script tag still closes the block", () => {
  // `</script >` is legal HTML. The matcher allows the whitespace; this is the input that proves it
  // does, and without it a whitespace-intolerant matcher swallows the rest of the page as script.
  const page = ["---", "---", "<script>", "  import { boot } from './b';", "</script >", "<main></main>"].join("\n");
  assert.deepEqual(extractAstroEntrySeeds(page).client, ["./b"]);
});

test("extractAstroEntrySeeds: a <script> carrying attributes is still a client seed", () => {
  // Astro scripts routinely carry attributes; `web/src/pages/index.astro` has both an `is:inline`
  // block and a bare one. A matcher that only accepted `<script>` would silently stop seeing the
  // shipped half of the page.
  for (const tag of ["<script>", '<script type="module">', "<script is:inline>"]) {
    const page = ["---", "---", tag, "  import { boot } from './b';", "</script>"].join("\n");
    assert.deepEqual(extractAstroEntrySeeds(page).client, ["./b"], `${tag} must be read`);
  }
});

test("extractAstroEntrySeeds: the frontmatter fence must be at the START of the file", () => {
  // Unanchored, any `---` later in the page (a horizontal rule, a second fence) would be read as
  // the frontmatter region and the client/build-time split computed from the wrong text.
  const page = ["<main data-experience-entry></main>", "---", "import x from 'three';", "---", ""].join("\n");
  const seeds = extractAstroEntrySeeds(page);
  assert.deepEqual(seeds.buildTime, [], "a mid-file `---` is not frontmatter");
  assert.deepEqual(seeds.client, ["three"], "so the whole file is the client seed (fail wide)");
});

// ── collectEntrySeeds ─────────────────────────────────────────────────────────

test("collectEntrySeeds: resolves seeds, and follows .astro components into their script blocks", () => {
  const files = new Map<string, string>([
    [
      "src/pages/index.astro",
      ["---", "import Base from '../layouts/Base.astro';", "---", "<script>", "  import { p } from '../scripts/page';", "</script>"].join("\n"),
    ],
    [
      "src/layouts/Base.astro",
      ["---", "import { cfg } from '../lib/cfg';", "---", "<script>", "  import { n } from '../scripts/nav';", "</script>"].join("\n"),
    ],
  ]);
  const seeds = collectEntrySeeds("src/pages/index.astro", (f) => files.get(f) ?? null);
  assert.deepEqual(
    [...seeds.client].sort(),
    ["src/scripts/nav", "src/scripts/page"],
    "the layout's OWN script block ships, resolved from the LAYOUT's directory",
  );
  assert.deepEqual(
    [...seeds.buildTime].sort(),
    ["src/lib/cfg"],
    "the layout's frontmatter stays build-time; the layout itself is walked, not listed",
  );
});

test("collectEntrySeeds: terminates on an .astro import cycle", () => {
  // Two layouts importing each other. Without the visited set this walks forever, and the rung
  // would HANG rather than fail — the worst shape, because a hang reads as infrastructure trouble.
  const files = new Map<string, string>([
    ["src/pages/index.astro", ["---", "import A from '../layouts/A.astro';", "---", ""].join("\n")],
    ["src/layouts/A.astro", ["---", "import B from './B.astro';", "---", ""].join("\n")],
    ["src/layouts/B.astro", ["---", "import A from './A.astro';", "---", "<script>", "  import { z } from '../scripts/z';", "</script>"].join("\n")],
  ]);
  const seeds = collectEntrySeeds("src/pages/index.astro", (f) => files.get(f) ?? null);
  assert.deepEqual(seeds.client, ["src/scripts/z"], "the cycle terminates and the far side is still reached");
});

test("collectEntrySeeds: an unreadable .astro component is skipped, not thrown on", () => {
  // `readFile` returns null for a specifier that resolves to nothing. The walk must treat that as a
  // leaf; dereferencing it would crash the rung on a single broken import.
  const files = new Map<string, string>([
    ["src/pages/index.astro", ["---", "import Gone from '../layouts/Gone.astro';", "---", ""].join("\n")],
  ]);
  const seeds = collectEntrySeeds("src/pages/index.astro", (f) => files.get(f) ?? null);
  assert.deepEqual(seeds.client, []);
  assert.deepEqual(seeds.buildTime, []);
});

// ── isWebGlSpecifier ──────────────────────────────────────────────────────────
// Detect the forbidden WebGL/R3F surface from a resolved specifier or path.

test("isWebGlSpecifier flags the bare `three` package", () => {
  assert.equal(isWebGlSpecifier("three"), true);
});

test("isWebGlSpecifier flags @react-three/* namespace packages", () => {
  assert.equal(isWebGlSpecifier("@react-three/fiber"), true);
  assert.equal(isWebGlSpecifier("@react-three/drei"), true);
  assert.equal(isWebGlSpecifier("@react-three/postprocessing"), true);
});

test("isWebGlSpecifier flags any path containing the forest-world-r3f dir segment", () => {
  assert.equal(isWebGlSpecifier("../lib/forest-world-r3f/index.ts"), true);
  assert.equal(isWebGlSpecifier("./src/forest-world-r3f/scene.ts"), true);
  assert.equal(isWebGlSpecifier("src/forest-world-r3f/index.ts"), true);
});

test("isWebGlSpecifier passes non-WebGL specifiers", () => {
  assert.equal(isWebGlSpecifier("./canvas.ts"), false, "plain canvas");
  assert.equal(isWebGlSpecifier("gsap"), false, "animation lib");
  assert.equal(isWebGlSpecifier("@web-audio/worklet"), false, "audio namespace");
  assert.equal(isWebGlSpecifier("../forest-world/index.ts"), false, "plain forest-world without r3f");
  assert.equal(isWebGlSpecifier("./three-utils.ts"), false, "local file starting with 'three'");
});

// ── walkStaticClosure ─────────────────────────────────────────────────────────
// Graph walk from the Act 1 entry — injection-testable via in-memory file maps.

test("walkStaticClosure follows static imports transitively through the file graph", () => {
  const files = new Map<string, string>([
    ["src/act1.ts", `import { s } from './storm.ts'; import { a } from './audio.ts';`],
    ["src/storm.ts", `import { c } from './canvas.ts';`],
    ["src/audio.ts", `/* no imports */`],
    ["src/canvas.ts", `/* leaf */`],
  ]);
  const readFile = (p: string): string | null => files.get(p) ?? null;
  const closure = walkStaticClosure("src/act1.ts", readFile);
  assert.ok(closure.has("src/storm.ts"), "direct dep storm.ts");
  assert.ok(closure.has("src/audio.ts"), "direct dep audio.ts");
  assert.ok(closure.has("src/canvas.ts"), "transitive dep via storm.ts");
});

test("walkStaticClosure includes bare external package specifiers in the closure", () => {
  const files = new Map<string, string>([
    ["src/act1.ts", `import { tween } from 'gsap'; import { a } from './local.ts';`],
    ["src/local.ts", `/* leaf */`],
  ]);
  const closure = walkStaticClosure("src/act1.ts", (p) => files.get(p) ?? null);
  assert.ok(closure.has("gsap"), "external bare specifier in closure");
  assert.ok(closure.has("src/local.ts"), "resolved local path in closure");
});

test("walkStaticClosure does NOT include dynamic import() targets", () => {
  const files = new Map<string, string>([
    ["src/act1.ts", `
      import { canvas } from './canvas.ts';
      // the sanctioned Act-2 lazy-load seam — not in the static closure:
      const loadAct2 = () => import('three');
    `],
    ["src/canvas.ts", `/* no WebGL */`],
  ]);
  const closure = walkStaticClosure("src/act1.ts", (p) => files.get(p) ?? null);
  assert.ok(!closure.has("three"), "dynamic import target excluded from static closure");
  assert.ok(closure.has("src/canvas.ts"), "static import still traversed");
});

test("walkStaticClosure handles circular imports without infinite looping", () => {
  const files = new Map<string, string>([
    ["src/a.ts", `import { b } from './b.ts';`],
    ["src/b.ts", `import { a } from './a.ts';`],
  ]);
  // Must return, not hang
  const closure = walkStaticClosure("src/a.ts", (p) => files.get(p) ?? null);
  assert.ok(closure.has("src/b.ts"), "b.ts reachable from a.ts");
  assert.ok(closure.has("src/a.ts"), "entry a.ts in closure");
});

// ── checkExperienceEntry — integration over fixture site-trees ────────────────
// The single judge combining the marker contract + WebGL wall (why this is a
// capability not three separate contracts — one verdict, one gate).

test("checkExperienceEntry passes for a well-formed entry with WebGL-free Act 1 closure", () => {
  const page = `
    <button data-experience-skip>Skip to calm</button>
    <div data-experience-fallback>Reduced motion fallback</div>
  `;
  const files = new Map<string, string>([
    ["src/act1.ts", `import { canvas } from './canvas.ts'; import { audio } from './audio.ts';`],
    ["src/canvas.ts", `/* plain Canvas 2D API */`],
    ["src/audio.ts", `/* Web Audio API */`],
  ]);
  const problems = checkExperienceEntry(page, "src/act1.ts", (p) => files.get(p) ?? null);
  assert.deepEqual(problems, [], "no problems for a well-formed entry");
});

test("checkExperienceEntry fails when data-experience-skip is absent", () => {
  const page = `<div data-experience-fallback>Fallback only</div>`;
  const problems = checkExperienceEntry(page, "src/act1.ts", () => null);
  const kinds = problems.map((p) => p.kind);
  assert.ok(kinds.includes("missing-skip-marker"), `expected missing-skip-marker in ${JSON.stringify(kinds)}`);
});

test("checkExperienceEntry fails when data-experience-fallback is absent", () => {
  const page = `<button data-experience-skip>Skip only</button>`;
  const problems = checkExperienceEntry(page, "src/act1.ts", () => null);
  const kinds = problems.map((p) => p.kind);
  assert.ok(kinds.includes("missing-fallback-marker"), `expected missing-fallback-marker in ${JSON.stringify(kinds)}`);
});

test("checkExperienceEntry reports both problems when neither marker is present", () => {
  const page = `<main>No affordance markers at all</main>`;
  const problems = checkExperienceEntry(page, "src/act1.ts", () => null);
  const kinds = problems.map((p) => p.kind);
  assert.ok(kinds.includes("missing-skip-marker"), "missing-skip-marker reported");
  assert.ok(kinds.includes("missing-fallback-marker"), "missing-fallback-marker reported");
});

test("checkExperienceEntry fails when Act 1 directly imports three", () => {
  const page = `
    <button data-experience-skip>Skip</button>
    <div data-experience-fallback>Fallback</div>
  `;
  const files = new Map<string, string>([
    ["src/act1.ts", `import * as THREE from 'three';`],
  ]);
  const problems = checkExperienceEntry(page, "src/act1.ts", (p) => files.get(p) ?? null);
  assert.equal(problems.length, 1);
  assert.equal(problems[0]?.kind, "webgl-leak");
  assert.match(problems[0]?.detail ?? "", /three/);
});

test("checkExperienceEntry fails when three is transitively reachable via static imports", () => {
  const page = `
    <button data-experience-skip>Skip</button>
    <div data-experience-fallback>Fallback</div>
  `;
  const files = new Map<string, string>([
    ["src/act1.ts", `import { storm } from './storm.ts';`],
    ["src/storm.ts", `import * as THREE from 'three';`],
  ]);
  const problems = checkExperienceEntry(page, "src/act1.ts", (p) => files.get(p) ?? null);
  assert.equal(problems.length, 1);
  assert.equal(problems[0]?.kind, "webgl-leak");
});

test("checkExperienceEntry passes when three is reached only via dynamic import (the inflection seam)", () => {
  const page = `
    <button data-experience-skip>Skip</button>
    <div data-experience-fallback>Fallback</div>
  `;
  const files = new Map<string, string>([
    ["src/act1.ts", `
      import { canvas } from './canvas.ts';
      // lazy-load at the Act-1 → Act-2 inflection — the sanctioned seam:
      const loadScene = () => import('three');
    `],
    ["src/canvas.ts", `/* no WebGL — plain canvas API */`],
  ]);
  const problems = checkExperienceEntry(page, "src/act1.ts", (p) => files.get(p) ?? null);
  assert.deepEqual(problems, [], "dynamic-only path is allowed");
});

test("checkExperienceEntry fails when Act 1 imports from the @react-three/* namespace", () => {
  const page = `
    <button data-experience-skip>Skip</button>
    <div data-experience-fallback>Fallback</div>
  `;
  const files = new Map<string, string>([
    ["src/act1.ts", `import { Canvas } from '@react-three/fiber';`],
  ]);
  const problems = checkExperienceEntry(page, "src/act1.ts", (p) => files.get(p) ?? null);
  assert.equal(problems.length, 1);
  assert.equal(problems[0]?.kind, "webgl-leak");
  assert.match(problems[0]?.detail ?? "", /@react-three/);
});

test("checkExperienceEntry fails when a path containing forest-world-r3f is statically reachable", () => {
  const page = `
    <button data-experience-skip>Skip</button>
    <div data-experience-fallback>Fallback</div>
  `;
  // forest-world-r3f is the synced R3F island dir (ADR-0134 §1 tech split); its path in
  // the resolved closure signals that the R3F bundle would be dragged into first paint.
  const files = new Map<string, string>([
    ["src/act1.ts", `import { Scene } from './forest-world-r3f/scene.ts';`],
  ]);
  const problems = checkExperienceEntry(page, "src/act1.ts", (p) => files.get(p) ?? null);
  assert.equal(problems.length, 1);
  assert.equal(problems[0]?.kind, "webgl-leak");
  assert.match(problems[0]?.detail ?? "", /forest-world-r3f/);
});

// ── checkExperienceSite — the site-level judge over fixture site-trees ────────
// The grain the gate actually runs (the `## Contracts` ids lead these test names,
// ADR-0122): adoption detection via the explicit data-experience-entry marker,
// page-tagged findings, the extension-resolving closure walk, and the bootstrap SKIP.

test("erg-skip-marker-required: an entry page missing data-experience-skip reds with the page named; present → no finding", () => {
  const missing = new Map<string, string>([
    [
      "src/pages/index.astro",
      `<main data-experience-entry><div data-experience-fallback>calm view</div></main>`,
    ],
  ]);
  const red = checkExperienceSite(missing);
  assert.equal(red.kind, "checked");
  const findings = red.kind === "checked" ? red.findings : [];
  assert.equal(findings.length, 1);
  assert.equal(findings[0]?.page, "src/pages/index.astro", "the finding names the entry page");
  assert.equal(findings[0]?.problem.kind, "missing-skip-marker");

  const present = new Map<string, string>([
    [
      "src/pages/index.astro",
      `<main data-experience-entry>
         <button data-experience-skip>Skip to calm</button>
         <div data-experience-fallback>calm view</div>
       </main>`,
    ],
  ]);
  const green = checkExperienceSite(present);
  assert.equal(green.kind, "checked");
  assert.deepEqual(green.kind === "checked" ? green.findings : null, []);
});

test("erg-fallback-marker-required: an entry page missing data-experience-fallback reds with the page named; present → no finding", () => {
  const missing = new Map<string, string>([
    [
      "src/pages/index.astro",
      `<main data-experience-entry><button data-experience-skip>Skip</button></main>`,
    ],
  ]);
  const red = checkExperienceSite(missing);
  assert.equal(red.kind, "checked");
  const findings = red.kind === "checked" ? red.findings : [];
  assert.equal(findings.length, 1);
  assert.equal(findings[0]?.page, "src/pages/index.astro", "the finding names the entry page");
  assert.equal(findings[0]?.problem.kind, "missing-fallback-marker");
});

test("erg-act1-static-closure-is-webgl-free: a static chain from the entry to three reds naming the leak; the same target behind dynamic import() is green", () => {
  // The entry page's frontmatter import is extensionless — the walk must resolve it
  // (withExtensionFallback), or the wall is toothless the day the storm lands.
  const entryPage = [
    "---",
    "import { bootStorm } from '../scripts/act1';",
    "---",
    "<main data-experience-entry>",
    "  <button data-experience-skip>Skip to calm</button>",
    "  <div data-experience-fallback>calm view</div>",
    "</main>",
  ].join("\n");
  const files = new Map<string, string>([
    ["src/pages/index.astro", entryPage],
    ["src/scripts/act1.ts", `import { grain } from './grain.ts';`],
    ["src/scripts/grain.ts", `import * as THREE from 'three';`],
  ]);
  const red = checkExperienceSite(files);
  assert.equal(red.kind, "checked");
  const redFindings = red.kind === "checked" ? red.findings : [];
  assert.equal(redFindings.length, 1);
  assert.equal(redFindings[0]?.problem.kind, "webgl-leak");
  assert.match(redFindings[0]?.problem.detail ?? "", /three/, "the leak names the WebGL target");

  // The same target moved behind the sanctioned inflection seam — dynamic import() — is green.
  files.set("src/scripts/grain.ts", `export const loadScene = () => import('three');`);
  const green = checkExperienceSite(files);
  assert.equal(green.kind, "checked");
  assert.deepEqual(green.kind === "checked" ? green.findings : null, []);
});

test("erg-absent-experience-skips: a site tree with no data-experience-entry page yields SKIP (not red, not green-silent)", () => {
  // Today's pre-experience site: real pages, no adoption marker — the bootstrap allowance.
  const todaysSite = new Map<string, string>([
    ["src/pages/index.astro", `<main><h1>storytree</h1><p>the pre-experience landing page</p></main>`],
    ["src/pages/how-it-works.astro", `<main>a plain info page</main>`],
  ]);
  const result = checkExperienceSite(todaysSite);
  assert.equal(result.kind, "skip", "no entry marker → SKIP, never a failure");
  assert.match(
    result.kind === "skip" ? result.reason : "",
    /bootstrap allowance/,
    "the SKIP is loud about why",
  );

  const empty = checkExperienceSite(new Map());
  assert.equal(empty.kind, "skip", "an empty site tree also SKIPs");

  // The marker outside src/pages/ (a component, a doc) does NOT arm the gate.
  const strayMarker = new Map<string, string>([
    ["src/components/Notes.md", `mentions data-experience-entry in prose`],
  ]);
  assert.equal(checkExperienceSite(strayMarker).kind, "skip");
});

test("withExtensionFallback resolves extensionless specifiers to known source extensions", () => {
  const files = new Map<string, string>([["src/a.ts", "content-a"]]);
  const read = withExtensionFallback((p) => files.get(p) ?? null);
  assert.equal(read("src/a"), "content-a", "extensionless hit via .ts fallback");
  assert.equal(read("src/a.ts"), "content-a", "literal path still direct");
  assert.equal(read("src/missing"), null, "no candidate → null");
});
