// ADR-0106 d.5/d.1: the server resolves each UAT leg's DECLARED witness into the BINARY one the owner
// surface reads (the word `either` never reaches the wire), and flags any leg still `either` on an
// ADOPTED story (the "no `either` at rest" guard). `resolveUatRowWitnesses` injects the library's real
// classifier (`resolvedWitnessOf` / `unresolvedUatLegs`) so the studio is held to the SAME rule the
// adopt pass uses — the binary can never fork — and is a pure unit testable without the HTTP handler.

import { describe, it, expect } from 'vitest';
import type { ReliabilityGate, UatTest } from '@storytree/library';
import { resolvedWitnessOf, unresolvedUatLegs } from '@storytree/library';
import { resolveUatRowWitnesses } from './apiRouter';

const resolver = { resolvedWitnessOf, unresolvedUatLegs };

function leg(n: number, witness: UatTest['witness'], wouldBe = false): UatTest {
  return { id: `s#uat-${n}`, title: `leg ${n}`, witness, wouldBe };
}
function gate(kind: ReliabilityGate['kind'], n = 1): ReliabilityGate {
  return { id: `s#gate-${n}`, title: `g${n}`, kind, covers: [] };
}

describe('resolveUatRowWitnesses (ADR-0106)', () => {
  it('resolves every leg to a BINARY witness — `either` never survives onto a row', () => {
    const { tests } = resolveUatRowWitnesses(
      [leg(1, 'machine'), leg(2, 'human'), leg(3, 'either')],
      [gate('observe')],
      'proposed',
      resolver,
    );
    // declared machine → machine; human → human; the undecided `either` → human (fail-closed).
    expect(tests.map((t) => t.witness)).toEqual(['machine', 'human', 'human']);
    expect(tests.every((t) => t.witness === 'human' || t.witness === 'machine')).toBe(true);
  });

  it('flags the `either` legs on an ADOPTED (proposed+) story — the no-either-at-rest guard', () => {
    const { unresolvedWitnesses } = resolveUatRowWitnesses(
      [leg(1, 'machine'), leg(2, 'either'), leg(3, 'either')],
      [gate('observe')],
      'proposed',
      resolver,
    );
    expect(unresolvedWitnesses).toEqual(['s#uat-2', 's#uat-3']);
  });

  it('a healthy / unhealthy story is adopted too — the guard still fires', () => {
    for (const status of ['healthy', 'unhealthy', 'building']) {
      const { unresolvedWitnesses } = resolveUatRowWitnesses([leg(1, 'either')], [], status, resolver);
      expect(unresolvedWitnesses).toEqual(['s#uat-1']);
    }
  });

  it('does NOT fire for a still-`mapped` (pre-adopt) story — undecided legs are legitimate there', () => {
    const { unresolvedWitnesses } = resolveUatRowWitnesses([leg(1, 'either')], [gate('observe')], 'mapped', resolver);
    expect(unresolvedWitnesses).toEqual([]);
  });

  it('does NOT fire when the spec failed to load (status `\'\'`) — nothing to assert', () => {
    expect(resolveUatRowWitnesses([leg(1, 'either')], [], '', resolver).unresolvedWitnesses).toEqual([]);
  });
});
