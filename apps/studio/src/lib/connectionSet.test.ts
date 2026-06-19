// Stage-1 red-green of the full-connection-set resolver (ADR-0074 §4 — "you
// needn't read another package's package.json to know how it is wired"). These pin
// the contract the studio detail panel leans on: a directed edge can be declared at
// EITHER endpoint (depends_on OR consumed_by), so BOTH directions are recovered
// SYMMETRICALLY from BOTH declaration styles —
//   • outbound = own depends_on ∪ {n : n.consumed_by ∋ focus}
//   • inbound  = own consumed_by ∪ {n : n.depends_on ∋ focus}
// Determinism, self-edge and dangling handling are the edges that keep the panel
// honest. The panel APPEARANCE is owner-attested (ADR-0070), NOT asserted here.

import { describe, it, expect } from 'vitest';
import { fullConnectionSet, type WiredNode } from './connectionSet';

function node(id: string, dependsOn: string[] = [], consumedBy: string[] = []): WiredNode {
  return { id, dependsOn, consumedBy };
}

// The motivating real-corpus shape (CLAUDE.md / ADR-0074): `cli` is the de-noised
// hub — store/library/drive-machinery declare `consumed_by: [cli]` on the SPOKE, so
// cli's OWN depends_on is empty and its wiring is recovered entirely from the
// inverse. `library` is consumed by drive-machinery, studio AND cli, but only cli
// sits in its own consumed_by; the rest come from others' depends_on.
function corpus(): WiredNode[] {
  return [
    node('cli', [], []),
    node('store', [], ['cli']),
    node('library', [], ['cli']),
    node('drive-machinery', ['library', 'store'], ['cli']),
    node('studio', ['library'], []),
  ];
}

describe('fullConnectionSet — outbound (depends on)', () => {
  it('returns the node`s own depends_on, declared order preserved', () => {
    const c = fullConnectionSet([node('a', ['z', 'm', 'b'])], 'a');
    expect(c.dependsOn).toEqual(['z', 'm', 'b']); // own decls NOT sorted — reads as the spec
  });

  it('dedupes a repeated outbound edge', () => {
    expect(fullConnectionSet([node('a', ['b', 'b', 'c'])], 'a').dependsOn).toEqual(['b', 'c']);
  });

  it('drops an outbound self-edge', () => {
    expect(fullConnectionSet([node('a', ['a', 'b'])], 'a').dependsOn).toEqual(['b']);
  });

  it('keeps a dangling outbound edge (no such node) so a mis-wire is visible', () => {
    expect(fullConnectionSet([node('a', ['ghost'])], 'a').dependsOn).toEqual(['ghost']);
  });

  it('recovers a HUB`s outbound purely from the inverse (cli declares none of its own)', () => {
    // cli.depends_on is []; store/library/drive-machinery name it in consumed_by, so
    // cli's "depends on" is the sorted derived set — the hub wiring made visible (§1).
    expect(fullConnectionSet(corpus(), 'cli').dependsOn).toEqual([
      'drive-machinery',
      'library',
      'store',
    ]);
  });

  it('appends derived outbound AFTER own declarations (own order, then sorted derived)', () => {
    const nodes = [
      node('focus', ['zeta'], []), // own outbound: zeta
      node('alpha', [], ['focus']), // alpha says focus consumes it → derived
      node('beta', [], ['focus']), // beta too
    ];
    expect(fullConnectionSet(nodes, 'focus').dependsOn).toEqual(['zeta', 'alpha', 'beta']);
  });
});

describe('fullConnectionSet — inbound (consumed by) is the UNION', () => {
  it('unions own consumed_by with the derived inverse', () => {
    // library declares consumed_by:[cli]; drive-machinery & studio depend_on it.
    expect(fullConnectionSet(corpus(), 'library').consumedBy).toEqual([
      'cli',
      'drive-machinery',
      'studio',
    ]);
  });

  it('a leaf consumed only via others` depends_on (no own consumed_by) still shows them', () => {
    // store declares consumed_by:[cli]; drive-machinery's depends_on also names it.
    expect(fullConnectionSet(corpus(), 'store').consumedBy).toEqual(['cli', 'drive-machinery']);
  });

  it('dedupes an edge present on BOTH sides (own consumed_by AND a depends_on inverse)', () => {
    const nodes = [
      node('lib', [], ['app']), // lib says app consumes it…
      node('app', ['lib'], []), // …and app's depends_on confirms it
    ];
    expect(fullConnectionSet(nodes, 'lib').consumedBy).toEqual(['app']); // counted once
  });

  it('drops an inbound self-edge', () => {
    expect(fullConnectionSet([node('a', [], ['a'])], 'a').consumedBy).toEqual([]);
  });

  it('keeps a dangling own consumed_by entry (declared consumer with no node)', () => {
    expect(fullConnectionSet([node('a', [], ['ghost'])], 'a').consumedBy).toEqual(['ghost']);
  });

  it('is empty for a leaf nothing consumes', () => {
    expect(fullConnectionSet(corpus(), 'studio').consumedBy).toEqual([]);
  });
});

describe('fullConnectionSet — determinism & order-independence', () => {
  it('sorts the derived inverse (stable render regardless of declaration order)', () => {
    const nodes = [
      node('hub', [], []),
      node('zeta', ['hub']),
      node('alpha', ['hub']),
      node('mid', ['hub']),
    ];
    expect(fullConnectionSet(nodes, 'hub').consumedBy).toEqual(['alpha', 'mid', 'zeta']);
  });

  it('resolves the same set regardless of input array order', () => {
    const a = corpus();
    const b = [...corpus()].reverse();
    expect(fullConnectionSet(b, 'library')).toEqual(fullConnectionSet(a, 'library'));
    expect(fullConnectionSet(b, 'cli')).toEqual(fullConnectionSet(a, 'cli'));
  });

  it('returns empty sets for an unknown focus id (no node, nobody wired to it)', () => {
    expect(fullConnectionSet(corpus(), 'nope')).toEqual({ dependsOn: [], consumedBy: [] });
  });
});
