// Stage-1 red-green for the CriticMarkup parser (ADR-0146 / ADR-0070). Pins the pure
// string → segments transform: each of the five forms parses to the right kind + text,
// plain text passes through, adjacent/nested forms split correctly, and a malformed /
// unclosed marker degrades to literal text rather than throwing. Single-literal titles.

import { describe, it, expect } from 'vitest';
import {
  parseCriticMarkup,
  hasCriticMarkup,
  acceptAllCriticMarkup,
} from './criticmarkup';

describe('parseCriticMarkup', () => {
  it('cm-plain-text-passes-through', () => {
    expect(parseCriticMarkup('just some **markdown**')).toEqual([
      { kind: 'text', text: 'just some **markdown**' },
    ]);
  });

  it('cm-parses-insert', () => {
    expect(parseCriticMarkup('a {++added++} b')).toEqual([
      { kind: 'text', text: 'a ' },
      { kind: 'insert', text: 'added' },
      { kind: 'text', text: ' b' },
    ]);
  });

  it('cm-parses-delete', () => {
    expect(parseCriticMarkup('a {--gone--} b')).toEqual([
      { kind: 'text', text: 'a ' },
      { kind: 'delete', text: 'gone' },
      { kind: 'text', text: ' b' },
    ]);
  });

  it('cm-parses-highlight', () => {
    expect(parseCriticMarkup('a {==note me==} b')).toEqual([
      { kind: 'text', text: 'a ' },
      { kind: 'highlight', text: 'note me' },
      { kind: 'text', text: ' b' },
    ]);
  });

  it('cm-parses-comment', () => {
    expect(parseCriticMarkup('a {>>a remark<<} b')).toEqual([
      { kind: 'text', text: 'a ' },
      { kind: 'comment', text: 'a remark' },
      { kind: 'text', text: ' b' },
    ]);
  });

  it('cm-parses-substitute', () => {
    expect(parseCriticMarkup('a {~~old~>new~~} b')).toEqual([
      { kind: 'text', text: 'a ' },
      { kind: 'substitute', oldText: 'old', newText: 'new' },
      { kind: 'text', text: ' b' },
    ]);
  });

  it('cm-trims-inner-whitespace', () => {
    expect(parseCriticMarkup('{++  padded  ++}')).toEqual([
      { kind: 'insert', text: 'padded' },
    ]);
  });

  it('cm-parses-adjacent-forms', () => {
    expect(parseCriticMarkup('{++in++}{--out--}')).toEqual([
      { kind: 'insert', text: 'in' },
      { kind: 'delete', text: 'out' },
    ]);
  });

  it('cm-substitute-without-arrow-is-new-only', () => {
    expect(parseCriticMarkup('{~~justnew~~}')).toEqual([
      { kind: 'substitute', oldText: '', newText: 'justnew' },
    ]);
  });

  it('cm-unclosed-insert-degrades-to-text', () => {
    const out = parseCriticMarkup('a {++never closed b');
    // Never throws; the stray '{' is preserved as literal text, the rest survives.
    expect(out.every((s) => s.kind === 'text')).toBe(true);
    expect(out.map((s) => (s.kind === 'text' ? s.text : '')).join('')).toBe('a {++never closed b');
  });

  it('cm-unclosed-substitute-degrades-to-text', () => {
    const out = parseCriticMarkup('x {~~old~>new y');
    expect(out.every((s) => s.kind === 'text')).toBe(true);
    expect(out.map((s) => (s.kind === 'text' ? s.text : '')).join('')).toBe('x {~~old~>new y');
  });

  it('cm-lone-brace-is-text', () => {
    expect(parseCriticMarkup('a { b } c')).toEqual([
      { kind: 'text', text: 'a { b } c' },
    ]);
  });

  it('cm-empty-string', () => {
    expect(parseCriticMarkup('')).toEqual([]);
  });
});

describe('hasCriticMarkup', () => {
  it('cm-detects-markup-present', () => {
    expect(hasCriticMarkup('a {++x++}')).toBe(true);
  });

  it('cm-detects-markup-absent', () => {
    expect(hasCriticMarkup('plain **md** only')).toBe(false);
  });
});

describe('acceptAllCriticMarkup', () => {
  it('cm-accept-keeps-insert-drops-delete', () => {
    expect(acceptAllCriticMarkup('keep {++this++} not {--that--}')).toBe(
      'keep this not ',
    );
  });

  it('cm-accept-substitute-takes-new', () => {
    expect(acceptAllCriticMarkup('{~~old~>new~~} tail')).toBe('new tail');
  });

  it('cm-accept-drops-comment-keeps-highlight-text', () => {
    expect(acceptAllCriticMarkup('a {>>hmm<<}{==kept==}')).toBe('a kept');
  });
});
