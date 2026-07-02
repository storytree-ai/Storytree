import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../api';
import { useAppData } from '../lib/appData';
import { useOperator } from '../lib/operator';
import { parseHeadings } from '../lib/markdown';
import { sectionAnchor, topicAnchor } from '../lib/annotate';
import { useAnnotations } from '../lib/useAnnotations';
import type { DocContent } from '../types';
import { Markdown, type CommentTarget } from './Markdown';
import { CommentPanel } from './CommentPanel';
import { ReviewLayout, ReviewToggle } from './ReviewToggle';

export function DocView({ id }: { id: string }): React.JSX.Element {
  const { docTitles } = useAppData();
  const [operator] = useOperator();
  const [content, setContent] = useState<DocContent | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState('');
  const articleRef = useRef<HTMLElement>(null);
  const ann = useAnnotations(id, articleRef, content?.markdown ?? '');
  const setTarget = ann.setTarget;

  useEffect(() => {
    let active = true;
    setStatus('loading');
    setContent(null);
    setTarget(topicAnchor());
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
  }, [id, setTarget]);

  const headings = useMemo(() => (content ? parseHeadings(content.markdown) : []), [content]);
  const onHeading = useCallback(
    (t: CommentTarget) => setTarget(sectionAnchor(t.slug, t.text)),
    [setTarget],
  );
  // Memoized so React renders it once per doc and never reconciles it away
  // (which would strip the highlight marks the annotation layer injects).
  const markdown = useMemo(
    () =>
      content ? (
        <Markdown baseDocId={id} onCommentHeading={onHeading}>
          {content.markdown}
        </Markdown>
      ) : null,
    [id, content, onHeading],
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
      <ReviewLayout
        panel={
          <CommentPanel
            topicKind="doc"
            topicId={id}
            headings={headings}
            operator={operator}
            target={ann.target}
            setTarget={setTarget}
            focusId={ann.focusId}
            onJump={ann.jumpToAnchor}
          />
        }
      >
        <div className="doc-main">
          <article className="doc" ref={articleRef} {...ann.articleHandlers}>
            <div className="doc-crumb muted small">docs / {id}</div>
            {markdown}
            {ann.overlays}
          </article>
        </div>
      </ReviewLayout>
    </ReviewToggle>
  );
}
