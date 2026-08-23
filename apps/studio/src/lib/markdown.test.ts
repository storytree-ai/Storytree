// The mermaid routing decision is a pure function over the hast `<pre>` node react-markdown
// hands the renderer: a ```mermaid fence becomes a diagram, every other fence stays a code
// listing. Testing the decision here (no DOM, no mermaid runtime) is the red-green half of the
// proof; the SVG itself is operator-attested in the studio.

import { describe, it, expect } from 'vitest';
import { mermaidSource } from './markdown';

/** A hast `<pre><code class="language-<lang>">…</code></pre>` node, as react-markdown passes it. */
function preNode(lang: string | undefined, text: string) {
  return {
    tagName: 'pre',
    children: [
      {
        tagName: 'code',
        properties: lang ? { className: [`language-${lang}`] } : {},
        children: [{ type: 'text', value: text }],
      },
    ],
  };
}

describe('mermaidSource', () => {
  it('returns the source for a ```mermaid fenced block', () => {
    const chart = 'graph TD\n  A --> B';
    expect(mermaidSource(preNode('mermaid', `${chart}\n`))).toBe(chart);
  });

  it('returns null for a non-mermaid fenced block (it renders as code, unchanged)', () => {
    expect(mermaidSource(preNode('js', "console.log('hi')\n"))).toBeNull();
    expect(mermaidSource(preNode('ts', 'const x = 1\n'))).toBeNull();
  });

  it('returns null for a plain (language-less) fenced block', () => {
    expect(mermaidSource(preNode(undefined, '  A --> B  (ascii)\n'))).toBeNull();
  });

  it('accepts a space-separated className string, not only an array', () => {
    const node = {
      tagName: 'pre',
      children: [
        {
          tagName: 'code',
          properties: { className: 'language-mermaid hljs' },
          children: [{ type: 'text', value: 'sequenceDiagram\n' }],
        },
      ],
    };
    expect(mermaidSource(node)).toBe('sequenceDiagram');
  });

  it('concatenates multiple text children and trims only trailing newlines', () => {
    const node = {
      tagName: 'pre',
      children: [
        {
          tagName: 'code',
          properties: { className: ['language-mermaid'] },
          children: [
            { type: 'text', value: 'flowchart LR\n' },
            { type: 'text', value: '  A-->B\n\n' },
          ],
        },
      ],
    };
    expect(mermaidSource(node)).toBe('flowchart LR\n  A-->B');
  });

  it('is null-safe for malformed / non-pre input', () => {
    expect(mermaidSource(undefined)).toBeNull();
    expect(mermaidSource({})).toBeNull();
    expect(mermaidSource({ children: [] })).toBeNull();
    expect(mermaidSource({ children: [{ tagName: 'span' }] })).toBeNull();
  });
});
