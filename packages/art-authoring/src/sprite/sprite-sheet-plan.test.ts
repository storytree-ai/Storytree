// sprite-sheet-plan.test.ts — the PURE plan is offline-provable: the prompt splices subject+style and
// pins the flat-white-background clause the cutout relies on; the full plan covers exactly the stub key
// roster; and the assembled manifest matches the sprite-sheet contract shape (undistorted display box
// from the trimmed aspect, bottom-centre anchors).

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  spritePrompt,
  buildManifest,
  FULL_ROSTER,
  FULL_KEY_TO_FILE,
  HERO_KEY_TO_FILE,
  STUB_SHEET_KEYS,
  COSY_PLAN,
  EVENING_PLAN,
  COSY_STYLE_CLAUSE,
  EVENING_STYLE_CLAUSE,
  type MeasuredImage,
} from './sprite-sheet-plan.js';

test('spritePrompt splices the subject + style clause and always asks for a flat white cutout background', () => {
  const job = { file: 'cottage', object: 'little timber cottage', variant: 'with a warm window', targetHeight: 52 };
  const p = spritePrompt(job, COSY_STYLE_CLAUSE);
  assert.match(p, /little timber cottage with a warm window/);
  assert.match(p, /warm muted storybook style/);
  assert.match(p, /pure-white background/);
  assert.match(p, /no text/i);
  // a variant-less job omits the trailing space cleanly
  const bare = spritePrompt({ file: 'flora', object: 'small shrub tuft', variant: '', targetHeight: 26 }, COSY_STYLE_CLAUSE);
  assert.match(bare, /single cosy small shrub tuft,/);
});

test('the two style clauses are visibly different (warm vs cool) so sheets read distinctly', () => {
  assert.notEqual(COSY_STYLE_CLAUSE, EVENING_STYLE_CLAUSE);
  assert.match(COSY_STYLE_CLAUSE, /warm/);
  assert.match(EVENING_STYLE_CLAUSE, /moonlit|cool/);
});

test('the full plan covers exactly the stub sheet key roster (the sprite-sheet contract)', () => {
  assert.deepEqual([...Object.keys(FULL_KEY_TO_FILE)].sort(), [...STUB_SHEET_KEYS].sort());
  // every keyed file is a real roster job
  const files = new Set(FULL_ROSTER.map((j) => j.file));
  for (const file of Object.values(FULL_KEY_TO_FILE)) {
    assert.ok(files.has(file), `key maps to unknown file ${file}`);
  }
  // 13 distinct images for the full sheet
  assert.equal(FULL_ROSTER.length, 13);
});

test('the hero subset is a subset of the full roster keys', () => {
  for (const k of Object.keys(HERO_KEY_TO_FILE)) {
    assert.ok(k in FULL_KEY_TO_FILE, `hero key ${k} not in full map`);
  }
});

test('buildManifest derives an undistorted display box (fixed height, aspect-derived width) with bottom-centre anchors', () => {
  // measure every full-roster file as a 200x100 image (aspect 2.0)
  const measured: MeasuredImage[] = FULL_ROSTER.map((j) => ({ file: j.file, pxWidth: 200, pxHeight: 100 }));
  const manifest = buildManifest(COSY_PLAN, measured);
  assert.equal(manifest.name, 'cosy');
  assert.equal(manifest.label, COSY_PLAN.label);
  // tree:healthy → tree-healthy, targetHeight 70, aspect 2.0 → w = 140
  const tree = manifest.sprites['tree:healthy'];
  assert.ok(tree);
  assert.equal(tree.h, 70);
  assert.equal(tree.w, 140);
  assert.equal(tree.anchorX, 0.5);
  assert.equal(tree.anchorY, 1);
  assert.equal(tree.href, '/art-sheets/cosy/tree-healthy.png');
  // autumn-tree fallback + status keys all present and pointing at the tree images
  assert.equal(manifest.sprites['autumn-tree']?.href, '/art-sheets/cosy/tree-healthy.png');
  assert.equal(manifest.sprites['flora:unhealthy']?.href, '/art-sheets/cosy/flora-dead.png');
  // every stub key is present
  assert.deepEqual([...Object.keys(manifest.sprites)].sort(), [...STUB_SHEET_KEYS].sort());
});

test('buildManifest throws when a keyed file was never measured (plan/run mismatch)', () => {
  assert.throws(() => buildManifest(EVENING_PLAN, [{ file: 'tree-healthy', pxWidth: 10, pxHeight: 10 }]), /unmeasured file/);
});
