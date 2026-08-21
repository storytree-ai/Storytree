// @vitest-environment jsdom
//
// The renderer's mermaid wiring (ADR-0095): a ```mermaid fence routes to the diagram component
// (an inline SVG, free of the <pre> code box), while every other fenced block renders exactly as
// before. The DIAGRAM ENGINE is substituted through the component's own `DiagramRenderer` seam
// (lib/diagram.ts) rather than by rewriting the `mermaid` module (anti-slop-adoption-arc inc-06,
// `no-module-mocking`): mermaid's real client-side render needs a browser layout engine and is
// proven by operator attestation in the studio, so what is under test here is the ROUTING — which
// fences reach the engine, carrying what source.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';

import { Markdown } from './Markdown';
import { DiagramRendererContext } from '../lib/diagram';
import { diagramDouble, failingDiagramDouble, type DiagramDouble } from '../test/diagramDouble';
import { WithAppData } from '../test/appData';
import type { AppData } from '../lib/appData';

let diagrams: DiagramDouble;

/** Mount the renderer under BOTH real seams — the doc index and the diagram engine. */
function renderMd(
  markdown: string,
  options: { baseDocId?: string; index?: Partial<AppData>; engine?: DiagramDouble } = {},
) {
  return render(
    <DiagramRendererContext.Provider value={options.engine ?? diagrams}>
      <WithAppData {...(options.index ?? {})}>
        <Markdown {...(options.baseDocId === undefined ? {} : { baseDocId: options.baseDocId })}>
          {markdown}
        </Markdown>
      </WithAppData>
    </DiagramRendererContext.Provider>,
  );
}

beforeEach(() => {
  diagrams = diagramDouble();
});
afterEach(() => {
  cleanup();
});

describe('Markdown — mermaid rendering', () => {
  it('renders a ```mermaid fence as an inline SVG, not a code listing', async () => {
    const { container } = renderMd('```mermaid\ngraph TD\n  A --> B\n```');

    await waitFor(() => expect(container.querySelector('[data-testid="mmd-svg"]')).toBeTruthy());
    // the diagram host received the SVG …
    expect(container.querySelector('.mermaid-diagram svg')).toBeTruthy();
    // … and it did NOT fall through to a <pre><code class="language-mermaid"> code box
    expect(container.querySelector('pre code.language-mermaid')).toBeNull();
    expect(diagrams.charts()).toEqual(['graph TD\n  A --> B']);
  });

  it('leaves a non-mermaid fenced block as a <pre><code> code listing (mermaid never runs)', () => {
    const { container } = renderMd('```js\nconsole.log(1)\n```');

    const code = container.querySelector('pre code');
    expect(code).toBeTruthy();
    expect(code?.className).toContain('language-js');
    expect(container.querySelector('.mermaid-diagram')).toBeNull();
    expect(diagrams.charts()).toEqual([]);
  });

  it('FAILS SOFT: a diagram the engine rejects shows its source instead of vanishing', async () => {
    // The catch branch in MermaidDiagram. Reaching it needed a rejecting mermaid module before;
    // now it is one substituted renderer, and the assertion is on the rendered fallback.
    const { container } = renderMd('```mermaid\nnot a diagram\n```', {
      engine: failingDiagramDouble('Parse error on line 1'),
    });

    await waitFor(() => expect(container.querySelector('.mermaid-error')).toBeTruthy());
    expect(container.querySelector('.mermaid-error code')?.textContent).toBe('not a diagram');
    expect(container.querySelector('.mermaid-error')?.getAttribute('title')).toContain(
      'Parse error on line 1',
    );
  });

  it('still renders ordinary prose around a diagram', async () => {
    const { container } = renderMd('Before.\n\n```mermaid\ngraph TD\n  A --> B\n```\n\nAfter.');
    await waitFor(() => expect(container.querySelector('.mermaid-diagram svg')).toBeTruthy());
    expect(screen.getByText('Before.')).toBeTruthy();
    expect(screen.getByText('After.')).toBeTruthy();
  });
});

// An in-corpus link resolves against the doc INDEX. When the index hasn't loaded, an unresolved
// link is not "a link the author pointed outside the corpus" — but it used to render identically
// to one, which is the silent half of a failed /api/docs.
describe('Markdown — in-corpus links against an unresolved doc index', () => {
  it('links normally when the index is resolved and holds the target', () => {
    const { container } = renderMd('See [0240](0240-map.md).', {
      baseDocId: 'decisions/0139-x.md',
      index: { docIds: new Set(['decisions/0240-map.md']) },
    });

    const link = screen.getByText('0240').closest('a');
    expect(link?.getAttribute('href')).toBe('#/doc/decisions%2F0240-map.md');
    expect(container.querySelector('.doc-unresolved')).toBeNull();
  });

  it('leaves an unresolved link unmarked when the index IS resolved — genuinely not in the corpus', () => {
    const { container } = renderMd('See [elsewhere](../outside/thing.md).');

    expect(screen.getByText('elsewhere').closest('a')).toBeTruthy();
    expect(container.querySelector('.doc-unresolved')).toBeNull();
  });

  it('marks an unresolved in-corpus link while the index is still loading', () => {
    const { container } = renderMd('See [that doc](other.md).', { index: { docsStatus: 'loading' } });

    const marked = container.querySelector('.doc-unresolved');
    expect(marked).toBeTruthy();
    expect(marked?.getAttribute('data-docs-status')).toBe('loading');
    expect(marked?.getAttribute('title')).toContain('the document index is still loading');
  });

  it('marks an unresolved in-corpus link when the index failed, and names the failure', () => {
    const { container } = renderMd('See [that doc](other.md).', {
      index: { docsStatus: 'error', docsError: 'HTTP 500' },
    });

    const marked = container.querySelector('.doc-unresolved');
    expect(marked?.getAttribute('data-docs-status')).toBe('error');
    expect(marked?.getAttribute('title')).toContain('the document index failed to load');
    expect(marked?.getAttribute('title')).toContain('HTTP 500');
  });

  it('never marks an external link or a page anchor — neither resolves against the index', () => {
    const { container } = renderMd('[out](https://example.com) and [here](#a-heading).', {
      index: { docsStatus: 'error' },
    });

    expect(container.querySelector('.doc-unresolved')).toBeNull();
    expect(screen.getByText('out').closest('a')?.getAttribute('target')).toBe('_blank');
    expect(screen.getByText('here').closest('a')?.getAttribute('href')).toBe('#a-heading');
  });
});
