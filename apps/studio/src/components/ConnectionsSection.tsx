// ConnectionsSection — the story/organism detail panel's wiring surface
// (ADR-0074 §4). It renders a node's FULL declared connection set, both
// directions, so a reader sees how the organism is wired without leaving it:
//   • "depends on"  — its outbound `depends_on` (what it consumes).
//   • "consumed by" — its FULL inbound set = own `consumed_by` ∪ the derived
//     inverse {every story whose `depends_on` names this node}, resolved by
//     fullConnectionSet (lib/connectionSet.ts) at the call site.
//
// Each id is a click-to-navigate pill when it resolves to a story in the world,
// or an inert <code> chip with a tooltip when it's a dangling declaration — the
// same convention the panel already uses for `depends_on`. A presentational,
// context-free component (no router, no network, no app-data context): navigation
// is an injected callback, so it's a clean jsdom unit (ConnectionsSection.test.tsx).

import type { ConnectionSet } from '../lib/connectionSet.js';

/** One wiring id: a navigable pill if it's a known story, else an inert chip. */
function ConnLink({
  id,
  known,
  onNavigate,
}: {
  id: string;
  known: boolean;
  onNavigate: (id: string) => void;
}): React.JSX.Element {
  if (known) {
    return (
      <button type="button" className="tree-link" onClick={() => onNavigate(id)}>
        {id}
      </button>
    );
  }
  return (
    <code className="tree-conn-dangling" title="declared, but no such story in the world">
      {id}{' '}
    </code>
  );
}

/** One labelled row of wiring ids; renders nothing when the row is empty. */
function ConnRow({
  label,
  hint,
  ids,
  storyIds,
  onNavigate,
}: {
  label: string;
  hint: string;
  ids: string[];
  storyIds: ReadonlySet<string>;
  onNavigate: (id: string) => void;
}): React.JSX.Element | null {
  if (ids.length === 0) return null;
  return (
    <p className="small tree-conn-row">
      <span className="muted" title={hint}>
        {label}{' '}
      </span>
      {ids.map((id) => (
        <ConnLink key={id} id={id} known={storyIds.has(id)} onNavigate={onNavigate} />
      ))}
    </p>
  );
}

/**
 * The panel's two-way wiring block. `connections` is the resolved set from
 * fullConnectionSet (outbound declared-order, inbound sorted union). Renders
 * nothing when the node has no declared connections in either direction.
 */
export function ConnectionsSection({
  connections,
  storyIds,
  onNavigate,
}: {
  connections: ConnectionSet;
  storyIds: ReadonlySet<string>;
  onNavigate: (id: string) => void;
}): React.JSX.Element | null {
  const { dependsOn, consumedBy } = connections;
  if (dependsOn.length === 0 && consumedBy.length === 0) return null;
  return (
    <div className="tree-connections">
      <ConnRow
        label="depends on"
        hint="what this organism consumes — its outbound depends_on (ADR-0074 §4)"
        ids={dependsOn}
        storyIds={storyIds}
        onNavigate={onNavigate}
      />
      <ConnRow
        label="consumed by"
        hint="who consumes this organism — its own consumed_by ∪ every story whose depends_on names it (ADR-0074 §4)"
        ids={consumedBy}
        storyIds={storyIds}
        onNavigate={onNavigate}
      />
    </div>
  );
}
