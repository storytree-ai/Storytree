import { useAppData } from '../lib/appData';
import { kindLabel, useArcDisplay } from '../lib/kindDisplay';
import { libraryHref, type Route } from '../lib/route';
import { ASSET_CATEGORIES, type AssetCategory } from '../types';

export function Sidebar({ route }: { route: Route }): React.JSX.Element {
  const { docs, assets } = useAppData();
  const arcDisplay = useArcDisplay(); // 'arc' shows as "epic" by default (ADR-0183 D1)
  // ADRs are folded into the Library under the `adr` category (counted below).
  const adrDocs = docs.filter((d) => d.group === 'Decisions');
  const libCat = route.name === 'library' ? route.category : undefined;

  // Library counts come from the artifacts; `adr` also includes the doc-backed
  // ADRs folded in from docs/decisions/ (authored adr artifacts + canonical docs).
  const countFor = (cat: AssetCategory): number => {
    const artifacts = assets.filter((a) => a.category === cat).length;
    return cat === 'adr' ? artifacts + adrDocs.length : artifacts;
  };

  return (
    <aside className="sidebar">
      <div className="side-section">
        <div className="side-head">
          <a className="side-head-link" href={libraryHref()}>
            Library
          </a>
        </div>
        <ul className="side-list">
          {ASSET_CATEGORIES.map((cat) => {
            const n = countFor(cat);
            if (n === 0) return null;
            return (
              <li key={cat}>
                <a
                  className={libCat === cat ? 'side-item sub active' : 'side-item sub'}
                  href={libraryHref(cat)}
                >
                  <span className={`cat-dot cat-${cat}`} />
                  <span className="side-item-label">{kindLabel(cat, arcDisplay)}</span>
                  <span className="badge ghost">{n}</span>
                </a>
              </li>
            );
          })}
        </ul>
      </div>
    </aside>
  );
}
