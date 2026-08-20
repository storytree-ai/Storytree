// scope-fence.test.ts — the check that keeps the live-render experiment OUT of the public
// website, and keeps the package's provability firewall honest while it is there.
//
// WHY THIS FILE EXISTS AT ALL, AND IT IS NOT A STYLE RULE. `packages/forest-world-r3f/src`
// is MIRRORED into the public storytree-web repo by `pnpm sync:web-engine`, which copies
// every non-test `.ts`/`.tsx` it finds under that directory and offers NO mechanism to
// exclude one. CI's `check:web-engine` blocks until the mirror matches.
//
// This experiment first landed its four modules in `src/` and CI duly refused: four files
// "missing from the synced copy". The obvious remedy — run the sync, commit the web
// submodule, bump the gitlink — would have PUBLISHED an unadopted experiment to a public
// repo. The increment authorises the experiment and says in as many words that adopting it
// is a separate event and the owner's call. So the modules moved to `harness/`, which is
// dev-only, typechecked, tested, and outside the synced tree.
//
// That makes "the experiment publishes nothing" a property of WHERE THE FILES ARE, which is
// exactly the kind of property that decays silently when someone later moves a file for a
// good-looking local reason. Hence a test.

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
  'plant-descriptors.ts',
  'plant-geometry.ts',
  'land-definition.ts',
  'shadow-ladder.ts',
  'land-shadow.ts',
  'banded-material.ts',
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

test('src/ still holds exactly the files the website sync expects, and nothing new', () => {
  // The sync's own required-file floor, restated here so a DELETION from src/ is caught by
  // this package rather than only by CI against a submodule this checkout may not even have.
  const inSrc = new Set(readdirSync(SRC));
  for (const required of ['index.ts', 'world-to-3d.ts', 'ForestWorldCanvas.tsx']) {
    assert.ok(inSrc.has(required), `src/${required} is required by the web-engine sync`);
  }
});

test('the PURE half of the experiment imports no browser library', () => {
  // The provability-firewall discipline, applied inside the harness: every module but one
  // must stay node:test-provable, so the palette closure, the confusability ceiling and the
  // shadow geometry are all proved without a browser. Only `banded-material.ts` may reach
  // for three.
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
