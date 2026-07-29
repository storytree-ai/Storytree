// @vitest-environment jsdom
//
// The renderer's mermaid wiring (ADR-0095): a ```mermaid fence routes to the diagram component
// (an inline SVG, free of the <pre> code box), while every other fenced block renders exactly as
// before. mermaid itself is mocked — its real client-side render needs a browser layout engine
// and is proven by operator attestation in the studio; here we prove the ROUTING is correct.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';

const appData = vi.hoisted(() => ({
  docIds: new Set<string>(),
  docsStatus: 'ready' as 'loading' | 'ready' | 'error',
  docsError: '',
}));
vi.mock('../lib/appData', () => ({ useAppData: () => appData }));

const mermaidMock = vi.hoisted(() => ({
  initialize: vi.fn(),
  render: vi.fn(async (_id: string, chart: string) => ({ svg: `<svg data-testid="mmd-svg">${chart}</svg>` })),
}));
vi.mock('mermaid', () => ({ default: mermaidMock }));

import { Markdown } from './Markdown';

beforeEach(() => {
  mermaidMock.initialize.mockClear();
  mermaidMock.render.mockClear();
});
afterEach(() => {
  cleanup();
  appData.docIds = new Set<string>();
  appData.docsStatus = 'ready';
  appData.docsError = '';
});

describe('Markdown — mermaid rendering', () => {
  it('renders a ```mermaid fence as an inline SVG, not a code listing', async () => {
    const { container } = render(<Markdown>{'```mermaid\ngraph TD\n  A --> B\n```'}</Markdown>);

    await waitFor(() => expect(container.querySelector('[data-testid="mmd-svg"]')).toBeTruthy());
    // the diagram host received the SVG …
    expect(container.querySelector('.mermaid-diagram svg')).toBeTruthy();
    // … and it did NOT fall through to a <pre><code class="language-mermaid"> code box
    expect(container.querySelector('pre code.language-mermaid')).toBeNull();
    expect(mermaidMock.render).toHaveBeenCalledTimes(1);
    expect(mermaidMock.render.mock.calls[0]?.[1]).toBe('graph TD\n  A --> B');
  });

  it('leaves a non-mermaid fenced block as a <pre><code> code listing (mermaid never runs)', () => {
    const { container } = render(<Markdown>{'```js\nconsole.log(1)\n```'}</Markdown>);

    const code = container.querySelector('pre code');
    expect(code).toBeTruthy();
    expect(code?.className).toContain('language-js');
    expect(container.querySelector('.mermaid-diagram')).toBeNull();
    expect(mermaidMock.render).not.toHaveBeenCalled();
  });

  it('still renders ordinary prose around a diagram', async () => {
    const { container } = render(
      <Markdown>{'Before.\n\n```mermaid\ngraph TD\n  A --> B\n```\n\nAfter.'}</Markdown>,
    );
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
    appData.docIds = new Set(['decisions/0240-map.md']);
    const { container } = render(
      <Markdown baseDocId="decisions/0139-x.md">{'See [0240](0240-map.md).'}</Markdown>,
    );

    const link = screen.getByText('0240').closest('a');
    expect(link?.getAttribute('href')).toBe('#/doc/decisions%2F0240-map.md');
    expect(container.querySelector('.doc-unresolved')).toBeNull();
  });

  it('leaves an unresolved link unmarked when the index IS resolved — genuinely not in the corpus', () => {
    const { container } = render(<Markdown>{'See [elsewhere](../outside/thing.md).'}</Markdown>);

    expect(screen.getByText('elsewhere').closest('a')).toBeTruthy();
    expect(container.querySelector('.doc-unresolved')).toBeNull();
  });

  it('marks an unresolved in-corpus link while the index is still loading', () => {
    appData.docsStatus = 'loading';
    const { container } = render(<Markdown>{'See [that doc](other.md).'}</Markdown>);

    const marked = container.querySelector('.doc-unresolved');
    expect(marked).toBeTruthy();
    expect(marked?.getAttribute('data-docs-status')).toBe('loading');
    expect(marked?.getAttribute('title')).toContain('the document index is still loading');
  });

  it('marks an unresolved in-corpus link when the index failed, and names the failure', () => {
    appData.docsStatus = 'error';
    appData.docsError = 'HTTP 500';
    const { container } = render(<Markdown>{'See [that doc](other.md).'}</Markdown>);

    const marked = container.querySelector('.doc-unresolved');
    expect(marked?.getAttribute('data-docs-status')).toBe('error');
    expect(marked?.getAttribute('title')).toContain('the document index failed to load');
    expect(marked?.getAttribute('title')).toContain('HTTP 500');
  });

  it('never marks an external link or a page anchor — neither resolves against the index', () => {
    appData.docsStatus = 'error';
    const { container } = render(
      <Markdown>{'[out](https://example.com) and [here](#a-heading).'}</Markdown>,
    );

    expect(container.querySelector('.doc-unresolved')).toBeNull();
    expect(screen.getByText('out').closest('a')?.getAttribute('target')).toBe('_blank');
    expect(screen.getByText('here').closest('a')?.getAttribute('href')).toBe('#a-heading');
  });
});
