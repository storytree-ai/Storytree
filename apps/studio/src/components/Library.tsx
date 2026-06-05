import { useMemo, useState } from 'react';
import { useAppData, openCount } from '../lib/appData';
import { assetHref, assetNewHref, libraryHref } from '../lib/route';
import {
  ASSET_CATEGORIES,
  ASSET_CATEGORY_GLOSS,
  type AssetCategory,
} from '../types';

export function Library({ category }: { category: AssetCategory | null }): React.JSX.Element {
  const { assets, comments } = useAppData();
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return assets.filter((a) => {
      if (category && a.category !== category) return false;
      if (q) {
        const hay = `${a.id} ${a.title} ${a.description} ${a.body}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [assets, category, query]);

  return (
    <div className="library pad">
      <div className="library-head">
        <div>
          <h1>Library</h1>
          <p className="muted">
            Modular, injectable artifacts — definitions, principles, patterns, guardrails, and the
            techstack (the durable guidance synthesised from the ADRs). The seed of an injectable
            guidance library (open-questions §9).
          </p>
        </div>
        <a className="btn primary" href={assetNewHref}>
          + New artifact
        </a>
      </div>

      <div className="filters">
        <div className="filter-cats">
          <a className={category === null ? 'chip-btn active' : 'chip-btn'} href={libraryHref()}>
            all ({assets.length})
          </a>
          {ASSET_CATEGORIES.map((cat) => {
            const n = assets.filter((a) => a.category === cat).length;
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
        <p className="muted pad-sm">No artifacts match.</p>
      ) : (
        <ul className="asset-grid">
          {filtered.map((a) => {
            const open = openCount(comments, a.id);
            return (
              <li key={a.id}>
                <a className="asset-card" href={assetHref(a.id)}>
                  <div className="asset-card-top">
                    <span className={`chip cat-${a.category}`}>{a.category}</span>
                    {open > 0 && (
                      <span className="badge" title={`${open} open comment(s)`}>
                        {open}
                      </span>
                    )}
                  </div>
                  <h3>{a.title}</h3>
                  <p className="asset-desc">{a.description}</p>
                </a>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
