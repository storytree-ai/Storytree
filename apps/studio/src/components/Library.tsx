import { useMemo, useState } from 'react';
import { useAppData, openCount } from '../lib/appData';
import { assetHref, assetNewHref, docHref, libraryHref } from '../lib/route';
import {
  ASSET_CATEGORIES,
  ASSET_CATEGORY_GLOSS,
  type AssetCategory,
  type LibraryItem,
} from '../types';

export function Library({ category }: { category: AssetCategory | null }): React.JSX.Element {
  const { docs, assets, comments } = useAppData();
  const [query, setQuery] = useState('');

  // The unified Library list: editable artifacts (kind 'artifact') plus the ADRs
  // as read-only, doc-backed items (group "Decisions" → kind 'doc', category 'adr').
  // ADRs stay canonical markdown under docs/decisions and open in DocView.
  const items = useMemo<LibraryItem[]>(() => {
    const artifactItems: LibraryItem[] = assets.map((a) => ({
      kind: 'artifact',
      id: a.id,
      category: a.category,
      title: a.title,
      description: a.description,
    }));
    const adrDocItems: LibraryItem[] = docs
      .filter((d) => d.group === 'Decisions')
      .map((d) => ({
        kind: 'doc',
        id: d.id,
        category: 'adr',
        title: d.title,
        description: d.excerpt,
      }));
    return [...artifactItems, ...adrDocItems];
  }, [assets, docs]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((it) => {
      if (category && it.category !== category) return false;
      if (q) {
        const hay = `${it.id} ${it.title} ${it.description}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [items, category, query]);

  return (
    <div className="library pad">
      <div className="library-head">
        <div>
          <h1>Library</h1>
          <p className="muted">
            Modular, injectable artifacts — definitions, principles, patterns, guardrails, templates,
            the techstack, ADRs, and open questions — all first-class, authorable categories. The
            canonical ADR docs under <code>docs/decisions/</code> also fold in read-only. The durable
            guidance synthesised from the record; the seed of an injectable guidance library
            (open-questions §9).
          </p>
        </div>
        <a className="btn primary" href={assetNewHref}>
          + New artifact
        </a>
      </div>

      <div className="filters">
        <div className="filter-cats">
          <a className={category === null ? 'chip-btn active' : 'chip-btn'} href={libraryHref()}>
            all ({items.length})
          </a>
          {ASSET_CATEGORIES.map((cat) => {
            const n = items.filter((it) => it.category === cat).length;
            if (n === 0) return null;
            return (
              <a
                key={cat}
                className={category === cat ? `chip-btn cat-${cat} active` : `chip-btn cat-${cat}`}
                href={libraryHref(cat)}
                title={ASSET_CATEGORY_GLOSS[cat]}
              >
                {cat} ({n})
              </a>
            );
          })}
        </div>
        <input
          className="search"
          placeholder="Search the library…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      {category && (
        <p className="muted small cat-gloss">
          <span className={`cat-dot cat-${category}`} /> {category} — {ASSET_CATEGORY_GLOSS[category]}
        </p>
      )}

      {filtered.length === 0 ? (
        <p className="muted pad-sm">No items match.</p>
      ) : (
        <ul className="asset-grid">
          {filtered.map((it) => {
            const open = openCount(comments, it.id);
            const href = it.kind === 'doc' ? docHref(it.id) : assetHref(it.id);
            return (
              <li key={`${it.kind}:${it.id}`}>
                <a className="asset-card" href={href}>
                  <div className="asset-card-top">
                    <span className={`chip cat-${it.category}`}>{it.category}</span>
                    {open > 0 && (
                      <span className="badge" title={`${open} open comment(s)`}>
                        {open}
                      </span>
                    )}
                  </div>
                  <h3>{it.title}</h3>
                  <p className="asset-desc">{it.description}</p>
                </a>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
