// scope-fence.test.ts — the check that keeps the live-render experiment OUT of the public
// website, and keeps the package's provability firewall honest while it is there.
//
// WHY THIS FILE EXISTS AT ALL, AND IT IS NOT A STYLE RULE. `packages/forest-world-r3f/src`
// is MIRRORED into the public storytree-web repo by `pnpm sync:web-engine`, which copies
// every non-test `.ts`/`.tsx` it finds under that directory and offers NO mechanism to
// exclude one. CI's `check:web-engine` blocks until the mirror matches.
//
// This experiment first landed its modules in `src/` and CI duly refused: the files were
// "missing from the synced copy". The obvious remedy — run the sync, commit the web
// submodule, bump the gitlink — would have PUBLISHED an unadopted experiment to a public
// repo. The increment authorises the experiment and says in as many words that adopting it
// is a separate event and the owner's call. So the modules moved to `harness/`, which is
// dev-only, typechecked, tested, and outside the synced tree.
//
// That makes "the experiment publishes nothing" a property of WHERE THE FILES ARE, which is
// exactly the kind of property that decays silently when someone later moves a file for a
// good-looking local reason. Hence a test.
//
// ⚠⚠ THE FENCE IS NO LONGER ABSOLUTE — THE OWNER LIFTED IT ON 2026-08-29, and this file said in
// as many words that it is where that gets recorded. On the pictures in
// `docs/research/chapter2-vocabulary-2026-08-29/` he wrote: "This looks better, stamp it, i'm
// still hoping for future iterations to improve the ground texture and add shadows. Cut self
// perpetuating session to continue the drive." That settles ADR-0406 D2 / ADR-0380 D6's
// separate-and-deliberate event in the affirmative, and
// `oq-the-island-is-re-dressed-and-thirty-five-of-them-stand-to` carries the answer.
//
// SO THE LIST BELOW IS NOW A WORKLIST RATHER THAN A WALL, and it must stay one: a module leaves
// it only by ACTUALLY CROSSING — moving into `src/`, being drawn by the shipped canvas, and
// leaving a re-export behind so the harness keeps drawing the same thing the product does.
// {@link ADOPTED} is the other half of that ledger, and the test below refuses a name that has
// silently vanished from both. Deleting a line from `EXPERIMENT` is not adoption; it is how a
// fence stops meaning anything.

import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const HARNESS = dirname(fileURLToPath(import.meta.url));
const SRC = join(HARNESS, '..', 'src');

/** The experiment's own modules. Named, not inferred: a rename that dropped one would
 *  otherwise make every sweep below pass over a file that no longer exists, which reads
 *  exactly like a pass. */
