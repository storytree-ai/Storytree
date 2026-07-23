// whole-sheet-plan.test.ts — the whole-sheet plan is offline-provable: the master roster + the crown
// recolour together produce EXACTLY the file set the studio manifest contract needs, and the one prompt
// enumerates every object in reading order on a white field.

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  WHOLE_SHEET_ROSTER,
  WHOLE_SHEET_STYLES,
  WHOLE_SHEET_COLS,
  wholeSheetStyle,
  wholeSheetPrompt,
} from './whole-sheet-plan.js';
import { FULL_KEY_TO_FILE } from './sprite-sheet-plan.js';
import { TREE_STATUS_PALETTE } from './crown-recolor.js';

test('the roster has exactly one base-tree and one withered comparison, all files unique', () => {
  const base = WHOLE_SHEET_ROSTER.filter((m) => m.role === 'base-tree');
  const comparison = WHOLE_SHEET_ROSTER.filter((m) => m.role === 'comparison');
  assert.equal(base.length, 1, 'exactly one base tree master');
  assert.equal(base[0]!.file, 'tree-healthy', 'the base tree is the healthy master');
  assert.equal(comparison.length, 1, 'exactly one withered comparison master');
  const files = WHOLE_SHEET_ROSTER.map((m) => m.file);
  assert.equal(new Set(files).size, files.length, 'roster files are unique');
});

test('roster objects + crown recolour cover EXACTLY the studio manifest file set', () => {
  // What the pipeline writes: every `object` slice, the base tree slice, and one recoloured tree per
  // status. The withered `comparison` master is intentionally NOT a manifest file.
  const produced = new Set<string>();
  for (const m of WHOLE_SHEET_ROSTER) {
    if (m.role === 'object') produced.add(m.file);
    if (m.role === 'base-tree') produced.add(m.file); // tree-healthy
  }
  for (const { status } of TREE_STATUS_PALETTE) produced.add(`tree-${status}`);

  const needed = new Set(Object.values(FULL_KEY_TO_FILE));
  // every file the manifest references is produced …
  for (const f of needed) assert.ok(produced.has(f), `manifest file "${f}" is produced by the pipeline`);
  // … and the pipeline produces nothing the manifest doesn't reference (no orphan sprites).
  for (const f of produced) assert.ok(needed.has(f), `produced file "${f}" is referenced by the manifest`);
});

test('the whole-sheet prompt enumerates every object in order on a pure-white field', () => {
  const prompt = wholeSheetPrompt(WHOLE_SHEET_ROSTER, 'TEST-STYLE-CLAUSE', WHOLE_SHEET_COLS);
  assert.match(prompt, /TEST-STYLE-CLAUSE/);
  assert.match(prompt, /pure-white background/);
  assert.match(prompt, /No scene/);
  // reading-order numbering 1..N, and the first + last subjects present
  assert.match(prompt, /1\. /);
  assert.match(prompt, new RegExp(`${WHOLE_SHEET_ROSTER.length}\\. `));
  assert.ok(prompt.includes(WHOLE_SHEET_ROSTER[0]!.subject), 'first subject is in the prompt');
  assert.ok(
    prompt.includes(WHOLE_SHEET_ROSTER[WHOLE_SHEET_ROSTER.length - 1]!.subject),
    'last subject is in the prompt',
  );
});

test('there are four distinct named styles including the storybook anchor', () => {
  assert.equal(WHOLE_SHEET_STYLES.length, 4);
  const names = WHOLE_SHEET_STYLES.map((s) => s.name);
  assert.equal(new Set(names).size, 4, 'style names are unique');
  assert.ok(names.includes('storybook'), 'the cosy rebuild anchor is present');
  assert.equal(wholeSheetStyle('storybook')?.label, 'Storybook — warm (cosy rebuilt)');
  assert.equal(wholeSheetStyle('nope'), undefined);
  for (const s of WHOLE_SHEET_STYLES) assert.ok(s.styleClause.length > 20, `${s.name} has a real style clause`);
});
