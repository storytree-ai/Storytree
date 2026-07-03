// The block model's determinism + splice honesty (ADR-0140). Pure functions — no DOM, no api.

import { describe, it, expect } from 'vitest';
import { splitBlocks, applySuggestionToBody } from './blocks';

const DOC = [
  '# Title',
  '',
  'First paragraph, two',
  'lines long.',
  '',
  '```ts',
  'const x = 1;',
  '',
  'const y = 2;',
  '```',
  '',
  'Closing paragraph.',
].join('\n');

describe('splitBlocks', () => {
  it('splits blank-line separated top-level blocks, keeping a fenced block whole', () => {
    const blocks = splitBlocks(DOC);
    expect(blocks.map((b) => b.text)).toEqual([
      '# Title',
      'First paragraph, two\nlines long.',
      '```ts\nconst x = 1;\n\nconst y = 2;\n```',
      'Closing paragraph.',
    ]);
  });

  it('is deterministic and offset-faithful (id stable across calls; [start,end) reproduces text)', () => {
    const a = splitBlocks(DOC);
    const b = splitBlocks(DOC);
    expect(a.map((x) => x.id)).toEqual(b.map((x) => x.id));
    for (const block of a) expect(DOC.slice(block.start, block.end)).toBe(block.text);
  });

  it('keeps a moved block’s handle and disambiguates identical blocks by occurrence', () => {
    const before = splitBlocks('Alpha.\n\nBeta.\n\nAlpha.');
    const after = splitBlocks('Beta.\n\nAlpha.\n\nAlpha.');
    // The unique block's handle survives the move.
    const beta = before.find((b) => b.text === 'Beta.');
    expect(after.find((b) => b.text === 'Beta.')?.id).toBe(beta?.id);
    // Identical blocks get distinct, occurrence-ordered ids.
    const dupes = before.filter((b) => b.text === 'Alpha.');
    expect(dupes).toHaveLength(2);
    expect(new Set(dupes.map((b) => b.id)).size).toBe(2);
  });
});

describe('applySuggestionToBody', () => {
  it('splices the proposed text over the matched block', () => {
    const blocks = splitBlocks(DOC);
    const target = blocks[1]!;
    const res = applySuggestionToBody(DOC, {
      blockId: target.id,
      original: target.text,
      proposed: 'A crisper paragraph.',
    });
    expect(res).toEqual({ ok: true, body: DOC.replace(target.text, 'A crisper paragraph.') });
  });

  it('refuses an unknown block handle (block-not-found) — an edited block is honest drift', () => {
    const res = applySuggestionToBody(DOC, {
      blockId: 'b-deadbeef',
      original: 'whatever',
      proposed: 'x',
    });
    expect(res).toEqual({ ok: false, reason: 'block-not-found' });
  });

  it('refuses when the recorded original no longer matches the block (original-drifted)', () => {
    const target = splitBlocks(DOC)[3]!;
    const res = applySuggestionToBody(DOC, {
      blockId: target.id,
      original: 'Some other remembered text.',
      proposed: 'x',
    });
    expect(res).toEqual({ ok: false, reason: 'original-drifted' });
  });
});
