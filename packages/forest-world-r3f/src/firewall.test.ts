// firewall.test.ts — the ADR-0123 PROVABILITY FIREWALL, asserted rather than described.
//
// The package's contract is a split: the pure half (descriptor mapping, and now the
// live-render experiment's thinking modules) must stay importable under bare `node:test`
// with no React and no three.js, while the browser half sits behind the `./canvas` subpath
// and the dev-only harness. That split is currently held by comments and by the root
// barrel's export list — which is to say by discipline, and this arc's whole record is of
// discipline being where things quietly go wrong.
//
// The live-render experiment made the split load-bearing in a new way: it added FOUR
// modules, three pure and one (`banded-material.ts`) that imports three.js. Nothing
// mechanical stopped a later edit from re-exporting the three.js one through the pure
// barrel, or from adding a three.js import to one of the pure three — either of which would
// break every consumer that imports this package under bare node, and would do it silently
// until someone ran the right test in the right place.
//
// This file makes the boundary a check. It reads SOURCE rather than importing, because an
// import test proves only that the module loaded in an environment that happened to have
// three available; the claim is about what the source DEPENDS ON.

import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const SRC = dirname(fileURLToPath(import.meta.url));

/** Modules that are allowed to reach for the browser. Everything else in `src/` is pure. */
const BROWSER_BOUND = new Set(['ForestWorldCanvas.tsx', 'banded-material.ts']);

/** Imports that make a module browser-bound. */
const BROWSER_IMPORTS = [/from ['"]three['"]/, /from ['"]react/, /from ['"]@react-three\//];

function sourceFiles(): string[] {
  return readdirSync(SRC).filter(
    (f) => (f.endsWith('.ts') || f.endsWith('.tsx')) && !f.endsWith('.test.ts'),
  );
}

test('the firewall holds: no PURE module imports three, React or R3F', () => {
  const breaches: string[] = [];
  for (const file of sourceFiles()) {
    if (BROWSER_BOUND.has(file)) continue;
    const src = readFileSync(join(SRC, file), 'utf8');
    for (const pattern of BROWSER_IMPORTS) {
      if (pattern.test(src)) breaches.push(`${file} matches ${pattern}`);
    }
  }
  assert.deepEqual(
    breaches,
    [],
    `these modules are on the pure side of the firewall but import the browser:\n  ${breaches.join('\n  ')}\n` +
      'Either move the module behind the ./canvas subpath and add it to BROWSER_BOUND, or drop the import.',
  );
});

test('NON-VACUITY: the browser-bound modules really do import the browser', () => {
  // Without this, BROWSER_BOUND could be quietly widened to silence the check above, and
  // the firewall test would pass by exempting everything.
  for (const file of BROWSER_BOUND) {
    const src = readFileSync(join(SRC, file), 'utf8');
    assert.ok(
      BROWSER_IMPORTS.some((p) => p.test(src)),
      `${file} is listed as browser-bound but imports no browser library — the exemption is ` +
        'unearned, and an unearned exemption is how this check stops meaning anything.',
    );
  }
});

test('the ROOT BARREL re-exports nothing browser-bound', () => {
  // The barrel is what a bare-node consumer imports. A single re-export of the canvas or
  // the banded material would break every one of them.
  const barrel = readFileSync(join(SRC, 'index.ts'), 'utf8');
  for (const file of BROWSER_BOUND) {
    const specifier = file.replace(/\.tsx?$/, '');
    assert.ok(
      !barrel.includes(`./${specifier}.js`),
      `index.ts re-exports ${file}, which imports the browser — the firewall is breached at ` +
        'the one place every consumer touches.',
    );
  }
  for (const pattern of BROWSER_IMPORTS) {
    assert.ok(!pattern.test(barrel), `index.ts itself matches ${pattern}`);
  }
});

test('the experiment modules are on the PURE side, and are covered by this check', () => {
  // Names the three explicitly: a rename that dropped one from src/ would otherwise make the
  // sweep above pass over a file that no longer exists, which reads identically to a pass.
  const present = new Set(sourceFiles());
  for (const file of ['palette-band.ts', 'plant-descriptors.ts', 'plant-geometry.ts']) {
    assert.ok(present.has(file), `${file} is missing from src/ — the firewall sweep would skip it`);
    assert.ok(!BROWSER_BOUND.has(file), `${file} must stay on the pure side of the firewall`);
  }
});