const EXPERIMENT = [
  'palette-band.ts',
  'mesh-kit.ts',
  'plant-descriptors.ts',
  'plant-geometry.ts',
  'land-definition.ts',
  'flower-descriptors.ts',
  'flower-geometry.ts',
  'tree-descriptors.ts',
  'tree-geometry.ts',
  'shadow-ladder.ts',
  'land-shadow.ts',
  // The occlusion and ground-variation modules landed in PR #1480 and were never added here, so
  // the sweeps below have been passing OVER them — which is the exact decay this file's header
  // warns about, arriving by omission rather than by rename. Added while extending the list for
  // the props, because a fence with holes in it reads as more coverage than it has.
  'contact-shade.ts',
  'ground-variation.ts',
  // The prop vocabulary (ADR-0406). All four are pure: the three generators author geometry and
  // placement in world units, and the dressing module composes them. None of them may reach for
  // three or react — a prop that needed a browser to be generated could not be proved in node,
  // and the whole point of `island-dressing.ts` being pure is that "the same island renders
  // identically in a capture, in a test and in a browser" is a claim a test can make.
  'prop-linear.ts',
  'prop-structures.ts',
  'prop-layout.ts',
  'island-dressing.ts',
  'banded-material.ts',
  // The grain octave and the instrument that measures it (the adoption arc's crossing probe).
  // `pixel-metrics.ts` is the TypeScript twin of `measure_land.py`, which only runs inside
  // Blender — it exists so a number taken off a BROWSER can be read against that file's
  // committed table. Both belong outside the synced tree for the same reason as everything
  // above: adoption is a separate event (ADR-0380 D6 / ADR-0406 D2).
  'land-grain.ts',
  'pixel-metrics.ts',
  // The scenery ground covers and the separation instrument that authorises one. It belongs out
  // here for a second reason on top of the usual one: it deliberately keeps its own palette
  // widening rather than growing `landTokens()`, so the shipped fence on the audited pages does
  // not move — a property that only holds while the module stays outside the synced tree.
  'ground-cover.ts',
  // The frame-budget rung — the pure half of the hardware floor's first refusal. It belongs out
  // here with the rest for the same reason: adoption is a separate event, and nothing about the
  // experiment publishes.
  'frame-budget.ts',
  // The first-textured-asset probe's PURE half (`first-textured-asset-in-the-live-renderer`).
  // `asset-payload.ts` is the bytes a visitor downloads and the three verdicts read off them;
  // `pine-asset.ts` is where the comparison's trees stand, how big the bought pine has to be,
  // and how many draw calls each arm is allowed. Both must stay reachable from node — the
  // payload answer is the whole point of the increment and a number nobody can re-derive
  // without a GPU is not one — so both belong in the pure sweep below. Their browser half
  // (`pine-scene.ts`) is deliberately NOT listed: it imports three by design.
  'asset-payload.ts',
  'pine-asset.ts',
  // The textured-asset colour guard (`guard-the-textured-asset-colour-convention`). It is the
  // convention every bought texture on this surface is sampled in, plus the arithmetic that
  // judges a frame against it, and it must stay node-provable: the verdict is what refuses a
  // build, and a verdict nobody can reproduce without a GPU is a verdict nobody can audit. Its
  // browser half (`colour-convention-scene.ts`) is deliberately NOT listed, exactly as
  // `pine-scene.ts` is not — it imports three because reading delivered pixels needs a renderer.
  'texture-convention.ts',
  // The bought kit's PROP VOCABULARY (`dress-a-whole-island-from-the-bought-kit`) — what each
  // prop MEANS, how many of it a capability's facts put on its parcel, and where each one
  // stands. Pure, and it must stay so: the vocabulary is the claim the island makes about the
  // work, and a claim only a GPU can reproduce is one nobody can audit. Its browser half
  // (`kit-scene.ts`) and its page (`kit-island-scene.ts`) are deliberately NOT listed — both
  // import three, exactly as `pine-scene.ts` does.
  'kit-vocabulary.ts',
];

/** WHAT HAS CROSSED, and what the shipped canvas therefore publishes — the adoption ledger.
 *
 *  Each entry names the module now living in `src/`, and the harness file that re-exports it so
 *  the experiment and the product cannot drift apart. The test below holds BOTH halves: the
 *  file is really in `src/`, and the harness really re-exports from it. A crossing that dropped
 *  the re-export would leave two relief fields, which is how this package acquired three
 *  disagreeing status palettes and spent an increment putting them back together. */
const ADOPTED: readonly { src: string; reExportedBy: string; because: string }[] = [
  {
    src: 'land-relief.ts',
    reExportedBy: 'land-definition.ts',
    because:
      "the ground's relief field — the first component of the approved land treatment to reach " +
      'the shipped map (owner-authorised 2026-08-29)',
  },
  {
    src: 'shade-ladder.ts',
    reExportedBy: 'palette-band.ts',
    because:
      'the authored shade ladder and the `token x level` arithmetic — the shipped ground now ' +
      'quantises its lighting onto it (`src/banded-ground-material.ts`), so the experiment and ' +
      'the product cannot band differently. The token VOCABULARY stayed in palette-band.ts: it ' +
      'is the props, flowers and covers of the harness island, and none of that ships.',
  },
];

