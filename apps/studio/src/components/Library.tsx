import { useMemo, useState } from 'react';
import { useAppData, openCount } from '../lib/appData';
import { kindLabel, typeLabel, setArcDisplay, useArcDisplay } from '../lib/kindDisplay';
import { assetHref, assetNewHref, docHref, libraryHref } from '../lib/route';
import {
  ASSET_CATEGORIES,
  ASSET_CATEGORY_GLOSS,
  type AssetCategory,
  type LibraryItem,
} from '../types';

/** Human label for each artifact type, shown on the landing's definition cards. `arc` renders
 *  as "Epics" by default via typeLabel/kindDisplay (ADR-0183 D1 — the key stays `arc`). */
const TYPE_LABEL: Record<AssetCategory, string> = {
  definition: 'Definitions',
  principle: 'Principles',
  pattern: 'Patterns',
  guardrail: 'Guardrails',
  techstack: 'Tech stack',
  process: 'Processes',
  agent: 'Agents',
  proposal: 'Proposals',
  template: 'Templates',
  adr: 'Decision records',
  'open-question': 'Open questions',
  friction: 'Friction',
  arc: 'Arcs',
  plan: 'Plans',
};

export function Library({ category }: { category: AssetCategory | null }): React.JSX.Element {
  const { docs, assets, comments } = useAppData();
  const [query, setQuery] = useState('');
  // ADR-0183 D1: `arc` displays as "Epic" by default, flippable to "Arc" — display text only,
  // never the key (routes/hrefs below keep the canonical `arc`).
  const arcDisplay = useArcDisplay();
  const heading = (cat: AssetCategory): string => typeLabel(cat, arcDisplay, TYPE_LABEL[cat]);
  const chip = (cat: AssetCategory): string => kindLabel(cat, arcDisplay);

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
        ...(d.status ? { status: d.status } : {}),
      }));
    return [...artifactItems, ...adrDocItems];
  }, [assets, docs]);

  const countFor = (cat: AssetCategory): number => items.filter((it) => it.category === cat).length;

  // Artifacts in the selected category, filtered by the search box. Computed
  // unconditionally (before the landing early-return) to keep hook order stable;
  // it's unused on the landing where `category` is null.
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((it) => {
      if (category === null || it.category !== category) return false;
      if (q) {
        const hay = `${it.id} ${it.title} ${it.description}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [items, category, query]);

  // Landing (no category): explain what the Library is and offer one definition
  // card per artifact type. No flat "all" wall — you pick a type to browse.
  if (category === null) {
    return (
      <div className="library pad">
        <div className="library-head">
          <div>
            <h1>Library</h1>
            <p>
              The project’s <strong>injectable guidance</strong> — modular, typed artifacts an agent
              pulls into context on demand. Each unit is one of the types below, synthesised from the
              record (every artifact cites the ADR it came from). Pick a type to browse.
            </p>
          </div>
          <a className="btn primary" href={assetNewHref}>
            + New artifact
          </a>
        </div>

        <ul className="asset-grid">
          {ASSET_CATEGORIES.map((cat) => {
            const n = countFor(cat);
            if (n === 0) return null;
            return (
              <li key={cat}>
                <a className="asset-card type-card" href={libraryHref(cat)}>
                  <div className="asset-card-top">
                    <span className={`chip cat-${cat}`}>{chip(cat)}</span>
                    <span className="badge ghost">{n}</span>
                  </div>
                  <h3>{heading(cat)}</h3>
                  <p className="asset-desc">{ASSET_CATEGORY_GLOSS[cat]}</p>
                </a>
              </li>
            );
          })}
        </ul>
      </div>
    );
  }

  return (
    <div className="library pad">
      <div className="library-head">
        <div>
          <h1>
            <a className="crumb-link" href={libraryHref()}>
              Library
            </a>
            <span className="crumb-sep"> / {heading(category)}</span>
          </h1>
          <p className="muted small cat-gloss">
            <span className={`cat-dot cat-${category}`} /> {chip(category)} —{' '}
            {ASSET_CATEGORY_GLOSS[category]}
          </p>
        </div>
        <div className="library-head-actions">
          {category === 'arc' && (
            <button
              className="btn"
              onClick={() => setArcDisplay(arcDisplay === 'epic' ? 'arc' : 'epic')}
              title='Display preference only — the kind key stays "arc" everywhere (ADR-0183 D1)'
            >
              Display: {arcDisplay === 'epic' ? 'Epic' : 'Arc'} — switch to{' '}
              {arcDisplay === 'epic' ? 'Arc' : 'Epic'}
            </button>
          )}
          <a className="btn primary" href={assetNewHref}>
            + New artifact
          </a>
        </div>
      </div>

      <div className="filters">
        <div className="filter-cats">
          {ASSET_CATEGORIES.map((cat) => {
            const n = countFor(cat);
            if (n === 0) return null;
            return (
              <a
                key={cat}
                className={category === cat ? `chip-btn cat-${cat} active` : `chip-btn cat-${cat}`}
                href={libraryHref(cat)}
                title={ASSET_CATEGORY_GLOSS[cat]}
              >
                {chip(cat)} ({n})
              </a>
            );
          })}
        </div>
        <input
          className="search"
          placeholder={`Search ${heading(category).toLowerCase()}…`}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

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
                    <span className="card-chips">
                      <span className={`chip cat-${it.category}`}>{chip(it.category)}</span>
                      {/* ADR lifecycle status (ADR-0037), so a wrong/premature flip is catchable at a
                          glance (ADR-0084). proposed is amber, accepted green, superseded grey. */}
                      {it.status && (
                        <span
                          className={`chip adr-status status-${it.status}`}
                          title={`ADR status: ${it.status}`}
                        >
                          {it.status}
                        </span>
                      )}
                    </span>
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
