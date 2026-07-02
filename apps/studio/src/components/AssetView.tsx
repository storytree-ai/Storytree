import { useMemo, useRef } from 'react';
import { groupSources } from '@storytree/library/sources';
import { api } from '../api';
import { useAppData } from '../lib/appData';
import { formatDateTime } from '../lib/format';
import { useAnnotations } from '../lib/useAnnotations';
import { assetEditHref, assetHref, docHref, libraryHref, navigate } from '../lib/route';
import { ASSET_CATEGORY_GLOSS } from '../types';
import { Markdown } from './Markdown';
import { ReviewToggle } from './ReviewToggle';

export function AssetView({ id }: { id: string }): React.JSX.Element {
  const { assets, refreshAssets } = useAppData();
  const articleRef = useRef<HTMLElement>(null);
  const asset = assets.find((a) => a.id === id);
  const ann = useAnnotations(id, articleRef, asset?.body ?? '');
  // Memoized so React renders it once and never strips the highlight marks.
  const body = useMemo(() => <Markdown>{asset?.body ?? ''}</Markdown>, [asset?.body]);
  // "Sources": the unit's `references` grouped by the type of thing each points at, resolved live
  // against the loaded corpus (asset:<id> -> its category). A view, never stored.
  const sources = useMemo(
    () =>
      groupSources(asset?.references ?? [], (refId) => {
        const target = assets.find((a) => a.id === refId);
        return target ? { kind: target.category, title: target.title } : null;
      }),
    [asset?.references, assets],
  );

  if (!asset) {
    return (
      <div className="pad error-box">
        <h2>Artifact not found</h2>
        <p className="muted">
          No artifact with id <code>{id}</code>. <a href={libraryHref()}>Back to the Library</a>.
        </p>
      </div>
    );
  }

  async function remove(): Promise<void> {
    if (!window.confirm(`Delete artifact “${asset!.title}”?`)) return;
    await api.deleteAsset(id);
    await refreshAssets();
    navigate(libraryHref());
  }

  return (
    <ReviewToggle>
      {/* The right-hand CommentPanel is retired from this surface (owner call, cap 6):
          Review-mode affordances arrive IN the document flow at caps 7/8. */}
      <div className="doc-layout doc-layout-view">
        <article className="doc asset-detail" ref={articleRef} {...ann.articleHandlers}>
        <div className="doc-crumb muted small">
          <a href={libraryHref()}>library</a> / {asset.id}
        </div>
        <div className="asset-detail-head">
          <span className={`chip cat-${asset.category}`} title={ASSET_CATEGORY_GLOSS[asset.category]}>
            {asset.category}
          </span>
          <span className="muted small">{ASSET_CATEGORY_GLOSS[asset.category]}</span>
        </div>
        <h1>{asset.title}</h1>
        <p className="lede">{asset.description}</p>

        <div className="asset-body">{body}</div>

        {(sources.length > 0 || asset.provenance) && (
          <div className="asset-refs">
            <h4>Sources</h4>
            {sources.map((group) => (
              <div className="asset-refs-group" key={group.group}>
                <h5>{group.group}</h5>
                <ul>
                  {group.items.map((item) => (
                    <li key={item.ref}>
                      <RefLink refStr={item.ref} />
                    </li>
                  ))}
                </ul>
              </div>
            ))}
            {asset.provenance && (
              <div className="asset-provenance muted small">
                <Markdown>{asset.provenance}</Markdown>
              </div>
            )}
          </div>
        )}

        <div className="asset-foot muted small">
          <span>
            id: <code>{asset.id}</code>
          </span>
          <span>created {formatDateTime(asset.createdAt)}</span>
          <span>updated {formatDateTime(asset.updatedAt)}</span>
        </div>

        <div className="asset-actions">
          <a className="btn" href={assetEditHref(asset.id)}>
            Edit
          </a>
          <button type="button" className="btn ghost danger" onClick={() => void remove()}>
            Delete
          </button>
        </div>
        {ann.overlays}
        </article>
      </div>
    </ReviewToggle>
  );
}

function RefLink({ refStr }: { refStr: string }): React.JSX.Element {
  const { docIds, docTitles, assets } = useAppData();
  if (refStr.startsWith('doc:')) {
    const docId = refStr.slice('doc:'.length);
    return docIds.has(docId) ? (
      <a href={docHref(docId)}>{docTitles.get(docId) ?? docId}</a>
    ) : (
      <span className="muted">{refStr} (unknown doc)</span>
    );
  }
  if (refStr.startsWith('asset:')) {
    const assetId = refStr.slice('asset:'.length);
    const found = assets.find((a) => a.id === assetId);
    return found ? (
      <a href={assetHref(assetId)}>{found.title}</a>
    ) : (
      <span className="muted">{refStr} (unknown asset)</span>
    );
  }
  return <span>{refStr}</span>;
}
