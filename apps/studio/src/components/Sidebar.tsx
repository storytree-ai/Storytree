import { libraryHref } from '../lib/route';

// The per-category rail retired with the standalone `#/library` page (ADR-0185 dec 6) —
// category browse lives in the lens finder now; the head-link opens the lens over the map.
export function Sidebar(): React.JSX.Element {
  return (
    <aside className="sidebar">
      <div className="side-section">
        <div className="side-head">
          <a className="side-head-link" href={libraryHref()}>
            Library
          </a>
        </div>
      </div>
    </aside>
  );
}
