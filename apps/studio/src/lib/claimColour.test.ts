// Stage-1 red-green of the studio's LOCAL claim-intent → colour-state mirror (ADR-0138 §5). The
// studio is browser-bundled and can't import @storytree/drive's subagentColourState, so this is the
// pure function that has to MATCH it (edit→authoring, real→proving, orchestrate→supplementing) and,
// critically, hold the §5 honesty wall: it ALWAYS returns one of the three coordination states,
// NEVER "green"/"bloom", and never throws on an unknown intent. Runner: VITEST (the studio suite).

import { describe, it, expect } from 'vitest';
import { claimColourState } from './claimColour';
import type { SubagentColourState } from '../types';

describe('claimColourState — the studio mirror of subagentColourState (ADR-0138 §5)', () => {
  it('maps the spine intents edit / real / orchestrate to their colour-states', () => {
    expect(claimColourState('edit')).toBe('authoring');
    expect(claimColourState('real')).toBe('proving');
    expect(claimColourState('orchestrate')).toBe('supplementing');
  });

  it('also accepts the role WORDS (authoring / proving / supplementing) idempotently', () => {
    expect(claimColourState('authoring')).toBe('authoring');
    expect(claimColourState('proving')).toBe('proving');
    expect(claimColourState('supplementing')).toBe('supplementing');
  });

  it('defaults an UNKNOWN intent to supplementing — never throws (a claim wisp must always render)', () => {
    for (const weird of ['', 'fix', 'whatever', 'BUILD', '  edit  ', 'green', 'bloom']) {
      expect(() => claimColourState(weird)).not.toThrow();
      expect(claimColourState(weird)).toBe('supplementing');
    }
  });

  it('§5 honesty wall: the result is ALWAYS a coordination state, NEVER green/bloom', () => {
    const ALLOWED: SubagentColourState[] = ['authoring', 'proving', 'supplementing'];
    for (const intent of ['edit', 'real', 'orchestrate', 'authoring', 'proving', 'supplementing', 'unknown', '']) {
      const out = claimColourState(intent);
      expect(ALLOWED).toContain(out);
      // the proof signal can never leak out of this mapping — a claim is not a verdict.
      expect(out).not.toBe('green');
      expect(out).not.toBe('bloom');
    }
  });
});
