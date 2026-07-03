import { useEffect, useMemo, useState } from 'react';
import { api } from '../api';
import { useAppData } from '../lib/appData';
import type { DocContent } from '../types';
import { Markdown } from './Markdown';
import { ReviewToggle } from './ReviewToggle';

export function DocView({ id }: { id: string }): React.JSX.Element {
  const { docTitles } = useAppData();
  const [content, setContent] = useState<DocContent | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    setStatus('loading');
    setContent(null);
    void (async () => {
      try {
        const c = await api.docContent(id);
        if (!active) return;
        setContent(c);
        setStatus('ready');
      } catch (err) {
        if (!active) return;
        setError(err instanceof Error ? err.message : String(err));
        setStatus('error');
      }
    })();
    return () => {
      active = false;
    };
  }, [id]);

  // Memoized so React renders it once per doc.
  const markdown = useMemo(
    () => (content ? <Markdown baseDocId={id}>{content.markdown}</Markdown> : null),
    [id, content],
  );

  if (status === 'loading') return <p className="muted pad">Loading {docTitles.get(id) ?? id}…</p>;
  if (status === 'error' || !content) {
    return (
      <div className="pad error-box">
        <h2>Couldn’t load this document</h2>
        <p className="muted">{error}</p>
      </div>
    );
  }

  return (
    <ReviewToggle>
      {/* Review-mode affordances arrive IN the document flow (ADR-0146 editor). The old
          text-selection commenting layer is removed — a clean swap to block placement (cap 9). */}
      <div className="doc-layout doc-layout-view">
        <div className="doc-main">
          <article className="doc">
            <div className="doc-crumb muted small">docs / {id}</div>
            {markdown}
          </article>
        </div>
      </div>
    </ReviewToggle>
  );
}
