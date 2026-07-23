// contact-sheet.test.ts — the review page is pure string building, so it is offline-provable: it names
// every slice, shows the status hexes, calls out a blob/roster COUNT MISMATCH, renders the unhealthy
// comparison only when both forms are supplied, escapes text, and wraps into a standalone document.

import test from 'node:test';
import assert from 'node:assert/strict';
import { renderContactSheet, wrapContactSheetDoc, type ContactSheetInput } from './contact-sheet.js';

const DATA = 'data:image/png;base64,AAAA';

function baseInput(overrides: Partial<ContactSheetInput> = {}): ContactSheetInput {
  return {
    styleName: 'storybook',
    styleLabel: 'Storybook — warm',
    rawDataUri: DATA,
    blobCount: 10,
    rosterCount: 10,
    slices: [
      { name: 'tree-healthy', role: 'base-tree', dataUri: DATA, w: 60, h: 70 },
      { name: 'cottage', role: 'object', dataUri: DATA, w: 48, h: 52 },
    ],
    statusTrees: [
      { status: 'healthy', hex: '#5aa46e', dataUri: DATA },
      { status: 'unhealthy', hex: '#b05a48', dataUri: DATA },
    ],
    ...overrides,
  };
}

test('renderContactSheet names the style, every slice, and the status hexes', () => {
  const html = renderContactSheet(baseInput());
  assert.match(html, /Storybook — warm/);
  assert.match(html, /tree-healthy/);
  assert.match(html, /cottage/);
  assert.match(html, /#5aa46e/);
  assert.match(html, /#b05a48/);
  // slices are numbered
  assert.match(html, /cs-num">1</);
  assert.match(html, /cs-num">2</);
});

test('a blob/roster count match reads OK; a mismatch is called out loudly', () => {
  assert.match(renderContactSheet(baseInput({ blobCount: 10, rosterCount: 10 })), /cs-ok/);
  const bad = renderContactSheet(baseInput({ blobCount: 8, rosterCount: 10 }));
  assert.match(bad, /cs-warn/);
  assert.match(bad, /8 blobs detected but 10 roster objects expected/);
});

test('the unhealthy comparison renders only when both forms are supplied', () => {
  assert.doesNotMatch(renderContactSheet(baseInput()), /red crown, or withered form/);
  const withCompare = renderContactSheet(
    baseInput({ witheredDataUri: DATA, unhealthyRecolorDataUri: DATA }),
  );
  assert.match(withCompare, /red crown, or withered form/);
  assert.match(withCompare, /withered form/);
});

test('text is HTML-escaped', () => {
  const html = renderContactSheet(baseInput({ styleLabel: 'A <script> & "b"' }));
  assert.match(html, /A &lt;script&gt; &amp; &quot;b&quot;/);
  assert.doesNotMatch(html, /<script>/);
});

test('wrapContactSheetDoc produces a standalone document with the title', () => {
  const doc = wrapContactSheetDoc('<div>hi</div>', 'My Title');
  assert.match(doc, /^<!doctype html>/);
  assert.match(doc, /<title>My Title<\/title>/);
  assert.match(doc, /<div>hi<\/div>/);
});
