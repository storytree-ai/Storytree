import { isValidElement, useEffect, useRef, useState, type ReactNode } from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import mermaid from 'mermaid';
import { useAppData } from '../lib/appData';
import { docHref } from '../lib/route';
import { mermaidSource, resolveDocHref, slugify } from '../lib/markdown';

interface MarkdownProps {
  children: string;
  /** Current doc id, so relative in-corpus links resolve. */
  baseDocId?: string;
}

// Mermaid runs author-supplied diagram source, so initialize it once, lazily, on the client:
// `securityLevel: 'strict'` keeps it from emitting raw HTML or click handlers out of a diagram
// (corpus authors are trusted — operators / agents-under-review — so this is defence in depth,
// not the only fence). The version is pinned in package.json and rendered fully client-side (no
// server, no network). See ADR-0096.
let mermaidReady = false;
function ensureMermaid(): void {
  if (mermaidReady) return;
  mermaid.initialize({ startOnLoad: false, securityLevel: 'strict', theme: 'neutral' });
  mermaidReady = true;
}

// A fresh id per render() call so React 19 StrictMode's double-invoked effect can't collide two
// in-flight renders on the same DOM id.
let mermaidSeq = 0;

/** Render one ```mermaid block to an inline SVG; on a parse error fall back to the source text. */
function MermaidDiagram({ chart }: { chart: string }): React.JSX.Element {
  const hostRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    ensureMermaid();
    const id = `mermaid-${(mermaidSeq += 1)}`;
    mermaid
      .render(id, chart)
      .then(({ svg }) => {
        if (cancelled) return;
        if (hostRef.current) hostRef.current.innerHTML = svg;
        setError(null);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancelled = true;
    };
  }, [chart]);

  // Fail soft: a broken diagram shows its source (as a normal code block would) so the author
  // can see and fix it, rather than vanishing or throwing.
  if (error) {
    return (
      <pre className="mermaid-error" title={`diagram failed to render: ${error}`}>
        <code>{chart}</code>
      </pre>
    );
  }
  return <div className="mermaid-diagram" ref={hostRef} role="img" aria-label="Diagram" />;
}

function nodeToText(node: ReactNode): string {
  if (node == null || node === false || node === true) return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(nodeToText).join('');
  if (isValidElement(node)) {
    return nodeToText((node.props as { children?: ReactNode }).children);
  }
  return '';
}

/**
 * Renders markdown. Headings get stable slug ids (so in-corpus `#slug` links resolve).
 */
export function Markdown({ children, baseDocId = '' }: MarkdownProps): React.JSX.Element {
  const { docIds } = useAppData();

  function heading(level: 1 | 2 | 3 | 4) {
    return function Heading({ children: kids }: { children?: ReactNode }): React.JSX.Element {
      const text = nodeToText(kids);
      const slug = slugify(text);
      const Tag = `h${level}` as 'h1' | 'h2' | 'h3' | 'h4';
      return (
        <Tag id={slug} className="md-heading">
          <a className="md-anchor" href={`#${slug}`} aria-hidden="true" tabIndex={-1}>
            #
          </a>
          <span className="md-heading-text">{kids}</span>
        </Tag>
      );
    };
  }

  const components: Components = {
    h1: heading(1),
    h2: heading(2),
    h3: heading(3),
    h4: heading(4),
    pre({ node, children }) {
      // A ```mermaid fence becomes a diagram (rendered free of the <pre> code-box); every other
      // fenced block renders exactly as before.
      const chart = mermaidSource(node);
      if (chart) return <MermaidDiagram chart={chart} />;
      return <pre>{children}</pre>;
    },
    a({ href, children: kids }) {
      if (!href) return <a>{kids}</a>;
      const target = resolveDocHref(href, baseDocId, docIds);
      if (target) return <a href={docHref(target)}>{kids}</a>;
      if (/^[a-z]+:\/\//i.test(href)) {
        return (
          <a href={href} target="_blank" rel="noreferrer noopener">
            {kids}
          </a>
        );
      }
      return <a href={href}>{kids}</a>;
    },
  };

  return (
    <div className="markdown">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {children}
      </ReactMarkdown>
    </div>
  );
}