const BROWSER_IMPORTS = [/from ['"]three['"]/, /from ['"]react/, /from ['"]@react-three\//];

test('the experiment lives in harness/, which the web sync does not copy', () => {
  const inHarness = new Set(readdirSync(HARNESS));
  const inSrc = new Set(readdirSync(SRC));
  for (const file of EXPERIMENT) {
    assert.ok(inHarness.has(file), `${file} is not in harness/ — the sweep would skip it`);
    assert.ok(
      !inSrc.has(file),
      `${file} is in src/, which pnpm sync:web-engine MIRRORS INTO THE PUBLIC WEBSITE REPO. ` +
        'Moving it there publishes an unadopted experiment. If this is a deliberate adoption, ' +
        'that is an owner decision and this test is the place it gets recorded.',
    );
  }
});

test('an ADOPTED module really crossed — it is in src/, and the harness re-exports it', () => {
  // ⚠ BOTH HALVES, because either alone is satisfied by the failure it is meant to catch. "It is
  // in src/" alone passes for a COPY, which leaves the experiment and the product free to drift.
  // "The harness re-exports it" alone passes for a file that never moved at all.
  const inSrc = new Set(readdirSync(SRC));
  for (const entry of ADOPTED) {
    assert.ok(
      inSrc.has(entry.src),
      `src/${entry.src} is recorded as adopted but is not in src/ — ${entry.because}`,
    );
    const specifier = `../src/${entry.src.replace(/\.tsx?$/, '.js')}`;
    const harnessSrc = readFileSync(join(HARNESS, entry.reExportedBy), 'utf8');
    assert.ok(
      harnessSrc.includes(specifier),
      `harness/${entry.reExportedBy} must re-export from ${specifier}, or the experiment and ` +
        'the shipped map are running two different copies of it',
    );
    assert.ok(entry.because.length > 0, `${entry.src} must say why it crossed`);
  }
});

test('nothing has left the fence by simply being deleted from the list', () => {
  // The one way this file could stop meaning anything: a session that wanted a module in `src/`
  // deletes its EXPERIMENT line, and every sweep above then passes over a file that is now
  // published. Adoption goes THROUGH the ledger, so every harness module that is neither fenced
  // nor adopted has to be one this file never claimed to cover — and the assertion is that the
  // two lists together still account for the land treatment's own modules.
  const accounted = new Set([...EXPERIMENT, ...ADOPTED.map((a) => a.src)]);
  const owedModules = [
    'land-definition.ts',
    'land-relief.ts',
    'banded-material.ts',
    'land-grain.ts',
    'palette-band.ts',
    'shade-ladder.ts',
  ];
  for (const owed of owedModules) {
    assert.ok(accounted.has(owed), `${owed} is in neither EXPERIMENT nor ADOPTED — unaccounted for`);
  }
});

test('src/ still holds exactly the files the website sync expects, and nothing new', () => {
  // The sync's own required-file floor, restated here so a DELETION from src/ is caught by
  // this package rather than only by CI against a submodule this checkout may not even have.
  const inSrc = new Set(readdirSync(SRC));
  for (const required of ['index.ts', 'world-to-3d.ts', 'ForestWorldCanvas.tsx']) {
    assert.ok(inSrc.has(required), `src/${required} is required by the web-engine sync`);
  }
});

test('the PURE half of the experiment imports no browser library', () => {
  // The provability-firewall discipline, applied inside the harness: every module but ONE
  // must stay node:test-provable, so the palette closure, the three UAT verdict FORMS, the
  // story tree's geometry, the confusability ceiling and the shadow field are all proved
  // without a browser. Only `banded-material.ts` may reach for three, and the non-vacuity
  // test below keeps that exemption earned.
  const pure = EXPERIMENT.filter((f) => f !== 'banded-material.ts');
  const breaches: string[] = [];
  for (const file of pure) {
    const src = readFileSync(join(HARNESS, file), 'utf8');
    for (const pattern of BROWSER_IMPORTS) {
      if (pattern.test(src)) breaches.push(`${file} matches ${pattern}`);
    }
  }
  assert.deepEqual(breaches, [], `pure modules importing the browser:\n  ${breaches.join('\n  ')}`);
});

test('NON-VACUITY: the one browser-bound module really does import the browser', () => {
  // Without this, the exemption above could be widened until the check exempts everything.
  const src = readFileSync(join(HARNESS, 'banded-material.ts'), 'utf8');
  assert.ok(
    BROWSER_IMPORTS.some((p) => p.test(src)),
    'banded-material.ts is exempted as browser-bound but imports no browser library — an ' +
      'unearned exemption is how this check stops meaning anything.',
  );
});

test('the ROOT BARREL is untouched by the experiment — bare-node consumers are unaffected', () => {
  const barrel = readFileSync(join(SRC, 'index.ts'), 'utf8');
  for (const file of EXPERIMENT) {
    const specifier = file.replace(/\.tsx?$/, '');
    assert.ok(
      !barrel.includes(specifier),
      `index.ts references ${file}. The barrel is what every bare-node consumer imports, and ` +
        'it is also what the website syncs — a reference from here drags the experiment into both.',
    );
  }
  for (const pattern of BROWSER_IMPORTS) {
    assert.ok(!pattern.test(barrel), `index.ts itself matches ${pattern}`);
  }
});

test('no src/ module imports the harness — the dependency only ever points inward', () => {
  // The direction that would break the mirror: a synced file importing something the sync
  // does not copy produces a dangling import in the public repo, and the failure surfaces
  // there rather than here.
  for (const file of readdirSync(SRC)) {
    if (!file.endsWith('.ts') && !file.endsWith('.tsx')) continue;
    const src = readFileSync(join(SRC, file), 'utf8');
    assert.ok(
      !/from ['"]\.\.\/harness\//.test(src),
      `src/${file} imports from harness/, which the website sync does not copy — the synced ` +
        'copy would carry a dangling import.',
    );
  }
});

test('the pure half holds NO CLOCK and NO Math.random — determinism, and the never-animate rule', () => {
  // TWO standing rules, and one sweep proves both because they forbid the same thing.
  //
  // ADR-0380 D6 fence 2: determinism MOVES rather than disappearing. A mesh whose shape changed
  // between two frames would take the scene graph's byte-reproducibility with it, and every proof
  // that attaches to the graph with it.
  //
  // And the UAT flowers' own corollary: NEVER ANIMATE A FLOWER. Motion that changes silhouette
  // blurs the three verdict shapes into each other, which is the ADR-0045 honesty wall. Grass may
  // move; a verdict may not. The enforcement is that there is no clock to read — a caller cannot
  // animate a flower even by accident, because nothing downstream of `growFlower` can know what
  // time it is.
  const forbidden = [/Math\.random/, /Date\.now/, /new Date\b/, /performance\.now/];
  const breaches: string[] = [];
  for (const file of EXPERIMENT.filter((f) => f !== 'banded-material.ts')) {
    const src = readFileSync(join(HARNESS, file), 'utf8');
    for (const pattern of forbidden) {
      // A mention inside a comment is a WARNING about the rule, which is exactly the kind of
      // prose this codebase wants; only executable occurrences are breaches.
      const code = src
        .split('\n')
        .filter((line) => !/^\s*(\/\/|\*|\/\*)/.test(line))
        .join('\n');
      if (pattern.test(code)) breaches.push(`${file} matches ${pattern}`);
    }
  }
  assert.deepEqual(breaches, [], `non-deterministic sources in the pure half:\n  ${breaches.join('\n  ')}`);
});
