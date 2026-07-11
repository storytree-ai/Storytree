/**
 * LibraryDiveBody — the dive body panel: an artifact's full body + Sources over the map
 * (ADR-0185 dec 3/4, increment 4 of the library-tech-tree-overlay story).
 *
 * A THIN router around two EXISTING renderers, never a new one: `AssetView` for an asset
 * selection (body + Sources from the already-loaded corpus, no fetch) and `DocView` for a doc
 * (ADR) selection (body via DocView's own on-demand `api.docContent` fetch, with its own
 * loading/error states). Takes `selection` as a PROP — mirroring how the shell/finder/subgraph
 * take their driving data as props — and holds no data of its own. Routes via the pure
 * `planDive` (`../lib/diveBody`), never a hand-rolled `category` switch.
 */

import { AssetView } from './AssetView';
import { DocView } from './DocView';
import { planDive } from '../lib/diveBody';
import type { SearchResult } from '../lib/librarySearch';

export interface LibraryDiveBodyProps {
  /** The finder's lifted, centred selection. `null` renders the empty/prompt state. */
  selection: SearchResult | null;
}

export function LibraryDiveBody({ selection }: LibraryDiveBodyProps): React.JSX.Element {
  const plan = planDive(selection);

  return (
    <div className="library-dive-body" data-testid="library-dive-body">
      {plan.kind === 'empty' && (
        <p className="muted pad">Pick an artifact to dive into its full body.</p>
      )}
      {plan.kind === 'asset' && <AssetView id={plan.id} />}
      {plan.kind === 'doc' && <DocView id={plan.id} />}
    </div>
  );
}
