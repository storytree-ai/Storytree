import { useMemo } from 'react';
import { NODE_REF_PREFIX } from '@storytree/library';
import { groupSources } from '@storytree/library/sources';
import { api } from '../api';
import { useAppData } from '../lib/appData';
import { formatDateTime } from '../lib/format';
import { kindLabel, useArcDisplay } from '../lib/kindDisplay';
import { assetEditHref, assetHref, docHref, libraryHref, navigate, treeFocusHref } from '../lib/route';
import { ASSET_CATEGORY_GLOSS } from '../types';
import { Markdown } from './Markdown';
import { ReviewEditor } from './ReviewEditor';
import { ReviewToggle } from './ReviewToggle';

export function AssetView({ id }: { id: string }): React.JSX.Element {
  const { assets, assetsStatus, assetsError, refreshAssets } = useAppData();
  const arcDisplay = useArcDisplay(); // the `arc` kind chip shows "epic" by default (ADR-0183 D1)
  const asset = assets.find((a) => a.id === id);
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
    // map-boot-independence: a Library route mounts before `/api/assets` resolves — while it's
    // still pending, the initial empty `assets` array must never be presented as the honest
    // "doesn't exist" answer, and a genuine fetch failure must be distinguishable from both.
    if (assetsStatus === 'loading') {
      return <p className="muted pad">Loading the Library corpus…</p>;
    }
    if (assetsStatus === 'error') {
      return (
        <div className="pad error-box">
          <h2>Trouble reaching the Library corpus</h2>
          <p className="muted">Couldn’t load the Library corpus — {assetsError}</p>
        </div>
      );
    }
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
      {/* Review-mode affordances arrive IN the document flow (ADR-0146 editor). The old
          text-selection commenting layer is removed — a clean swap to block placement (cap 9). */}
      <div className="doc-layout doc-layout-view">
        <article className="doc asset-detail">
        <div className="doc-crumb muted small">
          <a href={libraryHref()}>library</a> / {asset.id}
        </div>
        <div className="asset-detail-head">
          <span className={`chip cat-${asset.category}`} title={ASSET_CATEGORY_GLOSS[asset.category]}>
            {kindLabel(asset.category, arcDisplay)}
          </span>
          <span className="muted small">{ASSET_CATEGORY_GLOSS[asset.category]}</span>
        </div>
        <h1>{asset.title}</h1>
        <p className="lede">{asset.description}</p>

        {/* Review-mode surface (ADR-0146): View shows clean rendered prose; Edit is a
            split-pane markdown editor with a CriticMarkup toolbar + live preview. Replaces
            the ReviewBlocks click-to-edit surface. */}
        <div className="asset-body">
          <ReviewEditor asset={asset} />
        </div>

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
        </article>
      </div>
    </ReviewToggle>
  );
}

/**
 * One "Sources" citation, rendered as a link into whatever it points at. Exported for direct
 * testing: the three reference tokens (`doc:` / `asset:` / ADR-0107 D2's `node:`) each resolve to a
 * different surface, and only `node:` leaves the Library for the map.
 */
export function RefLink({ refStr }: { refStr: string }): React.JSX.Element {
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
  // ADR-0107 D2's `node:<id>` — the proving-process anchor. It points at the work tree, not the
  // Library, so it deep-links to that node on the map (the gap ADR-0107's own Consequences named).
  if (refStr.startsWith(NODE_REF_PREFIX)) {
    const nodeId = refStr.slice(NODE_REF_PREFIX.length);
    return <a href={treeFocusHref(nodeId)}>{nodeId}</a>;
  }
  return <span>{refStr}</span>;
}
